// TV / projector mode (/?view=tv): the rotating panels. The rotation timer is stopped and one panel is drawn by hand,
// so a shot is of ONE panel. Panels are picked by name (the live panel used to be called "vs" in the notes, it is "live"
// in the code; either name works so these scenarios keep working if it is renamed back).
import { TV } from './_lib.mjs';

const base = { app: 'tv', path: '/?view=tv', viewports: TV };

// stop the rotation, pick the panel, put mock courts / results on the screen
// `quiet` = how many of the live courts have had no point for 11+ minutes (the "ไม่มีความเคลื่อนไหว" tag); the others scored 4 s ago
async function show(page, { panel, courts = 0, queued = 0, court = true, history = 0, longest = false, quiet = 0 }) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try { dbRef.off(); } catch (e) { /* the canned database never pushes anyway */ }
    A.guard();
    clearInterval(_tvTimer);
    clearInterval(_tvHealthTimer);   // the footer's sync chip and the offline bar stay as drawn
    _tvEvent = null; _tvClimaxOn = false; _tvClimaxCooldown = 99999;
    const idx = o.panel.map((n) => TV_PANELS.indexOf(n)).find((i) => i >= 0);
    _tvPanel = idx === undefined ? 0 : idx;
    appState.ongoingMatches = o.courts + o.queued ? A.mockMatches(o.courts, { queued: o.queued, court: o.court, longest: o.longest }) : [];
    const now = Date.now();
    appState.ongoingMatches.forEach((m, i) => { if (m && m.live) m.live.lastAt = now - (i < o.quiet ? 700000 : 4000); });
    if (o.history) appState.matchHistory = A.mockHistory(o.history);
    _tvBoardPage = 0;
    renderTvPanel(true);
    await sleep(500);
  }, { panel, courts, queued, court, history, longest, quiet });
}

export default [
  Object.assign({ id: 'tv-battle', setup: async (page) => { await show(page, { panel: ['battle'] }); } }, base),
  Object.assign({ id: 'tv-vs', setup: async (page) => { await show(page, { panel: ['vs', 'live'], courts: 1 }); } }, base),   // one court, big
  Object.assign({ id: 'tv-live-grid', setup: async (page) => { await show(page, { panel: ['live'], courts: 4 }); } }, base),
  Object.assign({ id: 'tv-live-quiet', setup: async (page) => { await show(page, { panel: ['live'], courts: 4, quiet: 2 }); } }, base),   // two courts "no activity for N min"
  Object.assign({ id: 'tv-live-6', setup: async (page) => { await show(page, { panel: ['live'], courts: 6, queued: 2 }); } }, base),
  Object.assign({ id: 'tv-10-courts', setup: async (page) => { await show(page, { panel: ['live'], courts: 10 }); } }, base),
  Object.assign({ id: 'tv-board', setup: async (page) => { await show(page, { panel: ['board'], history: 30 }); } }, base),
  Object.assign({ id: 'tv-idle', setup: async (page) => { await show(page, { panel: ['live'], courts: 0 }); } }, base),
  Object.assign({ id: 'tv-climax', setup: async (page) => {   // a court at 20–19 takes the screen
    await show(page, { panel: ['live'], courts: 2 });
    await page.eval(`(() => { const m = appState.ongoingMatches[0]; m.live.g1R = 20; m.live.g1B = 19; _tvClimaxOn = true; _tvClimaxIdx = 0; _tvClimaxCooldown = 99999; renderTvPanel(true); })()`);
    await page.wait(400);
  } }, base),
  Object.assign({ id: 'tv-event-finished', setup: async (page) => {   // "match finished" announcement
    await show(page, { panel: ['live'], courts: 2, history: 3 });
    await page.eval(`(() => { const h = appState.matchHistory[0]; clearTimeout(_tvEventTimer); _tvEvent = { type: 'finished', m: Object.assign({}, h, { rStat: 'W', bStat: 'L', game1: '21:15', game2: '21:17' }) }; renderTvPanel(true); })()`);
    await page.wait(300);
  } }, base),
  Object.assign({ id: 'tv-event-game1', setup: async (page) => {   // "end of game 1" flash
    await show(page, { panel: ['live'], courts: 2 });
    await page.eval(`(() => { const m = appState.ongoingMatches[1]; clearTimeout(_tvEventTimer); _tvEvent = { type: 'game1', m }; renderTvPanel(true); })()`);
    await page.wait(300);
  } }, base),
  Object.assign({ id: 'tv-stale', setup: async (page) => {   // connection lost: the red bar and the frozen sync chip
    await show(page, { panel: ['live'], courts: 4 });
    // _tvProbeBusy keeps the page from probing again (the probe is answered from the canned data and would clear the alarm)
    await page.eval('(() => { _tvProbeBusy = true; _tvProbeFails = 3; _tvAliveAt = Date.now() - 180000; _tvOfflineSince = _tvAliveAt; _tvHealth(); })()');
    await page.wait(300);
  } }, base),
  Object.assign({ id: 'tv-loading', hold: true, setup: async (page) => { await page.wait(500); } }, base),
];
