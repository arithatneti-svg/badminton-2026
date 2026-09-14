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
let _arenaKey = '';   // signature of what the arena is showing → patch vs rebuild
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
    if (arena.style.display !== 'none') { arena.style.display = 'none'; arena.innerHTML = ''; _arenaKey = ''; }
    wrap.style.display = '';
    if (_arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
    return;
  }

  wrap.style.display = 'none';
  arena.style.display = '';
  if (_arenaIdx >= live.length) _arenaIdx = 0;
  _arenaShow(arena, live[_arenaIdx], _arenaIdx, live.length);

  // rotate through courts when more than one is live
  if (_arenaTimer) { clearInterval(_arenaTimer); _arenaTimer = null; }
  if (live.length > 1) {
    _arenaTimer = setInterval(() => {
      const l = _liveMatches();
      const a = document.getElementById('liveArena');
      if (!a || a.style.display === 'none' || l.length <= 1) { clearInterval(_arenaTimer); _arenaTimer = null; return; }
      _arenaIdx = (_arenaIdx + 1) % l.length;
      _arenaShow(a, l[_arenaIdx], _arenaIdx, l.length);
    }, ARENA_ROTATE_MS);
  }
}

// Rebuild only when the match / game / pairing changes; otherwise patch the
// live numbers in place so photos don't reload and nothing flashes per point.
function _arenaShow(arena, m, idx, total) {
  const onGame2 = !!(m.live && m.live.g1Locked);
  const key = `${m.id}|${onGame2 ? 2 : 1}|${m.r1}-${m.r2}-${m.b1}-${m.b2}|${total}|${idx}`;
  if (key === _arenaKey && arena.querySelector('.lv-arena')) { _arenaPatch(arena, m); return; }
  _arenaKey = key;
  arena.innerHTML = _liveArenaHtml(m, idx, total);
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

function _arenaPatch(arena, m) {
  const s = _arenaScores(m);
  const set = (sel, v) => { const el = arena.querySelector(sel); if (el) el.textContent = v; };
  set('.lv-team.red .lv-snum',  s.curR);
  set('.lv-team.blue .lv-snum', s.curB);
  set('.lv-set .g.r', s.redGames);
  set('.lv-set .g.b', s.blueGames);
  const lead = s.curR > s.curB ? 'red' : s.curB > s.curR ? 'blue' : '';
  arena.querySelector('.lv-team.red') ?.classList.toggle('lead', lead === 'red');
  arena.querySelector('.lv-team.blue')?.classList.toggle('lead', lead === 'blue');
}

function _liveArenaHtml(m, idx, total) {
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
        ${total > 1 ? `<span class="lv-sep">·</span><span class="lv-court">Court ${idx + 1} / ${total}</span>` : ''}
      </div>
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

