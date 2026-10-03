// WP4 test helpers for the umpire app (dev-only): connection / send / message scenarios. Needs audit-helpers.js,
// umpire-mock.js and umpire-wp3.js loaded and __audit.umpFreeze() called. Nothing reaches Firebase.
(function () {
  const A = window.__audit;
  if (!A || !A.umpFreeze || !A.wp3OnScoring) throw new Error("load audit-helpers.js, umpire-mock.js and umpire-wp3.js first");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__sleep = sleep;
  window.__srv = (id) => A.server.ongoing.find((x) => x.id === id);
  window.__modal = () => ({
    open: document.getElementById("customModal").classList.contains("open"),
    icon: document.getElementById("modalIcon").textContent,
    title: document.getElementById("modalTitle").textContent,
    body: document.getElementById("modalBody").textContent,
    btns: [...document.querySelectorAll("#modalBtns button")].map((b) => b.textContent.trim()),
  });
  window.__notice = () => { const e = document.getElementById("umpNotice"); return e && e.classList.contains("show") ? { tone: e.className.replace("show", "").trim(), text: (e.querySelector(".un-text") || {}).textContent, btns: [...e.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null; };
  window.__errs = window.__errs || [];
  window.addEventListener("error", (e) => window.__errs.push("E:" + e.message));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push("R:" + ((e.reason && e.reason.message) || e.reason)));

  // pretend the phone lost / regained its connection (the page reads these two globals)
  A.umpOnline = (on) => { _uOnline = !!on; if (on) _uEverOnline = true; _uRenderNet(); return { online: _uOnline, pending: _uPending }; };

  // T03 mine, in play (game 1: 9-6) or ready to submit (game 2 finished 21-17), history emptied so a submit is "new"
  A.wp4Ready = async (opts) => {
    opts = opts || {};
    A.umpNetMode("ok"); A.umpRelease(); A.umpOnline(true); hideNotice();
    A.server.history = []; A.server.red = 0; A.server.blue = 0;
    await A.wp3OnScoring({ game2: !!opts.submit });
    const m = window.__srv("T03"); m.court = 4;
    m.live = opts.submit
      ? { g1R: 21, g1B: 15, g2R: 21, g2B: 17, g1Locked: true, isPaused: false, elapsedMs: 0, lastAt: Date.now() - 3000 }
      : { g1R: 9, g1B: 6, g2R: 0, g2B: 0, g1Locked: false, isPaused: false, elapsedMs: 0, lastAt: Date.now() - 3000 };
    A.server.history = []; A.umpEcho(); await sleep(200);
  };
})();
