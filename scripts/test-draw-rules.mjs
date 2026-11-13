// Runs the team-draw rules thousands of times and checks every rule, plus that the result is really random (not stuck on one answer).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../shared/draw-rules.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' - ' + extra : '')); } }

ok('39 players', R.ROSTER.length === 39, String(R.ROSTER.length));
ok('1.1 holds หมี เพชร ก๊อป Jokee', R.ROSTER.filter(p => p.subgroup === '1.1').map(p => p.name).join() === 'หมี,เพชร,ก๊อป,Jokee');
ok('6 new players', R.ROSTER.filter(p => p.isNew).map(p => p.name).sort().join() === ['พล', 'ไทม์', 'อาร์ม', 'นาย', 'แม็กซ์', 'รุจิ'].sort().join());
ok('captains are หมี and เพชร', R.ROSTER.filter(p => p.captain).map(p => p.name + ':' + p.captain).join() === 'หมี:Red,เพชร:Blue');
ok('names are unique', new Set(R.ROSTER.map(p => p.name)).size === 39);

const N = 5000, seen = {}, tally = {}, opp = c => (c === 'Red' ? 'Blue' : 'Red');
let pairs = 0;
let broke = 0, sizes = new Set();
for (let i = 0; i < N; i++) {
  const a = R.generate();
  const bad = R.check(a);
  if (bad.length) { broke++; if (broke < 4) console.log('  broke:', bad.join('; ')); }
  const reds = R.ROSTER.filter(p => a[p.name] === 'Red').length; sizes.add(reds);
  ['ฝ้าย', 'นก', 'จ๋า', 'ต้น', 'เอิ้น', 'ฮิว', 'นาย'].forEach(n => { tally[n] = (tally[n] || 0) + (a[n] === 'Red' ? 1 : 0); });
  if (a['ยุ้ย'] !== opp(a['ฝ้าย']) || a['ปูม'] !== opp(a['ฝ้าย'])) pairs++;
  if (a['ฮิว'] === a['พล']) pairs++;
  seen[JSON.stringify(a)] = 1;
}
ok(N + ' draws break no rule', broke === 0, broke + ' broke');
ok('ยุ้ย and ปูม are always opposite ฝ้าย, ฮิว and พล always apart', pairs === 0, String(pairs));
ok('teams are always 20 / 19 (either way round)', [...sizes].every(s => s === 19 || s === 20) && sizes.size === 2, [...sizes].join(','));
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
