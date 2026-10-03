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

// A climax/deuce cuts to a big hero of that court — but time-boxed, so a long
// deuce can never freeze the screen the way the old "hold on drama" did.
const TV_CLIMAX_MAX_SEC      = 25;  // one takeover can't hold longer than this
const TV_CLIMAX_CYCLE_SEC    = 12;  // when several courts are hot, rotate between them
const TV_CLIMAX_COOLDOWN_SEC = 14;  // breather after a takeover before it can grab again
const TV_BOARD_PAGE_SEC      = 6;   // dwell per leaderboard page while it scrolls all ranks

// smooth-render + smart-rotation state
let _tvLastKey = '';            // signature of the current DOM structure
let _tvEvent = null;            // transient announcement { type, m }
let _tvEventTimer = null;
let _tvPrevHist = -1;           // matchHistory length last seen (finished detection)
let _tvPrevLocks = {};          // matchId -> g1Locked (game-1-done detection)
let _tvInit = false;

// climax takeover
let _tvClimaxOn = false;        // a court's climax owns the screen right now
let _tvClimaxSecs = 0;          // seconds into the current takeover
let _tvClimaxIdx = 0;           // which hot court is featured (cycles among them)
let _tvClimaxCooldown = 0;      // seconds left before a takeover may start again
// leaderboard paging — scrolls through ALL ranks so every player reaches the screen
let _tvBoardPage = 0;
let _tvBoardSecs = 0;

// ── Is this screen still live? ──────────────────────────────────
// Nobody watches the TV (Q18), so it has to say when its data may be old. `.info/connected`
// only flips after the socket's keep-alive times out (can take a minute), and a quiet rally
// sends no data at all, so "no data for 15 s" proves nothing. Instead the screen probes the
// database over plain HTTPS every 5 s (one number, ~1 byte). Two misses in a row — or the
// browser reporting no network, or the shared connection state (dbIsOffline) saying offline —
// raise the red bar within ~15 s. The footer chip "ซิงก์ HH:MM:SS" shows the last moment the
// screen was confirmed live, so a frozen page (its clock stops) is visible from across the
// room even when no alarm can fire.
const TV_PROBE_EVERY_MS = 5000, TV_PROBE_TIMEOUT_MS = 4000;
let _tvAliveAt = Date.now();      // last moment confirmed live: a data snapshot or a good probe
let _tvProbeAt = 0, _tvProbeBusy = false, _tvProbeFails = 0;
let _tvOfflineSince = 0;          // when it was last known fine, once judged offline (0 = fine)
let _tvHealthTimer = null;

// Recovery — nobody is there to press refresh. After 5 min offline the screen drops and re-opens
// its connection; if it is STILL offline 5 min later although the network answers (so something in
// the page is stuck) it reloads — but only while no score has moved for 2 min, never mid-rally.
// With the network really down it never reloads (a reload could land on a browser error page);
// the red bar simply stays up. Values are an object so a test can shorten them.
const TV_RECOVERY = { reconnectAfterMs: 5 * 60 * 1000, idleBeforeReloadMs: 2 * 60 * 1000 };
let _tvLastChangeAt = Date.now(), _tvSig = '', _tvReconnectAt = 0;
let _tvWake = 'pending';          // screen wake lock: pending | ok | lost | unsupported | denied
function _tvReload() { location.reload(); }
// any score, pause or finished match counts as activity
function _tvNoteActivity() {
  const sig = _tvLiveList().map(m => { const lv = m.live || {}; return [m.id, lv.g1R, lv.g1B, lv.g2R, lv.g2B, lv.g1Locked ? 1 : 0, lv.isPaused ? 1 : 0].join(':'); }).join('|')
    + '#' + (appState.matchHistory || []).length;
  if (sig !== _tvSig) { _tvSig = sig; _tvLastChangeAt = Date.now(); }
}

