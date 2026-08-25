// ── ANALYSIS & REPORTS (WITH TEAM/MATCH SCOPE TAGS) ──
function analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, mId, potFlags) {
  const M1 = g1r - g1b, M2 = g2r - g2b, absM1 = Math.abs(M1), absM2 = Math.abs(M2), totalMargin = absM1 + absM2, netMargin = Math.abs((g1r + g2r) - (g1b + g2b)), volatility = Math.abs(absM1 - absM2), isDraw = rStat === 'D';
  let status = '', statusColor = '';
  
  if (!isDraw) { 
      if (totalMargin <= 5) { status = 'Evenly Matched'; statusColor = '#2ecc71'; } 
      else if (totalMargin <= 12) { status = 'Competitive Edge'; statusColor = '#f5c842'; } 
      else if (totalMargin <= 20) { status = 'Superior'; statusColor = '#ff9500'; } 
      else { status = 'Outclassed'; statusColor = '#e74c3c'; } 
  } else { 
      if (netMargin <= 3) { status = 'True Tie'; statusColor = '#2ecc71'; } 
      else if (netMargin <= 8) { status = 'Close Encounter'; statusColor = '#f5c842'; } 
      else { status = 'Deceptive Draw'; statusColor = '#ff9500'; } 
  }
  
  const tags = []; 
  
  // 1. Epic Comeback (Scope: Team - ให้เฉพาะทีมที่พลิกชนะเกมนั้น หรือในกรณีคะแนนเท่า→ Point Diff)
  if (potFlags) {
      // เกม 1: แดงคัมแบค (แดงชนะเกม 1 หรือเสมอแต่แดงมี PD ดีกว่า)
      if (potFlags.g1R_pot && g1r >= 21 && g1r >= g1b) tags.push({ id: 'epic_red_g1', label: '🔥 Epic Comeback G1 Red', class: 'tag-comeback', scope: 'red' });
      // เกม 1: น้ำเงินคัมแบค
      if (potFlags.g1B_pot && g1b >= 21 && g1b >= g1r) tags.push({ id: 'epic_blue_g1', label: '🔥 Epic Comeback G1 Blue', class: 'tag-comeback', scope: 'blue' });
      // เกม 2: แดงคัมแบค
      if (potFlags.g2R_pot && g2r >= 21 && g2r >= g2b) tags.push({ id: 'epic_red_g2', label: '🔥 Epic Comeback G2 Red', class: 'tag-comeback', scope: 'red' });
      // เกม 2: น้ำเงินคัมแบค
      if (potFlags.g2B_pot && g2b >= 21 && g2b >= g2r) tags.push({ id: 'epic_blue_g2', label: '🔥 Epic Comeback G2 Blue', class: 'tag-comeback', scope: 'blue' });
  }

  // 2. Gladiators / Clutch (Scope: All - ให้ทั้ง 4 คน)
  if (!isDraw && totalMargin <= 5) tags.push({ id: 'clutch', label: '⚔️ The Gladiators', class: 'tag-clutch', scope: 'all' });
  if (isDraw && netMargin <= 5) tags.push({ id: 'clutch', label: '⚔️ The Gladiators', class: 'tag-clutch', scope: 'all' });

  // 3. Marathon Match — เกมที่คะแนนรวมสูง (deuce หรือสูสีมาก)
  if ((g1r + g1b >= 42) || (g2r + g2b >= 42)) {
      tags.push({ id: 'marathon', label: '🏃‍♂️ Marathon Match', class: 'tag-custom', scope: 'all' });
  }

  // 4. Rollercoaster / Momentum Shift (Scope: All - ให้ทั้ง 4 คน)
  if ((M1 >= 5 && M2 <= -5) || (M1 <= -5 && M2 >= 5)) {
      tags.push({ id: 'rollercoaster', label: '🎢 The Rollercoaster', class: 'tag-custom', scope: 'all' });
  }

  // 5. Blowout (Scope: Team - ให้เฉพาะทีมชนะ)
  if (!isDraw && totalMargin >= 16) {
      tags.push({ id: 'blowout', label: '🌪️ ยำใหญ่ (Blowout)', class: 'tag-blowout', scope: rStat === 'W' ? 'red' : 'blue' });
  }

  // 6. Flawless Form (Scope: Team - ให้เฉพาะทีมชนะ)
  if (M1 >= 7 && M2 >= 7) tags.push({ id: 'flawless_red', label: '⭐ Flawless Form', class: 'tag-normal', scope: 'red' });
  if (M1 <= -7 && M2 <= -7) tags.push({ id: 'flawless_blue', label: '⭐ Flawless Form', class: 'tag-normal', scope: 'blue' });

  let summary = '';
  if (!isDraw) { const winTeam = M1 > 0 && M2 > 0 ? 'Red' : 'Blue'; if (totalMargin <= 5) summary = `เกมสูสีมาก ผลแพ้ชนะขึ้นอยู่กับจังหวะหน้างาน`; else if (totalMargin <= 12) summary = `ทีม${winTeam === 'Red' ? 'แดง' : 'น้ำเงิน'}นิ่งกว่าในช่วงสำคัญ แต่คู่แข่งสู้ได้ตลอดทั้งเกม`; else if (totalMargin <= 20) summary = `ทีม${winTeam === 'Red' ? 'แดง' : 'น้ำเงิน'}คุมเกมได้ชัดเจน มีความเหนือกว่า`; else summary = `ห่างชั้นกันมาก ทีมแพ้ต้องการการพัฒนาอย่างจริงจัง`; } else { if (netMargin <= 3) summary = `เสมอสมบูรณ์แบบ ทั้งสองทีมฝีมือเท่ากันเกือบสมบูรณ์`; else if (netMargin <= 8) summary = `ผลเสมอ แต่มีฝ่ายที่กดดันได้ดีกว่าเล็กน้อย`; else summary = `เสมอแค่จำนวนเกม แต่ฝีมือรวมต่างกันพอสมควร`; }
  
  return { status, statusColor, tags, summary, totalMargin, netMargin, volatility, isDraw, potFlags };
}

