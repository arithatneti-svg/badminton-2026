const dbRef = firebase.database().ref('sportsday_2026_data');

let appState = null;
let currentUmpire = '';
let activeMatchId = '';
let isGame2 = false;
let isFirstLoad = true;
let selectedTeam = '';
let selectedGroup = '';

// which side scored the last point → drives the "just scored" glow.
// In rally scoring the scorer serves next, so it also reads as the serve side.
let _lastScored = null;   // 'red' | 'blue' | null

// ── Local pause start timestamp (NOT stored in Firebase — avoids sync delay bug) ──
// ทุกครั้งที่กด Pause ให้เก็บ timestamp นี้ใน memory แทนการพึ่ง pauseStartedAt จาก Firebase
let _localPauseStart = null;

// ==========================================
// 2. FIREBASE LISTENER
// ==========================================
dbRef.on('value', (snapshot) => {
  appState = snapshot.val() || {};
  if (!appState.ongoingMatches) appState.ongoingMatches = [];
  if (!appState.matchHistory)   appState.matchHistory = [];
  if (!appState.players)        appState.players = [];

  if (isFirstLoad) {
    isFirstLoad = false;
    restoreSession();
  } else {
    updateCurrentScreen();
  }
});

function saveData() { dbRef.set(appState); }

// เขียนเฉพาะคอร์ทที่ระบุ (child path) แทนการ set ทั้งก้อน
// → ไม่ทับข้อมูลฝั่ง admin (players/history) และไม่ทับคอร์ทอื่นที่กรรมการคนอื่นคุมอยู่
function saveMatch(mId) {
  const idx = appState.ongoingMatches.findIndex(x => x.id === mId);
  if (idx < 0) { saveData(); return; } // fallback ถ้าหาคอร์ทไม่เจอ
  firebase.database().ref('sportsday_2026_data/ongoingMatches/' + idx).set(appState.ongoingMatches[idx]);
}

// ==========================================
// FULLSCREEN
// ==========================================
let _fsIndicatorTimer = null;

function toggleFullScreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) req.call(el).catch(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

function onFsChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Update all FS buttons
  document.querySelectorAll('.topbar-btn#btnFs, #liFsBtn').forEach(btn => {
    btn.classList.toggle('fs-active', isFs);
    btn.textContent = isFs ? '⤢' : '⛶';
  });
  document.getElementById('fsBtn').textContent = isFs ? '⤢' : '⛶';

  // Show indicator briefly
  if (isFs) {
    const ind = document.getElementById('fsIndicator');
    ind.classList.add('show');
    clearTimeout(_fsIndicatorTimer);
    _fsIndicatorTimer = setTimeout(() => ind.classList.remove('show'), 2800);
  }
}

// ==========================================
// WAKE LOCK
// ==========================================
let _wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      _wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('wakeLockBadge').style.display = 'block';
      _wakeLock.addEventListener('release', () => {
        document.getElementById('wakeLockBadge').style.display = 'none';
        _wakeLock = null;
      });
    } catch(e) { /* not supported or denied */ }
  }
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
  document.getElementById('wakeLockBadge').style.display = 'none';
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !_wakeLock) {
    const scoring = document.getElementById('screen-scoring');
    if (scoring.classList.contains('active')) await requestWakeLock();
  }
});

// ==========================================
// 3. SESSION & NAVIGATION
// ==========================================
function restoreSession() {
  currentUmpire = localStorage.getItem('bdm_umpire_name') || '';
  activeMatchId  = localStorage.getItem('bdm_umpire_match') || '';
  const savedTab = localStorage.getItem('bdm_umpire_tab') || 'live';

  if (currentUmpire) {
    if (activeMatchId && appState.ongoingMatches.find(m => m.id === activeMatchId)) {
      const m = appState.ongoingMatches.find(m => m.id === activeMatchId);
      isGame2 = m.live && m.live.g1Locked;
      document.getElementById('umpireNav').style.display = 'none';
      switchScreen('screen-scoring');
      document.getElementById('activeMatchInfo').textContent = `${m.id} | ${currentUmpire}`;
      document.getElementById('redNames').innerHTML  = scoringNamesHtml(m, 'red');
      document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue');
      renderGameUI();
      requestWakeLock();
      // Restore pause overlay if match is currently paused
      if (m.live && m.live.isPaused) {
        // ตั้ง _localPauseStart จาก Firebase value หรือ now (กรณี page reload ขณะ paused)
        _localPauseStart = m.live.pauseStartedAt || Date.now();
        document.getElementById('pauseOverlay').classList.add('show');
      }
    } else {
      activeMatchId = '';
      localStorage.removeItem('bdm_umpire_match');
      goToTab(savedTab);
    }
  } else {
    document.getElementById('umpireNav').style.display = 'none';
    switchScreen('screen-login');
    renderUmpireList();
  }
}

function formatNames(names) {
  return names.replace(' & ', ' <span style="color:var(--muted);font-size:0.88em;font-weight:600;">&</span> ');
}

