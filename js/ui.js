// ==========================================
// 3. UI UPDATES
// ==========================================

// Keyboard access for card-style controls (player cards, gallery photos, …)
// that are <div>/<figure> with an onclick: when tagged role="button"+tabindex
// they now activate on Enter / Space like a real button.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const t = e.target;
  if (!t || !t.matches || !t.matches('[role="button"][tabindex]')) return;
  if (['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
  e.preventDefault();
  t.click();
});

// Keep --nav-h in sync with the sticky top bar's real height so sticky tab
// toolbars (search/filter) park exactly beneath it at any breakpoint.
function _syncNavHeight() {
  const nav = document.getElementById('mainNav');
  if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
}
window.addEventListener('DOMContentLoaded', () => {
  _syncNavHeight();
  const nav = document.getElementById('mainNav');
  if (nav && window.ResizeObserver) new ResizeObserver(_syncNavHeight).observe(nav);
  else window.addEventListener('resize', _syncNavHeight);
});

function switchTab(tabId, btn) {
  document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'dashboard') renderDashboard();
  if (tabId === 'report') { renderReportHero(); switchReportTab(_activeReportTab, document.getElementById('rtab-'+_activeReportTab)); }
  if (tabId === 'players') renderPlayersTab();
  if (tabId === 'admin') { renderMatchBoard(); renderAdminOngoingMatches(); }
  if (tabId === 'finished') renderFinishedMatches();
  if (tabId === 'ongoing') renderPublicOngoingMatches();
  if (tabId === 'gallery') renderGallery();
  _syncFire();
}

// ── Fire effect: run only while it can actually be seen ──
// It used to keep drawing radial-gradient particles at 60fps whenever a team led
// by 6+, even behind the live arena or on another tab — burning CPU/battery on
// phones and the TV box for most of the event.
let _fireWant = { red: false, blue: false };
function _syncFire() {
  if (typeof fireRed === 'undefined' || !fireRed || !fireBlue) return;
  const c = document.getElementById('fireCanvasRed');
  const visible = !document.hidden && !!c && c.getClientRects().length > 0;
  if (visible && _fireWant.red)  fireRed.start();  else fireRed.stop();
  if (visible && _fireWant.blue) fireBlue.start(); else fireBlue.stop();
}
document.addEventListener('visibilitychange', _syncFire);

// Players / Finished don't show live scores, yet they were rebuilt in full (54
// cards, ~80 photos) on every point from every court. Signature of everything
// they could depend on EXCEPT the live scoring churn → rebuild only on change.
const _tabSig = { players: null, finished: null };
function _staticDataSig() {
  try {
    return JSON.stringify(appState, (k, v) => {
      if (k === 'ongoingMatches' && Array.isArray(v)) return v.map(m => m && [m.id, m.round, m.r1, m.r2, m.b1, m.b2]);
      if (k === 'photo' && typeof v === 'string') return v.length + ':' + v.slice(-16);  // don't serialise the base64
      if (k === 'remoteCommand') return undefined;
      return v;
    }) + '|' + userRole + '|' + (typeof getMe === 'function' ? getMe() : '');
  } catch (e) {
    return 'err' + Date.now();   // never skip a render because the signature failed
  }
}

