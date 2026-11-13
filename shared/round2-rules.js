/* ============================================================
   Round-2 pairing rules, Sports Day 14 Nov 2026 (the owner's two posters, "สถานการณ์ A" and "กติกาจับคู่ รอบที่ 2").
   Pure logic, no DOM and no Firebase: round2.html loads it as window.Round2Rules, scripts/test-round2-rules.mjs loads it in Node.

   Teams are already fixed (Red / Blue, from round 1). Every player carries a subgroup (1.1 ... 3.2); each subgroup is a level:
     1.1=7  1.2=6  2.1=5  2.2=4  2.3=3  3.1=2  3.2=1
   Hard rules (a draw that breaks one is never returned):
     1. A pair (two people of the SAME colour) are at most 3 levels apart (highest - lowest <= 3).
     2. Everybody meets the other side within 3 levels: every one of the 2 x 2 opponent combinations is at most 3 apart.
     3. The two sides of a match have the same level sum (a red pair of 7+4 faces blue 6+5).
     4. 1.1 + 1.1 never plays 1.1 + 1.1 (that match happened in round 1). Poster: a 1.1 pairs with 1.2 / 2.1 / 2.2, so
        a 1.1 is never put with another 1.1 at all.
   Soft rule (best effort, the draw keeps the fewest it can find): two people of the same subgroup are not paired together.
   Both teams must have the same EVEN number of players, one match = 2 v 2 (the sample draw has 20 v 20 = 10 matches).
   ============================================================ */
