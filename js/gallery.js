// ══════════════════════════════════════════════════════════════
// EVENT GALLERY — atmosphere photos, one collection per year
//
// Photos are compressed JPEG data URLs stored under gallery/{year}/{pushId}
// (a separate RTDB root, so the gallery survives season resets and is not
// tied to sportsday_2026_data). Same no-Storage-bucket approach as player
// photos, just larger — atmosphere shots keep their aspect ratio and cap
// at 1200px. Everyone can view; only admins upload and delete.
// ══════════════════════════════════════════════════════════════

const galleryRef = firebase.database().ref('gallery');
let _gallery = {};            // { year: { pushId: {url, caption, event, ts, key?} } }
let _galleryYear = '';        // selected year
let _galleryLoaded = false;

// ── R2 photo storage (Cloudflare Pages Function) ──────────────
// New uploads go to R2 and store a short "/img/…" url + the object key,
// instead of a base64 data URL bloating RTDB. Must equal the Pages env
// var PHOTO_UPLOAD_KEY. Client-side, so obscurity-level only — same
// posture as the admin passcode. If R2 is not provisioned yet, uploads
// transparently fall back to the old inline-base64 behaviour.
const PHOTO_UPLOAD_KEY = 'bdm2026-r2-9f3a2c7e';
async function uploadGalleryBlobToR2(blob, year) {
  const res = await fetch(`/api/photo?year=${encodeURIComponent(year)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'Authorization': 'Bearer ' + PHOTO_UPLOAD_KEY },
    body: blob,
  });
  if (!res.ok) throw new Error('r2-upload-' + res.status);
  return res.json();            // { key, url }
}
// best-effort: the RTDB node is the source of truth for the album, so a
// failed object delete just leaves an orphan in the bucket, never a broken UI
function deleteGalleryR2(key) {
  if (!key) return;
  fetch('/api/photo', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PHOTO_UPLOAD_KEY },
    body: JSON.stringify({ key }),
  }).catch(() => {});
}

// Lazy: the gallery holds full-size photos, so it is fetched only when the
// tab is opened — not downloaded on every app boot for users who never look
// at it. Re-fetched each time the tab opens so new uploads from other
// devices appear on return; upload/delete refresh it immediately.
function loadGallery(force) {
  if (_galleryLoaded && !force) return Promise.resolve(_gallery);
  return galleryRef.once('value').then((snap) => {
    _gallery = snap.val() || {};
    _galleryLoaded = true;
    return _gallery;
  }).catch(() => _gallery);
}

function galleryYears() {
  const ys = Object.keys(_gallery).filter(y => _gallery[y] && Object.keys(_gallery[y]).length);
  return ys.sort((a, b) => b.localeCompare(a));   // newest first
}
function currentEventYear() {
  return String(appState?.seasonYear || new Date().getFullYear());
}
// photos of a year as a sorted array [{id, url, caption, ts}]
function galleryPhotos(year) {
  const g = _gallery[year] || {};
  return Object.entries(g)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

const GAL_MAX_PER_YEAR = 60;   // soft cap — heavy albums load slowly on mobile
function galleryCount(year) { return Object.keys(_gallery[year] || {}).length; }
// a year usually has two events — early and late. Default the label by month.
function defaultEvent() { return new Date().getMonth() < 6 ? 'ต้นปี' : 'ปลายปี'; }
// group a year's photos by their event label, keeping each photo's flat index
// so the lightbox (which walks the flat year list) stays in sync
function galleryGroups(year) {
  const flat = galleryPhotos(year);
  const order = [];               // event labels in first-seen order
  const byEvent = {};
  flat.forEach((p, i) => {
    const ev = (p.event || '').trim() || '—';
    if (!byEvent[ev]) { byEvent[ev] = []; order.push(ev); }
    byEvent[ev].push({ ...p, _i: i });
  });
  return order.map(ev => ({ event: ev, photos: byEvent[ev] }));
}

// ── Render ────────────────────────────────────────────────────
function renderGallery() {
  const gridEl = document.getElementById('galleryGrid');
  if (!gridEl) return;
  // first open (or a tab re-open) pulls fresh data, then repaints
  loadGallery(_galleryLoaded).then(() => paintGallery());
  paintGallery();   // paint immediately from cache (or empty) so the tab is not blank
}
function paintGallery() {
  const yearsEl = document.getElementById('galleryYears');
  const gridEl = document.getElementById('galleryGrid');
  if (!gridEl) return;
  const canEdit = userRole === 'admin' || userRole === 'superadmin';

  const years = galleryYears();
  // default the selected year to the newest that has photos, else the event year
  if (!_galleryYear || (!years.includes(_galleryYear) && !canEdit)) {
    _galleryYear = years[0] || currentEventYear();
  }
  if (!_galleryYear) _galleryYear = currentEventYear();

  // year pills — always offer the current event year to an admin so they
  // can start a fresh year's album before any photo exists
  const pillYears = [...new Set([...years, ...(canEdit ? [currentEventYear()] : [])])]
    .sort((a, b) => b.localeCompare(a));
  if (yearsEl) {
    yearsEl.innerHTML = pillYears.length <= 1 ? '' : pillYears.map(y =>
      `<button class="gal-year${y === _galleryYear ? ' active' : ''}" onclick="setGalleryYear('${y}')">${y}${
        (_gallery[y] ? Object.keys(_gallery[y]).length : 0) ? `<span>${Object.keys(_gallery[y]).length}</span>` : ''}</button>`
    ).join('');
  }

  const admin = document.getElementById('galleryAdminBar');
  if (admin) admin.style.display = canEdit ? 'flex' : 'none';
  // pre-fill the event label with a month-based default so an admin can just
  // pick files, but can override it (ต้นปี / ปลายปี / custom)
  const evIn = document.getElementById('galEventInput');
  if (evIn && canEdit && !evIn.value) evIn.value = defaultEvent();

  // a clear "which year" heading above everything
  const titleEl = document.getElementById('galleryYearTitle');
  const count = galleryCount(_galleryYear);
  if (titleEl) titleEl.innerHTML = `ปี ${_galleryYear}${count ? ` <span>${count} รูป</span>` : ''}`;

  const photos = galleryPhotos(_galleryYear);
  if (!photos.length) {
    gridEl.innerHTML = `<div class="gal-empty">
      <span class="gal-empty-icon">🖼️</span>
      <div>ยังไม่มีรูปของปี ${_galleryYear}</div>
      ${canEdit ? '<div class="gal-empty-sub">พิมพ์ชื่องาน แล้วแตะ “เพิ่มรูป” เพื่ออัปโหลด</div>' : '<div class="gal-empty-sub">รูปบรรยากาศงานจะแสดงที่นี่</div>'}
    </div>`;
    return;
  }

  // one section per event (ต้นปี / ปลายปี / …), each with its own masonry
  gridEl.innerHTML = galleryGroups(_galleryYear).map(group => `
    <div class="gal-section">
      <div class="gal-section-head">
        <span class="gal-section-name">${group.event === '—' ? '📷 รูปงาน' : '📅 ' + escHtml(group.event)}</span>
        <span class="gal-section-count">${group.photos.length} รูป</span>
      </div>
      <div class="gal-masonry">
        ${group.photos.map(p => `
          <figure class="gal-item" onclick="openLightbox(${p._i})">
            <img src="${p.url}" alt="${escHtml(p.caption || '')}" loading="lazy">
            ${p.caption ? `<figcaption>${escHtml(p.caption)}</figcaption>` : ''}
            ${canEdit ? `<button class="gal-del" title="ลบรูป" onclick="event.stopPropagation();deleteGalleryPhoto('${_galleryYear}','${p.id}')">🗑</button>` : ''}
          </figure>`).join('')}
      </div>
    </div>`).join('');
}

function setGalleryYear(y) { _galleryYear = String(y); renderGallery(); }

// ── Upload ────────────────────────────────────────────────────
function pickGalleryPhotos() {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.style.display = 'none';
  input.onchange = () => { const files = [...(input.files || [])]; input.remove(); uploadGalleryFiles(files); };
  document.body.appendChild(input);
  input.click();
}

async function uploadGalleryFiles(files) {
  if (!files.length) return;
  const year = _galleryYear || currentEventYear();
  const event = (document.getElementById('galEventInput')?.value || '').trim() || defaultEvent();
  // soft cap: a year's album loads in one go, so keep it light on mobile data
  const already = galleryCount(year);
  if (already + files.length > GAL_MAX_PER_YEAR) {
    return showToast(`⚠️ ปี ${year} จะเกิน ${GAL_MAX_PER_YEAR} รูป (ตอนนี้ ${already}) — ลบรูปเก่าก่อน หรืออัปโหลดน้อยลง`, 'error');
  }
  let ok = 0, fail = 0, viaR2 = 0;
  showToast(`⏳ กำลังอัปโหลด ${files.length} รูป...`, 'info');
  for (const file of files) {
    if (!file.type.startsWith('image/')) { fail++; continue; }
    try {
      const blob = await compressGalleryBlob(file);
      let rec;
      try {
        const { url, key } = await uploadGalleryBlobToR2(blob, year);
        rec = { url, key, caption: '', event, ts: Date.now() };
        viaR2++;
      } catch (_) {
        // R2 not provisioned (or offline) → keep the original behaviour: inline base64
        rec = { url: await blobToDataURL(blob), caption: '', event, ts: Date.now() };
      }
      await galleryRef.child(year).push(rec);
      ok++;
    } catch (e) { fail++; }
  }
  await loadGallery(true); renderGallery();
  const mode = ok && viaR2 === ok ? ' ☁️' : (viaR2 ? ` (☁️×${viaR2})` : '');
  showToast(`✅ อัปโหลด ${ok} รูป${fail ? ` · พลาด ${fail}` : ''}${mode} (ปี ${year})`, fail ? 'warning' : 'success');
}

// keep aspect ratio, cap the long edge, step quality down under a size cap.
// Produces a JPEG Blob — uploaded straight to R2, or turned into a data URL
// by blobToDataURL() when R2 is unavailable and we fall back to inline base64.
const GAL_MAX_EDGE = 1200;
const GAL_QUALITY = 0.72;
const GAL_MAX_KB = 300;
function compressGalleryBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, GAL_MAX_EDGE / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const step = (q) => c.toBlob((blob) => {
        if (!blob) return reject(new Error('encode failed'));
        if (blob.size / 1024 > GAL_MAX_KB && q > 0.4) return step(+(q - 0.1).toFixed(2));
        resolve(blob);
      }, 'image/jpeg', q);
      step(GAL_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

function deleteGalleryPhoto(year, id) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  const key = _gallery[year]?.[id]?.key;
  showConfirmDialog('ลบรูปนี้?', () => {
    galleryRef.child(year).child(id).remove().then(() => {
      deleteGalleryR2(key);   // no-op for old base64 photos (no key)
      if (_gallery[year]) delete _gallery[year][id];
      renderGallery();
      showToast('ลบรูปแล้ว', 'success');
    }).catch(() => showToast('ลบไม่สำเร็จ', 'error'));
  });
}

// ── Lightbox ──────────────────────────────────────────────────
let _lbIndex = -1;
function openLightbox(i) {
  const photos = galleryPhotos(_galleryYear);
  if (!photos.length) return;
  _lbIndex = Math.max(0, Math.min(i, photos.length - 1));
  document.getElementById('galleryLightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
  paintLightbox();
}
function closeLightbox() {
  document.getElementById('galleryLightbox').classList.remove('open');
  document.body.style.overflow = '';
  _lbIndex = -1;
}
function lightboxNav(dir) {
  const photos = galleryPhotos(_galleryYear);
  if (!photos.length) return;
  _lbIndex = (_lbIndex + dir + photos.length) % photos.length;
  paintLightbox();
}
function paintLightbox() {
  const photos = galleryPhotos(_galleryYear);
  const p = photos[_lbIndex];
  if (!p) return closeLightbox();
  const img = document.getElementById('lbImg');
  img.src = p.url;
  img.alt = p.caption || '';
  document.getElementById('lbCounter').textContent = `${_lbIndex + 1} / ${photos.length}`;
  document.getElementById('lbCaption').textContent = p.caption || '';
  const canEdit = userRole === 'admin' || userRole === 'superadmin';
  const del = document.getElementById('lbDelete');
  if (del) del.style.display = canEdit ? 'inline-flex' : 'none';
}
function lightboxDelete() {
  const photos = galleryPhotos(_galleryYear);
  const p = photos[_lbIndex];
  if (!p) return;
  const year = _galleryYear, id = p.id, key = p.key, wasLast = photos.length === 1;
  showConfirmDialog('ลบรูปนี้?', () => {
    galleryRef.child(year).child(id).remove().then(() => {
      deleteGalleryR2(key);   // no-op for old base64 photos (no key)
      if (_gallery[year]) delete _gallery[year][id];
      showToast('ลบรูปแล้ว', 'success');
      if (wasLast) { closeLightbox(); renderGallery(); }
      else { if (_lbIndex >= photos.length - 1) _lbIndex = photos.length - 2; paintLightbox(); renderGallery(); }
    });
  });
}

// keyboard + swipe, active only while the lightbox is open
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('galleryLightbox')?.classList.contains('open')) return;
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  else if (e.key === 'ArrowRight') lightboxNav(1);
  else if (e.key === 'Escape') closeLightbox();
});
let _lbTouchX = null;
function lbTouchStart(e) { _lbTouchX = e.changedTouches[0].clientX; }
function lbTouchEnd(e) {
  if (_lbTouchX === null) return;
  const dx = e.changedTouches[0].clientX - _lbTouchX;
  if (Math.abs(dx) > 45) lightboxNav(dx < 0 ? 1 : -1);
  _lbTouchX = null;
}
