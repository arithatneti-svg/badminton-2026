// ══════════════════════════════════════════
// PLAYER PROFILE SYSTEM
// ══════════════════════════════════════════
let _pdCurrentId = null;

function openPlayerProfile(playerId) {
  _pdCurrentId = playerId;
  const overlay = document.getElementById('playerProfileOverlay');
  const p = ( appState.players || [] ).find(x => x.id === playerId);
  if (!p || !overlay) return;
  const prof = (appState.playerProfiles || {})[playerId] || {};
  const stats = getPlayerStats();
  const s = stats[playerId] || {};
  const isRed = p.team === 'Red';
  const teamColor = isRed ? 'var(--red)' : 'var(--blue)';
  document.getElementById('profileHeader').innerHTML = `
    <div class="profile-avatar" style="background:${isRed?'rgba(255,59,92,0.12)':'rgba(59,142,255,0.12)'};border-color:${teamColor};color:${teamColor};">${p.id}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:10px;font-weight:700;letter-spacing:3px;color:var(--muted);margin-bottom:4px;">${p.id} · ${isRed?'🔴 RED':'🔵 BLUE'} · GROUP ${p.group}</div>
      <div class="profile-name" style="color:${teamColor};">${escHtml(p.name)}</div>
      ${prof.baseScore&&userRole!=='guest'?`<div style="font-size:12px;font-weight:700;color:var(--gold);margin-top:4px;">⚡ Base Score: ${prof.baseScore}</div>`:''}
    </div>`;
  const wrColor = s.winRate>=70?'var(--green)':s.winRate>=40?'var(--gold)':s.total>0?'var(--danger)':'var(--muted)';
  const pdColor = (s.pointDiff||0)>=0?'var(--green)':'var(--danger)';
  document.getElementById('profileStatBar').innerHTML = `
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:var(--gold)">${s.pts||0}</div><div class="profile-stat-label">Points</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:var(--green)">${s.w||0}</div><div class="profile-stat-label">Game Win</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:var(--danger)">${s.l||0}</div><div class="profile-stat-label">Game Lose</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:var(--gold)">${s.matchDraw||0}</div><div class="profile-stat-label">Match Draw</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val">${s.matchesPlayed||0}</div><div class="profile-stat-label">Matches</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:${wrColor}">${s.total>0?s.winRate+'%':'—'}</div><div class="profile-stat-label">Game Win%</div></div>
    <div class="profile-stat-cell"><div class="profile-stat-val" style="color:${pdColor}">${(s.pointDiff||0)>0?'+':''}${s.pointDiff||0}</div><div class="profile-stat-label">Point Diff</div></div>`;
  renderPdPersonalView(prof);
  const ebw = document.getElementById('pdEditBtnWrap');
  if (ebw) ebw.style.display = (userRole==='admin'||userRole==='superadmin')?'block':'none';
  // reset to personal tab
  document.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.pd-tab-btn')?.classList.add('active');
  document.getElementById('pdTabPersonal')?.classList.add('active');
  document.getElementById('pdViewPersonal').style.display = 'block';
  document.getElementById('pdEditPersonal').style.display = 'none';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePlayerProfile() {
  const overlay = document.getElementById('playerProfileOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  _pdCurrentId = null;
  // หมายเหตุ: Scout tab แสดงเฉพาะ admin/superadmin (แท็บถูกซ่อนสำหรับ guest)
}

function renderPdPersonalView(prof) {
  const _pdFields = [
    {label:'เพศ',           value:prof.gender    ||'—'},
    {label:'มือถนัด',       value:prof.hand      ||'—'},
    {label:'ตำแหน่ง',      value:prof.position  ||'—'},
    ...(userRole !== 'guest' ? [{label:'🎯 Base Score', value:prof.baseScore ? prof.baseScore+' pts' : '—'}] : []),
  ];
  document.getElementById('pdPersonalGrid').innerHTML = _pdFields
    .map(it=>`<div class="profile-field"><label>${it.label}</label><div style="font-size:14px;font-weight:700;color:var(--text);padding:8px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">${escHtml(it.value)}</div></div>`).join('');

  // Style badges + Dominant Shot (ยังแสดงใน personal tab)
  const styleRow = document.getElementById('pdStyleRow');
  if (styleRow) {
    const badges = (prof.styles||[]).map(sk => {
      const st = PLAY_STYLES.find(x=>x.key===sk);
      return st ? `<span class="style-badge ${st.cls}">${st.icon} ${st.label}</span>` : '';
    }).join('');
    const shot = prof.dominantShot
      ? `<span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);">${DOMINANT_SHOTS[prof.dominantShot]||''}</span>` : '';
    styleRow.innerHTML = badges + (shot?`<br style="margin:2px 0">${shot}`:'');
    styleRow.style.display = (badges||shot) ? 'flex' : 'none';
  }
  // หมายเหตุ: Ability Chart, จุดเด่น/อ่อน, หมายเหตุ ย้ายไปอยู่ใน Scout tab แล้ว
}

// ── ABILITY CHART ──
const ABILITY_KEYS = [
  { key:'speed',     label:'ความเร็ว',   icon:'🏃', color:'#3b8eff',  desc:'ความเร็วในการเคลื่อนที่และตอบสนอง — วิ่งเข้าหาลูก ฟื้นตัวกลับหลัง และความว่องไวในสนาม' },
  { key:'power',     label:'พลัง',       icon:'💪', color:'#ff3b5c',  desc:'ความแรงของการตี — สแมช ตีรุก และลูกที่ต้องใช้กำลังมาก' },
  { key:'stamina',   label:'ความอึด',    icon:'🔋', color:'#00e676',  desc:'ความทนทานตลอดเกม — รักษาระดับการเล่นให้ดีตั้งแต่ต้นจนจบแมตช์' },
  { key:'technique', label:'เทคนิค',     icon:'🎯', color:'#f5c842',  desc:'ความแม่นยำในการควบคุมลูก — ตัดหน้า หยอด ดรอปช็อต และลูกที่ต้องใช้ทักษะสูง' },
  { key:'accuracy',  label:'ความแม่น',   icon:'🏹', color:'#a855f7',  desc:'ความแม่นในการวางลูก — ส่งลูกไปยังจุดที่ต้องการได้อย่างสม่ำเสมอ' },
  { key:'tactics',   label:'กลยุทธ์',    icon:'🧠', color:'#f97316',  desc:'ความสามารถในการอ่านเกมและตัดสินใจ — วางแผน จัดรูปแบบการเล่น และปรับตัวในระหว่างแมตช์' },
];

function renderAbilityChart(prof) {
  const vals = ABILITY_KEYS.map(a => Math.min(5, Math.max(0, Number(prof[a.key] || 0))));
  const hasAny = vals.some(v => v > 0);
  const svg = document.getElementById('pdRadarSvg');
  if (!svg) return;
  const n = ABILITY_KEYS.length, R = 80, cx = 0, cy = 0;
  const angle = i => (Math.PI * 2 * i / n) - Math.PI / 2;
  const pt = (r, i) => `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`;
  let rings = '';
  for (let g = 1; g <= 5; g++) {
    const pts = Array.from({length:n}, (_,i) => pt(R * g / 5, i)).join(' ');
    rings += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  }
  const axes = Array.from({length:n}, (_,i) =>
    `<line x1="${cx}" y1="${cy}" x2="${cx+R*Math.cos(angle(i))}" y2="${cy+R*Math.sin(angle(i))}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`
  ).join('');
  const labels = ABILITY_KEYS.map((a,i) => {
    const lx = cx+(R+18)*Math.cos(angle(i)), ly = cy+(R+18)*Math.sin(angle(i));
    return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.45)" font-size="9" font-weight="700" font-family="Space Grotesk,sans-serif" letter-spacing="1">${a.label.toUpperCase()}</text>`;
  }).join('');
  let polyFill = '', dots = '';
  if (hasAny) {
    const polyPts = vals.map((v,i) => pt(R * v / 5, i)).join(' ');
    polyFill = `<polygon points="${polyPts}" fill="rgba(245,200,66,0.12)" stroke="rgba(245,200,66,0.5)" stroke-width="1.5"/>`;
    dots = vals.map((v,i) => {
      const px = cx+R*v/5*Math.cos(angle(i)), py = cy+R*v/5*Math.sin(angle(i));
      return `<circle cx="${px}" cy="${py}" r="3.5" fill="var(--gold)" opacity="${v>0?1:0}"/>`;
    }).join('');
  } else {
    polyFill = `<polygon points="${Array.from({length:n},(_,i)=>pt(2,i)).join(' ')}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  }
  svg.innerHTML = rings + axes + polyFill + dots + labels;
  const bars = document.getElementById('pdAbilityBars');
  if (!bars) return;
  bars.innerHTML = ABILITY_KEYS.map((a,i) => {
    const v = vals[i];
    const full = Math.floor(v), half = (v % 1) >= 0.5;
    const dots2 = Array.from({length:5},(_,d) => {
      const bg = d < full ? a.color
               : (d === full && half) ? `linear-gradient(90deg,${a.color} 50%,rgba(255,255,255,0.08) 50%)`
               : 'rgba(255,255,255,0.08)';
      return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${bg};margin-right:3px;transition:background 0.3s;"></span>`;
    }).join('');
    const displayVal = v % 1 === 0 ? v : v.toFixed(1);
    return `<div class="ability-bar-row" title="${a.desc}">
      <div class="ability-bar-label" style="flex-direction:column;align-items:flex-start;gap:1px;">
        <span>${a.icon} ${a.label}</span>
        <span style="font-size:9px;color:var(--muted);font-weight:400;letter-spacing:0;text-transform:none;">${a.desc}</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">${dots2}</div>
      <div class="ability-bar-val" style="color:${a.color};font-family:'Bebas Neue',sans-serif;font-size:1.1em;min-width:24px;text-align:right;">${v>0?displayVal:'—'}</div>
    </div>`;
  }).join('');
}

