// ============================================================
// Service Worker — Badminton Sports Day 2026 (PWA)
// Precaches the app shell so it loads instantly and survives
// network blips. Same-origin GET uses stale-while-revalidate,
// so a new deploy is picked up automatically on the next load.
// NOTE: Firebase Realtime DB traffic is WebSocket (not fetch),
// so live data still needs a connection — this only caches the shell.
// ============================================================
const CACHE = 'bdm2026-shell-v6';

const SHELL = [
    "./",
    "index.html",
    "umpire.html",
    "manifest.webmanifest",
    "umpire.webmanifest",
    "css/backup.css",
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
    "css/responsive.css",
    "css/scoreboard.css",
    "css/tables-modals.css",
    "css/trophy.css",
    "css/umpire.css",
    "js/auth.js",
    "js/backup.js",
    "js/career.js",
    "js/me.js",
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
    "shared/pwa.js",
    "umpire/umpire.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/umpire-192.png",
    "icons/umpire-512.png",
    "icons/umpire-maskable-512.png",
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
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
