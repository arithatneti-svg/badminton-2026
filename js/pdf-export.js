// ══════════════════════════════════════════
// PDF EXPORT — Sports Day Summary
// ══════════════════════════════════════════
function exportSummaryPDF() {
  const stats  = getPlayerStats();
  const season = appState.seasonName || 'Sports Day 2026';
  const date   = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });

  // ── Leaderboard rows ──
  const players = (appState.players || [])
    .map(p => ({ ...p, s: stats[p.id] || {} }))
    .sort((a,b) => (b.s.pts||0) - (a.s.pts||0));

  const leaderRows = players.map((p, i) => {
    const s = p.s;
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉': `${i+1}.`;
    const streak = getPlayerStreak(p.id);
    const streakBadge = streak ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${streak.bg};color:${streak.color};border:1px solid ${streak.border};">${streak.label}</span>` : '';
    const teamColor = p.team === 'Red' ? '#ff3b5c' : '#3b8eff';
    return `<tr>
      <td style="text-align:center;font-weight:800;">${medal}</td>
      <td><span style="color:${teamColor};font-weight:700;">${p.name}</span> ${streakBadge}</td>
      <td style="text-align:center;color:${teamColor};">${p.id}</td>
      <td style="text-align:center;font-weight:700;">G${p.group}</td>
      <td style="text-align:center;font-family:monospace;font-weight:700;color:#f5c842;">${s.pts||0}</td>
      <td style="text-align:center;">${s.total>0?s.winRate+'%':'—'}</td>
      <td style="text-align:center;${(s.pointDiff||0)>=0?'color:#00e676':'color:#ff3b5c'}">${(s.pointDiff||0)>0?'+':''}${s.pointDiff||0}</td>
      <td style="text-align:center;">${s.matchesPlayed||0}</td>
    </tr>`;
  }).join('');

  // ── Highlight matches (Epic Comeback, Blowout, Marathon) ──
  const highlights = (appState.matchHistory||[]).filter(h =>
    h.analysis?.tags?.length > 0
  ).slice(-10).reverse();

  const highlightRows = highlights.map(h => {
    const tagLabels = (h.analysis?.tags||[]).map(t=>t.label).join(', ');
    const resultColor = h.rStat==='W'?'#ff3b5c':h.bStat==='W'?'#3b8eff':'#f5c842';
    return `<tr>
      <td style="font-weight:700;color:#f5c842;">${h.id}</td>
      <td><span style="color:#ff3b5c;">${h.redNames||''}</span></td>
      <td style="text-align:center;">vs</td>
      <td><span style="color:#3b8eff;">${h.blueNames||''}</span></td>
      <td style="text-align:center;font-family:monospace;">${h.game1||'-'} / ${h.game2||'-'}</td>
      <td style="color:${resultColor};font-weight:700;">${(h.result||'').replace(/[🔴🔵🤝]/g,'').trim()}</td>
      <td style="font-size:11px;color:#a0a0a0;">${tagLabels}</td>
    </tr>`;
  }).join('');

  // ── Team totals ──
  const redTotal  = appState.globalScoreRed  || 0;
  const blueTotal = appState.globalScoreBlue || 0;
  const leadTeam  = redTotal > blueTotal ? '🔴 Team Red' : blueTotal > redTotal ? '🔵 Team Blue' : '🤝 เสมอ';
  const leadColor = redTotal > blueTotal ? '#ff3b5c' : blueTotal > redTotal ? '#3b8eff' : '#f5c842';

  const html = `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8">
<title>${season} — Summary Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Space Grotesk', sans-serif; background: #fff; color: #111; padding: 32px; font-size: 13px; }
  h1 { font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #111; }
  h2 { font-size: 15px; font-weight: 800; letter-spacing: 2px; color: #444; margin: 24px 0 12px; text-transform: uppercase; border-bottom: 2px solid #eee; padding-bottom: 6px; }
  .subtitle { color: #777; font-size: 12px; margin-top: 4px; }
  .team-score { display: flex; gap: 32px; margin: 20px 0; align-items: center; }
  .team-box { text-align: center; padding: 16px 32px; border-radius: 12px; }
  .team-box.red  { background: #fff0f3; border: 2px solid #ff3b5c; }
  .team-box.blue { background: #f0f6ff; border: 2px solid #3b8eff; }
  .team-box .score { font-size: 40px; font-weight: 800; }
  .team-box .label { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #888; }
  .lead-badge { padding: 8px 20px; border-radius: 20px; font-weight: 800; font-size: 14px; color: ${leadColor}; border: 2px solid ${leadColor}; background: ${leadColor}18; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f5f5f5; padding: 8px 10px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-align: center; text-transform: uppercase; color: #555; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:hover { background: #fafafa; }
  .footer { margin-top: 32px; text-align: center; color: #aaa; font-size: 11px; }
  @media print { body { padding: 16px; } }
</style>
</head><body>
  <h1>🏸 ${season}</h1>
  <div class="subtitle">Summary Report — ${date} · ${(appState.matchHistory||[]).length} matches played</div>

  <div class="team-score">
    <div class="team-box red"><div class="score" style="color:#ff3b5c;">${redTotal}</div><div class="label">Team Red</div></div>
    <div class="lead-badge">${leadTeam}</div>
    <div class="team-box blue"><div class="score" style="color:#3b8eff;">${blueTotal}</div><div class="label">Team Blue</div></div>
  </div>

  <h2>🏆 Leaderboard</h2>
  <table>
    <thead><tr><th>#</th><th>ผู้เล่น</th><th>ID</th><th>กลุ่ม</th><th>PTS</th><th>WIN%</th><th>Point Diff</th><th>Matches</th></tr></thead>
    <tbody>${leaderRows}</tbody>
  </table>

  ${highlights.length ? `<h2>⭐ Highlight Matches</h2>
  <table>
    <thead><tr><th>Match</th><th>Red</th><th></th><th>Blue</th><th>Score</th><th>Result</th><th>Tags</th></tr></thead>
    <tbody>${highlightRows}</tbody>
  </table>` : ''}

  <div class="footer">Generated by Sports Day ${new Date().getFullYear()} System · ${new Date().toLocaleString('th-TH')}</div>
</body></html>`;

  // เปิด print window
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 800); // รอ font load
}

