// ============================================================
// PWA — register the service worker (progressive enhancement).
// The app works fine without it; the SW just makes the shell
// installable and loadable during network blips.
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}
