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
let _tvVsIdx  = 0;   // which live match the VS panel features (advances each cycle)
const TV_PANELS = ['battle', 'vs', 'board'];
const TV_ROTATE_SEC = 14;

// smooth-render + smart-rotation state
let _tvLastKey = '';            // signature of the current DOM structure
let _tvCurrentVsMatch = null;   // the live match the VS panel is showing right now
let _tvEvent = null;            // transient announcement { type, m }
let _tvEventTimer = null;
let _tvPrevHist = -1;           // matchHistory length last seen (finished detection)
let _tvPrevLocks = {};          // matchId -> g1Locked (game-1-done detection)
let _tvInit = false;

// ── Climax detection (same thresholds as the court cards) ──
function _tvClimaxLevel(m) {
  if (!m || !m.live) return 0;
  const lv = m.live;
  const chk = (r, b, locked) => {
    if (locked) return 0;
    const hi = Math.max(r, b), diff = hi - Math.min(r, b);
    if (hi >= 20 && diff <= 2) return 2;  // deuce
    if (hi >= 18 && diff <= 3) return 1;  // climax
    return 0;
  };
  const g1 = chk(Number(lv.g1R || 0), Number(lv.g1B || 0), lv.g1Locked);
  const g2 = lv.g1Locked ? chk(Number(lv.g2R || 0), Number(lv.g2B || 0), false) : 0;
  return Math.max(g1, g2);
}
function _tvClimaxMatch(live) {
  live = live || (appState.ongoingMatches || []).filter(m => m && m.id);
  let best = null, bestLv = 0;
  live.forEach(m => { const lv = _tvClimaxLevel(m); if (lv > bestLv) { bestLv = lv; best = m; } });
  return best;
}
function _tvPickVsMatch() {
  const live = (appState.ongoingMatches || []).filter(m => m && m.id);
  if (!live.length) return null;
  return _tvClimaxMatch(live) || live[(((_tvVsIdx % live.length) + live.length) % live.length)];
}

function enterTvMode() {
  _tvActive = true;
  userRole = 'guest'; // read-only data access (same as spectator)
  document.body.classList.add('tv-mode');
  const ov = document.getElementById('loginOverlay'); if (ov) ov.style.display = 'none';
  const el = document.getElementById('tvView'); if (el) el.style.display = 'flex';
  _tvPanel = 0; _tvSecs = 0;
  renderTvPanel();
  _tvBindFsControls();
  requestTvWakeLock();
  clearInterval(_tvTimer);
  _tvTimer = setInterval(() => {
    if (_tvEvent) return;                    // hold on a finished / game-1 announcement
    // A match in climax/deuce takes over the screen until the moment passes.
    const climax = _tvClimaxMatch();
    if (climax) {
      if (TV_PANELS[_tvPanel] !== 'vs') { _tvPanel = TV_PANELS.indexOf('vs'); _tvSecs = 0; renderTvPanel(true); }
      return;                                // don't rotate away from the drama
    }
    _tvSecs++;
    if (_tvSecs >= TV_ROTATE_SEC) {
      _tvSecs = 0;
      const prev = TV_PANELS[_tvPanel];
      _tvPanel = (_tvPanel + 1) % TV_PANELS.length;
      // each time the VS panel comes around, feature the next live match
      if (TV_PANELS[_tvPanel] === 'vs' && prev !== 'vs') _tvVsIdx++;
      renderTvPanel();
    }
  }, 1000);
}

// Called from updateUI on every data change: detect announce-worthy events,
// then render smoothly (patch values instead of rebuilding when possible).
function tvOnDataChange() {
  if (!_tvActive) return;
  _tvDetectEvents();
  renderTvPanel();
}

function _tvDetectEvents() {
  const hist = appState.matchHistory || [];
  const live = appState.ongoingMatches || [];
  if (!_tvInit) {   // first sight — record state, announce nothing
    _tvPrevHist = hist.length;
    live.forEach(m => { if (m) _tvPrevLocks[m.id] = !!(m.live && m.live.g1Locked); });
    _tvInit = true;
    return;
  }
  // a match just finished → celebrate it
  if (hist.length > _tvPrevHist) _tvShowEvent({ type: 'finished', m: hist[hist.length - 1] });
  _tvPrevHist = hist.length;
  // a match's game 1 just locked → quick "GAME 1 done" flash
  const seen = {};
  live.forEach(m => {
    if (!m) return;
    seen[m.id] = true;
    const locked = !!(m.live && m.live.g1Locked);
    if (_tvPrevLocks[m.id] === false && locked) _tvShowEvent({ type: 'game1', m });
    _tvPrevLocks[m.id] = locked;
  });
  Object.keys(_tvPrevLocks).forEach(id => { if (!seen[id]) delete _tvPrevLocks[id]; });
}

