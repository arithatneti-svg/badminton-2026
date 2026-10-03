// ============================================================
// Tap gate for the scoring panels (P-12) — pure, so it is unit-tested with simulated time
// (scripts/test-tap-gate.mjs).
//
// Real points are seconds apart; a real person's double-tap, a finger bounce or a thumb resting
// on the glass is 50-300 ms. The old guard was 90 ms, which only caught the bounce. Two taps on
// the same panel and the same direction closer than TAP_GATE.sameSideMs count once: the
// SECOND one is ignored (the umpire feels a different buzz and sees the score blink).
//
//  - the clock runs from the last ACCEPTED tap, not the last tap, so a burst of taps cannot starve
//    itself (at 100 ms apart every fourth tap still counts);
//  - "+1" and "−" have their own clocks, so correcting a slip straight away ("+1" then "−") is never
//    blocked; only the same button twice is;
//  - the numbers are constants on purpose: field test F-03 (grip, over-tapping) will tune them.
// ============================================================
const TAP_GATE = { sameSideMs: 400 };

// state: a plain object the caller keeps (one per scoring screen); key: e.g. 'red1', 'blue-1'
// → { ok: true } | { ok: false, reason: 'repeat', waitMs }
function tapGate(state, key, now, cfg) {
  const gap = (cfg || TAP_GATE).sameSideMs;
  const last = state[key];
  // a clock that jumped backwards must not lock the panel for hours: treat it as a fresh start
  if (last !== undefined && now >= last && now - last < gap) return { ok: false, reason: 'repeat', waitMs: gap - (now - last) };
  state[key] = now;
  return { ok: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TAP_GATE, tapGate };
}
