// ==========================================
// 3. UI UPDATES
// ==========================================
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
}

function updateUI() {
  if (!userRole) return;

  // TV/projector mode: render the big-screen panel and skip normal tab UI
  if (typeof _tvActive !== 'undefined' && _tvActive) { renderTvPanel(); return; }

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
  if (diff > 0) { rPanel.classList.add(diff >= 6 ? 'dominant' : 'leading'); document.getElementById('redLeadBadge').textContent = diff >= 6 ? '🔥 DOMINANT' : '▲ LEADING'; document.getElementById('blueLeadBadge').textContent = '▲ LEADING'; if (diff >= 6) fireRed.start(); else fireRed.stop(); fireBlue.stop(); }
  else if (diff < 0) { bPanel.classList.add(Math.abs(diff) >= 6 ? 'dominant' : 'leading'); document.getElementById('blueLeadBadge').textContent = Math.abs(diff) >= 6 ? '🔥 DOMINANT' : '▲ LEADING'; document.getElementById('redLeadBadge').textContent = '▲ LEADING'; if (Math.abs(diff) >= 6) fireBlue.start(); else fireBlue.stop(); fireRed.stop(); }
  else { document.getElementById('redLeadBadge').textContent = '▲ LEADING'; document.getElementById('blueLeadBadge').textContent = '▲ LEADING'; fireRed.stop(); fireBlue.stop(); }
  
  if (typeof renderMeBar === 'function') renderMeBar();
  if (typeof renderLiveArena === 'function') renderLiveArena();

  // render only the active tab — ป้องกัน dashboard รั่วไปทุก tab
  const activeTab = document.querySelector('.container.active')?.id;
  if (activeTab === 'players') renderPlayersTab();
  // FIX-SHAKE: always update badge counts cheaply (no DOM rebuild);
  // only do the full innerHTML rebuild when the ongoing tab is actually
  // visible — this prevents scroll-position jumps / shaking on mobile.
  updateOngoingBadges();
  if (activeTab === 'ongoing') renderPublicOngoingMatches();
  if (activeTab === 'finished') renderFinishedMatches();

  if (userRole === 'admin' || userRole === 'superadmin') {
    if (activeTab === 'admin')     { renderMatchBoard(); renderAdminOngoingMatches(); populateDropdowns(); }
    if (activeTab === 'report')    { renderReportHero(); renderReports(); renderMatchesPanel(); }
    if (activeTab === 'dashboard') renderDashboard();
  }
}

// ══════════════════════════════════════════
// LIVE ARENA — the scoreboard tab shows a big glanceable match display while a
// court is being scored, and falls back to the team-battle totals when idle.
// Multiple live courts auto-rotate.
// ══════════════════════════════════════════
let _arenaIdx = 0;
let _arenaTimer = null;
const ARENA_ROTATE_MS = 9000;

function _liveMatches() {
  return (appState.ongoingMatches || []).filter(m => m && m.live);
}

function renderLiveArena() {
  const arena = document.getElementById('liveArena');
  const wrap  = document.querySelector('.scoreboard-wrapper');
  if (!arena || !wrap) return;
  const live = _liveMatches();

  if (!live.length) {                 // nothing on court → team-battle totals
    if (arena.style.display !== 'none') { arena.style.display = 'none'; arena.innerHTML = ''; }
    wrap.style.display = '';
    if (_arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
    return;
  }

  wrap.style.display = 'none';
  arena.style.display = '';
  if (_arenaIdx >= live.length) _arenaIdx = 0;
  arena.innerHTML = _liveArenaHtml(live[_arenaIdx], _arenaIdx, live.length);

  // rotate through courts when more than one is live
  if (_arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
  if (live.length > 1) {
    _arenaTimer = setInterval(() => {
      const l = _liveMatches();
      const a = document.getElementById('liveArena');
      if (!a || a.style.display === 'none' || l.length <= 1) { clearInterval(_arenaTimer); _arenaTimer = null; return; }
      _arenaIdx = (_arenaIdx + 1) % l.length;
      a.innerHTML = _liveArenaHtml(l[_arenaIdx], _arenaIdx, l.length);
    }, ARENA_ROTATE_MS);
  }
}

function _liveArenaHtml(m, idx, total) {
  const L = m.live || {};
  const g1r = Number(L.g1R || 0), g1b = Number(L.g1B || 0);
  const g2r = Number(L.g2R || 0), g2b = Number(L.g2B || 0);
  const onGame2 = !!L.g1Locked;
  const curR = onGame2 ? g2r : g1r;
  const curB = onGame2 ? g2b : g1b;
  const gameNo = onGame2 ? 2 : 1;
  const redGames  = onGame2 && g1r > g1b ? 1 : 0;
  const blueGames = onGame2 && g1b > g1r ? 1 : 0;

  const strip = s => (s || '').split(' & ').map(n => (typeof stripGroup === 'function' ? stripGroup(n.trim()) : n.trim()));
  const redP  = strip(m.redNames), blueP = strip(m.blueNames);

  const teamCol = (cls, label, players, score) => `
    <div class="lv-team ${cls}">
      <div class="lv-thead">
        <span class="lv-tlabel">${label}</span>
        <span class="lv-players">${players.map(escHtml).join(' <i>·</i> ')}</span>
      </div>
      <div class="lv-scard"><span class="lv-snum">${score}</span></div>
    </div>`;

  const rn = (appState.redTeamName  || 'RED');
  const bn = (appState.blueTeamName || 'BLUE');
  const courtLine = total > 1 ? `Court ${idx + 1} of ${total}` : `Match ${escHtml(m.id)}`;
  const meta = `${escHtml(m.id)} · Round ${escHtml(String(m.round))}${m.umpire ? ' · 👔 ' + escHtml(m.umpire) : ''}`;

  return `
    <div class="lv-wrap">
      ${total > 1 ? `<div class="lv-rotate">🔴 ${idx + 1} / ${total} courts</div>` : ''}
      <div class="lv-arena">
        ${teamCol('red',  '🔴 ' + escHtml(rn), redP, curR, 'red')}
        <div class="lv-hub">
          <span class="lv-gamechip">GAME ${gameNo}</span>
          <div class="lv-set"><span class="g r">${redGames}</span><span class="d">–</span><span class="g b">${blueGames}</span></div>
          <span class="lv-setlbl">Games</span>
          <div class="lv-meta">${meta}</div>
        </div>
        ${teamCol('blue', '🔵 ' + escHtml(bn), blueP, curB, 'blue')}
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

