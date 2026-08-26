// ══════════════════════════════════════════
// PLAYER PHOTO
// Photos are stored as compressed data URLs on
// playerProfiles[id].photo — same path everything else already
// syncs, so there is no Storage bucket / Worker to stand up.
// A 256px JPEG lands around 15–25 KB, so 54 players is ~1 MB in RTDB.
// ══════════════════════════════════════════

const PHOTO_SIZE    = 256;   // px, square
const PHOTO_QUALITY = 0.78;
const PHOTO_MAX_KB  = 110;   // re-compress harder above this

function playerPhoto(id) {
  return (appState.playerProfiles || {})[id]?.photo || null;
}

// Shared avatar renderer — used by the directory, the profile header,
// the reports list, the match board chips and H2H rows so a face looks
// the same everywhere it appears.
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
    ? `<span class="pav ${teamCls}${extra}" style="${style}"><img src="${photo}" alt="${escHtml(p.name)}" loading="lazy"></span>`
    : `<span class="pav ${teamCls} pav-initials${extra}" style="${style}">${p.id}</span>`;
}

// ── Upload ────────────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // centre-crop to a square first so nobody gets stretched
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth  - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const c = document.createElement('canvas');
      c.width = c.height = PHOTO_SIZE;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      let out = c.toDataURL('image/jpeg', PHOTO_QUALITY);
      // a busy photo can still come out large — step the quality down
      let q = PHOTO_QUALITY;
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
