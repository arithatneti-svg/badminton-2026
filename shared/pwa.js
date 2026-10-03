// ============================================================
// PWA — register the service worker (progressive enhancement).
// The app works fine without it; the SW just makes the shell
// installable and loadable during network blips.
//
// It also tells an OPEN page that a new version has been released. Bumping
// shared/version.js changes the service worker; the new one installs, takes
// control at once (skipWaiting + claim) and fires "controllerchange" here — but
// the page keeps running the code it loaded. So the apps show a "new version —
// tap to update" bar (never reloading by themselves: a match must not be
// interrupted) and the TV reloads itself at a quiet moment (js/tv.js reads
// _appNewVersion).
// ============================================================
var _appNewVersion = false;

// Styles live here so the one shared script serves both apps without a new stylesheet.
(function () {
  var st = document.createElement('style');
  st.textContent =
    '#appUpdate{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3500;' +
    'max-width:92vw;min-height:48px;padding:12px 18px;border-radius:14px;border:1px solid rgba(245,200,66,.55);background:#1b1b2b;' +
    'color:#f5c842;font-family:inherit;font-size:14px;font-weight:700;line-height:1.3;box-shadow:0 8px 30px rgba(0,0,0,.55);cursor:pointer}' +
    'body.tv-mode #appUpdate{display:none}' +
    '.app-version{margin-top:10px;font-size:11px;letter-spacing:1px;color:var(--muted,#8a8aa0);text-align:center;opacity:.85}';
  document.head.appendChild(st);
})();

// any element marked data-app-version shows the version of the code this page is running
document.addEventListener('DOMContentLoaded', function () {
  var v = typeof APP_VERSION === 'string' ? APP_VERSION : '';
  document.querySelectorAll('[data-app-version]').forEach(function (el) {
    el.textContent = v ? 'เวอร์ชัน ' + v : '';
  });
});

function _appShowUpdateBar() {
  if (document.getElementById('appUpdate') || document.body.classList.contains('tv-mode')) return;
  var umpire = !!document.getElementById('screen-scoring');
  var b = document.createElement('button');
  b.id = 'appUpdate'; b.type = 'button'; b.setAttribute('role', 'status');
  b.textContent = 'มีเวอร์ชันใหม่ — แตะเพื่ออัปเดต' + (umpire ? ' (ทำหลังจบแมตช์)' : '');
  b.onclick = function () { location.reload(); };
  document.body.appendChild(b);
}

function _appUpdateReady() {
  _appNewVersion = true;
  var wait = function () {
    // never over the umpire scoring screen: the bar could sit on a +1 button
    var sc = document.getElementById('screen-scoring');
    if (sc && sc.classList.contains('active')) { setTimeout(wait, 5000); return; }
    _appShowUpdateBar();
  };
  wait();
}

if ('serviceWorker' in navigator) {
  var _hadController = !!navigator.serviceWorker.controller;   // false on the very first visit
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (_hadController) _appUpdateReady();                      // a NEW worker took over, not the first install
    _hadController = true;
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // a page that stays open all day (TV, umpire phone) re-checks for a release every 10 min
      setInterval(function () { reg.update().catch(function () {}); }, 10 * 60 * 1000);
    }).catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}
