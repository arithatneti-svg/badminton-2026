// ══════════════════════════════════════════
// SEASON SYSTEM
// ══════════════════════════════════════════

const masterPlayersRef   = firebase.database().ref('masterPlayers');
const seasonsArchiveRef  = firebase.database().ref('seasons_archive');

// ── SEASON WIZARD ──
let _wzStep = 1;
let _wzReassignData = []; // [{id, name, team, group}]

function openSeasonWizard() {
  if (userRole !== 'superadmin') return showToast('Superadmin เท่านั้น', 'error');
  _wzStep = 1;
  document.getElementById('wzCurrentYear').textContent = new Date().getFullYear();
  document.getElementById('wzMatchCount').textContent = (appState.matchHistory||[]).length;
  document.getElementById('wzNewSeasonYear').value = String(new Date().getFullYear() + 1);
  document.getElementById('wzNewSeasonName').value = `Sports Day ${new Date().getFullYear() + 1}`;
  document.getElementById('wzArchiveStatus').hidden = true;
  const ab = document.getElementById('wzArchiveBtn');   // a wizard reopened after an archive must not show a stuck "กำลัง Archive"
  if (ab) { ab.disabled = false; ab.innerHTML = dsIcon('floppy-disk') + 'Archive เลย'; }
  wzGoStep(1);
  document.getElementById('seasonWizardModal').classList.add('open');
}
function closeSeasonWizard() { document.getElementById('seasonWizardModal').classList.remove('open'); }

function wzGoStep(step) {
  _wzStep = step;
  [1,2,3,4].forEach(n => {
    document.getElementById(`wzStep${n}`).style.display   = n===step ? 'block' : 'none';
    const ind = document.getElementById(`wzStep${n}Ind`);
    ind.className = 'wizard-step' + (n===step?' active':n<step?' done':'');
    if (n === step) ind.setAttribute('aria-current', 'step'); else ind.removeAttribute('aria-current');
  });
  if (step === 3) wzBuildReassignGrid();
  if (step === 4) wzBuildConfirmSummary();
  const sheet = document.querySelector('#seasonWizardModal .ds-sheet'); if (sheet) sheet.scrollTop = 0;   // a new step starts at the top
}

async function wzArchiveSeason() {
  const btn = event.currentTarget || (event.target && event.target.closest && event.target.closest('button'));
  if (btn) { btn.disabled = true; btn.innerHTML = dsIcon('hourglass-medium') + 'กำลัง Archive…'; }
  const statusEl = document.getElementById('wzArchiveStatus');
  try {
    const year = String(appState.seasonYear || new Date().getFullYear());

    // Identity first: without a pid a returning player cannot be linked
    // back to this season, so backfill before anything is written.
    const assigned = ensurePlayerPids();
    if (assigned) saveKeys(['players'], true);

    const snapshot = {
      year,
      archivedAt: new Date().toISOString(),
      globalScoreRed:  appState.globalScoreRed  || 0,
      globalScoreBlue: appState.globalScoreBlue || 0,
      players:         appState.players         || [],   // now carry pid
      matchHistory:    appState.matchHistory     || [],
      playerProfiles:  appState.playerProfiles   || {},
      seasonName:      appState.seasonName || `Sports Day ${year}`,
    };
    await seasonsArchiveRef.child(year).set(snapshot);

    // Durable person records, keyed by pid so a colour change cannot break them
    const hist = appState.matchHistory || [];
    const updates = {};
    (appState.players || []).forEach(p => {
      if (!p.pid) return;
      const st = seasonStatsFor(p.id, hist);
      updates[`${p.pid}/name`] = p.name;
      updates[`${p.pid}/pid`]  = p.pid;
      // snapshot the profile too, so the career view still works for
      // players who never come back
      const prof = (appState.playerProfiles || {})[p.id];
      if (prof) updates[`${p.pid}/profile`] = prof;
      updates[`${p.pid}/seasons/${year}`] = {
        jersey: p.id, team: p.team, group: p.group,
        pts: st.pts, w: st.w, l: st.l, d: st.d,
        matches: st.matches, pointDiff: st.pointDiff,
        matchWin: st.matchWin, matchLose: st.matchLose, matchDraw: st.matchDraw,
        asRed: st.asRed, asBlue: st.asBlue,
      };
    });
    if (Object.keys(updates).length) await masterPlayersRef.update(updates);
    await loadMasterPlayers();

    statusEl.hidden = false;
    statusEl.className = 'ds-banner is-ok';
    statusEl.innerHTML = `${dsIcon('check-circle')}<div>Archive season ${escHtml(year)} สำเร็จ (${hist.length} แมตช์ · ${(appState.players||[]).length} คน${assigned ? ` · ออก pid ใหม่ ${assigned}` : ''})</div>`;
    setTimeout(() => wzGoStep(2), 1400);
  } catch(e) {
    statusEl.hidden = false;
    statusEl.className = 'ds-banner is-err';
    statusEl.innerHTML = `${dsIcon('warning-circle')}<div>Archive ไม่สำเร็จ: ${escHtml(e.message)}</div>`;
    if (btn) { btn.disabled = false; btn.innerHTML = dsIcon('floppy-disk') + 'Archive เลย'; }
  }
}
function wzSkipArchive() { wzGoStep(2); }