// ── SHARED STATS BUILDER (FIX-7: extracted from 3 duplicate locations) ──
// ── buildPlayerStats cache — reset ทุกครั้งที่ data เปลี่ยน ──
let _statsCache = null;
let _statsCacheVersion = -1;
function getPlayerStats() {
  // ใช้ matchHistory.length เป็น version key — ถ้าเพิ่มขึ้นแสดงว่า data เปลี่ยน
  const v = (appState.matchHistory||[]).length;
  if (_statsCache && _statsCacheVersion === v) return _statsCache;
  _statsCache = buildPlayerStats();
  _statsCacheVersion = v;
  return _statsCache;
}
function invalidateStatsCache() { _statsCache = null; _statsCacheVersion = -1; }

// ══════════════════════════════════════
// PERFORMANCE ENHANCEMENTS
// ══════════════════════════════════════

// ── 1. Hot / Cold Streak — ดู 5 แมตช์ล่าสุดของผู้เล่น ──
// ── 2. GIF Preloader — declared here for use in preloadGif ──
let _preloadedGifUrl = null;

// ── 3. Umpire Workload Stats ──
function getUmpireStats() {
  const stats = {};
  appState.matchHistory.forEach(h => {
    const u = h.umpire || 'ไม่ระบุ';
    if (!stats[u]) stats[u] = { name: u, count: 0, rounds: {} };
    stats[u].count++;
    const r = 'R' + (h.round || '?');
    stats[u].rounds[r] = (stats[u].rounds[r] || 0) + 1;
  });
  return Object.values(stats).sort((a,b) => b.count - a.count);
}

// ── PLAYER STREAK — form ช่วง 5 แมตช์ล่าสุด ──
function getPlayerStreak(playerId) {
  const matches = appState.matchHistory.filter(h =>
    [h.r1,h.r2,h.b1,h.b2].includes(playerId)
  ).slice(-5); // 5 แมตช์ล่าสุด
  if (matches.length < 2) return null; // ข้อมูลน้อยเกิน
  let w=0, l=0;
  matches.forEach(h => {
    const onRed = [h.r1,h.r2].includes(playerId);
    if ((onRed && h.rStat==='W') || (!onRed && h.bStat==='W')) w++;
    else if ((onRed && h.rStat==='L') || (!onRed && h.bStat==='L')) l++;
  });
  const total = w + l;
  if (total < 2) return null;
  const wr = Math.round(w/total*100);
  if (wr >= 75) return { type:'hot',  label:'🔥 Hot',  color:'#ff6b35', bg:'rgba(255,107,53,0.12)', border:'rgba(255,107,53,0.3)' };
  if (wr <= 25) return { type:'cold', label:'🧊 Cold', color:'#60a5fa', bg:'rgba(96,165,250,0.12)',  border:'rgba(96,165,250,0.3)' };
  return null;
}

