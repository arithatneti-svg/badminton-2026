// Runs the team-draw rules thousands of times and checks every rule, plus that the result is really random (not stuck on one answer).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../shared/draw-rules.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' - ' + extra : '')); } }

ok('38 players', R.ROSTER.length === 38, String(R.ROSTER.length));
ok('names are unique', new Set(R.ROSTER.map(p => p.name)).size === 38);

const N = 5000, seen = {}, tally = {};
let broke = 0, sizes = new Set();
for (let i = 0; i < N; i++) {
  const a = R.generate();
  const bad = R.check(a);
  if (bad.length) { broke++; if (broke < 4) console.log('  broke:', bad.join('; ')); }
  const reds = R.ROSTER.filter(p => a[p.name] === 'Red').length; sizes.add(reds);
  ['ฝ้าย', 'ปูม', 'นก', 'เอแคลร์', 'ต้น', 'พี่เอิ้น'].forEach(n => { tally[n] = (tally[n] || 0) + (a[n] === 'Red' ? 1 : 0); });
  seen[JSON.stringify(a)] = 1;
}
ok(N + ' draws break no rule', broke === 0, broke + ' broke');
ok('teams are always 19 / 19', sizes.size === 1 && sizes.has(19), [...sizes].join(','));
ok('draws differ from each other', Object.keys(seen).length > N * 0.9, String(Object.keys(seen).length));
for (const n of Object.keys(tally)) {
  const p = tally[n] / N;
  ok(n + ' is Red about half of the time', p > 0.4 && p < 0.6, p.toFixed(2));
}

// the checker itself catches a broken assignment (so a pass above means something)
const good = R.generate();
const flip = Object.assign({}, good); flip['หมี'] = 'Blue';
ok('checker rejects หมี on Blue', R.check(flip).length > 0);
const same = Object.assign({}, good); same['หญิง'] = good['ฝ้าย'] === 'Red' ? 'Blue' : 'Red';
ok('checker rejects ฝ้าย and หญิง apart', R.check(same).length > 0);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