function _tvClock(ms, withSeconds) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + (withSeconds ? ':' + p(d.getSeconds()) : '');
}
function _tvIsOffline() {
  return _tvProbeFails >= 2 || navigator.onLine === false || (typeof dbIsOffline === 'function' && dbIsOffline());
}
async function _tvProbe() {
  let url = '';
  try { url = firebase.app().options.databaseURL || ''; } catch (e) { /* no config — rely on the shared state */ }
  if (!url) return;
  _tvProbeBusy = true; _tvProbeAt = Date.now();
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TV_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url + '/sportsday_2026_data/matchCounter.json', { cache: 'no-store', signal: ctl.signal });
    if (res.status >= 500) throw new Error('http ' + res.status);   // a 4xx still proves the server is reachable
    _tvProbeFails = 0; _tvAliveAt = Date.now();
  } catch (e) { _tvProbeFails++; }
  finally { clearTimeout(timer); _tvProbeBusy = false; }
}
function _tvSyncInner() {
  const wake = (_tvWake === 'unsupported' || _tvWake === 'denied')
    ? ' <span class="tv-sync-warn">⚠ จออาจดับเอง — ตั้งปิดการพักจอที่เครื่อง</span>' : '';
  const ver = typeof APP_VERSION === 'string' ? ` · v${APP_VERSION}` : '';
  return `<span class="tv-sync-dot"></span>ซิงก์ ${_tvClock(_tvAliveAt, true)}${ver}${wake}`;
}
function _tvHealth() {
  const now = Date.now();
  if (!_tvProbeBusy && now - _tvProbeAt >= TV_PROBE_EVERY_MS) _tvProbe();
  if (_lastSnapshotAt > _tvAliveAt) _tvAliveAt = _lastSnapshotAt;   // fresh data also proves it is live
  const offline = _tvIsOffline();
  if (offline && !_tvOfflineSince) _tvOfflineSince = _tvAliveAt;
  if (!offline) _tvOfflineSince = 0;
  const bar = document.getElementById('tvStale');
  if (bar) {
    bar.hidden = !offline;
    const txt = '⚠️ ข้อมูลอาจไม่ล่าสุด — สัญญาณหลุดตั้งแต่ ' + _tvClock(_tvOfflineSince || _tvAliveAt);
    if (offline && bar.textContent !== txt) bar.textContent = txt;
  }
  const chip = document.getElementById('tvSync');
  if (chip) { chip.classList.toggle('off', offline); chip.innerHTML = _tvSyncInner(); }
  _tvPatchStatus();
  if (offline) {
    const offFor = now - _tvOfflineSince;
    if (offFor >= TV_RECOVERY.reconnectAfterMs && now - _tvReconnectAt >= TV_RECOVERY.reconnectAfterMs) {
      _tvReconnectAt = now;                           // drop the connection and open a fresh one
      try { const db = firebase.database(); db.goOffline(); setTimeout(() => db.goOnline(), 1000); } catch (e) { /* retry next round */ }
    }
    if (offFor >= 2 * TV_RECOVERY.reconnectAfterMs && _tvProbeFails === 0 && now - _tvLastChangeAt >= TV_RECOVERY.idleBeforeReloadMs) _tvReload();
  }
  // a new version was released (shared/pwa.js): pick it up at the first quiet moment, never mid-rally
  if (typeof _appNewVersion !== 'undefined' && _appNewVersion && now - _tvLastChangeAt >= TV_RECOVERY.idleBeforeReloadMs) _tvReload();
}
function _tvStartHealth() {
  clearInterval(_tvHealthTimer);
  _tvAliveAt = Date.now(); _tvProbeAt = 0; _tvProbeFails = 0; _tvOfflineSince = 0;
  _tvLastChangeAt = Date.now(); _tvReconnectAt = 0;
  _tvHealthTimer = setInterval(_tvHealth, 1000);
  _tvHealth();
}

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
// LIVE = a match an umpire has claimed (it has live data) — the same rule as the viewer's
// _liveMatches(). Matches still waiting in the queue are not on court, so they are not counted.
// Sorted by court number so the grid reads like the hall (matches without a court keep their order,
// after the numbered ones).
function _tvLiveList() {
  return (appState.ongoingMatches || []).filter(m => m && m.id && m.live)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => ((Number(a.m.court) || 99) - (Number(b.m.court) || 99)) || (a.i - b.i))
    .map(x => x.m);
}
// "คอร์ต 3" as a gold pill — the thing a viewer looks for first; nothing when no court was chosen
function _tvCourtPill(m) { return m.court ? `<b class="tv-court">${escHtml(courtLabel(m))}</b>` : ''; }
// "พักเกม" / "ไม่มีความเคลื่อนไหว 12 นาที" hanging on the card — it ages with the clock, not with data
// (a stuck court sends nothing), so _tvPatchStatus refreshes it from the health timer
function _tvStatusHtml(m, now) {
  const tag = matchStatusTag(m, now);
  return `<span class="tv-status${matchLooksStuck(m, now) ? ' stuck' : ''}">${escHtml(tag)}</span>`;
}
function _tvPatchStatus() {
  const now = Date.now();
  document.querySelectorAll('#tvView [data-mid]').forEach(card => {
    const el = card.querySelector('.tv-status'); if (!el) return;
    const m = (appState.ongoingMatches || []).find(x => x && x.id === card.dataset.mid); if (!m) return;
    const tag = matchStatusTag(m, now);
    if (el.textContent !== tag) el.textContent = tag;
    el.classList.toggle('stuck', matchLooksStuck(m, now));
  });
}
// what makes a live card or hero need rebuilding (a court change, the first point, a new game, a climax)
function _tvMKey(m) { const s = _tvScore(m); return `${m.id}:${m.court || 0}:${s.g2on ? 2 : 1}:${s.notStarted ? 0 : 1}:${_tvClimaxLevel(m)}`; }
// every hot court, deuce before climax — so a takeover can cycle through them
function _tvClimaxList() {
  return _tvLiveList()
    .map(m => ({ m, lv: _tvClimaxLevel(m) }))
    .filter(x => x.lv > 0)
    .sort((a, b) => b.lv - a.lv)
    .map(x => x.m);
}
// current score of a match: the game in play, plus whether game 2 is on
function _tvScore(m) {
  const lv = m.live || {};
  const g1r = Number(lv.g1R || 0), g1b = Number(lv.g1B || 0);
  const g2r = Number(lv.g2R || 0), g2b = Number(lv.g2B || 0);
  const g2on = !!(lv.g1Locked || g2r || g2b);
  return { g1r, g1b, g2r, g2b, g2on, cr: g2on ? g2r : g1r, cb: g2on ? g2b : g1b,
           notStarted: !g2on && !(g1r || g1b) };
}

