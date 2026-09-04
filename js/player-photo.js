// ══════════════════════════════════════════
// PLAYER PHOTO
// Photos are stored as compressed data URLs on
// playerProfiles[id].photo — same path everything else already
// syncs, so there is no Storage bucket / Worker to stand up.
// A 256px JPEG lands around 15–25 KB, so 54 players is ~1 MB in RTDB.
// ══════════════════════════════════════════

const PHOTO_MAX_DIM = 480;   // px, long side (aspect kept so framing can be adjusted)
const PHOTO_QUALITY = 0.8;
const PHOTO_MAX_KB  = 130;   // re-compress harder above this

function playerPhoto(id) {
  return (appState.playerProfiles || {})[id]?.photo || null;
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
  return photo
    ? `<span class="pav ${teamCls} has-photo${extra}" style="${style}"><img src="${photo}" alt="${escHtml(p.name)}" loading="lazy" style="object-position:${playerPhotoPos(p.id)}"></span>`
    : `<span class="pav ${teamCls} pav-initials${extra}" style="${style}">${p.id}</span>`;
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
  appState.playerProfiles[_adjPid].photoPos = `${Math.round(_adjX)}% ${Math.round(_adjY)}%`;
  saveKeys(['playerProfiles'], true);
  const id = _adjPid;
  closePhotoAdjust();
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

function savePlayerPhoto(playerId, dataUrl) {
  if (!appState.playerProfiles) appState.playerProfiles = {};
  if (!appState.playerProfiles[playerId]) appState.playerProfiles[playerId] = {};
  appState.playerProfiles[playerId].photo = dataUrl;
  saveKeys(['playerProfiles'], true);
  refreshPlayerVisuals(playerId);
  showToast('✅ อัปเดตรูปแล้ว', 'success');
}

function removePlayerPhoto(playerId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  if (!playerPhoto(playerId)) return;
  showConfirmDialog('ลบรูปผู้เล่นคนนี้?', () => {
    if (appState.playerProfiles?.[playerId]) {
      // null (not delete) so the RTDB patch actually clears the field
      appState.playerProfiles[playerId].photo = null;
      saveKeys(['playerProfiles'], true);
      refreshPlayerVisuals(playerId);
      showToast('ลบรูปแล้ว', 'success');
    }
  });
}

// Repaint every surface a face can appear on, without a full reload.
function refreshPlayerVisuals(playerId) {
  if (typeof renderPlayersTab   === 'function') renderPlayersTab();
  if (typeof renderMatchBoard   === 'function') renderMatchBoard();
  if (typeof renderReports      === 'function' && document.getElementById('statsCardList')) renderReports();
  if (playerId && _pdCurrentId === playerId && typeof openPlayerProfile === 'function') openPlayerProfile(playerId);
}