function _tvShowEvent(ev) {
  _tvEvent = ev;
  clearTimeout(_tvEventTimer);
  _tvEventTimer = setTimeout(() => { _tvEvent = null; _tvSecs = 0; renderTvPanel(true); }, ev.type === 'finished' ? 8000 : 5000);
  renderTvPanel(true);
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

function _tvFootHtml() {
  const dots = TV_PANELS.map((_, i) => `<span class="tv-dot ${i === _tvPanel ? 'on' : ''}"></span>`).join('');
  return `<div class="tv-foot"><div class="tv-dots">${dots}</div><div class="tv-brand">Badminton Sports Day 2026</div></div>`;
}

// A signature of what the panel is currently SHOWING. When it is unchanged we
// patch the live numbers in place instead of rebuilding (no flash, photos stay).
function _tvStructKey(panel) {
  if (panel === 'battle') return 'battle';
  if (panel === 'vs') {
    const m = _tvCurrentVsMatch;
    if (!m) return 'vs|empty';
    const lv = m.live || {};
    const g2on = !!(lv.g1Locked || lv.g2R || lv.g2B);
    const started = !(!g2on && !(lv.g1R || 0) && !(lv.g1B || 0));
    return `vs|${m.id}|${m.r1}-${m.r2}-${m.b1}-${m.b2}|${g2on ? 1 : 0}|${started ? 1 : 0}|${_tvClimaxLevel(m)}`;
  }
  return 'board|' + _tvTopPlayers().map(p => p.id + ':' + p.pts).join(',');
}

function _tvPatch(panel) {
  const el = document.getElementById('tvView');
  if (!el) return;
  if (panel === 'battle') {
    const r = appState.globalScoreRed || 0, b = appState.globalScoreBlue || 0;
    const rs = el.querySelector('.tv-team.red .tv-team-score');  if (rs) rs.textContent = r;
    const bs = el.querySelector('.tv-team.blue .tv-team-score'); if (bs) bs.textContent = b;
    el.querySelector('.tv-team.red') ?.classList.toggle('lead', r > b);
    el.querySelector('.tv-team.blue')?.classList.toggle('lead', b > r);
  } else if (panel === 'vs') {
    const m = _tvCurrentVsMatch; if (!m) return;
    const lv = m.live || {};
    const g1r = lv.g1R || 0, g1b = lv.g1B || 0, g2r = lv.g2R || 0, g2b = lv.g2B || 0;
    const g2on = lv.g1Locked || g2r || g2b;
    const cr = g2on ? g2r : g1r, cb = g2on ? g2b : g1b;
    const rEl = el.querySelector('.tv-vs-score .red');  if (rEl) rEl.textContent = cr;
    const bEl = el.querySelector('.tv-vs-score .blue'); if (bEl) bEl.textContent = cb;
    const g1El = el.querySelector('.tv-vs-g1'); if (g1El && g2on) g1El.textContent = `G1 · ${g1r}–${g1b}`;
  }
  // board rebuilds on change (its key holds the points), so no patch needed
}

// Transient full-screen announcement: a match finished, or a game 1 wrapped up.
function _tvEventHtml(ev) {
  const m = ev.m || {};
  if (ev.type === 'finished') {
    const isR = m.rStat === 'W', isB = m.bStat === 'W';
    const cls = isR ? 'red' : isB ? 'blue' : 'draw';
    const title = isR ? '🔴 RED WINS' : isB ? '🔵 BLUE WINS' : '🤝 DRAW';
    const score = `${escHtml(m.game1 || '')}${m.game2 && m.game2 !== '0:0' ? '  /  ' + escHtml(m.game2) : ''}`;
    return `<div class="tv-panel tv-event ${cls}">
      <div class="tv-ev-tag">🏆 MATCH FINISHED · ${escHtml(m.id || '')}</div>
      <div class="tv-ev-names">
        <span class="tv-ev-side red ${isR ? 'win' : ''}">${escHtml(_tvStrip(m.redNames))}</span>
        <span class="tv-ev-score">${score}</span>
        <span class="tv-ev-side blue ${isB ? 'win' : ''}">${escHtml(_tvStrip(m.blueNames))}</span>
      </div>
      <div class="tv-ev-result ${cls}">${title}</div>
    </div>`;
  }
  const lv = m.live || {};
  const g1r = lv.g1R || 0, g1b = lv.g1B || 0;
  const w = g1r > g1b ? 'red' : g1b > g1r ? 'blue' : '';
  const leader = w === 'red' ? _tvStrip(m.redNames) : w === 'blue' ? _tvStrip(m.blueNames) : '';
  return `<div class="tv-panel tv-event ${w}">
    <div class="tv-ev-tag">${escHtml(m.id || '')} · ROUND ${escHtml(String(m.round || ''))}</div>
    <div class="tv-ev-big">END OF GAME 1</div>
    <div class="tv-ev-g1"><span class="red">${g1r}</span><span class="sep">:</span><span class="blue">${g1b}</span></div>
    <div class="tv-ev-note">${w ? `<b class="${w}">${escHtml(leader)}</b> นำ · ลุยเกม 2` : 'เสมอ · ลุยเกม 2'}</div>
  </div>`;
}

function renderTvPanel(force) {
  const el = document.getElementById('tvView');
  if (!el || !_tvActive) return;

  // an announcement owns the whole screen while it is up
  if (_tvEvent) { el.innerHTML = _tvEventHtml(_tvEvent) + _tvFootHtml(); _tvLastKey = '__event'; return; }

  const panel = TV_PANELS[_tvPanel];
  if (panel === 'vs') _tvCurrentVsMatch = _tvPickVsMatch();

  // same structure as last render → patch numbers only, so nothing flashes
  const key = _tvStructKey(panel);
  if (!force && key === _tvLastKey && el.querySelector('.tv-panel')) { _tvPatch(panel); return; }
  _tvLastKey = key;

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
  } else if (panel === 'vs') {
    const m = _tvCurrentVsMatch;
    if (!m) {
      html = `<div class="tv-panel tv-vs-panel"><div class="tv-heading">🟢 LIVE</div><div class="tv-empty">ยังไม่มีแมตช์กำลังแข่ง</div></div>`;
    } else {
      const live = (appState.ongoingMatches || []).filter(x => x && x.id);
      const i = Math.max(0, live.indexOf(m));
      const lv = m.live || {};
      const g1r = lv.g1R || 0, g1b = lv.g1B || 0, g2r = lv.g2R || 0, g2b = lv.g2B || 0;
      const g2on = lv.g1Locked || g2r || g2b;
      const cr = g2on ? g2r : g1r, cb = g2on ? g2b : g1b;
      const notStarted = !g2on && !cr && !cb;
      const cx = _tvClimaxLevel(m);
      const cxBadge = cx === 2 ? `<span class="tv-vs-climax deuce">⚡ DEUCE</span>` : cx === 1 ? `<span class="tv-vs-climax">🔥 CLIMAX</span>` : '';
      html = `<div class="tv-panel tv-vs-panel${cx ? ' is-climax' : ''}">
        <div class="tv-vs-top">
          <span class="tv-vs-court">🟢 ${escHtml(m.id)}</span>
          ${m.round ? `<span class="tv-vs-round">ROUND ${escHtml(String(m.round))}</span>` : ''}
          <span class="tv-vs-game">${g2on ? 'GAME 2' : 'GAME 1'}</span>
          ${cxBadge}
        </div>
        <div class="tv-vs-row">
          <div class="tv-vs-side red">
            <div class="tv-vs-faces">${[m.r1,m.r2].map(id=>avatarHtml(id,160)).join('')}</div>
            <div class="tv-vs-names red">${escHtml(_tvStrip(m.redNames))}</div>
          </div>
          <div class="tv-vs-mid">
            <div class="tv-vs-vs">VS</div>
            ${notStarted
              ? `<div class="tv-vs-nowplaying">NOW<br>PLAYING</div>`
              : `<div class="tv-vs-score"><span class="red">${cr}</span><span class="sep">:</span><span class="blue">${cb}</span></div>`}
            <div class="tv-vs-g1">${g2on ? `G1 · ${g1r}–${g1b}` : (notStarted ? 'พร้อมแข่ง' : '')}</div>
          </div>
          <div class="tv-vs-side blue">
            <div class="tv-vs-faces">${[m.b1,m.b2].map(id=>avatarHtml(id,160)).join('')}</div>
            <div class="tv-vs-names blue">${escHtml(_tvStrip(m.blueNames))}</div>
          </div>
        </div>
        ${live.length > 1 ? `<div class="tv-vs-count">${i + 1} / ${live.length} matches</div>` : ''}
      </div>`;
    }
  } else {
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

  el.innerHTML = html + _tvFootHtml();
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

// ── Screen Wake Lock ──────────────────────────────────────────
// A TV / projector display must never sleep. wakeLock keeps the screen on
// while TV mode is active; the browser releases it on tab-hide, so a
// visibility hook re-acquires it. Falls back silently where unsupported
// (iOS Safari has no Wake Lock API — there the display setting has to
// keep the screen awake).
let _tvWakeLock = null;

async function requestTvWakeLock() {
  if (!_tvActive || !('wakeLock' in navigator)) return;
  try {
    _tvWakeLock = await navigator.wakeLock.request('screen');
    _tvWakeLock.addEventListener('release', () => { _tvWakeLock = null; });
  } catch (e) { /* denied or not allowed in this context */ }
}

function releaseTvWakeLock() {
  if (_tvWakeLock) { try { _tvWakeLock.release(); } catch (e) {} _tvWakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (_tvActive && document.visibilityState === 'visible' && !_tvWakeLock) requestTvWakeLock();
});

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