// ── Player faces (read-only) ──────────────────────────────────
// The umpire bundle does not load player-photo.js, but its appState is the
// whole sportsday_2026_data blob, so the photos ride along in
// playerProfiles. A jersey with no photo falls back to its id.
function umpirePhoto(id) {
  return (appState && appState.playerProfiles && appState.playerProfiles[id] && appState.playerProfiles[id].photo) || null;
}
function umpirePlayer(id) {
  return (appState && appState.players || []).find(p => p.id === id) || null;
}
function umpireAvatar(id, size) {
  size = size || 30;
  const p = umpirePlayer(id);
  const photo = umpirePhoto(id);
  const team = p && p.team === 'Blue' ? 'ua-blue' : 'ua-red';
  const style = 'width:' + size + 'px;height:' + size + 'px;';
  if (photo) return '<span class="uavatar ' + team + '" style="' + style + '"><img src="' + photo + '" alt="" loading="lazy"></span>';
  return '<span class="uavatar ' + team + ' ua-initials" style="' + style + 'font-size:' + Math.round(size*0.36) + 'px;">' + (p ? p.id : '?') + '</span>';
}
// two faces for a doubles pair, overlapped slightly
function scoringNamesHtml(m, side) {
  // names only — faces are on the match card; the scoring screen is height-
  // constrained and the extra row pushed the panels into the action buttons
  return formatNames(side === 'red' ? m.redNames : m.blueNames);
}
function umpirePairFaces(id1, id2, size) {
  return '<span class="uface-pair">' + umpireAvatar(id1, size) + umpireAvatar(id2, size) + '</span>';
}

// ── VS intro — a brief pair-vs-pair reveal when a fresh match is opened ──
let _vsIntroTimer = null;
function showVsIntro(m) {
  const ov = document.getElementById('vsIntro');
  if (!ov || !m) return;
  document.getElementById('vsiCourt').textContent = `🟢 ${m.id}` + (m.round ? ` · ROUND ${m.round}` : '');
  document.getElementById('vsiRedFaces').innerHTML  = umpirePairFaces(m.r1, m.r2, 96);
  document.getElementById('vsiBlueFaces').innerHTML = umpirePairFaces(m.b1, m.b2, 96);
  document.getElementById('vsiRedNames').innerHTML  = formatNames(m.redNames || '');
  document.getElementById('vsiBlueNames').innerHTML = formatNames(m.blueNames || '');
  ov.classList.add('show');
  clearTimeout(_vsIntroTimer);
  _vsIntroTimer = setTimeout(dismissVsIntro, 3000);
}
function dismissVsIntro() {
  const ov = document.getElementById('vsIntro');
  if (!ov) return;
  clearTimeout(_vsIntroTimer);
  ov.classList.remove('show');
}

// ── LOGIN FILTER TOGGLES ──
function setTeamFilter(team) {
  selectedTeam = team;
  selectedGroup = '';

  document.querySelectorAll('#team-toggles .toggle-btn').forEach(btn => {
    btn.classList.remove('selected-red', 'selected-blue', 'selected-gold');
  });
  if (team === 'Red') document.getElementById('tbtn-Red').classList.add('selected-red');
  else if (team === 'Blue') document.getElementById('tbtn-Blue').classList.add('selected-blue');

  const groupSec = document.getElementById('group-section');
  if (team) {
    groupSec.style.display = 'block';
    document.getElementById('nameStepNum').textContent = '3';
    document.querySelectorAll('#group-toggles .toggle-btn').forEach(b => b.classList.remove('selected-gold'));
    document.querySelector('#group-toggles .toggle-btn:first-child').classList.add('selected-gold');
  } else {
    groupSec.style.display = 'none';
    document.getElementById('nameStepNum').textContent = '2';
  }
  renderUmpireList();
}

function setGroupFilter(group) {
  selectedGroup = group;
  document.querySelectorAll('#group-toggles .toggle-btn').forEach(b => b.classList.remove('selected-gold'));
  event.currentTarget.classList.add('selected-gold');
  renderUmpireList();
}

function processLogin() {
  currentUmpire = document.getElementById('umpireSelect').value;
  if (!currentUmpire) { vibrateDevice([80, 40, 80]); showAlert('⚠️', 'เลือกชื่อก่อน', 'กรุณาเลือกชื่อของคุณจากรายการก่อนนะครับ'); return; }
  localStorage.setItem('bdm_umpire_name', currentUmpire);
  goToTab('live');
}

async function logoutUmpire() {
  const ok = await showConfirm('🚪', 'เปลี่ยนกรรมการ?', 'ต้องการออกจากระบบและเปลี่ยนตัวกรรมการใช่หรือไม่?', {
    confirmLabel: 'ออก', confirmClass: 'modal-btn-danger', cancelLabel: 'อยู่ต่อ'
  });
  if (ok) {
    releaseWakeLock();
    currentUmpire = '';
    activeMatchId = '';
    localStorage.clear();
    document.getElementById('umpireNav').style.display = 'none';
    switchScreen('screen-login');
    renderUmpireList();
  }
}

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  // Body class for CSS hooks
  document.body.className = '';
  if (id === 'screen-login')   document.body.classList.add('is-login');
  if (id === 'screen-scoring') document.body.classList.add('is-scoring');
}

function goToTab(tabName) {
  localStorage.setItem('bdm_umpire_tab', tabName);
  document.getElementById('umpireNav').style.display = 'flex';
  document.getElementById('tab-live').classList.toggle('active', tabName === 'live');
  document.getElementById('tab-finished').classList.toggle('active', tabName === 'finished');
  if (tabName === 'live')     { switchScreen('screen-live');     renderMatchList(); }
  else                        { switchScreen('screen-finished'); renderFinishedList(); }
}

let _isConfirming = false; // ป้องกัน double-alert race condition ตอน confirmMatch

function updateCurrentScreen() {
  const s = id => document.getElementById(id).classList.contains('active');
  if (s('screen-login'))    renderUmpireList();
  if (s('screen-live'))     renderMatchList();
  if (s('screen-finished')) renderFinishedList();
  if (s('screen-scoring')) {
    if (activeMatchId && !appState.ongoingMatches.find(m => m.id === activeMatchId)) {
      if (!_isConfirming) { // ถ้า confirmMatch กำลัง handle อยู่ → skip modal ซ้ำ
        showAlert('⚠️', 'แมตช์ถูกปิดแล้ว', 'แมตช์นี้ถูกปิดหรือดึงผลไปแล้วครับ').then(() => exitMatch());
      }
    } else {
      renderGameUI();
    }
  }
}

