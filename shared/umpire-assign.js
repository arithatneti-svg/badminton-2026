/* ============================================================
   Umpire suggestions (admin tool). Pure logic: no DOM, no Firebase. The admin page (js/umpire-assign.js) and
   scripts/test-umpire-assign.mjs both load it.

   Who may umpire which match (owner's rule, 13 Nov 2026):
     "hand" = the number before the dot of a player's subgroup (1.x = hand 1 ... 3.x = hand 3).
     A match's hand = the strongest (lowest number) hand among its four players.
     hand 1 and hand 2 players may umpire ANY match; a hand-3 player may umpire only a hand-3 match.
     Hand-3 umpires are used on hand-3 matches first (hand 1-2 umpires are kept for their own level and only fall
     back to a hand-3 match when no hand-3 umpire is free).
   Two kinds of waiting match (owner, 14 Nov: 5 courts start together, the next one enters whenever a court frees up):
     FIRST BATCH = the first (courts - matches live) places of the queue. They start now, nobody has finished yet, so the
       umpire comes from people who are not in those matches (and, if possible, not in the next two to start).
     LATER = every other place. The umpire must be somebody who has FINISHED playing: no match left in the queue, the
       waiting box or on a court. If nobody like that is ticked free yet, the row says so instead of suggesting a player who
       has not played.
   Always left out: the four players of the match, anybody playing or umpiring right now, and anybody already
     suggested / assigned to another match.
   Order inside a level: the HIGHER the umpire's level the earlier (1.1 > 1.2 > 2.1 > 2.2 > 2.3 > 3.1 > 3.2), softened by how
     many matches they have umpired: score = matches umpired (pending assignments count) + 0.5 per level step below 1.1, lowest
     score first. So the strong players are suggested first, but one who has already umpired 2+ more than a weaker free
     player steps back. Ties: the colour (Red / Blue) that has umpired fewer matches, then who has waited longest, then name.
   It is only a suggestion: the admin can pick anybody, and any umpire can still take any match.
   A player without a subgroup has no known level and is treated as hand 3 (the most careful reading).
   ============================================================ */