function updateUI() {
  if (!userRole) return;

  // TV/projector mode: render the big-screen panel and skip normal tab UI
  if (typeof _tvActive !== 'undefined' && _tvActive) {
    if (typeof tvOnDataChange === 'function') tvOnDataChange(); else renderTvPanel();
    return;
  }

  // Role badge
  const badge = document.getElementById('roleBadge');
  if (badge) {
    if (userRole === 'superadmin') {
      badge.textContent = '👑 SUPER ADMIN';
      badge.style.cssText += 'display:inline-block;background:rgba(245,200,66,0.15);color:#f5c842;border:1px solid rgba(245,200,66,0.35);';
    } else if (userRole === 'admin') {
      badge.textContent = '⚙️ ADMIN';
      badge.style.cssText += 'display:inline-block;background:rgba(255,255,255,0.07);color:#aaa;border:1px solid rgba(255,255,255,0.15);';
    } else {
      badge.style.display = 'none';
    }
  }

  const rEl = document.getElementById('displayRedScore'), bEl = document.getElementById('displayBlueScore');
  const rPanel = document.getElementById('redPanel'), bPanel = document.getElementById('bluePanel');
  const newRed = appState.globalScoreRed, newBlue = appState.globalScoreBlue;
  if (newRed !== prevRed) { rEl.classList.remove('score-bump'); void rEl.offsetWidth; rEl.classList.add('score-bump'); if (newRed > prevRed) flashScore('displayRedScore','#ff3b3b'); prevRed = newRed; }
  if (newBlue !== prevBlue) { bEl.classList.remove('score-bump'); void bEl.offsetWidth; bEl.classList.add('score-bump'); if (newBlue > prevBlue) flashScore('displayBlueScore','#3b8eff'); prevBlue = newBlue; }
  rEl.textContent = newRed; bEl.textContent = newBlue;
  
  document.getElementById('redTeamName').value = appState.redTeamName || 'RED TEAM';
  document.getElementById('blueTeamName').value = appState.blueTeamName || 'BLUE TEAM';
  
  rPanel.classList.remove('leading','dominant'); bPanel.classList.remove('leading','dominant');
  const diff = newRed - newBlue;
  if (diff > 0) { rPanel.classList.add(diff >= 6 ? 'dominant' : 'leading'); document.getElementById('redLeadBadge').textContent = diff >= 6 ? '🔥 DOMINANT' : '▲ LEADING'; document.getElementById('blueLeadBadge').textContent = '▲ LEADING'; _fireWant = { red: diff >= 6, blue: false }; }
  else if (diff < 0) { bPanel.classList.add(Math.abs(diff) >= 6 ? 'dominant' : 'leading'); document.getElementById('blueLeadBadge').textContent = Math.abs(diff) >= 6 ? '🔥 DOMINANT' : '▲ LEADING'; document.getElementById('redLeadBadge').textContent = '▲ LEADING'; _fireWant = { red: false, blue: Math.abs(diff) >= 6 }; }
  else { document.getElementById('redLeadBadge').textContent = '▲ LEADING'; document.getElementById('blueLeadBadge').textContent = '▲ LEADING'; _fireWant = { red: false, blue: false }; }

  if (typeof renderMeBar === 'function') renderMeBar();
  if (typeof renderLiveArena === 'function') renderLiveArena();
  _syncFire();   // after the arena decided whether the team-battle rings are visible

  // render only the active tab — ป้องกัน dashboard รั่วไปทุก tab
  const activeTab = document.querySelector('.container.active')?.id;
  const sig = (activeTab === 'players' || activeTab === 'finished') ? _staticDataSig() : '';
  if (activeTab === 'players' && sig !== _tabSig.players) { renderPlayersTab(); _tabSig.players = sig; }
  // FIX-SHAKE: always update badge counts cheaply (no DOM rebuild);
  // only do the full innerHTML rebuild when the ongoing tab is actually
  // visible — this prevents scroll-position jumps / shaking on mobile.
  updateOngoingBadges();
  if (activeTab === 'ongoing') renderPublicOngoingMatches();
  if (activeTab === 'finished' && sig !== _tabSig.finished) { renderFinishedMatches(); _tabSig.finished = sig; }

  if (userRole === 'admin' || userRole === 'superadmin') {
    if (activeTab === 'admin')     { renderMatchBoard(); renderAdminOngoingMatches(); populateDropdowns(); }
    if (activeTab === 'report')    { renderReportHero(); renderReports(); renderMatchesPanel(); }
    if (activeTab === 'dashboard') renderDashboard();
  }
}

// ══════════════════════════════════════════
// LIVE ARENA — the scoreboard tab shows a big glanceable match display while a
// court is being scored, and falls back to the team-battle totals when idle.
// Several live courts: the viewer can pick one (court chips). Default is the
// viewer's own match if they've set "me", otherwise auto-rotate.
// ══════════════════════════════════════════
let _arenaIdx = 0;
let _arenaTimer = null;
let _arenaKey = '';      // signature of what the arena is showing → patch vs rebuild
let _arenaChoice = null; // null = default (my match, else auto) · 'auto' · a match id
const ARENA_ROTATE_MS = 9000;

function _liveMatches() {
  return (appState.ongoingMatches || []).filter(m => m && m.live);
}

