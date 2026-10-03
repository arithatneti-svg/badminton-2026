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

  // the login page in one of its states: is the button inside the screen WITHOUT scrolling, is it on or off, what does it say
  A.wp4Login = async (team, pick) => {
    localStorage.removeItem("bdm_umpire_name");
    document.getElementById("umpireNav").style.display = "none";
    switchScreen("screen-login"); selectedTeam = ""; selectedGroup = ""; document.getElementById("group-section").style.display = "none";
    renderUmpireList();
    if (team) setTeamFilter(team);
    if (pick) { const sel = document.getElementById("umpireSelect"); sel.value = sel.options[1].value; updateLoginReady(); }
    window.scrollTo(0, 0); await sleep(250);
    const b = document.getElementById("btnLogin").getBoundingClientRect();
    const sb = document.getElementById("umpireSelect").getBoundingClientRect();
    return { size: innerWidth + "x" + innerHeight, team: team || "-", picked: !!pick, btn: { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), label: document.getElementById("btnLogin").textContent, disabled: document.getElementById("btnLogin").disabled }, selectBottom: Math.round(sb.bottom), selectCovered: Math.max(0, Math.round(sb.bottom - b.top)), noScroll: document.documentElement.scrollHeight <= innerHeight + 1, inView: b.top >= 0 && b.bottom <= innerHeight, helpShown: getComputedStyle(document.getElementById("loginHelp")).display !== "none", small48: A.small("#screen-login") };
  };

  // The Latin words a person can SEE (or a screen reader reads) on the page right now, minus the ones the owner allows
  // (glossary Q8: LIVE · DEUCE · GAME POINT · TEAM BATTLE · team names · "Sports Day 2026" · VS) and minus data
  // (player names, ids like T03, group codes like G1). Names sit in the elements listed in SKIP. An empty list = clean.
  const ALLOWED = new Set(["LIVE", "DEUCE", "GAME", "POINT", "TEAM", "BATTLE", "Red", "Blue", "RED", "BLUE", "VS", "Sports", "Day"]);
  const SKIP = "option, .team-row, #redNames, #blueNames, .vsi-names, .score-team-cell, .uavatar, script, style";
  A.wp4English = () => {
    const found = [];
    const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0; };
    const take = (text, where) => { (String(text || "").match(/[A-Za-z]{2,}(?![A-Za-z0-9])/g) || []).forEach((w) => { if (!ALLOWED.has(w) && !/^[A-Z]\d+$/.test(w)) found.push(w + "  ← " + where); }); };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; if (!el || el.closest(SKIP) || !visible(el)) continue;
      // an id such as "T03" or "M05" is data: strip letter+digit tokens before looking for words
      take(n.nodeValue.replace(/\b[A-Za-z]+\d+\b/g, ""), (el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase()) + ' "' + n.nodeValue.trim().slice(0, 40) + '"');
    }
    document.querySelectorAll("[aria-label], [title], [placeholder]").forEach((el) => {
      if (el.closest(SKIP) || !visible(el)) return;
      ["aria-label", "title", "placeholder"].forEach((a) => { if (el.hasAttribute(a)) take(el.getAttribute(a), "[" + a + "] " + (el.id ? "#" + el.id : el.tagName.toLowerCase())); });
    });
    return found;
  };

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
