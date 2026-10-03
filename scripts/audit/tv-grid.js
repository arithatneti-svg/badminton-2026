// TV measurement helpers (dev-only). In-memory mock matches; never writes to Firebase.
// Usage: open /?view=tv, load audit-helpers.js, then this file; call __audit.tvLive(n, {queued}) or __audit.tvBoard(rows).
(function () {
  const A = window.__audit;
  if (!A) throw new Error("load scripts/audit/audit-helpers.js first");
  const R = (e) => e.getBoundingClientRect();
  const nm = (a, b) => [a, b].map((p) => p.name + " (G" + p.group + ")").join(" & ");
  const pick = () => {
    const ps = (appState.players || []).slice();
    const red = ps.filter((p) => p.team === "Red"), blue = ps.filter((p) => p.team === "Blue");
    return { ps, red, blue };
  };
  // n live (claimed) matches plus opts.queued waiting matches (no live data = not claimed yet)
  A.mockMatches = (n, opts) => {
    opts = opts || {};
    let { red, blue } = pick(); const out = [], total = n + (opts.queued || 0);
    if (opts.longest) { const byLen = (a, b) => b.name.length - a.name.length; red = red.slice().sort(byLen); blue = blue.slice().sort(byLen); }
    for (let i = 0; i < total; i++) {
      const r1 = red[(2 * i) % red.length], r2 = red[(2 * i + 1) % red.length];
      const b1 = blue[(2 * i) % blue.length], b2 = blue[(2 * i + 1) % blue.length];
      const m = { id: "M" + (101 + i), round: "1", r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id, redNames: nm(r1, r2), blueNames: nm(b1, b2) };
      if (i < n) {
        const g2 = i % 3 === 1;
        m.umpire = "Mock";
        m.timerStartedAt = Date.now() - 600000;
        m.live = { g1R: g2 ? 21 : 12 + (i % 8), g1B: g2 ? 19 : 9 + (i % 9), g2R: g2 ? 6 : 0, g2B: g2 ? 4 : 0, g1Locked: g2, isPaused: false, elapsedMs: 0 };
        if (opts.court) m.court = ((i * 7) % 10) + 1;
      }
      out.push(m);
    }
    return out;
  };
  // k finished matches so the leaderboard has many ranked players
  A.mockHistory = (k) => {
    const { red, blue } = pick(), out = [];
    for (let i = 0; i < k; i++) {
      const r1 = red[(2 * i) % red.length], r2 = red[(2 * i + 1) % red.length];
      const b1 = blue[(2 * i) % blue.length], b2 = blue[(2 * i + 1) % blue.length];
      const redWin = i % 2 === 0;
      out.push({ id: "H" + (200 + i), round: "1", r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id, redNames: nm(r1, r2), blueNames: nm(b1, b2),
        game1: "21:15", game2: "21:17", result: "mock", pRed: redWin ? 3 : 0, pBlue: redWin ? 0 : 3, rStat: redWin ? "W" : "L", bStat: redWin ? "L" : "W", duration: 900000 });
    }
    return out;
  };
  A.tvFreeze = (panel) => {
    if (!(appState.players && appState.players.length)) throw new Error("data not loaded yet - wait for the players before freezing the listener");
    try { dbRef.off(); } catch (e) {}
    A.guard();
    clearInterval(_tvTimer);
    _tvEvent = null; _tvClimaxOn = false; _tvClimaxCooldown = 99999; _tvPanel = TV_PANELS.indexOf(panel);
  };
  A.tvGridMetrics = () => {
    const cards = [...document.querySelectorAll(".tv-live-card")];
    const vh = window.innerHeight, vw = window.innerWidth;
    const foot = document.querySelector(".tv-foot"), head = document.querySelector(".tv-heading");
    const footTop = foot ? R(foot).top : vh;
    const out = { vw, vh, cards: cards.length, heading: head ? head.textContent.trim() : null, cols: 0, rows: 0, w: 0, h: 0, overflowRight: 0, overflowLeft: 0, overlaps: 0, innerOverlaps: 0, intoFooter: 0, belowViewport: 0 };
    if (!cards.length) return out;
    const rects = cards.map(R);
    out.cols = new Set(rects.map((r) => Math.round(r.left))).size; out.rows = new Set(rects.map((r) => Math.round(r.top))).size;
    out.w = Math.round(rects[0].width); out.h = Math.round(rects[0].height);
    const hit = (p, o) => p.left < o.right - 2 && p.right > o.left + 2 && p.top < o.bottom - 2 && p.bottom > o.top + 2;
    cards.forEach((c, i) => {
      const cr = rects[i];
      c.querySelectorAll("*").forEach((e) => { const r = R(e); if (r.width < 1) return; out.overflowRight = Math.max(out.overflowRight, Math.round(r.right - cr.right)); out.overflowLeft = Math.max(out.overflowLeft, Math.round(cr.left - r.left)); });
      const parts = [...c.querySelectorAll(".tv-lt, .tv-live-score, .tv-faces, .tv-live-id, .tv-live-games")].map(R);
      parts.forEach((p) => rects.forEach((o, j) => { if (j !== i && hit(p, o)) out.overlaps++; }));
      const three = [c.querySelector(".tv-lt.red"), c.querySelector(".tv-live-score"), c.querySelector(".tv-lt.blue")].filter(Boolean).map(R);
      for (let a = 0; a < three.length; a++) for (let b = a + 1; b < three.length; b++) if (hit(three[a], three[b])) out.innerOverlaps++;
    });
    // status labels hang on the card's top edge: they must not touch another card or the heading, or leave their own card sideways
    const labels = [...document.querySelectorAll(".tv-live-card .tv-status")].filter((e) => e.textContent.trim());
    out.statusLabels = labels.length; out.statusHitsCard = 0; out.statusOverHeading = 0; out.statusOverflowRight = 0;
    const headBottom = head ? R(head).bottom : 0;
    labels.forEach((s) => {
      const sr = R(s), own = s.closest(".tv-live-card"), ownR = R(own);
      cards.forEach((c, j) => { if (c !== own && hit(sr, rects[j])) out.statusHitsCard++; });
      if (sr.top < headBottom - 1) out.statusOverHeading++;
      if (sr.right > ownR.right + 1 || sr.left < ownR.left - 1) out.statusOverflowRight++;
    });
    const lowest = Math.max(...rects.map((r) => r.bottom));
    out.intoFooter = Math.max(0, Math.round(lowest - footTop)); out.belowViewport = Math.max(0, Math.round(lowest - vh));
    return out;
  };
  // natural (unconstrained) width of the widest card: the least width a card needs at this viewport
  A.tvNatural = (n, opts) => {
    A.tvLive(n, opts);
    const st = document.createElement("style"); st.id = "__natural";
    st.textContent = ".tv-live-grid{display:flex!important;flex-wrap:wrap}.tv-live-card{width:max-content!important;flex:none!important}";
    document.head.appendChild(st);
    const w = Math.max(...[...document.querySelectorAll(".tv-live-card")].map((c) => Math.round(R(c).width)));
    st.remove();
    return w;
  };
  // least width a card can have: the widest card when every text wraps as much as it can
  A.tvMinContent = (n, opts) => {
    A.tvLive(n, opts);
    const st = document.createElement("style"); st.id = "__mincontent";
    st.textContent = ".tv-live-grid{display:flex!important;flex-wrap:wrap}.tv-live-card{width:min-content!important;flex:none!important}";
    document.head.appendChild(st);
    const w = Math.max(...[...document.querySelectorAll(".tv-live-card")].map((c) => Math.round(R(c).width)));
    st.remove();
    return w;
  };
  A.tvLive = (n, opts) => {
    A.tvFreeze("live");
    appState.ongoingMatches = A.mockMatches(n, opts);
    renderTvPanel(true);
    return A.tvGridMetrics();
  };
  A.tvBoardMetrics = () => {
    const rows = [...document.querySelectorAll(".tv-board-row")];
    const vh = window.innerHeight, foot = document.querySelector(".tv-foot");
    const footTop = foot ? R(foot).top : vh;
    const last = rows.length ? Math.max(...rows.map((r) => R(r).bottom)) : 0;
    return { vh, rows: rows.length, rowH: rows.length ? Math.round(R(rows[0]).height) : 0, lastBottom: Math.round(last), footTop: Math.round(footTop), intoFooter: Math.max(0, Math.round(last - footTop)), belowViewport: Math.max(0, Math.round(last - vh)) };
  };
  A.tvBoard = (k) => {
    A.tvFreeze("board");
    appState.matchHistory = A.mockHistory(k || 30);
    _tvBoardPage = 0;
    renderTvPanel(true);
    return A.tvBoardMetrics();
  };
  window.__tvGridReady = "ok";
})();
