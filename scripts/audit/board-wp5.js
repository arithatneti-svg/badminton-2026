// WP5 test helpers for the Scoreboard app (viewer / admin), dev-only: the phone nav, touch targets, the loading /
// empty / error states. Needs audit-helpers.js and board-mock.js loaded first. Nothing reaches Firebase: the write path
// is stubbed and the realtime listener detached (boardFreeze) BEFORE any role is switched, and a role here is only a
// local variable + body class — no login, no passcode.
(function () {
  const A = window.__audit;
  if (!A || !A.boardFreeze) throw new Error("load audit-helpers.js and board-mock.js first");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = (e) => e.getBoundingClientRect();
  const vis = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden";
  window.__sleep = sleep;

  // data loaded -> writes stubbed -> three courts (one in game 2 with a court, one in game 1, one waiting) + three results
  A.wp5Setup = async () => {
    const t0 = Date.now();
    while (!(typeof appState !== "undefined" && appState.players && appState.players.length) && Date.now() - t0 < 25000) await sleep(250);
    A.boardFreeze();
    const now = Date.now(), ms = A.boardMatches(4);
    Object.assign(ms[0], { umpire: "ทดสอบ", court: 3, claimedAt: now - 900000, timerStartedAt: now - 800000, live: { g1R: 21, g1B: 19, g2R: 12, g2B: 10, g1Locked: true, isPaused: false, elapsedMs: 0, lastAt: now - 4000 } });
    Object.assign(ms[1], { umpire: "สมหญิง", court: 5, claimedAt: now - 300000, timerStartedAt: now - 200000, live: { g1R: 15, g1B: 17, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: now - 4000 } });
    const base = A.boardMatches(3);
    const hist = (i, g1, g2, rS, bS, res, pr, pb) => Object.assign({}, base[i], { id: "H0" + (i + 1), game1: g1, game2: g2, result: res, pRed: pr, pBlue: pb, rStat: rS, bStat: bS, duration: 1500000, umpire: "ทดสอบ", court: 3 + i });
    A.board.server.matchHistory = [hist(0, "21:15", "21:17", "W", "L", "🔴 Red Win 2–0 (+3pts)", 3, 0), hist(1, "15:21", "18:21", "L", "W", "🔵 Blue Win 2–0 (+3pts)", 0, 3), hist(2, "21:19", "19:21", "D", "D", "🤝 เสมอ 1–1 (+1pt each)", 1, 1)];
    A.boardMock(ms, "guest");
    await sleep(400);
    return { players: appState.players.length, ongoing: appState.ongoingMatches.length, history: appState.matchHistory.length };
  };

  // guest | admin | superadmin — a variable and a body class only
  window.__setRole = (role) => {
    document.body.classList.remove("guest-mode", "admin-mode", "superadmin-mode");
    if (role === "guest") { userRole = "guest"; document.body.classList.add("guest-mode"); }
    else if (role === "admin") { userRole = "admin"; document.body.classList.add("admin-mode"); }
    else { userRole = "superadmin"; document.body.classList.add("admin-mode", "superadmin-mode"); }
  };

  // the top bar for one role: height, tab sizes, how many tabs are on screen at once, the ⋯ button, targets under 44 px
  A.wp5Nav = async (role) => {
    window.__setRole(role); await sleep(180);
    const nav = document.getElementById("mainNav"), nr = R(nav), strip = nav.querySelector(".nav-tabs"), sr = R(strip);
    const tabs = [...nav.querySelectorAll(".tab-btn")].filter(vis), more = document.getElementById("navMoreBtn");
    const small = A.small("#mainNav", 44);
    return {
      role, size: innerWidth + "x" + innerHeight, navH: Math.round(nr.height), navPct: Math.round((nr.height / innerHeight) * 1000) / 10,
      tabs: tabs.length, tabH: [...new Set(tabs.map((t) => Math.round(R(t).height)))].join("/"), tabW: tabs.map((t) => Math.round(R(t).width)).join(","),
      onScreen: tabs.filter((t) => R(t).left >= sr.left - 1 && R(t).right <= sr.right + 1).length, fade: strip.dataset.fade || "-",
      more: vis(more) ? Math.round(R(more).width) + "x" + Math.round(R(more).height) : "hidden", docSW: document.documentElement.scrollWidth, small44: small.length,
    };
  };
})();
