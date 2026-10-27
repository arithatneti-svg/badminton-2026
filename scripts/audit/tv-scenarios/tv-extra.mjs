// Extra TV scenarios for the v3 redesign: 1..10 live courts at the three screen sizes that matter (55-inch 1080p, 720p projector, 1440p monitor),
// long names, courts with "no activity" tags, hot courts. Run with:
//   node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\tv" --label tv-extra --scenarios "C:\Badminton 2026\ux-v3\tv\scripts\audit\tv-scenarios" --only tv-courts
// Each scenario also notes the grid metrics (overlap with heading / footer, fit class) so the manifest carries the numbers.
import { base, show, noteGrid, noteHero, noteAudit } from './_tv-lib.mjs';

// a pair name far longer than the screen has room for: Thai without spaces inside a word, Latin with a hyphen
const LONG = { red: 'ปรีชาพัฒน์ศรีสุวรรณพงศ์ชัย & Christopher Montgomery-Wellington', blue: 'ณัฐธิดาวรรณวิสุทธิ์เจริญสุข & Bartholomew Featherstonehaugh' };

const out = [];
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n, setup: async (page) => { await show(page, { courts: n }); await (n === 1 ? noteHero(page) : noteGrid(page)); await noteAudit(page); } }, base));
}
// the longest names in the data, then names of 30+ characters, the worst case for wrapping
for (const n of [3, 5, 6, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n + '-long', setup: async (page) => { await show(page, { courts: n, longest: true }); await noteGrid(page); } }, base));
}
for (const n of [1, 2, 4, 5, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n + '-names', setup: async (page) => { await show(page, { courts: n, names: LONG }); await (n === 1 ? noteHero(page) : noteGrid(page)); } }, base));
}
// every court tagged "no activity", some in game 2, one hot: the busiest the grid gets
for (const n of [5, 6, 10]) {
  out.push(Object.assign({ id: 'tv-courts-' + n + '-busy', setup: async (page) => { await show(page, { courts: n, quiet: n, hot: 1, g2: Math.floor(n / 2) }); await noteGrid(page); await noteAudit(page); } }, base));
}
// states of a court the plain scenarios do not reach: ready (no point yet), game 2 + status + hot on the hero, two hot courts taking turns
const zero = (n) => `(() => { appState.ongoingMatches.slice(0, ${n}).forEach((m) => { m.live.g1R = 0; m.live.g1B = 0; m.live.g2R = 0; m.live.g2B = 0; m.live.g1Locked = false; }); renderTvPanel(true); })()`;
out.push(Object.assign({ id: 'tv-ready-grid', setup: async (page) => { await show(page, { courts: 4 }); await page.eval(zero(2)); await page.wait(200); await noteGrid(page); } }, base));
out.push(Object.assign({ id: 'tv-ready-10', setup: async (page) => { await show(page, { courts: 10 }); await page.eval(zero(3)); await page.wait(200); await noteGrid(page); } }, base));
out.push(Object.assign({ id: 'tv-ready-hero', setup: async (page) => { await show(page, { courts: 1 }); await page.eval(zero(1)); await page.wait(200); await noteHero(page); } }, base));
out.push(Object.assign({ id: 'tv-courts-1-busy', setup: async (page) => { await show(page, { courts: 1, quiet: 1, hot: 0, g2: 0 }); await page.eval('(() => { const m = appState.ongoingMatches[0]; m.live.g2R = 20; m.live.g2B = 19; renderTvPanel(true); })()'); await page.wait(200); await noteHero(page); } }, base));
out.push(Object.assign({ id: 'tv-climax-2', setup: async (page) => {
  await show(page, { courts: 3, hot: 2 });
  await page.eval('(() => { _tvClimaxOn = true; _tvClimaxIdx = 1; _tvClimaxCooldown = 99999; renderTvPanel(true); })()');
  await page.wait(300);
  await noteHero(page);
} }, base));
// custom team names (the setup lets the organiser rename the two teams) and matches without a court number
const TEAMS = `(() => { appState.redTeamName = 'ทีมสีแดงผู้พิชิตสนามแบดมินตันปี 2026'; appState.blueTeamName = 'Blue Thunder Badminton Club'; renderTvPanel(true); })()`;
out.push(Object.assign({ id: 'tv-teamnames-battle', setup: async (page) => { await show(page, { panel: ['battle'] }); await page.eval(TEAMS); await page.wait(200); await noteAudit(page); } }, base));
out.push(Object.assign({ id: 'tv-teamnames-hero', setup: async (page) => { await show(page, { courts: 1 }); await page.eval(TEAMS); await page.wait(200); await noteHero(page); } }, base));
out.push(Object.assign({ id: 'tv-teamnames-4', setup: async (page) => { await show(page, { courts: 4 }); await page.eval(TEAMS); await page.wait(200); await noteGrid(page); } }, base));
out.push(Object.assign({ id: 'tv-teamnames-6', setup: async (page) => { await show(page, { courts: 6 }); await page.eval(TEAMS); await page.wait(200); await noteGrid(page); } }, base));
out.push(Object.assign({ id: 'tv-nocourt-4', setup: async (page) => { await show(page, { courts: 4, court: false, quiet: 1 }); await noteGrid(page); await noteAudit(page); } }, base));
out.push(Object.assign({ id: 'tv-nocourt-1', setup: async (page) => { await show(page, { courts: 1, court: false }); await noteHero(page); await noteAudit(page); } }, base));
// the other panels, with the type-size and contrast audit
out.push(Object.assign({ id: 'tv-panel-board', setup: async (page) => { await show(page, { panel: ['board'], history: 30 }); await noteAudit(page); } }, base));
out.push(Object.assign({ id: 'tv-panel-battle', setup: async (page) => {
  await show(page, { panel: ['battle'] });
  await page.eval('(() => { appState.globalScoreRed = 12; appState.globalScoreBlue = 9; renderTvPanel(true); })()');
  await page.wait(300);
  await noteAudit(page);
} }, base));
out.push(Object.assign({ id: 'tv-panel-idle', setup: async (page) => { await show(page, { courts: 0 }); await noteAudit(page); } }, base));
out.push(Object.assign({ id: 'tv-panel-finished', setup: async (page) => {
  await show(page, { courts: 2, history: 3 });
  await page.eval(`(() => { const h = appState.matchHistory[0]; clearTimeout(_tvEventTimer); _tvEvent = { type: 'finished', m: Object.assign({}, h, { rStat: 'L', bStat: 'W', game1: '15:21', game2: '19:21' }) }; renderTvPanel(true); })()`);
  await page.wait(300);
  await noteAudit(page);
} }, base));
out.push(Object.assign({ id: 'tv-panel-game1', setup: async (page) => {
  await show(page, { courts: 2 });
  await page.eval(`(() => { const m = appState.ongoingMatches[1]; m.redNames = ${JSON.stringify(LONG.red)}; clearTimeout(_tvEventTimer); _tvEvent = { type: 'game1', m }; renderTvPanel(true); })()`);
  await page.wait(300);
  await noteAudit(page);
} }, base));
out.push(Object.assign({ id: 'tv-panel-stale', setup: async (page) => {
  await show(page, { courts: 5, quiet: 1 });
  await page.eval('(() => { _tvProbeBusy = true; _tvProbeFails = 3; _tvAliveAt = Date.now() - 180000; _tvOfflineSince = _tvAliveAt; _tvHealth(); })()');
  await page.wait(300);
  await noteGrid(page);
  await noteAudit(page);
} }, base));
export default out;
