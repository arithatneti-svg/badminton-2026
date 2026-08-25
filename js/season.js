// ══════════════════════════════════════════
// SEASON SYSTEM
// ══════════════════════════════════════════

const masterPlayersRef   = firebase.database().ref('masterPlayers');
const seasonsArchiveRef  = firebase.database().ref('seasons_archive');
let _masterPlayers = {}; // cache

// โหลด masterPlayers ครั้งเดียวตอน init
masterPlayersRef.once('value').then(snap => {
  _masterPlayers = snap.val() || {};
});

// ── Profile Tabs ──
function switchPdTab(tabId, btn) {
  document.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('pdTab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  if (el) el.classList.add('active');
  if (tabId === 'career'  && _pdCurrentId) renderCareerTab(_pdCurrentId);
  if (tabId === 'matches' && _pdCurrentId) { renderPdMatchHistory(_pdCurrentId); renderPdH2H(_pdCurrentId); }
}

// ── Career / All-Time Stats Tab ──
async function renderCareerTab(playerId) {
  const el = document.getElementById('pdCareerContent');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:24px;font-size:13px;">⏳ กำลังโหลดข้อมูล career...</div>`;

  // ดึง seasons_archive ทั้งหมด
  const snap = await seasonsArchiveRef.once('value');
  const archives = snap.val() || {};
  const player = ( appState.players || [] ).find(p => p.id === playerId);
  if (!player) return;

  // รวม current season stats
  const currentStats = getPlayerStats()[playerId] || {};
  const currentProf  = (appState.playerProfiles || {})[playerId] || {};
  const allSeasons = [];

  // ดึงจาก archives
  Object.entries(archives).sort((a,b) => a[0].localeCompare(b[0])).forEach(([year, data]) => {
    const pList = data.players || [];
    const pInSeason = pList.find(p => p.id === playerId || p.name === player.name);
    if (!pInSeason) return;
    const mHistory = data.matchHistory || [];
    let w=0, l=0, d=0, pts=0;
    mHistory.forEach(h => {
      const isRed  = [h.r1,h.r2].includes(playerId);
      const isBlue = [h.b1,h.b2].includes(playerId);
      if (!isRed && !isBlue) return;
      const stat = isRed ? h.rStat : h.bStat;
      if (stat==='W') { w++; pts += (h.pRed||0) > 0 ? (isRed?h.pRed:h.pBlue) : 3; }
      else if (stat==='L') l++;
      else if (stat==='D') { d++; pts += isRed ? (h.pRed||1) : (h.pBlue||1); }
    });
    allSeasons.push({ year, team: pInSeason.team||'—', group: pInSeason.group||'—', w, l, d, pts,
      winRate: w+l+d>0 ? Math.round(w/(w+l+d)*100) : 0 });
  });

  // เพิ่ม current season — ใช้ matchWin/matchLose/matchDraw (match-level) ให้ consistent กับ archive
  allSeasons.push({
    year: 'ปัจจุบัน (2026)', team: player.team, group: player.group,
    w: currentStats.matchWin||0, l: currentStats.matchLose||0, d: currentStats.matchDraw||0, pts: currentStats.pts||0,
    winRate: (() => { const w=currentStats.matchWin||0, l=currentStats.matchLose||0, d=currentStats.matchDraw||0; return w+l+d>0?Math.round(w/(w+l+d)*100):0; })(), isCurrent: true
  });

  if (allSeasons.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:24px;font-size:13px;">ยังไม่มีข้อมูล Career</div>`;
    return;
  }

  // All-time totals
  const totalW = allSeasons.reduce((s,x)=>s+x.w,0);
  const totalL = allSeasons.reduce((s,x)=>s+x.l,0);
  const totalD = allSeasons.reduce((s,x)=>s+(x.d||0),0);
  const totalPts = allSeasons.reduce((s,x)=>s+x.pts,0);
  const overallWR = totalW+totalL+totalD>0 ? Math.round(totalW/(totalW+totalL+totalD)*100) : 0;
  const wrc = overallWR>=60?'var(--green)':overallWR>=40?'var(--gold)':'var(--danger)';

  el.innerHTML = `
    <!-- All-time summary -->
    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.08),rgba(245,200,66,0.02));border:1px solid rgba(245,200,66,0.2);border-radius:14px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:var(--gold);margin-bottom:12px;">🏆 ALL-TIME CAREER</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--green);">${totalW}</div><div class="career-stat-lbl">WINS</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--danger);">${totalL}</div><div class="career-stat-lbl">LOSSES</div></div>
        ${totalD>0?`<div class="career-stat-box"><div class="career-stat-val" style="color:var(--gold);">${totalD}</div><div class="career-stat-lbl">DRAWS</div></div>`:''}
        <div class="career-stat-box"><div class="career-stat-val" style="color:${wrc};">${overallWR}%</div><div class="career-stat-lbl">WIN RATE</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--gold);">${totalPts}</div><div class="career-stat-lbl">TOTAL PTS</div></div>
        <div class="career-stat-box"><div class="career-stat-val" style="color:var(--text);">${allSeasons.length}</div><div class="career-stat-lbl">SEASONS</div></div>
      </div>
    </div>

    <!-- Win rate bar -->
    <div style="margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:2px;font-weight:700;color:var(--muted);margin-bottom:6px;">OVERALL WIN RATE</div>
      <div style="height:10px;border-radius:5px;overflow:hidden;background:var(--surface3);display:flex;">
        <div style="width:${overallWR}%;background:var(--green);transition:width 0.6s;"></div>
        <div style="width:${100-overallWR}%;background:var(--danger);opacity:0.5;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:3px;">
        <span style="color:var(--green);">Win ${overallWR}%</span>
        <span style="color:var(--danger);">Loss ${100-overallWR}%</span>
      </div>
    </div>

    <!-- Per-season breakdown -->
    <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:var(--muted);margin-bottom:10px;">SEASON HISTORY</div>
    ${allSeasons.slice().reverse().map(s => {
      const wrcS = s.winRate>=60?'var(--green)':s.winRate>=40?'var(--gold)':'var(--danger)';
      const tc = s.team==='Red'?'var(--red)':s.team==='Blue'?'var(--blue)':'var(--muted)';
      return `<div class="career-season-card" ${s.isCurrent?'style="border-color:rgba(245,200,66,0.3);"':''}>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="career-season-label">${s.isCurrent?'🟢 ':''} ${s.year}</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${s.team==='Red'?'rgba(255,59,92,0.1)':'rgba(59,142,255,0.1)'};color:${tc};">● ${s.team||'—'}</span>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--surface3);color:var(--muted);">G${s.group||'—'}</span>
          </div>
        </div>
        <div class="career-stat-row">
          <div class="career-stat-box"><div class="career-stat-val" style="color:var(--green);">${s.w}</div><div class="career-stat-lbl">W</div></div>
          <div class="career-stat-box"><div class="career-stat-val" style="color:var(--danger);">${s.l}</div><div class="career-stat-lbl">L</div></div>
          ${(s.d||0)>0?`<div class="career-stat-box"><div class="career-stat-val" style="color:var(--gold);">${s.d}</div><div class="career-stat-lbl">D</div></div>`:''}
          <div class="career-stat-box"><div class="career-stat-val" style="color:${wrcS};">${s.winRate}%</div><div class="career-stat-lbl">WR</div></div>
          <div class="career-stat-box"><div class="career-stat-val" style="color:var(--gold);">${s.pts}</div><div class="career-stat-lbl">PTS</div></div>
        </div>
      </div>`;
    }).join('')}
  `;
}

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
    const year = new Date().getFullYear().toString();
    const snapshot = {
      year,
      archivedAt: new Date().toISOString(),
      globalScoreRed:  appState.globalScoreRed  || 0,
      globalScoreBlue: appState.globalScoreBlue || 0,
      players:         appState.players         || [],
      matchHistory:    appState.matchHistory     || [],
      playerProfiles:  appState.playerProfiles   || {},
      seasonName:      `Sports Day ${year}`,
    };
    await seasonsArchiveRef.child(year).set(snapshot);
    // save season stats to masterPlayers
    const playerStats = getPlayerStats();
    const updates = {};
    (appState.players||[]).forEach(p => {
      const stats = playerStats[p.id] || {};
      updates[`${p.id}/seasonHistory/${year}`] = {
        wins: stats.w||0, losses: stats.l||0,
        pts: stats.pts||0, team: p.team, group: p.group
      };
    });
    if (Object.keys(updates).length) await masterPlayersRef.update(updates);
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(0,230,118,0.08)';
    statusEl.style.border = '1px solid rgba(0,230,118,0.2)';
    statusEl.style.color = 'var(--green)';
    statusEl.textContent = `✅ Archive season ${year} สำเร็จ! (${(appState.matchHistory||[]).length} แมตช์)`;
    setTimeout(() => wzGoStep(2), 1200);
  } catch(e) {
    statusEl.style.display='block';
    statusEl.style.background='rgba(255,59,92,0.08)';
    statusEl.style.color='var(--danger)';
    statusEl.textContent = `❌ Error: ${e.message}`;
    btn.disabled = false; btn.textContent = '📦 Archive Now';
  }
}
function wzSkipArchive() { wzGoStep(2); }

