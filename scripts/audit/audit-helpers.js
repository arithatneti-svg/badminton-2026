// Audit helpers (dev-only measurement tools for phases 2-6 of the UX overhaul). They never write to Firebase:
// load with fetch + eval in the page, then call __audit.guard() FIRST (it stubs every Firebase write method and disables animations).
(function () {
  if (window.__audit) return;
  const A = window.__audit = {};
  const SEL = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [onclick], [tabindex]";
  A.sel = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + ((typeof el.className === "string" && el.className.trim()) ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  A.vis = (el) => { try { if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false; } catch (e) {} const r = el.getBoundingClientRect(); return r.width >= 1 && r.height >= 1; };
  A.guard = () => {
    window.__blocked = window.__blocked || [];
    if (window.firebase && firebase.database && !window.__guardOn) {
      const P = firebase.database.Reference.prototype;
      ["set", "update", "remove", "push", "transaction", "setWithPriority", "setPriority"].forEach((k) => { P[k] = function () { window.__blocked.push(k + " " + this.toString()); return Promise.resolve({ committed: true, snapshot: { val: () => null } }); }; });
      window.__guardOn = true;
    }
    if (!document.getElementById("__noanim")) { const st = document.createElement("style"); st.id = "__noanim"; st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}"; document.head.appendChild(st); }
    return { guardOn: !!window.__guardOn, blocked: window.__blocked.length };
  };
  // ---------- colour maths (WCAG 2.x) ----------
  const parseCol = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); };
  const over = (t, b, a) => [t[0] * a + b[0] * (1 - a), t[1] * a + b[1] * (1 - a), t[2] * a + b[2] * (1 - a), 1];
  const hex = (c) => "#" + [c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  // effective background: nearest gradient (all colour stops, worst case) over the flattened colour layers above it; url() images are flagged unknown
  A.effBg = (el) => {
    let n = el, stops = null, unknown = false; const layers = [];
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n); const bi = cs.backgroundImage;
      if (bi && bi !== "none" && !stops && !unknown) {
        if (/gradient\(/.test(bi)) { const cols = (bi.match(/rgba?\([^)]*\)/g) || []).map(parseCol).filter(Boolean); if (cols.length) stops = cols; else unknown = true; } else unknown = true;
      }
      const c = parseCol(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      n = n.parentElement;
    }
    let base = [0, 0, 0, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base, layers[i][3]);
    const cands = stops ? stops.map((s) => over(s, base, s[3])) : [base];
    return { rgb: base, cands, complex: !!stops || unknown, unknown };
  };
  const opChain = (el) => { let o = 1, n = el; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; } return o; };
  A.contrast = (rootSel, top) => {
    const root = rootSel ? document.querySelector(rootSel) : document.body; if (!root) return { error: "no root " + rootSel };
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; const groups = {}; let total = 0, fail = 0, complexN = 0, unknownN = 0, skipped = 0, punct = 0, gradText = 0;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement; if (!el || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue; if (!A.vis(el)) { skipped++; continue; } if (!/[\p{L}\p{N}]/u.test(t)) { punct++; continue; }
      const cs = getComputedStyle(el); const fg = parseCol(cs.color); if (!fg) continue; const tf = parseCol(cs.webkitTextFillColor); if (tf && tf[3] === 0) { gradText++; continue; }
      const alpha = fg[3] * opChain(el); const bg = A.effBg(el);
      let worst = null; bg.cands.forEach((c) => { const eff = over(fg, c, alpha); const cr = ratio(lum(eff), lum(c)); if (!worst || cr < worst.cr) worst = { cr, eff, c }; });
      const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400; const large = fs >= 24 || (fs >= 18.66 && fw >= 700); const need = large ? 3 : 4.5;
      total++; if (bg.complex) complexN++; if (bg.unknown) unknownN++;
      if (worst.cr < need) {
        fail++; const key = A.sel(el) + "|" + hex(worst.eff) + "|" + hex(worst.c) + "|" + fs.toFixed(1);
        const g = groups[key] || (groups[key] = { sel: A.sel(el), fg: hex(worst.eff), bg: hex(worst.c), fs: +fs.toFixed(1), fw, ratio: +worst.cr.toFixed(2), need, n: 0, complex: bg.complex, unknown: bg.unknown, sample: t.slice(0, 28) }); g.n++;
      }
    }
    const list = Object.values(groups).sort((a, b) => a.ratio - b.ratio);
    return { total, fail, complexBg: complexN, unknownBg: unknownN, hiddenSkipped: skipped, punctOnlySkipped: punct, gradientTextSkipped: gradText, groups: list.length, worst: list.slice(0, top || 14) };
  };
  // ---------- semantics ----------
  const hasLetters = (s) => /[\p{L}\p{N}]/u.test(s);
  A.nameOf = (el) => {
    const al = el.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
    const lb = el.getAttribute("aria-labelledby"); if (lb) { const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || "").join(" ").trim(); if (t) return t; }
    if (el.tagName === "IMG") return (el.getAttribute("alt") || "").trim();
    if (el.matches("input,select,textarea")) {
      if (el.id) { const l = document.querySelector("label[for=\"" + el.id + "\"]"); if (l && l.textContent.trim()) return l.textContent.trim(); }
      const wl = el.closest("label"); if (wl && wl.textContent.trim()) return wl.textContent.trim();
      const t = el.getAttribute("title"); if (t && t.trim()) return t.trim();
      return "";
    }
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim(); if (txt) return txt;
    const t = el.getAttribute("title"); if (t && t.trim()) return t.trim();
    const im = el.querySelector("img[alt]"); if (im && im.alt.trim()) return im.alt.trim();
    return "";
  };
  const cnt = (a) => { const m = {}; a.forEach((x) => { m[x] = (m[x] || 0) + 1; }); return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => k + " x" + v); };
  A.semantics = (rootSel) => {
    const root = rootSel ? document.querySelector(rootSel) : document; if (!root) return { error: "no root" };
    const els = [...root.querySelectorAll(SEL)].filter(A.vis); const out = { noName: [], symbolOnly: [], mouseOnly: [], inputsNoLabel: [], tabindexPositive: 0 };
    els.forEach((el) => {
      const native = el.matches("button,a[href],input,select,textarea,summary"); const focusable = native ? !el.disabled : (el.hasAttribute("tabindex") && el.tabIndex >= 0);
      const nm = A.nameOf(el);
      if (el.tabIndex > 0) out.tabindexPositive++;
      if (el.matches("input,select,textarea")) { if (!nm) out.inputsNoLabel.push(A.sel(el) + (el.placeholder ? " [ph: " + el.placeholder.slice(0, 18) + "]" : "")); }
      else if (!nm) out.noName.push(A.sel(el));
      else if (!hasLetters(nm)) out.symbolOnly.push(A.sel(el) + " [" + nm.slice(0, 6) + "]");
      if (!focusable && el.hasAttribute("onclick") && !el.querySelector("button,a[href],input,select,textarea,[tabindex]") && !el.closest("button,a[href],[role=button][tabindex]")) out.mouseOnly.push(A.sel(el));
    });
    const imgs = [...root.querySelectorAll("img")].filter(A.vis);
    return {
      interactive: els.length, noName: out.noName.length, noNameTop: cnt(out.noName), symbolOnly: out.symbolOnly.length, symbolOnlyTop: cnt(out.symbolOnly),
      mouseOnly: out.mouseOnly.length, mouseOnlyTop: cnt(out.mouseOnly), inputsNoLabel: out.inputsNoLabel.length, inputsNoLabelTop: cnt(out.inputsNoLabel), tabindexPositive: out.tabindexPositive,
      imgs: imgs.length, imgsNoAlt: imgs.filter((i) => !i.hasAttribute("alt")).length, imgsEmptyAlt: imgs.filter((i) => i.getAttribute("alt") === "").length,
    };
  };
  A.page = () => {
    const h = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(A.vis).map((x) => x.tagName + ":" + x.textContent.trim().slice(0, 24));
    return {
      lang: document.documentElement.lang, title: document.title, viewport: (document.querySelector("meta[name=viewport]") || {}).content,
      landmarks: { main: document.querySelectorAll("main,[role=main]").length, nav: document.querySelectorAll("nav,[role=navigation]").length, header: document.querySelectorAll("header,[role=banner]").length, footer: document.querySelectorAll("footer,[role=contentinfo]").length },
      headings: h.length, headingList: h.slice(0, 14), liveRegions: [...document.querySelectorAll("[aria-live],[role=status],[role=alert]")].map(A.sel),
      dialogsRole: document.querySelectorAll("[role=dialog],[role=alertdialog],[aria-modal]").length, modalOverlays: document.querySelectorAll(".modal-overlay").length,
    };
  };
  // ---------- target size (WCAG 2.5.8 / 2.5.5 / project 48px) ----------
  A.targets = (rootSel) => {
    const root = rootSel ? document.querySelector(rootSel) : document; if (!root) return { error: "no root" };
    const list = [...root.querySelectorAll(SEL)].filter(A.vis).map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => x.r.width >= 1 && x.r.height >= 1);
    const mn = (x) => Math.min(x.r.width, x.r.height); const U = list.filter((x) => mn(x) < 24);
    const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];
    const circleHitsRect = (c, r) => { const nx = Math.max(r.left, Math.min(c[0], r.right)), ny = Math.max(r.top, Math.min(c[1], r.bottom)); return Math.hypot(c[0] - nx, c[1] - ny) < 12; };
    let spacingFail = 0; const failList = [];
    U.forEach((u) => {
      const c = center(u.r); let bad = false;
      for (const v of list) {
        if (v === u || u.e.contains(v.e) || v.e.contains(u.e)) continue;
        if (mn(v) < 24) { const d = Math.hypot(c[0] - center(v.r)[0], c[1] - center(v.r)[1]); if (d < 24) { bad = true; break; } }
        else if (circleHitsRect(c, v.r)) { bad = true; break; }
      }
      if (bad) { spacingFail++; failList.push(A.sel(u.e) + " " + Math.round(u.r.width) + "x" + Math.round(u.r.height)); }
    });
    return { targets: list.length, lt24: U.length, lt24_spacingFail_SC258: spacingFail, lt44: list.filter((x) => mn(x) < 44).length, lt48: list.filter((x) => mn(x) < 48).length, failTop: cnt(failList) };
  };
  // every visible interactive element whose shorter side is under `min` px (default 48, the project rule), with its size
  A.small = (rootSel, min) => {
    min = min || 48;
    const root = rootSel ? document.querySelector(rootSel) : document; if (!root) return { error: "no root" };
    return [...root.querySelectorAll(SEL)].filter(A.vis).map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter((x) => x.r.width >= 1 && x.r.height >= 1 && Math.min(x.r.width, x.r.height) < min)
      .map((x) => A.sel(x.e) + " " + Math.round(x.r.width) + "x" + Math.round(x.r.height));
  };
  A.hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? A.sel(e) : null; };
  window.__auditReady = "ok";
})();
