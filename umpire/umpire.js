const dbRef = firebase.database().ref('sportsday_2026_data');

let appState = null;
let currentUmpire = '';
let activeMatchId = '';
let isGame2 = false;
let isFirstLoad = true;
let selectedTeam = '';
let selectedGroup = '';
let _uSrvLive = {};   // match id -> the score the server holds (see _uOnSnapshot)

// which side scored the last point → drives the "just scored" glow.
// In rally scoring the scorer serves next, so it also reads as the serve side.
let _lastScored = null;   // 'red' | 'blue' | null

// ── Local pause start timestamp (NOT stored in Firebase — avoids sync delay bug) ──
// ทุกครั้งที่กด Pause ให้เก็บ timestamp นี้ใน memory แทนการพึ่ง pauseStartedAt จาก Firebase
let _localPauseStart = null;

// ==========================================
// 2. FIREBASE LISTENER
// ==========================================
// what the page does with a new copy of the data (a function of its own so a test can feed it the same way)
function _uOnSnapshot(val) {
  appState = val || {};
  _uIndexOngoing(appState.ongoingMatches);                    // id → slot, before normalising
  appState.ongoingMatches = smToArr(appState.ongoingMatches);  // Firebase may hand back a sparse object
  appState.matchHistory   = smToArr(appState.matchHistory);
  if (!appState.players)        appState.players = [];
  // what the server holds for each live match — read before any optimistic edit of ours, so an error
  // message can say what the viewers see
  _uSrvLive = {};
  appState.ongoingMatches.forEach(m => {
    if (m && m.id && m.live) _uSrvLive[m.id] = { g1R: Number(m.live.g1R || 0), g1B: Number(m.live.g1B || 0), g2R: Number(m.live.g2R || 0), g2B: Number(m.live.g2B || 0), g1Locked: !!m.live.g1Locked };
  });

  if (isFirstLoad) {
    isFirstLoad = false;
    restoreSession();
  } else {
    updateCurrentScreen();
  }
}
dbRef.on('value', (snapshot) => _uOnSnapshot(snapshot.val()));

// ==========================================
// SAFE WRITES — by match ID, never by a possibly-stale array position
// ==========================================
// Matches live in an array, so a court's slot (ongoingMatches/2) shifts when
// an admin creates or finalizes another match. Writing by position could put
// a point on the WRONG match, or create a broken id-less "ghost" row at a slot
// that no longer exists. Every write below is a transaction on the match's
// current slot that first checks the id, and re-resolves the slot and retries
// if it moved. (This page used to rewrite the whole database on Submit, which
// reverted other courts' points and could drop another match's result.)
let _uKeys = {};   // match id → its key in ongoingMatches, from the latest snapshot
function _uIndexOngoing(raw) {
  _uKeys = {};
  if (!raw || typeof raw !== 'object') return;
  Object.keys(raw).forEach(k => {
    const m = raw[k];
    if (m && m.id !== undefined && m.id !== null && !(m.id in _uKeys)) _uKeys[m.id] = k;
  });
}

// mutate(cur) edits the server's copy of the match in place; returning false
// refuses the write (e.g. someone else already claimed it).
async function _umpMutate(mId, mutate, tries = 0) {
  const key = _uKeys[mId];
  if (key === undefined) return { ok: false, reason: 'missing' };
  let reason = '';
  _uPendingAdd(1);
  try {
    const res = await firebase.database().ref(`sportsday_2026_data/ongoingMatches/${key}`).transaction(cur => {
      if (!cur || cur.id !== mId) { reason = 'moved'; return; }
      if (mutate(cur) === false) { reason = 'refused'; return; }
      reason = '';
      return cur;
    });
    if (res.committed) { _uLastSentAt = Date.now(); return { ok: true }; }
  } catch (e) {
    console.error('umpire write failed:', e);
    reason = reason || 'error';
  } finally {
    _uPendingAdd(-1);
  }
  if (reason === 'moved' && tries < 4) {
    // the slot changed under us — refresh the id→slot map and try the new slot
    const snap = await firebase.database().ref('sportsday_2026_data/ongoingMatches').once('value');
    _uIndexOngoing(snap.val());
    return _umpMutate(mId, mutate, tries + 1);
  }
  return { ok: false, reason: reason === 'moved' ? 'missing' : (reason || 'error') };
}

// Submit Game 2: history + team scores + removal from the court list, as ONE
// atomic transaction on the server's current data. Safe to retry: a result that
// is already recorded is never counted twice.
async function _umpFinalize(entry, pRed, pBlue, tries = 0) {
  let reason = '', existing = null;
  _uPendingAdd(1);
  try {
    const res = await dbRef.transaction(root => {
      if (!root) { reason = 'no-snapshot'; return; }        // never write from an empty cache
      const ong = smToArr(root.ongoingMatches), hist = smToArr(root.matchHistory);
      existing = hist.find(h => h && h.id === entry.id) || null;
      if (existing) { reason = 'already'; return; }          // recorded already — don't count twice
      const cur = ong.find(m => m && m.id === entry.id);
      if (!cur) { reason = 'missing'; return; }
      if (cur.umpire !== currentUmpire) { reason = 'taken'; return; }   // released by an admin / taken by someone else
      reason = '';
      root.globalScoreRed  = (Number(root.globalScoreRed)  || 0) + pRed;
      root.globalScoreBlue = (Number(root.globalScoreBlue) || 0) + pBlue;
      root.matchHistory    = [...hist, entry];
      root.ongoingMatches  = ong.filter(m => m && m.id !== undefined && m.id !== entry.id);
      return root;
    });
    if (res.committed) { _uLastSentAt = Date.now(); return { ok: true }; }
  } catch (e) {
    console.error('finalize failed:', e);
    reason = reason || 'error';
  } finally {
    _uPendingAdd(-1);
  }
  if (reason === 'no-snapshot' && tries < 2) {
    await dbRef.once('value');
    return _umpFinalize(entry, pRed, pBlue, tries + 1);
  }
  return { ok: false, reason: reason || 'error', existing };
}

// Sending the result of a match. The transaction can hang for good while the SDK still believes it is
// online (a Wi-Fi that stopped answering), and the button used to say "กำลังส่งผล…" forever. After
// UMP_TIMING.finalizeTimeoutMs it asks: try again, or leave (the result is still pending on this phone and goes out
// by itself when the signal returns — as long as this page stays open). Trying again is safe: the
// transaction refuses a result that is already recorded, so the late first attempt and the second one can
// never count twice. If the late attempt finishes while the question is open, the question closes by itself.
const UMP_TIMING = { finalizeTimeoutMs: 10000 };   // an object so a test can shorten it
// the result an attempt may still deliver after the umpire left: { id, game1, game2 } — see confirmMatch
let _uSubmitPending = null;
async function _sendResult(entry, pRed, pBlue) {
  _uSubmitPending = { id: entry.id, game1: entry.game1, game2: entry.game2 };
  let attempt = _umpFinalize(entry, pRed, pBlue);
  attempt.then(() => { if (_uSubmitPending && _uSubmitPending.id === entry.id) _uSubmitPending = null; });
  for (;;) {
    const late = attempt.then(r => ({ done: r }));
    const slow = new Promise(res => setTimeout(() => res({ slow: true }), UMP_TIMING.finalizeTimeoutMs));
    const first = await Promise.race([late, slow]);
    if (first.done) return first.done;
    const question = showConfirm('⏳', 'ส่งนานกว่าปกติ',
      'สัญญาณอาจไม่ดี — คะแนนยังอยู่ครบในเครื่องนี้\nอย่าปิดหน้านี้\nถ้าออกตอนนี้ ระบบจะส่งต่อเองเมื่อสัญญาณกลับ',
      { confirmLabel: 'ลองใหม่', cancelLabel: 'ออก — ส่งต่อเอง', noEscape: true });   // leaving here is a real choice, so Esc must not make it
    const out = await Promise.race([question.then(choice => ({ choice })), late]);
    if (out.done) { _modalDone(null); return out.done; }       // it got through while we were asking
    if (!out.choice) return { ok: false, reason: 'abandoned' };
    attempt = _umpFinalize(entry, pRed, pBlue);
    attempt.then(() => { if (_uSubmitPending && _uSubmitPending.id === entry.id) _uSubmitPending = null; });
  }
}

// "This match is gone" — shown once, however many writes notice it.
let _uClosedShown = false;
function _uMatchClosed() {
  if (_uClosedShown || _isConfirming) return;
  _uClosedShown = true;
  showAlert('⚠️', 'แมตช์นี้ปิดแล้ว', 'ทีมงานบันทึกผลหรือปิดแมตช์นี้แล้ว\nคะแนนที่กดต่อจากนี้จะไม่ถูกนับ', 'กลับไปรายการ').then(() => exitMatch());
}
// "somebody else got this match first" — the same words wherever a claim loses the race
const _uTakenFirst = name => showAlert('🔒', `${name} รับแมตช์นี้ไปก่อนแล้ว`, 'เลือกแมตช์อื่นได้', 'กลับไปรายการ');
// "This match is no longer yours" — an admin gave it back to the queue (an umpire walked away), or
// someone else took it afterwards. Same once-only rule. Every write is also refused on the server
// while the match belongs to someone else, so a phone that has not heard yet cannot write into it.
function _uMatchReleased(m) {
  if (_uClosedShown || _isConfirming) return;
  _uClosedShown = true;
  const back = !m.umpire;
  showAlert(back ? '↩️' : '🔒',
    back ? 'แมตช์นี้ถูกปล่อยแล้ว' : 'แมตช์นี้มีกรรมการคนอื่นแล้ว',
    back ? 'ทีมงานปล่อยแมตช์นี้กลับเข้าคิว\nคะแนนที่นับไว้ไม่ถูกบันทึก\nถ้ายังต้องคุม เลือกแมตช์นี้ใหม่จากรายการ'
         : `${m.umpire} กำลังคุมแมตช์นี้อยู่\nคะแนนจากเครื่องนี้จะไม่ถูกส่ง`,
    'กลับไปรายการ').then(() => exitMatch());
}
// A write that did not go through. It used to open a dialog that blocked the next tap and said nothing
// about WHICH point; now it is a bar that does not block anything: what failed, what the viewers see, and
// (for a point) a retry that cannot count twice.
//   what   — "คะแนนล่าสุด", "สถานะพัก", … (shown in the sentence)
//   retry  — optional function behind the [ลองใหม่] button
//   seen   — optional function returning "12–10", the score the viewers have
function _uWriteFailed(reason, what, retry, seen) {
  if (reason === 'refused') return;                  // e.g. paused on the server — nothing to do
  if (reason === 'missing') return _uMatchClosed();
  const s = seen ? seen() : '';
  showNotice(`ส่ง${what || 'ข้อมูล'}ไม่สำเร็จ${s ? ` — ผู้ชมเห็นคะแนน ${s}` : ' — ตรวจสัญญาณแล้วลองอีกครั้ง'}`,
    { tone: 'err', actions: retry ? [{ label: 'ลองใหม่', run: retry }] : [] });
}
// the score of the game in play, as the server has it: "12–10" (or '' if unknown)
function _uSeenScore(mId, game2) {
  const v = _uSrvLive[mId];
  return v ? (game2 ? `${v.g2R}–${v.g2B}` : `${v.g1R}–${v.g1B}`) : '';
}
// Retry of ONE failed point. It is applied only if the server still holds the value this tap started from:
// the first attempt may have got through after all, or someone else scored — then it is not ours to repeat,
// so a retry can never count a point twice.
function _retryPoint(mId, gameKey, delta, before, game2) {
  _umpMutate(mId, cur => {
    if (cur.umpire !== currentUmpire) return false;
    cur.live = cur.live || {};
    if (cur.live.isPaused) return false;
    if (Number(cur.live[gameKey] || 0) !== before) return false;
    const now = Date.now();
    cur.live[gameKey] = Math.max(0, before + delta);
    cur.live.lastAt = now;
    if (delta > 0 && !cur.timerStartedAt) { cur.timerStartedAt = now; cur.live.totalPauseMs = 0; }
    checkEpicPossible(cur);
  }).then(r => {
    if (r.ok) showNotice('ส่งแล้ว ✓', { tone: 'ok', ms: 2500 });
    else if (r.reason === 'refused') showNotice('คะแนนบนเซิร์ฟเวอร์เปลี่ยนไปแล้ว — ดูคะแนนบนจอ แล้วแตะใหม่ถ้ายังไม่ถูก', { tone: 'warn', ms: 8000 });
    else _uWriteFailed(r.reason, 'คะแนนล่าสุด', () => _retryPoint(mId, gameKey, delta, before, game2), () => _uSeenScore(mId, game2));
  });
}