function enterTvMode() {
  _tvActive = true;
  userRole = 'guest'; // read-only data access (same as spectator)
  document.body.classList.add('tv-mode');
  const ov = document.getElementById('loginOverlay'); if (ov) ov.style.display = 'none';
  const el = document.getElementById('tvView'); if (el) el.style.display = 'flex';
  _tvPanel = 0; _tvSecs = 0;
  _tvClimaxOn = false; _tvClimaxSecs = 0; _tvClimaxIdx = 0; _tvClimaxCooldown = 0;
  _tvBoardPage = 0; _tvBoardSecs = 0;
  renderTvPanel();
  _tvBindFsControls();
  requestTvWakeLock();
  _tvStartHealth();
  clearInterval(_tvTimer);
  _tvTimer = setInterval(_tvTick, 1000);
}

// One-second heartbeat: climax takeover (time-boxed) → board paging → rotate.
function _tvTick() {
  if (_tvEvent) return;                      // an announcement owns the screen
  if (_tvClimaxCooldown > 0) _tvClimaxCooldown--;
  const hot = _tvClimaxList();

  // ── in a climax takeover ──
  if (_tvClimaxOn) {
    // end it when the drama is over, or the time-box runs out (never freeze)
    if (!hot.length || _tvClimaxSecs >= TV_CLIMAX_MAX_SEC) {
      _tvClimaxOn = false; _tvClimaxSecs = 0;
      _tvClimaxCooldown = hot.length ? TV_CLIMAX_COOLDOWN_SEC : 0;  // let the grid breathe
      _tvSecs = 0; renderTvPanel(true);
      return;
    }
    _tvClimaxSecs++;
    const idx = Math.floor(_tvClimaxSecs / TV_CLIMAX_CYCLE_SEC) % hot.length;
    if (idx !== _tvClimaxIdx) { _tvClimaxIdx = idx; renderTvPanel(true); }
    return;
  }

  // ── start a takeover (only after the cooldown) ──
  if (hot.length && _tvClimaxCooldown === 0) {
    _tvClimaxOn = true; _tvClimaxSecs = 0; _tvClimaxIdx = 0;
    renderTvPanel(true);
    return;
  }

  // ── leaderboard paces its own pages, then hands rotation on ──
  if (TV_PANELS[_tvPanel] === 'board') {
    const pages = _tvBoardPages();
    if (pages > 1) {
      _tvBoardSecs++;
      if (_tvBoardSecs >= TV_BOARD_PAGE_SEC) {
        _tvBoardSecs = 0;
        if (_tvBoardPage + 1 >= pages) { _tvBoardPage = 0; _tvSecs = 0; _tvAdvancePanel(); }
        else { _tvBoardPage++; renderTvPanel(true); }
      }
      return;
    }
    // one page only → behave like an ordinary panel
  }

  // ── normal rotation ──
  _tvSecs++;
  if (_tvSecs >= TV_ROTATE_SEC) { _tvSecs = 0; _tvAdvancePanel(); }
}

