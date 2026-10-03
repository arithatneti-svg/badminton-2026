// Unit tests for umpire/tap-gate.js — run: npm test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { TAP_GATE, tapGate } = require('../umpire/tap-gate.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}
// run a list of [ms, key] taps and return the times that counted
const run = (taps, cfg) => { const s = {}; return taps.filter(([ms, key]) => tapGate(s, key, ms, cfg).ok).map(([ms]) => ms); };

console.log('\ntapGate — two taps on the same button count once');
t('the first tap always counts', () => eq(tapGate({}, 'red1', 123456).ok, true));
t('the default is in the 350-500 ms range the audit asked for', () => eq(TAP_GATE.sameSideMs >= 350 && TAP_GATE.sameSideMs <= 500, true));
t('a finger bounce (50 ms) and a human double-tap (150 / 300 ms) are ignored', () => {
  eq(run([[0, 'red1'], [50, 'red1']]).join(), '0');
  eq(run([[0, 'red1'], [150, 'red1']]).join(), '0');
  eq(run([[0, 'red1'], [300, 'red1']]).join(), '0');
});
t('exactly at the limit counts, one ms before does not', () => {
  eq(run([[0, 'red1'], [399, 'red1']]).join(), '0');
  eq(run([[0, 'red1'], [400, 'red1']]).join(), '0,400');
});
t('the ignored tap reports how long to wait', () => {
  const s = {}; tapGate(s, 'red1', 1000); const r = tapGate(s, 'red1', 1150);
  eq(r.ok, false); eq(r.reason, 'repeat'); eq(r.waitMs, 250);
});

console.log('\nthe clock runs from the last ACCEPTED tap');
t('a burst every 100 ms for 2 s: 0, 400, 800, 1200, 1600 count (not just the first)', () => {
  const taps = []; for (let ms = 0; ms < 2000; ms += 100) taps.push([ms, 'blue1']);   // 20 taps over two seconds
  eq(run(taps).join(), '0,400,800,1200,1600');
});
t('real points seconds apart are never touched', () => eq(run([[0, 'red1'], [4200, 'red1'], [9100, 'red1']]).join(), '0,4200,9100'));

console.log('\nsides and directions are separate');
t('red and blue do not block each other (a quick fix of a wrong-side tap)', () => eq(run([[0, 'red1'], [60, 'blue1'], [120, 'red-1']]).join(), '0,60,120'));
t('"+1" followed at once by "−" on the same side is a correction, not a repeat', () => eq(run([[0, 'red1'], [80, 'red-1']]).join(), '0,80'));
t('"−" twice in a row is still one', () => eq(run([[0, 'red-1'], [200, 'red-1'], [450, 'red-1']]).join(), '0,450'));

console.log('\nrobustness');
t('a clock that goes backwards (a time sync) never locks the panel', () => {
  const s = {}; tapGate(s, 'red1', 5_000_000);
  eq(tapGate(s, 'red1', 4_000_000).ok, true);        // an hour earlier than the last tap
  eq(tapGate(s, 'red1', 4_000_100).ok, false);       // and the gate works from there
});
t('a custom limit is honoured, and the shared default is not changed by it', () => {
  eq(run([[0, 'red1'], [450, 'red1']], { sameSideMs: 500 }).join(), '0');
  eq(run([[0, 'red1'], [450, 'red1']]).join(), '0,450');
});
t('state is only what the caller passed in (two screens do not share a clock)', () => {
  const a = {}, b = {}; tapGate(a, 'red1', 0);
  eq(tapGate(b, 'red1', 10).ok, true); eq(tapGate(a, 'red1', 10).ok, false);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