// ── NOTICE — a message that does not stop the umpire ────────────────────
// tone: 'err' (stays until closed) · 'warn' · 'ok'; ms: hides itself after that long; actions: [{label, run}]
let _noticeTimer = null, _noticeActions = [];
function showNotice(text, opts) {
  const el = document.getElementById('umpNotice');
  if (!el) return;
  opts = opts || {};
  _noticeActions = opts.actions || [];
  el.className = 'show ' + (opts.tone || 'warn');
  el.innerHTML = `<span class="un-text">${_uEsc(text)}</span>`
    + _noticeActions.map((a, i) => `<button type="button" class="un-btn" data-i="${i}">${_uEsc(a.label)}</button>`).join('')
    + `<button type="button" class="un-x" data-x="1" aria-label="ปิดข้อความนี้">✕</button>`;
  // under the bar that is on screen (the scoring info bar, or the menu bar), so it never covers the clock
  const bar = document.querySelector('#screen-scoring.active .scoring-topbar') || document.getElementById('umpireNav');
  const r = bar && bar.offsetParent ? bar.getBoundingClientRect() : null;
  el.style.top = (r ? Math.round(r.bottom) + 6 : 10) + 'px';
  clearTimeout(_noticeTimer);
  if (opts.ms) _noticeTimer = setTimeout(hideNotice, opts.ms);
}
function hideNotice() {
  const el = document.getElementById('umpNotice');
  if (el) { el.className = ''; el.innerHTML = ''; }
  clearTimeout(_noticeTimer); _noticeActions = [];
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('#umpNotice button');
  if (!b) return;
  if (b.dataset.x) return hideNotice();
  const a = _noticeActions[Number(b.dataset.i)];
  hideNotice();
  if (a && a.run) a.run();
});

// ==========================================
// CONNECTION — say so when offline, count writes still waiting to reach the server
// ==========================================
// Firebase queues writes while offline and sends them when the signal returns
// — but only while this page stays open. So the umpire must know.
const _uLoadedAt = Date.now();
let _uOnline = false, _uEverOnline = false, _uPending = 0;
let _uOfflinePoints = 0;   // point taps made while offline: they wait in the SDK queue and go out together
let _uPendingSince = 0;     // when the queue last went from empty to non-empty
let _uLastSentAt = 0;      // the last moment the server ACCEPTED one of our writes (shown as "ส่งแล้ว 14:31:07")
const SYNC_SLOW_MS = 1200; // a normal tap is answered in 100-300 ms; a send still waiting after this is "slow" and is said so
function _uPendingAdd(d) {
  const before = _uPending;
  _uPending = Math.max(0, _uPending + d);
  if (before === 0 && _uPending > 0) { _uPendingSince = Date.now(); setTimeout(_uRenderNet, SYNC_SLOW_MS + 60); }
  if (_uPending === 0) _uPendingSince = 0;
  _uRenderNet();
  // the queue has just emptied after an offline stretch: say so, with how many points it carried
  // (the red bar used to vanish with no word that everything had arrived)
  if (before > 0 && _uPending === 0 && _uOnline && _uOfflinePoints > 0) {
    const n = _uOfflinePoints; _uOfflinePoints = 0;
    showNotice(`ส่งครบแล้ว ✓ ${n} คะแนน`, { tone: 'ok', ms: 4000 });
  }
}
// The three states the umpire needs to know (P-17 stage 1) — always one of them, in words and an icon, never colour alone:
//   ok       "✓ ส่งแล้ว 14:31:07"  everything this phone sent has been accepted (time of the last one)
//   sending  "⏳ กำลังส่ง 3"        online, but a send has been waiting longer than SYNC_SLOW_MS (slow signal)
//   offline  "📶 ออฟไลน์ · รอส่ง 3"  no connection; sends wait in the queue and go out by themselves
function _uSyncState(now) {
  const offline = !_uOnline && (_uEverOnline || now - _uLoadedAt > 3000);
  if (offline) return 'offline';
  if (_uPending > 0 && _uPendingSince && now - _uPendingSince >= SYNC_SLOW_MS) return 'sending';
  return 'ok';
}
function _uClock(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function _uRenderNet() {
  const st = _uSyncState(Date.now());
  document.body.classList.toggle('is-offline', st === 'offline');
  document.body.classList.toggle('is-slow', st === 'sending');
  // the bar on top speaks up only when something is wrong; the strip above the bottom buttons always shows the state
  const txt = st === 'offline'
    ? `📶 ออฟไลน์ — คะแนนที่กดจะส่งเองเมื่อสัญญาณกลับ · อย่าปิดหรือรีเฟรชหน้านี้${_uPending ? ` · รอส่ง ${_uPending}` : ''}`
    : st === 'sending' ? `⏳ กำลังส่ง ${_uPending} รายการ — สัญญาณช้า รอสักครู่ อย่าปิดหน้านี้` : '';
  document.querySelectorAll('.net-banner').forEach(el => { el.textContent = txt; });
  const strip = document.getElementById('syncStrip');
  if (strip) {
    strip.className = 'sync-strip sync-' + st;
    strip.textContent = st === 'offline' ? `📶 ออฟไลน์${_uPending ? ` · รอส่ง ${_uPending}` : ''}`
      : st === 'sending' ? `⏳ กำลังส่ง ${_uPending}`
      : _uLastSentAt ? `✓ ส่งแล้ว ${_uClock(_uLastSentAt)}` : '✓ เชื่อมต่อแล้ว';
  }
  // on the scoring screen the banner floats just under the top bar
  const sb = document.querySelector('#screen-scoring > .net-banner');
  const tb = document.querySelector('.scoring-topbar');
  if (sb) sb.style.top = (tb && tb.offsetParent ? tb.offsetHeight : 0) + 'px';
}
firebase.database().ref('.info/connected').on('value', s => {
  _uOnline = s.val() === true;
  if (_uOnline) _uEverOnline = true;
  _uRenderNet();
});
setTimeout(_uRenderNet, 3500);   // never connected after a few seconds → say so

// ==========================================
// FULLSCREEN
// ==========================================
// An iPhone has no Fullscreen API, so ⛶ did nothing and said nothing; an app added to the home screen is
// already full screen. Where full screen cannot be asked for, the ⛶ buttons are hidden and the login page says why.
function initDeviceSupport(force) {
  const de = document.documentElement;
  const fsApi = force && force.fs !== undefined ? force.fs : !!(de.requestFullscreen || de.webkitRequestFullscreen);
  const standalone = force && force.standalone !== undefined ? force.standalone
    : !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
  const canFs = fsApi && !standalone;
  document.querySelectorAll('#navFsBtn, #liFsBtn, .btn-login-fs').forEach(b => { b.style.display = canFs ? '' : 'none'; });
  const hint = document.getElementById('fsHint');
  if (hint) hint.style.display = (!fsApi && !standalone) ? 'block' : 'none';
  return { fsApi, standalone, canFs };
}
initDeviceSupport();
let _fsIndicatorTimer = null;

function toggleFullScreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) req.call(el).catch(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

function onFsChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  // Update all FS buttons
  document.querySelectorAll('#liFsBtn, #navFsBtn').forEach(btn => {
    btn.classList.toggle('fs-active', isFs);
    btn.textContent = isFs ? '⤢' : '⛶';
  });
  document.getElementById('fsBtn').textContent = isFs ? '⤢' : '⛶';

  // Show indicator briefly
  if (isFs) {
    const ind = document.getElementById('fsIndicator');
    ind.classList.add('show');
    clearTimeout(_fsIndicatorTimer);
    _fsIndicatorTimer = setTimeout(() => ind.classList.remove('show'), 2800);
  }
}

// ==========================================
// WAKE LOCK
// ==========================================
let _wakeLock = null;

// Said once per visit, a few seconds after the match opens (after the VS intro and any "restored" line): the
// screen may go dark on its own. It used to fail without a word (an empty catch) on iPhones before iOS 16.4
// and when battery saver refuses the request.
let _wakeWarned = false;
function _wakeWarn() {
  if (_wakeWarned) return;
  _wakeWarned = true;
  setTimeout(() => {
    if (document.getElementById('screen-scoring').classList.contains('active'))
      showNotice('หน้าจออาจดับเอง — ตั้งให้ล็อกหน้าจออัตโนมัติช้าลง หรือเสียบชาร์จไว้', { tone: 'warn', ms: 12000 });
  }, 4000);
}
async function requestWakeLock() {
  if (!(navigator.wakeLock && navigator.wakeLock.request)) { _wakeWarn(); return; }
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    document.getElementById('wakeLockBadge').style.display = 'block';
    _wakeLock.addEventListener('release', () => {
      document.getElementById('wakeLockBadge').style.display = 'none';
      _wakeLock = null;
    });
  } catch (e) { _wakeWarn(); }   // refused (battery saver, page hidden)
}

function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
  document.getElementById('wakeLockBadge').style.display = 'none';
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && !_wakeLock) {
    const scoring = document.getElementById('screen-scoring');
    if (scoring.classList.contains('active')) await requestWakeLock();
  }
});

