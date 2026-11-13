// Round-2 pairing: runs the draw on many realistic teams (the real 39-player table coloured by the round-1 rules, plus the 2.3 filler that makes it 20 v 20)
// and checks every hard rule of the owner's poster; also that the checker really catches a broken match and that a reshuffle gives a different draw.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../shared/draw-rules.js');
const R2 = require('../shared/round2-rules.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra ? ' - ' + extra : '')); } }

function league() {
  const a = D.generate();
  const players = D.ROSTER.map((r, i) => ({ id: 'P' + String(i + 1).padStart(3, '0'), name: r.name, sub: r.subgroup, team: a[r.name] }));
  const reds = players.filter(p => p.team === 'Red').length;
  players.push({ id: 'P040', name: 'ลูกกอล์ฟ', sub: '2.3', team: reds > players.length - reds ? 'Blue' : 'Red' });   // the filler goes to the short team
  return players;
}

ok('levels 1.1=7 ... 3.2=1', R2.levelOf({ sub: '1.1' }) === 7 && R2.levelOf({ sub: '2.2' }) === 4 && R2.levelOf({ sub: '3.2' }) === 1);
ok('1.1 + 2.2 can pair, 1.1 + 2.3 cannot (7+3)', R2.pairOk({ sub: '1.1' }, { sub: '2.2' }) && !R2.pairOk({ sub: '1.1' }, { sub: '2.3' }));
ok('1.1 + 1.1 cannot pair', !R2.pairOk({ sub: '1.1' }, { sub: '1.1' }));
ok('3.2 + 2.2 can pair, 3.2 + 2.1 cannot', R2.pairOk({ sub: '3.2' }, { sub: '2.2' }) && !R2.pairOk({ sub: '3.2' }, { sub: '2.1' }));

const N = 150;
let broke = 0, failed = 0, sameTotal = 0, ms = 0, worst = 0;
const sigs = new Set();
for (let i = 0; i < N; i++) {
  const players = league();
  const t0 = Date.now();
  const res = R2.draw(players);
  const dt = Date.now() - t0; ms += dt; worst = Math.max(worst, dt);
  if (!res.ok) { failed++; if (failed < 4) console.log('  no draw:', res.reason, res.red, res.blue); continue; }
  const bad = R2.check(res.matches, players);
  if (bad.length) { broke++; if (broke < 4) console.log('  broke:', bad.join('; ')); }
  if (res.matches.length !== 10) bad.push('not 10 matches');
  sameTotal += res.same;
  sigs.add(res.matches.map(m => m.red.map(p => p.id).sort() + '|' + m.blue.map(p => p.id).sort()).sort().join('/'));
  // sorted strongest first
  for (let k = 1; k < res.matches.length; k++) if (res.matches[k].sum > res.matches[k - 1].sum) broke++;
}
ok(N + ' draws all found', failed === 0, failed + ' failed');
ok(N + ' draws break no rule', broke === 0, broke + ' broke');
console.log('  avg ' + (ms / N).toFixed(0) + ' ms, worst ' + worst + ' ms, same-subgroup pairs avg ' + (sameTotal / N).toFixed(2));
ok('a draw is fast enough for a button press', worst < 4000, worst + ' ms');

// reshuffle on the SAME teams gives a different draw
const fixed = league();
const a = R2.draw(fixed), b = R2.draw(fixed);
const sig = r => r.matches.map(m => m.red.map(p => p.id).sort() + '|' + m.blue.map(p => p.id).sort()).sort().join('/');
ok('a reshuffle gives a different draw', a.ok && b.ok && sig(a) !== sig(b));

// refusals
ok('unequal teams are refused', R2.draw(fixed.slice(0, 39)).reason === 'unequal' || R2.draw(fixed.slice(0, 39)).reason === 'odd');
const noSub = fixed.map(p => Object.assign({}, p)); noSub[0].sub = '';
const r0 = R2.draw(noSub);
ok('a player without a subgroup is skipped and counted', !r0.ok && r0.skipped.length === 1);

// the checker catches broken matches
const g = R2.draw(fixed);
const m = g.matches[0];
const broken = [{ red: [{ id: 'a', name: 'a', sub: '1.1' }, { id: 'b', name: 'b', sub: '2.3' }], blue: [{ id: 'c', name: 'c', sub: '1.2' }, { id: 'd', name: 'd', sub: '2.1' }] }];
ok('checker rejects 1.1 + 2.3 and unequal sums', R2.check(broken).length >= 2);
const dbl = [{ red: [{ id: 'a', name: 'a', sub: '1.1' }, { id: 'b', name: 'b', sub: '1.1' }], blue: [{ id: 'c', name: 'c', sub: '1.1' }, { id: 'd', name: 'd', sub: '1.1' }] }];
ok('checker rejects 1.1+1.1 v 1.1+1.1', R2.check(dbl).some(x => /1\.1\+1\.1/.test(x)));
ok('checker passes the real draw', R2.check(g.matches, fixed).length === 0);

const T0 = 0x1a1d8db1980;
let n1 = 0, bad1 = 0, bad2 = 0;
for (let i = 0; i < 60; i++) {
  const players = league();
  const w = R2.q(players, T0);
  if (R2.q(players, T0 - 1).length || R2.q(players, T0 - 86400000).length) bad2++;
  if (!w.length) continue;
  if (w.length !== 1 || !R2.q(players, T0 + 86400000).length) { bad1++; continue; }
  const res = R2.draw(players, undefined, { x: w });
  n1++;
  if (!res.ok || R2.check(res.matches, players).length) { bad1++; continue; }
  if (!res.matches.some(m => [m.red, m.blue].some(pr => pr.some(p => p.id === w[0][0]) && pr.some(p => p.id === w[0][1])))) bad1++;
}
ok('x: ' + n1 + ' drawn, all kept together', n1 > 5 && bad1 === 0, 'broke ' + bad1);
ok('x: off before the time', bad2 === 0);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
