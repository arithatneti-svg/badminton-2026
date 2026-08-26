// ── DASHBOARD & CHARTS (Admin) ──
function renderDashboard() {
  const total = appState.matchHistory.length, ongoing = appState.ongoingMatches.length; const rWins = appState.matchHistory.filter(m => m.rStat==='W').length, bWins = appState.matchHistory.filter(m => m.bStat==='W').length, draws = appState.matchHistory.filter(m => m.rStat==='D').length; const rScore = appState.globalScoreRed, bScore = appState.globalScoreBlue; const leader = rScore > bScore ? 'RED' : bScore > rScore ? 'BLUE' : 'DRAW'; const leaderColor = rScore > bScore ? 'var(--red)' : bScore > rScore ? 'var(--blue)' : 'var(--gold)';
  renderRecentMatches();
  document.getElementById('dbKpiRow').innerHTML = [ { label:'แมตช์เสร็จ', value:total, sub:`${ongoing} กำลังแข่ง`, accent:'var(--gold)' }, { label:'คะแนน RED', value:rScore, sub:`${rWins} ชนะ`, accent:'var(--red)', color:'var(--red)' }, { label:'คะแนน BLUE', value:bScore, sub:`${bWins} ชนะ`, accent:'var(--blue)', color:'var(--blue)' }, { label:'ผู้นำ', value:leader, sub:`ห่าง ${Math.abs(rScore-bScore)} pt`, accent:leaderColor, color:leaderColor }, { label:'เสมอ', value:draws, sub:'แมตช์', accent:'#f5c842' } ].map(k => `<div class="db-kpi"><div class="db-kpi-accent" style="background:${k.accent};"></div><div class="db-kpi-label">${k.label}</div><div class="db-kpi-value" style="color:${k.color||'var(--text)'};">${k.value}</div><div class="db-kpi-sub">${k.sub}</div></div>`).join('');
  renderMomentumChart(); renderHeatMap(); renderTopPlayers(); renderMatchDist();
  renderRawScoreChart(); renderDurationStats();
}

