// Behaviour checks for the TV (not pictures): the in-place patches, the rebuild keys and the status tag still work with the new markup.
// Each scenario notes a JSON object of booleans; every value must be true. Run with --only tv-behave.
import { base, show } from './_tv-lib.mjs';

const one = (id, js, opts) => Object.assign({
  id,
  viewports: ['1920x1080'],
  setup: async (page) => {
    await show(page, opts);
    page.note(String(await page.eval(js)));
  },
}, { app: base.app, path: base.path });

export default [
  // a point on a live court: the digit changes in place (same DOM node, ds-pop), the other cards are not touched
  one('tv-behave-grid', `(() => {
    const el = document.getElementById('tvView'), card = el.querySelector('.tv-live-card'), keep = el.querySelector('.tv-live-grid');
    keep.__t = 1; card.__t = 1;
    const m = appState.ongoingMatches[0], r0 = card.querySelector('.tv-live-score .red').textContent;
    m.live.g1R = Number(m.live.g1R) + 1; renderTvPanel();
    const red = el.querySelector('.tv-live-card .tv-live-score .red');
    const out = { digitUpdated: red.textContent === String(m.live.g1R) && red.textContent !== r0, popped: red.classList.contains('ds-pop'),
      gridKept: el.querySelector('.tv-live-grid').__t === 1, cardKept: el.querySelector('.tv-live-card').__t === 1 };
    // the status tag appears and disappears without a rebuild
    const tag = () => el.querySelector('.tv-live-card .tv-status');
    out.statusHiddenAtFirst = tag().hidden === true;
    m.live.lastAt = Date.now() - 700000; _tvPatchStatus();
    out.statusShown = tag().hidden === false && /ไม่มีความเคลื่อนไหว/.test(tag().querySelector('.tv-status-t').textContent) && tag().classList.contains('stuck') && /\\d+ นาที/.test(tag().querySelector('.tv-status-s').textContent);
    m.live.lastAt = Date.now(); m.live.isPaused = true; m.live.pauseStartedAt = Date.now() - 1000; _tvPatchStatus();
    out.pauseTag = tag().hidden === false && tag().querySelector('.tv-status-t').textContent === 'พักเกม' && !tag().classList.contains('stuck');
    m.live.isPaused = false; _tvPatchStatus();
    out.statusGone = tag().hidden === true;
    out.stillSameGrid = el.querySelector('.tv-live-grid').__t === 1;
    return JSON.stringify(out);
  })()`, { courts: 3 }),

  // one live court = the hero: patched in place; a first point rebuilds it (dashes -> digits)
  one('tv-behave-hero', `(() => {
    const el = document.getElementById('tvView'), out = {};
    out.hero = !!el.querySelector('.tv-vs-panel[data-mid]') && !!el.querySelector('.tv-vs-score .red') && !!el.querySelector('.tv-vs-score .blue');
    el.querySelector('.tv-vs-panel').__t = 1;
    const m = appState.ongoingMatches[0]; m.live.g1B = Number(m.live.g1B) + 2; renderTvPanel();
    out.patched = el.querySelector('.tv-vs-score .blue').textContent === String(m.live.g1B) && el.querySelector('.tv-vs-panel').__t === 1;
    // ready: no point yet -> dashes, "NOW PLAYING" and "พร้อมแข่ง"; the first point rebuilds with digits
    m.live.g1R = 0; m.live.g1B = 0; m.live.g2R = 0; m.live.g2B = 0; m.live.g1Locked = false; renderTvPanel();
    out.readyDashes = !el.querySelector('.tv-vs-score .red') && /NOW PLAYING/.test(el.textContent) && /พร้อมแข่ง/.test(el.textContent);
    m.live.g1R = 1; renderTvPanel();
    out.firstPoint = el.querySelector('.tv-vs-score .red').textContent === '1' && !/NOW PLAYING/.test(el.textContent);
    // game 2 starts (g1Locked): the recap shows game 1's result and the key changes (a rebuild), then patches keep it current
    m.live.g1R = 21; m.live.g1B = 18; m.live.g1Locked = true; m.live.g2R = 2; m.live.g2B = 1; renderTvPanel();
    out.game2 = /GAME 2/.test(el.textContent) && /เกม 1 · 21–18/.test(el.querySelector('.tv-vs-g1').textContent) && el.querySelector('.tv-vs-score .red').textContent === '2';
    return JSON.stringify(out);
  })()`, { courts: 1 }),

  // team battle: digits and the lead chip follow the totals in place
  one('tv-behave-battle', `(() => {
    const el = document.getElementById('tvView'), out = {};
    appState.globalScoreRed = 3; appState.globalScoreBlue = 3; renderTvPanel(true);
    el.querySelector('.tv-battle').__t = 1;
    out.tie = !el.querySelector('.tv-team.lead');
    appState.globalScoreRed = 5; renderTvPanel();
    out.redLeads = el.querySelector('.tv-team.red').classList.contains('lead') && !el.querySelector('.tv-team.blue').classList.contains('lead') && el.querySelector('.tv-team.red .tv-team-score').textContent === '5';
    appState.globalScoreBlue = 9; renderTvPanel();
    out.blueLeads = el.querySelector('.tv-team.blue').classList.contains('lead') && !el.querySelector('.tv-team.red').classList.contains('lead');
    out.patchedInPlace = el.querySelector('.tv-battle').__t === 1;
    return JSON.stringify(out);
  })()`, { panel: ['battle'] }),

  // an announcement is not rebuilt on every data tick (it would fade in again), and ends where the timer says
  one('tv-behave-event', `(() => {
    const el = document.getElementById('tvView'), out = {};
    const m = appState.ongoingMatches[0]; clearTimeout(_tvEventTimer);
    _tvEvent = { type: 'game1', m }; renderTvPanel(true);
    el.querySelector('.tv-event').__t = 1;
    renderTvPanel(); renderTvPanel();
    out.notRebuilt = el.querySelector('.tv-event').__t === 1;
    out.game1Text = /END OF GAME 1/.test(el.textContent) && /ROUND/.test(el.textContent);
    _tvEvent = null; renderTvPanel(true);
    out.backToPanel = !el.querySelector('.tv-event') && !!el.querySelector('.tv-live-grid, .tv-vs-panel');
    return JSON.stringify(out);
  })()`, { courts: 2 }),

  // the heartbeat: rotation battle -> live -> board with the footer dots following; a hot court takes the screen, two hot courts cycle, the time box ends it
  one('tv-behave-rotation', `(() => {
    const el = document.getElementById('tvView'), out = {}, dot = () => [...el.querySelectorAll('.tv-dot')].findIndex((d) => d.classList.contains('on'));
    appState.ongoingMatches.forEach((m, i) => { if (i < 2) { m.live.g1R = 20; m.live.g1B = 19; m.live.g1Locked = false; } else { m.live.g1R = 5; m.live.g1B = 3; } });
    _tvClimaxCooldown = 0; _tvPanel = 0; _tvSecs = 0; _tvClimaxOn = false; renderTvPanel(true);
    out.startsOnBattle = !!el.querySelector('.tv-battle') && dot() === 0;
    _tvTick();                                   // two courts are hot: the first one takes the screen
    out.takeover = _tvClimaxOn && !!el.querySelector('.tv-vs-panel') && /1 \\/ 2/.test(el.querySelector('.tv-heading').textContent) && /DEUCE/.test(el.textContent);
    for (let i = 0; i < 12; i++) _tvTick();      // TV_CLIMAX_CYCLE_SEC: the second hot court
    out.cycles = /2 \\/ 2/.test(el.querySelector('.tv-heading').textContent) && _tvClimaxIdx === 1;
    for (let i = 0; i < 20; i++) _tvTick();      // past TV_CLIMAX_MAX_SEC: the takeover ends, the cooldown starts
    out.timeBoxed = !_tvClimaxOn && _tvClimaxCooldown > 0 && !el.querySelector('.tv-vs-panel');
    appState.ongoingMatches.forEach((m) => { m.live.g1R = 5; m.live.g1B = 3; });
    _tvClimaxCooldown = 0; _tvPanel = 0; _tvSecs = 0; renderTvPanel(true);
    for (let i = 0; i < 14; i++) _tvTick();      // TV_ROTATE_SEC: battle -> live (4 courts: the grid)
    out.toLive = !!el.querySelector('.tv-live-grid') && dot() === 1;
    for (let i = 0; i < 14; i++) _tvTick();      // live -> board
    out.toBoard = !!el.querySelector('.tv-board') && dot() === 2;
    return JSON.stringify(out);
  })()`, { courts: 4 }),

  // the health check: the red bar and the sync chip when the connection is lost, gone again when it is back; the wake-lock warning in the chip
  one('tv-behave-health', `(() => {
    const el = document.getElementById('tvView'), bar = document.getElementById('tvStale'), out = {};
    _tvProbeBusy = true; _tvHealth();
    out.fineAtFirst = bar.hidden === true && !document.getElementById('tvSync').classList.contains('off');
    _tvProbeFails = 3; _tvAliveAt = Date.now() - 180000; _tvOfflineSince = _tvAliveAt; _tvHealth();
    out.barShown = bar.hidden === false && /ข้อมูลอาจไม่ล่าสุด — สัญญาณหลุดตั้งแต่ \\d\\d:\\d\\d/.test(bar.textContent) && !!bar.querySelector('svg') && bar.getAttribute('role') === 'alert';
    out.chipOff = document.getElementById('tvSync').classList.contains('off') && /ซิงก์ \\d\\d:\\d\\d:\\d\\d/.test(document.getElementById('tvSync').textContent);
    const before = bar.innerHTML; _tvHealth(); out.noRewrite = bar.innerHTML === before;
    _tvProbeFails = 0; _tvAliveAt = Date.now(); _tvOfflineSince = 0; _tvHealth();
    out.recovered = bar.hidden === true && !document.getElementById('tvSync').classList.contains('off');
    _tvWake = 'unsupported'; _tvHealth();
    out.wakeWarn = !!document.querySelector('#tvSync .tv-sync-warn') && /จออาจดับเอง/.test(document.getElementById('tvSync').textContent);
    return JSON.stringify(out);
  })()`, { courts: 3 }),

  // the leaderboard pages through the standings and an empty one shows the empty state
  one('tv-behave-board', `(() => {
    const el = document.getElementById('tvView'), out = {};
    const rows = () => [...el.querySelectorAll('.tv-board-row')];
    out.firstPage = rows().length >= 4 && rows()[0].querySelector('.tv-rank').textContent === '1';
    const per = rows().length; _tvBoardPage = 1; renderTvPanel(true);
    out.secondPage = rows().length > 0 && rows()[0].querySelector('.tv-rank').textContent === String(per + 1);
    out.pageChip = /หน้า 2\\//.test(el.querySelector('.tv-board-page').textContent);
    appState.matchHistory = []; _tvBoardPage = 0; renderTvPanel(true);
    out.empty = !!el.querySelector('.tv-board.is-empty') && /ยังไม่มีข้อมูล/.test(el.textContent);
    return JSON.stringify(out);
  })()`, { panel: ['board'], history: 30 }),
];
