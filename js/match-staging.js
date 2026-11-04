// ── MATCH STAGING (drag-and-drop pre-planning) ──
// Draft matches live in appState.stagedMatches, NOT in ongoingMatches, so the
// public board / TV / umpire never see them (no "Next Match", no queue row).
// A draft only becomes a real queue entry when it is dragged into the
// "คิวจริง" lane (or its ▶ button is pressed) — that is when it gets an M-id.
// No validation of repeated players: drafts are freely reordered / duplicated.
//
//   stagedMatches: [{ id:'S…', court:'1', round:'1', r1, r2, b1, b2 }]  (array order = play order)
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
// No per-court split: one staging pool (the court field is kept as "1" only so
// the data shape can grow lanes later without a migration).
function _stgCourts() { return 1; }
function _stgPlayer(id) { return (appState.players || []).find(p => p.id === id); }
function _stgName(id) { const p = _stgPlayer(id); return p ? p.name : ''; }
function _stgQueue() { return (appState.ongoingMatches || []).filter(m => !m.umpire); }

function _stgNewId() { return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// ── draft CRUD ──
function stgAdd(court) {
  if (!_stgIsAdmin()) return;
  _stgList().push({ id: _stgNewId(), court: String(court), round: String(picker.round || '1'), r1: '', r2: '', b1: '', b2: '' });
  saveData(true); renderStaging(true);
}
function stgDelete(id) {
  if (!_stgIsAdmin()) return;
  appState.stagedMatches = _stgList().filter(s => s.id !== id);
  saveData(true); renderStaging(true);
}
function stgSet(id, field, val) {
  const s = _stgList().find(x => x.id === id);
  if (!s || !['r1', 'r2', 'b1', 'b2', 'round'].includes(field)) return;
  s[field] = val;
  saveData(true); renderStaging(true);
}
// ── promote a draft to the real queue ──
let _stgPromoting = false;
async function stgPromote(sid, beforeMid) {
  if (!_stgIsAdmin() || _stgPromoting) return;
  const s = _stgList().find(x => x.id === sid);
  if (!s) return;
  const ids = [s.r1, s.r2, s.b1, s.b2];
  const pl = ids.map(_stgPlayer);
  if (pl.some(p => !p)) return showToast('❌ ใส่ผู้เล่นให้ครบ 4 ช่องก่อนส่งเข้าคิวจริง', 'error');

  _stgPromoting = true;
  let n = null;
  try {
    const res = await dbRef.child('matchCounter').transaction(c => (Number(c) || 1) + 1);
    if (res.committed) n = Number(res.snapshot.val()) - 1;
  } catch (e) { console.error('matchCounter reserve failed:', e); }
  _stgPromoting = false;
  if (n === null) return showToast('❌ ส่งเข้าคิวไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่', 'error');
  if (!_stgList().some(x => x.id === sid)) return;   // removed meanwhile

  const mId = 'M' + (n < 10 ? '0' + n : n);
  const match = {
    id: mId, round: String(s.round || '1'), r1: s.r1, r2: s.r2, b1: s.b1, b2: s.b2,
    redNames:  `${pl[0].name} (G${pl[0].group}) & ${pl[1].name} (G${pl[1].group})`,
    blueNames: `${pl[2].name} (G${pl[2].group}) & ${pl[3].name} (G${pl[3].group})`
  };
  const ong = appState.ongoingMatches;
  const at = beforeMid ? ong.findIndex(m => m.id === beforeMid) : -1;
  if (at >= 0) ong.splice(at, 0, match); else ong.push(match);
  appState.matchCounter = Math.max(Number(appState.matchCounter) || 0, n + 1);
  appState.stagedMatches = _stgList().filter(x => x.id !== sid);
  saveData(true); renderStaging(true);
  showToast(`✅ ${mId} เข้าคิวจริงแล้ว`, 'success');
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

// move a draft to a court lane, before another draft (or at the end)
function stgMoveDraft(sid, court, beforeSid) {
  const list = _stgList();
  const from = list.findIndex(x => x.id === sid);
  if (from < 0 || sid === beforeSid) return;
  const [s] = list.splice(from, 1);
  s.court = String(court);
  let at = beforeSid ? list.findIndex(x => x.id === beforeSid) : -1;
  if (at < 0) {
    let last = -1; list.forEach((x, i) => { if (String(x.court) === String(court)) last = i; });
    at = last >= 0 ? last + 1 : list.length;
  }
  list.splice(at, 0, s);
  saveData(true); renderStaging(true);
}

// ── render ──
function _stgSelect(s, field, team) {
  const color = team === 'Red' ? 'red' : 'blue';
  const opts = (appState.players || []).filter(p => p.team === team)
    .map(p => `<option value="${p.id}"${s[field] === p.id ? ' selected' : ''}>${escHtml(p.name)} (G${p.group})</option>`).join('');
  return `<select class="stg-sel ${color}" onchange="stgSet('${s.id}','${field}',this.value)"><option value="">— เลือก —</option>${opts}</select>`;
}

function _stgDraftCard(s) {
  const full = [s.r1, s.r2, s.b1, s.b2].every(x => x && _stgPlayer(x));
  return `<div class="stg-card" data-kind="staged" data-id="${s.id}">
    <div class="stg-card-head">
      <span class="stg-grip" onpointerdown="stgDragStart(event,'staged','${s.id}')" title="ลากเพื่อสลับคิว">⠿</span>
      <select class="stg-round" onchange="stgSet('${s.id}','round',this.value)">
        ${['1', '2', '3'].map(r => `<option value="${r}"${String(s.round) === r ? ' selected' : ''}>R${r}</option>`).join('')}
      </select>
      <span class="stg-draft-tag">DRAFT</span>
      <button class="stg-ico ${full ? 'go' : ''}" onclick="stgPromote('${s.id}')" title="ส่งเข้าคิวจริง">▶</button>
      <button class="stg-ico" onclick="stgDelete('${s.id}')" title="ลบ">✕</button>
    </div>
    <div class="stg-teams">
      <div class="stg-team">${_stgSelect(s, 'r1', 'Red')}${_stgSelect(s, 'r2', 'Red')}</div>
      <span class="stg-vs">VS</span>
      <div class="stg-team">${_stgSelect(s, 'b1', 'Blue')}${_stgSelect(s, 'b2', 'Blue')}</div>
    </div>
  </div>`;
}

function _stgQueueCard(m, i) {
  const nm = str => escHtml((str || '—').split(' & ').map(n => stripGroup(n.trim())).join(' & '));
  return `<div class="stg-card stg-qcard" data-kind="queue" data-id="${m.id}">
    <div class="stg-card-head">
      <span class="stg-grip" onpointerdown="stgDragStart(event,'queue','${m.id}')" title="ลากเพื่อสลับคิว">⠿</span>
      <span class="stg-qnum">#${i + 1}</span><span class="stg-qid">${m.id}</span><span class="stg-qround">R${m.round || '?'}</span>
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
  const courts = _stgCourts();
  const sig = JSON.stringify([list, courts, q.map(m => [m.id, m.round, m.redNames, m.blueNames]), (appState.players || []).length]);
  if (!force && sig === _stgSig) return;
  _stgSig = sig;

  const lanes = [];
  for (let c = 1; c <= courts; c++) {
    const items = list.filter(s => String(s.court) === String(c) || (Number(s.court) > courts && c === courts));
    lanes.push(`<div class="stg-lane" data-lane="${c}">
      <div class="stg-lane-head"><span>🗂 แมตช์ร่าง (Staging)</span><span class="stg-count">${items.length}</span></div>
      <div class="stg-lane-body">${items.map(_stgDraftCard).join('') || '<div class="stg-empty">ว่าง — ลากการ์ดมาวางที่นี่</div>'}</div>
      <button class="stg-add" onclick="stgAdd(${c})">+ เพิ่มแมตช์</button>
    </div>`);
  }
  lanes.push(`<div class="stg-lane stg-lane-queue" data-lane="q">
    <div class="stg-lane-head"><span>🚀 คิวจริง (Next Match)</span><span class="stg-count">${q.length}</span></div>
    <div class="stg-lane-body">${q.map(_stgQueueCard).join('') || '<div class="stg-empty">ลากแมตช์จากแมตช์ร่างมาวาง = ขึ้นบอร์ดประกาศ</div>'}</div>
  </div>`);

  el.innerHTML = `
    <div class="stg-top">
      <div>
        <div class="stg-title">🗂 Match Staging <span class="stg-sub">จัดคิวล่วงหน้า — ยังไม่ขึ้นบอร์ดจนกว่าจะลากเข้า “คิวจริง”</span></div>
      </div>
    </div>
    <div class="stg-lanes">${lanes.join('')}</div>`;
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
  if (d.kind === 'queue' && laneId !== 'q') return;     // a real queue match cannot go back to drafts
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
    else stgMoveDraft(d.id, t.lane, t.before);
  } else if (t.lane === 'q') {
    stgReorderQueue(d.id, t.before);
  }
}