// ── Step 3: who comes back, and on which side ──────────────────
// Unticked players simply stay out of the new season; their record lives
// on in masterPlayers so their history is never lost.
function wzBuildReassignGrid() {
  ensurePlayerPids();
  _wzReassignData = (appState.players || []).map(p => ({ ...p, keep: true }));
  wzPaintReassignGrid();
}

function wzPaintReassignGrid() {
  const grid = document.getElementById('wzReassignGrid');
  if (!grid) return;
  const keeping = _wzReassignData.filter(p => p.keep).length;
  const counter = document.getElementById('wzKeepCount');
  if (counter) counter.textContent = `${keeping} / ${_wzReassignData.length}`;
  grid.innerHTML = _wzReassignData.map((p, i) => `
    <div class="reassign-card${p.keep ? '' : ' wz-dropped'}">
      <label class="wz-keep" title="ติ๊ก = เล่นซีซั่นใหม่ด้วย">
        <input type="checkbox" ${p.keep ? 'checked' : ''} data-idx="${i}" aria-label="${escHtml(p.name)} เล่นต่อ" onchange="wzToggleKeep(this)">
      </label>
      <div class="reassign-name"><span class="reassign-n">${escHtml(p.name)}</span><span class="wz-pid">${escHtml(p.pid || '—')}</span></div>
      <select class="ds-select reassign-select ${p.team==='Red' ? 'is-red' : 'is-blue'}" aria-label="ทีมของ ${escHtml(p.name)}" data-idx="${i}" data-field="team" onchange="wzUpdatePlayer(this)" ${p.keep ? '' : 'disabled'}>
        <option value="Red"  ${p.team==='Red' ?'selected':''}>Red</option>
        <option value="Blue" ${p.team==='Blue'?'selected':''}>Blue</option>
      </select>
      <select class="ds-select reassign-select" aria-label="กลุ่มของ ${escHtml(p.name)}" data-idx="${i}" data-field="group" onchange="wzUpdatePlayer(this)" ${p.keep ? '' : 'disabled'}>
        <option value="1" ${p.group==='1'?'selected':''}>G1</option>
        <option value="2" ${p.group==='2'?'selected':''}>G2</option>
        <option value="3" ${p.group==='3'?'selected':''}>G3</option>
      </select>
    </div>`).join('');
}

function wzToggleKeep(el) {
  _wzReassignData[Number(el.dataset.idx)].keep = el.checked;
  wzPaintReassignGrid();
}
function wzKeepAll(on) {
  _wzReassignData.forEach(p => { p.keep = on; });
  wzPaintReassignGrid();
}

function wzUpdatePlayer(sel) {
  const idx = Number(sel.dataset.idx);
  _wzReassignData[idx][sel.dataset.field] = sel.value;
  if (sel.dataset.field === 'team') { sel.classList.toggle('is-red', sel.value === 'Red'); sel.classList.toggle('is-blue', sel.value === 'Blue'); }
}

function wzShufflePlayers() {
  const keep = _wzReassignData.filter(p => p.keep);
  // Fisher-Yates over the teams actually being assigned
  const teams = keep.map(p => p.team);
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  keep.forEach((p, i) => { p.team = teams[i]; });
  wzPaintReassignGrid();
  showToast('สุ่มทีมใหม่แล้ว แก้รายคนได้', 'info');
}

