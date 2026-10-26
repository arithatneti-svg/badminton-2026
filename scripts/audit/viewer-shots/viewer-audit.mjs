// A2 viewer checks (extra scenarios for scripts/audit/shots, load with --scenarios <this folder>):
// contrast, tap targets under 44 px, English words, sideways overflow - per role, per screen, at 390 / 1280 / 320.
// Nothing here writes anywhere: the shots tool refuses every database write. Results are page notes in manifest.json.
const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);

// the same bench as scenarios/_lib.mjs boardBench, but the data is set up once and each step only swaps matches / role / tab
async function bench(page, { role, tab, matches = 'bench', first = false }) {
  await page.run(async (o) => {
    const A = __audit;
    if (o.first) await A.wp5Setup();
    if (o.matches === 'idle') A.boardMock(A.boardMatches(3), 'guest');
    else if (o.matches === 'none') A.boardMock([], 'guest');
    else if (!o.first) {   // back to the 4-match bench
      const now = Date.now(), ms = A.boardMatches(4);
      Object.assign(ms[0], { umpire: 'ทดสอบ', court: 3, claimedAt: now - 900000, timerStartedAt: now - 800000, live: { g1R: 21, g1B: 19, g2R: 12, g2B: 10, g1Locked: true, isPaused: false, elapsedMs: 0, lastAt: now - 4000 } });
      Object.assign(ms[1], { umpire: 'สมหญิง', court: 5, claimedAt: now - 300000, timerStartedAt: now - 200000, live: { g1R: 15, g1B: 17, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: now - 4000 } });
      A.boardMock(ms, 'guest');
    }
    __setRole(o.role);
    switchTab(o.tab, document.getElementById('tab-' + o.tab));
    await new Promise((r) => setTimeout(r, 450));
  }, { role, tab, matches, first });
}

const REPORT = (label, root) => `JSON.stringify((() => {
  const A = __audit, c = A.contrast(${JSON.stringify(root)}), n = A.contrast('#mainNav');
  return { screen: ${JSON.stringify(label)}, textFail: c.fail, textTotal: c.total, worst: c.worst.slice(0, 5).map(w => w.sel + ' ' + w.fg + '/' + w.bg + ' ' + w.ratio + ' "' + w.sample + '"'),
    navFail: n.fail, navWorst: n.worst.slice(0, 3).map(w => w.sel + ' ' + w.ratio),
    small44: A.small(${JSON.stringify(root)}, 44), smallNav44: A.small('#mainNav', 44), english: A.wp5English(${JSON.stringify(root)}),
    overflowX: document.documentElement.scrollWidth - innerWidth, navH: document.getElementById('mainNav').offsetHeight };
})())`;

const out = [];
for (const role of ['guest', 'admin', 'superadmin']) {
  out.push(mk(`viewer-audit-${role}`, role, ['390x844', '1280x800', '320x568'], async (page) => {
    const steps = [['scoreboard', 'bench', '#scoreboard', 'live'], ['scoreboard', 'idle', '#scoreboard', 'idle'], ['ongoing', 'bench', '#ongoing', 'ongoing'], ['finished', 'bench', '#finished', 'finished']];
    let first = true;
    for (const [tab, matches, root, label] of steps) {
      await bench(page, { role, tab, matches, first }); first = false;
      page.note(await page.eval(REPORT(label, root)));
    }
  }));
}

// dialogs and overlays, guest view
out.push(mk('viewer-audit-dialogs', 'guest', ['390x844', '1280x800'], async (page) => {
  await bench(page, { role: 'guest', tab: 'ongoing', first: true });
  const rep = async (label, root) => page.note(await page.eval(REPORT(label, root)));
  await page.eval('toggleNavMenu(true)'); await page.wait(150); await rep('menu', '#navActions'); await page.eval('toggleNavMenu(false)');
  await page.eval('openMePicker()'); await page.wait(250); await rep('me-picker', '#mePickerOverlay'); await page.eval('closeMePicker()');
  await page.eval(`(() => { const h = appState.matchHistory[0];
    showMatchNoti({ matchId: h.id, redNames: h.redNames, blueNames: h.blueNames, g1r: 21, g1b: 15, g2r: 21, g2b: 17, gameNum: 2, gameWinner: 'red',
      globalRedBefore: 1, globalBlueBefore: 3, pRed: 3, pBlue: 0, tags: [{ id: 'blowout', label: '🌪️ ยำใหญ่ (Blowout)', class: 'tag-blowout', scope: 'red' }], isMatchEnd: true, rStat: 'W' }); })()`);
  await page.wait(300); await rep('popup', '#matchNotiOverlay'); await page.eval('closeMatchNoti()');
  await page.eval("(() => { showToast('โหลดข้อมูลใหม่ไม่ได้ — ตรวจสอบสัญญาณ', 'error'); showToast('เชื่อมต่อกลับมาแล้ว', 'success'); showToast('เกม 1 จบแล้ว', 'warning'); })()");
  await page.wait(300); await rep('toasts', '#toastStack');
}));
out.push(mk('viewer-audit-login', '', ['390x844', '1280x800', '320x568'], async (page) => {
  await page.waitFor('#loginOverlay');
  const rep = async (label, root) => page.note(await page.eval(REPORT(label, root)));
  await rep('login', '#loginOverlay');
  await page.eval('loginAdmin()'); await page.wait(200); await rep('passcode', '#passcodeModal');
}));
out.push(mk('viewer-audit-loading', 'guest', ['390x844'], async (page) => {
  await page.waitFor('#dataState'); await page.wait(200);
  const rep = async (label) => page.note(await page.eval(REPORT(label, '#dataState')));
  await rep('loading');
  await page.eval("(() => { _dataPhase = 'slow'; _dataShow(); })()"); await page.wait(100); await rep('slow');
  await page.eval('_dataFail()'); await page.wait(100); await rep('failed');
}, { hold: true }));

export default out;
