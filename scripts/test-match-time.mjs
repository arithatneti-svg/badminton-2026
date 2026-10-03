// Unit tests for shared/match-time.js — run: npm test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { formatTimer, matchStage, matchPlayMs, matchLastActivityAt, matchIdleMs, MATCH_IDLE_WARN_MS, fmtAgo, matchStatusTag, matchLooksStuck, courtLabel, sortByCourt } = require('../shared/match-time.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const NOW = 1_800_000_000_000;

console.log('\nformatTimer — hours are shown (it used to stop at 60:00)');
t('under an hour is m:ss', () => { eq(formatTimer(0), '0:00'); eq(formatTimer(59999), '0:59'); eq(formatTimer(61000), '1:01'); eq(formatTimer(59 * MIN + 59000), '59:59'); });
t('from one hour it is h:mm:ss', () => { eq(formatTimer(HOUR), '1:00:00'); eq(formatTimer(5.5 * HOUR), '5:30:00'); eq(formatTimer(HOUR + 5 * MIN + 9000), '1:05:09'); });
t('a match left open for 19.6 days is not shown as 60:00', () => eq(formatTimer(19.6 * DAY), '470:24:00'));
t('negative or garbage reads as 0:00', () => { eq(formatTimer(-5), '0:00'); eq(formatTimer(NaN), '0:00'); eq(formatTimer(undefined), '0:00'); });

console.log('\nmatchStage');
t('no umpire = queue; umpire without a first point = ready; with timerStartedAt = playing', () => {
  eq(matchStage({ id: 'M1' }), 'queue');
  eq(matchStage({ id: 'M1', umpire: 'A' }), 'ready');
  eq(matchStage({ id: 'M1', umpire: 'A', timerStartedAt: NOW }), 'playing');
  eq(matchStage(null), 'queue');
});
t('a match claimed before the change (timer started at the claim) counts as playing', () => eq(matchStage({ umpire: 'A', live: { g1R: 0 }, timerStartedAt: NOW - DAY }), 'playing'));

console.log('\nmatchPlayMs — time actually played, not time since the claim');
t('0 until the first point', () => { eq(matchPlayMs({ umpire: 'A', live: {} }, NOW), 0); eq(matchPlayMs(null, NOW), 0); });
t('counts from the first point', () => eq(matchPlayMs({ umpire: 'A', timerStartedAt: NOW - 20 * MIN, live: {} }, NOW), 20 * MIN));
t('minus the pauses already taken', () => eq(matchPlayMs({ umpire: 'A', timerStartedAt: NOW - 30 * MIN, live: { totalPauseMs: 8 * MIN } }, NOW), 22 * MIN));
t('minus the pause that is going on right now', () => eq(matchPlayMs({ umpire: 'A', timerStartedAt: NOW - 30 * MIN, live: { isPaused: true, pauseStartedAt: NOW - 5 * MIN, totalPauseMs: 3 * MIN } }, NOW), 22 * MIN));
t('never negative', () => eq(matchPlayMs({ umpire: 'A', timerStartedAt: NOW - 1 * MIN, live: { totalPauseMs: 9 * MIN } }, NOW), 0));
t('the Marathon outlier: 5.5 h open, paused 5 h 10 min of it → 20 min played', () => eq(matchPlayMs({ umpire: 'A', timerStartedAt: NOW - 5.5 * HOUR, live: { totalPauseMs: 5 * HOUR + 10 * MIN } }, NOW), 20 * MIN));

console.log('\nmatchIdleMs / matchLastActivityAt');
t('last point wins, then the first point, then the claim; 0 for a queued match', () => {
  eq(matchLastActivityAt({ umpire: 'A', timerStartedAt: NOW - 50 * MIN, claimedAt: NOW - 60 * MIN, live: { lastAt: NOW - 3 * MIN } }), NOW - 3 * MIN);
  eq(matchLastActivityAt({ umpire: 'A', timerStartedAt: NOW - 50 * MIN, claimedAt: NOW - 60 * MIN, live: {} }), NOW - 50 * MIN);
  eq(matchLastActivityAt({ umpire: 'A', claimedAt: NOW - 60 * MIN, live: {} }), NOW - 60 * MIN);
  eq(matchLastActivityAt({ id: 'Q' }), 0);
  eq(matchIdleMs({ id: 'Q' }, NOW), 0);
  eq(matchIdleMs({ umpire: 'A', live: { lastAt: NOW - 4 * MIN } }, NOW), 4 * MIN);
});