// ── Pull-to-refresh (swipe down on live screen) ──
let _ptStart = 0;
document.getElementById('screen-live').addEventListener('touchstart', e => {
  _ptStart = e.touches[0].clientY;
}, { passive: true });
document.getElementById('screen-live').addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - _ptStart;
  if (dy > 80 && window.scrollY === 0) {
    vibrateDevice([30]);
    renderMatchList();
  }
}, { passive: true });

// ── TIMER ──
function formatTimer(ms) {
  ms = Math.min(ms, 3600000);
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

setInterval(() => {
  const scoringActive = document.getElementById('screen-scoring').classList.contains('active');
  if (!scoringActive || !activeMatchId) return;
  const m = appState && appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!m) return;

  const el      = document.getElementById('umpireTimerDisplay');
  const liTimer = document.getElementById('liTimer');
  let timeStr;

  if (m.live && m.live.isPaused) {
    // ─ Match timer: นับต่อเนื่องแม้ขณะ Pause (ไม่หยุด)
    if (m.timerStartedAt) {
      timeStr = formatTimer(Date.now() - m.timerStartedAt);
      el.className = 'timer-display paused';  // ยังใช้ style สี gold + pulse เพื่อบอกว่า paused
      if (liTimer) { liTimer.textContent = timeStr; liTimer.className = 'li-timer paused'; }
    }

    // ─ Pause current session timer (นับเวลาพักครั้งนี้แยกต่างหาก)
    if (!_localPauseStart) {
      _localPauseStart = m.live.pauseStartedAt || Date.now();
    }
    const currentPause = Date.now() - _localPauseStart;
    const totalPause   = (m.live.totalPauseMs || 0) + currentPause;

    const bigEl   = document.getElementById('pauseTimerBig');
    const totalEl = document.getElementById('pauseTimerTotal');
    if (bigEl)   bigEl.textContent   = formatTimer(currentPause);
    if (totalEl) totalEl.textContent = formatTimer(totalPause);
  } else if (m.timerStartedAt) {
    timeStr = formatTimer(Date.now() - m.timerStartedAt);
    el.className = 'timer-display';
    if (liTimer) { liTimer.textContent = timeStr; liTimer.className = 'li-timer'; }
  }
  if (timeStr) el.textContent = timeStr;
}, 1000);

// ==========================================
// VIBRATION
// ==========================================
function vibrateDevice(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ==========================================
// CUSTOM MODAL — fullscreen-safe แทน alert/confirm
// ==========================================
let _modalResolve = null;

/**
 * showAlert(icon, title, body) → Promise<void>
 * showConfirm(icon, title, body, {confirmLabel, confirmClass, cancelLabel, scoreHtml}) → Promise<bool>
 */
function showAlert(icon, title, body) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    document.getElementById('modalScorePreview').style.display = 'none';
    const btns = document.getElementById('modalBtns');
    btns.className = 'modal-btns';
    btns.innerHTML = `<button class="modal-btn modal-btn-ok" onclick="_modalDone(true)">ตกลง</button>`;
    document.getElementById('customModal').classList.add('open');
  });
}

function showConfirm(icon, title, body, opts = {}) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;

    const preview = document.getElementById('modalScorePreview');
    if (opts.scoreHtml) {
      preview.innerHTML = opts.scoreHtml;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    const confirmLabel = opts.confirmLabel || 'ยืนยัน';
    const confirmClass = opts.confirmClass || 'modal-btn-confirm';
    const cancelLabel  = opts.cancelLabel  || 'ยกเลิก';

    const btns = document.getElementById('modalBtns');
    btns.className = 'modal-btns two-col';
    btns.innerHTML = `
      <button class="modal-btn modal-btn-cancel" onclick="_modalDone(false)">${cancelLabel}</button>
      <button class="modal-btn ${confirmClass}" onclick="_modalDone(true)">${confirmLabel}</button>
    `;
    document.getElementById('customModal').classList.add('open');
  });
}

function _modalDone(result) {
  document.getElementById('customModal').classList.remove('open');
  if (_modalResolve) { _modalResolve(result); _modalResolve = null; }
}

// ==========================================
// 4. UMPIRE LIST
// ==========================================
function renderUmpireList() {
  if (!appState || !appState.players) return;
  const select = document.getElementById('umpireSelect');
  const currentVal = select.value;

  select.innerHTML = '<option value="">— แตะเพื่อเลือกชื่อ —</option>';

  const playersArray = Array.isArray(appState.players)
    ? appState.players
    : Object.values(appState.players);

  const filtered = playersArray.filter(p =>
    (!selectedTeam  || p.team === selectedTeam) &&
    (!selectedGroup || String(p.group) === String(selectedGroup))
  );

  filtered.forEach(p => {
    const prefix = p.team === 'Red' ? '🔴' : '🔵';
    select.innerHTML += `<option value="${p.name}">${prefix} ${p.name} (G${p.group})</option>`;
  });

  if (currentVal && filtered.some(p => p.name === currentVal)) select.value = currentVal;
}

