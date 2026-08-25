// ==========================================
// 1. LOGIN & ROLE SYSTEM
// ==========================================
let userRole = null; 
let prevRed = 0, prevBlue = 0; 
let _pendingLoginRole = null; // 'admin' or 'superadmin' — which button was clicked

window.onload = () => {
  const savedRole = localStorage.getItem('bdm_scoreboard_role');
  if (savedRole === 'superadmin') {
    userRole = 'superadmin';
    document.getElementById('loginOverlay').style.display = 'none';
    document.body.classList.remove('guest-mode');
    document.body.classList.add('admin-mode');
    document.body.classList.add('superadmin-mode');
    switchTab('scoreboard', document.getElementById('tab-scoreboard'));
  } else if (savedRole === 'admin') {
    userRole = 'admin';
    document.getElementById('loginOverlay').style.display = 'none';
    document.body.classList.remove('guest-mode');
    document.body.classList.add('admin-mode');
    switchTab('scoreboard', document.getElementById('tab-scoreboard'));
  } else if (savedRole === 'guest') {
    userRole = 'guest';
    _analystUnlocked = false; // guest ไม่มีสิทธิ์ดู Prediction ไม่ว่าจะเคย unlock ไว้หรือไม่
    localStorage.removeItem('bdm_analyst_unlocked');
    document.getElementById('loginOverlay').style.display = 'none';
    document.body.classList.add('guest-mode');
    switchTab('ongoing', document.getElementById('tab-ongoing'));
  }
  loadData();
};

const BLUEWIN_PASS = 'Bluewin'; // passcode สำหรับเข้า Guest View

function loginGuest() {
  userRole = 'guest';
  _analystUnlocked = false; // guest ไม่มีสิทธิ์ดู Prediction
  localStorage.removeItem('bdm_analyst_unlocked');
  localStorage.setItem('bdm_scoreboard_role', 'guest');
  document.getElementById('loginOverlay').style.display = 'none';
  document.body.classList.remove('admin-mode');
  document.body.classList.add('guest-mode');
  switchTab('ongoing', document.getElementById('tab-ongoing'));
  loadData();
}

function loginAdmin() {
  try {
    _pendingLoginRole = 'admin';
    const modal = document.getElementById('passcodeModal');
    const input = document.getElementById('passcodeInput');
    const err = document.getElementById('passcodeError');
    if (!modal) { alert('Error: passcodeModal not found'); return; }
    document.getElementById('passcodeModalTitle').textContent = '⚙️ ADMIN LOGIN';
    document.getElementById('passcodeModalSub').textContent = 'สร้างแมตช์ / จัดการผู้เล่น';
    modal.style.display = 'flex';
    document.getElementById('loginOverlay').classList.add('modal-open');
    err.style.display = 'none';
    input.value = '';
    setTimeout(() => input.focus(), 100);
  } catch(e) { console.error('loginAdmin error:', e); alert('Error: ' + e.message); }
}

function loginSuperAdmin() {
  try {
    _pendingLoginRole = 'superadmin';
    const modal = document.getElementById('passcodeModal');
    const input = document.getElementById('passcodeInput');
    const err = document.getElementById('passcodeError');
    if (!modal) { alert('Error: passcodeModal not found'); return; }
    document.getElementById('passcodeModalTitle').textContent = '👑 SUPER ADMIN';
    document.getElementById('passcodeModalSub').textContent = 'แก้ผล / แก้คะแนน / ทุกสิทธิ์';
    modal.style.display = 'flex';
    document.getElementById('loginOverlay').classList.add('modal-open');
    err.style.display = 'none';
    input.value = '';
    setTimeout(() => input.focus(), 100);
  } catch(e) { console.error('loginSuperAdmin error:', e); alert('Error: ' + e.message); }
}

function submitPasscode() {
  const input = document.getElementById('passcodeInput');
  const err = document.getElementById('passcodeError');
  const val = input.value;

  // ตรวจรหัสตาม role ที่กดเข้า
  const isAdmin      = _pendingLoginRole === 'admin'      && val === 'admin2026';
  const isSuperAdmin = _pendingLoginRole === 'superadmin' && val === 'ph123';

  if (isAdmin || isSuperAdmin) {
    closePasscodeModal();
    userRole = isSuperAdmin ? 'superadmin' : 'admin';
    localStorage.setItem('bdm_scoreboard_role', userRole);
    document.getElementById('loginOverlay').style.display = 'none';
    document.body.classList.remove('guest-mode', 'admin-mode', 'superadmin-mode');
    document.body.classList.add('admin-mode');
    if (isSuperAdmin) document.body.classList.add('superadmin-mode');
    switchTab('scoreboard', document.getElementById('tab-scoreboard'));
    updateUI();
  } else {
    err.style.display = 'block';
    input.value = '';
    // UX-3: shake the input box to signal wrong passcode
    const box = input.closest('div[style*="background"]') || input.parentElement;
    box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
    setTimeout(() => box.classList.remove('shake'), 500);
    input.focus();
  }
}

function closePasscodeModal() {
  document.getElementById('passcodeModal').style.display = 'none';
  const ov = document.getElementById('loginOverlay');
  if (ov) ov.classList.remove('modal-open');
}

function logout() {
  // UX-11: use custom confirm dialog instead of blocking confirm()
  showConfirmDialog('ออกจากระบบ / Logout?', () => {
    userRole = null;
    _pendingLoginRole = null;
    localStorage.removeItem('bdm_scoreboard_role');
    document.getElementById('loginOverlay').style.display = 'flex';
    document.body.classList.remove('admin-mode', 'superadmin-mode', 'guest-mode');
  });
}