console.log('\nfmtAgo');
t('minutes, hours, days', () => { eq(fmtAgo(20000), '1 นาที'); eq(fmtAgo(12 * MIN), '12 นาที'); eq(fmtAgo(59 * MIN), '59 นาที'); eq(fmtAgo(60 * MIN), '1 ชม.'); eq(fmtAgo(2.5 * HOUR), '2 ชม.'); eq(fmtAgo(23 * HOUR), '23 ชม.'); eq(fmtAgo(19.6 * DAY), '19 วัน'); });

console.log('\nmatchStatusTag / matchLooksStuck — what viewers and the admin see');
const playing = (live = {}, extra = {}) => ({ id: 'M5', umpire: 'A', timerStartedAt: NOW - 30 * MIN, live, ...extra });
t('a queued match wears no tag', () => { eq(matchStatusTag({ id: 'Q' }, NOW), ''); eq(matchLooksStuck({ id: 'Q' }, NOW), false); });
t('a match with a recent point is fine', () => { eq(matchStatusTag(playing({ lastAt: NOW - 2 * MIN }), NOW), ''); eq(matchLooksStuck(playing({ lastAt: NOW - 2 * MIN }), NOW), false); });
t('silent for 12 minutes → "ไม่มีความเคลื่อนไหว 12 นาที"', () => { eq(matchStatusTag(playing({ lastAt: NOW - 12 * MIN }), NOW), 'ไม่มีความเคลื่อนไหว 12 นาที'); eq(matchLooksStuck(playing({ lastAt: NOW - 12 * MIN }), NOW), true); });
t('the threshold is exactly MATCH_IDLE_WARN_MS', () => { eq(matchStatusTag(playing({ lastAt: NOW - MATCH_IDLE_WARN_MS + 1000 }), NOW), ''); eq(matchStatusTag(playing({ lastAt: NOW - MATCH_IDLE_WARN_MS }), NOW), 'ไม่มีความเคลื่อนไหว 10 นาที'); });
t('a short pause is just "พักเกม"', () => { eq(matchStatusTag(playing({ isPaused: true, pauseStartedAt: NOW - 2 * MIN }), NOW), 'พักเกม'); eq(matchLooksStuck(playing({ isPaused: true, pauseStartedAt: NOW - 2 * MIN }), NOW), false); });
t('a long pause says how long', () => { eq(matchStatusTag(playing({ isPaused: true, pauseStartedAt: NOW - 25 * MIN }), NOW), 'พักเกม · 25 นาที'); eq(matchLooksStuck(playing({ isPaused: true, pauseStartedAt: NOW - 25 * MIN }), NOW), true); });
t('M04 from the real data: paused 19.6 days ago', () => eq(matchStatusTag(playing({ isPaused: true, pauseStartedAt: NOW - 19.6 * DAY }), NOW), 'พักเกม · 19 วัน'));
t('claimed but never started, waiting 11 minutes → silent tag too', () => eq(matchStatusTag({ id: 'M6', umpire: 'A', claimedAt: NOW - 11 * MIN, live: {} }, NOW), 'ไม่มีความเคลื่อนไหว 11 นาที'));

console.log('\ncourtLabel');
t('court 3 → "คอร์ต 3"; none → empty', () => { eq(courtLabel({ court: 3 }), 'คอร์ต 3'); eq(courtLabel({}), ''); eq(courtLabel(null), ''); });

console.log('\nsortByCourt');
const ids = l => l.map(m => m.id).join(',');
t('numeric order (10 after 9, not after 1), no court last, ties and the no-court group keep their order', () => {
  const l = [{ id: 'a' }, { id: 'b', court: 10 }, { id: 'c', court: 2 }, { id: 'd' }, { id: 'e', court: 9 }, { id: 'f', court: 2 }];
  eq(ids(sortByCourt(l)), 'c,f,e,b,a,d');
});
t('a court given as text still sorts as a number; the input is not changed; empty / null are fine', () => {
  const l = [{ id: 'a', court: '10' }, { id: 'b', court: '3' }];
  eq(ids(sortByCourt(l)), 'b,a'); eq(ids(l), 'a,b');
  eq(sortByCourt([]).length, 0); eq(sortByCourt(null).length, 0);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
