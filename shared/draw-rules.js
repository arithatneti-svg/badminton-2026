/* ============================================================
   Team-draw rules for Sports Day, Saturday 14 Nov 2026 (the owner's brief, 2026-11-04).
   Pure logic, no DOM and no Firebase: the page loads it as window.DrawRules, scripts/test-draw-rules.mjs loads it in Node.
   generate() makes ONE full assignment of every player to Red / Blue; check() lists every rule a given assignment breaks.

   Rules (names are the ones in the roster below):
   1. ฝ้าย and หญิง always share a colour.
   2. Of นก / ยุ้ย / ปูม, exactly two are on the OTHER colour than ฝ้าย-หญิง; the third is 50/50.
   3. พี่เอิ้น and โอ๊ต are on different colours. หมี is Red, เพชร is Blue.
   4. ไนซ์ / โจ / แมค / เอแคลร์ split 2 and 2; whoever gets เอแคลร์ also gets พี่เอิ้น (so the other side gets โอ๊ต).
   5. Every subgroup (a line of the pasted list) splits evenly between the colours; an odd subgroup differs by one,
      and the extras are spread so that the two teams end with the same number of players.
   6. โบลิ่ง and ปอนด์ are on different colours; ปอ and รุจิ are on different colours.
   ============================================================ */
(function (root) {
  'use strict';

  // subgroup n = line n of the list the owner pasted
  var SUBGROUPS = [
    ['เพชร', 'หมี', 'พี่ก๊อป', 'Jokee', 'ฮิว', 'ปาย'],
    ['ฝ้าย', 'แจ็ค', 'ไทม์', 'อาร์ม'],
    ['บอส', 'เก้', 'เก่ง', 'พี่ต่อ', 'อรรถ'],
    ['พี่ชัย', 'พี่ต้น', 'ป๋า', 'ดุ๊ก', 'โจ๊ก', 'นก', 'ยุ้ย', 'ปูม'],
    ['นาย', 'หญิง', 'ต้น', 'อ๊อป', 'แชป'],
    ['โบลิ่ง', 'ปอนด์', 'เอแคลร์', 'ปอ', 'โจ', 'ไนซ์', 'แมค', 'รุจิ'],
    ['พี่เอิ้น', 'โอ๊ต']
  ];
  var ROSTER = [];
  SUBGROUPS.forEach(function (g, i) { g.forEach(function (n) { ROSTER.push({ name: n, subgroup: i + 1 }); }); });

  var PAIR_SAME = [['ฝ้าย', 'หญิง']];
  var TRIO = ['นก', 'ยุ้ย', 'ปูม'];
  var FIXED = { 'หมี': 'Red', 'เพชร': 'Blue' };
  var PAIR_OPPOSITE = [['พี่เอิ้น', 'โอ๊ต'], ['โบลิ่ง', 'ปอนด์'], ['ปอ', 'รุจิ']];
  var FOUR = ['ไนซ์', 'โจ', 'แมค', 'เอแคลร์'];

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
    if (count(a, TRIO, opp(X)) !== 2) bad.push('trio: exactly two must be opposite to ฝ้าย');
    Object.keys(FIXED).forEach(function (k) { if (a[k] !== FIXED[k]) bad.push(k + ' must be ' + FIXED[k]); });
    PAIR_OPPOSITE.forEach(function (p) { if (a[p[0]] === a[p[1]]) bad.push('different colours: ' + p.join(' vs ')); });
    if (count(a, FOUR, 'Red') !== 2) bad.push('four-group must split 2 / 2');
    if (a['เอแคลร์'] !== a['พี่เอิ้น']) bad.push('เอแคลร์ must be with พี่เอิ้น');
    var extra = 0;
    SUBGROUPS.forEach(function (g, i) {
      var r = count(a, g, 'Red'), b = g.length - r;
      if (Math.abs(r - b) > (g.length % 2)) bad.push('subgroup ' + (i + 1) + ' split ' + r + ' / ' + b);
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
      var freeOne = pick(rng, TRIO);
      TRIO.forEach(function (n) { a[n] = n === freeOne ? coin(rng) : Y; });
      Object.keys(FIXED).forEach(function (k) { a[k] = FIXED[k]; });
      var S = coin(rng);                       // the side that gets เอแคลร์ and พี่เอิ้น
      a['เอแคลร์'] = S; a['พี่เอิ้น'] = S; a['โอ๊ต'] = opp(S);
      var rest = shuffle(rng, ['ไนซ์', 'โจ', 'แมค']);
      a[rest[0]] = S; a[rest[1]] = opp(S); a[rest[2]] = opp(S);
      [['โบลิ่ง', 'ปอนด์'], ['ปอ', 'รุจิ']].forEach(function (p) { var c = coin(rng); a[p[0]] = c; a[p[1]] = opp(c); });
      // which odd subgroups give their extra player to Red (half and half, so the teams end equal)
      var extraRed = {}, order = shuffle(rng, odd);
      order.forEach(function (k, j) { extraRed[k] = j < order.length / 2; });
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

  root.DrawRules = { SUBGROUPS: SUBGROUPS, ROSTER: ROSTER, generate: generate, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DrawRules;
})(typeof window !== 'undefined' ? window : globalThis);