// ==========================================
// 3. SESSION & NAVIGATION
// ==========================================
function restoreSession() {
  currentUmpire = localStorage.getItem('bdm_umpire_name') || '';
  activeMatchId  = localStorage.getItem('bdm_umpire_match') || '';
  const savedTab = localStorage.getItem('bdm_umpire_tab') || 'live';

  if (currentUmpire) {
    // only a match that is still ours: one given back to the queue (or taken by someone else) while this
    // phone was closed must not be re-entered — a point there would be written into someone else's match
    if (activeMatchId && appState.ongoingMatches.find(m => m.id === activeMatchId && m.umpire === currentUmpire && m.live)) {
      const m = appState.ongoingMatches.find(m => m.id === activeMatchId);
      _uOwned = m.id;
      isGame2 = m.live && m.live.g1Locked;
      document.getElementById('umpireNav').style.display = 'none';
      switchScreen('screen-scoring');
      setMatchInfo(m);
      document.getElementById('redNames').innerHTML  = scoringNamesHtml(m, 'red');
      document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue');
      renderGameUI();
      requestWakeLock();
      // Restore pause overlay if match is currently paused
      if (m.live && m.live.isPaused) {
        // ตั้ง _localPauseStart จาก Firebase value หรือ now (กรณี page reload ขณะ paused)
        _localPauseStart = m.live.pauseStartedAt || Date.now();
        document.getElementById('pauseOverlay').classList.add('show');
      }
      // one line, so a reopened page never leaves the umpire wondering whether it is the same match
      showNotice(`กู้กลับมาแล้ว — คุมแมตช์ ${m.id} ต่อ`, { tone: 'ok', ms: 3500 });
    } else {
      const wasId = activeMatchId;
      const gone = wasId && appState.ongoingMatches.find(m => m.id === wasId);
      activeMatchId = '';
      localStorage.removeItem('bdm_umpire_match');
      goToTab(savedTab);
      // say why the match is not on screen instead of opening a scoreboard whose taps do nothing
      if (wasId) {
        showNotice(!gone ? `แมตช์ ${wasId} ปิดแล้ว — เลือกแมตช์ในรายการ`
          : gone.umpire && gone.umpire !== currentUmpire ? `แมตช์ ${wasId} มี ${gone.umpire} คุมอยู่แล้ว`
          : `แมตช์ ${wasId} ยังไม่ได้เป็นของคุณ — แตะรับอีกครั้ง`, { tone: 'warn', ms: 9000 });
      }
    }
  } else {
    document.getElementById('umpireNav').style.display = 'none';
    switchScreen('screen-login');
    renderUmpireList();
  }
}

function _uEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// "ก้อง (G2) & มิ้น (G2)" → "ก้อง & มิ้น": the group suffix is noise on a phone
// (the scoreboard app strips it too); names are escaped, the "&" is styled.
function formatNames(names) {
  return String(names || '').split(' & ')
    .map(n => _uEsc(n.replace(/\s*\(G\d\)/g, '').trim()))
    .join(' <span style="color:var(--muted);font-size:0.88em;font-weight:600;">&amp;</span> ');
}

// ── Player faces (read-only) ──────────────────────────────────
// The umpire bundle does not load player-photo.js. Photos live at
// sportsday_2026_photos/{id} (outside the live blob), fetched on demand for
// the faces actually shown; the legacy playerProfiles[id].photo is the
// fallback until the migration runs. A jersey with no photo shows its id.
const umpPhotosRef = firebase.database().ref('sportsday_2026_photos');
const _uPhotos = {};
const _uPhotoReq = new Set();
function umpirePhoto(id) {
  if (!id) return null;
  if (!_uPhotoReq.has(id)) {
    _uPhotoReq.add(id);
    umpPhotosRef.child(id).on('value',
      snap => { const v = snap.val(); _uPhotos[id] = (v && v.photo) || null; _uPaintFaces(id); },
      ()   => { _uPhotos[id] = null; });
  }
  const legacy = appState && appState.playerProfiles && appState.playerProfiles[id] && appState.playerProfiles[id].photo;
  return _uPhotos[id] || legacy || null;
}
// a face that arrives after render upgrades the avatars already on screen
function _uPaintFaces(id) {
  const photo = umpirePhoto(id);
  document.querySelectorAll('.uavatar[data-pid="' + CSS.escape(id) + '"]').forEach(function (el) {
    const img = el.querySelector('img');
    if (photo) {
      if (img) { if (img.getAttribute('src') !== photo) img.src = photo; return; }
      const im = document.createElement('img'); im.src = photo; im.alt = ''; im.loading = 'lazy';
      el.classList.remove('ua-initials'); el.style.fontSize = ''; el.replaceChildren(im);
    } else if (img) {
      el.classList.add('ua-initials'); el.textContent = id;
      el.style.fontSize = Math.round(el.offsetWidth * 0.36) + 'px';
    }
  });
}
function umpirePlayer(id) {
  return (appState && appState.players || []).find(p => p.id === id) || null;
}
function umpireAvatar(id, size) {
  size = size || 30;
  const p = umpirePlayer(id);
  const photo = umpirePhoto(id);
  const team = p && p.team === 'Blue' ? 'ua-blue' : 'ua-red';
  const style = 'width:' + size + 'px;height:' + size + 'px;';
  const pid = p ? ' data-pid="' + p.id + '"' : '';
  if (photo) return '<span class="uavatar ' + team + '"' + pid + ' style="' + style + '"><img src="' + photo + '" alt="" loading="lazy"></span>';
  return '<span class="uavatar ' + team + ' ua-initials"' + pid + ' style="' + style + 'font-size:' + Math.round(size*0.36) + 'px;">' + (p ? p.id : '?') + '</span>';
}
// two faces for a doubles pair, overlapped slightly
function scoringNamesHtml(m, side) {
  // names only — faces are on the match card; the scoring screen is height-
  // constrained and the extra row pushed the panels into the action buttons
  return formatNames(side === 'red' ? m.redNames : m.blueNames);
}
function umpirePairFaces(id1, id2, size) {
  return '<span class="uface-pair">' + umpireAvatar(id1, size) + umpireAvatar(id2, size) + '</span>';
}

// ── VS intro — a brief pair-vs-pair reveal when a fresh match is opened ──
let _vsIntroTimer = null;
function showVsIntro(m) {
  const ov = document.getElementById('vsIntro');
  if (!ov || !m) return;
  document.getElementById('vsiCourt').textContent = '🟢 ' + (m.court ? `คอร์ต ${m.court} · ` : '') + m.id + (m.round ? ` · รอบ ${m.round}` : '');
  document.getElementById('vsiRedFaces').innerHTML  = umpirePairFaces(m.r1, m.r2, 96);
  document.getElementById('vsiBlueFaces').innerHTML = umpirePairFaces(m.b1, m.b2, 96);
  document.getElementById('vsiRedNames').innerHTML  = formatNames(m.redNames || '');
  document.getElementById('vsiBlueNames').innerHTML = formatNames(m.blueNames || '');
  ov.classList.add('show');
  clearTimeout(_vsIntroTimer);
  _vsIntroTimer = setTimeout(dismissVsIntro, 3000);
}
function dismissVsIntro() {
  const ov = document.getElementById('vsIntro');
  if (!ov) return;
  clearTimeout(_vsIntroTimer);
  ov.classList.remove('show');
}

// ── LOGIN FILTER TOGGLES ──
function setTeamFilter(team) {
  selectedTeam = team;
  selectedGroup = '';

  document.querySelectorAll('#team-toggles .toggle-btn').forEach(btn => {
    btn.classList.remove('selected-red', 'selected-blue', 'selected-gold');
  });
  if (team === 'Red') document.getElementById('tbtn-Red').classList.add('selected-red');
  else if (team === 'Blue') document.getElementById('tbtn-Blue').classList.add('selected-blue');

  const groupSec = document.getElementById('group-section');
  if (team) {
    groupSec.style.display = 'block';
    document.getElementById('nameStepNum').textContent = '3';
    document.querySelectorAll('#group-toggles .toggle-btn').forEach(b => b.classList.remove('selected-gold'));
    document.querySelector('#group-toggles .toggle-btn:first-child').classList.add('selected-gold');
  } else {
    groupSec.style.display = 'none';
    document.getElementById('nameStepNum').textContent = '2';
  }
  renderUmpireList();
}

function setGroupFilter(group) {
  selectedGroup = group;
  document.querySelectorAll('#group-toggles .toggle-btn').forEach(b => b.classList.remove('selected-gold'));
  event.currentTarget.classList.add('selected-gold');
  renderUmpireList();
}

// the login button stays off until a name is chosen, and says so (it used to be pressable and then scold with a dialog)
function updateLoginReady() {
  const sel = document.getElementById('umpireSelect');
  const ok = !!(sel && sel.value);
  const btn = document.getElementById('btnLogin');
  if (btn) { btn.disabled = !ok; btn.textContent = ok ? 'เข้าสู่ระบบ →' : 'เลือกชื่อของคุณก่อน'; }
  const help = document.getElementById('loginHelp');
  if (help) help.style.display = ok ? 'none' : 'block';
}
function processLogin() {
  currentUmpire = document.getElementById('umpireSelect').value;
  if (!currentUmpire) { vibrateDevice([80, 40, 80]); showAlert('⚠️', 'ยังไม่ได้เลือกชื่อ', 'เลือกชื่อของคุณจากรายการก่อนเข้าระบบ', 'เลือกชื่อ'); return; }
  localStorage.setItem('bdm_umpire_name', currentUmpire);
  goToTab('live');
}

async function logoutUmpire() {
  // matches stay in this name's hands: nothing is released by leaving (the same name on any phone carries on)
  const held = ((appState && appState.ongoingMatches) || []).filter(m => m && m.umpire === currentUmpire).map(m => m.id);
  const ok = await showConfirm('🚪', `ออกจากชื่อ ${currentUmpire}?`,
    held.length ? `แมตช์ ${held.join(', ')} จะยังเป็นของ ${currentUmpire}\nเข้าชื่อเดิมเพื่อคุมต่อ หรือให้ทีมงานปล่อย`
                : 'เลือกชื่อใหม่ได้ที่หน้าแรก', {
    confirmLabel: 'ออก', confirmClass: 'modal-btn-danger', cancelLabel: 'อยู่ต่อ'
  });
  if (ok) {
    releaseWakeLock();
    currentUmpire = '';
    activeMatchId = '';
    // only this page's keys — clear() also wiped the scoreboard app's role and
    // "me" choice for anyone using the same phone for both
    ['bdm_umpire_name', 'bdm_umpire_match', 'bdm_umpire_tab'].forEach(k => localStorage.removeItem(k));
    document.getElementById('umpireNav').style.display = 'none';
    switchScreen('screen-login');
    renderUmpireList();
  }
}

function switchScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  // Body class for CSS hooks
  document.body.className = '';
  if (id === 'screen-login')   document.body.classList.add('is-login');
  if (id === 'screen-scoring') document.body.classList.add('is-scoring');
  _uRenderNet();   // className reset above drops is-offline — put it back
}

function goToTab(tabName) {
  localStorage.setItem('bdm_umpire_tab', tabName);
  document.getElementById('umpireNav').style.display = 'flex';
  document.getElementById('tab-live').classList.toggle('active', tabName === 'live');
  document.getElementById('tab-finished').classList.toggle('active', tabName === 'finished');
  if (tabName === 'live')     { switchScreen('screen-live');     renderMatchList(); }
  else                        { switchScreen('screen-finished'); renderFinishedList(); }
}

let _isConfirming = false; // ป้องกัน double-alert race condition ตอน confirmMatch
let _uOwned = '';          // id of the match the server has confirmed as ours (so "released" is never guessed from a claim still in flight)

function updateCurrentScreen() {
  const s = id => document.getElementById(id).classList.contains('active');
  if (s('screen-login'))    renderUmpireList();
  if (s('screen-live'))     renderMatchList();
  if (s('screen-finished')) renderFinishedList();
  if (s('screen-scoring')) {
    const am = activeMatchId && appState.ongoingMatches.find(m => m.id === activeMatchId);
    if (activeMatchId && !am) {
      _uMatchClosed();   // once only; skipped while confirmMatch is handling it
    } else if (am && am.umpire === currentUmpire) {
      _uOwned = am.id;   // the server confirms this match is ours
      renderGameUI();
    } else if (am && _uOwned === am.id) {
      _uMatchReleased(am);   // it was ours and is not any more (given back to the queue, or taken)
    } else {
      renderGameUI();    // our claim has not reached the server yet — nothing to conclude
    }
  }
}