// ==========================================
// 5. MATCH LIST
// ==========================================
function renderMatchList() {
  const list = document.getElementById('matchList');
  list.innerHTML = '';

  if (!appState || appState.ongoingMatches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">☕</span>
        <div class="empty-title">NO MATCHES</div>
        <div class="empty-sub">พักเบรก! ตอนนี้ไม่มีแมตช์รอแข่งครับ</div>
      </div>`;
    return;
  }

  appState.ongoingMatches.forEach(m => {
    const isMine    = m.umpire === currentUmpire;
    const isTaken   = m.umpire && m.umpire !== currentUmpire;
    const available = !m.umpire || isMine;

    if (available) {
      list.innerHTML += `
        <div class="match-card ${isMine ? 'claimed' : ''}" onclick="handleMatchCardTap(event, '${m.id}')">
          <div class="match-card-header">
            <div class="match-id">${m.id} <span style="color:var(--muted);font-size:0.55em;letter-spacing:1px;">ROUND ${m.round}</span></div>
            ${isMine
              ? '<span class="badge badge-mine">▶ คุมต่อ</span>'
              : '<span class="badge" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(240,192,64,0.3);">✦ ว่างอยู่</span>'}
          </div>
          <div class="team-row">${umpirePairFaces(m.r1, m.r2, 30)}<span style="color:var(--red);">${m.redNames}</span></div>
          <div class="team-row">${umpirePairFaces(m.b1, m.b2, 30)}<span style="color:var(--blue);">${m.blueNames}</span></div>
        </div>`;
    } else {
      list.innerHTML += `
        <div class="match-card locked-other">
          <div class="match-card-header">
            <div class="match-id" style="color:var(--muted);">${m.id} <span style="font-size:0.55em;">R${m.round}</span></div>
            <span class="badge badge-taken">🔒 ${m.umpire}</span>
          </div>
        </div>`;
    }
  });
}

function handleMatchCardTap(event, mId) {
  // Ripple
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const rEl = document.createElement('span');
  rEl.className = 'ripple';
  rEl.style.left = (event.clientX - rect.left - 5) + 'px';
  rEl.style.top  = (event.clientY - rect.top  - 5) + 'px';
  card.appendChild(rEl);
  setTimeout(() => rEl.remove(), 600);
  vibrateDevice([25]);
  selectMatch(mId);
}

// ==========================================
// 6. FINISHED LIST
// ==========================================
function renderFinishedList() {
  const list = document.getElementById('finishedList');
  list.innerHTML = '';

  if (!appState || appState.matchHistory.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏁</span>
        <div class="empty-title">ยังไม่มีผล</div>
        <div class="empty-sub">ผลการแข่งขันจะแสดงที่นี่เมื่อแมตช์จบแล้ว</div>
      </div>`;
    return;
  }

  const reversedHistory = [...appState.matchHistory].reverse();
  reversedHistory.forEach(m => {
    const rWon = m.rStat === 'W', bWon = m.bStat === 'W';
    const resultColor = rWon ? 'var(--red)' : bWon ? 'var(--blue)' : 'var(--gold)';
    const [g1r, g1b] = (m.game1 || '0:0').split(':');
    const [g2r, g2b] = (m.game2 || '0:0').split(':');
    const [rP1, rP2] = m.redNames.split(' & ');
    const [bP1, bP2] = m.blueNames.split(' & ');
    const rScoreColor = rWon ? 'var(--red)'  : bWon ? 'rgba(255,77,77,0.4)'  : 'var(--red)';
    const bScoreColor = bWon ? 'var(--blue)' : rWon ? 'rgba(77,159,255,0.4)' : 'var(--blue)';
    const resultLabel = m.result.replace(/[🔴🔵🤝]/g, '').trim();

    list.innerHTML += `
      <div class="finished-card" style="border-color:${resultColor}22;">
        <div class="finished-header">
          <div style="font-family:'Bebas Neue';font-size:1.5em;color:var(--gold);letter-spacing:2px;">${m.id} · R${m.round}</div>
          <div class="result-badge" style="background:${resultColor}18;color:${resultColor};border:1px solid ${resultColor}44;">${resultLabel}</div>
        </div>
        <div class="score-grid" style="margin-bottom:6px;">
          <div class="score-grid-header">ทีม</div>
          <div class="score-grid-header">G1</div>
          <div class="score-grid-header">G2</div>
        </div>
        <div class="score-grid" style="margin-bottom:8px;">
          <div class="score-team-cell" style="background:rgba(255,77,77,0.08);border:1px solid rgba(255,77,77,0.18);">
            <div class="team-dot red"></div>
            <div>
              <div style="color:var(--red);font-size:0.95rem;">${rP1||''}${rWon?' 🏆':''}</div>
              ${rP2 ? `<div style="color:rgba(255,77,77,0.6);font-size:0.8rem;">${rP2}</div>` : ''}
            </div>
          </div>
          <div class="score-num-cell" style="background:rgba(255,77,77,0.08);color:${rScoreColor};">${g1r}</div>
          <div class="score-num-cell" style="background:rgba(255,77,77,0.08);color:${rScoreColor};">${g2r}</div>
        </div>
        <div class="score-grid">
          <div class="score-team-cell" style="background:rgba(77,159,255,0.08);border:1px solid rgba(77,159,255,0.18);">
            <div class="team-dot blue"></div>
            <div>
              <div style="color:var(--blue);font-size:0.95rem;">${bP1||''}${bWon?' 🏆':''}</div>
              ${bP2 ? `<div style="color:rgba(77,159,255,0.6);font-size:0.8rem;">${bP2}</div>` : ''}
            </div>
          </div>
          <div class="score-num-cell" style="background:rgba(77,159,255,0.08);color:${bScoreColor};">${g1b}</div>
          <div class="score-num-cell" style="background:rgba(77,159,255,0.08);color:${bScoreColor};">${g2b}</div>
        </div>
        ${m.umpire ? `<div class="finished-umpire">👔 Umpire: ${m.umpire}</div>` : ''}
      </div>`;
  });
}

