// ============================================================
// Service Worker — Badminton Sports Day 2026 (PWA)
// Precaches the app shell so it loads instantly and survives
// network blips.
//   - html: network-first (the document says which files exist), cache = offline fallback
//   - css/js requested as <file>?v=<APP_VERSION>: cache-first. The URL exists for exactly
//     one release, so the entry can never be stale, and NEW html can never be paired with
//     OLD css/js (the half-updated umpire screen of 2026-10-24). scripts/stamp-version.mjs
//     writes the ?v= on the tags; scripts/test-stamp.mjs fails the build when one is missing.
//   - everything else same-origin: stale-while-revalidate
// NOTE: Firebase Realtime DB traffic is WebSocket (not fetch),
// so live data still needs a connection — this only caches the shell.
// ============================================================
// The release number lives in ONE file (shared/version.js). Importing it here means a bump
// changes this worker (the browser byte-compares imported scripts too), and the cache name
// follows it, so every release starts from a fresh cache and the old one is deleted on activate.
importScripts('shared/version.js');
const CACHE = 'bdm2026-shell-' + APP_VERSION;
const VERSION_QS = '?v=' + APP_VERSION;
const isAsset = (path) => /\.(?:css|js)$/.test(path);

const SHELL = [
    "./",
    "index.html",
    "umpire.html",
    "manifest.webmanifest",
    "umpire.webmanifest",
    "css/backup.css",
    "css/tokens.css",
    "css/ui.css",
    "css/base.css",
    "css/climax.css",
    "css/components.css",
    "css/dashboard.css",
    "css/fullscreen.css",
    "css/login.css",
    "css/match-cards.css",
    "css/nav.css",
    "css/notifications.css",
    "css/ongoing-finished.css",
    "css/picker.css",
    "css/board.css",
    "css/profile.css",
    "css/qr.css",
    "css/tv.css",
    "css/report.css",
    "css/gallery.css",
    "css/responsive.css",
    "css/scoreboard.css",
    "css/tables-modals.css",
    "css/trophy.css",
    "css/umpire.css",
    "css/paper.css",
    "js/auth.js",
    "js/backup.js",
    "js/career.js",
    "js/me.js",
    "js/gallery.js",
    "js/core.js",
    "js/dashboard.js",
    "js/effects.js",
    "js/export-import.js",
    "js/match-picker.js",
    "js/match-render.js",
    "js/notifications.js",
    "js/pdf-export.js",
    "js/player-photo.js",
    "js/player-profile.js",
    "js/qr.js",
    "js/tv.js",
    "js/ranking.js",
    "js/reports.js",
    "js/result-entry.js",
    "js/season.js",
    "js/stats.js",
    "js/ui.js",
    "js/utils.js",
    "js/vendor/qrcode.min.js",
    "shared/firebase-config.js",
    "shared/icons.js",
    "shared/art.js",
    "shared/match-time.js",
    "shared/pwa.js",
    "shared/version.js",
    "shared/sync-merge.js",
    "umpire/tap-gate.js",
    "umpire/umpire.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/umpire-192.png",
    "icons/umpire-512.png",
    "icons/umpire-maskable-512.png",
    "media/logo/mark.webp",
    "media/logo/wordmark.webp",
    "media/fonts/riso-num.woff2",
    "media/mascot/loading.webp",
    "media/mascot/offline.webp",
    "media/mascot/miss.webp",
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // css/js are stored under the same ?v= URL the pages ask for
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(isAsset(u) ? u + VERSION_QS : u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin
  if (url.origin !== location.origin) {
    // Cache the Firebase SDK from gstatic so the shell can boot during blips.
    if (url.hostname === 'www.gstatic.com') {
      e.respondWith(
        caches.open(CACHE).then((c) =>
          c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))
        )
      );
    }
    // Everything else cross-origin (Firebase DB, GIFs, fonts) → straight to network.
    return;
  }

  // Navigations / HTML → network-first.
  // The document is the manifest of which scripts exist, so serving a
  // cached one next to freshly-revalidated JS can produce a page running
  // code its own script tags never loaded. Cache is the offline fallback.
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || c.match('index.html'))))
    );
    return;
  }

  // css/js asked for with THIS release's number → cache-first, fetch (and keep) only when missing.
  if (isAsset(url.pathname) && url.searchParams.get('v') === APP_VERSION) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Everything else same-origin → stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => { if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
