// ══════════════════════════════════════════
// SEASON SYSTEM
// ══════════════════════════════════════════

const masterPlayersRef   = firebase.database().ref('masterPlayers');
const seasonsArchiveRef  = firebase.database().ref('seasons_archive');

// ── SEASON WIZARD ──
let _wzStep = 1;
let _wzReassignData = []; // [{id, name, team, group}]

function openSeasonWizard() {
  if (userRole !== 'superadmin') return showToast('⛔ Superadmin เท่านั้น', 'error');
  _wzStep = 1;
  document.getElementById('wzCurrentYear').textContent = new Date().getFullYear();
  document.getElementById('wzMatchCount').textContent = (appState.matchHistory||[]).length;
  document.getElementById('wzNewSeasonYear').value = String(new Date().getFullYear() + 1);
  document.getElementById('wzNewSeasonName').value = `Sports Day ${new Date().getFullYear() + 1}`;
  document.getElementById('wzArchiveStatus').style.display = 'none';
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
  });
  if (step === 3) wzBuildReassignGrid();
  if (step === 4) wzBuildConfirmSummary();
}

async function wzArchiveSeason() {
  const btn = event.target; btn.disabled = true; btn.textContent = '⏳ กำลัง Archive...';
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

    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(0,230,118,0.08)';
    statusEl.style.border = '1px solid rgba(0,230,118,0.2)';
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `✅ Archive season ${year} สำเร็จ! (${hist.length} แมตช์ · ${(appState.players||[]).length} คน${assigned ? ` · ออก pid ใหม่ ${assigned}` : ''})`;
    setTimeout(() => wzGoStep(2), 1400);
  } catch(e) {
    statusEl.style.display='block';
    statusEl.style.background='rgba(255,59,92,0.08)';
    statusEl.style.color='var(--danger)';
    statusEl.textContent = `❌ Error: ${e.message}`;
    btn.disabled = false; btn.textContent = '📦 Archive Now';
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
        <input type="checkbox" ${p.keep ? 'checked' : ''} data-idx="${i}" onchange="wzToggleKeep(this)">
      </label>
      <div class="reassign-name">${escHtml(p.name)}<span class="wz-pid">${p.pid || '—'}</span></div>
      <select class="reassign-select" data-idx="${i}" data-field="team" onchange="wzUpdatePlayer(this)" ${p.keep ? '' : 'disabled'}>
        <option value="Red"  ${p.team==='Red' ?'selected':''}>🔴 Red</option>
        <option value="Blue" ${p.team==='Blue'?'selected':''}>🔵 Blue</option>
      </select>
      <select class="reassign-select" data-idx="${i}" data-field="group" onchange="wzUpdatePlayer(this)" style="width:52px;" ${p.keep ? '' : 'disabled'}>
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
  showToast('🎲 สุ่มทีมใหม่แล้ว แก้รายคนได้', 'info');
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
          ${escHtml(p.name)} <b>G${p.group}</b>
          <button onclick="wzRemoveNewPlayer(${i})" title="เอาออก">✕</button>
        </span>`).join('')
    : '<span style="font-size:12px;color:var(--muted);">ยังไม่ได้เพิ่มใคร</span>';
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
    <b style="color:var(--gold);">📅 Season ใหม่:</b> ${escHtml(name)} (${escHtml(year)})<br>
    <b style="color:var(--gold);">👥 ผู้เล่น:</b> ${total} คน — 🔴 ${reds} / 🔵 ${blues}<br>
    <span style="color:var(--text2);">• กลับมาเล่นต่อ ${keep.length} คน${switched ? ` (ย้ายสี ${switched} คน — จะได้เบอร์เสื้อใหม่)` : ''}</span><br>
    <span style="color:var(--text2);">• ผู้เล่นใหม่ ${_wzNewPlayers.length} คน</span><br>
    ${dropped ? `<span style="color:var(--muted);">• ไม่ได้ไปต่อ ${dropped} คน — ประวัติยังอยู่ใน masterPlayers</span><br>` : ''}
    <b style="color:var(--danger);">🗑️ Reset:</b> ผลการแข่ง, คะแนนทีม, ongoing matches<br>
    <b style="color:var(--green);">✅ ยกมา:</b> รูป, โปรไฟล์, โน้ตสกาวต์ ของคนที่ไปต่อ
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
  document.getElementById('seasonBadge').textContent = `📅 ${year}`;
  invalidateStatsCache();
  saveData(true);
  _wzNewPlayers = [];
  closeSeasonWizard();
  showToast(`🚀 ${name} เริ่มแล้ว! (${roster.length} คน)`, 'success');
  updateUI();
}

// ── SEASON ARCHIVE VIEWER ──
async function openSeasonArchive() {
  document.getElementById('seasonArchiveModal').classList.add('open');
  const el = document.getElementById('seasonArchiveContent');
  el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:24px;">⏳ กำลังโหลด archives...</div>`;
  const snap = await seasonsArchiveRef.once('value');
  const archives = snap.val() || {};
  const years = Object.keys(archives).sort((a,b) => b.localeCompare(a));
  if (!years.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:32px;font-size:13px;">ยังไม่มี Season ที่ archive ไว้<br><span style="font-size:11px;margin-top:6px;display:block;">ใช้ New Season Wizard เพื่อ archive season ปัจจุบัน</span></div>`;
    return;
  }
  el.innerHTML = years.map(year => {
    const d = archives[year];
    const mCount = (d.matchHistory||[]).length;
    const pCount = (d.players||[]).length;
    const rScore = d.globalScoreRed||0, bScore = d.globalScoreBlue||0;
    const winner = rScore>bScore?'🔴 RED':'🔵 BLUE';
    const wc = rScore>bScore?'var(--red)':'var(--blue)';
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.4em;letter-spacing:3px;color:var(--gold);">📅 ${escHtml(d.seasonName||year)}</div>
        <div style="font-size:11px;color:var(--muted);">archived ${d.archivedAt?new Date(d.archivedAt).toLocaleDateString('th-TH'):year}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--text);">${pCount}</div><div class="career-stat-lbl">ผู้เล่น</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--text);">${mCount}</div><div class="career-stat-lbl">แมตช์</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--red);">${rScore}</div><div class="career-stat-lbl">RED PTS</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--blue);">${bScore}</div><div class="career-stat-lbl">BLUE PTS</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:${wc};font-size:0.9em;">${winner}</div><div class="career-stat-lbl">ชนะ</div></div>
      </div>
      <button class="btn btn-outline btn-sm" onclick="wzLoadArchivePlayers('${year}')" style="font-size:11px;">👥 ดูรายชื่อผู้เล่น</button>
    </div>`;
  }).join('') + `<div style="padding:12px 0;border-top:1px solid var(--border);margin-top:8px;text-align:center;">
    <span style="font-size:12px;color:var(--muted);">Season ปัจจุบัน: 2026 (live)</span>
  </div>`;
}
function closeSeasonArchive() { document.getElementById('seasonArchiveModal').classList.remove('open'); }

async function wzLoadArchivePlayers(year) {
  const snap = await seasonsArchiveRef.child(`${year}/players`).once('value');
  const players = snap.val() || [];
  if (!players.length) return showToast('ไม่พบข้อมูลผู้เล่น', 'warning');
  const reds = players.filter(p=>p.team==='Red').map(p=>escHtml(p.name)).join(', ');
  const blues = players.filter(p=>p.team==='Blue').map(p=>escHtml(p.name)).join(', ');
  showToast(`🔴 Red: ${reds||'—'}`, 'info');
  setTimeout(() => showToast(`🔵 Blue: ${blues||'—'}`, 'info'), 800);
}

// เพิ่ม season modals ใน Escape handler


function renderPlayersTab() {
  const grid = document.getElementById('playersTabGrid');
  if (!grid) return;
  const search = (document.getElementById('playersTabSearch')?.value || '').toLowerCase();
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

  if (!players.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted);font-size:14px;background:var(--surface2);border-radius:12px;border:1px dashed var(--border);">ไม่พบผู้เล่น</div>`;
    return;
  }

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  grid.innerHTML = players.map((p, i) => {
    const s = stats[p.id] || {};
    const isRed = p.team === 'Red';
    // colour only carries meaning where it changes: win rate and +/- PD.
    // Everything else stays neutral so the grid reads as a list, not a mosaic.
    const wrc = s.winRate >= 70 ? 'var(--green)'
              : s.winRate >= 40 ? 'var(--text2)'
              : s.total > 0     ? 'var(--danger)' : 'var(--muted)';
    const pd  = s.pointDiff || 0;
    const pdc = pd > 0 ? 'var(--green)' : pd < 0 ? 'var(--danger)' : 'var(--muted)';
    const streak = getPlayerStreak(p.id);
    const streakHtml = streak
      ? `<span class="pdir-tag ${streak.type === 'hot' ? 'pdir-hot' : 'pdir-cold'}">${streak.label}</span>`
      : '';
    const rankCls = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
    const actions = isAdmin
      ? `<div class="pdir-actions">
           <button class="btn btn-outline btn-sm" title="แก้ไขผู้เล่น" onclick="event.stopPropagation();openPlayerEdit('${p.id}')">✏️</button>
           <button class="btn btn-danger btn-sm" title="ลบผู้เล่น" onclick="event.stopPropagation();deletePlayer('${p.id}')">🗑</button>
         </div>`
      : '';
    return `<div class="pdir-card ${isRed ? 'is-red' : 'is-blue'}" onclick="openPlayerProfile('${p.id}')" title="ดูโปรไฟล์">
      <div class="pdir-rank ${rankCls}">${i + 1}</div>
      ${avatarHtml(p, 40)}
      <div class="pdir-body">
        <div class="pdir-name">${escHtml(p.name)}</div>
        <div class="pdir-meta">
          <span class="pdir-tag">${p.id} · G${p.group}</span>
          ${streakHtml}
          <span class="sep">·</span>
          <span style="color:${wrc};font-weight:700;">${s.total > 0 ? s.winRate + '%' : '—'}</span>
          <span class="sep">·</span>
          <span style="color:${pdc};font-weight:700;">${pd > 0 ? '+' : ''}${pd}</span>
        </div>
      </div>
      ${actions}
      <div class="pdir-pts"><b>${s.pts || 0}</b><span>PTS</span></div>
    </div>`;
  }).join('');
}

