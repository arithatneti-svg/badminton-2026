const dbRef = firebase.database().ref('sportsday_2026_data');

let appState = {
  globalScoreRed: 0, globalScoreBlue: 0,
  players: [], ongoingMatches: [], matchHistory: [], matchCounter: 1,
  redTeamName: 'RED TEAM', blueTeamName: 'BLUE TEAM'
};
let _saveTimer = null;

const DEFAULT_PLAYERS = [
  {name:'หมี',team:'Red',group:'1'},{name:'ฝ้าย',team:'Red',group:'1'},
  {name:'ฮิว',team:'Red',group:'1'},{name:'หนก',team:'Red',group:'1'},
  {name:'Jokee',team:'Red',group:'1'},{name:'แจ๊ค',team:'Red',group:'1'},
  {name:'พัด',team:'Red',group:'1'},{name:'เก่ง',team:'Red',group:'2'},
  {name:'ดุ๊ก',team:'Red',group:'2'},{name:'นก',team:'Red',group:'2'},
  {name:'หลุยส์',team:'Red',group:'2'},{name:'ปูม',team:'Red',group:'2'},
  {name:'ป๋าทัศ',team:'Red',group:'2'},{name:'ต้น',team:'Red',group:'2'},
  {name:'ออป',team:'Red',group:'2'},{name:'ยุ้ย',team:'Red',group:'2'},
  {name:'โหน่ง',team:'Red',group:'2'},{name:'แต้ม',team:'Red',group:'2'},
  {name:'แชป',team:'Red',group:'2'},{name:'ปอ',team:'Red',group:'3'},
  {name:'ไนซ์',team:'Red',group:'3'},{name:'โอ๊ต',team:'Red',group:'3'},
  {name:'ปอนด์',team:'Red',group:'3'},{name:'มิ้ว',team:'Red',group:'3'},
  {name:'นุกนุก',team:'Red',group:'3'},{name:'จั๊มพ์',team:'Red',group:'3'},
  {name:'เพชร',team:'Blue',group:'1'},{name:'ก๊อป',team:'Blue',group:'1'},
  {name:'กาย',team:'Blue',group:'1'},{name:'ปาย',team:'Blue',group:'1'},
  {name:'พล',team:'Blue',group:'1'},{name:'ริท',team:'Blue',group:'1'},
  {name:'อรรถ',team:'Blue',group:'1'},{name:'เก้',team:'Blue',group:'2'},
  {name:'กัปตันต้น',team:'Blue',group:'2'},{name:'โจ๊ก',team:'Blue',group:'2'},
  {name:'หญิง',team:'Blue',group:'2'},{name:'เนย',team:'Blue',group:'2'},
  {name:'ผึ้ง',team:'Blue',group:'2'},{name:'ฟลุ๊ค',team:'Blue',group:'2'},
  {name:'บอส',team:'Blue',group:'2'},{name:'ลูกกอล์ฟ',team:'Blue',group:'2'},
  {name:'ฟ้า',team:'Blue',group:'2'},{name:'ก้อง',team:'Blue',group:'2'},
  {name:'กะรัต',team:'Blue',group:'2'},{name:'โบว์ลิ่ง',team:'Blue',group:'3'},
  {name:'โจ',team:'Blue',group:'3'},{name:'แม่ใหญ่',team:'Blue',group:'3'},
  {name:'เอแคลร์',team:'Blue',group:'3'},{name:'ติ๊ก',team:'Blue',group:'3'},
  {name:'เนม',team:'Blue',group:'3'},{name:'เอิ้น',team:'Blue',group:'3'},
];

function seedDefaultPlayers(state) {
  if (state.players && state.players.length > 0) return;
  state.players = [];
  const counters = { Red: 0, Blue: 0 };
  DEFAULT_PLAYERS.forEach(p => {
    counters[p.team]++;
    const n = counters[p.team];
    const prefix = p.team === 'Red' ? 'R' : 'B';
    const id = prefix + (n < 10 ? '0' + n : n);
    state.players.push({ id, name: p.name, team: p.team, group: p.group });
  });
}

// ── SCOUT REPORT PASSCODE ──
const SCOUT_PASS = 'guest2026'; // เปลี่ยนได้ที่นี่
let _scoutUnlocked = false; // unlock ครั้งเดียวต่อ session

