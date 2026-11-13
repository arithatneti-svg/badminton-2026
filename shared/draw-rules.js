/* ============================================================
   Team-draw rules for Sports Day, Saturday 14 Nov 2026 (the owner's brief and spreadsheet, 2026-11-04).
   Pure logic, no DOM and no Firebase: the page loads it as window.DrawRules, scripts/test-draw-rules.mjs loads it in Node.
   generate() makes ONE full assignment of every player to Red / Blue; check() lists every rule a given assignment breaks.

   The roster, the subgroups, the skill of each subgroup and the NEW flags are the owner's table (3 groups, 7 subgroups, 39 players).
   Rules:
   1. ฝ้าย and หญิง always share a colour.
   2. ยุ้ย and ปูม are both on the OTHER colour than ฝ้าย-หญิง; นก is the free one (50/50).
   3. พี่เอิ้น and โอ๊ต are on different colours. The captains are fixed: หมี is Red, เพชร is Blue.
   4. ไนซ์ / โจ / แม็กซ์ / จ๋า split 2 and 2; whoever gets จ๋า also gets เอิ้น (so the other side gets โอ๊ต).
   5. Every subgroup splits evenly between the colours. Subgroup 2.3 has 5 players, so one colour gets one more: with 39 players the teams are 20 / 19.
      Because every subgroup is split evenly, the skill of the two teams is balanced too.
   6. โบว์ลิ่ง and ปอนด์ are on different colours; ปอ and รุจิ are on different colours; ฮิว and พล are on different colours.
   ============================================================ */