// ── Pull-to-refresh (swipe down on live screen) ──
let _ptStart = 0;
document.getElementById('screen-live').addEventListener('touchstart', e => {
  _ptStart = e.touches[0].clientY;
}, { passive: true });
document.getElementById('screen-live').addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - _ptStart;
  if (dy > 80 && window.scrollY === 0) {
    vibrateDevice([30]);
    renderMatchList();
  }
}, { passive: true });

// ── TIMER ── (formatTimer lives in shared/match-time.js: it shows hours past 60 minutes)

setInterval(() => {
  const scoringActive = document.getElementById('screen-scoring').classList.contains('active');
  if (!scoringActive || !activeMatchId) return;
  const m = appState && appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!m) return;

  const el      = document.getElementById('umpireTimerDisplay');
  const liTimer = document.getElementById('liTimer');

  // The match clock starts with the first point (a match that is only taken shows 0:00, muted) and
  // keeps running through a pause. It used to start when the match was taken, so a stale time from
  // the previous match could sit on screen and waiting counted as play.
  const started = !!m.timerStartedAt;
  const paused  = !!(m.live && m.live.isPaused);
  const timeStr = formatTimer(started ? Date.now() - m.timerStartedAt : 0);
  const state   = paused ? ' paused' : (started ? '' : ' idle');   // paused keeps the gold pulse
  el.className = 'timer-display' + state;
  el.textContent = timeStr;
  if (liTimer) { liTimer.textContent = timeStr; liTimer.className = 'li-timer' + state; }

  if (paused) {
    // ─ Pause current session timer (นับเวลาพักครั้งนี้แยกต่างหาก)
    if (!_localPauseStart) {
      _localPauseStart = m.live.pauseStartedAt || Date.now();
    }
    const currentPause = Date.now() - _localPauseStart;
    const totalPause   = (m.live.totalPauseMs || 0) + currentPause;

    const bigEl   = document.getElementById('pauseTimerBig');
    const totalEl = document.getElementById('pauseTimerTotal');
    if (bigEl)   bigEl.textContent   = formatTimer(currentPause);
    if (totalEl) totalEl.textContent = formatTimer(totalPause);
  }
}, 1000);

// ==========================================
// VIBRATION
// ==========================================
function vibrateDevice(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ==========================================
// CUSTOM MODAL — fullscreen-safe แทน alert/confirm
// ==========================================
let _modalResolve = null;
let _modalReturnFocus = null;   // what had the focus before the box opened (it gets it back)
let _modalEscape = null;        // { v } — what Esc answers; null = Esc does nothing (a question with no safe way out)

// Every box goes through here: the screen reader is told it is a dialog (role/aria-modal/labels are on #modalBox
// in umpire.html), the focus moves INTO it — onto the SAFE button, so Enter is never "yes, do it" — Tab stays
// inside, and Esc answers `escapeWith` when given. Before, the focus stayed on the page behind and the
// two buttons looked alike.
function _modalOpen(escapeWith) {
  const a = document.activeElement;
  _modalReturnFocus = a && a !== document.body ? a : null;
  _modalEscape = escapeWith === undefined ? null : { v: escapeWith };
  document.getElementById('customModal').classList.add('open');
  const box = document.getElementById('modalBox');
  // a score box (not the court picker, which shares the same slot) reads scores-first — see css .has-score
  box.classList.toggle('has-score', document.getElementById('modalScorePreview').style.display === 'block' && !box.classList.contains('is-courts'));
  const first = box.querySelector('[data-safe]') || box.querySelector('#modalBtns button');
  if (first) first.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  const modal = document.getElementById('customModal');
  if (!modal || !modal.classList.contains('open')) return;
  if (e.key === 'Escape') {
    if (_modalEscape) { e.preventDefault(); _modalDone(_modalEscape.v); }
  } else if (e.key === 'Tab') {
    const f = [...modal.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
});

/**
 * showAlert(icon, title, body, okLabel) → Promise<void>   (Esc = the OK button)
 * showConfirm(icon, title, body, {confirmLabel, confirmClass, cancelLabel, scoreHtml, noEscape}) → Promise<bool>
 *   the cancel button is the safe one: first, plain, and it has the focus. Esc cancels, unless noEscape.
 */
function showAlert(icon, title, body, okLabel) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;
    document.getElementById('modalScorePreview').style.display = 'none';
    const btns = document.getElementById('modalBtns');
    btns.className = 'modal-btns';
    btns.innerHTML = `<button class="modal-btn modal-btn-ok" data-safe onclick="_modalDone(true)">${_uEsc(okLabel || 'ตกลง')}</button>`;
    _modalOpen(true);
  });
}

