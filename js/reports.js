// ── REPORTS & SORT STATE ──
const sortState = { players: { col: 'pts', dir: 'desc' }, matches: { col: 'id', dir: 'desc' } };
function sortPlayers(col) { if (sortState.players.col === col) sortState.players.dir = sortState.players.dir==='asc'?'desc':'asc'; else { sortState.players.col = col; sortState.players.dir = ['name','id','team'].includes(col) ? 'asc' : 'desc'; } renderReports(); }
function sortMatches(col) { if (sortState.matches.col === col) sortState.matches.dir = sortState.matches.dir==='asc'?'desc':'asc'; else { sortState.matches.col = col; sortState.matches.dir = ['redNames','blueNames','result'].includes(col) ? 'asc' : 'desc'; } renderReports(); }
function updateSortIcons(tableId, state) { document.querySelectorAll(`#${tableId} thead th.sortable`).forEach(th => { th.classList.remove('sort-asc','sort-desc'); const icon = th.querySelector('.sort-icon'); if (!icon) return; const colMap = { mid:'id', mresult:'result' }; const key = colMap[icon.getAttribute('data-col')] || icon.getAttribute('data-col'); if (key === state.col) th.classList.add(state.dir==='asc'?'sort-asc':'sort-desc'); }); }
let activeGroup = ''; function setGroupFilter(g) { activeGroup = g; ['gpAll','gp1','gp2','gp3'].forEach(id => document.getElementById(id)?.classList.remove('active')); const target = g === '' ? 'gpAll' : `gp${g}`; document.getElementById(target)?.classList.add('active'); renderReports(); }