// ==========================================
// 7. SCORING SYSTEM
// ==========================================
function selectMatch(mId) {
  activeMatchId = mId;
  localStorage.setItem('bdm_umpire_match', mId);

  const m = appState.ongoingMatches.find(x => x.id === mId);
  m.umpire = currentUmpire;
  if (!m.live) m.live = { g1R:0, g1B:0, g2R:0, g2B:0, g1Locked:false, isPaused:false, elapsedMs:0 };
  if (!m.timerStartedAt) m.timerStartedAt = Date.now();
  saveMatch(mId); // เขียนเฉพาะคอร์ทนี้

  document.getElementById('umpireNav').style.display = 'none';
  document.getElementById('activeMatchInfo').textContent = `${m.id} | ${currentUmpire}`;
  document.getElementById('redNames').innerHTML  = scoringNamesHtml(m, 'red');
  document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue');

  isGame2 = m.live.g1Locked;
  _lastScored = null;
  // a brand-new match (no scores yet) gets a 3s VS intro; resuming one does not
  const fresh = !(m.live.g1Locked || m.live.g1R || m.live.g1B || m.live.g2R || m.live.g2B);
  renderGameUI();
  switchScreen('screen-scoring');
  requestWakeLock();
  if (fresh) showVsIntro(m);
  // Auto-request fullscreen when entering scoring
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    setTimeout(() => toggleFullScreen(), 400);
  }
}

let _scoreLocked = false;

function addRipple(el, e) {
  const rect = el.getBoundingClientRect();
  const rEl = document.createElement('span');
  rEl.className = 'ripple';
  const x = e ? (e.clientX - rect.left - 6) : (rect.width / 2 - 6);
  const y = e ? (e.clientY - rect.top  - 6) : (rect.height / 2 - 6);
  rEl.style.left = x + 'px';
  rEl.style.top  = y + 'px';
  el.appendChild(rEl);
  setTimeout(() => rEl.remove(), 600);
}

function updateScore(team, delta, event) {
  if (_scoreLocked) return;

  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || (match.live && match.live.isPaused)) return;

  const gameKey = !isGame2
    ? (team === 'red' ? 'g1R' : 'g1B')
    : (team === 'red' ? 'g2R' : 'g2B');

  const matchIdx = appState.ongoingMatches.findIndex(m => m.id === activeMatchId);
  if (matchIdx === -1) return;

  // Ripple on button
  const btnId = delta > 0
    ? (team === 'red' ? 'btnRedPlus'  : 'btnBluePlus')
    : (team === 'red' ? 'btnRedMinus' : 'btnBlueMinus');
  const btnEl = document.getElementById(btnId);
  if (btnEl) addRipple(btnEl, event);

  // remember who just scored → "just scored" glow + next server.
  // a −1 correction leaves the last-scored read unchanged.
  if (delta === 1) _lastScored = team;

  // Vibrate
  if (delta === 1) vibrateDevice([22]);
  else vibrateDevice([12, 8, 12]);

  _scoreLocked = true;

  const scoreRef = firebase.database().ref(`sportsday_2026_data/ongoingMatches/${matchIdx}/live/${gameKey}`);
  scoreRef.transaction((currentVal) => {
    const cur  = currentVal === null ? 0 : Number(currentVal);
    const next = cur + delta;
    return next < 0 ? 0 : next;
  }, (error, committed, snapshot) => {
    _scoreLocked = false;
    if (error || !committed) return;
    if (appState.ongoingMatches[matchIdx]) {
      appState.ongoingMatches[matchIdx].live[gameKey] = snapshot.val();
      checkEpicPossible(appState.ongoingMatches[matchIdx]);
      firebase.database().ref(`sportsday_2026_data/ongoingMatches/${matchIdx}/potFlags`)
        .set(appState.ongoingMatches[matchIdx].potFlags || {});
    }
  });

  // Optimistic UI
  const curLocal = Number(match.live[gameKey] || 0);
  match.live[gameKey] = Math.max(0, curLocal + delta);
  renderGameUI();

  // Score pop animation
  const elId = team === 'red' ? 'scoreRed' : 'scoreBlue';
  const el = document.getElementById(elId);
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// Undo removed — a −1 tap on the panel corrects a mis-score, and an admin
// can fix a submitted result on the scoreboard.

function checkEpicPossible(match) {
  if (!match.live) return;
  if (!match.potFlags) match.potFlags = {};
  const g1r = Number(match.live.g1R||0), g1b = Number(match.live.g1B||0);
  const g2r = Number(match.live.g2R||0), g2b = Number(match.live.g2B||0);
  if (!match.potFlags.g1B_pot && g1r>=17 && (g1r-g1b)>=4) match.potFlags.g1B_pot=true;
  if (!match.potFlags.g1R_pot && g1b>=17 && (g1b-g1r)>=4) match.potFlags.g1R_pot=true;
  if (!match.potFlags.g2B_pot && g2r>=17 && (g2r-g2b)>=4) match.potFlags.g2B_pot=true;
  if (!match.potFlags.g2R_pot && g2b>=17 && (g2b-g2r)>=4) match.potFlags.g2R_pot=true;
}

