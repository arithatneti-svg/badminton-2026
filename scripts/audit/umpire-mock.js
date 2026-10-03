// Umpire-app test helpers (dev-only). They swap the Firebase write path for an in-memory store, so a
// claim / score / submit can be exercised end to end without anything reaching the real database.
// Usage: open /umpire.html, load audit-helpers.js and then this file, wait until appState.players is
// filled, then call __audit.umpFreeze() once and __audit.umpMock([...]) to put matches on the courts.
(function () {
  const A = window.__audit;
  if (!A) throw new Error("load scripts/audit/audit-helpers.js first");
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  window.__writes = window.__writes || [];

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
        const cur = clone(appState.ongoingMatches[i]);
        const out = fn(cur === undefined ? null : cur);
        window.__writes.push({ path: "ongoingMatches/" + i, committed: out !== undefined });
        if (out === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => cur } });
        appState.ongoingMatches[i] = out;
        setTimeout(updateCurrentScreen, 0);
        return Promise.resolve({ committed: true, snapshot: { val: () => out } });
      }
      if (/sportsday_2026_data\/?$/.test(url)) {      // the whole root, as _umpFinalize does
        const root = { ongoingMatches: clone(appState.ongoingMatches), matchHistory: clone(appState.matchHistory), globalScoreRed: appState.globalScoreRed || 0, globalScoreBlue: appState.globalScoreBlue || 0 };
        const out = fn(root);
        window.__writes.push({ path: "root", committed: out !== undefined });
        if (out === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => root } });
        appState.ongoingMatches = out.ongoingMatches; appState.matchHistory = out.matchHistory;
        appState.globalScoreRed = out.globalScoreRed; appState.globalScoreBlue = out.globalScoreBlue;
        A.umpIndex();
        setTimeout(updateCurrentScreen, 0);
        return Promise.resolve({ committed: true, snapshot: { val: () => out } });
      }
      window.__writes.push({ path: url, committed: false });
      return Promise.resolve({ committed: false, snapshot: { val: () => null } });
    };
    return { frozen: true, writes: window.__writes.length };
  };

  A.umpIndex = () => { _uKeys = {}; appState.ongoingMatches.forEach((m, i) => { if (m && m.id) _uKeys[m.id] = String(i); }); };

  // players from the real roster so names and faces look real
  A.umpMatches = (n, opts) => {
    opts = opts || {};
    const ps = (appState.players || []).slice();
    const red = ps.filter((p) => p.team === "Red"), blue = ps.filter((p) => p.team === "Blue");
    const nm = (a, b) => [a, b].map((p) => p.name + " (G" + p.group + ")").join(" & ");
    const out = [];
    for (let i = 0; i < n; i++) {
      const r1 = red[(2 * i) % red.length], r2 = red[(2 * i + 1) % red.length], b1 = blue[(2 * i) % blue.length], b2 = blue[(2 * i + 1) % blue.length];
      out.push({ id: "M" + String(1 + i).padStart(2, "0"), round: "1", r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id, redNames: nm(r1, r2), blueNames: nm(b1, b2) });
    }
    return out;
  };

  // put matches on the screen as umpire `name` (kept in this browser's localStorage only)
  A.umpMock = (matches, name) => {
    appState.ongoingMatches = matches;
    A.umpIndex();
    if (name) { currentUmpire = name; localStorage.setItem("bdm_umpire_name", name); }
    updateCurrentScreen();
    return { matches: matches.length, umpire: currentUmpire };
  };

  // the usual test bench: M01 M04 M05 M06 free · M02 held by another umpire on court 3 · M03 mine, taken before courts existed
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
})();
