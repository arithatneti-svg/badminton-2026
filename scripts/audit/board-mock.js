// Scoreboard-app (viewer / admin) test helpers (dev-only). Like umpire-mock.js: the database write path is
// replaced by an in-memory "server" kept apart from the page's own appState, so saves, merges and
// transactions run their real code against it and nothing reaches the real database.
// Usage: open /, load audit-helpers.js and then this file, wait until appState.players is filled,
// then call __audit.boardFreeze() once and __audit.boardMock(matches, role).
(function () {
  const A = window.__audit;
  if (!A) throw new Error("load scripts/audit/audit-helpers.js first");
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  window.__writes = window.__writes || [];
  A.board = { server: null };

  // what the realtime listener does when the server changes
  A.boardEcho = () => {
    const data = clone(A.board.server);
    _syncBase = clone(data);
    appState = data;
    if (!appState.ongoingMatches) appState.ongoingMatches = [];
    if (!appState.matchHistory) appState.matchHistory = [];
    updateUI();
    if (typeof renderAdminOngoingMatches === "function") renderAdminOngoingMatches();
    if (typeof renderPublicOngoingMatches === "function") renderPublicOngoingMatches();
  };

  A.boardFreeze = () => {
    if (!(appState && appState.players && appState.players.length)) throw new Error("data not loaded yet - wait for the players before freezing the listener");
    try { dbRef.off(); } catch (e) {}
    A.guard();
    A.board.server = clone(appState);
    const P = firebase.database.Reference.prototype;
    P.transaction = function (fn) {
      const url = this.toString();
      if (/sportsday_2026_data\/?$/.test(url)) {      // the root: merge-saves and setMatchField
        const root = clone(A.board.server);
        const out = fn(root);
        window.__writes.push({ path: "root", committed: out !== undefined });
        if (out === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => root } });
        A.board.server = clone(out);
        setTimeout(A.boardEcho, 30);
        return Promise.resolve({ committed: true, snapshot: { val: () => out } });
      }
      window.__writes.push({ path: url, committed: false });
      return Promise.resolve({ committed: false, snapshot: { val: () => null } });
    };
    return { frozen: true };
  };

  // matches on the "server" and on the screen; `role` ('admin' | 'guest' …) is a local variable only — no login, no passcode
  A.boardMock = (matches, role) => {
    A.board.server = Object.assign(clone(A.board.server), { ongoingMatches: clone(matches), matchHistory: clone(A.board.server.matchHistory || []) });
    if (role) userRole = role;
    A.boardEcho();
    return { matches: matches.length, role: userRole };
  };

  A.boardMatches = (n) => {
    const ps = (appState.players || []).slice();
    const red = ps.filter((p) => p.team === "Red"), blue = ps.filter((p) => p.team === "Blue");
    const nm = (a, b) => [a, b].map((p) => p.name + " (G" + p.group + ")").join(" & ");
    const out = [];
    for (let i = 0; i < n; i++) {
      const r1 = red[(2 * i) % red.length], r2 = red[(2 * i + 1) % red.length], b1 = blue[(2 * i) % blue.length], b2 = blue[(2 * i + 1) % blue.length];
      out.push({ id: "T" + String(1 + i).padStart(2, "0"), round: "1", r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id, redNames: nm(r1, r2), blueNames: nm(b1, b2) });
    }
    return out;
  };

  // change a match on the server only (an umpire did it), then let the page hear about it
  A.boardServerEdit = (id, fn, echo) => {
    const m = A.board.server.ongoingMatches.find((x) => x.id === id); if (!m) throw new Error("no such match on the server: " + id);
    fn(m);
    if (echo !== false) A.boardEcho();
  };
})();
