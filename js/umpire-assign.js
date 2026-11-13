// ══════════════════════════════════════════
// UMPIRE ASSIGN (Admin tab, #uaBox) — who should umpire which waiting match.
//   1. the admin ticks the people who are free to umpire today   → umpire_2026/avail/{playerId} = true
//   2. for every queued match the panel suggests up to 3 umpires (rules: shared/umpire-assign.js)
//   3. one tap "มอบหมาย" writes m.assigned = "name" on the queued match. It is a RESERVATION shown to the umpires
//      ("จองให้ ○○"), NOT a lock: anybody can still take the match, as before.
// ══════════════════════════════════════════
const uaRef = firebase.database().ref(/[?&]uatest=1(?:&|$)/.test(location.search) ? 'umpire_test/avail' : 'umpire_2026/avail');
let _uaAvail = {}, _uaFilter = '', _uaOpen = true, _uaSig = '';

uaRef.on('value', snap => { _uaAvail = snap.val() || {}; renderUmpireAssign(true); }, () => { /* unreadable: the panel just shows nobody ticked */ });

function _uaIsAdmin() { return typeof userRole !== 'undefined' && (userRole === 'admin' || userRole === 'superadmin'); }
function _uaShort(str) { return (str || '').split(' & ').map(n => stripGroup(n.trim())).join(' · '); }
function _uaTeamDot(t) { return t === 'Red' ? '<i class="ua-dot r">●</i>' : t === 'Blue' ? '<i class="ua-dot b">◆</i>' : ''; }

function uaToggleAvail(id) {
  if (!_uaIsAdmin()) return;
  const on = !_uaAvail[id];
  uaRef.child(id).set(on ? true : null).catch(() => showToast('บันทึกไม่สำเร็จ ลองอีกครั้ง', 'error'));
}
function uaSetFilter(v) { _uaFilter = String(v || '').trim().toLowerCase(); _uaPaintPool(); }
function uaClearAvail() {
  if (!_uaIsAdmin()) return;
  showConfirmDialog('ล้างรายชื่อกรรมการที่ว่างทั้งหมด?', () => uaRef.remove().catch(() => showToast('ล้างไม่สำเร็จ', 'error')));
}