function _tvAdvancePanel() {
  _tvPanel = (_tvPanel + 1) % TV_PANELS.length;
  if (TV_PANELS[_tvPanel] === 'board') { _tvBoardPage = 0; _tvBoardSecs = 0; }
  renderTvPanel();
}

// Called from updateUI on every data change: detect announce-worthy events,
// then render smoothly (patch values instead of rebuilding when possible).
function tvOnDataChange() {
  if (!_tvActive) return;
  _tvNoteActivity();
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

// Full standings (every player who has played), best first — the board pages
// through all of them so ranks outside the top few still reach the screen.
function _tvStandings() {
  const stats = {};
  (appState.players || []).forEach(p => { stats[p.id] = { id: p.id, name: p.name, team: p.team, pts: 0, w: 0, total: 0 }; });
  (appState.matchHistory || []).forEach(h => {
    [h.r1, h.r2].forEach(id => { if (stats[id]) { stats[id].pts += h.pRed || 0; if (h.rStat === 'W') stats[id].w++; stats[id].total++; } });
    [h.b1, h.b2].forEach(id => { if (stats[id]) { stats[id].pts += h.pBlue || 0; if (h.bStat === 'W') stats[id].w++; stats[id].total++; } });
  });
  return Object.values(stats).filter(p => p.total > 0).sort((a, b) => b.pts - a.pts || b.w - a.w);
}
// Rows that fit one screen height (so a page never spills into the footer). Photos and type scale
// with the viewport, so a height formula guesses wrong — 8 rows ran 86 px off a 1080p screen.
// Start from a guess (readable 5–8); _tvFitBoard() then measures the rendered rows and trims the
// count until the last row clears the footer, and remembers the result for this viewport size.
let _tvFit = { key: '', per: 0 };
function _tvViewKey() { return (window.innerWidth || 0) + 'x' + (window.innerHeight || 0); }
function _tvBoardPerPage() {
  if (_tvFit.per && _tvFit.key === _tvViewKey()) return _tvFit.per;
  const avail = (window.innerHeight || 720) - 260;   // heading + footer + padding
  return Math.max(5, Math.min(8, Math.floor(avail / 84)));
}
function _tvFitBoard(el) {
  for (let tries = 0; tries < 5; tries++) {          // trimming happens in one task — no flash
    const rows = el.querySelectorAll('.tv-board-row'), foot = el.querySelector('.tv-foot');
    if (!rows.length || !foot) return;
    const over = rows[rows.length - 1].getBoundingClientRect().bottom > foot.getBoundingClientRect().top - 2;
    if (!over || rows.length <= 3) return;
    _tvFit = { key: _tvViewKey(), per: rows.length - 1 };
    el.innerHTML = _tvBoardHtml() + _tvFootHtml();
  }
}
function _tvBoardPages() {
  return Math.max(1, Math.ceil(_tvStandings().length / _tvBoardPerPage()));
}

function _tvFootHtml() {
  const dots = TV_PANELS.map((_, i) => `<span class="tv-dot ${i === _tvPanel ? 'on' : ''}"></span>`).join('');
  return `<div class="tv-foot"><div class="tv-dots">${dots}</div><div class="tv-sync${_tvOfflineSince ? ' off' : ''}" id="tvSync">${_tvSyncInner()}</div><div class="tv-brand">Badminton Sports Day 2026</div></div>`;
}

// Team tag: the team's name with a shape beside the colour (triangle = red, circle = blue), so a
// team is never told apart by colour alone — glare, distance and black-and-white screens (A-04).
function _tvTag(side) {
  const name = side === 'red' ? (appState.redTeamName || 'RED TEAM') : (appState.blueTeamName || 'BLUE TEAM');
  return `<span class="tv-tag ${side}"><i class="tv-shape ${side}"></i><span class="tv-tag-name">${escHtml(name)}</span></span>`;
}
function _tvNamesKey() { return (appState.redTeamName || '') + '/' + (appState.blueTeamName || ''); }

// ── HTML builders ──────────────────────────────────────────────
function _tvBattleHtml() {
  const r = appState.globalScoreRed || 0, b = appState.globalScoreBlue || 0;
  const rn = appState.redTeamName || 'RED TEAM', bn = appState.blueTeamName || 'BLUE TEAM';
  return `<div class="tv-panel tv-battle">
    <div class="tv-heading">🏸 TEAM BATTLE</div>
    <div class="tv-battle-row">
      <div class="tv-team red ${r > b ? 'lead' : ''}"><div class="tv-team-name">${escHtml(rn)}</div><div class="tv-team-score">${r}</div></div>
      <div class="tv-vs">VS</div>
      <div class="tv-team blue ${b > r ? 'lead' : ''}"><div class="tv-team-name">${escHtml(bn)}</div><div class="tv-team-score">${b}</div></div>
    </div>
  </div>`;
}

// One court, big — used for a single live court and for a climax takeover.
function _tvVsHeroHtml(m, countHtml) {
  const s = _tvScore(m), cx = _tvClimaxLevel(m);
  const cxBadge = cx === 2 ? `<span class="tv-vs-climax deuce">⚡ DEUCE</span>`
                : cx === 1 ? `<span class="tv-vs-climax">🔥 CLIMAX</span>` : '';
  return `<div class="tv-panel tv-vs-panel${cx ? ' is-climax' : ''}" data-mid="${escHtml(m.id)}">
    <div class="tv-vs-top">
      <span class="tv-vs-court">🟢 ${_tvCourtPill(m)}${escHtml(m.id)}</span>
      ${m.round ? `<span class="tv-vs-round">ROUND ${escHtml(String(m.round))}</span>` : ''}
      <span class="tv-vs-game">${s.g2on ? 'GAME 2' : 'GAME 1'}</span>
      ${cxBadge}
    </div>
    <div class="tv-vs-row">
      <div class="tv-vs-side red">
        ${_tvTag('red')}
        <div class="tv-vs-faces">${[m.r1, m.r2].map(id => avatarHtml(id, 160)).join('')}</div>
        <div class="tv-vs-names red">${escHtml(_tvStrip(m.redNames))}</div>
      </div>
      <div class="tv-vs-mid">
        <div class="tv-vs-vs">VS</div>
        ${s.notStarted
          ? `<div class="tv-vs-nowplaying">NOW<br>PLAYING</div>`
          : `<div class="tv-vs-score"><span class="red">${s.cr}</span><span class="sep">:</span><span class="blue">${s.cb}</span></div>`}
        <div class="tv-vs-g1">${s.g2on ? `G1 · ${s.g1r}–${s.g1b}` : (s.notStarted ? 'พร้อมแข่ง' : '')}</div>
        ${_tvStatusHtml(m)}
      </div>
      <div class="tv-vs-side blue">
        ${_tvTag('blue')}
        <div class="tv-vs-faces">${[m.b1, m.b2].map(id => avatarHtml(id, 160)).join('')}</div>
        <div class="tv-vs-names blue">${escHtml(_tvStrip(m.blueNames))}</div>
      </div>
    </div>
    ${countHtml || ''}
  </div>`;
}

// How many cards go across, by court count: a lone card in the last row looks broken, so
// 4 courts are 2×2 and 5–6 are 3 across. Seven or more use compact cards (no faces), 4 across,
// so every court still fits on the screen. The CSS never lets a card get narrower than its
// content needs — on a small screen the grid simply uses fewer columns than asked for here.
function _tvGridPlan(n) {
  if (n <= 3) return { cols: Math.max(1, n), compact: false };
  if (n === 4) return { cols: 2, compact: false };
  if (n <= 6) return { cols: 3, compact: false };
  return { cols: 4, compact: true };
}

// All live courts at once — the default live view when 2+ courts are running.
function _tvGridHtml(live) {
  const plan = _tvGridPlan(live.length);
  const card = (m) => {
    const s = _tvScore(m), cx = _tvClimaxLevel(m);
    const cxCls = cx === 2 ? ' is-deuce' : cx === 1 ? ' is-climax' : '';
    const cxTag = cx === 2 ? ' · ⚡' : cx === 1 ? ' · 🔥' : '';
    return `<div class="tv-live-card${cxCls}" data-mid="${escHtml(m.id)}">
      ${_tvStatusHtml(m)}
      <div class="tv-live-id">🟢 ${_tvCourtPill(m)}${escHtml(m.id)} · ${s.g2on ? 'G2' : 'G1'}${cxTag}</div>
      <div class="tv-live-teams">
        <div class="tv-lt red">${_tvTag('red')}<span class="tv-faces">${[m.r1, m.r2].map(id => avatarHtml(id, 44)).join('')}</span>${escHtml(_tvStrip(m.redNames))}</div>
        <div class="tv-live-score">${s.notStarted
          ? `<span class="sep">—</span>`
          : `<span class="red">${s.cr}</span><span class="sep">:</span><span class="blue">${s.cb}</span>`}</div>
        <div class="tv-lt blue">${_tvTag('blue')}<span class="tv-faces">${[m.b1, m.b2].map(id => avatarHtml(id, 44)).join('')}</span>${escHtml(_tvStrip(m.blueNames))}</div>
      </div>
      <div class="tv-live-games">${s.g2on ? `G1 · ${s.g1r}–${s.g1b}` : (s.notStarted ? 'พร้อมแข่ง' : '')}</div>
    </div>`;
  };
  return `<div class="tv-panel">
    <div class="tv-heading">🟢 LIVE · ${live.length} ${live.length > 1 ? 'COURTS' : 'COURT'}</div>
    <div class="tv-live-grid${plan.compact ? ' is-compact' : ''}" style="--tv-cols:${plan.cols}">${live.map(card).join('')}</div>
  </div>`;
}

// Leaderboard, one page — pages scroll through the whole field so every player
// who has played eventually appears (photos included).
function _tvBoardHtml() {
  const all = _tvStandings();
  if (!all.length) {
    return `<div class="tv-panel"><div class="tv-heading">🏆 LEADERBOARD</div>
      <div class="tv-board"><div class="tv-empty">ยังไม่มีข้อมูล</div></div></div>`;
  }
  const per = _tvBoardPerPage();
  const pages = Math.max(1, Math.ceil(all.length / per));
  _tvBoardPage = ((_tvBoardPage % pages) + pages) % pages;
  const start = _tvBoardPage * per;
  const slice = all.slice(start, start + per);
  const medals = ['🥇', '🥈', '🥉'];
  const rows = slice.map((p, j) => {
    const rank = start + j;
    const wr = p.total ? Math.round(p.w / p.total * 100) : 0;
    return `<div class="tv-board-row">
      <div class="tv-rank">${medals[rank] || ('#' + (rank + 1))}</div>
      <div class="tv-board-face">${avatarHtml(p.id, 64)}</div>
      <div class="tv-pname ${p.team === 'Red' ? 'red' : 'blue'}">${escHtml(p.name)}</div>
      <div class="tv-pmeta"><i class="tv-shape ${p.team === 'Red' ? 'red' : 'blue'}"></i> ${p.team} · WR ${wr}%</div>
      <div class="tv-ppts">${p.pts}<span>pt</span></div>
    </div>`;
  }).join('');
  const pageTag = pages > 1
    ? `<div class="tv-board-page">อันดับ ${start + 1}–${start + slice.length} จาก ${all.length} · หน้า ${_tvBoardPage + 1}/${pages}</div>`
    : '';
  return `<div class="tv-panel">
    <div class="tv-heading">🏆 LEADERBOARD</div>${pageTag}
    <div class="tv-board">${rows}</div>
  </div>`;
}

// ── In-place patches: update the live numbers without rebuilding, so nothing
//    flashes and photos never reload between points. ──
function _tvPatchBattle(el) {
  const r = appState.globalScoreRed || 0, b = appState.globalScoreBlue || 0;
  const rs = el.querySelector('.tv-team.red .tv-team-score');  if (rs) rs.textContent = r;
  const bs = el.querySelector('.tv-team.blue .tv-team-score'); if (bs) bs.textContent = b;
  el.querySelector('.tv-team.red') ?.classList.toggle('lead', r > b);
  el.querySelector('.tv-team.blue')?.classList.toggle('lead', b > r);
}
function _tvPatchHero(el, m) {
  const s = _tvScore(m);
  const rEl = el.querySelector('.tv-vs-score .red');  if (rEl) rEl.textContent = s.cr;
  const bEl = el.querySelector('.tv-vs-score .blue'); if (bEl) bEl.textContent = s.cb;
  const g1El = el.querySelector('.tv-vs-g1'); if (g1El && s.g2on) g1El.textContent = `G1 · ${s.g1r}–${s.g1b}`;
  _tvPatchStatus();
}
function _tvPatchGrid(el, live) {
  live.forEach(m => {
    const card = el.querySelector(`.tv-live-card[data-mid="${m.id}"]`);
    if (!card) return;
    const s = _tvScore(m);
    const rEl = card.querySelector('.tv-live-score .red');  if (rEl) rEl.textContent = s.cr;
    const bEl = card.querySelector('.tv-live-score .blue'); if (bEl) bEl.textContent = s.cb;
    const gEl = card.querySelector('.tv-live-games'); if (gEl && s.g2on) gEl.textContent = `G1 · ${s.g1r}–${s.g1b}`;
  });
  _tvPatchStatus();
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

  // ── climax takeover: a hot court, big, cycling if several are hot ──
  if (_tvClimaxOn) {
    const hot = _tvClimaxList();
    if (hot.length) {
      const m = hot[_tvClimaxIdx % hot.length];
      const key = `hero|${_tvMKey(m)}|${_tvNamesKey()}`;
      if (!force && key === _tvLastKey && el.querySelector('.tv-vs-panel[data-mid]')) { _tvPatchHero(el, m); return; }
      _tvLastKey = key;
      const count = hot.length > 1 ? `<div class="tv-vs-count">🔥 ${ (_tvClimaxIdx % hot.length) + 1 } / ${hot.length} คอร์ตกำลังเดือด</div>` : '';
      el.innerHTML = _tvVsHeroHtml(m, count) + _tvFootHtml();
      return;
    }
    _tvClimaxOn = false;  // nothing hot anymore — fall through to normal panels
  }

  const panel = TV_PANELS[_tvPanel];
  let key, html;

  if (panel === 'battle') {
    key = 'battle';
    if (!force && key === _tvLastKey && el.querySelector('.tv-battle')) { _tvPatchBattle(el); return; }
    html = _tvBattleHtml();

  } else if (panel === 'live') {
    const live = _tvLiveList();
    if (!live.length) {
      key = 'live|empty';
      html = `<div class="tv-panel tv-vs-panel"><div class="tv-heading">🟢 LIVE</div><div class="tv-empty">ยังไม่มีแมตช์กำลังแข่ง</div></div>`;
    } else if (live.length === 1) {
      const m = live[0];
      key = `hero|${_tvMKey(m)}|${_tvNamesKey()}`;
      if (!force && key === _tvLastKey && el.querySelector('.tv-vs-panel[data-mid]')) { _tvPatchHero(el, m); return; }
      html = _tvVsHeroHtml(m);
    } else {
      key = 'grid|' + _tvNamesKey() + '|' + live.map(_tvMKey).join(',');
      if (!force && key === _tvLastKey && el.querySelector('.tv-live-grid')) { _tvPatchGrid(el, live); return; }
      html = _tvGridHtml(live);
    }

  } else {  // board — rebuilds per page (key holds page + the visible rows)
    const all = _tvStandings();
    const per = _tvBoardPerPage();
    const start = (((_tvBoardPage % Math.max(1, Math.ceil(all.length / per))) + Math.max(1, Math.ceil(all.length / per))) % Math.max(1, Math.ceil(all.length / per))) * per;
    key = 'board|' + _tvBoardPage + '|' + all.slice(start, start + per).map(p => p.id + ':' + p.pts).join(',');
    if (!force && key === _tvLastKey && el.querySelector('.tv-board')) return;  // unchanged page
    html = _tvBoardHtml();
  }

  _tvLastKey = key;
  el.innerHTML = html + _tvFootHtml();
  if (panel === 'board') _tvFitBoard(el);
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
  if (!_tvActive) return;
  if (!('wakeLock' in navigator)) { _tvWake = 'unsupported'; return; }   // the footer chip then says so
  try {
    _tvWakeLock = await navigator.wakeLock.request('screen');
    _tvWake = 'ok';
    _tvWakeLock.addEventListener('release', () => { _tvWakeLock = null; _tvWake = 'lost'; });
  } catch (e) { _tvWake = 'denied'; /* denied or not allowed in this context */ }
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