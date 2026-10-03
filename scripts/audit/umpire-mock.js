// Umpire-app test helpers (dev-only). They swap the Firebase write path for an in-memory "server", so a
// claim / score / submit can be exercised end to end without anything reaching the real database.
// The server copy (__audit.server) is separate from the page's own appState, exactly like the real thing:
// a transaction runs against the server copy, and the page sees the result as an echo a moment later,
// so an optimistic local edit is never applied twice and a stale local view can lose a race.
// Usage: open /umpire.html, load audit-helpers.js and then this file, wait until appState.players is
// filled, then call __audit.umpFreeze() once and __audit.umpScenario() (or umpMock([...])).
(function () {
  const A = window.__audit;
  if (!A) throw new Error("load scripts/audit/audit-helpers.js first");
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  window.__writes = window.__writes || [];
  A.server = { ongoing: [], history: [], red: 0, blue: 0 };
  // What the network does to a transaction: ok · slow (answers after delayMs) · hang (never answers: a Wi-Fi that stopped
  // replying while the SDK still thinks it is online) · fail (throws). held[] keeps the hung ones so a test can release them later.
  A.net = { mode: "ok", delayMs: 0, held: [] };
  A.umpNetMode = (mode, delayMs) => { A.net.mode = mode; A.net.delayMs = delayMs || 0; return A.net.mode; };
  A.umpRelease = () => { const h = A.net.held.splice(0); h.forEach((f) => f()); return h.length; };
  // run the real code on the server copy, then deliver the answer the way the network allows
  const deliver = (work) => {
    const m = A.net.mode;
    if (m === "fail") return Promise.reject(new Error("network error (mock)"));
    if (m === "hang") return new Promise((resolve) => { A.net.held.push(() => resolve(work())); });
    if (m === "slow") return new Promise((resolve) => setTimeout(() => resolve(work()), A.net.delayMs));
    return Promise.resolve(work());
  };

  // what the realtime listener does when the server changes
  A.umpEcho = () => {
    appState.ongoingMatches = clone(A.server.ongoing);
    appState.matchHistory = clone(A.server.history);
    appState.globalScoreRed = A.server.red; appState.globalScoreBlue = A.server.blue;
    A.umpIndex();
    updateCurrentScreen();
  };

  A.umpFreeze = () => {
    if (!(appState && appState.players && appState.players.length)) throw new Error("data not loaded yet - wait for the players before freezing the listener");
    try { dbRef.off(); } catch (e) {}                 // no more live snapshots over our mock data
    A.guard();                                        // every other write method becomes a no-op
    const P = firebase.database.Reference.prototype;
    P.transaction = function (fn) {
      const url = this.toString();
      const one = /\/ongoingMatches\/(\d+)$/.exec(url);
      if (one) {                                      // one match, as _umpMutate does
        const i = +one[1];
        return deliver(() => {
          const cur = clone(A.server.ongoing[i]);
          const out = fn(cur === undefined ? null : cur);
          window.__writes.push({ path: "ongoingMatches/" + i, committed: out !== undefined });
          if (out === undefined) return { committed: false, snapshot: { val: () => cur } };
          A.server.ongoing[i] = clone(out);
          setTimeout(A.umpEcho, 30);
          return { committed: true, snapshot: { val: () => out } };
        });
      }
      if (/sportsday_2026_data\/?$/.test(url)) {      // the whole root, as _umpFinalize does
        return deliver(() => {
          const root = { ongoingMatches: clone(A.server.ongoing), matchHistory: clone(A.server.history), globalScoreRed: A.server.red, globalScoreBlue: A.server.blue };
          const out = fn(root);
          window.__writes.push({ path: "root", committed: out !== undefined });
          if (out === undefined) return { committed: false, snapshot: { val: () => root } };
          A.server.ongoing = clone(out.ongoingMatches); A.server.history = clone(out.matchHistory);
          A.server.red = out.globalScoreRed; A.server.blue = out.globalScoreBlue;
          setTimeout(A.umpEcho, 30);
          return { committed: true, snapshot: { val: () => out } };
        });
      }
      window.__writes.push({ path: url, committed: false });
      return Promise.resolve({ committed: false, snapshot: { val: () => null } });
    };
    return { frozen: true, writes: window.__writes.length };
  };

  A.umpIndex = () => { _uKeys = {}; appState.ongoingMatches.forEach((m, i) => { if (m && m.id) _uKeys[m.id] = String(i); }); };

  // players from the real roster so names and faces look real
  A.umpMatches = (n) => {
    const ps = (appState.players || []).slice();
    const red = ps.filter((p) => p.team === "Red"), blue = ps.filter((p) => p.team === "Blue");
    const nm = (a, b) => [a, b].map((p) => p.name + " (G" + p.group + ")").join(" & ");
    const out = [];
    for (let i = 0; i < n; i++) {
      const r1 = red[(2 * i) % red.length], r2 = red[(2 * i + 1) % red.length], b1 = blue[(2 * i) % blue.length], b2 = blue[(2 * i + 1) % blue.length];
      // "T01"... — never "M01": the real history already holds M-numbers, and a submit of a clashing id is refused as "already recorded"
      out.push({ id: "T" + String(1 + i).padStart(2, "0"), round: "1", r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id, redNames: nm(r1, r2), blueNames: nm(b1, b2) });
    }
    return out;
  };

  // put matches on the "server" and on the screen as umpire `name` (kept in this browser's localStorage only)
  A.umpMock = (matches, name) => {
    A.server = { ongoing: clone(matches), history: clone(appState.matchHistory) || [], red: appState.globalScoreRed || 0, blue: appState.globalScoreBlue || 0 };
    A.umpEcho();
    if (name) { currentUmpire = name; localStorage.setItem("bdm_umpire_name", name); }
    updateCurrentScreen();
    return { matches: matches.length, umpire: currentUmpire };
  };

  // the usual test bench: T01 T04 T05 T06 free · T02 held by another umpire on court 3 · T03 mine, taken before courts existed
  A.umpScenario = (name) => {
    name = name || "ทดสอบ";
    const ms = A.umpMatches(6), now = Date.now();
    const live = (r, b) => ({ g1R: r, g1B: b, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0 });
    Object.assign(ms[1], { umpire: "ผู้ตัดสินอื่น", court: 3, live: live(5, 4), timerStartedAt: now - 300000 });
    Object.assign(ms[2], { umpire: name, live: live(2, 1), timerStartedAt: now - 120000 });
    A.umpMock(ms, name);
    goToTab("live");
    return { matches: ms.length, umpire: name };
  };

  // change a match on the server only (another umpire / the admin did it), then let the page hear about it
  A.umpServerEdit = (id, fn, echo) => {
    const m = A.server.ongoing.find((x) => x.id === id); if (!m) throw new Error("no such match on the server: " + id);
    fn(m);
    if (echo !== false) A.umpEcho();
  };
})();
