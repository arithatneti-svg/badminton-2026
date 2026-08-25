// ============================================================
// Auto-backup + Restore — Badminton 2026
// Snapshots the WHOLE appState to a SEPARATE Firebase path
// (sportsday_2026_backups) so backups never bloat the main
// real-time sync feed (dbRef listens to sportsday_2026_data only).
//
// Triggers: after every finished match, before any Reset, and manually.
// Restore (superadmin) snapshots the current state FIRST, then applies
// the chosen backup — so a restore is itself undoable.
// ============================================================
const backupsRef = firebase.database().ref('sportsday_2026_backups');
const MAX_BACKUPS = 30;
let _lastBackupTs = 0;

const BACKUP_REASON_LABEL = {
  finalize:      '🏁 จบแมตช์',
  manual:        '✋ กดเอง',
  'pre-reset':   '⚠️ ก่อน Reset',
  'pre-restore': '↩️ ก่อนกู้คืน',
  auto:          '🔄 อัตโนมัติ'
};

// สร้าง backup 1 ชุด — คืน Promise เสมอ (safe ต่อการ chain .then())
function backupState(reason = 'auto', label = '') {
  // เฉพาะ admin/superadmin เท่านั้นที่เขียน backup (guest ไม่มีสิทธิ์)
  if (userRole !== 'admin' && userRole !== 'superadmin') return Promise.resolve();
  // กัน backup state เปล่า (เช่น ตอนยังโหลดข้อมูลไม่เสร็จ)
  if (!appState || !appState.players || appState.players.length === 0) return Promise.resolve();
  // กัน backup 'finalize' ซ้ำถี่เกิน (เช่น admin 2 เครื่อง react พร้อมกัน)
  const now = Date.now();
  if (reason === 'finalize' && now - _lastBackupTs < 3000) return Promise.resolve();
  _lastBackupTs = now;

  const record = {
    ts: now,
    reason,
    label,
    counts: {
      players:      (appState.players || []).length,
      ongoing:      (appState.ongoingMatches || []).length,
      history:      (appState.matchHistory || []).length,
      matchCounter: appState.matchCounter || 0,
      scoreRed:     appState.globalScoreRed || 0,
      scoreBlue:    appState.globalScoreBlue || 0
    },
    state: appState
  };
  return backupsRef.push(record)
    .then(() => pruneBackups())
    .catch(e => { console.error('backupState failed:', e); });
}

// เก็บแค่ MAX_BACKUPS ชุดล่าสุด (push keys เรียงตามเวลา → เก่าสุดอยู่หน้า)
function pruneBackups() {
  return backupsRef.orderByKey().once('value').then(snap => {
    const keys = [];
    snap.forEach(c => { keys.push(c.key); });
    if (keys.length > MAX_BACKUPS) {
      keys.slice(0, keys.length - MAX_BACKUPS).forEach(k => backupsRef.child(k).remove());
    }
  }).catch(() => {});
}

function manualBackup() {
  if (userRole !== 'admin' && userRole !== 'superadmin')
    return showToast('⛔ ต้องใช้สิทธิ์ Admin ขึ้นไป', 'error');
  backupState('manual', 'กดเอง').then(() => {
    showToast('✅ Backup เรียบร้อย', 'success');
    const modal = document.getElementById('backupModal');
    if (modal && modal.classList.contains('open')) renderBackupList();
  });
}

function openBackupModal() {
  if (userRole !== 'superadmin')
    return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  document.getElementById('backupModal').classList.add('open');
  renderBackupList();
}
function closeBackupModal() {
  document.getElementById('backupModal').classList.remove('open');
}

function _fmtBackupTime(ts) {
  const d = new Date(ts || 0);
  try {
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) { return d.toLocaleString(); }
}

function renderBackupList() {
  const el = document.getElementById('backupList');
  if (!el) return;
  el.innerHTML = '<div class="backup-empty">กำลังโหลด…</div>';
  backupsRef.orderByKey().limitToLast(MAX_BACKUPS).once('value').then(snap => {
    const items = [];
    snap.forEach(c => {
      const v = c.val() || {};
      items.push({ key: c.key, ts: v.ts, reason: v.reason, counts: v.counts || {} });
    });
    items.reverse(); // ใหม่สุดขึ้นก่อน
    if (!items.length) {
      el.innerHTML = '<div class="backup-empty">ยังไม่มี backup — กด “💾 Backup ตอนนี้” เพื่อสร้างชุดแรก</div>';
      return;
    }
    el.innerHTML = items.map(b => {
      const c = b.counts || {};
      const reason = BACKUP_REASON_LABEL[b.reason] || b.reason || '';
      return `<div class="backup-row">
        <div class="backup-info">
          <div class="backup-when">${_fmtBackupTime(b.ts)}</div>
          <div class="backup-meta">${reason} · ${c.players || 0} ผู้เล่น · ${c.history || 0} แมตช์ · แต้มรวม ${c.scoreRed || 0}–${c.scoreBlue || 0}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="restoreBackup('${b.key}')">↩ กู้คืน</button>
      </div>`;
    }).join('');
  }).catch(e => {
    el.innerHTML = '<div class="backup-empty">โหลด backup ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ</div>';
    console.error('renderBackupList failed:', e);
  });
}

function restoreBackup(key) {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  backupsRef.child(key).once('value').then(snap => {
    const b = snap.val();
    if (!b || !b.state) return showToast('❌ ไม่พบข้อมูล backup นี้', 'error');
    const c = b.counts || {};
    const when = _fmtBackupTime(b.ts);
    showConfirmDialog(
      `กู้คืนข้อมูลจาก ${when} (${c.players || 0} ผู้เล่น · ${c.history || 0} แมตช์)? ข้อมูลปัจจุบันจะถูกแทนที่ — ระบบจะ backup ตัวปัจจุบันไว้ให้ก่อนอัตโนมัติ`,
      function () {
        // 1) snapshot สถานะปัจจุบันไว้ก่อน (กู้คืนย้อนกลับได้)
        backupState('pre-restore', 'ก่อนกู้คืน').then(() => {
          // 2) นำ state จาก backup มาใช้
          appState = b.state;
          if (!appState.ongoingMatches) appState.ongoingMatches = [];
          if (!appState.matchHistory)   appState.matchHistory   = [];
          dbRef.set(appState).then(() => {
            showToast('✅ กู้คืนข้อมูลเรียบร้อย', 'success');
            closeBackupModal();
            updateUI();
          }).catch(e => { showToast('❌ กู้คืนไม่สำเร็จ', 'error'); console.error(e); });
        });
      }
    );
  }).catch(e => { showToast('❌ อ่าน backup ไม่สำเร็จ', 'error'); console.error(e); });
}