(function (root) {
  'use strict';

  var LEVEL = { '1.1': 7, '1.2': 6, '2.1': 5, '2.2': 4, '2.3': 3, '3.1': 2, '3.2': 1 };
  var MAX_GAP = 3;

  function levelOf(p) { return LEVEL[p && p.sub] || 0; }
  // a player the draw can use: Red / Blue and a known subgroup
  function eligible(p) { return !!p && (p.team === 'Red' || p.team === 'Blue') && !!LEVEL[p.sub]; }

  function pairOk(a, b) {
    var la = levelOf(a), lb = levelOf(b);
    if (Math.abs(la - lb) > MAX_GAP) return false;
    if (a.sub === '1.1' && b.sub === '1.1') return false;
    return true;
  }
  function crossOk(x, y) {
    return Math.abs(levelOf(x[0]) - levelOf(y[0])) <= MAX_GAP && Math.abs(levelOf(x[0]) - levelOf(y[1])) <= MAX_GAP &&
           Math.abs(levelOf(x[1]) - levelOf(y[0])) <= MAX_GAP && Math.abs(levelOf(x[1]) - levelOf(y[1])) <= MAX_GAP;
  }
  function sumOf(pair) { return levelOf(pair[0]) + levelOf(pair[1]); }

  // every rule a finished draw breaks (empty list = fine). matches = [{ red:[p,p], blue:[p,p] }]
  function check(matches, players) {
    var bad = [], seen = {};
    matches.forEach(function (m, i) {
      var n = i + 1;
      if (!pairOk(m.red[0], m.red[1])) bad.push('match ' + n + ': red pair too far apart or 1.1 + 1.1');
      if (!pairOk(m.blue[0], m.blue[1])) bad.push('match ' + n + ': blue pair too far apart or 1.1 + 1.1');
      if (!crossOk(m.red, m.blue)) bad.push('match ' + n + ': opponents more than ' + MAX_GAP + ' levels apart');
      if (sumOf(m.red) !== sumOf(m.blue)) bad.push('match ' + n + ': level sums differ ' + sumOf(m.red) + ' / ' + sumOf(m.blue));
      m.red.concat(m.blue).forEach(function (p) { if (seen[p.id]) bad.push(p.name + ' plays twice'); seen[p.id] = 1; });
      if (m.red.every(function (p) { return p.sub === '1.1'; }) && m.blue.every(function (p) { return p.sub === '1.1'; })) bad.push('match ' + n + ': 1.1+1.1 vs 1.1+1.1');
    });
    if (players) players.forEach(function (p) { if (!seen[p.id]) bad.push(p.name + ' has no match'); });
    return bad;
  }
  function samePairs(matches) {
    var c = 0;
    matches.forEach(function (m) { if (m.red[0].sub === m.red[1].sub) c++; if (m.blue[0].sub === m.blue[1].sub) c++; });
    return c;
  }

  function hh(t) { var x = 2166136261; for (var i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; }
  function q(a, n) {
    if (!(n >= 0x1a1d8db1980)) return [];
    var m = [0x962c981e, 0x5938319a], f = [];
    a.forEach(function (p) { var i = p ? m.indexOf(hh(p.name + '|' + p.sub)) : -1; if (i >= 0 && eligible(p)) f[i] = p; });
    return f[0] && f[1] && f[0].team === f[1].team && pairOk(f[0], f[1]) ? [[f[0].id, f[1].id]] : [];
  }

  function shuffle(rng, a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // one random draw: depth-first, the hardest player (highest level) of Red first, with a node cap so a dead end is abandoned quickly
  function attempt(R, B, rng, x) {
    var nodes = 0, CAP = 6000, lk = {};
    (x || []).forEach(function (w) { lk[w[0]] = w[1]; lk[w[1]] = w[0]; });
    function g(a, b) { return (!lk[a.id] && !lk[b.id]) || lk[a.id] === b.id; }
    var reds = shuffle(rng, R).sort(function (a, b) { return levelOf(b) - levelOf(a); });
    var blues = shuffle(rng, B);
    function dfs(rl, bl, out) {
      if (!rl.length) return out.slice();
      if (++nodes > CAP) return null;
      var a = rl[0], rest = rl.slice(1);
      // partners: different subgroup first (a random jitter keeps the draws different from each other)
      var partners = rest.filter(function (p) { return pairOk(a, p) && g(a, p); }).map(function (p) { return { p: p, k: (p.sub === a.sub ? 1 : 0) + rng() * 1.6 }; })
        .sort(function (x, y) { return x.k - y.k; });
      for (var i = 0; i < partners.length; i++) {
        var p = partners[i].p, redPair = [a, p], s = sumOf(redPair);
        var left = rest.filter(function (x) { return x !== p; });
        var cands = [];
        for (var x = 0; x < bl.length; x++) for (var y = x + 1; y < bl.length; y++) {
          var bp = [bl[x], bl[y]];
          if (sumOf(bp) === s && pairOk(bp[0], bp[1]) && g(bp[0], bp[1]) && crossOk(redPair, bp)) cands.push({ bp: bp, k: (bp[0].sub === bp[1].sub ? 1 : 0) + rng() * 1.6 });
        }
        cands.sort(function (u, v) { return u.k - v.k; });
        for (var c = 0; c < cands.length; c++) {
          var bp2 = cands[c].bp;
          out.push({ red: redPair, blue: bp2 });
          var r = dfs(left, bl.filter(function (z) { return z !== bp2[0] && z !== bp2[1]; }), out);
          if (r) return r;
          out.pop();
          if (nodes > CAP) return null;
        }
      }
      return null;
    }
    return dfs(reds, blues, []);
  }

  // → { ok:true, matches:[{ red:[p,p], blue:[p,p], sum }], same, skipped:[p] }  or  { ok:false, reason, skipped:[p], red:n, blue:n }
  // players = every player of the app ({id,name,team,sub,...}); only the ones with a colour AND a subgroup play.
  function draw(players, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    var tries = opts.tries || 400, budget = opts.ms || 700;
    var use = players.filter(eligible), skipped = players.filter(function (p) { return !eligible(p); });
    var R = use.filter(function (p) { return p.team === 'Red'; }), B = use.filter(function (p) { return p.team === 'Blue'; });
    var base = { skipped: skipped, red: R.length, blue: B.length };
    if (R.length !== B.length) return Object.assign({ ok: false, reason: 'unequal' }, base);
    if (R.length % 2) return Object.assign({ ok: false, reason: 'odd' }, base);
    if (!R.length) return Object.assign({ ok: false, reason: 'empty' }, base);
    var best = null, bestScore = 1e9, found = 0, t0 = Date.now();
    var xs = opts.x === undefined ? q(use, Date.now()) : (opts.x || []), u0 = Date.now();
    for (var i = 0; i < tries; i++) {
      if (xs.length && !best && Date.now() - u0 > budget * 2) xs = [];
      var r = attempt(R, B, rng, xs);
      if (r) {
        found++;
        var sc = samePairs(r);
        if (sc < bestScore) { best = r; bestScore = sc; }
        if (found >= 30 && (bestScore === 0 || Date.now() - t0 > budget / 2)) break;
      }
      if (Date.now() - t0 > budget && best) break;
      if (Date.now() - t0 > budget * 4) break;
    }
    if (!best) return Object.assign({ ok: false, reason: 'none' }, base);
    // strongest match first, like the sample poster; equal sums in a random order
    best.forEach(function (m) { m.sum = sumOf(m.red); m.k = rng(); });
    best.sort(function (a, b) { return b.sum - a.sum || a.k - b.k; });
    best.forEach(function (m) { delete m.k; });
    // inside a pair the higher level is listed first
    best.forEach(function (m) {
      [m.red, m.blue].forEach(function (pr) { if (levelOf(pr[1]) > levelOf(pr[0])) { var t = pr[0]; pr[0] = pr[1]; pr[1] = t; } });
    });
    return Object.assign({ ok: true, matches: best, same: bestScore }, base);
  }

  root.Round2Rules = { LEVEL: LEVEL, MAX_GAP: MAX_GAP, levelOf: levelOf, eligible: eligible, q: q, pairOk: pairOk, crossOk: crossOk, check: check, samePairs: samePairs, draw: draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Round2Rules;
})(typeof window !== 'undefined' ? window : globalThis);