function uaAssign(mId, name) {
  if (!_uaIsAdmin()) return;
  setMatchField(mId, 'assigned', name).then(ok => showToast(ok ? `${mId} → กรรมการ ${name}` : 'มอบหมายไม่สำเร็จ (แมตช์อาจถูกรับไปแล้ว) ลองอีกครั้ง', ok ? 'success' : 'error'));
}
function uaClear(mId) {
  if (!_uaIsAdmin()) return;
  setMatchField(mId, 'assigned', null).then(ok => showToast(ok ? `ยกเลิกการมอบหมาย ${mId}` : 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง', ok ? 'success' : 'error'));
}
async function uaAutoFill() {
  if (!_uaIsAdmin()) return;
  const rows = _uaRows().filter(r => r.kind === 'queue' && !r.assigned && r.picks.length);
  if (!rows.length) return showToast('ไม่มีแมตช์ที่แนะนำได้ตอนนี้', 'info');
  showConfirmDialog(`มอบหมายตามคำแนะนำข้อแรกให้ ${rows.length} แมตช์ในคิว? (ยังเปลี่ยนรายตัวได้ และกรรมการคนอื่นยังรับแทนได้)`, async () => {
    let ok = 0;
    for (const r of rows) { if (await setMatchField(r.id, 'assigned', r.picks[0].name)) ok++; }
    showToast(`มอบหมายแล้ว ${ok}/${rows.length} แมตช์`, ok === rows.length ? 'success' : 'warning');
  });
}

function _uaRows() {
  if (typeof UmpireAssign === 'undefined' || !appState) return [];
  return UmpireAssign.suggest({
    players: appState.players, history: appState.matchHistory, ongoing: appState.ongoingMatches,
    staged: smToArr(appState.stagedMatches), avail: _uaAvail, maxPicks: 3
  });
}

function _uaPaintPool() {
  const el = document.getElementById('uaPool');
  if (!el || !appState) return;
  const busy = {};
  (appState.ongoingMatches || []).filter(m => m && m.umpire).forEach(m => [m.r1, m.r2, m.b1, m.b2].forEach(id => { busy[id] = 1; }));
  const order = { Red: 0, Blue: 1 };
  const players = (appState.players || []).filter(p => !_uaFilter || String(p.name).toLowerCase().includes(_uaFilter))
    .slice().sort((a, b) => (order[a.team] ?? 2) - (order[b.team] ?? 2) || String(a.name).localeCompare(String(b.name), 'th'));
  el.innerHTML = players.map(p => {
    const on = !!_uaAvail[p.id], h = UmpireAssign.handOf(p), known = UmpireAssign.knownLevel(p);
    return `<button type="button" class="ua-chip${on ? ' is-on' : ''}${p.team === 'Red' ? ' r' : p.team === 'Blue' ? ' b' : ''}" aria-pressed="${on}" onclick="uaToggleAvail('${p.id}')">`
      + `${_uaTeamDot(p.team)}${escHtml(p.name)}<small>${known ? 'มือ ' + h : 'ไม่ทราบระดับ'}${busy[p.id] ? ' · กำลังเล่น' : ''}</small></button>`;
  }).join('') || '<div class="stg-empty">ไม่พบผู้เล่น</div>';
}

function renderUmpireAssign(force) {
  const el = document.getElementById('uaBox');
  if (!el || !appState || !_uaIsAdmin() || typeof UmpireAssign === 'undefined') return;
  const rows = _uaRows();
  const bal = UmpireAssign.balance(appState.players, appState.matchHistory, appState.ongoingMatches);
  const sig = JSON.stringify([rows, bal, Object.keys(_uaAvail).length, (appState.players || []).length]);
  if (!force && sig === _uaSig) return;
  _uaSig = sig;

  const nAvail = Object.keys(_uaAvail).filter(k => _uaAvail[k]).length;
  const max = Math.max(bal.red.matches, bal.blue.matches, 1);
  const bar = (cls, label, b) => `<div class="ua-bar ${cls}"><span>${label}</span><i style="width:${Math.round(b.matches / max * 100)}%"></i><b>${b.matches} แมตช์ · ${b.people} คน</b></div>`;
  const gap = Math.abs(bal.red.matches - bal.blue.matches);
  const warn = gap >= 3 ? `<p class="ua-warn">กรรมการสี${bal.red.matches > bal.blue.matches ? 'น้ำเงิน' : 'แดง'}คุมน้อยกว่า ${gap} แมตช์ — คำแนะนำจะเอียงไปทางสีนั้นเอง</p>` : '';

  const list = rows.map((r, i) => {
    const m = (r.kind === 'queue' ? appState.ongoingMatches : smToArr(appState.stagedMatches)).find(x => x && x.id === r.id) || {};
    const head = `<div class="ua-mh"><b>${escHtml(r.id)}</b><span class="ds-chip">${r.kind === 'queue' ? 'คิว #' + (i + 1) : 'กล่องรอ'}</span><span class="ds-chip">มือ ${r.hand}</span></div>`
      + `<div class="ua-mn"><span class="red">${escHtml(_uaShort(m.redNames))}</span><i>VS</i><span class="blue">${escHtml(_uaShort(m.blueNames))}</span></div>`;
    let body;
    if (r.assigned) {
      body = `<div class="ua-as">กรรมการ: <b>${escHtml(r.assigned)}</b>${r.kind === 'queue' ? ` <button type="button" class="ds-btn ds-btn-sm" onclick="uaClear('${r.id}')">ยกเลิก</button>` : ''}</div>`;
    } else if (!r.picks.length) {
      body = `<div class="ua-none">${escHtml(r.reason)}</div>`;
    } else if (r.kind === 'queue') {
      body = `<div class="ua-picks">${r.picks.map((p, j) => `<button type="button" class="ds-btn ua-pick${j === 0 ? ' ds-btn-primary' : ''}" onclick="uaAssign('${r.id}','${escHtml(p.name).replace(/'/g, '&#39;')}')">${_uaTeamDot(p.team)}${escHtml(p.name)}<small>มือ ${p.hand}${p.known ? '' : '?'} · คุมแล้ว ${p.count}</small></button>`).join('')}</div>`;
    } else {
      body = `<div class="ua-ghost">แนะนำล่วงหน้า: ${r.picks.map(p => escHtml(p.name) + ' (มือ ' + p.hand + ')').join(' · ')} <small>— มอบหมายได้เมื่อ “ต่อคิว”</small></div>`;
    }
    return `<div class="ua-m${r.kind === 'staged' ? ' is-staged' : ''}">${head}${body}</div>`;
  }).join('') || '<div class="stg-empty">ยังไม่มีแมตช์ในคิวหรือกล่องรอ</div>';

  el.innerHTML = `<details class="ua"${_uaOpen ? ' open' : ''} ontoggle="_uaOpen=this.open">
    <summary><span class="ua-t">กรรมการ — แนะนำ &amp; มอบหมาย</span><span class="ds-chip">ว่าง ${nAvail} คน</span></summary>
    <p class="ua-sub">มือ 3 คุมได้เฉพาะแมตช์มือ 3 · มือ 1–2 คุมได้ทุกแมตช์ · การมอบหมายเป็นแค่การจอง ใครจะรับแทนก็ได้</p>
    <div class="ua-bal"><b>กรรมการที่คุมไปแล้ว (ถัวสี)</b>${bar('r', 'แดง', bal.red)}${bar('b', 'น้ำเงิน', bal.blue)}${warn}</div>
    <h4 class="ua-h">1) ติ๊กคนที่ว่างมาเป็นกรรมการ <button type="button" class="ds-btn ds-btn-sm ds-btn-ghost" onclick="uaClearAvail()">ล้าง</button></h4>
    <input class="ds-input ua-search" type="search" placeholder="ค้นชื่อ…" oninput="uaSetFilter(this.value)" value="${escHtml(_uaFilter)}">
    <div id="uaPool" class="ua-pool"></div>
    <h4 class="ua-h">2) แนะนำต่อแมตช์ <button type="button" class="ds-btn ds-btn-sm ds-btn-primary" onclick="uaAutoFill()">แนะนำทั้งหมด</button></h4>
    <div class="ua-list">${list}</div>
  </details>`;
  _uaPaintPool();
}