function wzBuildReassignGrid() {
  _wzReassignData = (appState.players||[]).map(p => ({...p}));
  const grid = document.getElementById('wzReassignGrid');
  grid.innerHTML = _wzReassignData.map((p,i) => `
    <div class="reassign-card">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue';font-size:0.85em;color:var(--muted);flex-shrink:0;">${p.id}</div>
      <div class="reassign-name">${escHtml(p.name)}</div>
      <select class="reassign-select" data-idx="${i}" data-field="team" onchange="wzUpdatePlayer(this)">
        <option value="Red"  ${p.team==='Red' ?'selected':''}>🔴 Red</option>
        <option value="Blue" ${p.team==='Blue'?'selected':''}>🔵 Blue</option>
      </select>
      <select class="reassign-select" data-idx="${i}" data-field="group" onchange="wzUpdatePlayer(this)" style="width:48px;">
        <option value="1" ${p.group==='1'?'selected':''}>G1</option>
        <option value="2" ${p.group==='2'?'selected':''}>G2</option>
        <option value="3" ${p.group==='3'?'selected':''}>G3</option>
      </select>
    </div>`).join('');
}

function wzUpdatePlayer(sel) {
  const idx = Number(sel.dataset.idx);
  _wzReassignData[idx][sel.dataset.field] = sel.value;
}

