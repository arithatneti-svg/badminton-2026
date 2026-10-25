// Shared pieces for the scenario files. Anything passed to page.run() is serialised and runs INSIDE the page,
// so those functions use only their argument and the page's own globals (__audit.*, selectMatch, switchTab, ...).

export const UMP = ['390x844', '360x740', '320x568'];
export const UMP_LAND = [...UMP, '844x390'];
export const BOARD = ['390x844', '1280x800'];
export const BOARD_TAB = [...BOARD, '768x1024'];
export const TV = ['1920x1080', '1280x720'];
export const ROLES = ['guest', 'admin', 'superadmin'];
export const STAFF = ['admin', 'superadmin'];

// ───────────────────────────── umpire ─────────────────────────────
// The bench: T01 T04 T06 free · T02 taken (other umpire, court 3, 5–4) · T05 taken (another umpire, court 1, 11–9)
// · T03 mine, court 4, game 2 · three finished results. Umpire "ทดสอบ". Nothing reaches a database: the audit helpers
// swap the write path for an in-memory server.
export async function umpireBench(page, { name = 'ทดสอบ', history = true } = {}) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    A.umpFreeze();
    if (o.history) await A.wp3Setup(); else A.umpScenario(o.name);
    await sleep(120);
    const now = Date.now(), live = (r, b) => ({ g1R: r, g1B: b, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: now - 4000 });
    const t3 = A.server.ongoing.find((x) => x.id === 'T03');
    Object.assign(t3, { umpire: o.name, court: 4, claimedAt: now - 1500000, timerStartedAt: now - 900000, live: { g1R: 21, g1B: 15, g2R: 7, g2B: 5, g1Locked: true, isPaused: false, elapsedMs: 0, lastAt: now - 4000 } });
    Object.assign(A.server.ongoing.find((x) => x.id === 'T05'), { umpire: 'ปอนด์', court: 1, claimedAt: now - 700000, timerStartedAt: now - 600000, live: live(11, 9) });
    A.umpEcho(); await sleep(100);
  }, { name, history });
}

// open T03 on the scoring screen with the given live scores (the VS intro is dismissed; use umpireIntro for that)
export async function openScoring(page, { live = {}, court = 4, elapsedMs = 600000, name = 'ทดสอบ' } = {}) {
  await page.run(async (o) => {
    const A = __audit, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    A.umpFreeze();
    A.umpScenario(o.name); await sleep(100);
    const now = Date.now();
    const m = A.server.ongoing.find((x) => x.id === 'T03');
    m.court = o.court; m.claimedAt = now - 900000;
    if (o.elapsedMs) m.timerStartedAt = now - o.elapsedMs; else delete m.timerStartedAt;
    m.live = Object.assign({ g1R: 0, g1B: 0, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: now - 4000 }, o.live);
    A.umpEcho(); await sleep(100);
    await selectMatch('T03'); await sleep(300);
    dismissVsIntro(); await sleep(150);
  }, { live, court, elapsedMs, name });
  await page.waitFor('#screen-scoring.active');
}

// ───────────────────────────── scoreboard ─────────────────────────────
// Boot the scoreboard bench: data in, writes refused, 4 matches (court 3 in game 2, court 5 in game 1, two waiting),
// 3 finished results; then switch to `role` (a body class and a variable, never a passcode) and open `tab`.
export async function boardBench(page, { role = 'guest', tab = 'ongoing', matches = 'bench' } = {}) {
  await page.run(async (o) => {
    const A = __audit;
    await A.wp5Setup();
    if (o.matches === 'idle') A.boardMock(A.boardMatches(3), 'guest');          // nothing started: the idle board
    if (o.matches === 'none') A.boardMock([], 'guest');
    __setRole(o.role);
    const btn = document.getElementById('tab-' + o.tab);
    if (o.tab) switchTab(o.tab, btn);
    await new Promise((r) => setTimeout(r, 500));
  }, { role, tab, matches });
}

// a Blue player who has a photo and at least two awards (falls back to any player with a photo)
export const PICK_PROFILE = () => {
  const ps = appState.players || [];
  const withPhoto = ps.filter((p) => !!playerPhoto(p.id));
  const best = withPhoto.find((p) => p.team === 'Blue' && playerAwards(p).length >= 2) || withPhoto.find((p) => playerAwards(p).length >= 1) || withPhoto[0] || ps[0];
  return best ? best.id : null;
};
