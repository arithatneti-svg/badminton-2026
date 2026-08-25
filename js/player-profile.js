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
  // reset to personal tab
  document.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pd-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.pd-tab-btn')?.classList.add('active');
  document.getElementById('pdTabPersonal')?.classList.add('active');
  document.getElementById('pdViewPersonal').style.display = 'block';
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
    {label:'เพศ',      value:prof.gender   ||'—'},
    {label:'มือถนัด',  value:prof.hand     ||'—'},
    {label:'ตำแหน่ง',  value:prof.position ||'—'},
  ];
  document.getElementById('pdPersonalGrid').innerHTML = _pdFields
    .map(it=>`<div class="profile-field"><label>${it.label}</label><div style="font-size:14px;font-weight:700;color:var(--text);padding:8px 12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">${escHtml(it.value)}</div></div>`).join('');
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