function showConfirm(icon, title, body, opts = {}) {
  return new Promise(resolve => {
    _modalResolve = resolve;
    document.getElementById('modalIcon').textContent = icon;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').textContent = body;

    const preview = document.getElementById('modalScorePreview');
    if (opts.scoreHtml) {
      preview.innerHTML = opts.scoreHtml;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    const confirmLabel = opts.confirmLabel || 'ยืนยัน';
    const confirmClass = opts.confirmClass || 'modal-btn-confirm';
    const cancelLabel  = opts.cancelLabel  || 'ยกเลิก';

    // side by side when both labels are short; one above the other when a label is long or the phone is narrow
    // (a two-line label squeezed into half a 320 px box was the old "รับ/เพิ่ม" wrap). A landscape phone is wide enough.
    const stack = window.innerWidth < 340 || (Math.max(cancelLabel.length, confirmLabel.length) > 9 && window.innerWidth < 500);
    const btns = document.getElementById('modalBtns');
    btns.className = 'modal-btns two-col' + (stack ? ' stack' : '');
    btns.innerHTML = `
      <button class="modal-btn modal-btn-cancel" data-safe onclick="_modalDone(false)">${_uEsc(cancelLabel)}</button>
      <button class="modal-btn ${confirmClass}" onclick="_modalDone(true)">${_uEsc(confirmLabel)}</button>
    `;
    _modalOpen(opts.noEscape ? undefined : false);
  });
}

function _modalDone(result) {
  document.getElementById('customModal').classList.remove('open');
  document.getElementById('modalBox').classList.remove('is-courts', 'has-score');
  const back = _modalReturnFocus; _modalReturnFocus = null; _modalEscape = null;
  if (back && document.contains(back) && back.offsetParent !== null) back.focus({ preventScroll: true });
  if (_modalResolve) { _modalResolve(result); _modalResolve = null; }
}

// ==========================================
// 4. UMPIRE LIST
// ==========================================
function renderUmpireList() {
  if (!appState || !appState.players) return;
  const select = document.getElementById('umpireSelect');
  const currentVal = select.value;

  select.innerHTML = '<option value="">— แตะเพื่อเลือกชื่อ —</option>';

  const playersArray = Array.isArray(appState.players)
    ? appState.players
    : Object.values(appState.players);

  const filtered = playersArray.filter(p =>
    (!selectedTeam  || p.team === selectedTeam) &&
    (!selectedGroup || String(p.group) === String(selectedGroup))
  );

  filtered.forEach(p => {
    const prefix = p.team === 'Red' ? '🔴' : '🔵';
    select.innerHTML += `<option value="${p.name}">${prefix} ${p.name} (G${p.group})</option>`;
  });

  if (currentVal && filtered.some(p => p.name === currentVal)) select.value = currentVal;
  updateLoginReady();
}

// ==========================================
// 5. MATCH LIST
// ==========================================
// ── MATCH LIST — mine first, then who is free (in queue order), then who is taken (P-27) ──
// At 10 courts the list runs to several screens, and it used to be in stored order: your own "▶ คุมต่อ" could be
// anywhere, free and taken cards mixed. Now three groups; "เฉพาะที่ว่าง" hides the taken ones; the first free card
// is marked "ถัดไป" (the next one in the queue).
let _onlyFree = false;
try { _onlyFree = localStorage.getItem('bdm_umpire_onlyfree') === '1'; } catch (e) { /* private mode: it just starts off */ }
function toggleOnlyFree() {
  _onlyFree = !_onlyFree;
  try { localStorage.setItem('bdm_umpire_onlyfree', _onlyFree ? '1' : '0'); } catch (e) { /* ignore */ }
  renderMatchList();
}
function _matchCardHtml(m, mine, next) {
  const badge = mine
    ? `<span class="badges">${m.court ? `<span class="badge badge-court">${courtLabel(m)}</span>` : ''}<span class="badge badge-mine">▶ คุมต่อ</span></span>`
    : next ? '<span class="badge badge-next">⏭ ถัดไป</span>'
    : '<span class="badge" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(240,192,64,0.3);">✦ ว่างอยู่</span>';
  return `
    <div class="match-card ${mine ? 'claimed' : ''}" onclick="handleMatchCardTap(event, '${m.id}')">
      <div class="match-card-header">
        <div class="match-id">${m.id} <span style="color:var(--muted);font-size:0.55em;letter-spacing:0;">รอบ ${m.round}</span></div>
        ${badge}
      </div>
      <div class="team-row">${umpirePairFaces(m.r1, m.r2, 30)}<span style="color:var(--red);">${formatNames(m.redNames)}</span></div>
      <div class="team-row">${umpirePairFaces(m.b1, m.b2, 30)}<span style="color:var(--blue);">${formatNames(m.blueNames)}</span></div>
    </div>`;
}
function _matchTakenHtml(m) {
  return `
    <div class="match-card locked-other">
      <div class="match-card-header">
        <div class="match-id" style="color:var(--muted);">${m.id} <span style="font-size:0.55em;">รอบ ${m.round}</span></div>
        <span class="badge badge-taken">🔒 ${_uEsc(m.umpire)}${m.court ? ' · ' + courtLabel(m) : ''}</span>
      </div>
    </div>`;
}
function renderMatchList() {
  const list = document.getElementById('matchList');

  if (!appState || appState.ongoingMatches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">☕</span>
        <div class="empty-title">ยังไม่มีแมตช์ให้คุม</div>
        <div class="empty-sub">รอทีมงานสร้างแมตช์ — จะขึ้นที่นี่เอง</div>
      </div>`;
    return;
  }

  const all   = appState.ongoingMatches.filter(m => m && m.id);
  const mine  = sortByCourt(all.filter(m => m.umpire === currentUmpire));
  const free  = all.filter(m => !m.umpire);                                   // queue order, as stored
  const taken = sortByCourt(all.filter(m => m.umpire && m.umpire !== currentUmpire));
  const group = (title, n) => `<div class="list-group"><span>${title}</span><b>${n}</b></div>`;
  const html = [];

  if (taken.length) {
    html.push(`<button type="button" class="list-filter${_onlyFree ? ' on' : ''}" aria-pressed="${_onlyFree}" onclick="toggleOnlyFree()">${
      _onlyFree ? `ซ่อนอยู่ ${taken.length} แมตช์ — แตะเพื่อแสดงทั้งหมด` : 'เฉพาะแมตช์ที่ว่าง'}</button>`);
  }
  if (mine.length) { html.push(group('คุมอยู่', mine.length)); mine.forEach(m => html.push(_matchCardHtml(m, true, false))); }
  if (free.length) { html.push(group('ว่างอยู่ — ตามลำดับคิว', free.length)); free.forEach((m, i) => html.push(_matchCardHtml(m, false, i === 0))); }
  else if (_onlyFree && !mine.length) {
    html.push('<div class="empty-state"><span class="empty-icon">🏸</span><div class="empty-title">ไม่มีแมตช์ว่าง</div><div class="empty-sub">ทุกแมตช์มีกรรมการคุมอยู่แล้ว</div></div>');
  }
  if (taken.length && !_onlyFree) { html.push(group('มีกรรมการแล้ว', taken.length)); taken.forEach(m => html.push(_matchTakenHtml(m))); }
  list.innerHTML = html.join('');
}

function handleMatchCardTap(event, mId) {
  // Ripple
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const rEl = document.createElement('span');
  rEl.className = 'ripple';
  rEl.style.left = (event.clientX - rect.left - 5) + 'px';
  rEl.style.top  = (event.clientY - rect.top  - 5) + 'px';
  card.appendChild(rEl);
  setTimeout(() => rEl.remove(), 600);
  vibrateDevice([25]);
  selectMatch(mId);
}

// ==========================================
// 6. FINISHED LIST
// ==========================================
function renderFinishedList() {
  const list = document.getElementById('finishedList');
  list.innerHTML = '';

  if (!appState || appState.matchHistory.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏁</span>
        <div class="empty-title">ยังไม่มีผล</div>
        <div class="empty-sub">ผลการแข่งขันจะแสดงที่นี่เมื่อแมตช์จบแล้ว</div>
      </div>`;
    return;
  }

  const reversedHistory = [...appState.matchHistory].reverse();
  reversedHistory.forEach(m => {
    const rWon = m.rStat === 'W', bWon = m.bStat === 'W';
    const resultColor = rWon ? 'var(--red)' : bWon ? 'var(--blue)' : 'var(--gold)';
    const [g1r, g1b] = (m.game1 || '0:0').split(':');
    const [g2r, g2b] = (m.game2 || '0:0').split(':');
    // cleaned + escaped, like formatNames: no "(G2)" suffixes on a phone
    const _nm = s => String(s || '').split(' & ').map(n => _uEsc(n.replace(/\s*\(G\d\)/g, '').trim()));
    const [rP1, rP2] = _nm(m.redNames);
    const [bP1, bP2] = _nm(m.blueNames);
    // the losing side's score is a quieter shade of its colour, not a see-through one: 40% opacity was
    // 1.9-2.1:1 on the card; these are 4.6-5.1:1 and the 🏆 + the result badge still say who won
    const rScoreColor = rWon ? 'var(--red)'  : bWon ? '#c86464' : 'var(--red)';
    const bScoreColor = bWon ? 'var(--blue)' : rWon ? '#5090d0' : 'var(--blue)';
    // one malformed history row must not take down the whole list
    const resultLabel = _uEsc(_uResultLabel(m));

    list.innerHTML += `
      <div class="finished-card" style="border-color:${rWon ? 'rgba(255,77,77,0.22)' : bWon ? 'rgba(77,159,255,0.22)' : 'rgba(240,192,64,0.22)'};">
        <div class="finished-header">
          <div style="font-family:'Bebas Neue';font-size:1.5em;color:var(--gold);letter-spacing:2px;">${m.id} <small style="font-family:'Noto Sans Thai',sans-serif;font-size:0.6em;letter-spacing:0;color:var(--muted);">รอบ ${m.round}</small></div>
          <div class="result-badge" style="background:${resultColor}18;color:${resultColor};border:1px solid ${resultColor}44;">${resultLabel}</div>
        </div>
        <div class="score-grid" style="margin-bottom:6px;">
          <div class="score-grid-header">ทีม</div>
          <div class="score-grid-header">เกม 1</div>
          <div class="score-grid-header">เกม 2</div>
        </div>
        <div class="score-grid" style="margin-bottom:8px;">
          <div class="score-team-cell" style="background:rgba(255,77,77,0.08);border:1px solid rgba(255,77,77,0.18);">
            <div class="team-dot red"></div>
            <div>
              <div style="color:var(--red);font-size:0.95rem;">${rP1||''}${rWon?' 🏆':''}</div>
              ${rP2 ? `<div style="color:var(--red);font-size:0.85rem;font-weight:600;">${rP2}</div>` : ''}
            </div>
          </div>
          <div class="score-num-cell" style="background:rgba(255,77,77,0.08);color:${rScoreColor};">${g1r}</div>
          <div class="score-num-cell" style="background:rgba(255,77,77,0.08);color:${rScoreColor};">${g2r}</div>
        </div>
        <div class="score-grid">
          <div class="score-team-cell" style="background:rgba(77,159,255,0.08);border:1px solid rgba(77,159,255,0.18);">
            <div class="team-dot blue"></div>
            <div>
              <div style="color:var(--blue);font-size:0.95rem;">${bP1||''}${bWon?' 🏆':''}</div>
              ${bP2 ? `<div style="color:var(--blue);font-size:0.85rem;font-weight:600;">${bP2}</div>` : ''}
            </div>
          </div>
          <div class="score-num-cell" style="background:rgba(77,159,255,0.08);color:${bScoreColor};">${g1b}</div>
          <div class="score-num-cell" style="background:rgba(77,159,255,0.08);color:${bScoreColor};">${g2b}</div>
        </div>
        ${m.umpire ? `<div class="finished-umpire">👔 กรรมการ: ${_uEsc(m.umpire)}</div>` : ''}
      </div>`;
  });
}

// ==========================================
// 7. SCORING SYSTEM
// ==========================================
// ── COURT — "which court is this match on?" ────────────────────────────
// The umpire is standing at the court, so they say so — once, when they take the match — and
// every screen then shows "คอร์ต N" instead of making viewers match a card to a court by guesswork.
// Courts already in use show the match on them; choosing one anyway asks first (it can be a match
// nobody closed, and a stale match must not lock a court).
const COURT_COUNT = 10;
function _courtTakenBy(n, exceptId) {
  return (appState.ongoingMatches || []).find(x => x.id !== exceptId && x.umpire && Number(x.court) === n) || null;
}
function showCourtPicker(m, current, cancelLabel) {
  return new Promise(resolve => {
    _modalResolve = resolve;            // _modalDone(n) resolves it: a court number, or 0 to cancel
    document.getElementById('modalIcon').textContent = '🏸';
    document.getElementById('modalTitle').textContent = `${m.id} แข่งที่คอร์ตไหน?`;
    document.getElementById('modalBody').textContent = 'แตะเลขคอร์ตที่คุณคุมอยู่';
    const chips = [];
    for (let n = 1; n <= COURT_COUNT; n++) {
      const other = _courtTakenBy(n, m.id);
      chips.push(`<button type="button" class="court-chip${n === current ? ' on' : ''}${other ? ' taken' : ''}" onclick="_modalDone(${n})" aria-label="คอร์ต ${n}${other ? ' มี ' + _uEsc(other.id) + ' อยู่' : ''}">${n}${other ? `<small>${_uEsc(other.id)}</small>` : ''}</button>`);
    }
    const preview = document.getElementById('modalScorePreview');
    preview.innerHTML = `<div class="court-grid">${chips.join('')}</div>`;
    preview.style.display = 'block';
    document.getElementById('modalBox').classList.add('is-courts');   // wide + short layout on a landscape phone
    const btns = document.getElementById('modalBtns');
    btns.className = 'modal-btns';
    btns.innerHTML = `<button class="modal-btn modal-btn-cancel" data-safe onclick="_modalDone(0)">${_uEsc(cancelLabel || 'ยกเลิก')}</button>`;
    _modalOpen(0);
  });
}
// picker + the "this court already has a match" check; resolves to a court number, or 0 when cancelled
async function chooseCourt(m, current, cancelLabel) {
  for (;;) {
    const n = await showCourtPicker(m, current, cancelLabel);
    if (!n) return 0;
    const other = _courtTakenBy(n, m.id);
    if (!other) return n;
    const ok = await showConfirm('⚠️', `คอร์ต ${n} มีแมตช์อยู่แล้ว`,
      `${other.id} ยังอยู่ในคอร์ตนี้\nถ้าจบไปแล้ว ให้แจ้งทีมงานปิดแมตช์นั้น\nใช้คอร์ต ${n} ต่อไหม?`,
      { confirmLabel: `ใช้คอร์ต ${n}`, cancelLabel: 'เลือกใหม่' });
    if (ok) return n;
    current = n;
  }
}
// tap the court badge on the scoring screen to change it (picked the wrong one)
async function changeCourt() {
  const m = appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!m || _isConfirming) return;
  const n = await chooseCourt(m, m.court);
  if (!n || n === m.court) return;
  m.court = n;
  renderGameUI();
  _umpMutate(activeMatchId, cur => { if (cur.umpire !== currentUmpire) return false; cur.court = n; }).then(r => { if (!r.ok) _uWriteFailed(r.reason, 'เลขคอร์ต'); });
}
// top bar text: "คอร์ต 3 · M05 | ชื่อกรรมการ" — the court part is the button that changes it
let _matchInfoKey = '';
function setMatchInfo(m) {
  const el = document.getElementById('activeMatchInfo');
  if (!el || !m) return;
  const key = `${m.id}|${m.court || ''}|${currentUmpire}`;
  if (key === _matchInfoKey && el.firstChild) return;   // runs on every data update; don't rebuild under a finger
  _matchInfoKey = key;
  const court = m.court ? `คอร์ต ${m.court}` : 'เลือกคอร์ต';
  el.innerHTML = `<button type="button" class="court-edit${m.court ? '' : ' empty'}" onclick="changeCourt()" aria-label="${m.court ? 'เปลี่ยนเลขคอร์ต (ตอนนี้คอร์ต ' + m.court + ')' : 'เลือกคอร์ต'}"><span class="ce-pill">${court} ✎</span></button><span class="mi-rest">${_uEsc(m.id)} | ${_uEsc(currentUmpire)}</span>`;
}