function renderGameUI() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match) return;

  document.getElementById('scoreRed').textContent  = isGame2 ? (match.live.g2R||0) : (match.live.g1R||0);
  document.getElementById('scoreBlue').textContent = isGame2 ? (match.live.g2B||0) : (match.live.g1B||0);

  const paused = match.live && match.live.isPaused;
  const btnPause = document.getElementById('btnPause');
  if (paused) {
    btnPause.innerHTML = '▶';
    btnPause.classList.add('paused');
  } else {
    btnPause.innerHTML = '⏸';
    btnPause.classList.remove('paused');
  }
  // Update landscape pause button
  const liPause = document.getElementById('liPauseBtn');
  if (liPause) liPause.textContent = paused ? '▶ เล่น' : '⏸ พัก';

  const g1r = Number(match.live.g1R||0), g1b = Number(match.live.g1B||0);
  const g2r = Number(match.live.g2R||0), g2b = Number(match.live.g2B||0);
  const curR = isGame2 ? g2r : g1r, curB = isGame2 ? g2b : g1b;

  // single SUBMIT button — label + ready state follow the current game.
  // muted until the game reads as a valid finish (still tappable: warn-then-allow)
  const submitBtn = document.getElementById('btnSubmitGame');
  if (submitBtn) {
    submitBtn.textContent = isGame2 ? 'SUBMIT GAME 2' : 'SUBMIT GAME 1';
    submitBtn.classList.toggle('is-ready', isValidBadmintonScore(curR, curB));
  }

  // landscape game label
  const liInd = document.getElementById('liGameInd');
  if (liInd) liInd.textContent = isGame2 ? 'GAME 2' : 'GAME 1';

  // Game 1 recap line, shown only during game 2
  const g1Line = document.getElementById('g1Line');
  if (g1Line) {
    if (isGame2) { g1Line.style.display = 'block'; g1Line.textContent = `G1 · ${g1r}–${g1b}`; }
    else g1Line.style.display = 'none';
  }

  // game chip carries the deuce / game-point read inline (no floating badge)
  const chip = document.getElementById('gameIndicator');
  if (chip) {
    const sit = gameSituation(curR, curB);
    chip.classList.remove('gp-red', 'gp-blue', 'deuce');
    if (!sit) {
      chip.textContent = isGame2 ? 'GAME 2' : 'GAME 1';
    } else if (sit.type === 'deuce') {
      chip.textContent = 'DEUCE'; chip.classList.add('deuce');
    } else {
      chip.textContent = (sit.side === 'red' ? '🔴' : '🔵') + ' GAME POINT';
      chip.classList.add(sit.side === 'red' ? 'gp-red' : 'gp-blue');
    }
  }

  // steady glow on the side that just scored (also = who serves next)
  const rp = document.getElementById('redPanel'), bp = document.getElementById('bluePanel');
  if (rp) rp.classList.toggle('scored', _lastScored === 'red');
  if (bp) bp.classList.toggle('scored', _lastScored === 'blue');
}

// ==========================================
// 8. GAME CONTROLS
// ==========================================
function isValidBadmintonScore(a, b) {
  if (a < 0 || b < 0) return false;
  const winner = Math.max(a,b), loser = Math.min(a,b);
  if (winner < 21) return false;
  if (winner === 30 && loser === 29) return true;
  if (winner > 30 || loser > 29) return false;
  if (winner - loser < 2) return false;
  return true;
}

function scoreValidationMsg(a, b, label) {
  if (a < 0 || b < 0) return `${label}: คะแนนติดลบไม่ได้`;
  const winner = Math.max(a,b), loser = Math.min(a,b);
  if (winner < 21) return `${label}: ต้องได้อย่างน้อย 21 แต้มก่อนจบเกม (ตอนนี้ ${winner})`;
  if (winner - loser < 2) return `${label}: ต้องนำห่างอย่างน้อย 2 แต้ม (${a}:${b})`;
  if (winner > 30 || (winner === 30 && loser !== 29)) return `${label}: คะแนนสูงสุดคือ 30:29`;
  return null;
}

// Single SUBMIT button dispatches by game: Game 1 locks + advances,
// Game 2 submits the match. Both confirm in a modal first.
function submitGame() {
  if (isGame2) confirmMatch();
  else lockGame1();
}

async function lockGame1() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live || match.live.isPaused) return;

  const g1r = Number(match.live.g1R || 0);
  const g1b = Number(match.live.g1B || 0);
  // คะแนนไม่เข้ากติกา 21 แต้ม (ยอมแพ้/เจ็บ/เล่นสั้น) → เตือนแต่ให้ล็อกได้ ไม่ block
  const warn = scoreValidationMsg(g1r, g1b, 'Game 1');
  if (warn) vibrateDevice([60, 30, 60]);

  const scoreHtml = `
    <div class="modal-score-preview">
      <div class="modal-score-game">
        <div class="modal-score-label">GAME 1</div>
        <div class="modal-score-val">
          <span style="color:var(--red)">${g1r}</span>
          <span style="color:var(--muted2);font-size:0.7em;margin:0 4px">–</span>
          <span style="color:var(--blue)">${g1b}</span>
        </div>
      </div>
    </div>`;

  const ok = await showConfirm('🏁', 'SUBMIT GAME 1?', warn ? `⚠️ ${warn}\nจะบันทึกตามคะแนนนี้` : 'จะบันทึก Game 1 แล้วเริ่มนับ Game 2 ทันที', {
    scoreHtml,
    confirmLabel: 'SUBMIT GAME 1',
    confirmClass: 'modal-btn-confirm',
    cancelLabel: 'ยกเลิก'
  });

  if (ok) {
    match.live.g1Locked = true;
    isGame2 = true;
    _lastScored = null;   // new game — no last point / server yet
    vibrateDevice([40, 30, 60]);
    renderGameUI();
    saveMatch(activeMatchId); // lock G1 → เขียนเฉพาะคอร์ทนี้
  }
}