function verifyScoutPass() {
  const input = document.getElementById('scoutPassInput');
  const errEl = document.getElementById('scoutPassError');
  if (!input) return;
  if (input.value.trim() === SCOUT_PASS || userRole === 'superadmin') {
    _scoutUnlocked = true;
    document.getElementById('scoutLockScreen').style.display = 'none';
    document.getElementById('scoutContent').style.display    = 'block';
    input.value = '';
    if (errEl) errEl.textContent = '';
    const prof = (appState.playerProfiles||{})[_pdCurrentId] || {};
    _renderScoutContent(prof);
  } else {
    if (errEl) errEl.textContent = '❌ รหัสไม่ถูกต้อง';
    input.value = '';
    input.focus();
    input.style.borderColor = 'var(--danger)';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
  }
}

function lockScoutTab() {
  _scoutUnlocked = false;
  document.getElementById('scoutLockScreen').style.display = 'block';
  document.getElementById('scoutContent').style.display    = 'none';
  if (document.getElementById('scoutPassError'))
    document.getElementById('scoutPassError').textContent = '';
}

function _renderScoutContent(prof) {
  // ── Ability Chart ──
  renderAbilityChart(prof);

  const strEl = document.getElementById('pdStrengthsView');
  if (strEl) strEl.textContent = prof.strengths || '—';
  const nw = document.getElementById('pdViewNotesWrap');
  const nv = document.getElementById('pdViewNotes');
  if (nv) nv.textContent = prof.notes || '';
  if (nw) nw.style.display = prof.notes ? 'block' : 'none';
  const sw = document.getElementById('pdViewSimilarWrap');
  const sl = document.getElementById('pdViewSimilarList');
  if (sl) {
    const simHtml = (prof.similar||[]).filter(Boolean).map(id => {
      const sp = ( appState.players || [] ).find(x=>x.id===id);
      return sp ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;font-size:12px;font-weight:700;">${escHtml(sp.name)}<span style="font-size:10px;color:var(--muted);">G${sp.group}</span></span>` : '';
    }).join('');
    sl.innerHTML = simHtml;
    if (sw) sw.style.display = simHtml ? 'block' : 'none';
  }
  const ww = document.getElementById('pdWeaknessWrap');
  const wv = document.getElementById('pdWeaknessView');
  if (wv) wv.textContent = prof.weakness || '';
  if (ww) ww.style.display = prof.weakness ? 'block' : 'none';
}

// ── State vars ที่ต้อง declare ก่อน loadData และ dbRef.on ──
let _prevMatchHistoryLength = -1; // -1 = ยังไม่ init
let _notiDismissTimer       = null;
let _adminJustFinalized     = false;

function loadData() {
  dbRef.once('value').then(snapshot => {
    const data = snapshot.val();
    if (data) appState = data;
    seedDefaultPlayers(appState);
    if (!appState.ongoingMatches) appState.ongoingMatches = [];
    if (!appState.matchHistory)   appState.matchHistory   = [];
    // ── Migrate: เพิ่ม tactics=3 ให้ player profile ที่ยังไม่มีค่านี้ ──
    if (appState.playerProfiles) {
      let migrated = false;
      Object.keys(appState.playerProfiles).forEach(id => {
        const prof = appState.playerProfiles[id];
        if (prof && prof.tactics === undefined) {
          prof.tactics = 3;
          migrated = true;
        }
      });
      if (migrated) saveData(false); // บันทึกเงียบๆ
    }
    _prevMatchHistoryLength = appState.matchHistory.length;
    // ไม่ saveData ถ้า Firebase คืน null — อาจเป็น network blip ไม่ใช่ data จริงๆว่าง
    // เฉพาะ superadmin และ data จริงๆ ไม่มี (ไม่ใช่ null เพราะ network)
    if ((userRole === 'admin' || userRole === 'superadmin') && data === null) {
      console.warn('loadData: Firebase returned null — NOT saving to prevent data loss');
    }
    updateUI();
  }).catch(err => {
    // FIX-3: handle Firebase unreachable (offline, rules deny, etc.)
    console.error('Firebase loadData failed:', err);
    showToast('⚠️ ไม่สามารถโหลดข้อมูลได้ — ตรวจสอบการเชื่อมต่อ', 'error');
    updateUI(); // still render with empty local state
  });
}