/* ── RAW SCORE BATTLE ── */
function renderRawScoreChart() {
  const kpiEl    = document.getElementById('dbRawScoreKpi');
  const canvas   = document.getElementById('rawScoreChart');
  const emptyEl  = document.getElementById('rawScoreEmpty');
  if (!kpiEl || !canvas) return;

  const history = appState.matchHistory;
  if (history.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    kpiEl.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // คำนวณคะแนนดิบสะสม (ผลรวม g1+g2 ของแต่ละทีม)
  let totalRawRed = 0, totalRawBlue = 0;
  const perMatch = history.map(m => {
    const [g1r, g1b] = (m.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (m.game2 || '0:0').split(':').map(Number);
    const rawR = g1r + g2r, rawB = g1b + g2b;
    totalRawRed  += rawR;
    totalRawBlue += rawB;
    return { id: m.id, rawR, rawB };
  });

  const rawDiff = totalRawRed - totalRawBlue;
  const rawLeader = rawDiff > 0 ? 'RED' : rawDiff < 0 ? 'BLUE' : 'เท่ากัน';
  const rawLeaderColor = rawDiff > 0 ? 'var(--red)' : rawDiff < 0 ? 'var(--blue)' : 'var(--gold)';

  // KPI mini cards
  kpiEl.innerHTML = [
    { label: 'RED รวม', value: totalRawRed,  color: 'var(--red)',  accent: 'var(--red)'  },
    { label: 'BLUE รวม', value: totalRawBlue, color: 'var(--blue)', accent: 'var(--blue)' },
    { label: 'ห่าง', value: Math.abs(rawDiff), color: rawLeaderColor, accent: rawLeaderColor, sub: rawLeader + ' นำ' },
  ].map(k => `<div style="flex:1;min-width:70px;background:var(--surface2);border:1px solid ${k.accent}33;border-radius:10px;padding:8px 10px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:${k.accent};border-radius:10px 0 0 10px;"></div>
    <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:var(--muted);text-transform:uppercase;">${k.label}</div>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:2em;color:${k.color};line-height:1.1;">${k.value}</div>
    ${k.sub ? `<div style="font-size:10px;color:var(--muted);font-weight:600;">${k.sub}</div>` : ''}
  </div>`).join('');

  // Canvas grouped bar chart (Red vs Blue per match)
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.offsetWidth || 400;
  const H = 200;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const pad = { t: 16, r: 12, b: 28, l: 32 };
  const W2 = W - pad.l - pad.r;
  const H2 = H - pad.t - pad.b;
  const n  = perMatch.length;
  const maxVal = Math.max(...perMatch.map(d => Math.max(d.rawR, d.rawB)), 1);

  // Grid lines
  [0, 0.5, 1].forEach(f => {
    const y = pad.t + H2 * (1 - f);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W2, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px sans-serif';
    ctx.fillText(Math.round(maxVal * f), 2, y + 4);
  });

  // Bars
  const slotW  = W2 / n;
  const barW   = Math.max(Math.min(slotW * 0.35, 18), 3);
  const gap    = 2;

  perMatch.forEach((d, i) => {
    const cx   = pad.l + (i + 0.5) * slotW;
    const hR   = (d.rawR / maxVal) * H2;
    const hB   = (d.rawB / maxVal) * H2;

    // Red bar
    ctx.fillStyle = 'rgba(255,59,59,0.75)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx - barW - gap / 2, pad.t + H2 - hR, barW, hR, [2, 2, 0, 0])
      : ctx.rect(cx - barW - gap / 2, pad.t + H2 - hR, barW, hR);
    ctx.fill();

    // Blue bar
    ctx.fillStyle = 'rgba(59,142,255,0.75)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx + gap / 2, pad.t + H2 - hB, barW, hB, [2, 2, 0, 0])
      : ctx.rect(cx + gap / 2, pad.t + H2 - hB, barW, hB);
    ctx.fill();

    // Match label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px sans-serif';
    const label = n <= 12 ? d.id : (i % 2 === 0 ? d.id : '');
    if (label) ctx.fillText(label, cx - 6, pad.t + H2 + 14);
  });
}

/* ── MATCH DURATION STATS ── */
function renderDurationStats() {
  const kpiEl  = document.getElementById('dbDurationKpi');
  const listEl = document.getElementById('dbDurationList');
  if (!kpiEl || !listEl) return;

  const history = appState.matchHistory;
  if (history.length === 0) {
    kpiEl.innerHTML  = '<div style="color:var(--muted);font-size:13px;">ยังไม่มีข้อมูล</div>';
    listEl.innerHTML = '';
    return;
  }

  const withDur  = history.filter(m => m.duration > 0);
  const avgMs    = withDur.length > 0 ? withDur.reduce((s, m) => s + m.duration, 0) / withDur.length : 0;
  const maxM     = withDur.length > 0 ? withDur.reduce((a, b) => a.duration > b.duration ? a : b) : null;
  const minM     = withDur.length > 0 ? withDur.reduce((a, b) => a.duration < b.duration ? a : b) : null;

  kpiEl.innerHTML = [
    { label: 'เฉลี่ย/แมตช์', value: avgMs > 0 ? formatTimer(avgMs) : '–', color: 'var(--gold)',  accent: 'var(--gold)' },
    { label: 'นานสุด',  value: maxM ? formatTimer(maxM.duration) : '–', color: 'var(--red)',  accent: 'var(--red)',  sub: maxM ? maxM.id : '' },
    { label: 'สั้นสุด', value: minM ? formatTimer(minM.duration) : '–', color: 'var(--green)', accent: 'var(--green)', sub: minM ? minM.id : '' },
  ].map(k => `<div style="flex:1;min-width:70px;background:var(--surface2);border:1px solid ${k.accent}33;border-radius:10px;padding:8px 10px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:${k.accent};border-radius:10px 0 0 10px;"></div>
    <div style="font-size:9px;font-weight:700;letter-spacing:2px;color:var(--muted);text-transform:uppercase;">${k.label}</div>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:1.8em;color:${k.color};line-height:1.1;">${k.value}</div>
    ${k.sub ? `<div style="font-size:10px;color:var(--muted);font-weight:600;">${k.sub}</div>` : ''}
  </div>`).join('');

  // Per-match duration list (newest first)
  const maxDur = withDur.length > 0 ? Math.max(...withDur.map(m => m.duration)) : 1;
  listEl.innerHTML = [...history].reverse().map(m => {
    const dur = m.duration > 0 ? m.duration : 0;
    const durStr = dur > 0 ? formatTimer(dur) : '–';
    const pct = maxDur > 0 && dur > 0 ? (dur / maxDur * 100) : 0;
    const mins = dur / 60000;
    const barColor = mins >= 30 ? 'var(--danger)' : mins >= 20 ? 'var(--gold)' : mins > 0 ? 'var(--green)' : 'var(--border)';
    const rWon = m.rStat === 'W', bWon = m.bStat === 'W';
    const winIcon = rWon ? '🔴' : bWon ? '🔵' : '🤝';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="font-size:10px;font-weight:700;color:var(--muted);min-width:30px;">${winIcon} ${m.id}</div>
      <div style="flex:1;">
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;transition:width 0.3s;"></div>
        </div>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:0.95em;color:${barColor};min-width:36px;text-align:right;">${durStr}</div>
    </div>`;
  }).join('');
}
function renderChart(playerArr) {
  const chart = document.getElementById('statsChart');
  if (!chart) return;
  const top = [...playerArr].filter(p => p.pts > 0).sort((a,b) => b.pts - a.pts).slice(0, 20);
  if (top.length === 0) {
    chart.innerHTML = '<div class="chart-axis"></div><div class="rp-empty" style="flex:1;align-self:center;"><span class="rp-empty-icon">📊</span>ยังไม่มีคะแนน — กราฟจะขึ้นเมื่อมีแมตช์ที่จบแล้ว</div>';
    return;
  }
  const maxPts = Math.max(...top.map(p => p.pts));
  const BAR_MAX = 150; // px, leaves room for the value label above the tallest bar
  chart.innerHTML = '<div class="chart-axis"></div>' + top.map(p => {
    const h = Math.max(maxPts > 0 ? (p.pts / maxPts) * BAR_MAX : 0, 4);
    const isRed = p.team === 'Red';
    const grad = isRed
      ? 'linear-gradient(180deg,#ff6b7f 0%,#ff3b5c 100%)'
      : 'linear-gradient(180deg,#6bb0ff 0%,#3b8eff 100%)';
    const glow = isRed ? 'rgba(255,59,92,0.35)' : 'rgba(59,142,255,0.35)';
    const color = isRed ? 'var(--red)' : 'var(--blue)';
    return `<div class="chart-bar-wrap">
      <div class="chart-bar" style="height:${h}px;background:${grad};box-shadow:0 0 14px ${glow};" data-val="${p.pts}"></div>
      <div class="chart-bar-name" style="color:${color};" title="${escHtml(p.name)}">${escHtml(p.name)}</div>
    </div>`;
  }).join('');
}
// Cumulative points, Red vs Blue, one point per finished match.
// With ~40 matches a label per point turns into a grey smear, so labels
// and dots thin out as the season grows; the two end values are always
// drawn because "who is ahead right now" is the whole question.
function renderMomentumChart() {
  const canvas = document.getElementById('momentumChart');
  const emptyEl = document.getElementById('momentumEmpty');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.offsetWidth || 400;
  const H = 210;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (appState.matchHistory.length === 0) { if (emptyEl) emptyEl.style.display = 'flex'; return; }
  if (emptyEl) emptyEl.style.display = 'none';

  let rC = 0, bC = 0;
  const pts = [{ r: 0, b: 0 }];
  appState.matchHistory.forEach(m => { rC += m.pRed; bC += m.pBlue; pts.push({ r: rC, b: bC }); });
  const n = pts.length;
  const maxV = Math.max(...pts.map(p => Math.max(p.r, p.b)), 1);

  // right padding leaves room for the two end-value pills
  const pad = { t: 14, r: 44, b: 26, l: 34 };
  const W2 = W - pad.l - pad.r, H2 = H - pad.t - pad.b;
  const px = i => pad.l + (i / (n - 1 || 1)) * W2;
  const py = v => pad.t + H2 - (v / maxV) * H2;

  // grid + y axis
  [0, 0.5, 1].forEach(f => {
    const y = pad.t + H2 * (1 - f);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W2, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV * f), pad.l - 6, y + 3);
  });

  // dots only while they still read as separate points
  const showDots = n <= 16;
  const drawLine = (color, fill, key) => {
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p[key])) : ctx.lineTo(px(i), py(p[key])));
    ctx.stroke();
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p[key])) : ctx.lineTo(px(i), py(p[key])));
    ctx.lineTo(px(n - 1), py(0)); ctx.lineTo(px(0), py(0)); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (showDots) {
      pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(px(i), py(p[key]), 3.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
    } else {
      // just the head of each line, so "where we are now" stays visible
      ctx.beginPath(); ctx.arc(px(n - 1), py(pts[n - 1][key]), 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }
  };
  drawLine('#ff3b3b', 'rgba(255,59,59,0.07)', 'r');
  drawLine('#3b8eff', 'rgba(59,142,255,0.07)', 'b');

  // x labels: aim for ~7 ticks whatever the match count
  const step = Math.max(1, Math.ceil((n - 1) / 7));
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < n; i += step) {
    ctx.fillText(i === 0 ? 'Start' : 'M' + i, px(i), pad.t + H2 + 15);
  }
  // always label the final match, unless the step already landed on it
  if ((n - 1) % step !== 0) ctx.fillText('M' + (n - 1), px(n - 1), pad.t + H2 + 15);

  // end-value pills — nudged apart when the two lines finish close together
  const endR = py(pts[n - 1].r), endB = py(pts[n - 1].b);
  let yR = endR, yB = endB;
  if (Math.abs(yR - yB) < 13) { const mid = (yR + yB) / 2; yR = mid - 7; yB = mid + 7; }
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#ff3b3b'; ctx.fillText(pts[n - 1].r, px(n - 1) + 8, yR + 4);
  ctx.fillStyle = '#3b8eff'; ctx.fillText(pts[n - 1].b, px(n - 1) + 8, yB + 4);
  ctx.textAlign = 'start';
}
function renderHeatMap() { const el = document.getElementById('heatMap'); if (!el) return; const analyzed = appState.matchHistory.filter(m => m.analysis); if (analyzed.length===0) { el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px 0;">ยังไม่มีข้อมูล</div>'; return; } const cm = { 'Evenly Matched':{bg:'rgba(46,204,113,0.15)',b:'#2ecc71',t:'#2ecc71'}, 'Competitive Edge':{bg:'rgba(245,200,66,0.12)',b:'#f5c842',t:'#f5c842'}, 'Superior':{bg:'rgba(255,149,0,0.12)',b:'#ff9500',t:'#ff9500'}, 'Outclassed':{bg:'rgba(231,76,60,0.12)',b:'#e74c3c',t:'#e74c3c'}, 'True Tie':{bg:'rgba(46,204,113,0.12)',b:'#2ecc71',t:'#2ecc71'}, 'Close Encounter':{bg:'rgba(245,200,66,0.12)',b:'#f5c842',t:'#f5c842'}, 'Deceptive Draw':{bg:'rgba(255,149,0,0.12)',b:'#ff9500',t:'#ff9500'} }; el.innerHTML = analyzed.map(m => { const a=m.analysis, c=cm[a.status]||{bg:'var(--surface2)',b:'var(--border)',t:'var(--muted)'}; const tag=a.tags&&a.tags.length>0?`<div style="font-size:9px;opacity:0.7;margin-top:2px;">${a.tags[0].label}</div>`:''; return `<div class="heat-cell" title="${m.redNames} vs ${m.blueNames} | ${m.game1}/${m.game2} | ${a.status}" style="background:${c.bg};border-color:${c.b}33;color:${c.t};"><div style="font-weight:700;">${m.id}</div><div style="font-size:9px;opacity:0.8;">${a.status.split(' ')[0]}</div>${tag}</div>`; }).join(''); }
function renderTopPlayers() { const el = document.getElementById('dbTopPlayers'); if (!el) return; const stats = {}; appState.players.forEach(p => { stats[p.id]={...p,pts:0,w:0,total:0}; }); appState.matchHistory.forEach(h => { [h.r1,h.r2].forEach(id => { if(stats[id]){ stats[id].pts+=h.pRed; if(h.rStat==='W')stats[id].w++; stats[id].total++; }}); [h.b1,h.b2].forEach(id => { if(stats[id]){ stats[id].pts+=h.pBlue; if(h.bStat==='W')stats[id].w++; stats[id].total++; }}); }); const top = Object.values(stats).filter(p=>p.pts>0).sort((a,b)=>b.pts-a.pts||b.w-a.w).slice(0,8); if (top.length===0) { el.innerHTML='<div style="color:var(--muted);font-size:13px;padding:20px 0;">ยังไม่มีข้อมูล</div>'; return; } const maxPts=top[0].pts, medals=['🥇','🥈','🥉']; el.innerHTML = top.map((p,i) => { const color=p.team==='Red'?'var(--red)':'var(--blue)'; const wr=p.total>0?Math.round(p.w/p.total*100):0; return `<div class="db-player-row"><div class="db-player-rank" style="color:${i<3?color:'var(--muted)'};">${medals[i]||i+1}</div><div class="db-player-bar-wrap"><div class="db-player-name">${p.name}</div><div class="db-player-sub" style="color:${color};">${p.team} · G${p.group} · WR ${wr}%</div><div style="height:3px;background:var(--border);border-radius:2px;margin-top:4px;"><div style="width:${Math.round(p.pts/maxPts*100)}%;height:100%;background:${color};border-radius:2px;"></div></div></div><div class="db-player-pts" style="color:${color};">${p.pts}<span style="font-size:0.5em;color:var(--muted);"> pt</span></div></div>`; }).join(''); }
function renderMatchDist() { const el = document.getElementById('dbMatchDist'); if (!el) return; const statuses = [ {key:'Evenly Matched',label:'Evenly\nMatched',color:'#2ecc71'}, {key:'Competitive Edge',label:'Competitive\nEdge',color:'#f5c842'}, {key:'Superior',label:'Superior',color:'#ff9500'}, {key:'Outclassed',label:'Outclassed',color:'#e74c3c'}, {key:'True Tie',label:'True\nTie',color:'#2ecc71'}, {key:'Close Encounter',label:'Close\nEnc.',color:'#f5c842'}, {key:'Deceptive Draw',label:'Deceptive\nDraw',color:'#ff9500'} ]; const analyzed = appState.matchHistory.filter(m=>m.analysis); if (analyzed.length===0) { el.innerHTML='<div style="color:var(--muted);font-size:13px;width:100%;text-align:center;padding:20px 0;">ยังไม่มีข้อมูล</div>'; return; } const counts = {}; analyzed.forEach(m => { counts[m.analysis.status]=(counts[m.analysis.status]||0)+1; }); const maxC = Math.max(...Object.values(counts),1); el.innerHTML = statuses.map(s => { const c=counts[s.key]||0, h=c>0?Math.max(Math.round(c/maxC*80),8):4; return `<div class="dist-bar-wrap"><div class="dist-count" style="color:${c>0?s.color:'var(--border)'};">${c}</div><div class="dist-bar" style="height:${h}px;background:${c>0?s.color:'var(--border)'};opacity:${c>0?0.8:0.3};"></div><div class="dist-label" style="white-space:pre-line;">${s.label}</div></div>`; }).join(''); }

function renderRecentMatches() {
  const el = document.getElementById('dbRecentMatches');
  if (!el) return;
  const recent = [...appState.matchHistory].reverse().slice(0, 8);
  if (recent.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;text-align:center;">ยังไม่มีแมตช์ที่จบ</div>';
    return;
  }
  const tagClassMap = { 'tag-comeback':'rgba(255,80,80,0.15)', 'tag-clutch':'rgba(255,200,0,0.12)', 'tag-blowout':'rgba(255,100,0,0.12)', 'tag-custom':'rgba(100,200,255,0.12)' };
  el.innerHTML = recent.map(m => {
    const rWon = m.rStat === 'W', bWon = m.bStat === 'W';
    const rNameColor = rWon ? 'var(--red)' : 'var(--muted)';
    const bNameColor = bWon ? 'var(--blue)' : 'var(--muted)';
    const [g1r,g1b] = (m.game1||'0:0').split(':').map(Number);
    const [g2r,g2b] = (m.game2||'0:0').split(':').map(Number);
    const scoreHtml = `<span style="color:${rWon?'var(--red)':'var(--muted)'}">${g1r}</span><span style="color:var(--border)">:</span><span style="color:${bWon?'var(--blue)':'var(--muted)'}">${g1b}</span><span style="color:var(--border);font-size:0.55em;margin:0 4px;">·</span><span style="color:${rWon?'var(--red)':'var(--muted)'}">${g2r}</span><span style="color:var(--border)">:</span><span style="color:${bWon?'var(--blue)':'var(--muted)'}">${g2b}</span>`;
    const tags = m.analysis && m.analysis.tags ? m.analysis.tags : [];
    const tagHtml = tags.length ? `<div class="db-recent-tags">${tags.slice(0,3).map(t => `<span class="db-recent-tag" style="background:${tagClassMap[t.class]||'rgba(255,255,255,0.05)'}">${t.label}</span>`).join('')}</div>` : '';
    const winIcon = rWon ? '🔴' : bWon ? '🔵' : '🤝';
    return `<div class="db-recent-item">
      <div>
        <div class="db-recent-id">${winIcon} ${m.id}</div>
        <div style="font-size:9px;color:var(--muted);letter-spacing:1px;font-weight:700;">R${m.round}</div>
      </div>
      <div class="db-recent-teams">
        <div class="db-recent-name" style="color:${rNameColor}">${m.redNames}</div>
        <div class="db-recent-name" style="color:${bNameColor}">${m.blueNames}</div>
        ${tagHtml}
      </div>
      <div class="db-recent-score">
        ${scoreHtml}
      </div>
    </div>`;
  }).join('');
}

let _selectedTagFilters = new Set();

const TAG_FILTER_OPTIONS = [
  { id: 'epic_blue_g1', label: '🔥 Epic Comeback Blue', class: 'tag-comeback' },
  { id: 'epic_red_g1',  label: '🔥 Epic Comeback Red',  class: 'tag-comeback' },
  { id: 'epic_blue_g2', label: '🔥 Epic Comeback G2 Blue', class: 'tag-comeback' },
  { id: 'epic_red_g2',  label: '🔥 Epic Comeback G2 Red',  class: 'tag-comeback' },
  { id: 'clutch',       label: '⚔️ The Gladiators',     class: 'tag-clutch' },
  { id: 'marathon',     label: '🏃 Marathon Match',      class: 'tag-custom' },
  { id: 'rollercoaster',label: '🎢 Rollercoaster',       class: 'tag-custom' },
  { id: 'blowout',      label: '🌪️ Blowout',            class: 'tag-blowout' },
  { id: 'flawless_red', label: '⭐ Flawless Red',        class: 'tag-normal' },
  { id: 'flawless_blue',label: '⭐ Flawless Blue',       class: 'tag-normal' },
];

const TAG_CLASS_COLOR = {
  'tag-comeback': { bg: 'rgba(255,60,60,0.15)',  border: 'rgba(255,60,60,0.4)',  text: '#ff6060' },
  'tag-clutch':   { bg: 'rgba(255,200,0,0.12)',  border: 'rgba(255,200,0,0.4)',  text: '#f5c842' },
  'tag-blowout':  { bg: 'rgba(255,120,0,0.12)',  border: 'rgba(255,120,0,0.4)',  text: '#ff9500' },
  'tag-custom':   { bg: 'rgba(80,180,255,0.12)', border: 'rgba(80,180,255,0.4)', text: '#50b4ff' },
  'tag-normal':   { bg: 'rgba(200,200,200,0.08)',border: 'rgba(200,200,200,0.25)',text: '#aaaacc' },
};

function renderTagFilterPills() {
  const row = document.getElementById('perfTagFilterRow');
  if (!row) return;

  // เช็คว่า tag ไหนมีข้อมูลจริงใน matchHistory
  const usedTagIds = new Set();
  appState.matchHistory.forEach(m => {
    if (m.analysis && m.analysis.tags) m.analysis.tags.forEach(t => usedTagIds.add(t.id));
  });

  const available = TAG_FILTER_OPTIONS.filter(t => usedTagIds.has(t.id));
  if (available.length === 0) { row.innerHTML = ''; return; }

  // colours ride in as custom properties; the pill itself is styled in report.css
  const pills = available.map(t => {
    const active = _selectedTagFilters.has(t.id);
    const c = TAG_CLASS_COLOR[t.class] || TAG_CLASS_COLOR['tag-normal'];
    const vars = `--tp-bg:${c.bg};--tp-border:${c.border};--tp-text:${c.text};`;
    return `<button class="rp-tagpill${active ? ' active' : ''}" style="${vars}" onclick="toggleTagFilter('${t.id}')">${t.label}</button>`;
  }).join('');

  const clearBtn = _selectedTagFilters.size > 0
    ? `<button class="rp-tagpill rp-tagclear" onclick="clearTagFilters()">✕ ล้างทั้งหมด</button>`
    : '';

  row.innerHTML = pills + clearBtn;
}

function toggleTagFilter(tagId) {
  if (_selectedTagFilters.has(tagId)) _selectedTagFilters.delete(tagId);
  else _selectedTagFilters.add(tagId);
  renderTagFilterPills();
  renderMatchesPanel();
}

function clearTagFilters() {
  _selectedTagFilters.clear();
  renderTagFilterPills();
  renderMatchesPanel();
}