function togglePause() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live) return;

  if (match.live.isPaused) {
    // ── Resume ──
    const now = Date.now();
    const pauseStart = _localPauseStart || match.live.pauseStartedAt || now;
    const pausedFor  = now - pauseStart;
    match.live.totalPauseMs   = (match.live.totalPauseMs || 0) + pausedFor;
    match.live.pauseStartedAt = null;
    match.live.isPaused       = false;
    // ไม่ต้อง reset timerStartedAt — match timer วิ่งต่อเนื่องตลอดตั้งแต่ต้น
    _localPauseStart           = null;
    vibrateDevice([30]);

    // Reset pause display ให้พร้อมสำหรับ session ถัดไป
    const bigEl   = document.getElementById('pauseTimerBig');
    const totalEl = document.getElementById('pauseTimerTotal');
    if (bigEl)   bigEl.textContent   = '0:00';
    if (totalEl) totalEl.textContent = formatTimer(match.live.totalPauseMs);

    document.getElementById('pauseOverlay').classList.remove('show');
  } else {
    // ── Pause ──
    const now = Date.now();
    match.live.isPaused       = true;
    match.live.pauseStartedAt = now;
    _localPauseStart           = now;
    vibrateDevice([50, 30, 50]);

    // แสดง total ที่สะสมก่อนหน้า ณ ตอนเริ่ม pause
    const totalEl = document.getElementById('pauseTimerTotal');
    if (totalEl) totalEl.textContent = formatTimer(match.live.totalPauseMs || 0);

    document.getElementById('pauseOverlay').classList.add('show');
  }

  saveMatch(activeMatchId); // pause/resume → เขียนเฉพาะคอร์ทนี้
  renderGameUI();
}

function exitMatch() {
  releaseWakeLock();
  activeMatchId = '';
  localStorage.removeItem('bdm_umpire_match');
  // Exit fullscreen on leave
  const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
  if (exitFs && (document.fullscreenElement || document.webkitFullscreenElement)) {
    exitFs.call(document).catch(() => {});
  }
  goToTab('live');
}

// ถามยืนยันก่อนออก (กันแตะพลาดตอนคุมคะแนน) — คะแนนถูกบันทึกไว้แล้ว
async function confirmExit() {
  const ok = await showConfirm('🚪', 'ออกจากการคุมคะแนน?', 'คะแนนถูกบันทึกไว้แล้ว กลับเข้ามาคุมต่อได้เสมอ', {
    confirmLabel: 'ออก', confirmClass: 'modal-btn-danger', cancelLabel: 'อยู่ต่อ'
  });
  if (ok) exitMatch();
}

// (editGame1 removed — umpire confirms in the modal before submit; a wrong
//  result is corrected by an admin on the scoreboard.)

// สถานการณ์เกมปัจจุบัน: deuce / game point (แบด 21, cap 30)
function gameSituation(a, b) {
  a = Number(a || 0); b = Number(b || 0);
  // Game point wins the priority: a one-point lead at 20+ means the leader
  // scores next to win, so it is game point, not deuce. The old order put
  // the deuce test (|a-b| < 2) first, so 21-20 / 29-28 wrongly read DEUCE.
  const isGP = (s, o) => { const n = s + 1; return (n >= 21 && n - o >= 2) || n === 30; };
  const redGP = isGP(a, b), blueGP = isGP(b, a);
  if (redGP && blueGP) return { type: 'deuce' };            // 29-29: either point wins
  if (redGP)  return { type: 'gp', side: 'red' };
  if (blueGP) return { type: 'gp', side: 'blue' };
  if (a >= 20 && b >= 20 && a === b) return { type: 'deuce' }; // 20-20..28-28 level
  return null;
}

function analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, potFlags) {
  const M1=g1r-g1b, M2=g2r-g2b, absM1=Math.abs(M1), absM2=Math.abs(M2), totalMargin=absM1+absM2, netMargin=Math.abs((g1r+g2r)-(g1b+g2b)), volatility=Math.abs(absM1-absM2), isDraw=rStat==='D';
  let status='', statusColor='';
  if(!isDraw){if(totalMargin<=5){status='Evenly Matched';statusColor='#2ecc71';}else if(totalMargin<=12){status='Competitive Edge';statusColor='#f5c842';}else if(totalMargin<=20){status='Superior';statusColor='#ff9500';}else{status='Outclassed';statusColor='#e74c3c';}}else{if(netMargin<=3){status='True Tie';statusColor='#2ecc71';}else if(netMargin<=8){status='Close Encounter';statusColor='#f5c842';}else{status='Deceptive Draw';statusColor='#ff9500';}}
  const tags=[];
  if(potFlags){if(potFlags.g1R_pot&&g1r>=21&&g1r>=g1b)tags.push({id:'epic_red_g1',label:'🔥 Epic Comeback G1 Red',class:'tag-comeback',scope:'red'});if(potFlags.g1B_pot&&g1b>=21&&g1b>=g1r)tags.push({id:'epic_blue_g1',label:'🔥 Epic Comeback G1 Blue',class:'tag-comeback',scope:'blue'});if(potFlags.g2R_pot&&g2r>=21&&g2r>=g2b)tags.push({id:'epic_red_g2',label:'🔥 Epic Comeback G2 Red',class:'tag-comeback',scope:'red'});if(potFlags.g2B_pot&&g2b>=21&&g2b>=g2r)tags.push({id:'epic_blue_g2',label:'🔥 Epic Comeback G2 Blue',class:'tag-comeback',scope:'blue'});}
  if(!isDraw&&totalMargin<=5)tags.push({id:'clutch',label:'⚔️ The Gladiators',class:'tag-clutch',scope:'all'});
  if(isDraw&&netMargin<=5)tags.push({id:'clutch',label:'⚔️ The Gladiators',class:'tag-clutch',scope:'all'});
  if((g1r + g1b >= 42)||(g2r + g2b >= 42))tags.push({id:'marathon',label:'🏃‍♂️ Marathon Match',class:'tag-custom',scope:'all'});
  if((M1>=5&&M2<=-5)||(M1<=-5&&M2>=5))tags.push({id:'rollercoaster',label:'🎢 The Rollercoaster',class:'tag-custom',scope:'all'});
  if(!isDraw&&totalMargin>=16)tags.push({id:'blowout',label:'🌪️ ยำใหญ่ (Blowout)',class:'tag-blowout',scope:rStat==='W'?'red':'blue'});
  if(M1>=7&&M2>=7)tags.push({id:'flawless_red',label:'⭐ Flawless Form',class:'tag-normal',scope:'red'});
  if(M1<=-7&&M2<=-7)tags.push({id:'flawless_blue',label:'⭐ Flawless Form',class:'tag-normal',scope:'blue'});
  let summary='';
  if(!isDraw){const winTeam=M1>0&&M2>0?'Red':'Blue';if(totalMargin<=5)summary='เกมสูสีมาก ผลแพ้ชนะขึ้นอยู่กับจังหวะ';else if(totalMargin<=12)summary=`ทีม${winTeam==='Red'?'แดง':'น้ำเงิน'}นิ่งกว่าในช่วงสำคัญ`;else if(totalMargin<=20)summary=`ทีม${winTeam==='Red'?'แดง':'น้ำเงิน'}คุมเกมได้ชัดเจน`;else summary='ห่างชั้นกันมาก';}else{if(netMargin<=3)summary='เสมอสมบูรณ์แบบ ฝีมือเท่ากัน';else if(netMargin<=8)summary='ผลเสมอ แต่มีฝ่ายกดดันได้ดีกว่า';else summary='เสมอแค่จำนวนเกม';}
  return{status,statusColor,tags,summary,totalMargin,netMargin,volatility,isDraw};
}

