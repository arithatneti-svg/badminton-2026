// Reports + Dashboard scenarios (writer A6). Run with:
//   node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root <worktree> --label <name> --scenarios "<worktree>\scripts\audit\reports-scenarios" --only rep-
//
// The canned database has only 3-4 finished matches in the live season, but its archive holds a REAL season of 39 matches
// (3 rounds, 8 umpires, analysis + tags). These scenarios put that archived history on the live board so lists, charts and
// folds are shown at their real length. Nothing is written anywhere: board-mock.js keeps everything in memory.
import { BOARD, BOARD_TAB } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

const PH = ['390x844', '1280x800'];                       // phone + laptop
const PHT = ['390x844', '768x1024', '1280x800'];          // + tablet
const SMALL = ['320x568'];

// role + tab + which history: 'full' (the 39 archived matches), 'bench' (the 3 hand-made results), 'none' (nothing finished)
// stress: very long Thai names on players and on the match rows
async function repBench(page, { role = 'admin', tab = 'report', hist = 'full', stress = false, twoSeasons = false } = {}) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await A.wp5Setup();
    if (o.hist !== 'bench') {
      let list = [], red = 0, blue = 0;
      if (o.hist === 'full') {
        const arch = await loadSeasonArchives();
        const y = Object.keys(arch).sort().pop();
        list = JSON.parse(JSON.stringify(arch[y].matchHistory));
        red = arch[y].globalScoreRed || 0; blue = arch[y].globalScoreBlue || 0;
      }
      A.board.server.matchHistory = list;
      A.board.server.globalScoreRed = red;
      A.board.server.globalScoreBlue = blue;
    }
    if (o.stress) {
      const long = ['พิพัฒน์พงศ์ศักดิ์สิทธิ์ณัฐวุฒิชัยสกุล', 'Alexandria-Wolfeschlegelstein Montgomery', 'สมเด็จพระเจ้าอยู่หัวภูมิพลอดุลยเดช'];
      A.board.server.players.slice(0, 6).forEach((p, i) => { p.name = long[i % 3]; });
      (A.board.server.matchHistory || []).slice(0, 4).forEach((m, i) => {
        m.redNames = long[i % 3] + ' (G1) & ' + long[(i + 1) % 3] + ' (G2)';
        m.blueNames = long[(i + 2) % 3] + ' (G3) & ผู้เล่นชื่อยาวมากๆๆๆๆๆๆๆๆ (G2)';
      });
    }
    if (o.twoSeasons) {
      // a second archived season, so the Season compare tab has something to compare
      const arch = await loadSeasonArchives();
      const y = Object.keys(arch).sort().pop();
      const prev = JSON.parse(JSON.stringify(arch[y]));
      prev.seasonName = 'Sports Day 2025'; prev.year = '2025';
      prev.globalScoreRed = 61; prev.globalScoreBlue = 47;
      prev.matchHistory = prev.matchHistory.slice(0, 31).map((m, i) => Object.assign({}, m, { rStat: i % 3 === 0 ? 'L' : i % 7 === 0 ? 'D' : 'W', bStat: i % 3 === 0 ? 'W' : i % 7 === 0 ? 'D' : 'L' }));
      _cmpArchives = Object.assign({}, arch, { '2025': prev });
      await loadMasterPlayers();
      Object.values(_masterPlayers || {}).forEach((rec, i) => {
        if (!rec || !rec.seasons || i % 2) return;
        const cur = rec.seasons[y] || {};
        rec.seasons['2025'] = Object.assign({}, cur, { team: i % 6 === 0 ? (cur.team === 'Red' ? 'Blue' : 'Red') : cur.team, pts: (cur.pts || 0) + 3 + (i % 5), matchWin: (cur.matchWin || 0) + 1, matchLose: (cur.matchLose || 0) + (i % 2) });
      });
    }
    A.boardMock(A.board.server.ongoingMatches, 'guest');
    if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
    __setRole(o.role);
    const btn = document.getElementById('tab-' + o.tab);
    switchTab(o.tab, btn);
    await sleep(500);
  }, { role, tab, hist, stress, twoSeasons });
}

const mk = (id, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role: 'admin', viewports, setup }, extra);
const full = { full: true, maxHeight: 6000 };

