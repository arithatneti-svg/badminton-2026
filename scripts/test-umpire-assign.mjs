import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const U = require('../shared/umpire-assign.js');
let pass = 0, fail = 0;
const t = (name, ok) => { if (ok) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

const P = (id, name, team, sub) => ({ id, name, team, sub });
const players = [
  P('R1', 'ก', 'Red', '1.1'), P('R2', 'ข', 'Red', '1.2'), P('R3', 'ค', 'Red', '2.1'), P('R4', 'ง', 'Red', '3.1'),
  P('B1', 'จ', 'Blue', '1.1'), P('B2', 'ฉ', 'Blue', '2.2'), P('B3', 'ช', 'Blue', '3.1'), P('B4', 'ซ', 'Blue', '3.2'),
  P('U1', 'อ1', 'Red', '2.2'), P('U2', 'อ2', 'Blue', '2.3'), P('U3', 'อ3', 'Red', '3.1'), P('U4', 'อ4', 'Blue', '3.2'), P('U5', 'อ5', 'Blue', '1.2'), P('N1', 'ไม่รู้', '', '')
];
const M = (id, a, b, c, d, extra) => Object.assign({ id, r1: a, r2: b, b1: c, b2: d, redNames: '', blueNames: '' }, extra || {});
const avail = ['U1', 'U2', 'U3', 'U4', 'U5', 'N1'];

console.log('hand rule');
t('hand of 2.3 is 2, no subgroup counts as 3', U.handOf({ sub: '2.3' }) === 2 && U.handOf({}) === 3 && U.handOf({ sub: '3.2' }) === 3);
let r = U.suggest({ players, history: [], ongoing: [M('M1', 'R1', 'R2', 'B1', 'B2'), M('M2', 'R4', 'R3', 'B3', 'B4')], staged: [], avail });
t('a hand-1 match never gets a hand-3 umpire', r[0].picks.every(p => p.hand <= 2));
t('a hand-2 match never gets a hand-3 umpire', r[1].picks.every(p => p.hand <= 2));
r = U.suggest({ players, history: [], ongoing: [M('M3', 'R4', 'B3', 'B4', 'R4')], staged: [], avail });
t('hand-3 match: the first choice is a hand-3 umpire', r[0].picks.length > 0 && r[0].picks[0].hand === 3);
const only12 = U.suggest({ players, history: [], ongoing: [M('M3', 'R4', 'B3', 'B4', 'R4')], staged: [], avail: ['U1', 'U5'] });
t('hand-3 match with only hand 1-2 free: they fall back in', only12[0].picks.length === 2);
const only3 = U.suggest({ players, history: [], ongoing: [M('M1', 'R1', 'R2', 'B1', 'B2')], staged: [], avail: ['U3', 'U4'] });
t('hand-1 match with only hand-3 free: nobody', only3[0].picks.length === 0);

r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail: ['N1'] });
t('a player without a colour is never suggested, even when ticked', r[0].picks.length === 0);
r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail });
t('every suggestion has a colour', r[0].picks.length > 0 && r[0].picks.every(p => p.team === 'Red' || p.team === 'Blue'));

r = U.suggest({ players, history: [], ongoing: [M('M1', 'R1', 'R2', 'B1', 'B2')], staged: [], avail: ['U2', 'U1', 'U5'] });
t('high levels first: 1.2 before 2.2 before 2.3 when nobody has umpired', r[0].picks.map(p => p.name).join() === 'อ5,อ1,อ2');
r = U.suggest({ players, history: [{ umpire: 'อ5' }, { umpire: 'อ5' }, { umpire: 'อ5' }], ongoing: [M('M1', 'R1', 'R2', 'B1', 'B2')], staged: [], avail: ['U2', 'U5'] });
t('a high-level umpire who has done 3 steps back for a weaker one with none', r[0].picks[0].name === 'อ2');
r = U.suggest({ players, history: [{ umpire: 'อ5' }], ongoing: [M('M1', 'R1', 'R2', 'B1', 'B2')], staged: [], avail: ['U2', 'U5'] });
t('one match more is not enough to step back', r[0].picks[0].name === 'อ5');
r = U.suggest({ players, history: [], ongoing: [M('M3', 'R4', 'B3', 'B4', 'R4')], staged: [], avail: ['U1', 'U5', 'U3'] });
t('a hand-3 match still prefers a hand-3 umpire over a higher level', r[0].picks[0].name === 'อ3');

