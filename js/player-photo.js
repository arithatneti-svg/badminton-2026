// ══════════════════════════════════════════
// PLAYER PHOTO
// Photos (compressed JPEG data URLs) live at
//   sportsday_2026_photos/{playerId} = { photo, t }
// OUTSIDE the live blob (sportsday_2026_data) that every screen subscribes
// to. Inside it they were 99% of the payload (~1.8 MB for 51 photos), so
// every viewer downloaded them before seeing a single score, and every full
// save re-sent them to every screen.
//
// Each face is now fetched on demand — only players actually rendered — and
// kept live with a per-player listener; when it arrives the avatars already
// on screen are upgraded in place (no re-render). Until the one-time
// migration runs, the legacy playerProfiles[id].photo is still used as a
// fallback, so old and new data both display.
// ══════════════════════════════════════════

const PHOTO_MAX_DIM = 480;   // px, long side (aspect kept so framing can be adjusted)
const PHOTO_QUALITY = 0.8;
const PHOTO_MAX_KB  = 130;   // re-compress harder above this

const photosRef = firebase.database().ref('sportsday_2026_photos');
const _photos   = {};          // id → dataURL, or null = no photo at the new path
const _photoReq = new Set();   // ids we already listen to

function _legacyPhoto(id) {
  return (appState.playerProfiles || {})[id]?.photo || null;
}

function playerPhoto(id) {
  if (!id) return null;
  if (!_photoReq.has(id)) _watchPhoto(id);
  return _photos[id] || _legacyPhoto(id);
}

function _watchPhoto(id) {
  _photoReq.add(id);
  photosRef.child(id).on('value',
    snap => { const v = snap.val(); _photos[id] = (v && v.photo) || null; _paintAvatars(id); },
    ()   => { _photos[id] = null; });   // read refused → the legacy fallback keeps working
}

// Upgrade (or downgrade) every avatar of this player already on screen.
function _paintAvatars(id) {
  const photo = playerPhoto(id);
  const name  = (appState.players || []).find(x => x.id === id)?.name || id;
  document.querySelectorAll(`.pav[data-pid="${CSS.escape(id)}"]`).forEach(el => {
    const img = el.querySelector('img');
    if (photo) {
      if (img) { if (img.getAttribute('src') !== photo) img.src = photo; return; }
      const im = document.createElement('img');
      im.src = photo; im.alt = name; im.loading = 'lazy';
      im.style.objectPosition = playerPhotoPos(id);
      el.classList.remove('pav-initials'); el.classList.add('has-photo');
      el.replaceChildren(im);
    } else if (img) {
      el.classList.remove('has-photo'); el.classList.add('pav-initials');
      el.textContent = id;
    }
  });
}
// Focal point for the circular crop — "x% y%". Faces usually sit high, so the
// default leans toward the upper-centre; admins can fine-tune per player.
function playerPhotoPos(id) {
  return (appState.playerProfiles || {})[id]?.photoPos || '50% 30%';
}

// Shared avatar renderer — used by the directory, the profile header,
// the reports list, the match board chips and H2H rows so a face looks
// the same everywhere it appears. `object-position` lets each player's
// stored focal point decide what shows inside the circle.
function avatarHtml(player, size = 38, opts = {}) {
  const p = typeof player === 'string'
    ? (appState.players || []).find(x => x.id === player)
    : player;
  if (!p) return '';
  const photo = playerPhoto(p.id);
  const teamCls = p.team === 'Red' ? 'pav-red' : 'pav-blue';
  const extra = opts.className ? ' ' + opts.className : '';
  const style = `--pav-size:${size}px;`;
  const pid = escHtml(p.id);   // lets a late-arriving photo upgrade this avatar in place
  return photo
    ? `<span class="pav ${teamCls} has-photo${extra}" data-pid="${pid}" style="${style}"><img src="${photo}" alt="${escHtml(p.name)}" loading="lazy" style="object-position:${playerPhotoPos(p.id)}"></span>`
    : `<span class="pav ${teamCls} pav-initials${extra}" data-pid="${pid}" style="${style}">${pid}</span>`;
}