export default [
  // ── Reports · Players ──
  mk('rep-players-main', PHT, async (page) => {
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('players', document.getElementById('rtab-players'))");
    await page.wait(600);
    await page.shot(''); await page.shot('full', full);
  }),
  mk('rep-players-320', SMALL, async (page) => {
    await repBench(page, { tab: 'report' });
    await page.wait(500);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 2600 });
  }),
  mk('rep-players-1440', ['1440x900'], async (page) => {
    await repBench(page, { tab: 'report' });
    await page.wait(500);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 3000 });
  }),
  mk('rep-players-fold', PH, async (page) => {            // the points chart fold, open
    await repBench(page, { tab: 'report' });
    await page.eval("document.querySelector('#rpanel-players .rp-fold').open = true");
    await page.wait(400);
    await page.eval("document.querySelector('#rpanel-players .rp-fold').scrollIntoView()");
    await page.wait(200);
    await page.shot('');
  }),
  mk('rep-players-export', PH, async (page) => {          // the export menu, open
    await repBench(page, { tab: 'report' });
    await page.eval("document.querySelector('#report .rp-export').open = true");
    await page.wait(300);
    await page.shot('');
  }),
  mk('rep-players-sorted-perf', PH, async (page) => {      // sorted by PERF, group G1 only, team Red
    await repBench(page, { tab: 'report' });
    await page.eval("(() => { setGroupFilter('1'); sortPlayers('perf'); })()");
    await page.wait(400);
    await page.shot('');
  }),
  mk('rep-players-none', PH, async (page) => {            // a filter that matches nobody
    await repBench(page, { tab: 'report' });
    await page.type('#reportSearch', 'zzzz');
    await page.wait(300);
    await page.shot('');
  }),
  mk('rep-players-nodata', PH, async (page) => {          // season not started: 54 players, no finished match
    await repBench(page, { tab: 'report', hist: 'none' });
    await page.wait(400);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 2400 });
  }),
  mk('rep-players-long', PHT, async (page) => {           // 30+ character names
    await repBench(page, { tab: 'report', stress: true });
    await page.wait(400);
    await page.shot('');
  }),

  // ── Reports · Matches ──
  mk('rep-matches-main', PHT, async (page) => {
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(600);
    await page.shot(''); await page.shot('full', full);
  }),
  mk('rep-matches-320', SMALL, async (page) => {
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(500);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 2400 });
  }),
  mk('rep-matches-open', PH, async (page) => {            // a row expanded (first one with tags + analysis)
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(400);
    await page.eval("(() => { const m = appState.matchHistory.find(x => x.analysis && x.analysis.tags && x.analysis.tags.length > 1) || appState.matchHistory[0]; toggleMatchDetail(m.id); document.getElementById('mrow-' + m.id).scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); })()");
    await page.wait(300);
    await page.shot('');
  }),
  mk('rep-matches-umpire', PH, async (page) => {          // the umpire workload fold
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(400);
    await page.eval("(() => { const f = document.querySelector('#rpanel-matches .rp-fold'); f.open = true; f.scrollIntoView(); })()");
    await page.wait(300);
    await page.shot('');
  }),
  mk('rep-matches-filtered', PH, async (page) => {        // round 2 + one tag chip on
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(300);
    await page.eval("(() => { const r = document.getElementById('perfFilterRound'); r.value = '2'; r.dispatchEvent(new Event('change')); const b = document.querySelector('#perfTagFilterRow .rp-tagpill'); if (b) b.click(); })()");
    await page.wait(400);
    await page.shot('');
  }),
  mk('rep-matches-none', PH, async (page) => {
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.type('#matchSearch', 'zzzz');
    await page.wait(300);
    await page.shot('');
  }),
  mk('rep-matches-nodata', PH, async (page) => {
    await repBench(page, { tab: 'report', hist: 'none' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(400);
    await page.shot('');
  }),
  mk('rep-matches-long', PHT, async (page) => {
    await repBench(page, { tab: 'report', stress: true });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(400);
    await page.shot('');
  }),

  // ── Reports · Season compare ──
  mk('rep-compare-main', PHT, async (page) => {
    await repBench(page, { tab: 'report', twoSeasons: true });
    await page.eval("switchReportTab('compare', document.getElementById('rtab-compare'))");
    await page.wait(900);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 4000 });
  }),
  mk('rep-compare-320', SMALL, async (page) => {
    await repBench(page, { tab: 'report', twoSeasons: true });
    await page.eval("switchReportTab('compare', document.getElementById('rtab-compare'))");
    await page.wait(900);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 3000 });
  }),
  mk('rep-compare-single', PH, async (page) => {         // one season only: "compare after the first archive"
    await repBench(page, { tab: 'report' });
    await page.eval("switchReportTab('compare', document.getElementById('rtab-compare'))");
    await page.wait(900);
    await page.shot('');
  }),

  // ── Dashboard ──
  mk('rep-dash-main', PHT, async (page) => {
    await repBench(page, { tab: 'dashboard' });
    await page.wait(900);
    await page.shot(''); await page.shot('full', full);
  }),
  mk('rep-dash-320', SMALL, async (page) => {
    await repBench(page, { tab: 'dashboard' });
    await page.wait(700);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 4200 });
  }),
  mk('rep-dash-1440', ['1440x900'], async (page) => {
    await repBench(page, { tab: 'dashboard' });
    await page.wait(700);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 3200 });
  }),
  mk('rep-dash-nodata', PH, async (page) => {            // nothing finished yet
    await repBench(page, { tab: 'dashboard', hist: 'none' });
    await page.wait(700);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 4000 });
  }),
  mk('rep-dash-bench', PH, async (page) => {             // the 3-result bench every other writer sees
    await repBench(page, { tab: 'dashboard', hist: 'bench' });
    await page.wait(700);
    await page.shot('');
  }),
  mk('rep-dash-long', PH, async (page) => {
    await repBench(page, { tab: 'dashboard', stress: true });
    await page.wait(700);
    await page.shot('');
  }),
];