function buildPlayerStats() {
  const stats = {};
  appState.players.forEach(p => {
    stats[p.id] = { ...p, pts:0, pointDiff:0,
      // game-level (per game ใน match)
      w:0, l:0, total:0,
      // match-level
      matchWin:0, matchLose:0, matchDraw:0, matchesPlayed:0,
      epicTags:0, clutchTags:0, marathonTags:0, rollerTags:0 };
  });
  appState.matchHistory.forEach(h => {
    const [g1r, g1b] = (h.game1||'0:0').split(':').map(Number);
    const [g2r, g2b] = (h.game2||'0:0').split(':').map(Number);
    const hasG2 = !isNaN(g2r) && (g2r > 0 || g2b > 0);
    let rGames=0, bGames=0, rScored=0, bScored=0;
    if (!isNaN(g1r)&&!isNaN(g1b)) { rScored+=g1r; bScored+=g1b; if(g1r>g1b)rGames++; else if(g1b>g1r)bGames++; }
    if (hasG2 && !isNaN(g2r)&&!isNaN(g2b)) { rScored+=g2r; bScored+=g2b; if(g2r>g2b)rGames++; else if(g2b>g2r)bGames++; }
    const gamesPlayed = (!isNaN(g1r)?1:0) + (hasG2&&!isNaN(g2r)?1:0);
    const rDiff = rScored - bScored, bDiff = -rDiff;
    let redEpic=0, blueEpic=0, allClutch=0, allMarathon=0, allRoller=0;
    if (h.analysis?.tags) {
      h.analysis.tags.forEach(t => {
        if (t.id.includes('epic') && t.scope==='red') redEpic++;
        if (t.id.includes('epic') && t.scope==='blue') blueEpic++;
        if (t.id==='clutch'        && t.scope==='all') allClutch++;
        if (t.id==='marathon'      && t.scope==='all') allMarathon++;
        if (t.id==='rollercoaster' && t.scope==='all') allRoller++;
      });
    }
    const applyRed = id => {
      if (!stats[id]) return;
      stats[id].pts        += h.pRed;
      stats[id].pointDiff  += rDiff;
      stats[id].w          += rGames;
      stats[id].l          += bGames;
      stats[id].total      += gamesPlayed;
      stats[id].matchesPlayed++;
      if (h.rStat==='W') stats[id].matchWin++;
      else if (h.rStat==='L') stats[id].matchLose++;
      else if (h.rStat==='D') stats[id].matchDraw++;
      stats[id].epicTags    += redEpic;
      stats[id].clutchTags  += allClutch;
      stats[id].marathonTags+= allMarathon;
      stats[id].rollerTags  += allRoller;
    };
    const applyBlue = id => {
      if (!stats[id]) return;
      stats[id].pts        += h.pBlue;
      stats[id].pointDiff  += bDiff;
      stats[id].w          += bGames;
      stats[id].l          += rGames;
      stats[id].total      += gamesPlayed;
      stats[id].matchesPlayed++;
      if (h.bStat==='W') stats[id].matchWin++;
      else if (h.bStat==='L') stats[id].matchLose++;
      else if (h.bStat==='D') stats[id].matchDraw++;
      stats[id].epicTags    += blueEpic;
      stats[id].clutchTags  += allClutch;
      stats[id].marathonTags+= allMarathon;
      stats[id].rollerTags  += allRoller;
    };
    [h.r1,h.r2].forEach(applyRed);
    [h.b1,h.b2].forEach(applyBlue);
  });
  // winRate = game-level (game wins / games played)
  Object.values(stats).forEach(s => {
    s.winRate = s.total>0 ? Math.round(s.w/s.total*100) : 0;
    s.matchWinRate = s.matchesPlayed>0 ? Math.round(s.matchWin/s.matchesPlayed*100) : 0;
    // backward compat
    s.d = s.matchDraw;
  });
  return stats;
}

