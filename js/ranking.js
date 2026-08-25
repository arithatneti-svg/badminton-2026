// ══════════════════════════════════════════════════════════════
// PERFORMANCE RANKING ENGINE
// ══════════════════════════════════════════════════════════════

const TIER = { '1': 3, '2': 2, '3': 1 }; // G1=3 (เก่งสุด), G3=1 (มือหน้าบ้าน)

function getPlayerTier(playerId) {
  const p = ( appState.players || [] ).find(x => x.id === playerId);
  return p ? (TIER[p.group] || 1) : 1;
}

// Elo-lite: expected win probability based on tier difference
function expectedWin(myTier, oppTierAvg) {
  // scale: tier diff of 1 → expect ~72% win if higher
  return 1 / (1 + Math.pow(10, (oppTierAvg - myTier) * 0.4));
}

// pointDiff bonus: sูสีมาก (≤5) → ×1.125, ห่างมาก (≥20) → ×1.5
function pointDiffBonus(g1r, g1b, g2r, g2b) {
  const total = Math.abs(g1r - g1b) + Math.abs(g2r - g2b);
  return 1 + Math.min(total, 20) / 40; // 1.0 – 1.5
}

function computePerfRanking() {
  const perfMap = {}; // id → { perf, upsetCount, overCount, underCount, matches }

  appState.players.forEach(p => {
    perfMap[p.id] = {
      id: p.id, name: p.name, team: p.team, group: p.group,
      perf: 0, upsetCount: 0, overCount: 0, underCount: 0, matchCount: 0,
      pts: 0, rawWinRate: 0, wins: 0, totalGames: 0,
    };
  });

  appState.matchHistory.forEach(h => {
    const [g1r, g1b] = (h.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (h.game2 || '0:0').split(':').map(Number);
    if (isNaN(g1r) || isNaN(g1b)) return;

    const hasG2 = g2r > 0 || g2b > 0;
    const pdBonus = pointDiffBonus(g1r, g1b, hasG2 ? g2r : 0, hasG2 ? g2b : 0);

    // tier averages
    const t_r1 = getPlayerTier(h.r1), t_r2 = getPlayerTier(h.r2);
    const t_b1 = getPlayerTier(h.b1), t_b2 = getPlayerTier(h.b2);

    const redTierAvg  = (t_r1 + t_r2) / 2;
    const blueTierAvg = (t_b1 + t_b2) / 2;
    const matchStr    = (t_r1 + t_r2 + t_b1 + t_b2) / 4; // 1–3

    // actual outcome
    const rActual = h.rStat === 'W' ? 1 : h.rStat === 'D' ? 0.5 : 0;
    const bActual = 1 - rActual;

    // game wins (for raw stats)
    let rGames = 0, bGames = 0;
    if (g1r > g1b) rGames++; else if (g1b > g1r) bGames++;
    if (hasG2) { if (g2r > g2b) rGames++; else if (g2b > g2r) bGames++; }
    const totalGames = hasG2 ? 2 : 1;

    const processTeam = (ids, myTierAvg, oppTierAvg, actual, myPts, myGames) => {
      const expWin = expectedWin(myTierAvg, oppTierAvg);
      const rawScore = (actual - expWin) * matchStr * pdBonus;
      // upset bonus: win against clearly stronger team (tier diff ≥ 0.5)
      const tierDiff = oppTierAvg - myTierAvg;
      const upsetBonus = actual === 1 && tierDiff >= 0.5
        ? tierDiff * 0.5 * matchStr
        : 0;
      const totalScore = rawScore + upsetBonus;

      ids.forEach(id => {
        if (!perfMap[id]) return;
        perfMap[id].perf       += totalScore;
        perfMap[id].pts        += myPts;
        perfMap[id].matchCount += 1;
        perfMap[id].wins       += myGames;
        perfMap[id].totalGames += totalGames;
        if (upsetBonus > 0)   perfMap[id].upsetCount++;
        if (rawScore  > 0.15) perfMap[id].overCount++;
        if (rawScore  < -0.1) perfMap[id].underCount++;
      });
    };

    processTeam([h.r1, h.r2], redTierAvg,  blueTierAvg, rActual, h.pRed  || 0, rGames);
    processTeam([h.b1, h.b2], blueTierAvg, redTierAvg,  bActual, h.pBlue || 0, bGames);
  });

  // compute raw win rate
  Object.values(perfMap).forEach(p => {
    p.rawWinRate = p.totalGames > 0 ? Math.round(p.wins / p.totalGames * 100) : 0;
    p.perf = Math.round(p.perf * 100) / 100; // 2 dp
  });

  return perfMap;
}

// ── current rank view filter ──
let _rankView = 'all';
function setRankView(view, btn) {
  _rankView = view;
  document.querySelectorAll('.perf-rank-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPerfRanking();
}

function renderPerfRanking() {
  const grid = document.getElementById('rankGrid');
  if (!grid) return;

  if (appState.matchHistory.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--muted);font-size:14px;background:var(--surface2);border-radius:12px;border:1px dashed var(--border);">ยังไม่มีแมตช์ที่จบแล้ว — Performance ranking จะแสดงหลังเล่นอย่างน้อย 1 แมตช์</div>`;
    return;
  }

  const perfMap = computePerfRanking();

  // group keys: team+group
  const groupKeys = ['Red-1','Red-2','Red-3','Blue-1','Blue-2','Blue-3'];
  const labels = {
    'Red-1': { label:'Red · Group 1', sub:'N/N- มือเก่ง', color:'var(--red)', badge:'rgba(255,59,92,0.12)', badgeText:'var(--red)' },
    'Red-2': { label:'Red · Group 2', sub:'BG มือกลาง',  color:'var(--red)', badge:'rgba(255,100,50,0.1)',  badgeText:'#ff8060' },
    'Red-3': { label:'Red · Group 3', sub:'มือหน้าบ้าน', color:'var(--red)', badge:'rgba(255,150,100,0.1)', badgeText:'#ffaa88' },
    'Blue-1':{ label:'Blue · Group 1',sub:'N/N- มือเก่ง', color:'var(--blue)', badge:'rgba(59,142,255,0.12)', badgeText:'var(--blue)' },
    'Blue-2':{ label:'Blue · Group 2',sub:'BG มือกลาง',  color:'var(--blue)', badge:'rgba(59,180,255,0.1)',  badgeText:'#60c0ff' },
    'Blue-3':{ label:'Blue · Group 3',sub:'มือหน้าบ้าน', color:'var(--blue)', badge:'rgba(59,220,255,0.1)',  badgeText:'#88ddff' },
  };

  const filtered = _rankView === 'all'  ? groupKeys
                 : _rankView === 'red'  ? groupKeys.filter(k => k.startsWith('Red'))
                 : groupKeys.filter(k => k.startsWith('Blue'));

  grid.innerHTML = filtered.map(gKey => {
    const [team, grp] = gKey.split('-');
    const meta = labels[gKey];
    const players = Object.values(perfMap)
      .filter(p => p.team === team && p.group === grp && p.matchCount > 0)
      .sort((a,b) => b.perf - a.perf || b.pts - a.pts || b.rawWinRate - a.rawWinRate);

    if (players.length === 0) return `
      <div class="rank-card">
        <div class="rank-card-header">
          <span class="rank-card-group-badge" style="background:${meta.badge};color:${meta.badgeText};">G${grp}</span>
          <div><div class="rank-card-title" style="color:${meta.color}">${meta.label}</div><div style="font-size:11px;color:var(--muted);">${meta.sub}</div></div>
        </div>
        <div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">ยังไม่มีข้อมูล</div>
      </div>`;

    // max perf for bar scaling
    const maxPerf = Math.max(...players.map(p => Math.abs(p.perf)), 0.01);

    const rows = players.map((p, i) => {
      const posClass = i === 0 ? 'pos-1' : i === 1 ? 'pos-2' : i === 2 ? 'pos-3' : 'pos-other';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
      const perfDisplay = p.perf > 0 ? `+${p.perf.toFixed(2)}` : p.perf.toFixed(2);
      const perfColor = p.perf > 0.3 ? 'var(--green)' : p.perf < -0.3 ? 'var(--danger)' : 'var(--text)';
      const barColor  = p.perf >= 0 ? 'var(--green)' : 'var(--danger)';
      const barWidth  = Math.round(Math.abs(p.perf) / maxPerf * 100);

      let badges = '';
      if (p.upsetCount > 0)  badges += `<span class="upset-badge">⚡ Upset ×${p.upsetCount}</span> `;
      if (p.overCount  > 0 && p.upsetCount === 0) badges += `<span class="overperform-badge">↑ Over-perf</span> `;
      if (p.underCount > 0)  badges += `<span class="underperform-badge">↓ Under-perf</span> `;

      const diffSign = p.pts > 0 ? '' : '';
      return `<div class="rank-row">
        <div class="rank-pos ${posClass}">${medal}</div>
        <div class="rank-info">
          <div class="rank-name">${escHtml(p.name)}</div>
          <div class="rank-sub">${p.matchCount} แมตช์ · ${p.pts} pts · WR ${p.rawWinRate}% ${badges}</div>
        </div>
        <div class="rank-score-col">
          <div class="rank-perf-score" style="color:${perfColor}">${perfDisplay}</div>
          <div class="rank-pts-label">PERF</div>
        </div>
      </div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${barWidth}%;background:${barColor};"></div></div>
      </div>`;
    }).join('');

    return `<div class="rank-card">
      <div class="rank-card-header">
        <span class="rank-card-group-badge" style="background:${meta.badge};color:${meta.badgeText};">G${grp}</span>
        <div><div class="rank-card-title" style="color:${meta.color}">${meta.label}</div><div style="font-size:11px;color:var(--muted);">${meta.sub}</div></div>
        <span class="rank-card-count">${players.length} คน</span>
      </div>
      ${rows}
    </div>`;
  }).join('');
}
// ══════════════════════════════════════════════════════════════
function renderPerformance() {
  const container = document.getElementById('perfCardsContainer');
  if (!container) return;
  renderTagFilterPills();
  const filterRound = document.getElementById('perfFilterRound')?.value || '';
  const filterStatus = document.getElementById('perfFilterStatus')?.value || '';
  const matches = [...appState.matchHistory]
    .filter(m => m.analysis)
    .filter(m => !filterRound || m.round === filterRound)
    .filter(m => !filterStatus || m.analysis.status === filterStatus)
    .filter(m => {
      if (_selectedTagFilters.size === 0) return true;
      const tagIds = m.analysis.tags ? m.analysis.tags.map(t => t.id) : [];
      return [..._selectedTagFilters].every(f => tagIds.includes(f));
    })
    .reverse();
  if (matches.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:60px;font-size:14px;">ยังไม่มีข้อมูล Performance — เล่นอย่างน้อย 1 แมตช์ก่อนนะครับ</div>';
    return;
  }

  // ── Prediction accuracy banner ──
  let predCorrect = 0, predTotal = 0, upsetCount = 0;
  matches.forEach(m => {
    if (!m.r1 || !m.b1) return;
    const pred = getMatchPrediction(m.r1, m.r2, m.b1, m.b2);
    if (!pred || pred.noBaseScore) return;
    const acc = checkPredictionAccuracy(pred, m.rStat);
    if (!acc) return;
    predTotal++;
    if (acc.correct) predCorrect++;
    else if (acc.confidence >= 60) upsetCount++;
  });
  const accPct  = predTotal > 0 ? Math.round(predCorrect/predTotal*100) : null;
  const accHtml = predTotal > 0 ? `
    <div class="pred-acc-row">
      <span class="pa-label">🔮 PRED ACCURACY</span>
      <div class="pred-acc-bar"><div class="pred-acc-bar-fill" style="width:${accPct}%;background:${accPct>=60?'var(--green)':accPct>=40?'var(--gold)':'var(--danger)'};"></div></div>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:1.4em;color:${accPct>=60?'var(--green)':accPct>=40?'var(--gold)':'var(--danger)'};">${accPct}%</span>
      <span style="font-size:11px;color:var(--muted);">${predCorrect}/${predTotal} ถูก · ⚡ ${upsetCount} Upsets</span>
    </div>` : '';

  container.innerHTML = accHtml + `<div class="perf-card-grid">` + matches.map(m => {
    const a = m.analysis;
    const [g1r,g1b] = (m.game1||'0:0').split(':').map(Number);
    const [g2r,g2b] = (m.game2||'0:0').split(':').map(Number);
    const resultColor = m.rStat==='W' ? 'var(--red)' : m.bStat==='W' ? 'var(--blue)' : 'var(--gold)';
    const durationStr = m.duration > 0 ? formatTimer(m.duration) : '–';
    const tagHtml = a.tags && a.tags.length
      ? a.tags.map(t => `<span class="perf-tag ${t.class||''}" style="color:${t.color||'var(--muted)'};border-color:${t.color?t.color+'33':'var(--border)'};background:${t.color?t.color+'0d':'var(--surface2)'};">${t.label}</span>`).join('')
      : '';
    const rWon = m.rStat==='W', bWon = m.bStat==='W';
    const rScoreColor = rWon ? 'var(--red)' : 'var(--muted)';
    const bScoreColor = bWon ? 'var(--blue)' : 'var(--muted)';
    const resultLabel = m.rStat==='W' ? '🔴 RED ชนะ' : m.bStat==='W' ? '🔵 BLUE ชนะ' : '🤝 เสมอ';
    return `<div class="perf-card" style="border-left-color:${a.statusColor};">
      <div class="perf-header">
        <div class="perf-header-left">
          <span class="perf-id">${m.id}</span>
          <span class="perf-round">ROUND ${m.round}</span>
          <span class="perf-status-badge" style="color:${a.statusColor};border-color:${a.statusColor}44;background:${a.statusColor}11;">${a.status}</span>
        </div>
        <span class="perf-duration">⏱ ${durationStr}</span>
      </div>
      <div class="perf-teams">
        <span class="red-text perf-teams" style="max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.redNames}</span>
        <span class="vs-sep">vs</span>
        <span class="blue-text" style="max-width:38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.blueNames}</span>
      </div>
      <div class="perf-score-row">
        <div class="perf-score">
          <span style="color:${rScoreColor}">${g1r}</span><span style="color:var(--muted)">:</span><span style="color:${bScoreColor}">${g1b}</span>
          <span style="color:var(--border);margin:0 6px;font-size:0.55em;">·</span>
          <span style="color:${rScoreColor}">${g2r}</span><span style="color:var(--muted)">:</span><span style="color:${bScoreColor}">${g2b}</span>
        </div>
        <span class="perf-result-text" style="color:${resultColor};">${resultLabel}</span>
      </div>
      ${a.tags && a.tags.length ? `<div class="perf-tags">${tagHtml}</div>` : ''}
      <div class="perf-summary">💬 ${a.summary}</div>
      <div class="perf-metrics">
        <div class="perf-metric"><div class="perf-metric-val">${a.totalMargin}</div><div class="perf-metric-label">Total Margin</div></div>
        <div class="perf-metric"><div class="perf-metric-val">${a.netMargin}</div><div class="perf-metric-label">Net Margin</div></div>
        <div class="perf-metric"><div class="perf-metric-val">${a.volatility}</div><div class="perf-metric-label">Volatility</div></div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}