// ── Step 3b: brand-new players for the coming season ───────────
let _wzNewPlayers = [];
function wzAddNewPlayer() {
  const nameEl = document.getElementById('wzNewPlayerName');
  const name = (nameEl.value || '').trim();
  if (!name) { nameEl.focus(); return showToast('กรอกชื่อผู้เล่นก่อน', 'error'); }
  _wzNewPlayers.push({
    name,
    team:  document.getElementById('wzNewPlayerTeam').value,
    group: document.getElementById('wzNewPlayerGroup').value,
  });
  nameEl.value = ''; nameEl.focus();
  wzPaintNewPlayers();
}
function wzRemoveNewPlayer(i) { _wzNewPlayers.splice(i, 1); wzPaintNewPlayers(); }
function wzPaintNewPlayers() {
  const el = document.getElementById('wzNewPlayerList');
  if (!el) return;
  el.innerHTML = _wzNewPlayers.length
    ? _wzNewPlayers.map((p, i) => `
        <span class="wz-newchip ${p.team === 'Red' ? 'is-red' : 'is-blue'}">
          <span class="ds-team ${p.team === 'Red' ? 'ds-team-red' : 'ds-team-blue'}">${p.team === 'Red' ? 'RED' : 'BLUE'}</span>
          <span class="wz-newchip-n">${escHtml(p.name)} <b>G${escHtml(p.group)}</b></span>
          <button type="button" onclick="wzRemoveNewPlayer(${i})" title="เอาออก" aria-label="เอา ${escHtml(p.name)} ออก">${dsIcon('x')}</button>
        </span>`).join('')
    : '<span class="ds-help">ยังไม่ได้เพิ่มใคร</span>';
}

function wzBuildConfirmSummary() {
  const year = document.getElementById('wzNewSeasonYear').value || '2027';
  const name = document.getElementById('wzNewSeasonName').value || `Sports Day ${year}`;
  const keep = _wzReassignData.filter(p => p.keep);
  const dropped = _wzReassignData.length - keep.length;
  const total = keep.length + _wzNewPlayers.length;
  const reds  = keep.filter(p=>p.team==='Red').length  + _wzNewPlayers.filter(p=>p.team==='Red').length;
  const blues = keep.filter(p=>p.team==='Blue').length + _wzNewPlayers.filter(p=>p.team==='Blue').length;
  const switched = keep.filter(p => {
    const orig = (appState.players||[]).find(x => x.pid === p.pid);
    return orig && orig.team !== p.team;
  }).length;
  document.getElementById('wzConfirmSummary').innerHTML = `
    <div class="wz-sum-h"><b>${escHtml(name)}</b><span class="ds-chip ds-chip-gold">${escHtml(year)}</span></div>
    <div class="wz-sum-stats">
      <div class="wz-stat"><span class="ds-num">${total}</span><span>ผู้เล่น</span></div>
      <div class="wz-stat is-red"><span class="ds-num">${reds}</span><span class="ds-team ds-team-red">RED</span></div>
      <div class="wz-stat is-blue"><span class="ds-num">${blues}</span><span class="ds-team ds-team-blue">BLUE</span></div>
    </div>
    <ul class="wz-list">
      <li>${dsIcon('check-circle')}กลับมาเล่นต่อ ${keep.length} คน${switched ? ` (ย้ายสี ${switched} คน — จะได้เบอร์เสื้อใหม่)` : ''}</li>
      <li>${dsIcon('plus')}ผู้เล่นใหม่ ${_wzNewPlayers.length} คน</li>
      ${dropped ? `<li class="is-muted">${dsIcon('minus')}ไม่ได้ไปต่อ ${dropped} คน — ประวัติยังอยู่ใน masterPlayers</li>` : ''}
    </ul>
    <div class="rs-line is-del">${dsIcon('trash')}<span><b>รีเซ็ต</b> ผลการแข่ง, คะแนนทีม, แมตช์ที่กำลังแข่ง</span></div>
    <div class="rs-line is-keep">${dsIcon('check-circle')}<span><b>ยกมา</b> รูปและโปรไฟล์ของคนที่ไปต่อ</span></div>
  `;
}