// ── Lightbox: click a real photo to see it full-size ──
function openPhotoLightbox(id) {
  const p = (appState.players || []).find(x => x.id === id);
  const photo = playerPhoto(id);
  if (!p || !photo) return;
  const ov = document.getElementById('photoLightbox');
  if (!ov) return;
  ov.querySelector('.plb-img').src = photo;
  ov.querySelector('.plb-name').textContent = p.name;
  ov.querySelector('.plb-meta').textContent = `${p.id} · ${p.team === 'Red' ? '🔴' : '🔵'} ${p.team} · Group ${p.group}`;
  ov.classList.add('open');
}
function closePhotoLightbox() {
  document.getElementById('photoLightbox')?.classList.remove('open');
}

// ── Upload ────────────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Keep the whole photo (aspect preserved, just downscaled) so the circular
      // frame can be re-positioned later instead of hard-cropping the face off.
      const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth  * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      let q = PHOTO_QUALITY;
      let out = c.toDataURL('image/jpeg', q);
      // a busy photo can still come out large — step the quality down
      while (out.length / 1024 > PHOTO_MAX_KB && q > 0.4) {
        q -= 0.12;
        out = c.toDataURL('image/jpeg', q);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ หรือเปิดไม่ได้')); };
    img.src = url;
  });
}

// ── Reposition: drag the photo inside the circle to set its focal point ──
let _adjPid = null, _adjX = 50, _adjY = 30, _adjDrag = null;
function openPhotoAdjust(id) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  const photo = playerPhoto(id);
  if (!photo) return showToast('ยังไม่มีรูป', 'error');
  _adjPid = id;
  const cur = playerPhotoPos(id).split(' ');
  _adjX = parseFloat(cur[0]) || 50;
  _adjY = parseFloat(cur[1]) || 30;
  const ov = document.getElementById('photoAdjustModal');
  const img = ov.querySelector('.padj-img');
  img.src = photo;
  img.style.objectPosition = `${_adjX}% ${_adjY}%`;
  ov.classList.add('open');
}
function _adjApply() {
  const img = document.querySelector('#photoAdjustModal .padj-img');
  if (img) img.style.objectPosition = `${_adjX}% ${_adjY}%`;
}
function photoAdjustStart(e) {
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  _adjDrag = { x: t.clientX, y: t.clientY, px: _adjX, py: _adjY };
}
function photoAdjustMove(e) {
  if (!_adjDrag) return;
  const t = e.touches ? e.touches[0] : e;
  const frame = document.querySelector('#photoAdjustModal .padj-frame');
  const w = frame ? frame.offsetWidth : 220;
  // drag right → reveal the left of the photo → object-position x decreases
  _adjX = Math.max(0, Math.min(100, _adjDrag.px - (t.clientX - _adjDrag.x) / w * 100));
  _adjY = Math.max(0, Math.min(100, _adjDrag.py - (t.clientY - _adjDrag.y) / w * 100));
  _adjApply();
}
function photoAdjustEnd() { _adjDrag = null; }
function savePhotoAdjust() {
  if (!_adjPid) return;
  if (!appState.playerProfiles) appState.playerProfiles = {};
  if (!appState.playerProfiles[_adjPid]) appState.playerProfiles[_adjPid] = {};
  const pos = `${Math.round(_adjX)}% ${Math.round(_adjY)}%`;
  appState.playerProfiles[_adjPid].photoPos = pos;
  // one field, not saveKeys(['playerProfiles']) — that re-uploaded every
  // profile (and, before the migration, every photo) to move one focal point
  dbRef.child(`playerProfiles/${_adjPid}/photoPos`).set(pos);
  const id = _adjPid;
  closePhotoAdjust();
  document.querySelectorAll(`.pav[data-pid="${CSS.escape(id)}"] img`).forEach(im => { im.style.objectPosition = pos; });
  refreshPlayerVisuals(id);
  showToast('✅ ปรับตำแหน่งรูปแล้ว', 'success');
}
function closePhotoAdjust() {
  document.getElementById('photoAdjustModal')?.classList.remove('open');
  _adjPid = null; _adjDrag = null;
}

