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

// ── State vars ที่ต้อง declare ก่อน loadData และ dbRef.on ──
let _prevMatchHistoryLength = -1; // -1 = ยังไม่ init
let _notiDismissTimer       = null;
let _adminJustFinalized     = false;

// The server state this client last saw — the "base" of the 3-way merge every
// save performs (see shared/sync-merge.js). Captured from each snapshot BEFORE
// any local change is applied to it.
let _syncBase = null;
let _lastSnapshotAt = 0;   // when a data snapshot last arrived — the TV status chip reads it
function _cloneData(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

// ── What the page says BEFORE the first data arrives (P-21) ──
// Until the first read comes back, every number on screen is a default — "0 – 0", "RED TEAM", "LIVE ON
// COURT 0", "ยังไม่มีรูป" — and looks like data, on a slow phone for seconds (the gallery showed "no photos"
// for 1.2 s on a fast network). So until data is in, the content is hidden (body.data-loading, css/components.css)
// and one honest card stands in for it:
//   loading   "กำลังโหลดคะแนน…"
//   slow      nothing after 10 s            "ยังเชื่อมต่อไม่ได้" + [ลองใหม่]; it still loads by itself when the signal returns
//   failed    the read was refused / failed "โหลดข้อมูลไม่ได้"   + [ลองใหม่]
// A database that is genuinely empty is a loaded state (null data counts), so its zeros are true.
const DATA_SLOW_MS = 10000;
let _dataReady = false, _dataPhase = 'loading', _dataTimer = null;
function _dataShow() {
  document.body.classList.toggle('data-loading', !_dataReady);
  const card = document.getElementById('dataState');
  if (!card) return;
  const stuck = _dataPhase === 'slow' || _dataPhase === 'failed';
  card.classList.toggle('is-stuck', stuck);
  const msg = document.getElementById('dsMsg'), sub = document.getElementById('dsSub'), retry = document.getElementById('dsRetry');
  if (msg) msg.textContent = _dataPhase === 'failed' ? 'โหลดข้อมูลไม่ได้' : _dataPhase === 'slow' ? 'ยังเชื่อมต่อไม่ได้' : 'กำลังโหลดคะแนน…';
  if (sub) sub.textContent = _dataPhase === 'failed' ? 'ตรวจสัญญาณแล้วลองใหม่ ถ้ายังไม่ได้ แจ้งทีมงาน'
    : _dataPhase === 'slow' ? 'ตรวจสัญญาณอินเทอร์เน็ต — จะโหลดเองเมื่อเชื่อมต่อได้' : '';
  if (retry) retry.hidden = !stuck;
}
function _dataBegin() {
  _dataPhase = 'loading';
  clearTimeout(_dataTimer);
  _dataTimer = setTimeout(() => { if (!_dataReady && _dataPhase === 'loading') { _dataPhase = 'slow'; _dataShow(); if (typeof _tvActive !== 'undefined' && _tvActive) renderTvPanel(true); } }, DATA_SLOW_MS);
  _dataShow();
}
function _dataDone() { _dataReady = true; _dataPhase = 'ready'; clearTimeout(_dataTimer); _dataShow(); }
function _dataFail() { _dataPhase = 'failed'; clearTimeout(_dataTimer); _dataShow(); if (typeof _tvActive !== 'undefined' && _tvActive) renderTvPanel(true); }
// the [ลองใหม่] button: wake the connection, ask again
function retryLoad() {
  try { firebase.database().goOnline(); } catch (e) { /* the SDK decides */ }
  loadData();
}

function loadData() {
  if (!_dataReady) _dataBegin();
  dbRef.once('value').then(snapshot => {
    const data = snapshot.val();
    _syncBase = _cloneData(data);
    _lastSnapshotAt = Date.now();
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
    _dataDone();
    updateUI();
  }).catch(err => {
    // FIX-3: handle Firebase unreachable (offline, rules deny, etc.)
    console.error('Firebase loadData failed:', err);
    if (_dataReady) showToast('⚠️ โหลดข้อมูลใหม่ไม่ได้ — ตรวจสอบสัญญาณ', 'error');   // data is on screen: say so, keep it
    else _dataFail();                                                                // nothing yet: the card says so, with a retry
    updateUI();
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
  _syncBase = _cloneData(data);   // before the command handling below mutates it
  _lastSnapshotAt = Date.now();

  const prevLen = _prevMatchHistoryLength;
  const newHistory = data.matchHistory || [];
  const newLen = newHistory.length;

  appState = data;
  if (!appState.ongoingMatches) appState.ongoingMatches = [];
  if (!appState.matchHistory)   appState.matchHistory   = [];

  // ── GAME1_DONE — แสดงแค่ indicator เล็กๆ บน court card ไม่ต้อง popup ใหญ่ ──
  if (appState.remoteCommand && appState.remoteCommand.action === 'GAME1_DONE') {
    const cmd = appState.remoteCommand;
    _clearRemoteCommand(cmd);
    // แสดง toast เล็กๆ แทน popup ใหญ่
    const g1r = Number(cmd.g1R || 0), g1b = Number(cmd.g1B || 0);
    const g1WinnerText = g1r > g1b ? '🔴 Red' : g1b > g1r ? '🔵 Blue' : '🤝 เสมอ';
    showG1DoneToast(cmd.mId, g1r, g1b, g1WinnerText);
  }

  // ── SHOW_TROPHY ──
  else if (appState.remoteCommand && appState.remoteCommand.action === 'SHOW_TROPHY') {
    // ต้อง clear กลับ Firebase ทันที ป้องกัน re-trigger ทุก score update
    _clearRemoteCommand(appState.remoteCommand);
    if (document.getElementById('trophyOverlay').style.display !== 'block') {
      openEndGame();
    }
  }

  // ── FINALIZE (admin/superadmin only) ──
  else if ((userRole === 'admin' || userRole === 'superadmin') &&
           appState.remoteCommand && appState.remoteCommand.action === 'FINALIZE') {
    const cmd = appState.remoteCommand;
    _clearRemoteCommand(cmd);
    _adminJustFinalized = true;
    autoFinalizeMatchFromUmpire(cmd);   // saves through the merge
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
//
// One connection state for every screen (the TV status bar reads it too). `.info/connected`
// is false until the FIRST connection is made, so a "false" at page load is not an outage —
// it used to raise a red "disconnected" toast on every open, even when the final state was
// LIVE, which taught people to ignore the real one. Offline = not connected AND (connected
// before, or 3 s have passed since load without ever connecting) — the same rule the umpire
// page uses. The toast waits out that grace period, so a blip that reconnects stays silent.
const DB_OFFLINE_GRACE_MS = 3000;
const _dbLoadedAt = Date.now();
let _dbOnline = false, _dbEverOnline = false, _dbToastTimer = null;
function dbIsOffline() { return !_dbOnline && (_dbEverOnline || Date.now() - _dbLoadedAt > DB_OFFLINE_GRACE_MS); }
// The dot is the quick read; the bar under the menu is the plain-words read, and it stays up (it was a 2.4 s toast
// that nobody saw, and on a phone the dot's own label is hidden). The bar appears only for a connection that
// drops AFTER data was shown; before the first data the loading card speaks, and the TV has its own red bar.
let _dbBarShown = false;
function _hms(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function _dbRenderConn() {
  const dot = document.getElementById('dbDot');
  const lbl = document.getElementById('dbDotLabel');
  if (!dot || !lbl) return;
  const state = _dbOnline ? 'live' : dbIsOffline() ? 'offline' : 'connecting';
  dot.style.background = state === 'live' ? 'var(--green)' : state === 'offline' ? 'var(--danger)' : 'var(--muted)';
  lbl.textContent = state === 'live' ? 'LIVE' : state === 'offline' ? 'ออฟไลน์' : '...';
  dot.style.boxShadow = state === 'live' ? '0 0 6px var(--green)' : state === 'offline' ? '0 0 6px var(--danger)' : 'none';
  const dotBox = document.getElementById('dbStatusDot');
  if (dotBox) dotBox.title = state === 'live' ? 'เชื่อมต่อแล้ว' : state === 'offline' ? 'สัญญาณหลุด' : 'กำลังเชื่อมต่อ';
  const bar = document.getElementById('connBar');
  if (bar) {
    const show = state === 'offline' && _dataReady && !(typeof _tvActive !== 'undefined' && _tvActive);
    bar.hidden = !show;
    if (show) bar.textContent = '📶 สัญญาณหลุด — ข้อมูลเมื่อ ' + _hms(_lastSnapshotAt || Date.now()) + ' · กำลังเชื่อมต่อ…';
    if (!show && _dbBarShown && state === 'live') showToast('✓ เชื่อมต่อกลับมาแล้ว', 'success');
    _dbBarShown = show;
  }
}
const dbConnRef = firebase.database().ref('.info/connected');
window.addEventListener('DOMContentLoaded', () => {
  // career/compare views and pid allocation need the durable person records
  if (typeof loadMasterPlayers === 'function') loadMasterPlayers();
  dbConnRef.on('value', snap => {
    _dbOnline = snap.val() === true;
    if (_dbOnline) _dbEverOnline = true;
    _dbRenderConn();
    clearTimeout(_dbToastTimer);
    // not connected: look again when the grace period is over (a blip that reconnects stays silent)
    if (!_dbOnline) _dbToastTimer = setTimeout(_dbRenderConn, DB_OFFLINE_GRACE_MS);
  }, (error) => {
    console.error('Firebase sync error:', error);
    showToast('⚠️ ซิงก์ข้อมูลไม่ได้ — ตรวจสอบสัญญาณ', 'error');
  });
});

// ── Saving: a conflict-safe 3-way merge, committed as one transaction ──
// This used to be dbRef.set(appState): the whole blob from this device's copy.
// Umpires score on the same data, so any point / result / command that landed
// on the server after our last snapshot was silently reverted by the next
// admin action. Now the save merges base (last seen) + local (ours) + server
// (current) — see shared/sync-merge.js — and Firebase re-runs the merge if the
// server moves before it commits. Saves are always immediate: a delayed save
// could be overtaken by a snapshot that replaces appState and loses the edit.
// The `immediate` / key arguments are kept for the existing call sites.
function saveData() { return _commitMerge(null); }
function saveKeys(keys) { return _commitMerge(Array.isArray(keys) && keys.length ? keys : null); }

// One field of one match, by id, as its own transaction. For values that are labels, not counters:
// the merge-save adds "our change" to a number that changed on both sides (court 3→5 here and
// 3→4 there would come out as 6), a transaction on the match simply sets it.
function setMatchField(mId, field, value) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return Promise.resolve(false);
  let why = '';
  return dbRef.transaction(root => {
    if (!root) { why = 'no-snapshot'; return; }
    const list = smToArr(root.ongoingMatches);
    const i = list.findIndex(m => m && m.id === mId);
    if (i < 0) { why = 'missing'; return; }
    list[i] = { ...list[i], [field]: value };
    root.ongoingMatches = list;
    return root;
  }).then(res => { if (!res.committed) console.warn('setMatchField not saved:', why || 'unknown'); return res.committed; })
    .catch(err => { console.error('setMatchField failed:', err); return false; });
}

// Give a taken match back to the queue (its umpire walked away): the umpire, the live score, the clock, the
// court and the claim time are removed, so it is an ordinary queued match again. One transaction, by id.
// seenActivityAt is the last sign of life the admin was looking at: if the match has shown any since
// (a point scored while the confirm dialog was open), nothing is released.
// → { ok, reason } with reason 'active' | 'already' | 'missing' | 'no-snapshot' | 'error'
function releaseMatch(mId, seenActivityAt) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return Promise.resolve({ ok: false, reason: 'role' });
  let why = '';
  return dbRef.transaction(root => {
    if (!root) { why = 'no-snapshot'; return; }
    const list = smToArr(root.ongoingMatches);
    const i = list.findIndex(m => m && m.id === mId);
    if (i < 0) { why = 'missing'; return; }
    const cur = list[i];
    if (!cur.umpire) { why = 'already'; return; }
    if (matchLastActivityAt(cur) > (Number(seenActivityAt) || 0)) { why = 'active'; return; }
    const queued = { ...cur };
    ['umpire', 'live', 'timerStartedAt', 'claimedAt', 'court', 'potFlags'].forEach(k => { delete queued[k]; });
    list[i] = queued;
    root.ongoingMatches = list;
    return root;
  }).then(res => ({ ok: !!res.committed, reason: res.committed ? '' : (why || 'error') }))
    .catch(err => { console.error('releaseMatch failed:', err); return { ok: false, reason: 'error' }; });
}

function _commitMerge(onlyKeys) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return Promise.resolve(false);
  // ป้องกัน write appState เปล่าทับ Firebase — ต้องมี players อย่างน้อย
  if (!appState.players || appState.players.length === 0) {
    console.warn('save blocked: appState.players empty — possible partial state');
    return Promise.resolve(false);
  }
  // freeze both sides now: the write below fires the listener, which replaces appState
  return _runMerge(_cloneData(_syncBase), _cloneData(appState), onlyKeys, 1);
}

function _runMerge(base, local, onlyKeys, attempt) {
  let why = '';
  return dbRef.transaction(server => {
    if (base === null) {
      // we never received a snapshot: only a truly empty database (first run)
      // may be initialised from this device — never merge "defaults" into real data
      if (server === null) return smSanitize(local);
      why = 'no-base'; return;
    }
    if (server === null) { why = 'no-snapshot'; return; }   // never write from an empty cache
    const merged = smMergeState(base, local, server, onlyKeys);
    if (smToArr(server.players).length && !smToArr(merged.players).length) { why = 'players-vanished'; return; }
    return merged;
  }).then(res => {
    if (res.committed) return true;
    if (why === 'no-snapshot' && attempt < 3) {
      return dbRef.once('value').then(() => _runMerge(base, local, onlyKeys, attempt + 1));
    }
    console.error('save aborted:', why || 'unknown');
    showToast(why === 'no-base' ? '⚠️ ข้อมูลยังโหลดไม่เสร็จ — รอสักครู่แล้วลองใหม่' : '⚠️ บันทึกไม่สำเร็จ — ลองอีกครั้ง', 'error');
    return false;
  }).catch(err => {
    console.error('save failed:', err);
    showToast('⚠️ บันทึกไม่สำเร็จ: ' + (err && (err.code || err.message) || err), 'error');
    return false;
  });
}

// Clear a remote command only if it is still the one we handled — a newer
// command that arrived meanwhile must survive. The local copy and the merge
// base both drop it too, so no later merge-save writes remoteCommand at all.
function _clearRemoteCommand(cmd) {
  if (appState) appState.remoteCommand = null;
  if (_syncBase) _syncBase.remoteCommand = null;
  const same = c => c && cmd && c.action === cmd.action && c.mId === cmd.mId;
  return dbRef.child('remoteCommand').transaction(cur => (same(cur) ? null : undefined))
    .catch(e => console.warn('clear remoteCommand failed:', e));
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
    appState = { globalScoreRed:0, globalScoreBlue:0, players:currentPlayers, playerProfiles:{}, ongoingMatches:[], matchHistory:[], matchCounter:1, redTeamName:'RED TEAM', blueTeamName:'BLUE TEAM',
      // keep the season identity: a reset clears results, it does not move
      // the app back to a previous season
      seasonName: appState.seasonName, seasonYear: appState.seasonYear };
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
      seasonName:      appState.seasonName,
      seasonYear:      appState.seasonYear,
    };
    saveData(true);
    showToast('✅ Reset ผลแมตช์เรียบร้อย — Player profiles ยังอยู่ครบ', 'success');
  });
}

