// Extra TV scenarios for the v3 redesign: 1..10 live courts at the three screen sizes that matter (55-inch 1080p, 720p projector, 1440p monitor),
// long names, courts with "no activity" tags, hot courts. Run with:
//   node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\tv" --label tv-extra --scenarios "C:\Badminton 2026\ux-v3\tv\scripts\audit\tv-scenarios" --only tv-courts
// Each scenario also notes the grid metrics (overlap with heading / footer, fit class) so the manifest carries the numbers.
const VP = ['1920x1080', '1280x720', '2560x1440'];
const base = { app: 'tv', path: '/?view=tv', viewports: VP };

async function show(page, { panel = ['live'], courts = 0, court = true, history = 0, longest = false, quiet = 0, hot = 0, g2 = -1 }) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try { dbRef.off(); } catch (e) { /* the canned database never pushes anyway */ }
    A.guard();
    clearInterval(_tvTimer);
    clearInterval(_tvHealthTimer);
    _tvEvent = null; _tvClimaxOn = false; _tvClimaxCooldown = 99999;
    const idx = o.panel.map((n) => TV_PANELS.indexOf(n)).find((i) => i >= 0);
    _tvPanel = idx === undefined ? 0 : idx;
    appState.ongoingMatches = o.courts ? A.mockMatches(o.courts, { court: o.court, longest: o.longest }) : [];
    const now = Date.now();
    appState.ongoingMatches.forEach((m, i) => {
      if (!m || !m.live) return;
      m.live.lastAt = now - (i < o.quiet ? 700000 : 4000);
      if (i < o.hot) { m.live.g1R = 20; m.live.g1B = 19; m.live.g1Locked = false; m.live.g2R = 0; m.live.g2B = 0; }
      if (o.g2 >= 0 && i >= o.g2) { m.live.g1R = 21; m.live.g1B = 17; m.live.g1Locked = true; m.live.g2R = 9 + i; m.live.g2B = 7 + i; }
    });
    if (o.history) appState.matchHistory = A.mockHistory(o.history);
    _tvBoardPage = 0;
    renderTvPanel(true);
    await sleep(500);
  }, { panel, courts, court, history, longest, quiet, hot, g2 });
}
async function note(page) {
  const j = await page.eval('JSON.stringify(__audit.tvGridMetrics())');
  page.note(String(j));
}

const out = [];
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n, setup: async (page) => { await show(page, { courts: n }); await note(page); } }, base));
}
// long Thai / Latin names, the worst case for wrapping
for (const n of [3, 5, 6, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n + '-long', setup: async (page) => { await show(page, { courts: n, longest: true }); await note(page); } }, base));
}
// every court tagged "no activity", some in game 2, one hot: the busiest the grid gets
for (const n of [5, 6, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n + '-busy', setup: async (page) => { await show(page, { courts: n, quiet: n, hot: 1, g2: Math.floor(n / 2) }); await note(page); } }, base));
}
out.push(Object.assign({ id: 'tv-board-big', setup: async (page) => { await show(page, { panel: ['board'], history: 30 }); } }, base));
out.push(Object.assign({ id: 'tv-battle-lead', setup: async (page) => {
  await show(page, { panel: ['battle'] });
  await page.eval('(() => { appState.globalScoreRed = 12; appState.globalScoreBlue = 9; renderTvPanel(true); })()');
  await page.wait(300);
} }, base));
export default out;