async function selectMatch(mId) {
  let m = appState.ongoingMatches.find(x => x.id === mId);
  if (!m) return;
  if (m.umpire && m.umpire !== currentUmpire) {
    showAlert('🔒', `${m.umpire} คุมแมตช์ ${m.id} อยู่`, 'ถ้าต้องรับช่วงต่อ ให้ติดต่อทีมงาน', 'กลับ');
    return;
  }
  // A second match while one is still yours is allowed (some umpires run two courts) but is rarely what a
  // tap on the wrong card means, so it asks once before taking it. Resuming your own match never asks.
  if (!m.umpire) {
    const held = appState.ongoingMatches.filter(x => x.id !== mId && x.umpire === currentUmpire);
    if (held.length) {
      const more = await showConfirm('❓', `คุณคุม ${held.map(x => x.id).join(', ')} อยู่แล้ว`,
        `รับ ${mId} เพิ่มอีกแมตช์จริงไหม?`, { confirmLabel: 'รับเพิ่ม', cancelLabel: 'กลับ' });
      if (!more) return;
      m = appState.ongoingMatches.find(x => x.id === mId);          // the data moved while the dialog was open
      if (!m) return;
      if (m.umpire && m.umpire !== currentUmpire) { _uTakenFirst(m.umpire); return; }
    }
  }
  // Which court? Asked once, BEFORE the match is claimed: choosing the court is the step that takes
  // the match, and a cancelled tap changes nothing. A match that already has a court (your own,
  // resumed) skips this.
  let court = 0;
  if (!m.court) {
    // a match claimed before courts existed is already yours: "skip" lets you carry on scoring
    // (the header still says "เลือกคอร์ต"); for a free match, cancelling means you did not take it
    const mine = m.umpire === currentUmpire;
    court = await chooseCourt(m, 0, mine ? 'ข้ามไปก่อน' : 'ยกเลิก');
    if (!court && !mine) return;
    m = appState.ongoingMatches.find(x => x.id === mId);          // the data moved while the dialog was open
    if (!m) return;
    if (m.umpire && m.umpire !== currentUmpire) { _uTakenFirst(m.umpire); return; }
  }
  activeMatchId = mId;
  localStorage.setItem('bdm_umpire_match', mId);
  _uClosedShown = false;

  // Claim it. Shown right away; the transaction refuses if another umpire
  // claimed it first (two phones tapping the same free match used to both win).
  const claimedAt = Date.now();
  const blankLive = { g1R:0, g1B:0, g2R:0, g2B:0, g1Locked:false, isPaused:false, elapsedMs:0 };
  m.umpire = currentUmpire;
  if (!m.live) m.live = { ...blankLive };
  if (!m.claimedAt) m.claimedAt = claimedAt;
  if (court) m.court = court;
  // no timerStartedAt here: the match is "พร้อมแข่ง" until the first point starts its clock
  let takenBy = '';
  _umpMutate(mId, cur => {
    if (cur.umpire && cur.umpire !== currentUmpire) { takenBy = cur.umpire; return false; }
    takenBy = '';
    cur.umpire = currentUmpire;
    if (!cur.live) cur.live = { ...blankLive };
    if (!cur.claimedAt) cur.claimedAt = claimedAt;
    if (court) cur.court = court;
  }).then(r => {
    if (r.ok) return;
    if (r.reason === 'refused' && takenBy) {
      _uTakenFirst(takenBy).then(() => exitMatch());
    } else {
      _uWriteFailed(r.reason, 'การรับแมตช์');
    }
  });

  document.getElementById('umpireNav').style.display = 'none';
  setMatchInfo(m);
  document.getElementById('redNames').innerHTML  = scoringNamesHtml(m, 'red');
  document.getElementById('blueNames').innerHTML = scoringNamesHtml(m, 'blue');

  isGame2 = m.live.g1Locked;
  _lastScored = null;
  // a brand-new match (no scores yet) gets a 3s VS intro; resuming one does not
  const fresh = !(m.live.g1Locked || m.live.g1R || m.live.g1B || m.live.g2R || m.live.g2B);
  renderGameUI();
  switchScreen('screen-scoring');
  requestWakeLock();
  if (fresh) showVsIntro(m);
  // Auto-request fullscreen when entering scoring
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    setTimeout(() => toggleFullScreen(), 400);
  }
}

// Two taps on the same button closer than TAP_GATE.sameSideMs (umpire/tap-gate.js, 400 ms) count once.
// The old guard was 90 ms: it caught a finger bounce but not a person's double-tap (150-300 ms), while real
// points are seconds apart. Taps are never held back for the server: the first one counts at once and shows
// at once; the gate only drops the repeat, and says so (a long double buzz and a blink of the number —
// the "+1" buzz is one short pulse, the "−" buzz two quick ones, so the three can be told apart by feel).
const _tapState = {};
const TAP_IGNORED_BUZZ = [45, 55, 45];
function _tapIgnored(team) {
  vibrateDevice(TAP_IGNORED_BUZZ);
  const el = document.getElementById(team === 'red' ? 'scoreRed' : 'scoreBlue');
  if (el) { el.classList.remove('ignored'); void el.offsetWidth; el.classList.add('ignored'); }
}

function addRipple(el, e) {
  const rect = el.getBoundingClientRect();
  const rEl = document.createElement('span');
  rEl.className = 'ripple';
  const x = e ? (e.clientX - rect.left - 6) : (rect.width / 2 - 6);
  const y = e ? (e.clientY - rect.top  - 6) : (rect.height / 2 - 6);
  rEl.style.left = x + 'px';
  rEl.style.top  = y + 'px';
  el.appendChild(rEl);
  setTimeout(() => rEl.remove(), 600);
}

function updateScore(team, delta, event) {
  const now = Date.now();

  if (_isConfirming) return;              // result is being submitted
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live || match.live.isPaused) return;

  const gameKey = !isGame2
    ? (team === 'red' ? 'g1R' : 'g1B')
    : (team === 'red' ? 'g2R' : 'g2B');
  const curVal = Number(match.live[gameKey] || 0);
  if (delta < 0 && curVal <= 0) return;   // nothing to take back

  // the repeat of a tap that already counted (checked last, so a tap that could not count anyway
  // never starts a gate window)
  if (!tapGate(_tapState, team + delta, now).ok) { _tapIgnored(team); return; }

  if (!_uOnline) _uOfflinePoints++;

  // Ripple on button
  const btnId = delta > 0
    ? (team === 'red' ? 'btnRedPlus'  : 'btnBluePlus')
    : (team === 'red' ? 'btnRedMinus' : 'btnBlueMinus');
  const btnEl = document.getElementById(btnId);
  if (btnEl) addRipple(btnEl, event);

  // remember who just scored → "just scored" glow + next server.
  // a −1 correction leaves the last-scored read unchanged.
  if (delta === 1) _lastScored = team;

  // Vibrate
  if (delta === 1) vibrateDevice([22]);
  else vibrateDevice([12, 8, 12]);

  // The first point starts the match clock; any pause taken before it was not play, so it is forgotten.
  // live.lastAt marks the last sign of life — it is what the "no activity" tag measures.
  const startsClock = delta > 0 && !match.timerStartedAt;

  // Optimistic UI — shown now; the transaction below is the source of truth
  match.live[gameKey] = Math.max(0, curVal + delta);
  match.live.lastAt = now;
  if (startsClock) { match.timerStartedAt = now; match.live.totalPauseMs = 0; }
  checkEpicPossible(match);
  renderGameUI();

  // one transaction on this match (point + comeback flags together), found by id
  _umpMutate(activeMatchId, cur => {
    if (cur.umpire !== currentUmpire) return false;   // released by an admin / taken by someone else: never write into it
    cur.live = cur.live || {};
    if (cur.live.isPaused) return false;
    cur.live[gameKey] = Math.max(0, Number(cur.live[gameKey] || 0) + delta);
    cur.live.lastAt = now;
    if (delta > 0 && !cur.timerStartedAt) { cur.timerStartedAt = now; cur.live.totalPauseMs = 0; }
    checkEpicPossible(cur);
  }).then(r => {
    if (r.ok) return;
    const mId = activeMatchId, g2 = isGame2;
    _uWriteFailed(r.reason, 'คะแนนล่าสุด', () => _retryPoint(mId, gameKey, delta, curVal, g2), () => _uSeenScore(mId, g2));
  });

  // Score pop animation
  const elId = team === 'red' ? 'scoreRed' : 'scoreBlue';
  const el = document.getElementById(elId);
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

// Undo removed — a −1 tap on the panel corrects a mis-score, and an admin
// can fix a submitted result on the scoreboard.

function checkEpicPossible(match) {
  if (!match.live) return;
  if (!match.potFlags) match.potFlags = {};
  const g1r = Number(match.live.g1R||0), g1b = Number(match.live.g1B||0);
  const g2r = Number(match.live.g2R||0), g2b = Number(match.live.g2B||0);
  if (!match.potFlags.g1B_pot && g1r>=17 && (g1r-g1b)>=4) match.potFlags.g1B_pot=true;
  if (!match.potFlags.g1R_pot && g1b>=17 && (g1b-g1r)>=4) match.potFlags.g1R_pot=true;
  if (!match.potFlags.g2B_pot && g2r>=17 && (g2r-g2b)>=4) match.potFlags.g2B_pot=true;
  if (!match.potFlags.g2R_pot && g2b>=17 && (g2b-g2r)>=4) match.potFlags.g2R_pot=true;
}

function renderGameUI() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live) return;   // no live data: given back to the queue, or our claim has not arrived yet
  setMatchInfo(match);   // an admin may have set / changed the court from the other app

  document.getElementById('scoreRed').textContent  = isGame2 ? (match.live.g2R||0) : (match.live.g1R||0);
  document.getElementById('scoreBlue').textContent = isGame2 ? (match.live.g2B||0) : (match.live.g1B||0);

  const paused = match.live && match.live.isPaused;
  const btnPause = document.getElementById('btnPause');
  if (paused) {
    btnPause.innerHTML = '▶ เล่นต่อ';
    btnPause.classList.add('paused');
  } else {
    btnPause.innerHTML = '⏸ พัก';
    btnPause.classList.remove('paused');
  }
  // Update landscape pause button
  const liPause = document.getElementById('liPauseBtn');
  if (liPause) liPause.textContent = paused ? '▶ เล่นต่อ' : '⏸ พัก';

  const g1r = Number(match.live.g1R||0), g1b = Number(match.live.g1B||0);
  const g2r = Number(match.live.g2R||0), g2b = Number(match.live.g2B||0);
  const curR = isGame2 ? g2r : g1r, curB = isGame2 ? g2b : g1b;

  // the pause screen follows the match state, so it also appears when the match is entered while paused
  // or paused / resumed from another device with the same name; it shows the score so a break never hides it
  const pauseOv = document.getElementById('pauseOverlay');
  if (pauseOv) pauseOv.classList.toggle('show', !!paused);
  const pauseScore = document.getElementById('pauseScore');
  if (pauseScore) pauseScore.textContent = `${curR} – ${curB}`;

  // single submit button — label + ready state follow the current game (ส่งผลเกม 1 / ส่งผลแมตช์).
  // muted until the game reads as a valid finish (still tappable: warn-then-allow)
  const submitBtn = document.getElementById('btnSubmitGame');
  if (submitBtn) {
    submitBtn.disabled = _isConfirming;
    submitBtn.textContent = _isConfirming ? '⏳ กำลังส่งผล…' : (isGame2 ? 'ส่งผลแมตช์' : 'ส่งผลเกม 1');
    submitBtn.classList.toggle('is-ready', !_isConfirming && isValidBadmintonScore(curR, curB));
  }

  // the whole half-screen is the +1 button — say so, but only at 0–0
  const scr = document.getElementById('screen-scoring');
  if (scr) scr.classList.toggle('fresh-game', curR === 0 && curB === 0);

  // landscape game label
  const liInd = document.getElementById('liGameInd');
  if (liInd) liInd.textContent = isGame2 ? 'เกม 2' : 'เกม 1';

  // Game 1 recap line, shown only during game 2
  const g1Line = document.getElementById('g1Line');
  if (g1Line) {
    if (isGame2) { g1Line.style.display = 'block'; g1Line.textContent = `เกม 1 · ${g1r}–${g1b}`; }
    else g1Line.style.display = 'none';
  }

  // game chip carries the deuce / game-point read inline (no floating badge)
  const chip = document.getElementById('gameIndicator');
  if (chip) {
    const sit = gameSituation(curR, curB);
    chip.classList.remove('gp-red', 'gp-blue', 'deuce');
    if (!sit) {
      chip.textContent = isGame2 ? 'เกม 2' : 'เกม 1';
    } else if (sit.type === 'deuce') {
      chip.textContent = 'DEUCE'; chip.classList.add('deuce');
    } else {
      chip.textContent = (sit.side === 'red' ? '🔴' : '🔵') + ' GAME POINT';
      chip.classList.add(sit.side === 'red' ? 'gp-red' : 'gp-blue');
    }
  }

  // steady glow on the side that just scored (also = who serves next)
  const rp = document.getElementById('redPanel'), bp = document.getElementById('bluePanel');
  if (rp) rp.classList.toggle('scored', _lastScored === 'red');
  if (bp) bp.classList.toggle('scored', _lastScored === 'blue');
}

