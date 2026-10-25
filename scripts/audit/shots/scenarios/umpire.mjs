// Umpire app (/umpire.html) — every screen and state. Phone sizes; the scoring screen and the pause screen also in landscape.
import { UMP, UMP_LAND, umpireBench, openScoring } from './_lib.mjs';

const base = { app: 'umpire', path: '/umpire.html' };
const S = (id, viewports, setup, extra = {}) => Object.assign({ id, viewports, setup }, base, extra);

export default [
  // ── login ──
  S('umpire-login', UMP, async () => {}),
  S('umpire-login-ready', UMP, async (page) => {
    await page.eval(`(async () => { document.getElementById('tbtn-Red').click(); await new Promise(r => setTimeout(r, 100));
      const sel = document.getElementById('umpireSelect'); sel.value = sel.options[2].value; updateLoginReady(); window.scrollTo(0, 0); })()`);
  }),
  S('umpire-login-loading', UMP, async (page) => { await page.wait(300); }, { hold: true }),
  S('umpire-login-slow', UMP, async (page) => { await page.eval('(() => { _uLoadSlow = true; _uRenderLoadStates(); })()'); }, { hold: true }),

  // ── match list ──
  S('umpire-list', UMP, async (page) => { await umpireBench(page); await page.eval("goToTab('live')"); await page.wait(200); await page.shot(''); await page.shot('full', { full: true }); }),
  S('umpire-list-onlyfree', UMP, async (page) => { await umpireBench(page); await page.eval("goToTab('live'); toggleOnlyFree()"); await page.wait(200); }),
  S('umpire-list-empty', UMP, async (page) => {
    await umpireBench(page);
    await page.eval("(() => { __audit.umpMock([], 'ทดสอบ'); goToTab('live'); })()");
  }),
  S('umpire-alert-taken', UMP, async (page) => { await umpireBench(page); await page.eval("goToTab('live'); selectMatch('T02')"); await page.waitFor('#customModal.open'); }),
  // (logoutUmpire / confirmExit return a promise that only settles when the box is answered: never await it)
  S('umpire-logout-confirm', UMP, async (page) => { await umpireBench(page); await page.eval("(() => { goToTab('live'); logoutUmpire(); })()"); await page.waitFor('#customModal.open'); }),

  // ── taking a match ──
  S('umpire-court-picker', UMP, async (page) => {
    await umpireBench(page, { history: false });
    // T03 is mine, so taking T01 would first ask "take a second match?" — release it for this shot
    await page.eval("(() => { const m = __audit.server.ongoing.find(x => x.id === 'T03'); delete m.umpire; delete m.live; __audit.umpEcho(); goToTab('live'); selectMatch('T01'); })()");
    await page.waitFor('#customModal.open .court-grid');
  }),
  S('umpire-second-match-confirm', UMP, async (page) => {
    await umpireBench(page, { history: false });
    await page.eval("(() => { goToTab('live'); selectMatch('T01'); })()");
    await page.waitFor('#customModal.open');
  }),
  S('umpire-vs-intro', UMP, async (page) => {
    await page.eval('__audit.umpFreeze()');
    await page.eval("(() => { __audit.umpMock(__audit.umpMatches(4), 'ทดสอบ'); goToTab('live'); selectMatch('T01'); })()");
    await page.waitFor('#customModal.open .court-grid');
    await page.eval('_modalDone(2)');
    await page.waitFor('#vsIntro.show');
    await page.eval('clearTimeout(_vsIntroTimer)');   // hold the 3-second intro still
  }),

  // ── scoring ──
  S('umpire-scoring-0-0', UMP_LAND, async (page) => { await openScoring(page, { live: {}, elapsedMs: 0 }); }),
  S('umpire-scoring-0-0-running', UMP_LAND, async (page) => { await openScoring(page, { live: {}, elapsedMs: 6000 }); }),
  S('umpire-scoring-mid', UMP_LAND, async (page) => { await openScoring(page, { live: { g1R: 11, g1B: 9 }, elapsedMs: 600000 }); }),
  S('umpire-scoring-gamepoint', UMP_LAND, async (page) => { await openScoring(page, { live: { g1R: 20, g1B: 18 }, elapsedMs: 1080000 }); }),
  S('umpire-scoring-deuce', UMP_LAND, async (page) => { await openScoring(page, { live: { g1R: 22, g1B: 22 }, elapsedMs: 1500000 }); }),
  S('umpire-scoring-ready', UMP_LAND, async (page) => { await openScoring(page, { live: { g1R: 21, g1B: 17 }, elapsedMs: 1320000 }); }),
  S('umpire-scoring-g2', UMP_LAND, async (page) => { await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 7, g2B: 5 }, elapsedMs: 1500000 }); }),
  S('umpire-scoring-scored', UMP_LAND, async (page) => {   // a point was just scored: the "just scored" glow
    await openScoring(page, { live: { g1R: 8, g1B: 6 }, elapsedMs: 480000 });
    await page.eval("(() => { _lastScored = 'red'; renderGameUI(); })()");
  }),
  S('umpire-scoring-two-line-names', UMP, async (page) => {   // long names: does the name row hold?
    await openScoring(page, { live: { g1R: 3, g1B: 2 }, elapsedMs: 120000 });
    await page.eval(`(() => { const m = appState.ongoingMatches.find(x => x.id === 'T03');
      m.redNames = 'พงศ์ธนกร อัครวิศวกุล (G1) & ณัฐธิดา วงศ์สุวรรณชัย (G2)'; m.blueNames = 'Christopher Montgomery (G1) & ปิยะวรรณ ศรีสุขสวัสดิ์ (G2)';
      document.getElementById('redNames').innerHTML = scoringNamesHtml(m, 'red'); document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue'); })()`);
  }),

  // ── dialogs on the scoring screen ──
  S('umpire-submit-confirm', UMP, async (page) => {
    await openScoring(page, { live: { g1R: 21, g1B: 17 }, elapsedMs: 1320000 });
    await page.eval('submitGame()');
    await page.waitFor('#customModal.open');
  }),
  S('umpire-submit-confirm-warn', UMP, async (page) => {   // a score that is not a finished game: warns, never blocks
    await openScoring(page, { live: { g1R: 14, g1B: 9 }, elapsedMs: 700000 });
    await page.eval('submitGame()');
    await page.waitFor('#customModal.open');
  }),
  S('umpire-submit-confirm-match', UMP, async (page) => {
    await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 19, g2B: 21 }, elapsedMs: 2400000 });
    await page.eval('submitGame()');
    await page.waitFor('#customModal.open');
  }),
  S('umpire-exit-confirm', UMP, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('(() => { confirmExit(); })()');
    await page.waitFor('#customModal.open');
  }),
  S('umpire-pause', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('togglePause()');
    await page.waitFor('#pauseOverlay.show');
    await page.wait(150);
  }),
  S('umpire-result-sent', UMP, async (page) => {   // game 2 finished, sent: the "✅ ส่งผลแล้ว" box
    await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 21, g2B: 17 }, elapsedMs: 2200000 });
    await page.eval('(() => { const A = __audit; A.server.history = []; A.server.red = 0; A.server.blue = 0; })()');
    await page.eval('submitGame()');
    await page.waitFor('#customModal.open');
    await page.eval("document.querySelector('#modalBtns .modal-btn-confirm').click()");
    await page.waitUntil("document.getElementById('modalTitle').textContent.indexOf('ส่งผลแล้ว') >= 0", 8000, 'the sent box');
  }),

  // ── finished list ──
  S('umpire-result', UMP, async (page) => { await umpireBench(page); await page.eval("goToTab('finished')"); await page.wait(250); await page.shot(''); await page.shot('full', { full: true }); }),
  S('umpire-result-empty', UMP, async (page) => {
    await umpireBench(page, { history: false });
    await page.eval("(() => { __audit.server.history = []; __audit.umpEcho(); goToTab('finished'); })()");
  }),

  // ── connection states ──
  S('umpire-offline', UMP, async (page) => {   // offline, with queued points
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('(() => { __audit.umpOnline(false); _uPending = 3; _uOfflinePoints = 3; _uRenderNet(); })()');
    await page.wait(150);
  }),
  S('umpire-sending', UMP, async (page) => {   // slow signal: a send has been waiting
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('(() => { _uPending = 2; _uPendingSince = Date.now() - 2000; _uRenderNet(); })()');
    await page.wait(150);
  }),
  S('umpire-error-notice', UMP, async (page) => {   // a point that did not go through, with the retry button
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval("_uWriteFailed('error', 'คะแนนล่าสุด', function () {}, function () { return '10–9'; })");
    await page.wait(150);
  }),
  S('umpire-notice-ok', UMP, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval("showNotice('ส่งครบแล้ว ✓ 3 คะแนน', { tone: 'ok' })");
    await page.wait(150);
  }),
];