dbRef.on('value', (snapshot) => {
  if (!userRole) return;
  // ยังไม่ init (loadData ยังไม่เสร็จ) → skip ป้องกัน race condition
  if (_prevMatchHistoryLength === -1) return;

  const data = snapshot.val();
  // ถ้า Firebase คืน null อย่า overwrite appState — อาจเป็น network blip
  if (!data) {
    console.warn('dbRef.on: received null data — keeping current appState');
    return;
  }

  const prevLen = _prevMatchHistoryLength;
  const newHistory = data.matchHistory || [];
  const newLen = newHistory.length;

  appState = data;
  if (!appState.ongoingMatches) appState.ongoingMatches = [];
  if (!appState.matchHistory)   appState.matchHistory   = [];

  // ── GAME1_DONE — แสดงแค่ indicator เล็กๆ บน court card ไม่ต้อง popup ใหญ่ ──
  if (appState.remoteCommand && appState.remoteCommand.action === 'GAME1_DONE') {
    const cmd = appState.remoteCommand;
    appState.remoteCommand = null;
    if (userRole === 'admin' || userRole === 'superadmin') {
      saveData(true);
    } else {
      dbRef.child('remoteCommand').set(null);
    }
    // แสดง toast เล็กๆ แทน popup ใหญ่
    const g1r = Number(cmd.g1R || 0), g1b = Number(cmd.g1B || 0);
    const g1WinnerText = g1r > g1b ? '🔴 Red' : g1b > g1r ? '🔵 Blue' : '🤝 เสมอ';
    showG1DoneToast(cmd.mId, g1r, g1b, g1WinnerText);
  }

  // ── SHOW_TROPHY ──
  else if (appState.remoteCommand && appState.remoteCommand.action === 'SHOW_TROPHY') {
    appState.remoteCommand = null;
    // ต้อง write null กลับ Firebase ทันที ป้องกัน re-trigger ทุก score update
    if (userRole === 'admin' || userRole === 'superadmin') {
      saveData(true);
    } else {
      dbRef.child('remoteCommand').set(null);
    }
    if (document.getElementById('trophyOverlay').style.display !== 'block') {
      openEndGame();
    }
  }

  // ── FINALIZE (admin/superadmin only) ──
  else if ((userRole === 'admin' || userRole === 'superadmin') &&
           appState.remoteCommand && appState.remoteCommand.action === 'FINALIZE') {
    const cmd = appState.remoteCommand;
    appState.remoteCommand = null;
    _adminJustFinalized = true;
    saveData(true);
    autoFinalizeMatchFromUmpire(cmd);
  }

  // ── MATCH END: popup เมื่อ matchHistory เพิ่มขึ้น ──
  // prevLen !== -1 แทน prevLen > 0 เพื่อรองรับ match แรกของวัน (0→1)
  if (newLen > prevLen && prevLen !== -1) {
    if (_adminJustFinalized) {
      // admin path: autoFinalizeMatchFromUmpire แสดง noti ไปแล้ว
      _adminJustFinalized = false;
    } else {
      // umpire/guest path
      const latest = newHistory[newLen - 1];
      if (latest) {
        const [g1r, g1b] = (latest.game1 || '0:0').split(':').map(Number);
        const [g2r, g2b] = (latest.game2 || '0:0').split(':').map(Number);
        const lastGr = g2r > 0 || g2b > 0 ? g2r : g1r;
        const lastGb = g2r > 0 || g2b > 0 ? g2b : g1b;
        const lastGameWinner = lastGr > lastGb ? 'red' : lastGb > lastGr ? 'blue' : 'draw';
        const globalRedBefore  = (data.globalScoreRed  || 0) - (latest.pRed  || 0);
        const globalBlueBefore = (data.globalScoreBlue || 0) - (latest.pBlue || 0);
        showMatchNoti({
          matchId: latest.id, redNames: latest.redNames, blueNames: latest.blueNames,
          g1r, g1b, g2r, g2b, gameNum: 2, gameWinner: lastGameWinner,
          globalRedBefore, globalBlueBefore,
          pRed: latest.pRed || 0, pBlue: latest.pBlue || 0,
          tags: latest.analysis ? latest.analysis.tags : [],
          isMatchEnd: !!(latest.rStat), rStat: latest.rStat
        });
      }
    }
  }

  _prevMatchHistoryLength = newLen;
  updateUI();

  // Force re-render ongoing tab หลัง match จบ ไม่ต้อง switch tab
  // updateUI() render แค่ถ้า activeTab === 'ongoing' แต่ถ้าไม่อยู่ tab ongoing ก็ยังต้อง clear court card
  if (newLen > prevLen && prevLen !== -1) {
    renderPublicOngoingMatches();
    backupState('finalize'); // auto-backup ทุกครั้งที่จบแมตช์ (gated เป็น admin/superadmin ภายใน)
  }
});

