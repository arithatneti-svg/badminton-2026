// Unit tests for shared/sync-merge.js — run: npm test
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { smToArr, smDeepEq, smMergeById, smMerge3, smMergeState, smSanitize } = require('../shared/sync-merge.js');

let pass = 0, fail = 0;
const clone = v => JSON.parse(JSON.stringify(v));
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(actual, expected, msg = '') {
  if (!smDeepEq(actual, expected)) throw new Error(`${msg}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

const match = (id, live = {}, extra = {}) => ({ id, round: '1', r1: 'R1', r2: 'R2', b1: 'B1', b2: 'B2', redNames: 'a & b', blueNames: 'c & d', ...extra, ...(Object.keys(live).length ? { live } : {}) });
const hist  = (id, pRed = 3, pBlue = 0) => ({ id, game1: '21:10', game2: '21:12', pRed, pBlue, rStat: pRed ? 'W' : 'L', bStat: pBlue ? 'W' : 'L' });
const state = (o = {}) => ({ players: [{ id: 'R1', name: 'a' }, { id: 'B1', name: 'c' }], globalScoreRed: 10, globalScoreBlue: 7, matchCounter: 5, matchHistory: [hist('M01')], ongoingMatches: [], ...o });

console.log('\nsmDeepEq / smToArr');
t('key order does not matter', () => ok(smDeepEq({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }), 'should be equal'));
t('null ≡ undefined ≡ missing ≡ empty', () => { ok(smDeepEq({ a: 1, b: null }, { a: 1 }), 'null/missing'); ok(smDeepEq([], null), '[]/null'); ok(smDeepEq({}, undefined), '{}/undefined'); });
t('array ≡ Firebase numeric-key object', () => ok(smDeepEq([{ id: 'A' }, { id: 'B' }], { 0: { id: 'A' }, 1: { id: 'B' } }), 'shapes'));
t('different values differ', () => { ok(!smDeepEq({ a: 1 }, { a: 2 }), 'number'); ok(!smDeepEq([1, 2], [2, 1]), 'order'); ok(!smDeepEq(0, null), '0 vs null'); ok(!smDeepEq(false, null), 'false vs null'); });
t('smToArr handles arrays, sparse objects, null', () => { eq(smToArr([1, null, 2]), [1, 2]); eq(smToArr({ 2: 'c', 0: 'a' }), ['a', 'c']); eq(smToArr(null), []); });

console.log('\nlive-scoring races (admin save vs umpire writes)');
t('admin creates a match while an umpire scores on another court', () => {
  const base   = state({ ongoingMatches: [match('M04', { g1R: 3, g1B: 2 })] });
  const local  = clone(base); local.ongoingMatches.push(match('M05')); local.matchCounter = 6;
  const server = clone(base); server.ongoingMatches[0].live.g1R = 4;            // point arrived meanwhile
  const out = smMergeState(base, local, server);
  eq(smToArr(out.ongoingMatches).map(m => m.id), ['M04', 'M05'], 'both matches');
  eq(out.ongoingMatches[0].live, { g1R: 4, g1B: 2 }, 'umpire point kept');
  eq(out.matchCounter, 6);
});
t('admin finalizes M04 while an umpire scores on M06', () => {
  const base   = state({ ongoingMatches: [match('M04', { g1R: 21, g1B: 15, g1Locked: true, g2R: 21, g2B: 9 }), match('M06', { g1R: 5, g1B: 5 })] });
  const local  = clone(base);
  local.ongoingMatches = local.ongoingMatches.filter(m => m.id !== 'M04');
  local.matchHistory.push(hist('M04')); local.globalScoreRed += 3;
  const server = clone(base); server.ongoingMatches[1].live.g1B = 6;
  const out = smMergeState(base, local, server);
  eq(smToArr(out.ongoingMatches).map(m => m.id), ['M06'], 'M04 removed');
  eq(out.ongoingMatches[0].live.g1B, 6, 'M06 point kept');
  eq(smToArr(out.matchHistory).map(h => h.id), ['M01', 'M04']);
  eq(out.globalScoreRed, 13);
});
t('two finalizes at once (admin M04 + umpire M05): both results and both scores survive', () => {
  const base   = state({ ongoingMatches: [match('M04', { g1R: 21 }), match('M05', { g1B: 21 })] });
  const local  = clone(base);                                                  // admin finalizes M04 (red +3)
  local.ongoingMatches = [local.ongoingMatches[1]]; local.matchHistory.push(hist('M04', 3, 0)); local.globalScoreRed += 3;
  const server = clone(base);                                                  // umpire finalized M05 (blue +3)
  server.ongoingMatches = [server.ongoingMatches[0]]; server.matchHistory.push(hist('M05', 0, 3)); server.globalScoreBlue += 3;
  const out = smMergeState(base, local, server);
  eq(smToArr(out.ongoingMatches), [], 'both gone from ongoing');
  eq(smToArr(out.matchHistory).map(h => h.id), ['M01', 'M04', 'M05'], 'both results kept');
  eq([out.globalScoreRed, out.globalScoreBlue], [13, 10], 'both scores kept');
});
t('concurrent score bumps merge by delta (not last-write-wins)', () => eq(smMerge3(10, 13, 11), 14));
t('admin swaps a player while the umpire scores that match', () => {
  const base   = state({ ongoingMatches: [match('M04', { g1R: 3 })] });
  const local  = clone(base); local.ongoingMatches[0].r1 = 'R9';
  const server = clone(base); server.ongoingMatches[0].live.g1R = 4;
  const out = smMergeState(base, local, server);
  eq([out.ongoingMatches[0].r1, out.ongoingMatches[0].live.g1R], ['R9', 4]);
});
t('admin explicitly clearing a score wins over the stale value', () => {
  const base   = state({ ongoingMatches: [match('M04', { g1R: 3 }, { umpire: 'x' })] });
  const local  = clone(base); delete local.ongoingMatches[0].live; delete local.ongoingMatches[0].umpire;
  const server = clone(base); server.ongoingMatches[0].live.g1R = 4;
  const out = smMergeState(base, local, server);
  ok(!out.ongoingMatches[0].live, 'live cleared'); ok(!out.ongoingMatches[0].umpire, 'umpire cleared');
});
t('a match deleted on the server stays deleted even if we edited it', () => {
  const base   = state({ ongoingMatches: [match('M04'), match('M05')] });
  const local  = clone(base); local.ongoingMatches[1].round = '2';
  const server = clone(base); server.ongoingMatches = [server.ongoingMatches[0]];
  eq(smToArr(smMergeState(base, local, server).ongoingMatches).map(m => m.id), ['M04']);
});
t('a match added by someone else is kept', () => {
  const base   = state({ ongoingMatches: [match('M04')] });
  const local  = clone(base); local.ongoingMatches.push(match('M07'));
  const server = clone(base); server.ongoingMatches.push(match('M08'));
  eq(smToArr(smMergeState(base, local, server).ongoingMatches).map(m => m.id), ['M04', 'M07', 'M08']);
});
t('ghost rows with no id (corrupt index writes) are dropped when the list is saved', () => {
  const base   = state({ ongoingMatches: [match('M04')] });
  const local  = clone(base); local.ongoingMatches.push(match('M05'));
  const server = clone(base); server.ongoingMatches.push({ live: { g1R: 1 } });   // ghost at a missing index
  eq(smToArr(smMergeState(base, local, server).ongoingMatches).map(m => m.id), ['M04', 'M05']);
});
t('keys the admin did not touch keep the server value (remote commands survive)', () => {
  const base   = state({ remoteCommand: null });
  const local  = clone(base); local.redTeamName = 'TIGERS';
  const server = clone(base); server.remoteCommand = { action: 'FINALIZE', mId: 'M04' };
  const out = smMergeState(base, local, server);
  eq(out.remoteCommand, { action: 'FINALIZE', mId: 'M04' }); eq(out.redTeamName, 'TIGERS');
});
t('profile edits on different players both survive', () => {
  const base   = state({ playerProfiles: { R1: { notes: 'a' }, B1: { photoPos: '50% 30%' } } });
  const local  = clone(base); local.playerProfiles.R1.notes = 'b';
  const server = clone(base); server.playerProfiles.B1.photoPos = '40% 20%';
  eq(smMergeState(base, local, server).playerProfiles, { R1: { notes: 'b' }, B1: { photoPos: '40% 20%' } });
});
t('onlyKeys (saveKeys) never writes other local edits', () => {
  const base = state(); const local = clone(base); local.redTeamName = 'X'; local.globalScoreRed = 99;
  const out = smMergeState(base, local, clone(base), ['redTeamName']);
  eq([out.redTeamName, out.globalScoreRed], ['X', 10]);
});
t('Firebase sparse-object lists are handled', () => {
  const base   = state({ ongoingMatches: { 0: match('M04'), 2: match('M06') } });
  const local  = clone(base); local.ongoingMatches = [match('M04'), match('M06'), match('M07')];
  const out = smMergeState(base, local, clone(base));
  eq(smToArr(out.ongoingMatches).map(m => m.id), ['M04', 'M06', 'M07']);
});
t('nothing changed locally → result is exactly the server', () => {
  const base = state({ ongoingMatches: [match('M04', { g1R: 1 })] }); const server = clone(base); server.ongoingMatches[0].live.g1R = 9; server.x = 1;
  eq(smMergeState(base, clone(base), server), server);
});
t('reset (admin clears history + scores) while a new result lands keeps totals consistent', () => {
  const base   = state({ matchHistory: [hist('M01'), hist('M02')], globalScoreRed: 6, globalScoreBlue: 0 });
  const local  = clone(base); local.matchHistory = []; local.globalScoreRed = 0; local.globalScoreBlue = 0;
  const server = clone(base); server.matchHistory.push(hist('M03', 0, 3)); server.globalScoreBlue = 3;
  const out = smMergeState(base, local, server);
  eq(smToArr(out.matchHistory).map(h => h.id), ['M03'], 'only the result that arrived after the reset');
  eq([out.globalScoreRed, out.globalScoreBlue], [0, 3], 'totals match that history');
});
t('sanitize drops undefined and keeps arrays JSON-safe', () => eq(smSanitize({ a: undefined, b: [1, undefined] }), { b: [1, null] }));

console.log('\nperformance');
t('merge of a realistic event state (54 players, 60 results, 5 courts) is fast', () => {
  const players = Array.from({ length: 54 }, (_, i) => ({ id: 'P' + i, name: 'n' + i, team: i % 2 ? 'Red' : 'Blue', group: '1' }));
  const profiles = Object.fromEntries(players.map(p => [p.id, { notes: 'x'.repeat(60), tactics: 3, photoPos: '50% 30%' }]));
  const base = state({ players, playerProfiles: profiles, matchHistory: Array.from({ length: 60 }, (_, i) => ({ ...hist('H' + i), analysis: { tags: [{ id: 't', label: 'x'.repeat(40) }] } })), ongoingMatches: Array.from({ length: 5 }, (_, i) => match('C' + i, { g1R: i, g1B: 2 })) });
  const local = clone(base); local.ongoingMatches.push(match('C9')); const server = clone(base); server.ongoingMatches[2].live.g1R = 20;
  const t0 = performance.now(); for (let i = 0; i < 20; i++) smMergeState(base, local, server); const ms = (performance.now() - t0) / 20;
  console.log(`      ~${JSON.stringify(base).length >> 10} KB state → ${ms.toFixed(2)} ms per merge`);
  ok(ms < 25, 'too slow: ' + ms);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
