// Measuring scenarios for the umpire redesign (A1). Run with the shared shots tool:
//   node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\umpire" --label a1-checks \
//        --scenarios "C:\Badminton 2026\ux-v3\umpire\scripts\audit\umpire-scenarios" --only check-
// Each scenario opens a screen, takes a picture and writes the measurements of that screen into the manifest (`notes`):
//   contrast (WCAG 2.x, every text node), controls under 48 px, anything sticking out sideways, text that is cut off,
//   neighbours closer than 8 px. Nothing here touches a database (the audit helpers swap the write path for a mock).
import { UMP, UMP_LAND, umpireBench, openScoring } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

const base = { app: 'umpire', path: '/umpire.html' };
// the sizes the contract asks for besides the umpire phones: a big phone, a tablet, a laptop, a large laptop
export const WIDE = ['430x932', '768x1024', '1280x800', '1440x900'];

// runs INSIDE the page (serialised): one screen's numbers
function measure(arg) {
  const A = window.__audit;
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [onclick], [tabindex]';
  const root = document.querySelector(arg.root);
  if (!root) return { error: 'no root ' + arg.root };
  const r0 = (n) => Math.round(n);
  const out = { vp: innerWidth + 'x' + innerHeight, root: arg.root };
  const c = A.contrast(arg.root, 12);
  out.contrast = c.error ? c : { texts: c.total, fail: c.fail, worst: (c.worst || []).slice(0, 6).map((w) => [w.sel, w.fg, w.bg, w.ratio + ':1', w.fs + 'px', JSON.stringify(w.sample)].join(' | ')) };
  out.small = A.small(arg.root, arg.min || 48);
  const over = [], clipped = [];
  root.querySelectorAll('*').forEach((e) => {
    if (!A.vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.right > innerWidth + 1 || r.left < -1) over.push(A.sel(e) + ' ' + r0(r.left) + '..' + r0(r.right));
    const cs = getComputedStyle(e);
    // .score-panel: the digits' line box is shorter than the font's content area, so a panel always "overflows" downwards
    // without any ink - only its width counts; .ds-sr-only is 1 px by design
    const tallOk = e.matches('.score-panel');
    if ((cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || (!tallOk && e.scrollHeight > e.clientHeight + 1)) && e.textContent.trim() && !/^(svg|path|use)$/i.test(e.tagName) && !e.matches('.ds-sr-only')) {
      clipped.push(A.sel(e) + ' ' + e.clientWidth + 'x' + e.clientHeight + ' < ' + e.scrollWidth + 'x' + e.scrollHeight + ' ' + JSON.stringify(e.textContent.trim().slice(0, 24)));
    }
  });
  out.overflowX = over.slice(0, 8);
  out.docScroll = document.documentElement.scrollWidth + ' / ' + innerWidth;
  out.clippedText = clipped.slice(0, 8);
  const els = [...root.querySelectorAll(SEL)].filter(A.vis);
  const gaps = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      // the -1 circle sits on its +1 area on purpose: the area has a notch around it (probed below), the boxes still touch
      const pm = (els[i].matches('.score-btn-plus') && els[j].matches('.score-btn-minus')) || (els[j].matches('.score-btn-plus') && els[i].matches('.score-btn-minus'));
      if (pm) continue;
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)), dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const gap = Math.hypot(dx, dy);
      if (gap < (arg.gap || 8)) gaps.push(A.sel(els[i]) + ' <> ' + A.sel(els[j]) + ' ' + r0(gap) + 'px');
    }
  }
  out.tapGaps = gaps.slice(0, 8);
  out.controls = els.length;
  // a tap just outside a -1 circle (3 and 6 px from its edge, all round) must not land on a +1 area
  const ring = [];
  [...root.querySelectorAll('.score-btn-minus')].filter(A.vis).forEach((m) => {
    const r = m.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12;
      [rad + 3, rad + 6].forEach((d) => {
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
        const el = document.elementFromPoint(x, y);
        if (el && el.closest('.score-btn-plus')) ring.push(m.id + ' leaks +1 at ' + r0(x) + ',' + r0(y));
      });
    }
  });
  if (root.querySelector('.score-btn-minus')) out.minusRing = ring.length ? ring.slice(0, 4) : 'ok';
  return out;
}

async function check(page, root, extra) {
  const m = await page.run(measure, Object.assign({ root }, extra || {}));
  page.note(JSON.stringify(m));
  return m;
}

const S = (id, viewports, setup, extra = {}) => Object.assign({ id, viewports, setup }, base, extra);

