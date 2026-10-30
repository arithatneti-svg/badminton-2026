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
    'max-width:92vw;min-height:48px;padding:12px 18px;border-radius:var(--r-sm,10px);border:1px solid var(--gold-line,rgba(240,192,64,.42));background:var(--s3,#1e1e30);' +
    'color:var(--gold-text,#f0c040);font-family:inherit;font-size:14px;font-weight:700;line-height:1.45;box-shadow:var(--shadow-pop,0 8px 30px rgba(0,0,0,.55));cursor:pointer}' +
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

// ============================================================
// INSTALL AS AN APP ("add to home screen").
// Any element with data-app-install is a button that does it; pwa.js shows it only where it can help:
//  - Chrome / Edge / Samsung Internet on Android and desktop hand over a real install prompt (beforeinstallprompt): the button uses it;
//  - iPhone / iPad (Safari, Chrome) have no prompt at all: the button opens a step-by-step sheet (Share -> Add to Home Screen);
//  - Android without a prompt gets the menu steps; in-app browsers (LINE, Facebook, Instagram...) cannot install anything, so the sheet
//    tells people to open the link in Safari / Chrome first and offers to copy it;
//  - already running as an installed app (display-mode: standalone / navigator.standalone), or on a desktop with no prompt: hidden.
// ============================================================
var _installEvt = null;                         // the browser's own prompt, kept until a button asks for it (one use per event)
var _UA = navigator.userAgent || '';
var _IS_IOS = /iPad|iPhone|iPod/.test(_UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS reports a Mac
var _IS_ANDROID = /Android/i.test(_UA);
var _IN_APP = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|TikTok|Messenger|; wv\)/i.test(_UA);

(function () {
  var st = document.createElement('style');
  st.textContent =
    '[data-app-install][hidden],body.tv-mode [data-app-install],body.tv-mode #appInstallSheet{display:none!important}' +
    '#appInstallSheet{position:fixed;inset:0;z-index:3600;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:var(--scrim,rgba(11,42,82,.55))}' +
    '@media (min-width:640px){#appInstallSheet{align-items:center}}' +
    '#appInstallSheet .ai-box{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 24px);overflow:auto;padding:20px 20px calc(18px + env(safe-area-inset-bottom,0px));' +
    'background:var(--s1,#fbf8f1);color:var(--t-hi,#0b2a52);border:2px solid #0b2a52;border-radius:6px;box-shadow:5px 5px 0 rgba(216,26,33,.4)}' +
    '#appInstallSheet .ai-head{display:flex;align-items:center;gap:12px}' +
    '#appInstallSheet .ai-mark{flex:none;width:56px;height:56px}' +
    '#appInstallSheet .ai-title{margin:0;font:800 1.25rem/1.3 var(--font-th-head,var(--font-th,inherit))}' +
    '#appInstallSheet .ai-lead{margin:10px 0 0;color:var(--t-mid,#46607f);font:500 .9375rem/1.5 var(--font-th,inherit)}' +
    '#appInstallSheet .ai-warn{margin:14px 0 0;padding:12px 14px;border:1.5px solid #0b2a52;border-radius:4px;background:rgba(244,196,48,.35);font:600 .9375rem/1.5 var(--font-th,inherit)}' +
    '#appInstallSheet .ai-copy{display:flex;margin-top:10px}' +
    '#appInstallSheet .ai-steps{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:12px}' +
    '#appInstallSheet .ai-steps li{display:flex;gap:12px;align-items:flex-start}' +
    '#appInstallSheet .ai-n{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#d81a21;color:#fff6ea;font:400 1.25rem/1 var(--font-num,inherit)}' +
    '#appInstallSheet .ai-steps b{display:block;font:700 1rem/1.4 var(--font-th,inherit)}' +
    '#appInstallSheet .ai-steps small{display:block;margin-top:2px;color:var(--t-mid,#46607f);font:500 .875rem/1.45 var(--font-th,inherit)}' +
    '#appInstallSheet .ai-note{margin:14px 0 0;color:var(--t-mid,#46607f);font:500 .875rem/1.5 var(--font-th,inherit)}' +
    '#appInstallSheet .ai-close{margin-top:16px;width:100%}';
  document.head.appendChild(st);
})();

function _appIsInstalled() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function _appSyncInstallUi() {
  var show = !_appIsInstalled() && (!!_installEvt || _IS_IOS || _IS_ANDROID);
  var els = document.querySelectorAll('[data-app-install]');
  for (var i = 0; i < els.length; i++) els[i].hidden = !show;
}

window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); _installEvt = e; _appSyncInstallUi(); });
window.addEventListener('appinstalled', function () { _installEvt = null; _appSyncInstallUi(); _appCloseInstallHelp(); });
document.addEventListener('DOMContentLoaded', _appSyncInstallUi);

function appInstall() {
  var e = _installEvt;
  if (!e) { _appShowInstallHelp(); return; }
  _installEvt = null;                           // a prompt event can be used once; Chrome sends a new one when it allows it again
  try {
    e.prompt();
    Promise.resolve(e.userChoice).then(_appSyncInstallUi, _appSyncInstallUi);
  } catch (err) {
    _appSyncInstallUi();
    _appShowInstallHelp();
  }
}