// UX-4: Firebase connection status indicator.
// NOTE (split build): `.info/connected` fires its initial callback SYNCHRONOUSLY
// the moment .on() is attached. When the app was one big <script> that was fine,
// but now showToast() lives in a later file (ui.js). We therefore attach on
// DOMContentLoaded — by then every deferred app script has run, so showToast and
// friends exist, and the DOM (#dbDot) is ready too.
const dbConnRef = firebase.database().ref('.info/connected');
window.addEventListener('DOMContentLoaded', () => {
  dbConnRef.on('value', snap => {
    const online = snap.val() === true;
    const dot = document.getElementById('dbDot');
    const lbl = document.getElementById('dbDotLabel');
    if (!dot || !lbl) return;
    dot.style.background = online ? 'var(--green)' : 'var(--danger)';
    lbl.textContent = online ? 'LIVE' : 'OFFLINE';
    dot.style.boxShadow = online ? '0 0 6px var(--green)' : '0 0 6px var(--danger)';
    if (!online) showToast('⚠️ ขาดการเชื่อมต่อ Firebase', 'error');
  }, (error) => {
    console.error('Firebase sync error:', error);
    showToast('⚠️ Firebase sync error — ตรวจสอบการเชื่อมต่อ', 'error');
  });
});

function saveData(immediate = false) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  // ป้องกัน write appState เปล่าทับ Firebase — ต้องมี players อย่างน้อย
  if (!appState.players || appState.players.length === 0) {
    console.warn('saveData blocked: appState.players empty — possible partial state');
    return;
  }
  clearTimeout(_saveTimer);
  const doSave = () => { dbRef.set(appState); };
  if (immediate) doSave(); else _saveTimer = setTimeout(doSave, 400);
}

// เขียนเฉพาะ top-level key ที่เปลี่ยน (dbRef.update) แทนการ set ทั้งก้อน
// ป้องกันการทับ subtree อื่น เช่น ongoingMatches ที่กรรมการกำลังเขียนคะแนนสดอยู่
let _saveKeysTimer = null;
function saveKeys(keys, immediate = false) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  if (!appState.players || appState.players.length === 0) {
    console.warn('saveKeys blocked: appState.players empty — possible partial state');
    return;
  }
  const patch = {};
  keys.forEach(k => { if (appState[k] !== undefined) patch[k] = appState[k]; });
  if (Object.keys(patch).length === 0) return;
  clearTimeout(_saveKeysTimer);
  const doSave = () => { dbRef.update(patch); };
  if (immediate) doSave(); else _saveKeysTimer = setTimeout(doSave, 400);
}

function clearData() {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  // Show custom reset modal
  document.getElementById('resetChoiceModal').style.display = 'flex';
}

function doResetFull() {
  document.getElementById('resetChoiceModal').style.display = 'none';
  showConfirmDialog('⚠️ Reset ทั้งหมด รวมถึง Player profiles, play style, base score? (ระบบจะ backup ตัวปัจจุบันไว้ให้ก่อน — กู้คืนได้จากปุ่ม Backup & Restore)', function() {
    backupState('pre-reset', 'ก่อน Reset ทั้งหมด'); // safety snapshot ก่อนล้าง
    const currentPlayers = appState.players || [];
    appState = { globalScoreRed:0, globalScoreBlue:0, players:currentPlayers, playerProfiles:{}, ongoingMatches:[], matchHistory:[], matchCounter:1, redTeamName:'RED TEAM', blueTeamName:'BLUE TEAM' };
    saveData(true); showToast('🗑 Reset ทั้งหมดเรียบร้อย', 'success');
  });
}

function doResetMatchOnly() {
  document.getElementById('resetChoiceModal').style.display = 'none';
  showConfirmDialog('⚠️ Reset ผลแมตช์ทั้งหมด? Player profiles และ play style จะยังอยู่ครบ (ระบบจะ backup ตัวปัจจุบันไว้ให้ก่อน)', function() {
    backupState('pre-reset', 'ก่อน Reset ผลแมตช์'); // safety snapshot ก่อนล้าง
    const currentPlayers  = appState.players || [];
    const currentProfiles = appState.playerProfiles || {};
    // ไม่แตะ player object เพราะ pts/w/l คำนวณจาก matchHistory ใน buildPlayerStats()
    // แค่ clear match data และ global scores
    appState = {
      globalScoreRed:  0,
      globalScoreBlue: 0,
      players:         currentPlayers,
      playerProfiles:  currentProfiles,
      ongoingMatches:  [],
      matchHistory:    [],
      matchCounter:    1,
      redTeamName:     appState.redTeamName  || 'RED TEAM',
      blueTeamName:    appState.blueTeamName || 'BLUE TEAM',
    };
    saveData(true);
    showToast('✅ Reset ผลแมตช์เรียบร้อย — Player profiles ยังอยู่ครบ', 'success');
  });
}

