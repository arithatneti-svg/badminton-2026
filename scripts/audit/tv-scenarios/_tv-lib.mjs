// Shared helpers for the TV scenario files in this folder (a file starting with "_" is not a scenario).
export const VP = ['1920x1080', '1280x720', '2560x1440'];
export const base = { app: 'tv', path: '/?view=tv', viewports: VP };

// stop the rotation, pick the panel, put mock courts / results on the screen
//   quiet: how many courts have had no point for 11+ minutes · hot: how many are at 20-19 · g2: from which court on the game is game 2
//   names: a function (index) -> { red, blue } that replaces the pair names (long-name stress)
export async function show(page, { panel = ['live'], courts = 0, court = true, history = 0, longest = false, quiet = 0, hot = 0, g2 = -1, names = null }) {
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
      if (o.names) { m.redNames = o.names.red + ' (G1)'; m.blueNames = o.names.blue + ' (G2)'; }
    });
    if (o.history) appState.matchHistory = A.mockHistory(o.history);
    _tvBoardPage = 0;
    renderTvPanel(true);
    await sleep(500);
  }, { panel, courts, court, history, longest, quiet, hot, g2, names });
}

// grid metrics (overlap with heading / footer / neighbours, fit class) as a note in the manifest
export async function noteGrid(page) {
  page.note(String(await page.eval('JSON.stringify(__audit.tvGridMetrics())')));
}
// the hero has no grid: check that its fields stay inside the screen and that nothing in them overlaps
export async function noteHero(page) {
  page.note(String(await page.eval(`(() => {
    const R = (e) => e.getBoundingClientRect(), foot = R(document.querySelector('.tv-foot')), head = R(document.querySelector('.tv-heading'));
    const fs = [...document.querySelectorAll('.tv-field')]; let ov = 0, ol = 0;
    fs.forEach((f) => {
      const fr = R(f), k = ['.tv-fh', '.tv-fd', '.tv-names'].map((s) => f.querySelector(s)).filter(Boolean);
      k.forEach((e) => { const r = R(e); if (r.left < fr.left - 1 || r.right > fr.right + 1 || r.top < fr.top - 1 || r.bottom > fr.bottom + 1) ov++; });
      for (let a = 0; a < k.length; a++) for (let b = a + 1; b < k.length; b++) { const p = R(k[a]), q = R(k[b]); if (p.left < q.right - 2 && p.right > q.left + 2 && p.top < q.bottom - 2 && p.bottom > q.top + 2) ol++; }
    });
    const low = Math.max(...fs.map((f) => R(f).bottom)), top = Math.min(...fs.map((f) => R(f).top));
    return JSON.stringify({ hero: true, fieldOverflow: ov, fieldOverlap: ol, intoFooter: Math.max(0, Math.round(low - foot.top)), ontoHeading: Math.max(0, Math.round(head.bottom - top)), fields: fs.length });
  })()`)));
}
// text no smaller than 28 px at 1080p (2.6u), WCAG contrast of every text on the TV, and the stale bar's own contrast
export async function noteAudit(page) {
  page.note(String(await page.eval(`(() => {
    const A = __audit, u = Math.min(.5625 * innerWidth, innerHeight) / 100, floor = 2.6 * u - 0.6, small = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(); if (!t || !/[\\p{L}\\p{N}]/u.test(t)) continue; const el = n.parentElement;
      if (!el || !el.closest('#tvView, #tvStale') || !A.vis(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < floor) small.push(fs.toFixed(1) + ':' + t.slice(0, 22));
    }
    const c = A.contrast('#tvView'), s = document.querySelector('#tvStale:not([hidden])') ? A.contrast('#tvStale') : null;
    return JSON.stringify({ audit: true, floorPx: +floor.toFixed(1), smallN: small.length, small: small.slice(0, 6),
      contrast: { total: c.total, fail: c.fail, worst: (c.worst || []).slice(0, 3).map((g) => g.sel + ' ' + g.ratio + ' ' + g.sample) },
      stale: s && { total: s.total, fail: s.fail } });
  })()`)));
}