console.log('first batch / later');
// 3 courts: queue M1..M6. Free umpires: U5 plays in M5 (a later match), U1 plays nowhere (finished), U2 plays in M1 (starting now)
const mk = (id, a, b, c, d) => M(id, a, b, c, d);
const q6 = [mk('M1', 'U2', 'R1', 'B1', 'B2'), mk('M2', 'R2', 'R3', 'B3', 'B4'), mk('M3', 'R4', 'R1', 'B2', 'B3'), mk('M4', 'R2', 'R3', 'B1', 'B4'), mk('M5', 'U5', 'R4', 'B3', 'B4'), mk('M6', 'R1', 'R2', 'B1', 'B2')];
const players2 = players.concat([P('U6', 'อ6', 'Red', '2.1'), P('U7', 'อ7', 'Blue', '2.2'), P('U8', 'อ8', 'Red', '2.2'), P('U9', 'อ9', 'Blue', '2.1'), P('U10', 'อ10', 'Red', '2.3')]);
r = U.suggest({ players: players2, history: [], ongoing: q6, staged: [], avail: ['U1', 'U6', 'U7', 'U8', 'U9', 'U10', 'U2', 'U5'], courts: 3 });
t('rows are tagged first / later', r.slice(0, 3).every(x => x.batch === 'first') && r.slice(3).every(x => x.batch === 'later'));
t('first batch: nobody playing in the starting matches is suggested', !r[1].picks.some(p => p.id === 'U2') && !r[2].picks.some(p => p.id === 'U2'));
t('first batch: somebody who plays later (not next up) can umpire', r[1].picks.length > 0);
t('later match: a player who still has a match is never suggested', r.slice(3).every(x => !x.picks.some(p => p.id === 'U5' || p.id === 'U2')));
t('later match: a finished player (no match left) is suggested', r.slice(3).some(x => x.picks.some(p => ['U1', 'U6', 'U7', 'U8', 'U9', 'U10'].includes(p.id))));
r = U.suggest({ players, history: [], ongoing: q6, staged: [], avail: ['U2', 'U5'], courts: 3 });
t('later match with only unfinished players free: nobody, and it says why', r[4].picks.length === 0 && /เล่นเสร็จ/.test(r[4].reason));
r = U.suggest({ players, history: [], ongoing: [Object.assign(mk('L1', 'R1', 'R2', 'B1', 'B2'), { umpire: 'อ1' }), mk('M2', 'R3', 'R4', 'B3', 'B4')], staged: [], avail: ['U5'], courts: 1 });
t('a free court is needed to count as first batch: with 1 court taken the queue is all later', r[0].batch === 'later');

console.log('exclusions');
r = U.suggest({ players, history: [], ongoing: [M('M1', 'U1', 'R2', 'B1', 'B2')], staged: [], avail });
t('a player of the match is never suggested for it', !r[0].picks.some(p => p.id === 'U1'));
r = U.suggest({ players, history: [], ongoing: [M('L1', 'B1', 'B2', 'R1', 'R2', { umpire: 'อ1' }), M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail });
t('somebody umpiring right now is not suggested', !r[0].picks.some(p => p.name === 'อ1'));
r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4'), M('M2', 'U5', 'R1', 'B1', 'B2')], staged: [], avail });
t('somebody who plays in the next queued matches is not suggested', !r[0].picks.some(p => p.id === 'U5'));
r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4'), M('M2', 'R3', 'R4', 'B3', 'B4'), M('M3', 'R3', 'R4', 'B3', 'B4')], staged: [], avail });
const firsts = r.map(x => x.picks[0] && x.picks[0].name).filter(Boolean);
t('first choices of different matches are different people', new Set(firsts).size === firsts.length);
r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail: [] });
t('nobody ticked -> says so', r[0].picks.length === 0 && /ยังไม่ได้เลือก/.test(r[0].reason));

console.log('fairness');
r = U.suggest({ players, history: [{ umpire: 'อ1' }, { umpire: 'อ1' }, { umpire: 'อ2' }], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail: ['U1', 'U2', 'U5'] });
t('fewest matches umpired comes first', r[0].picks[0].name === 'อ5');
const hist2 = [{ umpire: 'อ1' }, { umpire: 'อ1' }, { umpire: 'อ3' }];
r = U.suggest({ players, history: hist2, ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4')], staged: [], avail: ['U2', 'U5'] });
t('equal counts: the colour that has umpired less goes first (blue)', r[0].picks[0].team === 'Blue');
const bal = U.balance(players, hist2, []);
t('balance counts matches and people per colour', bal.red.matches === 3 && bal.red.people === 2 && bal.blue.matches === 0);
r = U.suggest({ players, history: [], ongoing: [M('M1', 'R3', 'R4', 'B3', 'B4', { assigned: 'อ2' }), M('M2', 'R3', 'R4', 'B3', 'B4')], staged: [], avail });
t('an assigned match keeps its umpire; the next match does not reuse that name', r[0].assigned === 'อ2' && !r[1].picks.some(p => p.name === 'อ2'));

console.log('staged matches');
r = U.suggest({ players, history: [], ongoing: [], staged: [M('S1', 'R3', 'R4', 'B3', 'B4')], avail });
t('staged row has kind staged and picks', r[0].kind === 'staged' && r[0].picks.length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