// ── PLAYER DB SORT ──
const playerDbSort = { col: 'id', dir: 'asc' };
function sortPlayerDb(col) { if (playerDbSort.col === col) { playerDbSort.dir = playerDbSort.dir === 'asc' ? 'desc' : 'asc'; } else { playerDbSort.col = col; playerDbSort.dir = ['name','id','team'].includes(col) ? 'asc' : 'desc'; } renderPlayers(); }
function updatePlayerDbSortIcons() { document.querySelectorAll('#playerDbTable thead th.sortable').forEach(th => { th.classList.remove('sort-asc','sort-desc'); const icon = th.querySelector('.sort-icon'); if (icon && icon.getAttribute('data-col') === playerDbSort.col) { th.classList.add(playerDbSort.dir === 'asc' ? 'sort-asc' : 'sort-desc'); } }); }
function renderPlayers() {
  const tb = document.getElementById('playerTableBody'); const search = (document.getElementById('playerSearch')?.value || '').toLowerCase(); const filterTeam = document.getElementById('playerFilterTeam')?.value || '';
  const stats = {}; appState.players.forEach(p => { stats[p.id] = { w: 0, total: 0, pts: 0 }; });
  appState.matchHistory.forEach(h => { [h.r1,h.r2].forEach(id => { if(stats[id]){ stats[id].total++; stats[id].pts += h.pRed; if(h.rStat==='W') stats[id].w++; }}); [h.b1,h.b2].forEach(id => { if(stats[id]){ stats[id].total++; stats[id].pts += h.pBlue; if(h.bStat==='W') stats[id].w++; }}); });
  let players = appState.players.filter(p => (!search || p.name.toLowerCase().includes(search) || p.id.toLowerCase().includes(search)) && (!filterTeam || p.team === filterTeam)).map(p => { const s = stats[p.id] || { w:0, total:0, pts:0 }; const wr = s.total > 0 ? Math.round(s.w / s.total * 100) : -1; return { ...p, w: s.w, total: s.total, pts: s.pts, winRate: wr }; });
  const { col, dir } = playerDbSort; players.sort((a, b) => { let av = a[col], bv = b[col]; if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); } if (av < bv) return dir === 'asc' ? -1 : 1; if (av > bv) return dir === 'asc' ? 1 : -1; return 0; });
  tb.innerHTML = '';
  tb.innerHTML = players.map(p => {
    const wrDisplay = p.winRate >= 0 ? p.winRate + '%' : '—';
    const wrColor = p.winRate >= 70 ? 'var(--green)' : p.winRate >= 40 ? 'var(--gold)' : p.winRate >= 0 ? 'var(--danger)' : 'var(--muted)';
    const wrPct = p.winRate >= 0 ? p.winRate : 0;
    const prof = p.profile || {};
    const handIcon = prof.hand === 'left' ? '🤚' : prof.hand === 'both' ? '🙌' : '✋';
    return `<tr class="player-row-clickable" onclick="openPlayerProfile('${p.id}')">
      <td class="gold-text">${p.id}</td>
      <td style="font-weight:700;">${escHtml(p.name)} ${prof.hand ? `<span style="font-size:12px;" title="${prof.hand} handed">${handIcon}</span>` : ''}</td>
      <td class="${p.team === 'Red' ? 'red-text' : 'blue-text'}">${p.team}</td>
      <td>G${p.group}</td>
      <td><div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:5px;background:var(--surface2);border-radius:3px;min-width:50px;max-width:80px;"><div style="width:${wrPct}%;height:100%;background:${wrColor};border-radius:3px;"></div></div>
        <span style="font-size:13px;font-weight:700;color:${wrColor};min-width:32px;">${wrDisplay}</span>
      </div></td>
      <td style="font-weight:700;color:var(--gold);">${p.pts}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:6px;">
          <button class="btn btn-info btn-sm" onclick="openPlayerProfile('${p.id}')">👤 Profile</button>
          <button class="btn btn-danger btn-sm" onclick="deletePlayer('${p.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  updatePlayerDbSortIcons();
}