// ══════════════════════════════════════════
// ROUNDS REPORT — per-round summary
// ══════════════════════════════════════════
function renderRoundsReport() {
  const el = document.getElementById('roundsReportContent');
  if (!el) return;
  const hist = appState.matchHistory || [];
  if (hist.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px;">ยังไม่มีแมตช์ที่จบแล้ว</div>';
    return;
  }
  const rounds = [...new Set(hist.map(m => m.round))].sort((a,b) => parseInt(a)-parseInt(b));
  el.innerHTML = rounds.map(r => {
    const ms = hist.filter(m => m.round === r);
    const redW = ms.filter(m => m.rStat === 'W').length;
    const blueW = ms.filter(m => m.bStat === 'W').length;
    const draws = ms.filter(m => m.rStat === 'D').length;
    const total = ms.length;
    const redPct = total ? Math.round(redW/total*100) : 0;
    const bluePct = total ? Math.round(blueW/total*100) : 0;
    const drawPct = total ? Math.round(draws/total*100) : 0;
    const winner = redW > blueW ? 'RED' : blueW > redW ? 'BLUE' : 'DRAW';
    const wColor = winner==='RED'?'var(--red)':winner==='BLUE'?'var(--blue)':'var(--gold)';
    const matchRows = ms.map(m => {
      const rc = m.rStat==='W'?'var(--red)':m.bStat==='W'?'var(--blue)':'var(--gold)';
      const res = (m.result||'').replace(/[🔴🔵🤝]/g,'').trim();
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="color:var(--gold);font-weight:700;padding:7px 10px;">${m.id}</td>
        <td style="color:var(--red);padding:7px 10px;font-size:12px;">${escHtml(m.redNames)}</td>
        <td style="text-align:center;padding:7px 8px;font-weight:800;letter-spacing:1px;font-family:monospace;">${m.game1} / ${m.game2||'—'}</td>
        <td style="color:var(--blue);padding:7px 10px;font-size:12px;text-align:right;">${escHtml(m.blueNames)}</td>
        <td style="text-align:center;padding:7px 10px;"><span style="color:${rc};font-weight:800;font-size:12px;">${res}</span></td>
      </tr>`;
    }).join('');
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;">
      <div style="background:var(--surface2);padding:14px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--border);">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.5em;letter-spacing:3px;color:var(--gold);">ROUND ${r}</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <span style="background:rgba(255,59,92,0.12);color:var(--red);border:1px solid rgba(255,59,92,0.25);padding:3px 10px;border-radius:8px;font-weight:800;font-size:13px;">🔴 ${redW}W</span>
          <span style="background:rgba(245,200,66,0.1);color:var(--gold);border:1px solid rgba(245,200,66,0.2);padding:3px 10px;border-radius:8px;font-weight:800;font-size:13px;">🤝 ${draws}D</span>
          <span style="background:rgba(59,142,255,0.12);color:var(--blue);border:1px solid rgba(59,142,255,0.25);padding:3px 10px;border-radius:8px;font-weight:800;font-size:13px;">🔵 ${blueW}W</span>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--muted);">${total} แมตช์ · ผู้นำรอบ:</span>
          <span style="font-weight:800;color:${wColor};font-size:13px;">${winner}</span>
        </div>
      </div>
      <div style="padding:8px 12px;">
        <div style="display:flex;height:8px;border-radius:6px;overflow:hidden;margin:10px 4px 6px;gap:2px;">
          ${redPct>0?`<div style="flex:${redPct};background:var(--red);border-radius:4px 0 0 4px;"></div>`:''}
          ${drawPct>0?`<div style="flex:${drawPct};background:var(--gold);"></div>`:''}
          ${bluePct>0?`<div style="flex:${bluePct};background:var(--blue);border-radius:0 4px 4px 0;"></div>`:''}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:8px;">
          <thead><tr style="border-bottom:1px solid var(--border2);">
            <th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--muted);font-weight:800;letter-spacing:1px;">MATCH</th>
            <th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--red);font-weight:800;letter-spacing:1px;">RED</th>
            <th style="text-align:center;padding:6px 8px;font-size:10px;color:var(--muted);font-weight:800;letter-spacing:1px;">SCORE</th>
            <th style="text-align:right;padding:6px 10px;font-size:10px;color:var(--blue);font-weight:800;letter-spacing:1px;">BLUE</th>
            <th style="text-align:center;padding:6px 10px;font-size:10px;color:var(--muted);font-weight:800;letter-spacing:1px;">RESULT</th>
          </tr></thead>
          <tbody>${matchRows}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function exportRoundsPDF() {
  const hist = appState.matchHistory || [];
  if (hist.length === 0) return showToast('ยังไม่มีข้อมูล', 'error');
  const season = appState.seasonName || 'Sports Day 2026';
  const date   = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
  const redTeam  = appState.redTeamName  || 'RED TEAM';
  const blueTeam = appState.blueTeamName || 'BLUE TEAM';
  const rounds   = [...new Set(hist.map(m => m.round))].sort((a,b)=>parseInt(a)-parseInt(b));
  let totalRedW=0,totalBlueW=0,totalDraws=0;
  const roundSections = rounds.map(r => {
    const ms = hist.filter(m=>m.round===r);
    const redW  = ms.filter(m=>m.rStat==='W').length;
    const blueW = ms.filter(m=>m.bStat==='W').length;
    const draws = ms.filter(m=>m.rStat==='D').length;
    totalRedW+=redW; totalBlueW+=blueW; totalDraws+=draws;
    const total=ms.length;
    const winner = redW>blueW?`🔴 ${redTeam}`:blueW>redW?`🔵 ${blueTeam}`:'🤝 เสมอ';
    const wColor = redW>blueW?'#e53935':blueW>redW?'#1e88e5':'#f9a825';
    const rows = ms.map(m=>{
      const res=(m.result||'').replace(/[🔴🔵🤝]/g,'').trim();
      const rc=m.rStat==='W'?'#e53935':m.bStat==='W'?'#1e88e5':'#f9a825';
      return `<tr>
        <td class="mc">${m.id}</td>
        <td class="red-td">${m.redNames}</td>
        <td class="mc score-td">${m.game1}${m.game2?` / ${m.game2}`:''}</td>
        <td class="blue-td">${m.blueNames}</td>
        <td class="mc" style="color:${rc};font-weight:800;">${res}</td>
      </tr>`;
    }).join('');
    const rPct=total?Math.round(redW/total*100):0, bPct=total?Math.round(blueW/total*100):0, dPct=total?Math.round(draws/total*100):0;
    return `<div class="round-card">
      <div class="round-header">
        <div class="round-title">ROUND ${r}</div>
        <div class="round-badges">
          <span class="badge red-badge">🔴 ${redW}W</span>
          <span class="badge draw-badge">🤝 ${draws}D</span>
          <span class="badge blue-badge">🔵 ${blueW}W</span>
        </div>
        <div class="round-winner" style="color:${wColor};">ผู้นำ: ${winner}</div>
      </div>
      <div class="progress-bar">
        ${rPct>0?`<div class="prog-red" style="flex:${rPct}"></div>`:''}
        ${dPct>0?`<div class="prog-draw" style="flex:${dPct}"></div>`:''}
        ${bPct>0?`<div class="prog-blue" style="flex:${bPct}"></div>`:''}
      </div>
      <table>
        <thead><tr>
          <th class="mc" style="width:60px;">Match</th>
          <th class="red-th">🔴 Red Team</th>
          <th class="mc score-td" style="width:130px;">Score</th>
          <th class="blue-th">🔵 Blue Team</th>
          <th class="mc" style="width:110px;">Result</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
  const totalMatch=hist.length;
  const overallWinner=totalRedW>totalBlueW?`🔴 ${redTeam}`:totalBlueW>totalRedW?`🔵 ${blueTeam}`:'🤝 เสมอ';
  const owColor=totalRedW>totalBlueW?'#e53935':totalBlueW>totalRedW?'#1e88e5':'#f9a825';
  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>${season} — Rounds Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800;900&family=Space+Grotesk:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Space Grotesk',sans-serif;background:#f0f2f5;color:#1a1a2e;padding:0;}
  .page{max-width:900px;margin:0 auto;padding:32px 24px 48px;}
  /* ── header ── */
  .doc-header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:36px 40px;border-radius:20px;margin-bottom:28px;position:relative;overflow:hidden;}
  .doc-header::before{content:'';position:absolute;top:-40px;right:-40px;width:220px;height:220px;background:radial-gradient(circle,rgba(245,200,66,0.15),transparent 70%);border-radius:50%;}
  .doc-header::after{content:'🏸';position:absolute;bottom:-10px;right:28px;font-size:90px;opacity:0.08;}
  .doc-title{font-family:'Kanit',sans-serif;font-size:36px;font-weight:900;letter-spacing:3px;margin-bottom:6px;}
  .doc-subtitle{font-size:13px;color:rgba(255,255,255,0.55);letter-spacing:1px;}
  .doc-meta{display:flex;gap:24px;margin-top:20px;flex-wrap:wrap;}
  .meta-chip{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);}
  /* ── overall summary ── */
  .overall-card{background:#fff;border-radius:16px;padding:24px 28px;margin-bottom:24px;box-shadow:0 2px 12px rgba(0,0,0,0.06);border:1px solid #e8e8f0;display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
  .ov-label{font-size:11px;font-weight:800;letter-spacing:2px;color:#999;text-transform:uppercase;margin-bottom:6px;}
  .ov-score{display:flex;gap:20px;align-items:center;}
  .ov-team{text-align:center;padding:12px 24px;border-radius:12px;}
  .ov-team.red-ov{background:#fff5f6;border:2px solid #e53935;}
  .ov-team.blue-ov{background:#f0f6ff;border:2px solid #1e88e5;}
  .ov-num{font-family:'Kanit',sans-serif;font-size:40px;font-weight:900;line-height:1;}
  .ov-team.red-ov .ov-num{color:#e53935;}
  .ov-team.blue-ov .ov-num{color:#1e88e5;}
  .ov-lbl{font-size:10px;font-weight:700;letter-spacing:2px;color:#aaa;margin-top:4px;}
  .ov-winner{font-family:'Kanit',sans-serif;font-size:22px;font-weight:800;color:${owColor};}
  .ov-draw-box{text-align:center;padding:12px 20px;border-radius:12px;background:#fffbea;border:2px solid #f9a825;}
  .ov-draw-box .ov-num{color:#f9a825;}
  /* ── round card ── */
  .round-card{background:#fff;border-radius:16px;margin-bottom:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);border:1px solid #e8e8f0;}
  .round-header{background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#fff;padding:16px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
  .round-title{font-family:'Kanit',sans-serif;font-size:22px;font-weight:900;letter-spacing:3px;color:#f5c842;}
  .round-badges{display:flex;gap:8px;flex-wrap:wrap;}
  .badge{padding:4px 12px;border-radius:20px;font-weight:800;font-size:12px;letter-spacing:0.5px;}
  .red-badge{background:rgba(229,57,53,0.2);color:#ff8a80;border:1px solid rgba(229,57,53,0.4);}
  .draw-badge{background:rgba(249,168,37,0.2);color:#ffd54f;border:1px solid rgba(249,168,37,0.4);}
  .blue-badge{background:rgba(30,136,229,0.2);color:#82b1ff;border:1px solid rgba(30,136,229,0.4);}
  .round-winner{margin-left:auto;font-size:13px;font-weight:800;letter-spacing:1px;}
  .progress-bar{display:flex;height:6px;gap:2px;margin:0;}
  .prog-red{background:#e53935;}
  .prog-draw{background:#f9a825;}
  .prog-blue{background:#1e88e5;}
  table{width:100%;border-collapse:collapse;}
  th{padding:9px 12px;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#888;border-bottom:2px solid #f0f0f0;background:#fafafa;}
  td{padding:9px 12px;border-bottom:1px solid #f4f4f8;font-size:12px;vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  tr:hover td{background:#fafafa;}
  .mc{text-align:center;}
  .red-th,.red-td{color:#e53935;font-weight:600;}
  .blue-th,.blue-td{color:#1e88e5;font-weight:600;text-align:right;}
  .red-th,.blue-th{font-size:10px;font-weight:800;letter-spacing:1px;}
  .score-td{font-family:monospace;font-weight:700;font-size:13px;background:#f9f9ff;color:#333;}
  /* ── footer ── */
  .doc-footer{text-align:center;color:#bbb;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #eee;}
  @media print{
    body{background:#fff;}
    .page{padding:20px;}
    .round-card{break-inside:avoid;}
    .doc-header::after{display:none;}
  }
</style>
</head><body>
<div class="page">
  <div class="doc-header">
    <div class="doc-title">🏸 ${season}</div>
    <div class="doc-subtitle">ROUNDS REPORT — สรุปผลการแข่งขันแต่ละรอบ</div>
    <div class="doc-meta">
      <span class="meta-chip">📅 ${date}</span>
      <span class="meta-chip">📊 ${totalMatch} แมตช์ · ${rounds.length} รอบ</span>
      <span class="meta-chip" style="color:#f5c842;">ผู้นำรวม: ${overallWinner}</span>
    </div>
  </div>

  <div class="overall-card">
    <div>
      <div class="ov-label">สรุปภาพรวมทุกรอบ</div>
      <div class="ov-score">
        <div class="ov-team red-ov"><div class="ov-num">${totalRedW}</div><div class="ov-lbl">🔴 RED WIN</div></div>
        <div class="ov-draw-box"><div class="ov-num">${totalDraws}</div><div class="ov-lbl">🤝 DRAW</div></div>
        <div class="ov-team blue-ov"><div class="ov-num">${totalBlueW}</div><div class="ov-lbl">🔵 BLUE WIN</div></div>
      </div>
    </div>
    <div style="margin-left:auto;text-align:center;">
      <div class="ov-label">ผู้นำรวม</div>
      <div class="ov-winner">${overallWinner}</div>
    </div>
  </div>

  ${roundSections}

  <div class="doc-footer">Generated by Sports Day ${new Date().getFullYear()} System · ${new Date().toLocaleString('th-TH')}</div>
</div>
</body></html>`;
  const w=window.open('','_blank','width=960,height=720');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=>{ w.print(); },900);
}

function exportPlayerPDF() {
  const stats  = getPlayerStats();
  const season = appState.seasonName || 'Sports Day 2026';
  const date   = new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' });
  const hist   = appState.matchHistory || [];
  const players = appState.players || [];

  // ── filter state read from selectors ──
  const filterMode  = document.getElementById('pdfFilterMode')?.value  || 'all';
  const filterValue = document.getElementById('pdfFilterValue')?.value || '';

  // ── Validate: ถ้าเลือก mode ที่ต้องระบุ value แต่ยังไม่เลือก → แจ้งเตือน ──
  if (filterMode === 'player' && !filterValue) return showToast('❌ กรุณาเลือกผู้เล่นที่ต้องการ Export', 'error');
  if (filterMode === 'group'  && !filterValue) return showToast('❌ กรุณาเลือกกลุ่มที่ต้องการ Export', 'error');
  if (filterMode === 'team'   && !filterValue) return showToast('❌ กรุณาเลือกสี/ทีมที่ต้องการ Export', 'error');

  let targetPlayers = players;
  if (filterMode === 'player' && filterValue) {
    // ผู้เล่น = เฉพาะคนนั้นคนเดียว
    targetPlayers = players.filter(p => p.id === filterValue);
  } else if (filterMode === 'group' && filterValue) {
    // กลุ่ม = เฉพาะกลุ่ม 1/2/3 ไม่สนทีม
    targetPlayers = players.filter(p => String(p.group) === String(filterValue));
  } else if (filterMode === 'team' && filterValue) {
    // สี/ทีม = เฉพาะ Red หรือ Blue
    targetPlayers = players.filter(p => p.team === filterValue);
  }
  if (targetPlayers.length === 0) return showToast('ไม่พบผู้เล่นตามเงื่อนไขที่เลือก', 'error');

  const sorted = [...targetPlayers].sort((a,b) => {
    const sa = stats[a.id]||{}, sb = stats[b.id]||{};
    return (sb.pts||0)-(sa.pts||0)||(sb.w||0)-(sa.w||0);
  });

  const playerSections = sorted.map((p, idx) => {
    const s = stats[p.id] || {};
    const prof = (appState.playerProfiles||{})[p.id] || {};
    const teamColor = p.team==='Red'?'#e53935':'#1e88e5';
    const teamBg    = p.team==='Red'?'#fff5f6':'#f0f6ff';
    const teamBorder= p.team==='Red'?'#e53935':'#1e88e5';
    const wr = s.total>0 ? Math.round(s.w/s.total*100) : 0;
    const mwr= (s.matchesPlayed||0)>0 ? Math.round((s.matchWin||0)/(s.matchesPlayed||1)*100) : 0;
    const streak = getPlayerStreak(p.id);
    const streakHtml = streak ? `<span style="padding:2px 8px;border-radius:6px;background:${streak.bg};color:${streak.color};border:1px solid ${streak.border};font-size:11px;font-weight:800;">${streak.label}</span>` : '<span style="color:#ccc;">—</span>';
    const matchRows = hist.filter(m=>[m.r1,m.r2,m.b1,m.b2].includes(p.id)).slice(-15).map(m=>{
      const isRed=[m.r1,m.r2].includes(p.id);
      const myResult=isRed?m.rStat:m.bStat;
      const oppNames=isRed?m.blueNames:m.redNames;
      const rc=myResult==='W'?'#1b5e20':myResult==='L'?'#b71c1c':'#e65100';
      const bg=myResult==='W'?'#f1f8e9':myResult==='L'?'#fff5f5':'#fffde7';
      const resLabel=myResult==='W'?'WIN':myResult==='L'?'LOSE':'DRAW';
      const oppColor=isRed?'#1e88e5':'#e53935';
      return `<tr style="background:${bg};">
        <td class="mc" style="font-weight:800;color:#777;">${m.id}</td>
        <td class="mc" style="color:#999;">R${m.round}</td>
        <td style="color:${oppColor};font-size:11px;">vs ${oppNames}</td>
        <td class="mc" style="font-family:monospace;font-weight:700;">${m.game1}${m.game2?' / '+m.game2:''}</td>
        <td class="mc"><span style="color:${rc};font-weight:900;font-size:12px;">${resLabel}</span></td>
      </tr>`;
    }).join('');
    const rank = sorted.findIndex(x=>x.id===p.id)+1;
    const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
    return `<div class="player-card">
      <div class="player-header" style="border-left:6px solid ${teamColor};background:${teamBg};">
        <div class="player-rank">${medal||'#'+rank}</div>
        <div class="player-info">
          <div class="player-name">${p.name}</div>
          <div class="player-meta">
            <span class="p-chip" style="background:${teamBg};border-color:${teamBorder};color:${teamColor};">${p.team}</span>
            <span class="p-chip">Group ${p.group}</span>
            <span class="p-chip">${p.id}</span>
            ${streakHtml}
          </div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num" style="color:#f9a825;">${s.pts||0}</div><div class="stat-label">Match Pts</div></div>
        <div class="stat-box"><div class="stat-num" style="color:${wr>=60?'#2e7d32':wr>=40?'#e65100':'#c62828'};">${s.total>0?wr+'%':'—'}</div><div class="stat-label">Win Rate</div></div>
        <div class="stat-box"><div class="stat-num" style="color:#1565c0;">${s.matchesPlayed||0}</div><div class="stat-label">Matches</div></div>
        <div class="stat-box"><div class="stat-num">${s.w||0}W / ${s.l||0}L</div><div class="stat-label">Game W/L</div></div>
        <div class="stat-box"><div class="stat-num" style="color:${(s.pointDiff||0)>=0?'#2e7d32':'#c62828'}">${(s.pointDiff||0)>0?'+':''}${s.pointDiff||0}</div><div class="stat-label">Point Diff</div></div>
        <div class="stat-box"><div class="stat-num">${(s.matchWin||0)}W / ${(s.matchLose||0)}L</div><div class="stat-label">Match W/L</div></div>
      </div>
      ${matchRows ? `<div style="margin-top:12px;">
        <div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:#aaa;margin-bottom:8px;text-transform:uppercase;">Match History (ล่าสุด)</div>
        <table><thead><tr>
          <th class="mc" style="width:60px;">ID</th><th class="mc" style="width:50px;">Round</th>
          <th>คู่แข่ง</th><th class="mc" style="width:120px;">Score</th><th class="mc" style="width:80px;">ผล</th>
        </tr></thead><tbody>${matchRows}</tbody></table>
      </div>` : ''}
    </div>`;
  }).join('');

  // ── Title text ──
  let titleText = 'ผู้เล่นทั้งหมด';
  if (filterMode === 'player' && sorted[0])      titleText = `ผู้เล่น: ${sorted[0].name}`;
  else if (filterMode === 'group' && filterValue) titleText = `กลุ่ม ${filterValue}`;
  else if (filterMode === 'team' && filterValue)  titleText = filterValue === 'Red' ? '🔴 ทีมแดง' : '🔵 ทีมน้ำเงิน';

  // ── Filename ──
  const safeName = filterMode === 'player' && sorted[0] ? sorted[0].name
    : filterMode === 'group' && filterValue ? `Group${filterValue}`
    : filterMode === 'team' && filterValue ? filterValue
    : 'AllPlayers';
  const fileName = `PlayerReport_${safeName}_${new Date().toISOString().slice(0,10)}.pdf`;

  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
<title>${season} — Player Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800;900&family=Space+Grotesk:wght@400;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Space Grotesk',sans-serif;background:#f0f2f5;color:#1a1a2e;padding:0;}
  .page{max-width:900px;margin:0 auto;padding:32px 24px 48px;}
  .doc-header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:36px 40px;border-radius:20px;margin-bottom:28px;position:relative;overflow:hidden;}
  .doc-header::before{content:'';position:absolute;top:-40px;right:-40px;width:220px;height:220px;background:radial-gradient(circle,rgba(245,200,66,0.15),transparent 70%);border-radius:50%;}
  .doc-header::after{content:'🏸';position:absolute;bottom:-10px;right:28px;font-size:90px;opacity:0.08;}
  .doc-title{font-family:'Kanit',sans-serif;font-size:36px;font-weight:900;letter-spacing:3px;margin-bottom:6px;}
  .doc-subtitle{font-size:13px;color:rgba(255,255,255,0.55);letter-spacing:1px;}
  .doc-meta{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;}
  .meta-chip{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);}
  .player-card{background:#fff;border-radius:16px;margin-bottom:20px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);border:1px solid #e8e8f0;padding:0 0 16px;}
  .player-header{display:flex;align-items:flex-start;gap:16px;padding:18px 22px;margin-bottom:16px;}
  .player-rank{font-family:'Kanit',sans-serif;font-size:28px;font-weight:900;min-width:42px;text-align:center;color:#666;}
  .player-name{font-family:'Kanit',sans-serif;font-size:26px;font-weight:900;line-height:1.1;margin-bottom:8px;}
  .player-meta{display:flex;gap:7px;flex-wrap:wrap;align-items:center;}
  .p-chip{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1px solid #ddd;background:#f5f5f5;color:#666;}
  .stat-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:0 22px;margin-bottom:12px;}
  .stat-box{background:#f9f9ff;border:1px solid #eef;border-radius:10px;padding:12px 8px;text-align:center;}
  .stat-num{font-family:'Kanit',sans-serif;font-size:22px;font-weight:900;line-height:1;color:#1a1a2e;}
  .stat-label{font-size:9px;font-weight:800;letter-spacing:1px;color:#aaa;text-transform:uppercase;margin-top:4px;}
  table{width:100%;border-collapse:collapse;margin:0 22px;width:calc(100% - 44px);}
  th{padding:8px 10px;font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#999;border-bottom:2px solid #f0f0f0;background:#fafafa;text-align:left;}
  td{padding:7px 10px;border-bottom:1px solid #f4f4f8;font-size:12px;vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  .mc{text-align:center;}
  .doc-footer{text-align:center;color:#bbb;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #eee;}
  @media print{
    body{background:#fff;}
    .page{padding:16px;}
    .player-card{break-inside:avoid;page-break-inside:avoid;}
    .doc-header::after{display:none;}
    .stat-grid{grid-template-columns:repeat(6,1fr);}
    .no-print{display:none!important;}
  }
</style>
<!-- Auto-trigger print-to-PDF on load -->
<script>
  window.addEventListener('load', function() {
    // รอ font โหลดก่อน แล้ว print อัตโนมัติ
    setTimeout(function() { window.print(); }, 1200);
  });
<\/script>
</head><body>
<div class="page">
  <div class="doc-header">
    <div class="doc-title">🏸 ${season}</div>
    <div class="doc-subtitle">PLAYER REPORT — ${titleText}</div>
    <div class="doc-meta">
      <span class="meta-chip">📅 ${date}</span>
      <span class="meta-chip">👥 ${sorted.length} ผู้เล่น</span>
    </div>
  </div>
  ${playerSections}
  <div class="doc-footer">Generated by Sports Day ${new Date().getFullYear()} System · ${new Date().toLocaleString('th-TH')}</div>
</div>
</body></html>`;

  // ── Auto-download: เปิด Blob URL แบบ _blank แล้ว print อัตโนมัติ ──
  // Browser จะแสดง Save as PDF dialog (print destination) แทน print กระดาษ
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (!w) {
    // Popup blocked — fallback: สร้าง <a> download .html
    showToast('⚠️ Popup ถูกบล็อก — กำลัง download แบบ fallback', 'warning');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace('.pdf', '.html');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Revoke blob URL หลัง 30 วิ
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function renderPlayerPdfControls() {
  const el = document.getElementById('playerPdfControls');
  const players = appState.players || [];
  const groups  = [...new Set(players.map(p=>p.group))].sort();
  const modeEl = document.getElementById('pdfFilterMode');
  const valEl  = document.getElementById('pdfFilterValue');
  if (!modeEl || !valEl) return;
  const mode = modeEl.value;
  if (mode === 'player') {
    // ผู้เล่น = เลือก 1 คน (ต้องเลือก — ไม่มี "ทุกคน")
    valEl.style.display = '';
    valEl.innerHTML = `<option value="">-- เลือกผู้เล่น --</option>`
      + players
          .slice()
          .sort((a,b) => a.name.localeCompare(b.name,'th'))
          .map(p => `<option value="${p.id}">${p.name} (${p.team === 'Red' ? '🔴' : '🔵'} G${p.group})</option>`)
          .join('');
  } else if (mode === 'group') {
    // กลุ่ม = เลือก 1/2/3 ไม่สนทีม (ต้องเลือก)
    valEl.style.display = '';
    valEl.innerHTML = `<option value="">-- เลือกกลุ่ม --</option>`
      + groups.map(g => `<option value="${g}">กลุ่ม ${g}</option>`).join('');
  } else if (mode === 'team') {
    // สี/ทีม = Red หรือ Blue เท่านั้น (ต้องเลือก)
    valEl.style.display = '';
    valEl.innerHTML = `<option value="">-- เลือกทีม --</option><option value="Red">🔴 ทีมแดง</option><option value="Blue">🔵 ทีมน้ำเงิน</option>`;
  } else {
    // ทั้งหมด = ไม่ต้องเลือก value
    valEl.style.display = 'none';
    valEl.innerHTML = '';
  }
}

function exportReportToCSV() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
  csvContent += "ID,Name,Team,Group,Points,Point Diff,Game Win,Game Lose,Match Draw,Total Games,Win Rate (%),Epic Comebacks,Gladiators,Marathon,Rollercoaster\n";

  const stats = getPlayerStats();

  const playerArr = Object.values(stats).sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff);
  playerArr.forEach(s => {
    const wr = s.total > 0 ? Math.round(s.w / s.total * 100) : 0;
    csvContent += `${s.id},${s.name},${s.team},${s.group},${s.pts},${s.pointDiff},${s.w},${s.l},${s.d},${s.total},${wr},${s.epicTags},${s.clutchTags},${s.marathonTags},${s.rollerTags}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Badminton_Report_2026.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

