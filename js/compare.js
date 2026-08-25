// ── COMPARE STATE ──
let _compareA = null, _compareB = null;

function _renderCompareScoutContent(pA, pB, profA, profB, colorA, colorB, sameTeam) {
  const radarEl = document.getElementById('compareRadarWrap');

  // Scout comparison = admin/superadmin only (section is hidden for guests)
  if (!canScout()) { if (radarEl) radarEl.style.display = 'none'; return; }
  radarEl.style.display = 'flex';

  // สีเต็ม
  const cA    = pA.team === 'Red' ? 'rgba(255,59,92,0.9)'  : 'rgba(59,142,255,0.9)';
  const fillA = pA.team === 'Red' ? 'rgba(255,59,92,0.15)' : 'rgba(59,142,255,0.12)';
  const dotA  = pA.team === 'Red' ? '#ff3b5c' : '#3b8eff';
  const cB    = sameTeam ? 'rgba(245,200,66,0.9)' : (pB.team==='Blue' ? 'rgba(59,142,255,0.9)' : 'rgba(255,59,92,0.9)');
  const fillB = sameTeam ? 'rgba(245,200,66,0.08)' : (pB.team==='Blue' ? 'rgba(59,142,255,0.12)' : 'rgba(255,59,92,0.12)');
  const dotB  = sameTeam ? '#f5c842' : (pB.team==='Blue' ? '#3b8eff' : '#ff3b5c');
  const dashB = sameTeam ? 'stroke-dasharray="6,3"' : '';

  const vA = ABILITY_KEYS.map(k=>Math.min(5,Math.max(0,Number(profA[k.key]||0))));
  const vB = ABILITY_KEYS.map(k=>Math.min(5,Math.max(0,Number(profB[k.key]||0))));
  const n=ABILITY_KEYS.length, R=85, cx=0, cy=0;
  const angle=i=>(Math.PI*2*i/n)-Math.PI/2;
  const pt=(r,i)=>`${cx+r*Math.cos(angle(i))},${cy+r*Math.sin(angle(i))}`;
  let rings='';
  for(let g=1;g<=5;g++){const pts=Array.from({length:n},(_,i)=>pt(R*g/5,i)).join(' ');rings+=`<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;}
  const axes=Array.from({length:n},(_,i)=>`<line x1="0" y1="0" x2="${cx+R*Math.cos(angle(i))}" y2="${cy+R*Math.sin(angle(i))}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`).join('');
  const lbls=ABILITY_KEYS.map((a,i)=>{const lx=cx+(R+18)*Math.cos(angle(i)),ly=cy+(R+18)*Math.sin(angle(i));return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.4)" font-size="9" font-weight="700" font-family="Space Grotesk,sans-serif">${a.label}</text>`;}).join('');
  const polyA=`<polygon points="${vA.map((v,i)=>pt(R*v/5,i)).join(' ')}" fill="${fillA}" stroke="${cA}" stroke-width="2"/>`;
  const polyB=`<polygon points="${vB.map((v,i)=>pt(R*v/5,i)).join(' ')}" fill="${fillB}" stroke="${cB}" stroke-width="2" ${dashB}/>`;
  const dotsA=vA.map((v,i)=>`<circle cx="${cx+R*v/5*Math.cos(angle(i))}" cy="${cy+R*v/5*Math.sin(angle(i))}" r="3.5" fill="${dotA}"/>`).join('');
  const dotsB=vB.map((v,i)=>`<circle cx="${cx+R*v/5*Math.cos(angle(i))}" cy="${cy+R*v/5*Math.sin(angle(i))}" r="3.5" fill="${dotB}" stroke="var(--surface)" stroke-width="1"/>`).join('');
  const legendY=108;
  const legend=`
    <rect x="-90" y="${legendY-6}" width="12" height="3" fill="${cA}" rx="1"/>
    <text x="-74" y="${legendY}" fill="${cA}" font-size="10" font-weight="700" font-family="Space Grotesk,sans-serif" dominant-baseline="middle">${escHtml(pA.name)}</text>
    <rect x="-90" y="${legendY+10}" width="12" height="3" fill="${cB}" rx="1" ${dashB}/>
    <text x="-74" y="${legendY+16}" fill="${cB}" font-size="10" font-weight="700" font-family="Space Grotesk,sans-serif" dominant-baseline="middle">${escHtml(pB.name)}</text>
    ${sameTeam?`<text x="-90" y="${legendY+32}" fill="rgba(245,200,66,0.6)" font-size="8" font-family="Space Grotesk,sans-serif">* ทีมเดียวกัน — เส้นประ = ${escHtml(pB.name)}</text>`:''}`;
  document.getElementById('compareRadarSvg').innerHTML = rings+axes+polyA+polyB+dotsA+dotsB+lbls+legend;

  // Ability bars
  document.getElementById('compareBarSection').innerHTML =
    `<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:var(--muted);margin-bottom:10px;">ABILITY STATS</div>` +
    ABILITY_KEYS.map((a,i)=>{
      const va=vA[i], vb=vB[i], diff=va-vb;
      const dc=diff>0?cA:diff<0?cB:'var(--muted)';
      const dl=diff>0?`+${diff.toFixed(diff%1?1:0)}`:diff<0?`${diff.toFixed(diff%1?1:0)}`:'=';
      return `<div class="compare-bar-row">
        <div class="compare-bar-label">${a.icon} ${a.label}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:${va/5*100}%;height:7px;border-radius:3px;background:${cA};transition:width 0.5s;min-width:${va>0?4:0}px;"></div>
            <span style="font-family:'Bebas Neue',sans-serif;color:${cA};font-size:0.9em;min-width:20px;">${va||'—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:${vb/5*100}%;height:7px;border-radius:3px;background:${cB};transition:width 0.5s;min-width:${vb>0?4:0}px;"></div>
            <span style="font-family:'Bebas Neue',sans-serif;color:${cB};font-size:0.9em;min-width:20px;">${vb||'—'}</span>
          </div>
        </div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:0.9em;min-width:24px;text-align:right;color:${dc};">${dl}</div>
      </div>`;
    }).join('');
}

function openCompareModal() {
  document.getElementById('compareModal').classList.add('open');
  renderComparePanel();
}
function closeCompareModal() {
  document.getElementById('compareModal').classList.remove('open');
}

function toggleCompare(playerId) {
  const pName = ( appState.players || [] ).find(x=>x.id===playerId)?.name || playerId;
  if (_compareA === playerId) {
    _compareA = null;
    showToast(`❌ ยกเลิก ${pName} จาก Slot A`, '');
    renderPlayersTab(); return;
  }
  if (_compareB === playerId) {
    _compareB = null;
    showToast(`❌ ยกเลิก ${pName} จาก Slot B`, '');
    renderPlayersTab(); return;
  }
  if (!_compareA) {
    _compareA = playerId;
    showToast(`🔴 เลือก ${pName} — กด ⚖️ ผู้เล่นคนที่ 2 เพื่อ Compare`, 'info');
    renderPlayersTab(); return;
  }
  if (!_compareB) {
    _compareB = playerId;
    renderPlayersTab();
    openCompareModal(); return;
  }
  // ทั้งสอง slot เต็ม → เลื่อน B ออก เลือกใหม่
  _compareA = _compareB;
  _compareB = playerId;
  renderPlayersTab();
  openCompareModal();
}

function clearCompare() {
  _compareA = null; _compareB = null;
  closeCompareModal();
  renderPlayersTab();
}
function clearCompareSlot(slot) {
  if (slot === 'a') _compareA = null; else _compareB = null;
  renderComparePanel();
  renderPlayersTab();
  if (!_compareA && !_compareB) closeCompareModal();
}

function renderComparePanel() {
  const pA    = _compareA ? ( appState.players || [] ).find(x=>x.id===_compareA) : null;
  const pB    = _compareB ? ( appState.players || [] ).find(x=>x.id===_compareB) : null;
  const profA = _compareA ? (appState.playerProfiles||{})[_compareA]||{} : {};
  const profB = _compareB ? (appState.playerProfiles||{})[_compareB]||{} : {};

  // ── Slots ──
  const slotA = document.getElementById('compareSlotA'), slotAT = document.getElementById('compareSlotAText'), slotAC = document.getElementById('compareSlotAClear');
  const slotB = document.getElementById('compareSlotB'), slotBT = document.getElementById('compareSlotBText'), slotBC = document.getElementById('compareSlotBClear');
  if (pA) { slotA.classList.add('filled'); slotAT.textContent = pA.name; slotAC.style.display='block'; }
  else    { slotA.classList.remove('filled'); slotAT.textContent='เลือกผู้เล่น A'; slotAC.style.display='none'; }
  if (pB) { slotB.classList.add('filled'); slotBT.textContent = pB.name; slotBC.style.display='block'; }
  else    { slotB.classList.remove('filled'); slotBT.textContent='เลือกผู้เล่น B'; slotBC.style.display='none'; }

  const publicSec = document.getElementById('comparePublicSection');
  const scoutSec  = document.getElementById('compareScoutSection');
  const hint      = document.getElementById('compareEmptyHint');

  if (!pA || !pB) {
    hint.style.display = 'block';
    publicSec.style.display = 'none';
    scoutSec.style.display  = 'none';
    return;
  }
  hint.style.display = 'none';
  publicSec.style.display = 'block';
  scoutSec.style.display  = canScout() ? 'block' : 'none';

  // ── สีผู้เล่น ──
  const teamA = pA.team || 'Red';
  const teamB = pB.team || 'Blue';
  const sameTeam = teamA === teamB;
  const colorA = teamA === 'Red' ? 'var(--red)'  : 'var(--blue)';
  const colorB = sameTeam        ? 'var(--gold)' : (teamB === 'Blue' ? 'var(--blue)' : 'var(--red)');

  // ════════════════════════════════
  // PUBLIC: Stat bars (win rate, matches, point diff)
  // ════════════════════════════════
  const stats = getPlayerStats();
  const stA = stats[_compareA] || {};
  const stB = stats[_compareB] || {};

  const statRow = (label, vA, vB, maxV, fmtA, fmtB, higherBetter=true) => {
    const pctA = maxV > 0 ? Math.min(100, vA/maxV*100) : 0;
    const pctB = maxV > 0 ? Math.min(100, vB/maxV*100) : 0;
    const aWins = higherBetter ? vA > vB : vA < vB;
    const bWins = higherBetter ? vB > vA : vB < vA;
    return `<div style="margin-bottom:12px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--muted);margin-bottom:6px;">${label}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:1.1em;color:${colorA};min-width:44px;text-align:right;${aWins?'font-size:1.25em;':''}">${fmtA}</span>
        <div style="flex:1;display:flex;flex-direction:column;gap:3px;">
          <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;">
            <div style="width:${pctA}%;height:100%;background:${colorA};border-radius:3px;transition:width 0.5s;"></div>
          </div>
          <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06);overflow:hidden;">
            <div style="width:${pctB}%;height:100%;background:${colorB};border-radius:3px;transition:width 0.5s;${sameTeam?'border:1px dashed '+colorB+';':''}"></div>
          </div>
        </div>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:1.1em;color:${colorB};min-width:44px;${bWins?'font-size:1.25em;':''}">${fmtB}</span>
      </div>
    </div>`;
  };

  const maxPts = Math.max(stA.pts||0, stB.pts||0, 1);
  const maxM   = Math.max(stA.matchesPlayed||0, stB.matchesPlayed||0, 1);
  const maxAbs = Math.max(Math.abs(stA.pointDiff||0), Math.abs(stB.pointDiff||0), 1);
  document.getElementById('compareStatBars').innerHTML =
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
       <span style="font-family:'Bebas Neue',sans-serif;font-size:1em;color:${colorA};letter-spacing:2px;">${escHtml(pA.name)}</span>
       <span style="flex:1;text-align:center;font-size:10px;color:var(--muted);letter-spacing:2px;font-weight:700;">VS</span>
       <span style="font-family:'Bebas Neue',sans-serif;font-size:1em;color:${colorB};letter-spacing:2px;${sameTeam?'text-decoration:underline dashed;':''}">${escHtml(pB.name)}</span>
     </div>` +
    statRow('🏆 คะแนน (PTS)',  stA.pts||0, stB.pts||0, maxPts, stA.pts||0, stB.pts||0) +
    statRow('📊 Win Rate (เกม)', stA.winRate||0, stB.winRate||0, 100, `${stA.winRate||0}%`, `${stB.winRate||0}%`) +
    statRow('🏸 แมตช์ที่แข่ง', stA.matchesPlayed||0, stB.matchesPlayed||0, maxM, stA.matchesPlayed||0, stB.matchesPlayed||0) +
    statRow('📈 Point Diff',    stA.pointDiff||0, stB.pointDiff||0, maxAbs,
      `${stA.pointDiff>=0?'+':''}${stA.pointDiff||0}`, `${stB.pointDiff>=0?'+':''}${stB.pointDiff||0}`);

  // ════════════════════════════════
  // PUBLIC: Play Style + Dominant Shot
  // ════════════════════════════════
  const styleSection = document.getElementById('compareStyleSection');
  const makeStyleHtml = (prof, align) => {
    const badges = (prof.styles||[]).map(sk => {
      const st = PLAY_STYLES.find(x=>x.key===sk);
      return st ? `<span class="style-badge ${st.cls}">${st.icon} ${st.label}</span>` : '';
    }).join('');
    const shot = prof.dominantShot
      ? `<div style="margin-top:6px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);display:inline-block;">🎯 ${DOMINANT_SHOTS[prof.dominantShot]||''}</div>` : '';
    return `<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:${align};">${badges||`<span style="color:var(--muted);font-size:12px;">ยังไม่กำหนด</span>`}</div>${shot}`;
  };
  document.getElementById('compareStyleA').innerHTML = makeStyleHtml(profA, 'flex-start');
  document.getElementById('compareStyleB').innerHTML = makeStyleHtml(profB, 'flex-end');
  styleSection.style.display = 'block';

  // ── Weakness (superadmin เท่านั้น) ──
  const weakEl = document.getElementById('compareWeaknessSection');
  if (weakEl) {
    if (userRole === 'superadmin') {
      const wA = profA.weakness ? `<div style="font-size:12px;color:var(--danger);padding:8px 10px;background:rgba(255,59,92,0.05);border-radius:8px;border:1px solid rgba(255,59,92,0.15);">${escHtml(profA.weakness)}</div>` : `<span style="font-size:11px;color:var(--muted);">—</span>`;
      const wB = profB.weakness ? `<div style="font-size:12px;color:var(--danger);padding:8px 10px;background:rgba(255,59,92,0.05);border-radius:8px;border:1px solid rgba(255,59,92,0.15);text-align:right;">${escHtml(profB.weakness)}</div>` : `<span style="font-size:11px;color:var(--muted);">—</span>`;
      document.getElementById('compareWeaknessA').innerHTML = wA;
      document.getElementById('compareWeaknessB').innerHTML = wB;
      weakEl.style.display = 'block';
    } else {
      weakEl.style.display = 'none';
    }
  }

  // ════════════════════════════════
  // PUBLIC: H2H — Game Level
  // ════════════════════════════════
  const h2hSection = document.getElementById('compareH2H');
  let g1WinA=0, g1WinB=0, g2WinA=0, g2WinB=0;
  const h2hMatches = [];

  appState.matchHistory.forEach(h => {
    const aIsRed  = [h.r1,h.r2].includes(_compareA);
    const aIsBlue = [h.b1,h.b2].includes(_compareA);
    const bIsRed  = [h.r1,h.r2].includes(_compareB);
    const bIsBlue = [h.b1,h.b2].includes(_compareB);
    const validH2H = (aIsRed && bIsBlue) || (aIsBlue && bIsRed);
    if (!validH2H) return;

    const aOnRed = aIsRed;
    const [g1r,g1b] = (h.game1||'0:0').split(':').map(Number);
    const [g2r,g2b] = (h.game2||'0:0').split(':').map(Number);
    const hasG2 = g2r > 0 || g2b > 0;

    // G1
    const g1ScoreA = aOnRed ? g1r : g1b;
    const g1ScoreB = aOnRed ? g1b : g1r;
    const g1AWon = g1ScoreA > g1ScoreB;
    if (g1AWon) g1WinA++; else g1WinB++;

    // G2
    let g2ScoreA = null, g2ScoreB = null, g2AWon = null;
    if (hasG2) {
      g2ScoreA = aOnRed ? g2r : g2b;
      g2ScoreB = aOnRed ? g2b : g2r;
      g2AWon = g2ScoreA > g2ScoreB;
      if (g2AWon) g2WinA++; else g2WinB++;
    }

    h2hMatches.push({ id: h.id, g1ScoreA, g1ScoreB, g1AWon, g2ScoreA, g2ScoreB, g2AWon, hasG2 });
  });

  const totalG1 = g1WinA + g1WinB;
  const totalG2 = g2WinA + g2WinB;
  const totalGames = totalG1 + totalG2;

  if (totalGames > 0) {
    const wr = Math.round((g1WinA + g2WinA) / totalGames * 100);
    const wrc = wr >= 60 ? 'var(--green)' : wr >= 40 ? 'var(--gold)' : 'var(--danger)';

    const matchRows = h2hMatches.map(m => {
      const g1Color = m.g1AWon ? colorA : colorB;
      const g2Color = m.hasG2 ? (m.g2AWon ? colorA : colorB) : 'var(--muted)';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface2);border-radius:8px;font-size:12px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:0.9em;letter-spacing:2px;color:var(--muted);flex-shrink:0;">${m.id}</span>
        <div style="display:flex;gap:6px;flex:1;flex-wrap:wrap;">
          <span style="padding:1px 8px;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid ${g1Color};font-size:11px;font-weight:700;">
            G1 <span style="color:${colorA};">${m.g1ScoreA}</span><span style="color:var(--muted);">:</span><span style="color:${colorB};">${m.g1ScoreB}</span>
          </span>
          ${m.hasG2 ? `<span style="padding:1px 8px;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid ${g2Color};font-size:11px;font-weight:700;">
            G2 <span style="color:${colorA};">${m.g2ScoreA}</span><span style="color:var(--muted);">:</span><span style="color:${colorB};">${m.g2ScoreB}</span>
          </span>` : ''}
        </div>
      </div>`;
    }).join('');

    document.getElementById('compareH2HContent').innerHTML = `
      <!-- Summary bar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:2em;color:${colorA};min-width:28px;text-align:right;">${g1WinA+g2WinA}</span>
        <div style="flex:1;height:10px;border-radius:5px;background:var(--surface3);overflow:hidden;display:flex;">
          <div style="width:${wr}%;background:${colorA};border-radius:5px 0 0 5px;transition:width 0.5s;"></div>
          <div style="width:${100-wr}%;background:${colorB};border-radius:0 5px 5px 0;opacity:0.8;"></div>
        </div>
        <span style="font-family:'Bebas Neue',sans-serif;font-size:2em;color:${colorB};min-width:28px;">${g1WinB+g2WinB}</span>
      </div>
      <!-- Game breakdown -->
      <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
        ${totalG1>0?`<div style="font-size:11px;font-weight:700;color:var(--muted);">G1: <span style="color:${colorA};">${g1WinA}W</span> — <span style="color:${colorB};">${g1WinB}W</span></div>`:''}
        ${totalG2>0?`<div style="font-size:11px;font-weight:700;color:var(--muted);">G2: <span style="color:${colorA};">${g2WinA}W</span> — <span style="color:${colorB};">${g2WinB}W</span></div>`:''}
        <div style="font-size:11px;font-weight:700;margin-left:auto;">Win Rate <span style="color:${wrc};">${wr}%</span> (${totalGames} เกม)</div>
      </div>
      <!-- Match list -->
      <div style="display:flex;flex-direction:column;gap:4px;">${matchRows}</div>`;
    h2hSection.style.display = 'block';
  } else {
    h2hSection.style.display = 'none';
  }

  // ════════════════════════════════
  // SCOUT: Radar + Bars (ถ้า unlock แล้ว)
  // ════════════════════════════════
  _renderCompareScoutContent(pA, pB, profA, profB, colorA, colorB, sameTeam);
}

