// ============================================================
// App version — the one number to bump on every release.
// Source mode (Cloudflare Pages serving the repo as it is) has no build step
// that could stamp a commit hash, so this is edited by hand.
//
// sw.js imports this file, so changing it makes the browser fetch a new
// service worker — which is how a page that stays open all day (the TV, an
// umpire phone) finds out that a new version exists (see shared/pwa.js).
// Shown as "เวอร์ชัน 2026.10.03.2" on the login screens and the admin tab,
// and as "v2026.10.03.2" in the TV footer.
// ============================================================
const APP_VERSION = "2026.10.03.2";