// ==========================================
// 8. GAME CONTROLS
// ==========================================
function isValidBadmintonScore(a, b) {
  if (a < 0 || b < 0) return false;
  const winner = Math.max(a,b), loser = Math.min(a,b);
  if (winner < 21) return false;
  if (winner === 30 && loser === 29) return true;
  if (winner > 30 || loser > 29) return false;
  if (winner - loser < 2) return false;
  return true;
}

// the short reason a game score does not look like a finished game (label: "เกม 1"); null = it does
function scoreValidationMsg(a, b, label) {
  if (a < 0 || b < 0) return `${label}: คะแนนติดลบไม่ได้`;
  const winner = Math.max(a,b), loser = Math.min(a,b);
  if (winner < 21) return `${label}: ยังไม่ถึง 21 คะแนน`;
  if (winner - loser < 2) return `${label}: ต้องนำห่างอย่างน้อย 2 คะแนน`;
  if (winner > 30 || (winner === 30 && loser !== 29)) return `${label}: คะแนนสูงสุดคือ 30–29`;
  return null;
}

// What two game scores are worth: 3 points to the winner of the match, 1 each for a draw — the decision the
// stored result has always carried (pRed / pBlue / rStat / bStat / resText are byte for byte what the inline
// code produced; resText stays English because the scoreboard, reports and PDF read it) — plus `label`,
// the same thing in Thai for the umpire. A "Point Diff" branch that used to follow could never run:
// the two sides' half-wins always add up to 2, so a tie there is always 1 – 1.
function _uOutcome(g1r, g1b, g2r, g2b) {
  let rWin = 0, bWin = 0, rGames = 0, bGames = 0;
  if (g1r > g1b) { rWin++; rGames++; } else if (g1b > g1r) { bWin++; bGames++; } else { rWin += 0.5; bWin += 0.5; }
  if (g2r > g2b) { rWin++; rGames++; } else if (g2b > g2r) { bWin++; bGames++; } else { rWin += 0.5; bWin += 0.5; }
  const side = (name, games) => games === 2 ? `ทีม${name}ชนะ 2–0` : `ทีม${name}ชนะ 1–0 · อีกเกมเสมอ`;   // a tied game only exists in a walk-over
  if (rWin > bWin) return { pRed: 3, pBlue: 0, rStat: 'W', bStat: 'L', resText: '🔴 Red Win 2–0 (+3pts)',  label: `${side('แดง', rGames)} (+3 คะแนน)` };
  if (bWin > rWin) return { pRed: 0, pBlue: 3, rStat: 'L', bStat: 'W', resText: '🔵 Blue Win 2–0 (+3pts)', label: `${side('น้ำเงิน', bGames)} (+3 คะแนน)` };
  return { pRed: 1, pBlue: 1, rStat: 'D', bStat: 'D', resText: '🤝 เสมอ 1–1 (+1pt each)', label: `${rGames === 1 && bGames === 1 ? 'เสมอ 1–1' : 'เสมอ'} (ทีมละ +1 คะแนน)` };
}

// The badge on a finished card, in Thai, worked out from the two game scores. When the stored points do not
// agree with the scores (an admin corrected the result by hand) or the scores are missing, the stored text is
// shown as it is (minus its emoji) — it is never "corrected" here.
function _uResultLabel(h) {
  const g = s => String(s || '').split(':').map(Number);
  const [a, b] = g(h.game1), [c, d] = g(h.game2);
  if ([a, b, c, d].every(Number.isFinite)) {
    const o = _uOutcome(a, b, c, d);
    if (o.rStat === h.rStat && o.pRed === Number(h.pRed) && o.pBlue === Number(h.pBlue)) return o.label;
  }
  return String(h.result || '').replace(/[🔴🔵🤝]/g, '').trim();
}

// The score box in the submit boxes: each game as "21 – 15" with the sides named under it (colour is never the
// only cue), and — when given — the result that sending will record, in words.
function _scorePreviewHtml(games, resultLabel) {
  const cell = g => `<div class="modal-score-game"><div class="modal-score-label">${g.label}</div>
      <div class="modal-score-val"><span style="color:var(--red)">${g.r}</span><span class="msv-dash">–</span><span style="color:var(--blue)">${g.b}</span></div>
      <div class="modal-score-sides"><span style="color:var(--red)">แดง</span> – <span style="color:var(--blue)">น้ำเงิน</span></div></div>`;
  return `<div class="modal-score-preview">${games.map(cell).join('<div class="modal-score-sep">·</div>')}</div>`
    + (resultLabel ? `<div class="modal-result"><small>ผลที่จะบันทึก</small>${_uEsc(resultLabel)}</div>` : '');
}

// Single SUBMIT button dispatches by game: Game 1 locks + advances,
// Game 2 submits the match. Both confirm in a modal first.
function submitGame() {
  if (isGame2) confirmMatch();
  else lockGame1();
}

async function lockGame1() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live || match.live.isPaused) return;

  const g1r = Number(match.live.g1R || 0);
  const g1b = Number(match.live.g1B || 0);
  // a score that does not look like a finished game (walk-over / injury / short game) warns but never blocks
  const warn = scoreValidationMsg(g1r, g1b, 'เกม 1');
  if (warn) vibrateDevice([60, 30, 60]);

  // says that it cannot be undone from here (an admin fixes it), shows what is being sent, names the sides
  const ok = await showConfirm('🏁', 'ส่งผลเกม 1?',
    (warn ? `⚠️ ${warn}\nส่งต่อได้ ถ้าเป็นการยอมแพ้หรือบาดเจ็บ\n` : '') + 'ส่งแล้วแก้เกม 1 เองไม่ได้\nจากนั้นเริ่มเกม 2 ทันที', {
    scoreHtml: _scorePreviewHtml([{ label: 'เกม 1', r: g1r, b: g1b }]),
    confirmLabel: 'ส่งผลเกม 1',
    confirmClass: 'modal-btn-confirm',
    cancelLabel: 'กลับไปแก้'
  });

  if (ok) {
    const at = Date.now();
    match.live.g1Locked = true;
    match.live.lastAt = at;
    isGame2 = true;
    _lastScored = null;   // new game — no last point / server yet
    vibrateDevice([40, 30, 60]);
    renderGameUI();
    _umpMutate(activeMatchId, cur => { if (cur.umpire !== currentUmpire) return false; cur.live = cur.live || {}; cur.live.g1Locked = true; cur.live.lastAt = at; })
      .then(r => { if (!r.ok) _uWriteFailed(r.reason, 'ผลเกม 1'); });
  }
}

function togglePause() {
  const match = appState.ongoingMatches.find(m => m.id === activeMatchId);
  if (!match || !match.live) return;

  if (match.live.isPaused) {
    // ── Resume ──
    const now = Date.now();
    const pauseStart = _localPauseStart || match.live.pauseStartedAt || now;
    const pausedFor  = now - pauseStart;
    match.live.totalPauseMs   = (match.live.totalPauseMs || 0) + pausedFor;
    match.live.pauseStartedAt = null;
    match.live.isPaused       = false;
    // ไม่ต้อง reset timerStartedAt — match timer วิ่งต่อเนื่องตลอดตั้งแต่ต้น
    _localPauseStart           = null;
    vibrateDevice([30]);

    // Reset pause display ให้พร้อมสำหรับ session ถัดไป
    const bigEl   = document.getElementById('pauseTimerBig');
    const totalEl = document.getElementById('pauseTimerTotal');
    if (bigEl)   bigEl.textContent   = '0:00';
    if (totalEl) totalEl.textContent = formatTimer(match.live.totalPauseMs);

    document.getElementById('pauseOverlay').classList.remove('show');
  } else {
    // ── Pause ──
    const now = Date.now();
    match.live.isPaused       = true;
    match.live.pauseStartedAt = now;
    _localPauseStart           = now;
    vibrateDevice([50, 30, 50]);

    // แสดง total ที่สะสมก่อนหน้า ณ ตอนเริ่ม pause
    const totalEl = document.getElementById('pauseTimerTotal');
    if (totalEl) totalEl.textContent = formatTimer(match.live.totalPauseMs || 0);

    document.getElementById('pauseOverlay').classList.add('show');
  }

  // write just the pause fields, on this match (found by id); pausing and resuming both count as activity
  match.live.lastAt = Date.now();
  const pausePatch = {
    isPaused:       !!match.live.isPaused,
    pauseStartedAt: match.live.pauseStartedAt || null,
    totalPauseMs:   match.live.totalPauseMs || 0,
    lastAt:         match.live.lastAt,
  };
  _umpMutate(activeMatchId, cur => { if (cur.umpire !== currentUmpire) return false; cur.live = cur.live || {}; Object.assign(cur.live, pausePatch); })
    .then(r => { if (!r.ok) _uWriteFailed(r.reason, match.live.isPaused ? 'สถานะพัก' : 'สถานะเล่นต่อ'); });
  renderGameUI();
}

function exitMatch() {
  releaseWakeLock();
  activeMatchId = '';
  _uOwned = '';
  const pauseOv = document.getElementById('pauseOverlay');
  if (pauseOv) pauseOv.classList.remove('show');   // leaving while paused: the break screen must not stay over the list
  localStorage.removeItem('bdm_umpire_match');
  // Exit fullscreen on leave
  const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
  if (exitFs && (document.fullscreenElement || document.webkitFullscreenElement)) {
    exitFs.call(document).catch(() => {});
  }
  goToTab('live');
}

// ถามยืนยันก่อนออก (กันแตะพลาดตอนคุมคะแนน). What it says follows the real state: "saved" is only true when
// the phone is online and nothing is waiting to be sent — it used to say "saved" even offline, under a red
// bar saying the opposite.
async function confirmExit() {
  const m = appState && appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!activeMatchId || !m) { exitMatch(); return; }   // nothing is being scored: there is nothing to confirm
  const score = m && m.live ? `แดง ${isGame2 ? (m.live.g2R || 0) : (m.live.g1R || 0)} – ${isGame2 ? (m.live.g2B || 0) : (m.live.g1B || 0)} น้ำเงิน` : '';
  const offline = !_uOnline && (_uEverOnline || Date.now() - _uLoadedAt > 3000);
  const waiting = offline || _uPending > 0;
  const ok = waiting
    ? await showConfirm('📶', 'ออกตอนที่ยังส่งไม่ครบ?',
        `${_uPending > 0 ? `ยังมี ${_uPending} รายการรอส่ง` : 'ตอนนี้ไม่มีสัญญาณ'}\nอย่าปิดหน้านี้จนกว่าสัญญาณกลับ\nระบบจะส่งต่อเองเมื่อสัญญาณกลับ`,
        { confirmLabel: 'ออกทั้งที่ยังไม่ส่ง', confirmClass: 'modal-btn-danger', cancelLabel: 'อยู่ต่อ' })
    : await showConfirm('🚪', 'ออกจากหน้านี้?',
        `คะแนน ${score} ถูกบันทึกแล้ว\nแตะ ▶ คุมต่อ ที่รายการเพื่อกลับมา`,
        { confirmLabel: 'ออก', confirmClass: 'modal-btn-danger', cancelLabel: 'อยู่ต่อ' });
  if (ok) exitMatch();
}

// (editGame1 removed — umpire confirms in the modal before submit; a wrong
//  result is corrected by an admin on the scoreboard.)