async function confirmMatch() {
  const m = appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!m) return;

  const g1r=Number(m.live.g1R||0), g1b=Number(m.live.g1B||0);
  const g2r=Number(m.live.g2R||0), g2b=Number(m.live.g2B||0);

  // คะแนนไม่มาตรฐานก็ส่งได้ (ยอมแพ้/เจ็บ/เล่นสั้น) — เตือนแต่ไม่ block
  const _warns = [scoreValidationMsg(g1r, g1b, 'Game 1'), scoreValidationMsg(g2r, g2b, 'Game 2')].filter(Boolean);
  if (_warns.length) vibrateDevice([60,30,60]);

  const scoreHtml = `
    <div class="modal-score-preview">
      <div class="modal-score-game">
        <div class="modal-score-label">GAME 1</div>
        <div class="modal-score-val">
          <span style="color:var(--red)">${g1r}</span>
          <span style="color:var(--muted2);font-size:0.7em;margin:0 4px">–</span>
          <span style="color:var(--blue)">${g1b}</span>
        </div>
      </div>
      <div class="modal-score-sep">·</div>
      <div class="modal-score-game">
        <div class="modal-score-label">GAME 2</div>
        <div class="modal-score-val">
          <span style="color:var(--red)">${g2r}</span>
          <span style="color:var(--muted2);font-size:0.7em;margin:0 4px">–</span>
          <span style="color:var(--blue)">${g2b}</span>
        </div>
      </div>
    </div>`;

  const ok = await showConfirm('🏁', 'SUBMIT GAME 2?', _warns.length ? `⚠️ ${_warns.join(' · ')}\nจะส่งผลตามคะแนนนี้` : 'ผลจะส่งไปที่ Scoreboard ทันที', {
    scoreHtml,
    confirmLabel: 'SUBMIT',
    confirmClass: 'modal-btn-confirm',
    cancelLabel: 'ยกเลิก'
  });

  if (ok) {
    _isConfirming = true; // ป้องกัน updateCurrentScreen แสดง modal ซ้ำ
    let rWin=0, bWin=0;
    if(g1r>g1b)rWin++;else if(g1b>g1r)bWin++;else{rWin+=0.5;bWin+=0.5;}
    if(g2r>g2b)rWin++;else if(g2b>g2r)bWin++;else{rWin+=0.5;bWin+=0.5;}

    let pRed=0, pBlue=0, rStat='', bStat='', resText='';
    if(rWin>bWin){pRed=3;rStat='W';bStat='L';resText='🔴 Red Win 2–0 (+3pts)';}
    else if(bWin>rWin){pBlue=3;rStat='L';bStat='W';resText='🔵 Blue Win 2–0 (+3pts)';}
    else{
      if(rWin===1 && bWin===1){
        pRed=1; pBlue=1; rStat='D'; bStat='D'; resText='🤝 เสมอ 1–1 (+1pt each)';
      } else {
        const pdRed=(g1r-g1b)+(g2r-g2b), pdBlue=-pdRed;
        if(pdRed>0){pRed=3;rStat='W';bStat='L';resText=`🔴 Red Win (Point Diff +${pdRed}) (+3pts)`;}
        else if(pdBlue>0){pBlue=3;rStat='L';bStat='W';resText=`🔵 Blue Win (Point Diff +${pdBlue}) (+3pts)`;}
        else{pRed=1;pBlue=1;rStat='D';bStat='D';resText='🤝 Perfect Draw (+1pt each)';}
      }
    }

    let matchDuration = m.timerStartedAt ? Date.now() - m.timerStartedAt : 0;

    appState.globalScoreRed  = (appState.globalScoreRed||0)  + pRed;
    appState.globalScoreBlue = (appState.globalScoreBlue||0) + pBlue;

    const analysis = analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, m.potFlags||{});

    appState.matchHistory.push({
      id:m.id, round:m.round, r1:m.r1, r2:m.r2, b1:m.b1, b2:m.b2,
      redNames:m.redNames, blueNames:m.blueNames,
      game1:`${g1r}:${g1b}`, game2:`${g2r}:${g2b}`,
      result:resText, pRed, pBlue, rStat, bStat, duration:matchDuration,
      analysis:{...analysis, potFlags:m.potFlags||{}},
      umpire:currentUmpire
    });

    appState.ongoingMatches = appState.ongoingMatches.filter(x => x.id !== m.id);
    saveData();
    vibrateDevice([60, 40, 60, 40, 120]);

    await showAlert('✅', 'ส่งผลแล้ว!', resText);
    _isConfirming = false;
    exitMatch();
  }
}
