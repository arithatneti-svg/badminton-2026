// ── MATCH STAGING: the waiting box ──
// Every match made in "สร้างแมตช์" lands here first (appState.stagedMatches), NOT in
// ongoingMatches, so the board / TV / umpire do not see it. The admin orders the box by
// dragging, then sends a pair to the next-match queue with "ต่อคิว" (or drags it into the
// queue lane). Nothing is validated: the same player may sit in several waiting matches.
//
//   stagedMatches: [{ id:'M07', r1, r2, b1, b2, redNames, blueNames }]  (array order = box order)
//
// Drag uses pointer events (not HTML5 DnD) so it also works by touch.

let _stgSig = '';
let _stgDrag = null;       // active drag: { kind, id, card, ghost, dx, dy, drop }
let _stgDirty = false;     // a render was skipped while dragging

function _stgIsAdmin() { return userRole === 'admin' || userRole === 'superadmin'; }
function _stgList() {
  if (!Array.isArray(appState.stagedMatches)) appState.stagedMatches = smToArr(appState.stagedMatches);
  return appState.stagedMatches;
}
function _stgPlayer(id) { return (appState.players || []).find(p => p.id === id); }
function _stgName(id) { const p = _stgPlayer(id); return p ? p.name : ''; }
function _stgQueue() { return (appState.ongoingMatches || []).filter(m => !m.umpire); }

// ── draft actions ──
function stgDelete(id) {
  if (!_stgIsAdmin()) return;
  appState.stagedMatches = _stgList().filter(s => s.id !== id);
  saveData(true); renderStaging(true);
}
// ── promote a draft to the real queue ──
function stgPromote(sid, beforeMid) {
  if (!_stgIsAdmin()) return;
  const s = _stgList().find(x => x.id === sid);
  if (!s) return;
  const pl = [s.r1, s.r2, s.b1, s.b2].map(_stgPlayer);
  if (pl.some(p => !p)) return showToast('ไม่พบข้อมูลผู้เล่นในแมตช์นี้ — ลบแล้วสร้างใหม่', 'error');
  const match = {
    id: s.id, r1: s.r1, r2: s.r2, b1: s.b1, b2: s.b2,
    redNames:  s.redNames  || `${pl[0].name} (G${pl[0].group}) & ${pl[1].name} (G${pl[1].group})`,
    blueNames: s.blueNames || `${pl[2].name} (G${pl[2].group}) & ${pl[3].name} (G${pl[3].group})`
  };
  const ong = appState.ongoingMatches;
  if (ong.some(m => m.id === match.id)) { appState.stagedMatches = _stgList().filter(x => x.id !== sid); saveData(true); return renderStaging(true); }
  const at = beforeMid ? ong.findIndex(m => m.id === beforeMid) : -1;
  if (at >= 0) ong.splice(at, 0, match); else ong.push(match);
  appState.stagedMatches = _stgList().filter(x => x.id !== sid);
  saveData(true); renderStaging(true);
  showToast(`${match.id} ต่อคิวแล้ว`, 'success');
  if (typeof playSound === 'function') playSound('match');
}

// reorder inside the real queue (only matches still waiting, i.e. no umpire)
function stgReorderQueue(mid, beforeMid) {
  const ong = appState.ongoingMatches;
  const from = ong.findIndex(m => m.id === mid);
  if (from < 0 || ong[from].umpire || mid === beforeMid) return;
  const [m] = ong.splice(from, 1);
  let at = beforeMid ? ong.findIndex(x => x.id === beforeMid) : -1;
  if (at < 0) {
    // after the last waiting match
    let last = -1; ong.forEach((x, i) => { if (!x.umpire) last = i; });
    at = last + 1;
  }
  ong.splice(at, 0, m);
  saveData(true); renderStaging(true);
}

// reorder the waiting box: put a draft before another one (or at the end)
function stgMoveDraft(sid, beforeSid) {
  const list = _stgList();
  const from = list.findIndex(x => x.id === sid);
  if (from < 0 || sid === beforeSid) return;
  const [s] = list.splice(from, 1);
  const at = beforeSid ? list.findIndex(x => x.id === beforeSid) : -1;
  if (at >= 0) list.splice(at, 0, s); else list.push(s);
  saveData(true); renderStaging(true);
}

// ── render ──
function _stgNames(str) { return escHtml((str || '—').split(' & ').map(n => stripGroup(n.trim())).join(' & ')); }

function _stgDraftCard(s, i) {
  return `<div class="stg-card" data-kind="staged" data-id="${s.id}">
    <div class="stg-card-head">
      <span class="stg-grip" onpointerdown="stgDragStart(event,'staged','${s.id}')" title="ลากเพื่อสลับลำดับ">⠿</span>
      <span class="stg-qnum">#${i + 1}</span><span class="stg-qid">${s.id}</span>
      <button type="button" class="stg-ico" style="margin-left:auto" onclick="stgDelete('${s.id}')" title="ลบ" aria-label="ลบ ${s.id}">✕</button>
    </div>
    <div class="stg-qnames"><span class="red">${_stgNames(s.redNames)}</span><span class="stg-vs">VS</span><span class="blue">${_stgNames(s.blueNames)}</span></div>
    <button type="button" class="stg-go" onclick="stgPromote('${s.id}')">ต่อคิว ▶</button>
  </div>`;
}

