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
  if (tab === 'undover')  renderUndOverReport();
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

// ══════════════════════════════════════════
// UNDERRATE / OVERRATE REPORT
// Logic:
//  expectedWR = f(baseScore) — ผู้เล่น baseScore สูงควรชนะมากกว่า
//  actualWR   = ค่า winRate จริงจาก matchHistory
//  diff = actualWR - expectedWR
//  diff > +15% → Underrated (เก่งกว่า base)
//  diff < -15% → Overrated  (อ่อนกว่า base)
// ══════════════════════════════════════════
function renderUndOverReport() {
  const el = document.getElementById('undOverContent');
  if (!el) return;

  const stats   = getPlayerStats();
  const players = appState.players || [];
  const profiles = appState.playerProfiles || {};

  // คำนวณ expectedWinRate จาก baseScore (scale 0.5-3.0 → 30%-70%)
  // BS 0.5=30%, 1.0=40%, 1.5=50%, 2.0=56%, 2.5=62%, 3.0=70%
  const expectedWR = bs => {
    const score = parseFloat(bs) || 1.5;
    return Math.round(30 + Math.max(0, score - 0.5) / 2.5 * 40);
  };

  // ปรับตาม BaseScore คู่แข่งที่เจอจริงๆ ±8%
  const getOppBaseAdj = (playerId) => {
    const prof = profiles[playerId] || {};
    const myBs = parseFloat(prof.baseScore) || 1.5;
    const myMatches = (appState.matchHistory || []).filter(m =>
      m.r1 === playerId || m.r2 === playerId || m.b1 === playerId || m.b2 === playerId
    );
    if (myMatches.length === 0) return 0;
    let totalOppBs = 0, count = 0;
    myMatches.forEach(h => {
      const isRed = h.r1 === playerId || h.r2 === playerId;
      const oppIds = isRed ? [h.b1, h.b2] : [h.r1, h.r2];
      oppIds.forEach(oid => {
        const op = profiles[oid] || {};
        const obs = parseFloat(op.baseScore);
        if (!isNaN(obs)) { totalOppBs += obs; count++; }
      });
    });
    if (count === 0) return 0;
    const avgOppBs = totalOppBs / count;
    return Math.max(-8, Math.min(8, Math.round((myBs - avgOppBs) * 4)));
  };

  const results = players.map(p => {
    const s    = stats[p.id] || {};
    const prof = profiles[p.id] || {};
    const bs   = parseFloat(prof.baseScore) || null;
    const wr   = s.winRate !== undefined ? s.winRate : null;
    const matches = s.matchesPlayed || s.total || 0;

    if (bs === null || wr === null || matches < 2) return null;

    const oppAdj = getOppBaseAdj(p.id);
    const exp    = expectedWR(bs) - oppAdj;
    const diff   = wr - exp;

    const pd     = s.pointDiff || 0;
    const pdNorm = Math.max(-1, Math.min(1, pd / (matches * 5)));
    const adjDiff = diff + pdNorm * 5;

    let verdict = 'balanced';
    if (adjDiff >= 15)       verdict = 'underrated';
    else if (adjDiff <= -15) verdict = 'overrated';
    else if (adjDiff >= 7)   verdict = 'slight-under';
    else if (adjDiff <= -7)  verdict = 'slight-over';

    return { p, s, prof, bs, wr, exp: Math.round(exp), diff: Math.round(adjDiff), oppAdj, pd, matches, verdict };
  }).filter(Boolean);

  if (results.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);font-size:14px;">ต้องมีข้อมูล Base Score และแข่งอย่างน้อย 2 แมตช์ถึงจะวิเคราะห์ได้</div>`;
    return;
  }

  // แยกกลุ่ม
  const underrated   = results.filter(r => r.verdict === 'underrated').sort((a,b) => b.diff - a.diff);
  const slightUnder  = results.filter(r => r.verdict === 'slight-under').sort((a,b) => b.diff - a.diff);
  const balanced     = results.filter(r => r.verdict === 'balanced').sort((a,b) => b.diff - a.diff);
  const slightOver   = results.filter(r => r.verdict === 'slight-over').sort((a,b) => a.diff - b.diff);
  const overrated    = results.filter(r => r.verdict === 'overrated').sort((a,b) => a.diff - b.diff);

  const makeCard = (r, showBadge) => {
    const teamColor = r.p.team === 'Red' ? 'var(--red)' : 'var(--blue)';
    const diffColor = r.diff > 0 ? 'var(--green)' : r.diff < 0 ? 'var(--danger)' : 'var(--muted)';
    const diffSign  = r.diff > 0 ? '+' : '';
    const suggestBS = r.diff >= 15 ? Math.min(3.0, parseFloat(r.bs) + 0.5).toFixed(1)
                    : r.diff <= -15 ? Math.max(0.5, parseFloat(r.bs) - 0.5).toFixed(1)
                    : r.bs;
    const suggestChanged = suggestBS != r.bs;
    const oppAdjText = (r.oppAdj && r.oppAdj !== 0)
      ? `<span style="font-size:9px;color:${r.oppAdj > 0 ? 'var(--gold)' : 'var(--muted)'};" title="ปรับตาม BaseScore คู่แข่งที่เจอ">⚖️ opp ${r.oppAdj > 0 ? '+' : ''}${r.oppAdj}%</span>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:${teamColor};">${escHtml(r.p.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
            <span>BS ${r.bs}</span><span>·</span><span>G${r.p.group}</span><span>·</span><span>${r.matches} แมตช์</span>
            ${oppAdjText}
          </div>
        </div>
        <div style="text-align:center;min-width:48px;">
          <div style="font-size:10px;color:var(--muted);">คาดไว้</div>
          <div style="font-size:13px;font-weight:700;color:var(--muted);">${r.exp}%</div>
        </div>
        <div style="text-align:center;min-width:48px;">
          <div style="font-size:10px;color:var(--muted);">จริง</div>
          <div style="font-size:13px;font-weight:700;color:${teamColor};">${r.wr}%</div>
        </div>
        <div style="text-align:center;min-width:44px;">
          <div style="font-size:10px;color:var(--muted);">diff</div>
          <div style="font-size:13px;font-weight:700;color:${diffColor};">${diffSign}${r.diff}%</div>
        </div>
        ${suggestChanged ? `<div style="text-align:center;min-width:60px;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.25);border-radius:8px;padding:4px 8px;">
          <div style="font-size:9px;color:var(--gold);font-weight:700;">แนะนำ BS</div>
          <div style="font-size:13px;font-weight:800;color:var(--gold);">${suggestBS}</div>
        </div>` : `<div style="min-width:60px;text-align:center;font-size:10px;color:var(--muted);">คงเดิม</div>`}
      </div>`;
  };

  const makeSection = (title, icon, color, bg, items) => {
    if (items.length === 0) return '';
    return `
      <div style="background:${bg};border:1px solid ${color}30;border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <div style="padding:10px 16px 8px;border-bottom:1px solid ${color}20;display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${icon}</span>
          <span style="font-size:11px;font-weight:800;letter-spacing:2px;color:${color};">${title} (${items.length} คน)</span>
        </div>
        ${items.map(r => makeCard(r)).join('')}
      </div>`;
  };

  el.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:1.4em;letter-spacing:3px;color:var(--gold);margin-bottom:4px;">📈 UNDER / OVERRATE ANALYSIS</div>
      <div style="font-size:11px;color:var(--muted);line-height:1.6;">
        เปรียบ <b style="color:var(--text);">Win Rate จริง</b> กับ <b style="color:var(--text);">Expected WR จาก Base Score</b> (ปรับตามความแข็งของคู่แข่ง)<br>
        <b style="color:var(--green);">Underrated ≥+15%</b> = เก่งกว่าที่ BS บอก → ควรเพิ่ม BS ครั้งหน้า &nbsp;|&nbsp;
        <b style="color:var(--danger);">Overrated ≤−15%</b> = อ่อนกว่าที่ BS บอก → ควรลด BS ครั้งหน้า
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-top:8px;font-size:11px;color:var(--muted);line-height:1.7;">
        <b style="color:var(--gold);">สูตร Expected WR:</b> BS 0.5→30% · 1.0→40% · 1.5→50% · 2.0→56% · 2.5→62% · 3.0→70%
        &nbsp;(±opp adj สูงสุด 8% ตาม BS เฉลี่ยคู่แข่ง)
      </div>
    </div>
    ${makeSection('🔥 UNDERRATED', '🔥', '#00e676', 'rgba(0,230,118,0.05)', underrated)}
    ${makeSection('📈 ค่อนข้าง Underrated', '📈', '#7ee787', 'rgba(0,230,118,0.03)', slightUnder)}
    ${makeSection('⚖️ สมดุล', '⚖️', 'var(--muted)', 'rgba(255,255,255,0.02)', balanced)}
    ${makeSection('📉 ค่อนข้าง Overrated', '📉', '#ff9966', 'rgba(255,80,0,0.03)', slightOver)}
    ${makeSection('⚠️ OVERRATED', '⚠️', 'var(--danger)', 'rgba(255,59,92,0.05)', overrated)}
    <div style="font-size:10px;color:var(--muted);margin-top:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;">
      💡 ต้องการข้อมูลอย่างน้อย 2 แมตช์และมี Base Score ถึงจะวิเคราะห์ได้ · Threshold: ±15% = significant · ±7% = slight<br>
      <span style="color:var(--gold);">⚖️ opp adj</span> = ปรับ expected WR ตาม BaseScore เฉลี่ยของคู่แข่งที่เจอ (เจอคู่แข่งแข็งกว่า → expected ลดลง)
    </div>`;
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

  // Prediction accuracy
  let predCorrect = 0, predTotal = 0;
  hist.forEach(m => {
    if (!m.r1 || !m.r2 || !m.b1 || !m.b2) return;
    const pred = getMatchPrediction(m.r1, m.r2, m.b1, m.b2);
    if (!pred || pred.noBaseScore) return;
    const acc = checkPredictionAccuracy(pred, m.rStat);
    if (acc) { predTotal++; if (acc.correct) predCorrect++; }
  });
  const predAccStr = predTotal > 0 ? `${Math.round(predCorrect/predTotal*100)}%` : '—';

  // Upset count
  const upsets = hist.filter(m => {
    if (!m.r1 || !m.b1) return false;
    const pred = getMatchPrediction(m.r1, m.r2, m.b1, m.b2);
    if (!pred || pred.noBaseScore) return false;
    const acc = checkPredictionAccuracy(pred, m.rStat);
    return acc && !acc.correct && acc.confidence >= 60;
  }).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('rptHeroMatches',  total   || '—');
  set('rptHeroRedWins',  redWins || '—');
  set('rptHeroDraws',    draws   || '—');
  set('rptHeroBlueWins', blueWins|| '—');
  set('rptHeroPredAcc',  predAccStr);
  set('rptHeroUpsets',   upsets  || '—');
}

function renderReports() {
  const stats = getPlayerStats(); // FIX-7: use shared stats builder
  
  const rSearch = (document.getElementById('reportSearch')?.value || '').toLowerCase(); 
  const rTeam = document.getElementById('reportFilterTeam')?.value || ''; 
  const mSearch = (document.getElementById('matchSearch')?.value || '').toLowerCase();
  
  const { col: pCol, dir: pDir } = sortState.players; 
  const playerArr = Object.values(stats).filter(s => (!rSearch || s.name.toLowerCase().includes(rSearch) || s.id.toLowerCase().includes(rSearch)) && (!rTeam || s.team === rTeam) && (!activeGroup || s.group === activeGroup)).sort((a,b) => { 
    let av, bv;
    if (pCol === 'baseScore') {
      av = parseFloat((appState.playerProfiles||{})[a.id]?.baseScore) || 0;
      bv = parseFloat((appState.playerProfiles||{})[b.id]?.baseScore) || 0;
    } else {
      av=a[pCol]; bv=b[pCol];
    }
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
      <td style="font-weight:700;color:var(--gold);">${(function(){ const prof=(appState.playerProfiles||{})[s.id]||{}; return prof.baseScore?'⚡'+prof.baseScore:'—'; })()}</td>
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