function wzConfirmNewSeason() {
  if (userRole !== 'superadmin') return;
  const year = document.getElementById('wzNewSeasonYear').value || '2027';
  const name = document.getElementById('wzNewSeasonName').value || `Sports Day ${year}`;
  const keep = _wzReassignData.filter(p => p.keep);
  if (keep.length + _wzNewPlayers.length < 4) return showToast('ต้องมีผู้เล่นอย่างน้อย 4 คน', 'error');

  // Re-issue jerseys so the R/B prefix matches the new colour, keeping pid.
  const roster = [];
  const oldProfiles = appState.playerProfiles || {};
  const newProfiles = {};
  keep.forEach(p => {
    const jersey = nextJersey(p.team, roster);
    roster.push({ id: jersey, pid: p.pid, name: p.name, team: p.team, group: p.group });
    // carry the profile across to the new jersey key
    if (oldProfiles[p.id]) newProfiles[jersey] = oldProfiles[p.id];
  });
  // Dropped players must count as taken too. Their pid still owns a career
  // in masterPlayers, and if the archive step was skipped that record may
  // not exist yet — reissuing the pid would graft a newcomer onto their
  // history. Anyone who has ever held a pid this season keeps it reserved.
  const takenPids = new Set([
    ...roster.map(p => p.pid),
    ..._wzReassignData.map(p => p.pid),
    ...(appState.players || []).map(p => p.pid),
    ...Object.keys(_masterPlayers || {}),
  ].filter(Boolean));
  _wzNewPlayers.forEach(np => {
    const pid = nextPid(takenPids); takenPids.add(pid);
    roster.push({ id: nextJersey(np.team, roster), pid, name: np.name, team: np.team, group: np.group });
  });

  appState.players        = roster;
  appState.playerProfiles = newProfiles;
  appState.matchHistory   = [];
  appState.ongoingMatches = [];
  appState.matchCounter   = 1;
  appState.globalScoreRed  = 0;
  appState.globalScoreBlue = 0;
  appState.redTeamName  = 'RED TEAM';
  appState.blueTeamName = 'BLUE TEAM';
  appState.seasonName   = name;
  appState.seasonYear   = year;

  document.getElementById('seasonNavTitle').textContent = `SPORTS DAY ${year}`;
  document.getElementById('seasonBadge').innerHTML = `${dsIcon('calendar-blank')} ${escHtml(year)}`;
  invalidateStatsCache();
  saveData(true);
  _wzNewPlayers = [];
  closeSeasonWizard();
  showToast(`${name} เริ่มแล้ว! (${roster.length} คน)`, 'success');
  updateUI();
}

// ── SEASON ARCHIVE VIEWER ──
async function openSeasonArchive() {
  document.getElementById('seasonArchiveModal').classList.add('open');
  const el = document.getElementById('seasonArchiveContent');
  el.innerHTML = '<div class="ds-skel arc-skel"></div><div class="ds-skel arc-skel"></div>';
  let archives;
  try { archives = (await seasonsArchiveRef.once('value')).val() || {}; }
  catch (e) {
    console.error('season archive failed:', e);
    el.innerHTML = `<div class="ds-banner is-err">${dsIcon('warning-circle')}<div>โหลด Archive ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ</div></div><button type="button" class="ds-btn" onclick="openSeasonArchive()">${dsIcon('arrow-clockwise')}ลองใหม่</button>`;
    return;
  }
  const years = Object.keys(archives).sort((a,b) => b.localeCompare(a));
  if (!years.length) {
    el.innerHTML = `<div class="ds-empty">${dsArt('court')}<div class="ds-empty-title">ยังไม่มี Season ที่ archive ไว้</div><div class="ds-empty-text">ใช้ เริ่ม Season ใหม่ เพื่อ archive season ปัจจุบัน</div></div>`;
    return;
  }
  el.innerHTML = years.map(year => {
    const d = archives[year];
    const mCount = (d.matchHistory||[]).length;
    const pCount = (d.players||[]).length;
    const rScore = d.globalScoreRed||0, bScore = d.globalScoreBlue||0;
    const win = rScore === bScore ? { cls: 'draw', html: 'เสมอ' }
      : rScore > bScore ? { cls: 'red', html: '<span class="ds-team ds-team-red">RED</span> ชนะ' }
      : { cls: 'blue', html: '<span class="ds-team ds-team-blue">BLUE</span> ชนะ' };
    return `<article class="arc-card">
      <div class="arc-head">
        <h3 class="arc-name">${escHtml(d.seasonName||year)}</h3>
        <span class="arc-date">เก็บเมื่อ ${d.archivedAt ? new Date(d.archivedAt).toLocaleDateString('th-TH') : escHtml(year)}</span>
      </div>
      <div class="arc-stats">
        <div class="arc-stat"><span class="ds-num">${pCount}</span><span>ผู้เล่น</span></div>
        <div class="arc-stat"><span class="ds-num">${mCount}</span><span>แมตช์</span></div>
        <div class="arc-stat is-red"><span class="ds-num">${rScore}</span><span>RED คะแนน</span></div>
        <div class="arc-stat is-blue"><span class="ds-num">${bScore}</span><span>BLUE คะแนน</span></div>
      </div>
      <div class="arc-foot">
        <span class="arc-win is-${win.cls}">${win.html}</span>
        <button type="button" class="ds-btn ds-btn-sm" aria-expanded="false" aria-controls="arcRoster-${escHtml(year)}" onclick="wzLoadArchivePlayers('${escHtml(year)}', this)">${dsIcon('users')}ดูรายชื่อผู้เล่น</button>
      </div>
      <div class="arc-roster" id="arcRoster-${escHtml(year)}" hidden></div>
    </article>`;
  }).join('') + `<p class="ds-help arc-now">Season ปัจจุบัน: ${escHtml(String(appState.seasonYear || new Date().getFullYear()))} (live)</p>`;
}
function closeSeasonArchive() { document.getElementById('seasonArchiveModal').classList.remove('open'); }

