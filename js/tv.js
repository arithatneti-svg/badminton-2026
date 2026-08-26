// ============================================================
// TV / Projector mode — big-screen auto-rotating public display.
// Opened via QR/link (?view=tv). Read-only; rotates through
// Team Battle → Live Now → Leaderboard. Updates in real time
// (renderTvPanel is called from updateUI on every data change).
// ============================================================
let _tvActive = false;
let _tvPanel  = 0;
let _tvSecs   = 0;
let _tvTimer  = null;
const TV_PANELS = ['battle', 'live', 'board'];
const TV_ROTATE_SEC = 14;

function enterTvMode() {
  _tvActive = true;
  userRole = 'guest'; // read-only data access (same as spectator)
  document.body.classList.add('tv-mode');
  const ov = document.getElementById('loginOverlay'); if (ov) ov.style.display = 'none';
  const el = document.getElementById('tvView'); if (el) el.style.display = 'flex';
  _tvPanel = 0; _tvSecs = 0;
  renderTvPanel();
  _tvBindFsControls();
  clearInterval(_tvTimer);
  _tvTimer = setInterval(() => {
    _tvSecs++;
    if (_tvSecs >= TV_ROTATE_SEC) { _tvSecs = 0; _tvPanel = (_tvPanel + 1) % TV_PANELS.length; renderTvPanel(); }
  }, 1000);
}

function _tvStrip(s) { return (s || '').replace(/\s*\(G\d\)/g, ''); }

function _tvTopPlayers() {
  const stats = {};
  (appState.players || []).forEach(p => { stats[p.id] = { name: p.name, team: p.team, pts: 0, w: 0, total: 0 }; });
  (appState.matchHistory || []).forEach(h => {
    [h.r1, h.r2].forEach(id => { if (stats[id]) { stats[id].pts += h.pRed || 0; if (h.rStat === 'W') stats[id].w++; stats[id].total++; } });
    [h.b1, h.b2].forEach(id => { if (stats[id]) { stats[id].pts += h.pBlue || 0; if (h.bStat === 'W') stats[id].w++; stats[id].total++; } });
  });
  return Object.values(stats).filter(p => p.total > 0).sort((a, b) => b.pts - a.pts || b.w - a.w).slice(0, 8);
}