function pickPlayerPhoto(playerId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('เลือกไฟล์รูปภาพเท่านั้น', 'error');
    try {
      showToast('⏳ กำลังย่อรูป...', 'info');
      const dataUrl = await compressImage(file);
      savePlayerPhoto(playerId, dataUrl);
    } catch (e) {
      showToast('❌ ' + e.message, 'error');
    }
  };
  document.body.appendChild(input);
  input.click();
}

async function savePlayerPhoto(playerId, dataUrl) {
  try {
    await photosRef.child(playerId).set({ photo: dataUrl, t: Date.now() });
    _photos[playerId] = dataUrl;
    if (!_photoReq.has(playerId)) _watchPhoto(playerId);
    // drop any legacy copy so the live blob stays small (tiny targeted write)
    if (_legacyPhoto(playerId)) await dbRef.child(`playerProfiles/${playerId}/photo`).set(null);
  } catch (e) {
    // new path refused (e.g. database rules) → fall back to the old location
    // so an upload never simply fails
    console.warn('photo → sportsday_2026_photos failed, using legacy path:', e);
    if (!appState.playerProfiles) appState.playerProfiles = {};
    if (!appState.playerProfiles[playerId]) appState.playerProfiles[playerId] = {};
    appState.playerProfiles[playerId].photo = dataUrl;
    dbRef.child(`playerProfiles/${playerId}/photo`).set(dataUrl);
  }
  _paintAvatars(playerId);
  refreshPlayerVisuals(playerId);
  showToast('✅ อัปเดตรูปแล้ว', 'success');
}

function removePlayerPhoto(playerId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  if (!playerPhoto(playerId)) return;
  showConfirmDialog('ลบรูปผู้เล่นคนนี้?', async () => {
    try { await photosRef.child(playerId).remove(); } catch (e) { /* not there / refused */ }
    _photos[playerId] = null;
    if (_legacyPhoto(playerId)) {
      appState.playerProfiles[playerId].photo = null;   // null (not delete) so RTDB clears it
      await dbRef.child(`playerProfiles/${playerId}/photo`).set(null);
    }
    _paintAvatars(playerId);
    refreshPlayerVisuals(playerId);
    showToast('ลบรูปแล้ว', 'success');
  });
}