export default [
  // ── scoring ──
  S('check-scoring-mid', UMP_LAND.concat(WIDE), async (page) => { await openScoring(page, { live: { g1R: 11, g1B: 9 }, elapsedMs: 600000 }); await check(page, '#screen-scoring'); await page.shot(''); }),
  S('check-scoring-g2', UMP_LAND.concat(WIDE), async (page) => { await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 20, g2B: 18 }, elapsedMs: 1500000 }); await check(page, '#screen-scoring'); await page.shot(''); }),
  // the worst case for the landscape centre column: game 2 (recap chip) + game point, on the shortest phones
  S('check-scoring-land-worst', ['844x390', '667x375', '568x320'], async (page) => {
    await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 20, g2B: 18 }, elapsedMs: 1500000 });
    await check(page, '#screen-scoring'); await page.shot('');
  }),
  S('check-scoring-max', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 30, g1B: 29 }, elapsedMs: 2400000 });
    await page.eval("(() => { _lastScored = 'blue'; renderGameUI(); })()");
    await check(page, '#screen-scoring'); await page.shot('');
  }),
  S('check-scoring-longnames', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 12, g1B: 10 }, elapsedMs: 700000 });
    await page.eval(`(() => { const m = appState.ongoingMatches.find(x => x.id === 'T03');
      m.redNames = 'ศิริวรรณ ภัทรวรากุลชัย (G1) & Christopher-Montgomery Fitzgerald (G2)'; m.blueNames = 'ปิยะวรรณ ศรีสุขสวัสดิ์กุลวงศ์ (G1) & Bartholomew Wolfeschlegelsteinhausen (G3)';
      document.getElementById('redNames').innerHTML = scoringNamesHtml(m, 'red'); document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue'); })()`);
    await check(page, '#screen-scoring'); await page.shot('');
  }),
  S('check-scoring-offline', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 }, elapsedMs: 600000 });
    await page.eval('(() => { __audit.umpOnline(false); _uPending = 3; _uOfflinePoints = 3; _uRenderNet(); })()');
    await page.wait(150);
    await check(page, '#screen-scoring'); await page.shot('');
  }),

  // ── login: is the gold button inside the screen without scrolling? ──
  S('check-login', UMP.concat(WIDE), async (page) => {
    await page.eval("(async () => { document.getElementById('tbtn-Red').click(); await new Promise(r => setTimeout(r, 100)); const sel = document.getElementById('umpireSelect'); sel.value = sel.options[2].value; updateLoginReady(); window.scrollTo(0, 0); })()");
    const m = await check(page, '#screen-login');
    page.note('login button in view: ' + await page.eval("(() => { const b = document.getElementById('btnLogin').getBoundingClientRect(); return (b.top >= 0 && b.bottom <= innerHeight) + ' (' + Math.round(b.top) + '..' + Math.round(b.bottom) + ' of ' + innerHeight + '), page scrolls: ' + (document.documentElement.scrollHeight > innerHeight + 1); })()"));
    await page.shot('');
  }),

  // ── lists ──
  S('check-list', UMP.concat(WIDE), async (page) => {
    await umpireBench(page); await page.eval("goToTab('live')"); await page.wait(200);
    await check(page, '#screen-live'); await check(page, '#umpireNav'); await page.shot('');
  }),
  S('check-finished', UMP.concat(WIDE), async (page) => {
    await umpireBench(page); await page.eval("goToTab('finished')"); await page.wait(250);
    await check(page, '#screen-finished'); await page.shot('');
  }),
  // the list screens while offline (banner under the menu bar) and when a new release is waiting (the shared update bar)
  S('check-list-offline', ['390x844', '320x568', '1280x800'], async (page) => {
    await umpireBench(page); await page.eval("goToTab('live')"); await page.wait(150);
    await page.eval('(() => { __audit.umpOnline(false); _uPending = 2; _uRenderNet(); })()'); await page.wait(150);
    await check(page, '#screen-live'); await check(page, '.net-banner'); await page.shot('');
  }),
  S('check-list-update', ['390x844', '320x568'], async (page) => {
    await umpireBench(page); await page.eval("goToTab('live')"); await page.wait(150);
    await page.eval('_appShowUpdateBar()'); await page.wait(150);
    await check(page, '#appUpdate'); await page.shot('');
  }),
  S('check-list-empty', ['390x844', '320x568'], async (page) => {
    await umpireBench(page);
    await page.eval("(() => { __audit.umpMock([], 'ทดสอบ'); goToTab('live'); })()");
    await check(page, '#screen-live'); await page.shot('');
  }),

  // ── dialogs ──
  S('check-dialog-match', UMP_LAND.concat(['1280x800']), async (page) => {
    await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 19, g2B: 21 }, elapsedMs: 2400000 });
    await page.eval('submitGame()'); await page.waitFor('#customModal.open'); await page.wait(150);
    await check(page, '#customModal'); await page.shot('');
  }),
  S('check-dialog-warn', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 14, g1B: 9 }, elapsedMs: 700000 });
    await page.eval('submitGame()'); await page.waitFor('#customModal.open'); await page.wait(150);
    await check(page, '#customModal'); await page.shot('');
  }),
  S('check-dialog-courts', UMP_LAND, async (page) => {
    await umpireBench(page, { history: false });
    await page.eval("(() => { const m = __audit.server.ongoing.find(x => x.id === 'T03'); delete m.umpire; delete m.live; __audit.umpEcho(); goToTab('live'); selectMatch('T01'); })()");
    await page.waitFor('#customModal.open .court-grid'); await page.wait(150);
    await check(page, '#customModal'); await page.shot('');
  }),
  // changing the court from the scoring screen: the court you are on is gold with a check
  S('check-dialog-courts-change', ['390x844', '320x568'], async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('(() => { changeCourt(); })()'); await page.waitFor('#customModal.open .court-grid'); await page.wait(150);
    await check(page, '#customModal'); await page.shot('');
  }),
  S('check-dialog-result', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 21, g1B: 15, g1Locked: true, g2R: 21, g2B: 17 }, elapsedMs: 2200000 });
    await page.eval('(() => { const A = __audit; A.server.history = []; A.server.red = 0; A.server.blue = 0; })()');
    await page.eval('submitGame()'); await page.waitFor('#customModal.open');
    await page.eval("document.querySelector('#modalBtns .modal-btn-confirm').click()");
    await page.waitUntil("document.getElementById('modalTitle').textContent.indexOf('ส่งผลแล้ว') >= 0", 8000, 'the sent box');
    await page.wait(150); await check(page, '#customModal'); await page.shot('');
  }),
  S('check-dialog-exit', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('(() => { confirmExit(); })()'); await page.waitFor('#customModal.open'); await page.wait(150);
    await check(page, '#customModal'); await page.shot('');
  }),

  // ── Thai copy: Latin words a person can see that are not on the owner's list (empty = clean) ──
  S('check-english', ['390x844'], async (page) => {
    const seen = {};
    const grab = async (name) => { seen[name] = await page.eval('__audit.wp4English()'); };
    await page.eval("(async () => { document.getElementById('tbtn-Red').click(); await new Promise(r => setTimeout(r, 100)); const sel = document.getElementById('umpireSelect'); sel.value = sel.options[2].value; updateLoginReady(); })()");
    await grab('login');
    await umpireBench(page);
    await page.eval("goToTab('live')"); await page.wait(150); await grab('list');
    await page.eval("goToTab('finished')"); await page.wait(150); await grab('finished');
    await page.eval("selectMatch('T03')"); await page.wait(400); await page.eval('dismissVsIntro()'); await page.wait(150);
    await page.eval("(() => { const m = appState.ongoingMatches.find(x => x.id === 'T03'); m.live.g2R = 20; m.live.g2B = 18; renderGameUI(); })()"); await grab('scoring');
    await page.eval('togglePause()'); await page.wait(150); await grab('pause');
    await page.eval('togglePause()'); await page.wait(100);
    await page.eval('(() => { submitGame(); })()'); await page.waitFor('#customModal.open'); await grab('dialog');
    page.note(JSON.stringify({ root: 'english', ...Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.length ? v : 'clean'])) }));
    await page.shot('');
  }),

  // ── pause · VS intro · notice ──
  S('check-pause', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval('togglePause()'); await page.waitFor('#pauseOverlay.show'); await page.wait(150);
    await check(page, '#pauseOverlay'); await page.shot('');
  }),
  S('check-vs', UMP_LAND, async (page) => {
    await page.eval('__audit.umpFreeze()');
    await page.eval("(() => { __audit.umpMock(__audit.umpMatches(4), 'ทดสอบ'); goToTab('live'); selectMatch('T01'); })()");
    await page.waitFor('#customModal.open .court-grid'); await page.eval('_modalDone(2)');
    await page.waitFor('#vsIntro.show'); await page.eval('clearTimeout(_vsIntroTimer)'); await page.wait(150);
    await check(page, '#vsIntro'); await page.shot('');
  }),
  S('check-notice-err', UMP_LAND, async (page) => {
    await openScoring(page, { live: { g1R: 11, g1B: 9 } });
    await page.eval("_uWriteFailed('error', 'คะแนนล่าสุด', function () {}, function () { return '10–9'; })"); await page.wait(150);
    await check(page, '#umpNotice'); await page.shot('');
  }),
];