// สถานการณ์เกมปัจจุบัน: deuce / game point (แบด 21, cap 30)
function gameSituation(a, b) {
  a = Number(a || 0); b = Number(b || 0);
  // Game point wins the priority: a one-point lead at 20+ means the leader
  // scores next to win, so it is game point, not deuce. The old order put
  // the deuce test (|a-b| < 2) first, so 21-20 / 29-28 wrongly read DEUCE.
  const isGP = (s, o) => { const n = s + 1; return (n >= 21 && n - o >= 2) || n === 30; };
  const redGP = isGP(a, b), blueGP = isGP(b, a);
  if (redGP && blueGP) return { type: 'deuce' };            // 29-29: either point wins
  if (redGP)  return { type: 'gp', side: 'red' };
  if (blueGP) return { type: 'gp', side: 'blue' };
  if (a >= 20 && b >= 20 && a === b) return { type: 'deuce' }; // 20-20..28-28 level
  return null;
}

function analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, potFlags) {
  const M1=g1r-g1b, M2=g2r-g2b, absM1=Math.abs(M1), absM2=Math.abs(M2), totalMargin=absM1+absM2, netMargin=Math.abs((g1r+g2r)-(g1b+g2b)), volatility=Math.abs(absM1-absM2), isDraw=rStat==='D';
  let status='', statusColor='';
  if(!isDraw){if(totalMargin<=5){status='Evenly Matched';statusColor='#2ecc71';}else if(totalMargin<=12){status='Competitive Edge';statusColor='#f5c842';}else if(totalMargin<=20){status='Superior';statusColor='#ff9500';}else{status='Outclassed';statusColor='#e74c3c';}}else{if(netMargin<=3){status='True Tie';statusColor='#2ecc71';}else if(netMargin<=8){status='Close Encounter';statusColor='#f5c842';}else{status='Deceptive Draw';statusColor='#ff9500';}}
  const tags=[];
  if(potFlags){if(potFlags.g1R_pot&&g1r>=21&&g1r>=g1b)tags.push({id:'epic_red_g1',label:'🔥 Epic Comeback G1 Red',class:'tag-comeback',scope:'red'});if(potFlags.g1B_pot&&g1b>=21&&g1b>=g1r)tags.push({id:'epic_blue_g1',label:'🔥 Epic Comeback G1 Blue',class:'tag-comeback',scope:'blue'});if(potFlags.g2R_pot&&g2r>=21&&g2r>=g2b)tags.push({id:'epic_red_g2',label:'🔥 Epic Comeback G2 Red',class:'tag-comeback',scope:'red'});if(potFlags.g2B_pot&&g2b>=21&&g2b>=g2r)tags.push({id:'epic_blue_g2',label:'🔥 Epic Comeback G2 Blue',class:'tag-comeback',scope:'blue'});}
  if(!isDraw&&totalMargin<=5)tags.push({id:'clutch',label:'⚔️ The Gladiators',class:'tag-clutch',scope:'all'});
  if(isDraw&&netMargin<=5)tags.push({id:'clutch',label:'⚔️ The Gladiators',class:'tag-clutch',scope:'all'});
  if((g1r + g1b >= 42)||(g2r + g2b >= 42))tags.push({id:'marathon',label:'🏃‍♂️ Marathon Match',class:'tag-custom',scope:'all'});
  if((M1>=5&&M2<=-5)||(M1<=-5&&M2>=5))tags.push({id:'rollercoaster',label:'🎢 The Rollercoaster',class:'tag-custom',scope:'all'});
  if(!isDraw&&totalMargin>=16)tags.push({id:'blowout',label:'🌪️ ยำใหญ่ (Blowout)',class:'tag-blowout',scope:rStat==='W'?'red':'blue'});
  if(M1>=7&&M2>=7)tags.push({id:'flawless_red',label:'⭐ Flawless Form',class:'tag-normal',scope:'red'});
  if(M1<=-7&&M2<=-7)tags.push({id:'flawless_blue',label:'⭐ Flawless Form',class:'tag-normal',scope:'blue'});
  let summary='';
  if(!isDraw){const winTeam=M1>0&&M2>0?'Red':'Blue';if(totalMargin<=5)summary='เกมสูสีมาก ผลแพ้ชนะขึ้นอยู่กับจังหวะ';else if(totalMargin<=12)summary=`ทีม${winTeam==='Red'?'แดง':'น้ำเงิน'}นิ่งกว่าในช่วงสำคัญ`;else if(totalMargin<=20)summary=`ทีม${winTeam==='Red'?'แดง':'น้ำเงิน'}คุมเกมได้ชัดเจน`;else summary='ห่างชั้นกันมาก';}else{if(netMargin<=3)summary='เสมอสมบูรณ์แบบ ฝีมือเท่ากัน';else if(netMargin<=8)summary='ผลเสมอ แต่มีฝ่ายกดดันได้ดีกว่า';else summary='เสมอแค่จำนวนเกม';}
  return{status,statusColor,tags,summary,totalMargin,netMargin,volatility,isDraw};
}

async function confirmMatch() {
  const m = appState.ongoingMatches.find(x => x.id === activeMatchId);
  if (!m) return;

  const g1r=Number(m.live.g1R||0), g1b=Number(m.live.g1B||0);
  const g2r=Number(m.live.g2R||0), g2b=Number(m.live.g2B||0);

  // a score that does not look like a finished game (walk-over / injury / short game) warns but never blocks
  const _warns = [scoreValidationMsg(g1r, g1b, 'เกม 1'), scoreValidationMsg(g2r, g2b, 'เกม 2')].filter(Boolean);
  if (_warns.length) vibrateDevice([60,30,60]);

  // what sending will record, worked out once: shown in the box, then written
  const { pRed, pBlue, rStat, bStat, resText, label: resLabel } = _uOutcome(g1r, g1b, g2r, g2b);

  const ok = await showConfirm('🏁', 'ส่งผลแมตช์?',
    (_warns.length ? `⚠️ ${_warns.join('\n')}\nส่งต่อได้ ถ้าเป็นการยอมแพ้หรือบาดเจ็บ\n` : '') + 'ส่งแล้วแก้เองไม่ได้\nต้องให้ทีมงานแก้', {
    scoreHtml: _scorePreviewHtml([{ label: 'เกม 1', r: g1r, b: g1b }, { label: 'เกม 2', r: g2r, b: g2b }], resLabel),
    confirmLabel: 'ส่งผลแมตช์',
    confirmClass: 'modal-btn-confirm',
    cancelLabel: 'กลับไปแก้'
  });

  if (ok) {
    // An earlier send of THIS match may still arrive (it timed out, the umpire left, it is queued in this
    // page). Sending the same scores again is safe; different scores would race it, so wait for it.
    if (_uSubmitPending && _uSubmitPending.id === m.id && (_uSubmitPending.game1 !== `${g1r}:${g1b}` || _uSubmitPending.game2 !== `${g2r}:${g2b}`)) {
      await showAlert('⏳', 'ผลก่อนหน้านี้ยังส่งค้างอยู่', `ผลที่ส่งไปก่อน (เกม 1 ${_uSubmitPending.game1.replace(':', '–')} · เกม 2 ${_uSubmitPending.game2.replace(':', '–')})\nยังส่งไม่ถึงระบบ — รอให้ส่งเสร็จก่อน แล้วค่อยแก้`);
      return;
    }
    // Finalizing needs the server: a queued offline result would be lost if the
    // phone is locked or the page closed before the signal returns.
    if (!_uOnline) {
      await showAlert('📶', 'ยังส่งผลไม่ได้', 'ไม่มีสัญญาณ — คะแนนยังอยู่ครบในเครื่องนี้\nอย่าปิดหน้านี้\nเมื่อสัญญาณกลับ กด “ส่งผลแมตช์” อีกครั้ง');
      return;
    }
    _isConfirming = true; // ป้องกัน updateCurrentScreen แสดง modal ซ้ำ
    renderGameUI();       // → "กำลังส่งผล…" on the submit button

    // time actually played: first point to now, minus the time spent paused
    // (it used to be "time since the match was taken", which counted waiting too)
    const matchDuration = matchPlayMs(m);

    const analysis = analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, m.potFlags||{});
    const entry = JSON.parse(JSON.stringify({
      id:m.id, round:m.round, r1:m.r1, r2:m.r2, b1:m.b1, b2:m.b2,
      redNames:m.redNames, blueNames:m.blueNames,
      game1:`${g1r}:${g1b}`, game2:`${g2r}:${g2b}`,
      result:resText, pRed, pBlue, rStat, bStat, duration:matchDuration,
      court:m.court,                  // undefined (no court chosen) is dropped by the JSON round trip
      analysis:{...analysis, potFlags:m.potFlags||{}},
      umpire:currentUmpire
    }));

    // history + team scores + court list, atomically, on the server's current data
    let r = await _sendResult(entry, pRed, pBlue);
    // a plain failure (not "already recorded", "not yours any more", "left") offers the retry in the box itself;
    // sending again is safe: the transaction refuses a result that is already recorded
    while (!r.ok && !['already', 'missing', 'taken', 'abandoned'].includes(r.reason)) {
      _isConfirming = false;
      renderGameUI();
      const again = await showConfirm('⚠️', 'ส่งผลไม่สำเร็จ', 'คะแนนยังอยู่ครบในเครื่องนี้\nตรวจสัญญาณแล้วลองส่งอีกครั้ง\nถ้ายังไม่ได้ แจ้งทีมงาน',
        { confirmLabel: 'ลองส่งอีกครั้ง', cancelLabel: 'ปิด' });
      if (!again) return;
      _isConfirming = true;
      renderGameUI();
      r = await _sendResult(entry, pRed, pBlue);
    }
    const sameResult = r.existing && r.existing.game1 === entry.game1 && r.existing.game2 === entry.game2;

    if (r.ok || (r.reason === 'already' && sameResult)) {
      vibrateDevice([60, 40, 60, 40, 120]);
      await showAlert('✅', 'ส่งผลแล้ว ✓', `${m.id} · ${resLabel}`, 'กลับไปรายการ');
      _isConfirming = false;
      exitMatch();
    } else if (r.reason === 'already') {
      // recorded by someone else first; when their scores are not the ones pressed here, say both
      const both = x => `${String(x.game1).replace(':', '–')} · ${String(x.game2).replace(':', '–')}`;
      await showAlert('ℹ️', 'แมตช์นี้ถูกบันทึกผลไปแล้ว',
        'ทีมงานบันทึกผลไว้ก่อน — ผลจากเครื่องนี้ไม่ถูกส่งซ้ำ' + (r.existing ? `\nผลที่บันทึก ${both(r.existing)}\nต่างจากที่คุณกด ${both(entry)}\nแจ้งทีมงานหากไม่ถูกต้อง` : ''), 'กลับไปรายการ');
      _isConfirming = false;
      exitMatch();
    } else if (r.reason === 'missing') {
      // gone from the court list without a result in the history: nothing was recorded anywhere
      await showAlert('ℹ️', 'แมตช์นี้ถูกปิดไปแล้ว', 'ทีมงานปิดแมตช์นี้ไปก่อน — ผลจากเครื่องนี้จึงไม่ถูกส่ง\nถ้ายังต้องบันทึกผล แจ้งทีมงาน', 'กลับไปรายการ');
      _isConfirming = false;
      exitMatch();
    } else if (r.reason === 'taken') {
      await showAlert('🔒', 'แมตช์นี้ไม่ได้อยู่กับคุณแล้ว', 'ทีมงานปล่อยแมตช์นี้ หรือกรรมการคนอื่นรับไปแล้ว\nผลจากเครื่องนี้จึงไม่ถูกส่ง', 'กลับไปรายการ');
      _isConfirming = false;
      exitMatch();
    } else {
      _isConfirming = false;     // 'abandoned': left with the result still pending — the page keeps trying while it stays open
      exitMatch();
    }
  }
}
