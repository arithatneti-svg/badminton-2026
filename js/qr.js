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
    return showToast('⛔ ต้องใช้สิทธิ์ Admin ขึ้นไป', 'error');
  if (typeof qrcode === 'undefined')
    return showToast('❌ โหลดตัวสร้าง QR ไม่สำเร็จ', 'error');

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
      () => showToast('📋 คัดลอกลิงก์แล้ว', 'success'),
      () => showToast('คัดลอกไม่สำเร็จ — ก็อปจากข้อความด้านล่างได้', 'error')
    );
  } else {
    showToast('อุปกรณ์นี้คัดลอกอัตโนมัติไม่ได้ — ก็อปจากข้อความด้านล่าง', 'error');
  }
}

// เปิดหน้าพิมพ์ QR ทั้งคู่ (สำหรับปริ้นต์แปะหน้างาน)
function printQrCodes() {
  const sUrl = spectatorUrl(), uUrl = umpireUrl();
  const sImg = _makeQrDataUrl(sUrl, 10, 4);
  const uImg = _makeQrDataUrl(uUrl, 10, 4);
  const w = window.open('', '_blank');
  if (!w) return showToast('เปิดหน้าต่างพิมพ์ไม่ได้ (popup ถูกบล็อก)', 'error');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR — Badminton Sports Day 2026</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:32px;color:#111;}
  h1{margin:0 0 4px;font-size:26px;} .sub{color:#666;margin-bottom:26px;}
  .qwrap{display:inline-block;margin:16px 24px;vertical-align:top;}
  .qwrap img{width:280px;height:280px;image-rendering:pixelated;border:1px solid #ddd;border-radius:8px;}
  .qtitle{font-size:22px;font-weight:800;margin-top:14px;}
  .qdesc{color:#555;font-size:14px;margin-top:2px;}
  .qurl{font-size:11px;color:#999;margin-top:6px;word-break:break-all;max-width:280px;margin-left:auto;margin-right:auto;}
  @media print{ button{display:none;} }
</style></head><body>
  <h1>🏸 Badminton Sports Day 2026</h1>
  <div class="sub">สแกนเพื่อเข้าใช้งาน</div>
  <div class="qwrap"><img src="${sImg}"><div class="qtitle">👀 ดูคะแนนสด</div><div class="qdesc">สำหรับผู้ชม — ดูอย่างเดียว ไม่ต้องล็อกอิน</div><div class="qurl">${sUrl}</div></div>
  <div class="qwrap"><img src="${uImg}"><div class="qtitle">🎯 กรรมการ</div><div class="qdesc">สำหรับกรรมการ — เข้าแผงให้คะแนน</div><div class="qurl">${uUrl}</div></div>
  <br><button onclick="window.print()" style="margin-top:24px;padding:10px 26px;font-size:15px;cursor:pointer;">🖨 พิมพ์</button>
</body></html>`);
  w.document.close();
}