// the roster of an archived season, folded open under its card (a second tap folds it again)
async function wzLoadArchivePlayers(year, btn) {
  const box = document.getElementById('arcRoster-' + year);
  if (box && !box.hidden) { box.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); return; }
  let players;
  try { players = (await seasonsArchiveRef.child(`${year}/players`).once('value')).val() || []; }
  catch (e) { return showToast('โหลดรายชื่อไม่สำเร็จ', 'error'); }
  if (!Array.isArray(players)) players = Object.values(players);
  if (!players.length || !box) return showToast('ไม่พบข้อมูลผู้เล่น', 'warning');
  const list = team => players.filter(p => p.team === team).map(p => `<li>${escHtml(p.name)}</li>`).join('') || '<li class="ds-muted">—</li>';
  box.innerHTML = `<div class="arc-col"><span class="ds-team ds-team-red">RED</span><ul>${list('Red')}</ul></div><div class="arc-col"><span class="ds-team ds-team-blue">BLUE</span><ul>${list('Blue')}</ul></div>`;
  box.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

// เพิ่ม season modals ใน Escape handler


// ══════════════════════════════════════════
// PLAYERS DIRECTORY — a ranked list of people: rank, face, name, quiet meta and ONE big number (the metric the
// list is sorted by). The toolbar (search / filters / sort) is static markup in index.html and is never repainted,
// so typing in the search box keeps its focus. Gold = the key number; team = word + shape + edge.
// ══════════════════════════════════════════
// phone: the three filters live behind one button next to the search box (from 640 px they are always visible)
function togglePlayersFilters(force) {
  const panel = document.getElementById('playersFilterPanel'), btn = document.getElementById('playersFilterBtn');
  if (!panel || !btn) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', open);
  btn.setAttribute('aria-expanded', String(open));
}
function clearPlayersFilters() {
  ['playersTabSearch', 'playersTabFilterTeam', 'playersTabFilterGroup'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderPlayersTab();
}

function renderPlayersTab() {
  const grid = document.getElementById('playersTabGrid');
  if (!grid) return;
  if (typeof updateChampControls === 'function') updateChampControls();
  const searchRaw = document.getElementById('playersTabSearch')?.value || '';
  const search = searchRaw.toLowerCase();
  const fTeam  = document.getElementById('playersTabFilterTeam')?.value || '';
  const fGroup = document.getElementById('playersTabFilterGroup')?.value || '';
  const stats  = getPlayerStats();

  const players = appState.players.filter(p => {
    if (fTeam && p.team !== fTeam) return false;
    if (fGroup && p.group !== fGroup) return false;
    if (search && !(p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search))) return false;
    return true;
  });

  const sortBy = document.getElementById('playersTabSortBy')?.value || 'pts';
  players.sort((a, b) => {
    if (sortBy === 'name')      return a.name.localeCompare(b.name);
    if (sortBy === 'winRate')   return (stats[b.id]?.winRate || 0) - (stats[a.id]?.winRate || 0);
    if (sortBy === 'pointDiff') return (stats[b.id]?.pointDiff || 0) - (stats[a.id]?.pointDiff || 0);
    return (stats[b.id]?.pts || 0) - (stats[a.id]?.pts || 0) || a.group - b.group;
  });

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const total = appState.players.length;
  const filtered = !!(fTeam || fGroup || searchRaw);

  // the line above the list ("54 คน · เรียงตามคะแนน", or "12 จาก 54 คน" with the way out) and the badge on the phone's filter button
  const optText = id => { const el = document.getElementById(id); return (el && el.selectedOptions && el.selectedOptions[0]) ? el.selectedOptions[0].textContent : ''; };
  const meta = document.getElementById('playersTabMeta');
  if (meta) {
    meta.innerHTML = !total ? '' :
      (filtered ? `<span><b>${players.length}</b> จาก ${total} คน</span>` : `<span><b>${total}</b> คน</span>`)
      + (fTeam ? `<span>${escHtml(optText('playersTabFilterTeam'))}</span>` : '')
      + (fGroup ? `<span>${escHtml(optText('playersTabFilterGroup'))}</span>` : '')
      + `<span>${escHtml(optText('playersTabSortBy'))}</span>`
      + (filtered && players.length ? `<button type="button" class="ds-btn ds-btn-ghost pdir-clear" onclick="clearPlayersFilters()">ล้างตัวกรอง</button>` : '');
  }
  const badge = document.getElementById('playersFilterBadge');
  if (badge) { const n = (fTeam ? 1 : 0) + (fGroup ? 1 : 0) + (sortBy !== 'pts' ? 1 : 0); badge.hidden = !n; badge.textContent = n || ''; }

  if (!players.length) {
    grid.innerHTML = `<div class="ds-card"><div class="ds-empty">
      <div class="ds-empty-art">${dsArt('court')}</div>
      <div class="ds-empty-title">${total ? 'ไม่พบผู้เล่น' : 'ยังไม่มีผู้เล่น'}</div>
      <div class="ds-empty-text">${total ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : (isAdmin ? 'เพิ่มผู้เล่นได้ที่แท็บ Admin' : 'รายชื่อผู้เล่นจะแสดงที่นี่')}</div>
      ${total ? '<button type="button" class="ds-btn" onclick="clearPlayersFilters()">ล้างตัวกรอง</button>' : ''}
    </div></div>`;
    return;
  }

  const mine    = p => (typeof isMe === 'function' && isMe(p.id));
  const youTag  = p => mine(p) ? `<span class="ds-chip ds-chip-gold pdir-you">คุณ</span>` : '';
  const teamTag = p => p.team === 'Red' ? `<span class="ds-team ds-team-red">RED</span>` : `<span class="ds-team ds-team-blue">BLUE</span>`;
  const actionsHtml = p => isAdmin
    ? `<div class="pdir-actions">
         <button type="button" class="ds-btn ds-btn-icon ds-btn-ghost" aria-label="แก้ไข ${escHtml(p.name)}" title="แก้ไขผู้เล่น" onclick="openPlayerEdit('${p.id}')">${dsIcon('pencil-simple')}</button>
         <button type="button" class="ds-btn ds-btn-icon ds-btn-ghost pdir-act-del" aria-label="ลบ ${escHtml(p.name)}" title="ลบผู้เล่น" onclick="deletePlayer('${p.id}')">${dsIcon('trash')}</button>
       </div>`
    : '';
  const streakHtml = id => {
    const st = getPlayerStreak(id);
    if (!st) return '';
    return st.type === 'hot'
      ? `<span class="pdir-streak is-hot">${dsIcon('fire')}ฟอร์มร้อน</span>`
      : `<span class="pdir-streak is-cold">${dsIcon('caret-down')}ฟอร์มตก</span>`;
  };

  // The headline number follows the active sort: switch to อัตราชนะ and the win rate becomes the big number
  // (คะแนน / ผลต่าง likewise); the other two ride along as the quiet stats.
  const metric = {
    pts: s => ({ v: s.pts || 0,                          dim: !s.pts,   name: 'คะแนน' }),
    wr:  s => ({ v: s.total > 0 ? s.winRate + '%' : '—', dim: !s.total, name: 'อัตราชนะ' }),
    pd:  s => { const pd = s.pointDiff || 0; return { v: (pd > 0 ? '+' : '') + pd, dim: !s.total, name: 'ผลต่าง' }; },
  };
  const heroKey   = sortBy === 'winRate' ? 'wr' : sortBy === 'pointDiff' ? 'pd' : 'pts';
  const otherKeys = ['pts', 'wr', 'pd'].filter(k => k !== heroKey);
  const statsHtml = s => s.total > 0
    ? otherKeys.map(k => { const o = metric[k](s); return `<span>${o.name} <b>${o.v}</b></span>`; }).join('')
    : `<span>ยังไม่ลงแข่ง</span>`;

  // ── Podium: top 3 of the current ranking (skipped when sorting by name, where "1st/2nd/3rd" would just mean
  //    "earliest alphabetically"). DOM order is 1-2-3 (screen readers); CSS puts the champion in the middle. ──
  const showPodium = players.length >= 3 && sortBy !== 'name';
  const podHtml = (p, rank) => {
    const s = stats[p.id] || {};
    const hero = metric[heroKey](s);
    const label = `อันดับ ${rank + 1} ${p.name} · ${hero.v} ${hero.name} · ดูโปรไฟล์`;
    return `<li class="pdir-pod p${rank + 1} ${p.team === 'Red' ? 'is-red' : 'is-blue'}${mine(p) ? ' is-me' : ''}">
      <button type="button" class="pdir-open" onclick="openPlayerProfile('${p.id}')" aria-label="${escHtml(label)}">
        <span class="pdir-medal">${rank === 0 ? dsIcon('crown', { fill: true }) : rank + 1}</span>
        ${avatarHtml(p, rank === 0 ? 80 : 64)}
        <span class="pdir-body">
          <span class="pdir-name">${escHtml(p.name)}${youTag(p)}</span>
          <span class="pdir-sub">${teamTag(p)}<span>G${p.group}</span></span>
        </span>
        <span class="pdir-pts${hero.dim ? ' is-zero' : ''}"><b class="ds-num">${hero.v}</b><span>${hero.name}</span></span>
        <span class="pdir-stats">${statsHtml(s)}</span>
      </button>
      ${actionsHtml(p)}
    </li>`;
  };

  // ── List row (rank 4+, or everyone when there is no podium) ──
  const rowHtml = (p, rank, ranked) => {
    const s = stats[p.id] || {};
    const hero = metric[heroKey](s);
    const label = `${ranked ? 'อันดับ ' + (rank + 1) + ' ' : ''}${p.name} · ${hero.v} ${hero.name} · ดูโปรไฟล์`;
    return `<li class="pdir-row ${p.team === 'Red' ? 'is-red' : 'is-blue'}${mine(p) ? ' is-me' : ''}">
      <button type="button" class="pdir-open" onclick="openPlayerProfile('${p.id}')" aria-label="${escHtml(label)}">
        ${ranked ? `<span class="pdir-rank${rank < 3 ? ' is-top' : ''}">${rank + 1}</span>` : ''}
        ${avatarHtml(p, 56)}
        <span class="pdir-body">
          <span class="pdir-name">${escHtml(p.name)}${youTag(p)}</span>
          <span class="pdir-sub">${teamTag(p)}<span>G${p.group}</span><span>${p.id}</span></span>
          <span class="pdir-stats">${statsHtml(s)}${streakHtml(p.id)}</span>
        </span>
        <span class="pdir-pts${hero.dim ? ' is-zero' : ''}"><b class="ds-num">${hero.v}</b><span>${hero.name}</span></span>
      </button>
      ${actionsHtml(p)}
    </li>`;
  };

  let html = '';
  if (showPodium) {
    html += `<ol class="pdir-podium" role="list" aria-label="3 อันดับแรก">${players.slice(0, 3).map((p, i) => podHtml(p, i)).join('')}</ol>`;
  }
  const rest = showPodium ? players.slice(3) : players;
  if (rest.length) {
    if (showPodium) html += `<h3 class="pdir-list-h">อันดับ 4 ขึ้นไป</h3>`;
    html += `<ul class="pdir-list" role="list">${rest.map((p, j) => rowHtml(p, (showPodium ? 3 : 0) + j, sortBy !== 'name')).join('')}</ul>`;
  }
  grid.innerHTML = html;
}

