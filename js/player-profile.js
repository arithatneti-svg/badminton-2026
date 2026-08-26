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
  const canEdit = userRole === 'admin' || userRole === 'superadmin';
  const hasPhoto = !!playerPhoto(p.id);
  document.getElementById('profileHeader').innerHTML = `
    <div class="pd-avatar-wrap">
      ${avatarHtml(p, 112)}
      ${canEdit ? `<button class="pd-avatar-btn" title="${hasPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}" onclick="pickPlayerPhoto('${p.id}')">📷</button>` : ''}
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:10px;font-weight:700;letter-spacing:3px;color:var(--muted);margin-bottom:4px;">${p.id} · ${isRed?'🔴 RED':'🔵 BLUE'} · GROUP ${p.group}</div>
      <div class="profile-name" style="color:${teamColor};">${escHtml(p.name)}</div>
      ${canEdit ? `<div class="pd-admin-row">
        <button class="btn btn-outline btn-sm" onclick="pickPlayerPhoto('${p.id}')">📷 ${hasPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}</button>
        ${hasPhoto ? `<button class="btn btn-outline btn-sm" onclick="removePlayerPhoto('${p.id}')">🗑 ลบรูป</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="closePlayerProfile();openPlayerEdit('${p.id}')">✏️ แก้ไขข้อมูล</button>
      </div>` : ''}
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
  // one page — everything renders up front, no tabs to switch
  renderPdIdentity(prof);
  renderPdScoutNotes(prof);
  renderPdMatchHistory(playerId);
  renderPdH2H(playerId);
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closePlayerProfile() {
  const overlay = document.getElementById('playerProfileOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  _pdCurrentId = null;
}

// เพศ / มือถนัด / ตำแหน่ง — three short values, so they ride as inline
// chips rather than a grid of boxed form fields
function renderPdIdentity(prof) {
  const el = document.getElementById('pdIdentityRow');
  if (!el) return;
  const chips = [
    { icon:'⚧', label:'เพศ',     value: prof.gender },
    { icon:'✋', label:'มือถนัด', value: prof.hand },
    { icon:'📍', label:'ตำแหน่ง', value: prof.position },
  ].filter(c => c.value);
  el.innerHTML = chips.length
    ? chips.map(c => `<span class="pd-chip"><span class="pd-chip-lbl">${c.icon} ${c.label}</span><b>${escHtml(c.value)}</b></span>`).join('')
    : '';
}

// จุดแข็ง / จุดอ่อน / โน้ต — free text the desk wrote per player.
// Text only: the radar / ability / base-score analytics stay removed.
function renderPdScoutNotes(prof) {
  const el = document.getElementById('pdScoutNotes');
  if (!el) return;
  const blocks = [
    { cls:'good', icon:'💪', title:'จุดแข็ง',  text: prof.strengths },
    { cls:'bad',  icon:'🎯', title:'จุดอ่อน',  text: prof.weakness },
    { cls:'note', icon:'📝', title:'โน้ต',     text: prof.notes },
  ].filter(b => b.text && String(b.text).trim());
  if (!blocks.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="profile-section-title">🔍 สกาวต์</div>
    <div class="pd-notes">${blocks.map(b => `
      <div class="pd-note pd-note-${b.cls}">
        <div class="pd-note-title">${b.icon} ${b.title}</div>
        <div class="pd-note-text">${escHtml(String(b.text).trim())}</div>
      </div>`).join('')}</div>`;
}

function renderPdMatchHistory(playerId) {
  const el = document.getElementById('pdMatchHistory');
  if (!el) return;
  const matches = appState.matchHistory.filter(h=>[h.r1,h.r2,h.b1,h.b2].includes(playerId)).slice(-10).reverse();
  if (!matches.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="profile-section-title">📋 ประวัติการแข่ง (${matches.length} ล่าสุด)</div>` +
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
  el.innerHTML = `<div class="profile-section-title">⚔️ Head-to-Head <span style="font-weight:400;letter-spacing:1px;">(นับรายเกม)</span></div>` +
    entries.sort((a,b) => b[1].w - a[1].w).map(([oId,rec]) => {
      const op = ( appState.players || [] ).find(x=>x.id===oId);
      if (!op) return '';
      const total = rec.w + rec.l;
      const wr = total > 0 ? Math.round(rec.w/total*100) : 0;
      const wrc = wr>=60?'var(--green)':wr>=40?'var(--gold)':'var(--danger)';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          ${avatarHtml(op, 26)}
          <div style="flex:1;font-size:14px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(op.name)}</div>
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

