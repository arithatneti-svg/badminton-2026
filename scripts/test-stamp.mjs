// Release-consistency test (npm test): the html pages, the service worker and the build lists must agree.
//   1. every local css/js tag of index.html + umpire.html carries ?v=<APP_VERSION>   (no half-updated pages)
//   2. every css/js a page loads is in sw.js SHELL                                   (the offline shell is complete)
//   3. every SHELL entry exists on disk
//   4. build.mjs lists the same css/js files as the pages                            (npm run build stays valid)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PAGES, appVersion, listTags } from './stamp-version.mjs';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.error('  ✗ ' + msg); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const quoted = (s) => [...s.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
const diff = (a, b) => [...a].filter((x) => !b.has(x));

const ver = appVersion();
console.log('release ' + ver);

const pageFiles = {};
for (const page of PAGES) {
  const tags = listTags(read(page));
  pageFiles[page] = new Set(tags.map((t) => t.file));
  const wrong = tags.filter((t) => t.v !== ver).map((t) => t.file);
  ok(tags.length > 0 && wrong.length === 0, page + ': all ' + tags.length + ' css/js tags carry ?v=' + ver + (wrong.length ? '  (wrong: ' + wrong.join(', ') + ')' : ''));
}

const sw = read('sw.js');
const shell = new Set(quoted(/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1]));
for (const page of PAGES) {
  const missing = diff(pageFiles[page], shell);
  ok(missing.length === 0, page + ': every css/js is in sw.js SHELL' + (missing.length ? '  (missing: ' + missing.join(', ') + ')' : ''));
}
const gone = [...shell].filter((f) => f !== './' && !fs.existsSync(path.join(ROOT, f)));
ok(gone.length === 0, 'every sw.js SHELL entry exists on disk' + (gone.length ? '  (missing: ' + gone.join(', ') + ')' : ''));

const build = read('build.mjs');
const buildCss = quoted(/const CSS = \[([\s\S]*?)\]\.map/.exec(build)[1]).map((n) => 'css/' + n + '.css');
const buildJs = quoted(/const JS = \[([\s\S]*?)\];/.exec(build)[1]);
const buildUmpCss = quoted(/const UMP_CSS = \[([\s\S]*?)\];/.exec(build)[1]);
const buildUmpJs = quoted(/const UMP_JS\s*= \[([\s\S]*?)\];/.exec(build)[1]);
const buildDrawCss = quoted(/const DRAW_CSS = \[([\s\S]*?)\];/.exec(build)[1]);
const buildDrawJs = quoted(/const DRAW_JS\s*= \[([\s\S]*?)\];/.exec(build)[1]);
const split = (set) => ({ css: new Set([...set].filter((f) => f.endsWith('.css'))), js: new Set([...set].filter((f) => f.endsWith('.js'))) });
const idx = split(pageFiles['index.html']);
const ump = split(pageFiles['umpire.html']);
const draw = split(pageFiles['draw.html']);
const cmp = (label, a, b) => {
  const m = diff(a, new Set(b)), x = diff(new Set(b), a);
  ok(m.length === 0 && x.length === 0, label + (m.length ? '  (html only: ' + m.join(', ') + ')' : '') + (x.length ? '  (build only: ' + x.join(', ') + ')' : ''));
};
cmp('build.mjs CSS = index.html css', idx.css, buildCss);
cmp('build.mjs JS = index.html js', idx.js, buildJs);
cmp('build.mjs UMP_CSS = umpire.html css', ump.css, buildUmpCss);
cmp('build.mjs UMP_JS = umpire.html js', ump.js, buildUmpJs);
cmp('build.mjs DRAW_CSS = draw.html css', draw.css, buildDrawCss);
cmp('build.mjs DRAW_JS = draw.html js', draw.js, buildDrawJs);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
