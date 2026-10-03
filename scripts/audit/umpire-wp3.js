// WP3 measurements for the umpire app (dev-only): contrast on the three screens P-09 names, touch targets
// under 48 px (P-06), what sits on top while paused (P-07), the tap count on the scoring screen (JU-E3).
// Needs audit-helpers.js + umpire-mock.js loaded and __audit.umpFreeze() called. Nothing reaches Firebase.
(function () {
  const A = window.__audit;
  if (!A || !A.umpFreeze) throw new Error("load audit-helpers.js and umpire-mock.js first");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const short = (c) => ({ total: c.total, fail: c.fail, worst: (c.worst || []).slice(0, 6).map((w) => [w.sel, w.fg, w.bg, w.ratio, w.fs + "px", w.sample].join(" | ")) });

  // taken card + free cards + mine; three finished results (win, win, draw); a match in game 2
  A.wp3Setup = async () => {
    A.umpScenario(); await sleep(150);
    const hist = [
      { id: "H01", round: "1", r1: A.server.ongoing[0].r1, r2: A.server.ongoing[0].r2, b1: A.server.ongoing[0].b1, b2: A.server.ongoing[0].b2, redNames: A.server.ongoing[0].redNames, blueNames: A.server.ongoing[0].blueNames, game1: "21:15", game2: "21:17", result: "🔴 Red Win 2–0 (+3pts)", pRed: 3, pBlue: 0, rStat: "W", bStat: "L", duration: 1500000, umpire: "ทดสอบ" },
      { id: "H02", round: "1", r1: A.server.ongoing[1].r1, r2: A.server.ongoing[1].r2, b1: A.server.ongoing[1].b1, b2: A.server.ongoing[1].b2, redNames: A.server.ongoing[1].redNames, blueNames: A.server.ongoing[1].blueNames, game1: "15:21", game2: "18:21", result: "🔵 Blue Win 2–0 (+3pts)", pRed: 0, pBlue: 3, rStat: "L", bStat: "W", duration: 1300000, umpire: "ผู้ตัดสินอื่น" },
      { id: "H03", round: "1", r1: A.server.ongoing[2].r1, r2: A.server.ongoing[2].r2, b1: A.server.ongoing[2].b1, b2: A.server.ongoing[2].b2, redNames: A.server.ongoing[2].redNames, blueNames: A.server.ongoing[2].blueNames, game1: "21:19", game2: "19:21", result: "🤝 เสมอ 1–1 (+1pt each)", pRed: 1, pBlue: 1, rStat: "D", bStat: "D", duration: 1900000, umpire: "ทดสอบ" },
    ];
    A.server.history = hist; A.umpEcho(); await sleep(100);
    return { history: appState.matchHistory.length };
  };

  const onScoring = async (opts) => {   // opts: game2, paused
    A.umpScenario(); await sleep(120);
    const m = A.server.ongoing.find((x) => x.id === "T03"); m.court = 4; m.claimedAt = Date.now() - 900000; m.timerStartedAt = Date.now() - 600000;
    m.live = opts && opts.game2 ? { g1R: 21, g1B: 15, g2R: 5, g2B: 3, g1Locked: true, isPaused: false, elapsedMs: 0, lastAt: Date.now() - 4000 } : { g1R: 9, g1B: 6, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: Date.now() - 4000 };
    A.umpEcho(); await sleep(120);
    selectMatch("T03"); await sleep(400); dismissVsIntro(); await sleep(150);
  };

  A.wp3Report = async () => {
    const out = { size: innerWidth + "x" + innerHeight };
    // P-09: contrast on the list (taken card), the finished list, and the scoring screen in game 2
    A.umpScenario(); await sleep(150); goToTab("live"); await sleep(150);
    out.contrastList = short(A.contrast("#screen-live", 8));
    await A.wp3Setup(); goToTab("finished"); await sleep(250);
    out.contrastFinished = short(A.contrast("#screen-finished", 10));
    await onScoring({ game2: true });
    out.contrastGame2 = short(A.contrast("#screen-scoring", 8));
    // P-06 / JU-E3: targets under 48 px and the number of tap targets on the scoring screen
    out.small48 = A.small("#screen-scoring", 48);
    out.tapTargets = [...document.querySelectorAll("#screen-scoring button, #screen-scoring [onclick]")].filter(A.vis).length;
    // P-07: what is on top, in the middle of the screen, while paused
    togglePause(); await sleep(350);
    out.pausedTop = A.hit(innerWidth / 2, innerHeight / 2);
    out.pausedTopBottom = A.hit(innerWidth / 2, innerHeight - 60);
    togglePause(); await sleep(250);
    exitMatch(); await sleep(150);
    // login screen buttons
    document.body.classList.add("is-login"); switchScreen("screen-login"); await sleep(150);
    out.smallLogin = A.small("#screen-login", 48);
    return out;
  };

  // portrait / landscape layout of the scoring screen (P-06, P-12): bar heights, the free rim around each +1 area,
  // the bottom bar, what a touch at the edges lands on, overlaps with the "−" buttons, contrast, tap count
  A.wp3Layout = async () => {
    const R = (e) => (typeof e === "string" ? document.querySelector(e) : e).getBoundingClientRect(); const rd = (n) => Math.round(n);
    const out = { size: innerWidth + "x" + innerHeight };
    await onScoring({ game2: false }); await sleep(300); out.topH1 = rd(R(".scoring-topbar").height);
    await onScoring({ game2: true }); await sleep(300); out.topH2 = rd(R(".scoring-topbar").height);
    const red = R("#redPanel"), blue = R("#bluePanel"), pr = R("#btnRedPlus"), pb = R("#btnBluePlus"), bar = R(".scoring-bottombar");
    out.panels = { redH: rd(red.height), blueH: rd(blue.height) };
    out.plusRim = { redLeft: rd(pr.left - red.left), redRight: rd(red.right - pr.right), redBottom: rd(red.bottom - pr.bottom), blueTop: rd(pb.top - blue.top), blueRight: rd(blue.right - pb.right) };
    const barOn = getComputedStyle(document.querySelector(".scoring-bottombar")).display !== "none";
    out.bottomBar = barOn ? { top: rd(bar.top), bottom: rd(bar.bottom), vh: innerHeight, back: [rd(R("#btnBack").width), rd(R("#btnBack").height)], pause: [rd(R("#btnPause").width), rd(R("#btnPause").height)], guard: rd(R("#btnBack").top - bar.top) } : "hidden (landscape)";
    const cy = red.top + red.height / 2;
    out.hit = { redEdge: A.hit(8, cy), redCenter: A.hit(innerWidth / 2, cy), blueCenter: A.hit(innerWidth / 2, blue.top + blue.height / 2) };
    if (barOn) { out.hit.redBottomRim = A.hit(innerWidth / 2, red.bottom - 6); out.hit.blueTopRim = A.hit(innerWidth / 2, blue.top + 6); out.hit.barGuard = A.hit(innerWidth / 2, bar.top + 10); }
    const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1; const overlaps = [];
    [["#btnRedMinus", "#scoreRed"], ["#btnRedMinus", "#redNames"], ["#btnBlueMinus", "#scoreBlue"], ["#btnBlueMinus", "#blueNames"]].forEach(([a, b]) => { if (hit(R(a), R(b))) overlaps.push(a + " x " + b); });
    out.minusOverlaps = overlaps;
    out.small48 = A.small("#screen-scoring").concat(A.small("#landscapeInfo"));
    out.taps = [...document.querySelectorAll("#screen-scoring button")].filter(A.vis).length + ([...document.querySelectorAll("#landscapeInfo button")].filter(A.vis).length);
    const c = A.contrast("#screen-scoring", 5); out.contrast = c.total + "/" + c.fail; out.docSW = document.documentElement.scrollWidth;
    exitMatch(); await sleep(100); return out;
  };

  // two quick taps on the same side: how many points count? (P-12)
  A.wp3DoubleTap = async (gapMs, side) => {
    await onScoring({});
    const before = Number(appState.ongoingMatches.find((x) => x.id === "T03").live.g1R);
    updateScore(side || "red", 1); await sleep(gapMs); updateScore(side || "red", 1); await sleep(450);
    const after = Number(A.server.ongoing.find((x) => x.id === "T03").live.g1R);
    exitMatch(); await sleep(100);
    return { gapMs, counted: after - before };
  };
  A.wp3OnScoring = onScoring;
})();
