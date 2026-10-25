// Measuring scenarios for the umpire redesign (A1). Run with the shared shots tool:
//   node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\umpire" --label a1-checks \
//        --scenarios "C:\Badminton 2026\ux-v3\umpire\scripts\audit\umpire-scenarios" --only check-
// Each scenario opens a screen, takes a picture and writes the measurements of that screen into the manifest (`notes`):
//   contrast (WCAG 2.x, every text node), controls under 48 px, anything sticking out sideways, text that is cut off,
//   neighbours closer than 8 px. Nothing here touches a database (the audit helpers swap the write path for a mock).
import { UMP, UMP_LAND, umpireBench, openScoring } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

const base = { app: 'umpire', path: '/umpire.html' };
export const WIDE = ['1280x800', '768x1024'];

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
    if ((cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && e.textContent.trim() && !/^(svg|path|use)$/i.test(e.tagName)) {
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
];
