// A2 viewer: the states the standard bench does not reach (load with --scenarios <this folder>)
// stress = 10 live courts, 30+ character names, deuce / close finish / ready / paused / stuck, 30-29, a 12-row results log with tags
// empty = nothing to show (Scoreboard idle board, Ongoing, Finished) · g1toast = "game 1 done" note · fsnav = the full-screen bar
const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);

const LONG = ['สมชาย ศรีสุวรรณพงศ์ไพศาล', 'อรทัยรัตน์ ทองประเสริฐสุขเกษม', 'ปริญญาภรณ์ วงศ์สกุลเจริญชัย', 'Christopher Montgomery-Smith'];

async function stress(page, { role, tab }) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await A.wp5Setup();
    const now = Date.now(), ms = A.boardMatches(10), base = A.boardMatches(12);
    const live = (g1R, g1B, g2R = 0, g2B = 0, lock = false, extra = {}) => Object.assign({ g1R, g1B, g2R, g2B, g1Locked: lock, isPaused: false, elapsedMs: 0, lastAt: now - 4000 }, extra);
    const spec = [
      { live: live(20, 20) }, { live: live(18, 17) }, { live: live(21, 19, 29, 30, true) }, { ready: true },
      { live: live(11, 9, 0, 0, false, { isPaused: true, pauseStartedAt: now - 15 * 60000 }) },
      { live: live(5, 12, 0, 0, false, { lastAt: now - 25 * 60000 }) }, { live: live(21, 4, 8, 11, true), pot: { g2B_pot: true } },
      { live: live(0, 0) }, { live: live(30, 29, 0, 0, false) }, { live: live(21, 10, 3, 3, true) },
    ];
    ms.forEach((m, i) => {
      const s = spec[i];
      m.court = i + 1; m.umpire = 'กรรมการ ' + (i + 1); m.claimedAt = now - 1500000; m.round = String(1 + (i % 3));
      if (!s.ready) { m.timerStartedAt = now - (i % 4) * 11 * 60000 - 90000; m.live = s.live; if (s.pot) m.potFlags = s.pot; }
      if (i % 2 === 0) { m.redNames = o.long[0] + ' (G1) & ' + o.long[1] + ' (G2)'; m.blueNames = o.long[2] + ' (G2) & ' + o.long[3] + ' (G1)'; }
    });
    const tags = [
      [{ id: 'epic_red_g1', label: '🔥 Epic Comeback G1 Red', class: 'tag-comeback' }, { id: 'clutch', label: '⚔️ The Gladiators', class: 'tag-clutch' }, { id: 'marathon', label: '🏃‍♂️ Marathon Match', class: 'tag-custom' }],
      [{ id: 'blowout', label: '🌪️ ยำใหญ่ (Blowout)', class: 'tag-blowout' }, { id: 'flawless_red', label: '⭐ Flawless Form', class: 'tag-normal' }],
      [{ id: 'rollercoaster', label: '🎢 The Rollercoaster', class: 'tag-custom' }], [],
    ];
    A.board.server.matchHistory = base.slice(0, 12).map((b, i) => Object.assign({}, b, {
      id: 'H' + String(i + 1).padStart(2, '0'), game1: i % 3 === 2 ? '21:19' : i % 2 ? '15:21' : '21:15', game2: i % 5 === 4 ? '0:0' : i % 3 === 2 ? '19:21' : i % 2 ? '18:21' : '21:17',
      rStat: i % 3 === 2 ? 'D' : i % 2 ? 'L' : 'W', bStat: i % 3 === 2 ? 'D' : i % 2 ? 'W' : 'L', pRed: 1, pBlue: 1, duration: 1500000, umpire: i % 2 ? 'ทดสอบ' : 'กรรมการ ใจดีมากๆ', court: 1 + (i % 10), round: String(1 + (i % 3)),
      redNames: i % 2 === 0 ? o.long[0] + ' (G1) & ' + o.long[1] + ' (G2)' : b.redNames, analysis: { tags: tags[i % 4] },
    }));
    A.boardMock(ms, 'guest');
    __setRole(o.role);
    switchTab(o.tab, document.getElementById('tab-' + o.tab));
    await sleep(500);
  }, { role, tab, long: LONG });
}

const out = [];
for (const role of ['guest', 'superadmin']) {
  out.push(mk(`viewer-stress-${role}-ongoing`, role, ['390x844', '320x568', '1280x800'], async (page) => {
    await stress(page, { role, tab: 'ongoing' }); await page.shot(''); await page.shot('full', { full: true, maxHeight: 6000 });
  }));
  out.push(mk(`viewer-stress-${role}-arena`, role, ['390x844', '320x568', '1280x800'], async (page) => {
    await stress(page, { role, tab: 'scoreboard' });
    await page.eval("arenaPick('T01')"); await page.wait(200); await page.shot('');
    await page.eval("arenaPick('T03')"); await page.wait(200); await page.shot('game2');
  }));
  out.push(mk(`viewer-stress-${role}-finished`, role, ['390x844', '1280x800'], async (page) => {
    await stress(page, { role, tab: 'finished' }); await page.shot(''); await page.shot('full', { full: true, maxHeight: 6000 });
  }));
}
out.push(mk('viewer-empty-guest-idle', 'guest', ['390x844', '1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); A.board.server.matchHistory = []; A.boardMock([], 'guest'); __setRole('guest'); switchTab('scoreboard', document.getElementById('tab-scoreboard')); await new Promise(r => setTimeout(r, 500)); });
}));
out.push(mk('viewer-empty-admin-idle', 'admin', ['390x844'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); A.boardMock([], 'guest'); __setRole('admin'); updateUI(); switchTab('scoreboard', document.getElementById('tab-scoreboard')); await new Promise(r => setTimeout(r, 500)); });
}));
out.push(mk('viewer-empty-guest-ongoing', 'guest', ['390x844', '1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); A.boardMock([], 'guest'); __setRole('guest'); switchTab('ongoing', document.getElementById('tab-ongoing')); await new Promise(r => setTimeout(r, 500)); });
}));
out.push(mk('viewer-empty-guest-finished', 'guest', ['390x844', '1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); A.board.server.matchHistory = []; A.boardMock([], 'guest'); __setRole('guest'); switchTab('finished', document.getElementById('tab-finished')); await new Promise(r => setTimeout(r, 500)); });
}));
out.push(mk('viewer-g1toast', 'guest', ['390x844', '1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); __setRole('guest'); switchTab('ongoing', document.getElementById('tab-ongoing')); await new Promise(r => setTimeout(r, 400)); });
  await page.eval("showG1DoneToast('T01', 21, 15, '🔴 Red')"); await page.wait(300);
}));
out.push(mk('viewer-fsnav', 'guest', ['390x844', '1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); __setRole('guest'); switchTab('ongoing', document.getElementById('tab-ongoing')); await new Promise(r => setTimeout(r, 400)); });
  await page.eval("(() => { const s = document.createElement('style'); s.textContent = '#fsBottomNav{display:flex}'; document.head.appendChild(s); })()"); await page.wait(200);
}));
out.push(mk('viewer-offline-1280', 'guest', ['1280x800'], async (page) => {
  await page.run(async () => { const A = __audit; await A.wp5Setup(); __setRole('guest'); switchTab('ongoing', document.getElementById('tab-ongoing')); await new Promise(r => setTimeout(r, 400)); _dbOnline = false; _dbEverOnline = true; _lastSnapshotAt = Date.now() - 125000; _dbRenderConn(); });
  await page.wait(200);
}));

export default out;