function wzShufflePlayers() {
  const shuffled = [..._wzReassignData];
  for (let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i].team,shuffled[j].team]=[shuffled[j].team,shuffled[i].team];}
  _wzReassignData = shuffled;
  wzBuildReassignGrid();
  showToast('🎲 Shuffled! แก้ได้ตามต้องการ', 'info');
}

function wzBuildConfirmSummary() {
  const year = document.getElementById('wzNewSeasonYear').value || '2027';
  const name = document.getElementById('wzNewSeasonName').value || `Sports Day ${year}`;
  const reds = _wzReassignData.filter(p=>p.team==='Red').length;
  const blues = _wzReassignData.filter(p=>p.team==='Blue').length;
  document.getElementById('wzConfirmSummary').innerHTML = `
    <b style="color:var(--gold);">📅 Season ใหม่:</b> ${escHtml(name)}<br>
    <b style="color:var(--gold);">🗓️ ปี:</b> ${escHtml(year)}<br>
    <b style="color:var(--gold);">👥 ผู้เล่น:</b> ${_wzReassignData.length} คน
    (🔴 Red ${reds} คน / 🔵 Blue ${blues} คน)<br>
    <b style="color:var(--danger);">🗑️ จะ Reset:</b> ผลการแข่ง, คะแนนทีม, ongoing matches<br>
    <b style="color:var(--green);">✅ ยกมา:</b> ผู้เล่น (พร้อมทีมที่ assign ใหม่), ability stats
  `;
}