function renderPdMatchHistory(playerId) {
  const el = document.getElementById('pdMatchHistory');
  if (!el) return;
  const matches = appState.matchHistory.filter(h=>[h.r1,h.r2,h.b1,h.b2].includes(playerId)).slice(-10).reverse();
  if (!matches.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="profile-section-title" style="margin-top:24px;">📋 ประวัติการแข่ง (10 ล่าสุด)</div>` +
    matches.map(h => {
      const isRed=[h.r1,h.r2].includes(playerId);
      const stat=isRed?h.rStat:h.bStat;
      const sc=stat==='W'?'var(--green)':stat==='L'?'var(--danger)':'var(--gold)';
      const sl=stat==='W'?'WIN':stat==='L'?'LOSE':'DRAW';
      const opp=isRed?h.blueNames:h.redNames;
      const tags=(h.analysis?.tags||[]).map(t=>`<span class="finished-tag tag-${t.id||'normal'}">${t.label||t.id}</span>`).join('');
      return `<div class="profile-match-row">
        <div class="profile-match-id">${h.id}</div>
        <div class="profile-match-result" style="background:${sc}22;color:${sc};border:1px solid ${sc}44;">${sl}</div>
        <div class="profile-match-vs">vs ${escHtml(opp)}</div>
        <div class="profile-match-score">${h.game1} / ${h.game2||'—'}</div>
        ${tags?`<div class="profile-match-tags">${tags}</div>`:''}
      </div>`;
    }).join('');
}

function renderPdH2H(playerId) {
  const el = document.getElementById('pdH2H');
  if (!el) return;
  const h2h = {};
  appState.matchHistory.forEach(h => {
    const isRed = [h.r1,h.r2].includes(playerId);
    const isBlue = [h.b1,h.b2].includes(playerId);
    if (!isRed && !isBlue) return;
    const oppIds = isRed ? [h.b1,h.b2] : [h.r1,h.r2];
    const [g1r,g1b] = (h.game1||'0:0').split(':').map(Number);
    const [g2r,g2b] = (h.game2||'0:0').split(':').map(Number);
    const g1win  = isRed ? g1r > g1b : g1b > g1r;
    const g1lose = isRed ? g1r < g1b : g1b < g1r;
    const g2played = g2r > 0 || g2b > 0;
    const g2win  = g2played && (isRed ? g2r > g2b : g2b > g2r);
    const g2lose = g2played && (isRed ? g2r < g2b : g2b < g2r);
    oppIds.filter(Boolean).forEach(oId => {
      if (!h2h[oId]) h2h[oId] = { w:0, l:0 };
      if (g1win)  h2h[oId].w++;
      if (g1lose) h2h[oId].l++;
      if (g2win)  h2h[oId].w++;
      if (g2lose) h2h[oId].l++;
    });
  });
  const entries = Object.entries(h2h).filter(([,r]) => r.w + r.l > 0);
  if (!entries.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="profile-section-title" style="margin-top:24px;">⚔️ Head-to-Head <span style="font-size:10px;font-weight:400;color:var(--muted);letter-spacing:1px;">(นับรายเกม)</span></div>` +
    entries.sort((a,b) => b[1].w - a[1].w).map(([oId,rec]) => {
      const op = ( appState.players || [] ).find(x=>x.id===oId);
      if (!op) return '';
      const total = rec.w + rec.l;
      const wr = total > 0 ? Math.round(rec.w/total*100) : 0;
      const wrc = wr>=60?'var(--green)':wr>=40?'var(--gold)':'var(--danger)';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="flex:1;font-size:14px;font-weight:700;">${escHtml(op.name)}</div>
          <div style="font-size:11px;font-weight:700;color:var(--green);">${rec.w}W</div>
          <div style="font-size:11px;color:var(--muted);">/</div>
          <div style="font-size:11px;font-weight:700;color:var(--danger);">${rec.l}L</div>
          <div style="font-size:13px;font-weight:800;min-width:38px;text-align:right;color:${wrc};">${wr}%</div>
        </div>
        <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:var(--surface3);">
          <div style="width:${wr}%;background:var(--green);transition:width 0.4s;"></div>
          <div style="width:${100-wr}%;background:var(--danger);transition:width 0.4s;"></div>
        </div>
      </div>`;
    }).join('');
}

function _buildSimilarOptions(currentId) {
  return '<option value="">— ไม่ระบุ —</option>' +
    appState.players.filter(p=>p.id!==currentId).map(p=>`<option value="${p.id}">${escHtml(p.name)} (G${p.group}·${p.team})</option>`).join('');
}

function openPdEdit() {
  if (!_pdCurrentId) return;
  const prof=(appState.playerProfiles||{})[_pdCurrentId]||{};
  document.getElementById('pdEditGender').value    = prof.gender    ||'';
  document.getElementById('pdEditHand').value      = prof.hand      ||'';
  document.getElementById('pdEditPosition').value  = prof.position  ||'';
  document.getElementById('pdEditBaseScore').value = prof.baseScore ||'';
  document.getElementById('pdEditStrengths').value = prof.strengths ||'';
  document.getElementById('pdEditNotes').value     = prof.notes     ||'';
  // ability sliders (superadmin only)
  if (userRole === 'superadmin') {
    ABILITY_KEYS.forEach(a => {
      const cap = a.key.charAt(0).toUpperCase()+a.key.slice(1);
      const slid = document.getElementById('pdEdit'+cap);
      const valEl = document.getElementById('pdEdit'+cap+'Val');
      const v = Math.min(5, Math.max(1, Number(prof[a.key]||3)));
      if (slid) slid.value = v;
      if (valEl) valEl.textContent = v;
    });
    // dominant shot, form, weakness
    const ds = document.getElementById('pdEditDominantShot');
    if (ds) ds.value = prof.dominantShot||'';
    const wk = document.getElementById('pdEditWeakness');
    if (wk) wk.value = prof.weakness||'';
  }
  // styles (all roles can see, superadmin saves)
  document.querySelectorAll('#pdEditStyleGrid button').forEach(btn => {
    const active = (prof.styles||[]).includes(btn.dataset.style);
    btn.classList.toggle('style-active', active);
    btn.style.opacity = active ? '1' : '0.45';
  });
  const optHtml = _buildSimilarOptions(_pdCurrentId);
  ['pdEditSimilar1','pdEditSimilar2','pdEditSimilar3'].forEach((id,i) => {
    const el=document.getElementById(id);
    if (el) { el.innerHTML=optHtml; el.value=(prof.similar||[])[i]||''; }
  });
  document.getElementById('pdViewPersonal').style.display='none';
  document.getElementById('pdEditPersonal').style.display='block';
}

function closePdEdit() {
  document.getElementById('pdEditPersonal').style.display='none';
  document.getElementById('pdViewPersonal').style.display='block';
}

function savePdEdit() {
  if (!_pdCurrentId) return;
  if (!appState.playerProfiles) appState.playerProfiles={};
  const similar=['pdEditSimilar1','pdEditSimilar2','pdEditSimilar3']
    .map(id=>document.getElementById(id)?.value||'').filter(Boolean);
  const old = appState.playerProfiles[_pdCurrentId] || {};
  const abilityData = {};
  if (userRole === 'superadmin') {
    ABILITY_KEYS.forEach(a => {
      const slid = document.getElementById('pdEdit'+a.key.charAt(0).toUpperCase()+a.key.slice(1));
      abilityData[a.key] = slid ? Math.min(5, Math.max(1, Math.round(Number(slid.value) * 2) / 2)) : (old[a.key]||0);
    });
  } else {
    ABILITY_KEYS.forEach(a => { abilityData[a.key] = old[a.key] || 0; });
  }
  // styles (available to all roles who can edit)
  const styles = Array.from(document.querySelectorAll('#pdEditStyleGrid button.style-active')).map(b=>b.dataset.style);

  appState.playerProfiles[_pdCurrentId]={
    gender:    document.getElementById('pdEditGender').value,
    hand:      document.getElementById('pdEditHand').value,
    position:  document.getElementById('pdEditPosition').value,
    baseScore: document.getElementById('pdEditBaseScore').value,
    strengths: document.getElementById('pdEditStrengths').value.trim(),
    notes:     document.getElementById('pdEditNotes').value.trim(),
    similar,
    styles,
    ...(userRole==='superadmin' ? {
      dominantShot: document.getElementById('pdEditDominantShot')?.value||'',
      weakness:     document.getElementById('pdEditWeakness')?.value.trim()||'',
    } : {
      dominantShot: old.dominantShot||'',
      weakness:     old.weakness||'',
    }),
    ...abilityData,
  };
  saveKeys(['players', 'playerProfiles'], true); // เฉพาะข้อมูลผู้เล่น ไม่แตะแมตช์สด
  closePdEdit();
  renderPdPersonalView(appState.playerProfiles[_pdCurrentId]);
  showToast('✓ บันทึกข้อมูลผู้เล่นเรียบร้อย','success');
}