// ── One-time migration: move legacy photos out of the live blob ──
// Safe by construction: backup first → copy → verify every photo reads back
// from the new path → only then strip them from sportsday_2026_data (one
// atomic multi-path update). Any failure before the strip leaves the original
// data untouched. Idempotent: re-running with nothing left is a no-op, and a
// photo already at the new path (e.g. a newer upload) is never overwritten.
function migratePlayerPhotos() {
  if (userRole !== 'superadmin') return showToast('⛔ เฉพาะ Super Admin', 'error');
  const legacy = Object.entries(appState.playerProfiles || {}).filter(([, p]) => p && p.photo);
  if (!legacy.length) return showToast('✅ รูปทั้งหมดอยู่นอกข้อมูลหลักแล้ว ไม่มีอะไรต้องย้าย', 'success');
  const kb = Math.round(legacy.reduce((s, [, p]) => s + p.photo.length, 0) / 1024);
  showConfirmDialog(`ย้ายรูปผู้เล่น ${legacy.length} รูป (${kb} KB) ออกจากข้อมูลหลัก?\nระบบจะ backup ให้ก่อน`, async () => {
    try {
      showToast('⏳ 1/3 กำลัง backup...', 'info');
      // written directly (not via backupState, which swallows errors) so a
      // failed backup stops the migration before anything is touched
      await backupsRef.push({
        ts: Date.now(), reason: 'manual', label: 'ก่อนย้ายรูปผู้เล่น (มีรูปครบ)',
        counts: {
          players: (appState.players || []).length, ongoing: (appState.ongoingMatches || []).length,
          history: (appState.matchHistory || []).length, matchCounter: appState.matchCounter || 0,
          scoreRed: appState.globalScoreRed || 0, scoreBlue: appState.globalScoreBlue || 0,
        },
        state: appState,
      });

      showToast('⏳ 2/3 กำลังคัดลอกรูป...', 'info');
      const existing = (await photosRef.once('value')).val() || {};
      const copy = {};
      legacy.forEach(([id, p]) => {
        if (!(existing[id] && existing[id].photo)) copy[id] = { photo: p.photo, t: Date.now() };
      });
      if (Object.keys(copy).length) await photosRef.update(copy);

      // verify before touching the live blob
      const after = (await photosRef.once('value')).val() || {};
      const bad = legacy.filter(([id]) =>
        !(after[id] && after[id].photo) || (copy[id] && after[id].photo !== copy[id].photo));
      if (bad.length) throw new Error(`ตรวจสอบไม่ผ่าน ${bad.length} รูป (${bad.map(([id]) => id).join(', ')})`);

      showToast('⏳ 3/3 กำลังลบรูปออกจากข้อมูลหลัก...', 'info');
      const strip = {};
      legacy.forEach(([id]) => { strip[`playerProfiles/${id}/photo`] = null; });
      await dbRef.update(strip);

      legacy.forEach(([id]) => { _photos[id] = after[id].photo; if (!_photoReq.has(id)) _watchPhoto(id); });
      const blobKB = Math.round(JSON.stringify(appState).length / 1024);
      showToast(`✅ ย้ายแล้ว ${legacy.length} รูป — ข้อมูลหลักเหลือ ~${blobKB} KB`, 'success');
      if (typeof renderPhotoMigrationStatus === 'function') renderPhotoMigrationStatus();
    } catch (e) {
      console.error('photo migration failed:', e);
      showToast('❌ ย้ายไม่สำเร็จ: ' + (e.message || e) + ' — ข้อมูลเดิมยังอยู่ครบ', 'error');
    }
  });
}

// Status line + button in the Backup modal (superadmin only).
function renderPhotoMigrationStatus() {
  const el = document.getElementById('photoMigrateBox');
  if (!el) return;
  const legacy = Object.values(appState.playerProfiles || {}).filter(p => p && p.photo);
  if (!legacy.length) {
    el.innerHTML = `<span style="color:var(--green);">✅ รูปผู้เล่นแยกออกจากข้อมูลหลักแล้ว</span>`;
    return;
  }
  const kb = Math.round(legacy.reduce((s, p) => s + p.photo.length, 0) / 1024);
  el.innerHTML = `<div style="margin-bottom:8px;">🖼️ ยังมีรูป <b>${legacy.length}</b> รูป (${kb} KB) ฝังอยู่ในข้อมูลหลัก —
      ทุกจอต้องโหลดก้อนนี้ก่อนเห็นคะแนน</div>
    <button class="btn btn-primary btn-sm" onclick="migratePlayerPhotos()">🚚 ย้ายรูปออกจากข้อมูลหลัก</button>`;
}

// Repaint every surface a face can appear on, without a full reload.
function refreshPlayerVisuals(playerId) {
  if (typeof renderPlayersTab   === 'function') renderPlayersTab();
  if (typeof renderMatchBoard   === 'function') renderMatchBoard();
  if (typeof renderReports      === 'function' && document.getElementById('statsCardList')) renderReports();
  if (playerId && _pdCurrentId === playerId && typeof openPlayerProfile === 'function') openPlayerProfile(playerId);
}