function wzConfirmNewSeason() {
  if (userRole !== 'superadmin') return;
  const year = document.getElementById('wzNewSeasonYear').value || '2027';
  const name = document.getElementById('wzNewSeasonName').value || `Sports Day ${year}`;
  // อัพเดทผู้เล่นตาม reassign
  const newPlayers = _wzReassignData.map(p => ({...p}));
  appState.players       = newPlayers;
  appState.matchHistory  = [];
  appState.ongoingMatches= [];
  appState.matchCounter  = 1;
  appState.globalScoreRed  = 0;
  appState.globalScoreBlue = 0;
  appState.redTeamName  = 'RED TEAM';
  appState.blueTeamName = 'BLUE TEAM';
  // อัพเดท nav title
  document.getElementById('seasonNavTitle').textContent = `SPORTS DAY ${year}`;
  document.getElementById('seasonBadge').textContent = `📅 ${year}`;
  saveData(true);
  closeSeasonWizard();
  showToast(`🚀 Season ${name} เริ่มแล้ว!`, 'success');
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
  const search=(document.getElementById('playersTabSearch')?.value||'').toLowerCase();
  const fTeam =document.getElementById('playersTabFilterTeam')?.value||'';
  const fGroup=document.getElementById('playersTabFilterGroup')?.value||'';
  const stats = getPlayerStats();
  const players=appState.players.filter(p => {
    if (fTeam && p.team!==fTeam) return false;
    if (fGroup && p.group!==fGroup) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    const fStyle = document.getElementById('playersTabFilterStyle')?.value||'';
    if (fStyle && !(appState.playerProfiles?.[p.id]?.styles||[]).includes(fStyle)) return false;
    return true;
  });
  const sortBy = document.getElementById('playersTabSortBy')?.value || 'pts';
  players.sort((a,b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'winRate') return (stats[b.id]?.winRate||0) - (stats[a.id]?.winRate||0);
    if (sortBy === 'pointDiff') return (stats[b.id]?.pointDiff||0) - (stats[a.id]?.pointDiff||0);
    if (sortBy === 'style') {
      const sa = (appState.playerProfiles?.[a.id]?.styles||[])[0]||'zzz';
      const sb = (appState.playerProfiles?.[b.id]?.styles||[])[0]||'zzz';
      return sa.localeCompare(sb);
    }
    return (stats[b.id]?.pts||0)-(stats[a.id]?.pts||0)||a.group-b.group;
  });
  if (!players.length) {
    grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted);font-size:14px;background:var(--surface2);border-radius:12px;border:1px dashed var(--border);">ไม่พบผู้เล่น</div>`;
    return;
  }
  grid.innerHTML=players.map(p => {
    const s=stats[p.id]||{}, prof=(appState.playerProfiles||{})[p.id]||{};
    const isRed=p.team==='Red', tc=isRed?'var(--red)':'var(--blue)';
    const wrc=s.winRate>=70?'var(--green)':s.winRate>=50?'#2dd4bf':s.winRate>=40?'var(--gold)':s.total>0?'var(--danger)':'var(--muted)';
    // streak badge
    const streak = getPlayerStreak(p.id);
    const streakHtml = streak
      ? `<span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;background:${streak.bg};color:${streak.color};border:1px solid ${streak.border};">${streak.label}</span>`
      : '';
    // style badges (no form badge)
    const delBtnHtml = userRole === 'superadmin'
      ? `<button class="btn btn-danger btn-sm" style="font-size:11px;padding:4px 8px;flex-shrink:0;" title="ลบผู้เล่น" onclick="event.stopPropagation();deletePlayer('${p.id}')">🗑</button>`
      : '';
    return `<div class="match-card" style="cursor:pointer;border-top:2px solid ${tc};" onclick="openPlayerProfile('${p.id}')">
      <div class="match-card-inner">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="width:38px;height:38px;border-radius:50%;background:${isRed?'rgba(255,59,92,0.1)':'rgba(59,142,255,0.1)'};border:1.5px solid ${tc};display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue';font-size:1em;color:${tc};flex-shrink:0;">${p.id}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:700;line-height:1.2;">${escHtml(p.name)}</div>
            <div style="display:flex;gap:5px;margin-top:3px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${isRed?'rgba(255,59,92,0.1)':'rgba(59,142,255,0.1)'};color:${tc};">G${p.group}</span>
              ${streakHtml}
            </div>
          </div>
          ${delBtnHtml}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;">
          <div style="background:var(--surface2);border-radius:8px;padding:6px 4px;"><div style="font-family:'Bebas Neue';font-size:1.4em;color:var(--gold);">${s.pts||0}</div><div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px;">PTS</div></div>
          <div style="background:var(--surface2);border-radius:8px;padding:6px 4px;"><div style="font-family:'Bebas Neue';font-size:1.4em;color:${wrc};">${s.total>0?s.winRate+'%':'—'}</div><div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px;">WIN%</div></div>
          <div style="background:var(--surface2);border-radius:8px;padding:6px 4px;"><div style="font-family:'Bebas Neue';font-size:1.4em;color:${(s.pointDiff||0)>=0?'var(--green)':'var(--danger)'};">${(s.pointDiff||0)>0?'+':''}${s.pointDiff||0}</div><div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:0.5px;">PD</div></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