function renderTvPanel() {
  const el = document.getElementById('tvView');
  if (!el || !_tvActive) return;
  const panel = TV_PANELS[_tvPanel];
  let html = '';

  if (panel === 'battle') {
    const r = appState.globalScoreRed || 0, b = appState.globalScoreBlue || 0;
    const rn = appState.redTeamName || 'RED TEAM', bn = appState.blueTeamName || 'BLUE TEAM';
    html = `<div class="tv-panel tv-battle">
      <div class="tv-heading">🏸 TEAM BATTLE</div>
      <div class="tv-battle-row">
        <div class="tv-team red ${r > b ? 'lead' : ''}"><div class="tv-team-name">${escHtml(rn)}</div><div class="tv-team-score">${r}</div></div>
        <div class="tv-vs">VS</div>
        <div class="tv-team blue ${b > r ? 'lead' : ''}"><div class="tv-team-name">${escHtml(bn)}</div><div class="tv-team-score">${b}</div></div>
      </div>
    </div>`;
  } else if (panel === 'live') {
    const ms = (appState.ongoingMatches || []).filter(m => m && m.id);
    const cards = ms.map(m => {
      const lv = m.live || {};
      const g1r = lv.g1R || 0, g1b = lv.g1B || 0, g2r = lv.g2R || 0, g2b = lv.g2B || 0;
      const g2on = lv.g1Locked || g2r || g2b;
      return `<div class="tv-live-card">
        <div class="tv-live-id">🟢 ${escHtml(m.id)}</div>
        <div class="tv-live-teams">
          <div class="tv-lt red"><span class="tv-faces">${[m.r1,m.r2].map(id=>avatarHtml(id,34)).join('')}</span>${escHtml(_tvStrip(m.redNames))}</div>
          <div class="tv-live-score"><span class="red">${g2on ? g2r : g1r}</span><span class="sep">:</span><span class="blue">${g2on ? g2b : g1b}</span></div>
          <div class="tv-lt blue"><span class="tv-faces">${[m.b1,m.b2].map(id=>avatarHtml(id,34)).join('')}</span>${escHtml(_tvStrip(m.blueNames))}</div>
        </div>
        <div class="tv-live-games">G1 ${g1r}–${g1b}${g2on ? ` · G2 ${g2r}–${g2b}` : ''}</div>
      </div>`;
    }).join('');
    html = `<div class="tv-panel">
      <div class="tv-heading">🟢 LIVE NOW</div>
      <div class="tv-live-grid">${cards || '<div class="tv-empty">ยังไม่มีแมตช์กำลังแข่ง</div>'}</div>
    </div>`;
  } else { // board
    const top = _tvTopPlayers();
    const medals = ['🥇', '🥈', '🥉'];
    const rows = top.map((p, i) => {
      const wr = p.total ? Math.round(p.w / p.total * 100) : 0;
      return `<div class="tv-board-row">
        <div class="tv-rank">${medals[i] || ('#' + (i + 1))}</div>
        <div class="tv-pname ${p.team === 'Red' ? 'red' : 'blue'}">${escHtml(p.name)}</div>
        <div class="tv-pmeta">${p.team} · WR ${wr}%</div>
        <div class="tv-ppts">${p.pts}<span>pt</span></div>
      </div>`;
    }).join('');
    html = `<div class="tv-panel">
      <div class="tv-heading">🏆 LEADERBOARD</div>
      <div class="tv-board">${rows || '<div class="tv-empty">ยังไม่มีข้อมูล</div>'}</div>
    </div>`;
  }

  const dots = TV_PANELS.map((_, i) => `<span class="tv-dot ${i === _tvPanel ? 'on' : ''}"></span>`).join('');
  el.innerHTML = html + `<div class="tv-foot"><div class="tv-dots">${dots}</div><div class="tv-brand">Badminton Sports Day 2026</div></div>`;
}

// ── Fullscreen for TV / projector ──
// TV mode hides the main nav, so this is the only way in. The button
// fades out while nobody is touching the machine — a projector should
// show the scoreboard, not a UI control — and comes back on any input.
let _tvIdleTimer = null;

function toggleTvFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return showToast('เบราว์เซอร์นี้ไม่รองรับเต็มจอ — ใช้ปุ่มเต็มจอของเบราว์เซอร์แทน', 'error');
    Promise.resolve(req.call(el)).catch(() => {
      showToast('เข้าเต็มจอไม่ได้ — ลองกด F11 หรือใช้เมนูเบราว์เซอร์', 'error');
    });
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
}

function _tvSyncFsBtn() {
  const btn = document.getElementById('tvFsBtn');
  if (!btn) return;
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btn.classList.toggle('is-on', on);
  btn.title = on ? 'ออกจากเต็มจอ (กด F หรือ Esc)' : 'เต็มจอ (กด F)';
  btn.setAttribute('aria-label', on ? 'ออกจากเต็มจอ' : 'เต็มจอ');
}

function _tvPokeIdle() {
  const btn = document.getElementById('tvFsBtn');
  if (!btn) return;
  btn.classList.remove('idle');
  clearTimeout(_tvIdleTimer);
  _tvIdleTimer = setTimeout(() => btn.classList.add('idle'), 3000);
}

function _tvBindFsControls() {
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev =>
    document.addEventListener(ev, _tvSyncFsBtn));
  ['mousemove', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, () => { if (_tvActive) _tvPokeIdle(); }, { passive: true }));
  document.addEventListener('keydown', (e) => {
    if (!_tvActive) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleTvFullscreen(); }
  });
  _tvSyncFsBtn();
  _tvPokeIdle();
}