// Which court to show, and why: 'pin' (viewer tapped it), 'me' (their match), 'auto'.
function _arenaResolve(live) {
  if (_arenaChoice && _arenaChoice !== 'auto') {
    const i = live.findIndex(x => x.id === _arenaChoice);
    if (i >= 0) return { idx: i, mode: 'pin' };
    _arenaChoice = null;              // that match finished → back to the default
  }
  if (!_arenaChoice && typeof matchHasMe === 'function') {
    const i = live.findIndex(matchHasMe);
    if (i >= 0) return { idx: i, mode: 'me' };
  }
  if (_arenaIdx >= live.length) _arenaIdx = 0;
  return { idx: _arenaIdx, mode: 'auto' };
}

function arenaPick(choice) {
  _arenaChoice = choice;              // 'auto' or a match id
  _arenaKey = '';                     // rebuild so the chips reflect the choice
  renderLiveArena();
}

function renderLiveArena() {
  const arena = document.getElementById('liveArena');
  const wrap  = document.querySelector('.scoreboard-wrapper');
  if (!arena || !wrap) return;
  const live = _liveMatches();

  if (!live.length) {                 // nothing being scored → idle board
    if (arena.style.display !== 'none') { arena.style.display = 'none'; arena.innerHTML = ''; _arenaKey = ''; }
    wrap.style.display = '';
    if (_arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
    renderIdleBoard();
    return;
  }

  wrap.style.display = 'none';
  arena.style.display = '';
  const r = _arenaResolve(live);
  _arenaShow(arena, live, r.idx, r.mode);

  // Keep ONE rotation timer running while in auto mode. This used to be
  // cleared and re-created on every data update, so during busy play (a point
  // somewhere every few seconds) the 9s rotation kept resetting and never moved.
  const wantTimer = r.mode === 'auto' && live.length > 1;
  if (wantTimer && !_arenaTimer) _arenaTimer = setInterval(_arenaTick, ARENA_ROTATE_MS);
  if (!wantTimer && _arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
}

// ══════════════════════════════════════════
// IDLE BOARD — between matches the scoreboard shows the team totals and what
// is coming next: the court that is about to start (umpire in place, no score
// yet), then the queue (no umpire yet) — same order as the Ongoing tab.
// ══════════════════════════════════════════
let _idleKey = '';
const IDLE_QUEUE_SHOWN = 4;          // rows under the "next up" card

function _idlePairHtml(ids, names, size) {
  const faces = ids.map(id => avatarHtml(id, size)).join('');
  const list = (names || '').split(' & ').map(n => escHtml(typeof stripGroup === 'function' ? stripGroup(n.trim()) : n.trim()));
  return { faces, names: list.join(' <i>·</i> ') };
}

function renderIdleBoard() {
  const box = document.getElementById('idleNext');
  if (!box) return;
  const ong  = (appState.ongoingMatches || []).filter(m => m && m.id);
  const onCourt = ong.filter(m => m.umpire && !m.live);   // umpire in place, not started
  const queue   = ong.filter(m => !m.umpire);
  const next = [...onCourt, ...queue];
  const hist = appState.matchHistory || [];
  const r = appState.globalScoreRed || 0, b = appState.globalScoreBlue || 0;

  // cheap text bits — always current
  const sum = document.getElementById('idleSummary');
  if (sum) sum.textContent = `${hist.length} แมตช์จบแล้ว · ${next.length ? next.length + ' แมตช์รอแข่ง' : 'ไม่มีคิว'}`;
  const gap = document.getElementById('idleGap');
  if (gap) gap.textContent = r === b ? 'เสมอ' : `ห่าง ${Math.abs(r - b)}`;

  // the cards only rebuild when the line-up changes
  const me = typeof getMe === 'function' ? getMe() : '';
  const key = next.map(m => [m.id, m.round, m.umpire || '', m.r1, m.r2, m.b1, m.b2].join(':')).join('|') + '|' + me + '|' + hist.length;
  if (key === _idleKey && box.firstChild) return;
  _idleKey = key;

  if (!next.length) {
    const isAdmin = userRole === 'admin' || userRole === 'superadmin';
    box.innerHTML = `<div class="idl-empty">
      <b>${hist.length ? '🏁 ไม่มีแมตช์ในคิวตอนนี้' : '📋 ยังไม่มีแมตช์'}</b>
      ${isAdmin ? 'สร้างแมตช์ใหม่ได้ที่แท็บ ⚙️ Admin' : 'รอแอดมินจัดคิวแมตช์ถัดไป'}
    </div>`;
    return;
  }

  const mine = m => typeof matchHasMe === 'function' && matchHasMe(m);
  const m = next[0];
  const red = _idlePairHtml([m.r1, m.r2], m.redNames, 96), blue = _idlePairHtml([m.b1, m.b2], m.blueNames, 96);
  const state = m.umpire
    ? `<span class="idl-next-state on">🟢 ลงสนามแล้ว · 👔 ${escHtml(m.umpire)}</span>`
    : `<span class="idl-next-state">⏳ รอเรียกลงสนาม</span>`;
  const hero = `<div class="idl-next${mine(m) ? ' me' : ''}">
    <div class="idl-next-head">
      <span class="idl-next-tag">⏭ แมตช์ถัดไป</span>
      <span class="idl-next-id">${escHtml(m.id)} · Round ${escHtml(String(m.round || '?'))}</span>
      ${state}
    </div>
    <div class="idl-next-row">
      <div class="idl-side red"><div class="idl-faces">${red.faces}</div><div class="idl-names">${red.names}</div></div>
      <div class="idl-next-vs">VS</div>
      <div class="idl-side blue"><div class="idl-faces">${blue.faces}</div><div class="idl-names">${blue.names}</div></div>
    </div>
    ${mine(m) ? `<div class="idl-me">⭐ แมตช์ของคุณ — เตรียมตัวได้เลย!</div>` : ''}
  </div>`;

  const rest = next.slice(1, 1 + IDLE_QUEUE_SHOWN);
  const more = next.length - 1 - rest.length;
  const rows = rest.map((x, i) => {
    const xr = _idlePairHtml([x.r1, x.r2], x.redNames, 28), xb = _idlePairHtml([x.b1, x.b2], x.blueNames, 28);
    return `<div class="idl-q${mine(x) ? ' me' : ''}">
      <span class="idl-q-no">#${i + 2}</span>
      <span class="idl-q-id">${escHtml(x.id)}</span>
      <span class="idl-q-team red">${xr.faces}<span>${xr.names}</span></span>
      <span class="idl-q-vs">vs</span>
      <span class="idl-q-team blue"><span>${xb.names}</span>${xb.faces}</span>
    </div>`;
  }).join('');
  const queueHtml = rest.length ? `<div class="idl-queue">
      <div class="idl-queue-h">ต่อจากนั้น</div>${rows}
      ${more > 0 ? `<div class="idl-q-more">และอีก ${more} แมตช์ — ดูทั้งหมดที่แท็บ Ongoing</div>` : ''}
    </div>` : '';

  box.innerHTML = hero + queueHtml;
}

function _arenaTick() {
  const l = _liveMatches();
  const a = document.getElementById('liveArena');
  if (!a || a.style.display === 'none' || l.length <= 1 || _arenaResolve(l).mode !== 'auto') {
    clearInterval(_arenaTimer); _arenaTimer = null;
    renderLiveArena();                // settle into whatever mode applies now
    return;
  }
  _arenaIdx = (_arenaIdx + 1) % l.length;
  _arenaShow(a, l, _arenaIdx, 'auto');
}

// Rebuild only when the court / game / pairing / court list changes; otherwise
// patch the live numbers in place so photos don't reload and nothing flashes.
function _arenaShow(arena, live, idx, mode) {
  const m = live[idx];
  const onGame2 = !!(m.live && m.live.g1Locked);
  const key = [mode, live.map(x => x.id).join(','), m.id, onGame2 ? 2 : 1, `${m.r1}-${m.r2}-${m.b1}-${m.b2}`].join('|');
  if (key === _arenaKey && arena.querySelector('.lv-arena')) { _arenaPatch(arena, m, live); return; }
  _arenaKey = key;
  arena.innerHTML = _liveArenaHtml(m, live, mode);
}

function _arenaScores(m) {
  const L = m.live || {};
  const g1r = Number(L.g1R || 0), g1b = Number(L.g1B || 0);
  const g2r = Number(L.g2R || 0), g2b = Number(L.g2B || 0);
  const onGame2 = !!L.g1Locked;
  return {
    curR: onGame2 ? g2r : g1r, curB: onGame2 ? g2b : g1b, gameNo: onGame2 ? 2 : 1,
    redGames: onGame2 && g1r > g1b ? 1 : 0, blueGames: onGame2 && g1b > g1r ? 1 : 0,
  };
}

function _arenaPatch(arena, m, live) {
  const s = _arenaScores(m);
  const set = (sel, v) => { const el = arena.querySelector(sel); if (el) el.textContent = v; };
  set('.lv-team.red .lv-snum',  s.curR);
  set('.lv-team.blue .lv-snum', s.curB);
  set('.lv-set .g.r', s.redGames);
  set('.lv-set .g.b', s.blueGames);
  const lead = s.curR > s.curB ? 'red' : s.curB > s.curR ? 'blue' : '';
  arena.querySelector('.lv-team.red') ?.classList.toggle('lead', lead === 'red');
  arena.querySelector('.lv-team.blue')?.classList.toggle('lead', lead === 'blue');
  // every court chip carries its own live score
  (live || []).forEach(x => {
    const b = arena.querySelector(`.lv-cchip[data-mid="${x.id}"] b`);
    if (b) { const xs = _arenaScores(x); b.textContent = `${xs.curR}–${xs.curB}`; }
  });
}

// Court chips: see every court's score at a glance, tap one to stay on it.
function _arenaChipsHtml(m, live, mode) {
  if (live.length < 2) return '';
  const mine = x => typeof matchHasMe === 'function' && matchHasMe(x);
  const chips = live.map(x => {
    const xs = _arenaScores(x);
    const shown = x.id === m.id;
    const cls = shown ? (mode === 'auto' ? ' cur' : ' on') : '';
    return `<button type="button" class="lv-cchip${cls}" data-mid="${escHtml(x.id)}" aria-pressed="${shown && mode !== 'auto'}"
      onclick="arenaPick('${escHtml(x.id)}')" title="ดูคอร์ตนี้ค้างไว้">${mine(x) ? '⭐ ' : ''}${escHtml(x.id)} <b>${xs.curR}–${xs.curB}</b></button>`;
  }).join('');
  return `<div class="lv-courts" role="group" aria-label="เลือกคอร์ต">
    <button type="button" class="lv-cchip auto${mode === 'auto' ? ' on' : ''}" aria-pressed="${mode === 'auto'}"
      onclick="arenaPick('auto')" title="สลับทุกคอร์ตอัตโนมัติ">🔄 อัตโนมัติ</button>${chips}
  </div>`;
}

function _liveArenaHtml(m, live, mode) {
  const s = _arenaScores(m);
  const strip = str => (str || '').split(' & ').map(n => (typeof stripGroup === 'function' ? stripGroup(n.trim()) : n.trim()));
  const redP  = strip(m.redNames), blueP = strip(m.blueNames);
  const rn = (appState.redTeamName || 'RED'), bn = (appState.blueTeamName || 'BLUE');
  const lead = s.curR > s.curB ? 'red' : s.curB > s.curR ? 'blue' : '';

  const teamCol = (cls, label, ids, players, score) => `
    <div class="lv-team ${cls}${lead === cls ? ' lead' : ''}">
      <div class="lv-tname">${label}</div>
      <div class="lv-faces">${ids.map(id => avatarHtml(id, 104)).join('')}</div>
      <div class="lv-players">${players.map(escHtml).join(' <i>·</i> ')}</div>
      <div class="lv-score"><span class="lv-snum">${score}</span></div>
    </div>`;

  return `
    <div class="lv-wrap">
      <div class="lv-top">
        <span class="lv-live"><i></i> LIVE</span>
        <span class="lv-match">${escHtml(m.id)} · Round ${escHtml(String(m.round))}</span>
        ${m.umpire ? `<span class="lv-sep">·</span><span class="lv-ump">👔 ${escHtml(m.umpire)}</span>` : ''}
        ${mode === 'me' ? `<span class="lv-sep">·</span><span class="lv-court">⭐ แมตช์ของคุณ</span>` : ''}
      </div>
      ${_arenaChipsHtml(m, live, mode)}
      <div class="lv-arena">
        ${teamCol('red',  escHtml(rn), [m.r1, m.r2], redP, s.curR)}
        <div class="lv-hub">
          <span class="lv-gamechip">GAME ${s.gameNo}</span>
          <div class="lv-set"><span class="g r">${s.redGames}</span><span class="d">–</span><span class="g b">${s.blueGames}</span></div>
          <span class="lv-setlbl">Games won</span>
        </div>
        ${teamCol('blue', escHtml(bn), [m.b1, m.b2], blueP, s.curB)}
      </div>
    </div>`;
}

function saveTeamNames() {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  appState.redTeamName = document.getElementById('redTeamName').value.trim().toUpperCase() || 'RED TEAM';
  appState.blueTeamName = document.getElementById('blueTeamName').value.trim().toUpperCase() || 'BLUE TEAM';
  saveKeys(['redTeamName', 'blueTeamName']); // เขียนเฉพาะชื่อทีม ไม่แตะ ongoingMatches
}

let _toastTimer = null;
function showToast(msg, type='') {
  // UX-2: duration scales with message length; clears previous toast first
  const t = document.getElementById('toast');
  clearTimeout(_toastTimer);
  t.className = ''; // reset first to re-trigger animation
  void t.offsetWidth;
  t.textContent = msg; t.className = 'show ' + type;
  const duration = Math.max(2400, Math.min(msg.length * 60, 5000));
  _toastTimer = setTimeout(() => { t.className = ''; }, duration);
}

// ══════════════════════════════════════════
// FULLSCREEN BOTTOM NAV — Auto-hide Logic
// ══════════════════════════════════════════
(function() {
  const NAV_ID     = 'fsBottomNav';
  const HIDE_DELAY = 3500; // ms ก่อนซ่อน
  let _hideTimer   = null;
  let _navVisible  = false;

  function showFsNav() {
    const nav = document.getElementById(NAV_ID);
    if (!nav || !document.fullscreenElement) return;
    nav.classList.remove('hidden');
    _navVisible = true;
    resetHideTimer();
  }

  function hideFsNav() {
    const nav = document.getElementById(NAV_ID);
    if (!nav) return;
    nav.classList.add('hidden');
    _navVisible = false;
  }

  function resetHideTimer() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(() => {
      // ซ่อนเฉพาะถ้า mouse ไม่ได้อยู่บน nav
      hideFsNav();
    }, HIDE_DELAY);
  }

  // Mouse เข้า nav — หยุดซ่อน
  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById(NAV_ID);
    const trigger = document.getElementById('fsTriggerZone');
    if (nav) {
      nav.addEventListener('mouseenter', () => clearTimeout(_hideTimer));
      nav.addEventListener('mouseleave', () => resetHideTimer());
    }
    // Trigger zone — mouse เข้า zone ขอบล่าง → โผล่
    if (trigger) {
      trigger.addEventListener('mouseenter', showFsNav);
    }
  });

  // Mouse move ทั่วจอ — โผล่ทุกครั้งที่ขยับ แล้วเริ่มนับถอยหลัง
  document.addEventListener('mousemove', (e) => {
    if (!document.fullscreenElement) return;
    const fromBottom = window.innerHeight - e.clientY;
    if (fromBottom <= 80) {
      showFsNav();
    } else if (_navVisible) {
      resetHideTimer();
    }
  });

  // Touch — swipe up จากขอบล่าง
  let _touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    _touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!document.fullscreenElement) return;
    const dy = _touchStartY - e.changedTouches[0].clientY;
    const fromBottom = window.innerHeight - _touchStartY;
    if (fromBottom <= 60 && dy > 20) showFsNav(); // swipe up จากขอบล่าง
    else if (dy < -20 && _navVisible) hideFsNav(); // swipe down ซ่อน
  }, { passive: true });

  // Fullscreen change — reset state
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      // เพิ่งเข้า fullscreen — โผล่ nav 1 ครั้งเพื่อบอกว่ามี
      setTimeout(() => { showFsNav(); }, 400);
    } else {
      // ออก fullscreen — reset
      const nav = document.getElementById(NAV_ID);
      if (nav) nav.classList.remove('hidden');
      clearTimeout(_hideTimer);
      _navVisible = false;
    }
  });
})();

function fsBtnActive(btn) {
  document.querySelectorAll('.fs-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // โผล่ nav นานขึ้นหลังกดปุ่ม
  const nav = document.getElementById('fsBottomNav');
  if (nav) nav.classList.remove('hidden');
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  const nav = document.getElementById('mainNav');
  if (nav) nav.style.display = document.fullscreenElement ? 'none' : '';
});