(function (root) {
  'use strict';

  function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : (x && typeof x === 'object' ? Object.values(x).filter(Boolean) : []); }

  function handOf(p) {
    var s = p && p.sub, h = s ? parseInt(String(s).split('.')[0], 10) : NaN;
    return h === 1 || h === 2 || h === 3 ? h : 3;
  }
  // sub-group → rank 7 (1.1) ... 1 (3.2); no known subgroup = lowest. Each step below 1.1 adds half a match of "load".
  var LV = { '1.1': 7, '1.2': 6, '2.1': 5, '2.2': 4, '2.3': 3, '3.1': 2, '3.2': 1 };
  function levelPenalty(p) { return (7 - (LV[p && p.sub] || 1)) * 0.5; }
  function knownLevel(p) { var h = p && p.sub ? parseInt(String(p.sub).split('.')[0], 10) : NaN; return h === 1 || h === 2 || h === 3; }

  function matchHand(m, byId) {
    var hs = [m.r1, m.r2, m.b1, m.b2].map(function (id) { return byId[id]; }).filter(Boolean).map(handOf);
    return hs.length ? Math.min.apply(null, hs) : 3;
  }

  function indexPlayers(players) {
    var byId = {}, byName = {};
    arr(players).forEach(function (p) { byId[p.id] = p; if (p.name && !(p.name in byName)) byName[p.name] = p; });
    return { byId: byId, byName: byName };
  }

  // how many matches each colour has umpired (finished + being umpired now) and how many different people
  function balance(players, history, ongoing) {
    var ix = indexPlayers(players), out = { Red: { matches: 0, people: {} }, Blue: { matches: 0, people: {} } };
    function add(name) {
      var p = ix.byName[name]; if (!p || (p.team !== 'Red' && p.team !== 'Blue')) return;
      out[p.team].matches++; out[p.team].people[p.id] = 1;
    }
    arr(history).forEach(function (h) { if (h.umpire) add(h.umpire); });
    arr(ongoing).forEach(function (m) { if (m.umpire) add(m.umpire); });
    return { red: { matches: out.Red.matches, people: Object.keys(out.Red.people).length },
             blue: { matches: out.Blue.matches, people: Object.keys(out.Blue.people).length } };
  }

  // opts: { players, history, ongoing, staged, avail (object id→true | array of ids), maxPicks, courts (default 5) }
  // → [{ id, kind:'queue'|'staged', hand, assigned, picks:[{id,name,hand,team,count,known}], reason }]
  function suggest(opts) {
    var ix = indexPlayers(opts.players), maxPicks = opts.maxPicks || 3;
    var availIds = Array.isArray(opts.avail) ? opts.avail : Object.keys(opts.avail || {}).filter(function (k) { return opts.avail[k]; });
    var ongoing = arr(opts.ongoing), history = arr(opts.history);
    var queue = ongoing.filter(function (m) { return !m.umpire; });
    var live = ongoing.filter(function (m) { return m.umpire; });
    var list = queue.map(function (m) { return { m: m, kind: 'queue' }; }).concat(arr(opts.staged).map(function (m) { return { m: m, kind: 'staged' }; }));

    var count = {}, lastIdx = {}, colourN = { Red: 0, Blue: 0 };
    function bump(name, i) {
      count[name] = (count[name] || 0) + 1; if (i !== undefined) lastIdx[name] = i;
      var p = ix.byName[name]; if (p && colourN[p.team] !== undefined) colourN[p.team]++;
    }
    history.forEach(function (h, i) { if (h.umpire) bump(h.umpire, i); });
    live.forEach(function (m) { bump(m.umpire, history.length); });
    queue.forEach(function (m) { if (m.assigned) bump(m.assigned); });   // a reservation counts as work already given

    var busy = {};   // playing or umpiring right now
    live.forEach(function (m) {
      [m.r1, m.r2, m.b1, m.b2].forEach(function (id) { busy[id] = 1; });
      var u = ix.byName[m.umpire]; if (u) busy[u.id] = 1;
    });

    var courts = opts.courts || 5, freeCourts = Math.max(0, courts - live.length);
    var pending = {};   // somebody who still has a match to play (queue or waiting box); the ones on court are in busy
    list.forEach(function (row) { [row.m.r1, row.m.r2, row.m.b1, row.m.b2].forEach(function (id) { pending[id] = 1; }); });

    var used = {};   // names already given to a match above (assigned or suggested first choice)
    queue.forEach(function (m) { if (m.assigned) used[m.assigned] = 1; });

    return list.map(function (row, k) {
      var m = row.m, mh = matchHand(m, ix.byId);
      var own = {}; [m.r1, m.r2, m.b1, m.b2].forEach(function (id) { own[id] = 1; });
      var first = k < freeCourts, now = {}, next = {};
      list.forEach(function (r2, j) {
        var tgt = j < freeCourts ? now : j < freeCourts + 2 ? next : null;
        if (tgt) [r2.m.r1, r2.m.r2, r2.m.b1, r2.m.b2].forEach(function (id) { tgt[id] = 1; });
      });
      function build(strict) {
        return availIds.map(function (id) { return ix.byId[id]; }).filter(Boolean).filter(function (p) {
          if (p.team !== 'Red' && p.team !== 'Blue') return false;   // only players with a colour take part today
          if (own[p.id] || busy[p.id]) return false;
          if (first ? (now[p.id] || (strict && next[p.id])) : pending[p.id]) return false;   // later matches: finished players only
          if (used[p.name] && p.name !== m.assigned) return false;
          var uh = handOf(p);
          return uh <= 2 || mh === 3;                              // hand 3 only on a hand-3 match
        });
      }
      var pool = build(true);
      if (first && !pool.length) pool = build(false);
      var cands = pool.map(function (p) {
        var uh = handOf(p), fit = mh === 3 ? (uh === 3 ? 0 : 1) : 0;
        return { p: p, uh: uh, fit: fit, n: count[p.name] || 0, sc: (count[p.name] || 0) + levelPenalty(p),
                 col: colourN[p.team] !== undefined ? colourN[p.team] : 0, idle: lastIdx[p.name] === undefined ? -1 : lastIdx[p.name] };
      });
      cands.sort(function (a, b) {
        return a.fit - b.fit || a.sc - b.sc || a.col - b.col || a.idle - b.idle || String(a.p.name).localeCompare(String(b.p.name), 'th');
      });
      var picks = cands.slice(0, maxPicks).map(function (c) {
        return { id: c.p.id, name: c.p.name, hand: c.uh, team: c.p.team || '', sub: c.p.sub || '', count: c.n, known: knownLevel(c.p) };
      });
      if (!m.assigned && picks.length) used[picks[0].name] = 1;   // the first choice is spoken for
      var reason = '';
      if (!picks.length) reason = !availIds.length ? 'ยังไม่ได้เลือกกรรมการที่ว่าง'
        : first ? 'ไม่มีกรรมการว่างที่ระดับพอ (หรือกำลังเล่นอยู่)' : 'ต้องเป็นคนที่เล่นเสร็จแล้ว — ยังไม่มีคนที่เล่นเสร็จและติ๊กว่างไว้';
      return { id: m.id, kind: row.kind, batch: first ? 'first' : 'later', hand: mh, assigned: m.assigned || '', picks: picks, reason: reason };
    });
  }

  var api = { handOf: handOf, matchHand: matchHand, balance: balance, suggest: suggest, knownLevel: knownLevel };
  root.UmpireAssign = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