function _stgQueueCard(m, i) {
  const nm = str => escHtml((str || '—').split(' & ').map(n => stripGroup(n.trim())).join(' & '));
  return `<div class="stg-card stg-qcard" data-kind="queue" data-id="${m.id}">
    <div class="stg-card-head">
      <span class="stg-grip" onpointerdown="stgDragStart(event,'queue','${m.id}')" title="ลากเพื่อสลับคิว">⠿</span>
      <span class="stg-qnum">#${i + 1}</span><span class="stg-qid">${m.id}</span>
    </div>
    <div class="stg-qnames"><span class="red">${nm(m.redNames)}</span><span class="stg-vs">VS</span><span class="blue">${nm(m.blueNames)}</span></div>
  </div>`;
}

function renderStaging(force) {
  const el = document.getElementById('stagingBoard');
  if (!el || !appState || !_stgIsAdmin()) return;
  if (_stgDrag) { _stgDirty = true; return; }
  const list = _stgList();
  const q = _stgQueue();
  const sig = JSON.stringify([list, q.map(m => [m.id, m.redNames, m.blueNames]), (appState.players || []).length]);
  if (!force && sig === _stgSig) return;
  _stgSig = sig;

  el.innerHTML = `
    <div class="stg-top">
      <div class="stg-title">กล่องรอ &amp; คิว <span class="stg-sub">แมตช์ที่สร้างจะอยู่ในกล่องรอก่อน (ยังไม่ขึ้นบอร์ด) — ลากสลับลำดับได้ แล้วกด “ต่อคิว” หรือลากไปวางในคิวจริง</span></div>
    </div>
    <div class="stg-lanes">
      <div class="stg-lane" data-lane="w">
        <div class="stg-lane-head"><span>🗂 กล่องรอ</span><span class="stg-count">${list.length}</span></div>
        <div class="stg-lane-body">${list.map(_stgDraftCard).join('') || '<div class="stg-empty">ยังไม่มีแมตช์รอ — สร้างแมตช์ด้านบน แล้วจะมาอยู่ที่นี่</div>'}</div>
      </div>
      <div class="stg-lane stg-lane-queue" data-lane="q">
        <div class="stg-lane-head"><span>🚀 คิวจริง (Next Match)</span><span class="stg-count">${q.length}</span></div>
        <div class="stg-lane-body">${q.map(_stgQueueCard).join('') || '<div class="stg-empty">ลากแมตช์จากกล่องรอมาวาง หรือกด “ต่อคิว”</div>'}</div>
      </div>
    </div>`;
}

// ── drag (pointer events) ──
function stgDragStart(e, kind, id) {
  if (!_stgIsAdmin() || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  const card = e.currentTarget.closest('.stg-card');
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.classList.add('stg-ghost');
  ghost.style.cssText = `width:${r.width}px;left:${r.left}px;top:${r.top}px;`;
  document.body.appendChild(ghost);
  card.classList.add('stg-dragging');
  document.getElementById('stagingBoard').classList.add('is-dragging');
  _stgDrag = { kind, id, card, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, drop: null };
  window.addEventListener('pointermove', _stgMove);
  window.addEventListener('pointerup', _stgEnd);
  window.addEventListener('pointercancel', _stgCancel);
}

function _stgClearMarks() {
  document.querySelectorAll('#stagingBoard .drop-before,#stagingBoard .drop-after,#stagingBoard .drop-hot')
    .forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-hot'));
}

function _stgMove(e) {
  const d = _stgDrag; if (!d) return;
  d.ghost.style.left = (e.clientX - d.dx) + 'px';
  d.ghost.style.top = (e.clientY - d.dy) + 'px';
  // edge auto-scroll
  if (e.clientY < 70) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);

  _stgClearMarks();
  d.drop = null;
  const under = document.elementFromPoint(e.clientX, e.clientY);   // ghost has pointer-events:none
  const lane = under && under.closest('.stg-lane');
  if (!lane) return;
  const laneId = lane.dataset.lane;
  if (d.kind === 'queue' && laneId !== 'q') return;     // a real queue match cannot go back to the box
  const card = under.closest('.stg-card');
  if (card && card !== d.card && card.closest('.stg-lane') === lane) {
    const b = card.getBoundingClientRect();
    const before = e.clientY < b.top + b.height / 2;
    if (before) { card.classList.add('drop-before'); d.drop = { lane: laneId, before: card.dataset.id }; }
    else {
      card.classList.add('drop-after');
      const next = card.nextElementSibling;
      d.drop = { lane: laneId, before: next && next.classList.contains('stg-card') && next !== d.card ? next.dataset.id : null };
    }
  } else {
    lane.classList.add('drop-hot');
    d.drop = { lane: laneId, before: null };
  }
}

function _stgFinish() {
  const d = _stgDrag; if (!d) return null;
  window.removeEventListener('pointermove', _stgMove);
  window.removeEventListener('pointerup', _stgEnd);
  window.removeEventListener('pointercancel', _stgCancel);
  d.ghost.remove(); d.card.classList.remove('stg-dragging');
  document.getElementById('stagingBoard')?.classList.remove('is-dragging');
  _stgClearMarks();
  _stgDrag = null;
  return d;
}
function _stgCancel() { const d = _stgFinish(); if (d && _stgDirty) { _stgDirty = false; renderStaging(true); } }
function _stgEnd() {
  const d = _stgFinish(); if (!d) return;
  _stgDirty = false;
  const t = d.drop;
  if (!t) return renderStaging(true);
  if (d.kind === 'staged') {
    if (t.lane === 'q') stgPromote(d.id, t.before);
    else stgMoveDraft(d.id, t.before);
  } else if (t.lane === 'q') {
    stgReorderQueue(d.id, t.before);
  }
}