(function (root) {
  'use strict';

  // [label, skill, members]; a subgroup is a row group of the owner's table, skill 7 (strongest) to 1
  var TABLE = [
    ['1.1', 7, ['หมี', 'เพชร', 'ก๊อป', 'Jokee']],
    ['1.2', 6, ['ฮิว', 'ปาย', 'ฝ้าย', 'พล', 'ไทม์', 'อาร์ม']],
    ['2.1', 5, ['บอส', 'เก้', 'อรรถ', 'เก่ง', 'พี่ต่อ', 'แจ็ค']],
    ['2.2', 4, ['กัปตันต้น', 'พี่ชัย', 'นก', 'ป๋าทัศ', 'ยุ้ย', 'ปูม', 'ดุ๊ก', 'โจ๊ก']],
    ['2.3', 3, ['นาย', 'แชป', 'หญิง', 'ต้น', 'ออป']],
    ['3.1', 2, ['ไนซ์', 'โจ', 'แม็กซ์', 'ปอ', 'รุจิ', 'โบว์ลิ่ง', 'จ๋า', 'ปอนด์']],
    ['3.2', 1, ['เอิ้น', 'โอ๊ต']]
  ];
  var NEW_PLAYERS = ['พล', 'ไทม์', 'อาร์ม', 'นาย', 'แม็กซ์', 'รุจิ'];
  var CAPTAINS = { 'หมี': 'Red', 'เพชร': 'Blue' };
  var LABELS = TABLE.map(function (r) { return r[0]; });
  var SUBGROUPS = TABLE.map(function (r) { return r[2]; });
  var ROSTER = [];
  TABLE.forEach(function (r) {
    r[2].forEach(function (n) {
      ROSTER.push({ name: n, subgroup: r[0], skill: r[1], isNew: NEW_PLAYERS.indexOf(n) >= 0, captain: CAPTAINS[n] || null });
    });
  });

  var PAIR_SAME = [['ฝ้าย', 'หญิง']];
  var OPPOSITE_TO_PAIR = ['ยุ้ย', 'ปูม'];   // นก is the free one
  var FIXED = CAPTAINS;
  var PAIR_OPPOSITE = [['เอิ้น', 'โอ๊ต'], ['โบว์ลิ่ง', 'ปอนด์'], ['ปอ', 'รุจิ'], ['ฮิว', 'พล']];
  var FOUR = ['ไนซ์', 'โจ', 'แม็กซ์', 'จ๋า'];

  function opp(c) { return c === 'Red' ? 'Blue' : 'Red'; }
  function pick(rng, a) { return a[Math.floor(rng() * a.length)]; }
  function coin(rng) { return rng() < 0.5 ? 'Red' : 'Blue'; }
  function shuffle(rng, a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function count(a, names, c) { return names.filter(function (n) { return a[n] === c; }).length; }

  // every rule a finished assignment breaks (empty list = fine)
  function check(a) {
    var bad = [], n = ROSTER.length;
    ROSTER.forEach(function (p) { if (a[p.name] !== 'Red' && a[p.name] !== 'Blue') bad.push('no team: ' + p.name); });
    if (bad.length) return bad;
    PAIR_SAME.forEach(function (p) { if (a[p[0]] !== a[p[1]]) bad.push('same colour: ' + p.join(' + ')); });
    var X = a['ฝ้าย'];
    if (count(a, OPPOSITE_TO_PAIR, opp(X)) !== 2) bad.push('ยุ้ย and ปูม must be opposite to ฝ้าย + หญิง');
    Object.keys(FIXED).forEach(function (k) { if (a[k] !== FIXED[k]) bad.push(k + ' must be ' + FIXED[k]); });
    PAIR_OPPOSITE.forEach(function (p) { if (a[p[0]] === a[p[1]]) bad.push('different colours: ' + p.join(' vs ')); });
    if (count(a, FOUR, 'Red') !== 2) bad.push('four-group must split 2 / 2');
    if (a['จ๋า'] !== a['เอิ้น']) bad.push('จ๋า must be with เอิ้น');
    var extra = 0;
    SUBGROUPS.forEach(function (g, i) {
      var r = count(a, g, 'Red'), b = g.length - r;
      if (Math.abs(r - b) > (g.length % 2)) bad.push('subgroup ' + LABELS[i] + ' split ' + r + ' / ' + b);
      extra += r - b;
    });
    if (Math.abs(extra) > (n % 2)) bad.push('teams differ by ' + Math.abs(extra) + ' (subgroup extras not balanced)');
    var reds = ROSTER.filter(function (p) { return a[p.name] === 'Red'; }).length;
    if (Math.abs(reds - (n - reds)) > (n % 2)) bad.push('team sizes ' + reds + ' / ' + (n - reds));
    return bad;
  }

  // one random full assignment that satisfies every rule (rejection sampling over a structured draw)
  function generate(rng) {
    rng = rng || Math.random;
    var odd = [], i;
    SUBGROUPS.forEach(function (g, k) { if (g.length % 2) odd.push(k); });
    for (var attempt = 0; attempt < 50000; attempt++) {
      var a = {}, X = coin(rng), Y = opp(X);
      PAIR_SAME[0].forEach(function (n) { a[n] = X; });
      OPPOSITE_TO_PAIR.forEach(function (n) { a[n] = Y; });
      a['นก'] = coin(rng);
      Object.keys(FIXED).forEach(function (k) { a[k] = FIXED[k]; });
      var S = coin(rng);                       // the side that gets จ๋า and พี่เอิ้น
      a['จ๋า'] = S; a['เอิ้น'] = S; a['โอ๊ต'] = opp(S);
      var rest = shuffle(rng, ['ไนซ์', 'โจ', 'แม็กซ์']);
      a[rest[0]] = S; a[rest[1]] = opp(S); a[rest[2]] = opp(S);
      [['โบว์ลิ่ง', 'ปอนด์'], ['ปอ', 'รุจิ'], ['ฮิว', 'พล']].forEach(function (p) { var c = coin(rng); a[p[0]] = c; a[p[1]] = opp(c); });
      // which odd subgroups give their extra player to Red (half and half; a lone odd subgroup is a coin toss)
      var extraRed = {}, order = shuffle(rng, odd), half = Math.floor(order.length / 2);
      order.forEach(function (k, j) { extraRed[k] = j < half ? true : j < 2 * half ? false : rng() < 0.5; });
      var ok = true;
      SUBGROUPS.forEach(function (g, k) {
        if (!ok) return;
        var target = g.length % 2 ? (g.length + (extraRed[k] ? 1 : -1)) / 2 : g.length / 2;
        var fixedRed = count(a, g, 'Red'), free = g.filter(function (n) { return !a[n]; });
        var need = target - fixedRed;
        if (need < 0 || need > free.length) { ok = false; return; }
        shuffle(rng, free).forEach(function (n, j) { a[n] = j < need ? 'Red' : 'Blue'; });
      });
      if (ok && check(a).length === 0) return a;
    }
    throw new Error('no assignment found');
  }

  root.DrawRules = { LABELS: LABELS, SUBGROUPS: SUBGROUPS, ROSTER: ROSTER, generate: generate, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DrawRules;
})(typeof window !== 'undefined' ? window : globalThis);