function _appInstallSteps() {
  if (_IS_IOS) {
    return {
      steps: [
        ['เปิดหน้านี้ด้วย Safari', 'ถ้าเปิดมาจาก LINE / Facebook / Instagram ให้แตะ ⋯ แล้วเลือก “เปิดใน Safari” ก่อน'],
        ['แตะปุ่ม “แชร์”', 'รูปสี่เหลี่ยมมีลูกศรชี้ขึ้น อยู่แถบล่างของจอ (iPad อยู่แถบบน)'],
        ['เลื่อนลง แล้วแตะ “เพิ่มลงในหน้าจอโฮม”', 'Add to Home Screen'],
        ['แตะ “เพิ่ม” มุมขวาบน', 'ไอคอนดาวจะขึ้นที่หน้าจอโฮม เปิดจากไอคอนนั้นได้เลย']
      ],
      note: 'บน iPhone แอปที่ติดตั้งจะเริ่มใหม่ ไม่จำชื่อที่เลือกไว้ในเบราว์เซอร์ ต้องเลือกชื่อของคุณอีกครั้งหนึ่ง'
    };
  }
  return {
    steps: [
      ['เปิดหน้านี้ด้วย Chrome', 'ถ้าเปิดมาจาก LINE / Facebook ให้แตะ ⋮ หรือ ⋯ แล้วเลือก “เปิดในเบราว์เซอร์”'],
      ['แตะเมนู ⋮ มุมขวาบน', ''],
      ['แตะ “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”', 'Install app / Add to Home screen'],
      ['แตะ “ติดตั้ง”', 'ไอคอนดาวจะขึ้นที่หน้าจอหลัก เปิดจากไอคอนนั้นได้เลย']
    ],
    note: 'ถ้าไม่เห็นตัวเลือกนี้ ลองรีเฟรชหน้านี้แล้วรอสักครู่ หรืออัปเดต Chrome เป็นเวอร์ชันล่าสุด'
  };
}

var _appInstallOpener = null;

function _appShowInstallHelp() {
  if (document.getElementById('appInstallSheet')) return;
  var umpire = !!document.getElementById('screen-scoring');
  var h = _appInstallSteps();
  var li = '';
  for (var i = 0; i < h.steps.length; i++) {
    li += '<li><span class="ai-n">' + (i + 1) + '</span><span><b>' + h.steps[i][0] + '</b>' + (h.steps[i][1] ? '<small>' + h.steps[i][1] + '</small>' : '') + '</span></li>';
  }
  var s = document.createElement('div');
  s.id = 'appInstallSheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-labelledby', 'aiTitle');
  s.innerHTML =
    '<div class="ai-box">' +
      '<div class="ai-head"><img class="ai-mark" src="media/logo/mark.webp" alt="" width="56" height="56">' +
      '<h2 class="ai-title" id="aiTitle">' + (umpire ? 'ติดตั้งแอปกรรมการ' : 'ติดตั้งเป็นแอปบนมือถือ') + '</h2></div>' +
      '<p class="ai-lead">เปิดจากไอคอนบนหน้าจอโฮมได้เลย ไม่ต้องหาลิงก์ และเต็มจอ</p>' +
      (_IN_APP ? '<div class="ai-warn">ตอนนี้เปิดอยู่ในแอปอื่น (เช่น LINE / Facebook) ซึ่งติดตั้งไม่ได้ — เปิดลิงก์นี้ด้วย ' + (_IS_IOS ? 'Safari' : 'Chrome') + ' ก่อน' +
        '<button type="button" class="ds-btn ds-btn-sm ai-copy" id="aiCopy">คัดลอกลิงก์</button></div>' : '') +
      '<ol class="ai-steps">' + li + '</ol>' +
      '<p class="ai-note">' + h.note + '</p>' +
      '<button type="button" class="ds-btn ds-btn-primary ds-btn-lg ai-close" id="aiClose">เข้าใจแล้ว</button>' +
    '</div>';
  _appInstallOpener = document.activeElement;
  document.body.appendChild(s);
  var close = document.getElementById('aiClose');
  close.onclick = _appCloseInstallHelp;
  s.addEventListener('click', function (e) { if (e.target === s) _appCloseInstallHelp(); });
  var copy = document.getElementById('aiCopy');
  if (copy) copy.onclick = function () { _appCopyLink(copy); };
  s.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { _appCloseInstallHelp(); return; }
    if (e.key !== 'Tab') return;
    var f = s.querySelectorAll('button');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  close.focus();
}

function _appCloseInstallHelp() {
  var s = document.getElementById('appInstallSheet');
  if (!s) return;
  s.remove();
  if (_appInstallOpener && _appInstallOpener.focus) { try { _appInstallOpener.focus(); } catch (e) {} }
  _appInstallOpener = null;
}

function _appCopyLink(btn) {
  var url = location.origin + location.pathname;
  var done = function () { btn.textContent = 'คัดลอกแล้ว ✓'; };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(done, function () { window.prompt('คัดลอกลิงก์นี้', url); }); return; }
  var ta = document.createElement('textarea');
  ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  if (ok) done(); else window.prompt('คัดลอกลิงก์นี้', url);
}
