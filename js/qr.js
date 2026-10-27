// ============================================================
// QR codes — spectator (live view) & umpire panel
// Uses the vendored qrcode-generator (js/vendor/qrcode.min.js, global `qrcode`).
// Links auto-adapt to whatever origin/path the app is served from.
// ============================================================

// origin + directory of the current page (works at "/" or a subpath, any domain)
function _appBaseUrl() {
  const url = new URL(window.location.href);
  const dir = url.pathname.replace(/[^/]*$/, ''); // strip filename, keep trailing "/"
  return url.origin + dir;
}
function spectatorUrl() { return _appBaseUrl() + '?view=live'; }
function umpireUrl()    { return _appBaseUrl() + 'umpire.html'; }
function tvUrl()        { return _appBaseUrl() + '?view=tv'; }
function openTvScreen() { window.open(tvUrl(), '_blank'); } // เปิดจอ TV (โปรเจกเตอร์)

function _makeQrDataUrl(text, cell = 7, margin = 4) {
  try {
    const qr = qrcode(0, 'M');   // type 0 = auto-size, ECC level M
    qr.addData(text);
    qr.make();
    return qr.createDataURL(cell, margin); // data:image/gif (black on white)
  } catch (e) {
    console.error('QR generate failed:', e);
    return '';
  }
}

function openQrModal() {
  if (userRole !== 'admin' && userRole !== 'superadmin')
    return showToast('ต้องใช้สิทธิ์ Admin ขึ้นไป', 'error');
  if (typeof qrcode === 'undefined')
    return showToast('โหลดตัวสร้าง QR ไม่สำเร็จ', 'error');

  const sUrl = spectatorUrl(), uUrl = umpireUrl();
  document.getElementById('qrSpectatorImg').src = _makeQrDataUrl(sUrl);
  document.getElementById('qrUmpireImg').src    = _makeQrDataUrl(uUrl);
  document.getElementById('qrSpectatorUrl').textContent = sUrl;
  document.getElementById('qrUmpireUrl').textContent    = uUrl;
  document.getElementById('qrModal').classList.add('open');
}
function closeQrModal() { document.getElementById('qrModal').classList.remove('open'); }

function copyQrLink(which) {
  const url = which === 'umpire' ? umpireUrl() : spectatorUrl();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast('คัดลอกลิงก์แล้ว', 'success'),
      () => showToast('คัดลอกไม่สำเร็จ — ก็อปจากข้อความด้านล่างได้', 'error')
    );
  } else {
    showToast('อุปกรณ์นี้คัดลอกอัตโนมัติไม่ได้ — ก็อปจากข้อความด้านล่าง', 'error');
  }
}

// เปิดหน้าพิมพ์ QR ทั้งคู่ (สำหรับปริ้นต์แปะหน้างาน) - its own page, black on white, two big tiles on one A4
function printQrCodes() {
  const sUrl = spectatorUrl(), uUrl = umpireUrl();
  const sImg = _makeQrDataUrl(sUrl, 10, 4);
  const uImg = _makeQrDataUrl(uUrl, 10, 4);
  const w = window.open('', '_blank');
  if (!w) return showToast('เปิดหน้าต่างพิมพ์ไม่ได้ (popup ถูกบล็อก)', 'error');
  const tile = (img, title, desc, url) => `<section class="tile"><img src="${img}" alt="QR ${title}"><h2>${title}</h2><p class="desc">${desc}</p><p class="url">${escHtml(url)}</p></section>`;
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR — Badminton Sports Day 2026</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }   /* paper and ink: the browser's own Canvas / CanvasText, so a print is never dark */
  body { margin: 0; padding: 32px 24px; font-family: 'Noto Sans Thai','Segoe UI',Tahoma,Arial,sans-serif; color: CanvasText; background: Canvas; text-align: center; }
  h1 { margin: 0; font-size: 30px; line-height: 1.3; }
  .sub { margin: 4px 0 28px; color: GrayText; font-size: 16px; }
  .tiles { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; }
  .tile { width: 320px; padding: 24px 20px; border: 2px solid CanvasText; border-radius: 16px; break-inside: avoid; }
  .tile img { width: 270px; height: 270px; image-rendering: pixelated; }
  .tile h2 { margin: 14px 0 2px; font-size: 26px; line-height: 1.3; }
  .desc { margin: 0; color: GrayText; font-size: 15px; line-height: 1.5; }
  .url { margin: 12px auto 0; max-width: 270px; color: GrayText; font-size: 11px; word-break: break-all; }
  .actions { margin-top: 28px; }
  button { padding: 10px 26px; font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
  @media print { .actions { display: none; } }
</style></head><body>
  <h1>Badminton Sports Day 2026</h1>
  <p class="sub">สแกนเพื่อเข้าใช้งาน</p>
  <div class="tiles">
    ${tile(sImg, 'ดูคะแนนสด', 'สำหรับผู้ชม — ดูอย่างเดียว ไม่ต้องล็อกอิน', sUrl)}
    ${tile(uImg, 'กรรมการ', 'สำหรับกรรมการ — เข้าแผงให้คะแนน', uUrl)}
  </div>
  <div class="actions"><button onclick="window.print()">พิมพ์</button></div>
</body></html>`);
  w.document.close();
}
