// Page-side setup, injected with Page.addScriptToEvaluateOnNewDocument BEFORE any script of the app runs.
// The runner puts `window.__SHOTS_CFG = {...}` in front of this file.
//
// What it does (and why):
//  1. role / storage seeds   - the app boots as guest / admin / superadmin from localStorage, no passcode is ever typed.
//  2. frozen clock + seeded Math.random - every timer, "x min ago" and random pairing reads the same in every run.
//  3. no service worker, no fullscreen API, a working fake wake lock - what an iPhone home-screen app looks like,
//     and nothing that pops up on its own a few seconds later.
//  4. THE DATABASE IS NEVER REACHED. As soon as the Firebase SDK has loaded, it is switched offline and its read/write
//     methods are replaced: reads are answered from the canned snapshot (/__shots/db/<key>.json), every write is
//     refused and recorded in window.__blocked. A WebSocket to a Firebase host cannot be opened at all.
(function () {
  'use strict';
  var CFG = window.__SHOTS_CFG || {};
  var S = window.__shots = { cfg: CFG, held: [], listeners: [], hold: !!CFG.hold, connected: CFG.connected !== false, patched: false };
  window.__blocked = window.__blocked || [];

  // ---------- 1. storage seeds ----------
  try { if (CFG.role) localStorage.setItem('bdm_scoreboard_role', CFG.role); } catch (e) { /* private mode */ }
  try { var seeds = CFG.storage || {}; Object.keys(seeds).forEach(function (k) { localStorage.setItem(k, seeds[k]); }); } catch (e) { /* ignore */ }

  // ---------- 2. frozen clock + seeded random ----------
  var RealDate = Date;
  if (CFG.now) {
    var fixed = CFG.now;
    var FakeDate = function () {
      var a = arguments;
      if (!(this instanceof FakeDate)) return new RealDate(fixed).toString();
      if (a.length === 0) return new RealDate(fixed);
      if (a.length === 1) return new RealDate(a[0]);
      return new RealDate(a[0], a[1], a[2] === undefined ? 1 : a[2], a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
    };
    FakeDate.prototype = RealDate.prototype;
    Object.setPrototypeOf(FakeDate, RealDate);
    FakeDate.now = function () { return fixed; };
    window.Date = FakeDate;
    S.setNow = function (ms) { fixed = ms; return fixed; };
    S.advance = function (ms) { fixed += ms; return fixed; };
    S.now = function () { return fixed; };
  }
  (function () {
    var s = (CFG.seed || 20261024) >>> 0;
    Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })();

  // ---------- 3. calm environment ----------
  try { delete Navigator.prototype.serviceWorker; } catch (e) { /* ignore */ }
  try { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); } catch (e) { /* ignore */ }
  if (!CFG.keepFullscreen) {
    ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen', 'mozRequestFullScreen'].forEach(function (k) { try { delete Element.prototype[k]; } catch (e) { /* ignore */ } });
  }
  try {
    var fakeLock = { released: false, release: function () { this.released = true; return Promise.resolve(); }, addEventListener: function () {}, removeEventListener: function () {} };
    Object.defineProperty(navigator, 'wakeLock', { value: { request: function () { return Promise.resolve(fakeLock); } }, configurable: true });
  } catch (e) { /* ignore */ }
  S.dialogs = [];
  window.alert = function (m) { S.dialogs.push('alert: ' + String(m)); };
  window.confirm = function (m) { S.dialogs.push('confirm: ' + String(m)); return false; };   // never agree to anything
  window.prompt = function (m) { S.dialogs.push('prompt: ' + String(m)); return null; };
  window.open = function (u) { S.dialogs.push('open: ' + String(u)); return null; };
  window.print = function () { S.dialogs.push('print'); };

  // no animation, no transition, no caret: a screenshot is a still
  function onRoot(fn) {
    if (document.documentElement) return fn();
    var mo = new MutationObserver(function () { if (document.documentElement) { mo.disconnect(); fn(); } });
    mo.observe(document, { childList: true });
  }
  onRoot(function () {
    var st = document.createElement('style');
    st.id = '__shots_still';
    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  });

  // ---------- 4. the database ----------
  var NativeWS = window.WebSocket;
  if (NativeWS) {
    var GuardWS = function (url, protocols) {
      if (/firebaseio\.com|firebasedatabase\.app/i.test(String(url))) {
        window.__blocked.push('ws-open ' + String(url).slice(0, 80));
        var dead = { readyState: 3, url: String(url), send: function () {}, close: function () {}, addEventListener: function () {}, removeEventListener: function () {} };
        setTimeout(function () { if (typeof dead.onerror === 'function') dead.onerror({ type: 'error' }); if (typeof dead.onclose === 'function') dead.onclose({ type: 'close', code: 1006 }); }, 0);
        return dead;
      }
      return protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    };
    GuardWS.prototype = NativeWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { GuardWS[k] = NativeWS[k]; });
    window.WebSocket = GuardWS;
  }

  // one top-level key of the canned database at a time (/__shots/db/<key>.json): a page that never opens the gallery never loads its 15 MB
  var keyCache = {};
  function topValue(key) {
    if (!keyCache[key]) keyCache[key] = fetch('/__shots/db/' + encodeURIComponent(key) + '.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return keyCache[key];
  }
  // the value at a path (a path of no segments = the root, which nobody reads: null)
  function readPath(parts) {
    if (!parts.length) return Promise.resolve(null);
    return topValue(parts[0]).then(function (v) { return valAt(v, parts.slice(1)); });
  }
  function clone(v) { return v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)); }
  function valAt(root, parts) {
    var v = root;
    for (var i = 0; i < parts.length; i++) {
      if (v === null || v === undefined || typeof v !== 'object') return null;
      v = v[parts[i]];
    }
    return v === undefined ? null : v;
  }
  function keyCmp(a, b) {
    var na = /^-?\d+$/.test(a), nb = /^-?\d+$/.test(b);
    if (na && nb) return +a - +b;
    if (na) return -1;
    if (nb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function pathOf(q) {
    try {
      var r = q && q.ref && typeof q.ref.toString === 'function' ? q.ref : q;
      return decodeURIComponent(new URL(String(r.toString())).pathname).split('/').filter(Boolean);
    } catch (e) { return []; }
  }
  function later(fn) { if (S.hold) S.held.push(fn); else setTimeout(fn, CFG.dataDelayMs === undefined ? 15 : CFG.dataDelayMs); }
  S.release = function () { S.hold = false; var h = S.held.splice(0); h.forEach(function (f) { setTimeout(f, 0); }); return h.length; };

  function patch() {
    var fb = window.firebase;
    if (S.patched || !fb || !fb.database || !fb.database.Reference) return;
    S.patched = true;
    var DB = fb.database, RP = DB.Reference.prototype, QP = (DB.Query && DB.Query.prototype) || RP, DP = DB.DataSnapshot, DBP = DB.Database && DB.Database.prototype;

    function Snap(parts, v) { this._p = parts; this._v = v === undefined ? null : v; }
    Snap.prototype.val = function () { return clone(this._v); };
    Snap.prototype.exportVal = Snap.prototype.val;
    Snap.prototype.toJSON = Snap.prototype.val;
    Snap.prototype.exists = function () { return this._v !== null && this._v !== undefined; };
    Snap.prototype.hasChildren = function () { return this._v !== null && typeof this._v === 'object' && Object.keys(this._v).length > 0; };
    Snap.prototype.numChildren = function () { return this._v !== null && typeof this._v === 'object' ? Object.keys(this._v).length : 0; };
    Snap.prototype.child = function (p) {
      var parts = String(p).split('/').filter(Boolean);
      return new Snap(this._p.concat(parts), valAt(this._v, parts));
    };
    Snap.prototype.hasChild = function (p) { return this.child(p).exists(); };
    Snap.prototype.forEach = function (cb) {
      if (this._v === null || typeof this._v !== 'object') return false;
      var keys = Object.keys(this._v).sort(keyCmp);
      for (var i = 0; i < keys.length; i++) { if (cb(this.child(keys[i])) === true) return true; }
      return false;
    };
    Object.defineProperty(Snap.prototype, 'key', { get: function () { return this._p.length ? this._p[this._p.length - 1] : null; } });
    Object.defineProperty(Snap.prototype, 'ref', { get: function () { return fb.database().ref(this._p.join('/')); } });

    // reads: answered from the snapshot, never from the network
    function on(type, cb, cancelOrCtx, ctx) {
      if (type !== 'value' || typeof cb !== 'function') return cb;
      var parts = pathOf(this), key = parts.join('/');
      var rec = { key: key, cb: cb, ctx: (cancelOrCtx && typeof cancelOrCtx === 'object') ? cancelOrCtx : ctx };
      S.listeners.push(rec);
      if (key === '.info/connected') { cb.call(rec.ctx, new Snap(parts, S.connected)); return cb; }   // synchronous, like the SDK
      later(function () {
        if (S.listeners.indexOf(rec) < 0) return;
        readPath(parts).then(function (v) { if (S.listeners.indexOf(rec) >= 0) cb.call(rec.ctx, new Snap(parts, v)); });
      });
      return cb;
    }
    function once(type, success) {
      var parts = pathOf(this), key = parts.join('/');
      var p = new Promise(function (resolve) {
        if (key === '.info/connected') return resolve(new Snap(parts, S.connected));
        later(function () { readPath(parts).then(function (v) { resolve(new Snap(parts, v)); }); });
      });
      if (typeof success === 'function') p.then(success);
      return p;
    }
    function off(type, cb) {
      var key = pathOf(this).join('/');
      S.listeners = S.listeners.filter(function (r) { return !(r.key === key && (!cb || r.cb === cb)); });
    }
    [QP, RP].forEach(function (P) { P.on = on; P.once = once; P.off = off; });

    // writes: refused and counted
    var okResult = function () { return { committed: true, snapshot: { val: function () { return null; } } }; };
    ['set', 'update', 'remove', 'transaction', 'setWithPriority', 'setPriority'].forEach(function (k) {
      RP[k] = function () { window.__blocked.push(k + ' ' + pathOf(this).join('/')); return Promise.resolve(okResult()); };
    });
    RP.push = function () { window.__blocked.push('push ' + pathOf(this).join('/')); return this.child('-shots'); };
    RP.onDisconnect = function () {
      var np = function () { window.__blocked.push('onDisconnect'); return Promise.resolve(); };
      return { set: np, update: np, remove: np, cancel: np, setWithPriority: np };
    };
    window.__guardOn = true;   // audit-helpers.js __audit.guard() sees its job already done

    // no connection at all: switched off the moment the app is created, and it cannot be switched back on
    if (DBP) {
      var realOffline = DBP.goOffline;
      var init = fb.initializeApp;
      fb.initializeApp = function () {
        var app = init.apply(this, arguments);
        try { var db = app.database(); if (realOffline) realOffline.call(db); } catch (e) { /* the WebSocket guard is the second line */ }
        return app;
      };
      DBP.goOnline = function () {};
      DBP.goOffline = function () {};
    }
    S.sdkPatchedAt = RealDate.now();
  }
  // the SDK scripts are plain <script> (umpire) or defer (scoreboard): patch right after the database one has run, before the next script starts
  document.addEventListener('load', function (e) { if (e.target && e.target.tagName === 'SCRIPT') patch(); }, true);
  patch();
})();
