// Definition-of-done checks for the Reports + Dashboard screens, taken in the page and written to manifest.json (notes):
// sideways overflow, WCAG contrast of every visible text, interactive elements under 44 px, the English words on screen,
// buttons / inputs without a name. Run:
//   node ...\shots.mjs --root <worktree> --label reports-audit --scenarios <this dir> --only rep-audit
// then read results[].notes of <out>\manifest.json.
import { repBench } from './rep.mjs';

const VPS = ['390x844', '320x568', '768x1024', '1280x800', '1440x900'];

function audit(o) {
  const A = __audit, root = document.querySelector(o.root);
  const out = { vp: innerWidth + 'x' + innerHeight, sw: document.documentElement.scrollWidth };
  // anything wider than the window (sideways scroll or clipped content)
  out.overflow = [...root.querySelectorAll('*')].filter(e => A.vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.ds-sr-only,canvas')).slice(0, 6).map(e => A.sel(e) + ' r=' + Math.round(e.getBoundingClientRect().right));
  const c = A.contrast(o.root, 8);
  out.contrast = { texts: c.total, fail: c.fail, worst: (c.worst || []).slice(0, 6).map(w => `${w.sel} ${w.ratio}<${w.need} ${w.fg}/${w.bg} ${w.fs}px "${w.sample}"`) };
  out.small44 = A.small(o.root, 44);
  out.sem = (({ noName, symbolOnly, mouseOnly, inputsNoLabel, noNameTop, mouseOnlyTop, inputsNoLabelTop }) => ({ noName, symbolOnly, mouseOnly, inputsNoLabel, noNameTop, mouseOnlyTop, inputsNoLabelTop }))(A.semantics(o.root));
  out.english = Object.keys(A.wp5English(o.root));
  return out;
}

const mk = (id, tab, extra, after) => ({
  id, app: 'board', path: '/', role: 'admin', viewports: VPS,
  async setup(page) {
    await repBench(page, Object.assign({ tab: tab === 'dashboard' ? 'dashboard' : 'report' }, extra || {}));
    if (tab === 'matches') await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    if (tab === 'compare') await page.eval("switchReportTab('compare', document.getElementById('rtab-compare'))");
    await page.wait(900);
    if (after) await page.eval(after);
    await page.wait(250);
    const r = await page.run(audit, { root: tab === 'dashboard' ? '#dashboard' : '#report' });
    page.note(JSON.stringify(r));
    await page.shot('');
  },
});

export default [
  mk('rep-audit-players', 'players'),
  mk('rep-audit-matches', 'matches', {}, "(() => { const m = appState.matchHistory.find(x => x.analysis && x.analysis.tags && x.analysis.tags.length > 1) || appState.matchHistory[0]; toggleMatchDetail(m.id); document.getElementById('rpTagFold').open = true; document.querySelector('#rpanel-matches .rp-fold').open = true; })()"),
  mk('rep-audit-compare', 'compare', { twoSeasons: true }),
  mk('rep-audit-dashboard', 'dashboard'),
  mk('rep-audit-players-nodata', 'players', { hist: 'none' }),
  mk('rep-audit-dashboard-nodata', 'dashboard', { hist: 'none' }),
];