// ── Report sub-tab switcher ──
let _activeReportTab = 'players';
function switchReportTab(tab, btn) {
  _activeReportTab = tab;
  document.querySelectorAll('.rpt-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rpt-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = document.getElementById('rpanel-' + tab);
  if (panel) panel.classList.add('active');

  // Lazy-render each tab on first open
  if (tab === 'players')  { renderReports(); renderReportHero(); }
  if (tab === 'ranking')  renderPerfRanking();
  if (tab === 'rounds')   renderRoundsReport();
  if (tab === 'matches')  renderPerformance();
  if (tab === 'history')  renderReports();
  if (tab === 'chart')    renderChartOnly();
  if (tab === 'umpire')   renderUmpireWorkload();
}

function renderUmpireWorkload() {
  const el = document.getElementById('umpireWorkloadContent');
  if (!el) return;
  const hist = appState.matchHistory || [];
  const live = appState.ongoingMatches || [];

  // ── รวบรวมข้อมูล umpire ──
  const map = {}; // { name: { done, live, total, matches[] } }

  hist.forEach(m => {
    const u = (m.umpire || 'ไม่ระบุ').trim();
    if (!map[u]) map[u] = { done: 0, live: 0, matches: [] };
    map[u].done++;
    map[u].matches.push({ id: m.id, round: m.round, result: m.result, rStat: m.rStat });
  });

  live.forEach(m => {
    if (!m.umpire) return;
    const u = m.umpire.trim();
    if (!map[u]) map[u] = { done: 0, live: 0, matches: [] };
    map[u].live++;
  });

  const umpires = Object.entries(map)
    .map(([name, d]) => ({ name, done: d.done, live: d.live, total: d.done + d.live, matches: d.matches }))
    .sort((a, b) => b.total - a.total);

  if (umpires.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);font-size:14px;">ยังไม่มีข้อมูล Umpire</div>`;
    return;
  }

  const maxTotal = umpires[0].total || 1;
  const avg = umpires.reduce((s, u) => s + u.done, 0) / umpires.length;

  const rows = umpires.map((u, i) => {
    const pct = Math.round(u.total / maxTotal * 100);
    const overloaded = u.done > avg * 1.5 && umpires.length > 1;
    const barColor = overloaded ? 'var(--danger)' : u.live > 0 ? 'var(--green)' : 'var(--gold)';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const liveBadge = u.live > 0
      ? `<span style="font-size:10px;font-weight:800;padding:1px 7px;border-radius:10px;background:rgba(0,230,118,0.12);color:var(--green);border:1px solid rgba(0,230,118,0.25);">● LIVE ×${u.live}</span>` : '';
    const warnBadge = overloaded
      ? `<span style="font-size:10px;font-weight:800;padding:1px 7px;border-radius:10px;background:rgba(255,59,92,0.1);color:var(--danger);border:1px solid rgba(255,59,92,0.25);">⚠️ เยอะเกิน</span>` : '';

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
          <span style="font-size:1.1em;flex-shrink:0;">${medal}</span>
          <span style="font-size:15px;font-weight:700;color:var(--text);">👔 ${escHtml(u.name)}</span>
          ${liveBadge}${warnBadge}
          <span style="margin-left:auto;font-family:'Bebas Neue',sans-serif;font-size:1.5em;color:${barColor};">${u.total}</span>
          <span style="font-size:10px;color:var(--muted);letter-spacing:1px;">แมตช์</span>
        </div>
        <!-- Bar -->
        <div style="height:8px;border-radius:4px;background:var(--surface2);overflow:hidden;margin-bottom:8px;">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.5s;"></div>
        </div>
        <!-- Stats row -->
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <span style="font-size:12px;color:var(--muted);">✅ จบแล้ว <b style="color:var(--text);">${u.done}</b></span>
          <span style="font-size:12px;color:var(--muted);">⏱ กำลังตัดสิน <b style="color:var(--green);">${u.live}</b></span>
          <span style="font-size:12px;color:var(--muted);">📊 เฉลี่ยทั้งหมด <b style="color:var(--gold);">${Math.round(avg * 10) / 10}</b> แมตช์/คน</span>
        </div>
      </div>`;
  }).join('');

  // Summary header
  const totalDone = hist.length;
  const liveCount = live.filter(m => m.umpire).length;

  el.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.4em;letter-spacing:3px;color:var(--gold);margin-bottom:4px;">👔 UMPIRE WORKLOAD</div>
      <div style="font-size:12px;color:var(--muted);">รวม ${umpires.length} คน · ${totalDone} แมตช์จบแล้ว · ${liveCount} กำลังตัดสิน</div>
    </div>
    ${rows}`;
}


function renderChartOnly() {
  // Chart is inside rpanel-chart — trigger statsChart update
  // renderReports() already populates it, just call it if statsChart is empty
  const chart = document.getElementById('statsChart');
  if (chart && chart.children.length <= 1) renderReports();
}

// ── Hero stats row ──
function renderReportHero() {
  if (!appState) return;
  const hist = appState.matchHistory || [];
  const total      = hist.length;
  const redWins    = hist.filter(m => m.rStat === 'W').length;
  const blueWins   = hist.filter(m => m.bStat === 'W').length;
  const draws      = hist.filter(m => m.rStat === 'D').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('rptHeroMatches',  total   || '—');
  set('rptHeroRedWins',  redWins || '—');
  set('rptHeroDraws',    draws   || '—');
  set('rptHeroBlueWins', blueWins|| '—');
}

function renderReports() {
  const stats = getPlayerStats(); // FIX-7: use shared stats builder
  
  const rSearch = (document.getElementById('reportSearch')?.value || '').toLowerCase(); 
  const rTeam = document.getElementById('reportFilterTeam')?.value || ''; 
  const mSearch = (document.getElementById('matchSearch')?.value || '').toLowerCase();
  
  const { col: pCol, dir: pDir } = sortState.players; 
  const playerArr = Object.values(stats).filter(s => (!rSearch || s.name.toLowerCase().includes(rSearch) || s.id.toLowerCase().includes(rSearch)) && (!rTeam || s.team === rTeam) && (!activeGroup || s.group === activeGroup)).sort((a,b) => { 
    let av=a[pCol], bv=b[pCol];
    if(typeof av==='string'){av=av.toLowerCase();bv=bv.toLowerCase();} 
    return pDir==='asc'?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0); 
  });
  
  renderChart(playerArr); 
  const byPts = [...playerArr].sort((a,b)=>b.pts-a.pts || b.pointDiff-a.pointDiff || b.w-a.w); 
  const medalMap = {}; byPts.forEach((p,i) => { if(p.pts>0) medalMap[p.id] = i===0?'🥇':i===1?'🥈':i===2?'🥉':''; });

  // ── Player stat summary cards ──
  const summCards = document.getElementById('playerStatCards');
  if (summCards) {
    const totalPts = playerArr.reduce((s,p)=>s+(p.pts||0),0);
    const avgWR    = playerArr.length ? Math.round(playerArr.reduce((s,p)=>s+(p.winRate||0),0)/playerArr.length) : 0;
    const epicPlayers = playerArr.filter(p=>p.epicTags>0).length;
    const topPts   = byPts[0];
    summCards.innerHTML = [
      { lbl:'PLAYERS',    val: playerArr.length,                   color: 'var(--text)' },
      { lbl:'TOTAL PTS',  val: totalPts,                           color: 'var(--gold)' },
      { lbl:'AVG WR',     val: avgWR+'%',                          color: avgWR>=50?'var(--green)':'var(--danger)' },
      { lbl:'EPIC KINGS', val: epicPlayers,                        color: 'var(--red)' },
      { lbl:'LEADER',     val: topPts ? escHtml(topPts.name) : '—',color: topPts?.team==='Red'?'var(--red)':'var(--blue)' },
    ].map(c => `<div class="pstat-card">
      <div class="pstat-card-val" style="color:${c.color};">${c.val}</div>
      <div class="pstat-card-lbl">${c.lbl}</div>
    </div>`).join('');
  }
  
  // FIX-8: build rows as array then join → single innerHTML set (no repeated DOM re-parse)
  const stb = document.getElementById('statsTableBody');
  stb.innerHTML = playerArr.map(s => { 
    const medal = medalMap[s.id] ? `${medalMap[s.id]} ` : ''; 
    const wrColor = s.winRate>=70?'var(--green)':s.winRate>=40?'var(--gold)':s.total>0?'var(--danger)':'var(--muted)'; 
    const diffColor = s.pointDiff > 0 ? 'var(--green)' : s.pointDiff < 0 ? 'var(--danger)' : 'var(--muted)';
    const diffSign = s.pointDiff > 0 ? '+' : '';
    let specTags = '';
    if (s.epicTags > 0) specTags += `<span style="margin-right:4px;" title="Epic Comebacks">🔥${s.epicTags}</span>`;
    if (s.clutchTags > 0) specTags += `<span style="margin-right:4px;" title="Gladiators">⚔️${s.clutchTags}</span>`;
    if (s.marathonTags > 0) specTags += `<span style="margin-right:4px;" title="Marathon">🏃‍♂️${s.marathonTags}</span>`;
    if (s.rollerTags > 0) specTags += `<span style="margin-right:4px;" title="Rollercoaster">🎢${s.rollerTags}</span>`;
    const wrBarColor = s.winRate>=70?'var(--green)':s.winRate>=40?'var(--gold)':'var(--danger)';
    const wrCell = s.total > 0
      ? `<div class="wr-cell">
           <span style="font-weight:700;color:${wrColor};min-width:32px;">${s.winRate}%</span>
           <div class="wr-bar-wrap"><div class="wr-bar-fill" style="width:${s.winRate}%;background:${wrBarColor};"></div></div>
         </div>`
      : '—';
    return `<tr>
      <td class="gold-text">${s.id}</td>
      <td><span style="cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(255,255,255,0.2);" onclick="openPlayerProfile('${s.id}')" title="ดู Player Profile">${medal}${escHtml(s.name)}</span></td>
      <td class="${s.team==='Red'?'red-text':'blue-text'}">${s.team}</td>
      <td>${s.group}</td>
      <td style="font-size:1.1em;font-weight:700;color:var(--gold)">${s.pts}</td>
      <td style="font-weight:700;color:${diffColor}">${diffSign}${s.pointDiff}</td>
      <td><span class="stat-pill pill-win">${s.w}W</span></td>
      <td><span class="stat-pill pill-lose">${s.l}L</span></td>
      <td style="color:var(--gold);font-weight:700;">${s.matchDraw||0}</td>
      <td>${s.matchesPlayed||0}</td>
      <td style="min-width:100px;">${wrCell}</td>
      <td style="font-size:12px;">${specTags}</td>
      <td style="white-space:nowrap;"><span class="stat-pill pill-win" style="font-size:10px;">${s.matchWin||0}W</span> <span class="stat-pill pill-lose" style="font-size:10px;">${s.matchLose||0}L</span></td>
      <td style="font-weight:700;color:${(s.matchWinRate||0)>=60?'var(--green)':(s.matchWinRate||0)>=40?'var(--gold)':s.matchesPlayed>0?'var(--danger)':'var(--muted)'};">${s.matchesPlayed>0?(s.matchWinRate||0)+'%':'—'}</td>
      <td>${(function(){ const sk=getPlayerStreak(s.id); return sk?'<span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:10px;background:'+sk.bg+';color:'+sk.color+';border:1px solid '+sk.border+';">'+sk.label+'</span>':'<span style="color:var(--muted);font-size:10px;">—</span>'; })()}</td>
    </tr>`;
  }).join(''); 
  updateSortIcons('playerStatsTable', sortState.players);
  // Only refresh ranking if its panel is active
  if (_activeReportTab === 'ranking') renderPerfRanking();
  
  const { col: mCol, dir: mDir } = sortState.matches; 
  const matchArr = [...appState.matchHistory].filter(m => !mSearch || m.id.toLowerCase().includes(mSearch) || m.redNames.toLowerCase().includes(mSearch) || m.blueNames.toLowerCase().includes(mSearch)).sort((a,b) => { 
    let av=a[mCol],bv=b[mCol]; if(mCol==='round'){av=parseInt(av);bv=parseInt(bv);} 
    if(typeof av==='string'){av=av.toLowerCase();bv=bv.toLowerCase();} 
    return mDir==='asc'?(av<bv?-1:av>bv?1:0):(av>bv?-1:av<bv?1:0); 
  });
  
  const htb = document.getElementById('historyTableBody'); 
  if (htb) {
      // FIX-8b: use map+join instead of innerHTML += in loop
      htb.innerHTML = matchArr.map(m => { 
          const rc = m.rStat==='W'?'red-text':m.bStat==='W'?'blue-text':'gold-text'; 
          return `<tr><td class="gold-text">${m.id}</td><td>R${m.round}</td><td class="red-text">${escHtml(m.redNames)}</td><td class="blue-text">${escHtml(m.blueNames)}</td><td>${m.game1}</td><td>${m.game2}</td><td class="${rc}" style="font-weight:700">${escHtml(m.result||'')}</td><td style="color:var(--gold);">${escHtml(m.umpire||'-')}</td><td><button class="btn btn-sm" onclick="openEditResult('${m.id}')" style="background:rgba(245,200,66,0.1);color:var(--gold);border:1px solid rgba(245,200,66,0.2);font-size:12px;padding:4px 10px;">✏️ Edit</button></td></tr>`;
      }).join(''); 
      updateSortIcons('matchDetailsTable', sortState.matches); 
  }
}

// ฟังก์ชันสร้างและดาวน์โหลดไฟล์ CSV
