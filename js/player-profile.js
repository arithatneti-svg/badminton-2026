// ══════════════════════════════════════════
// PLAYER PROFILE SYSTEM
// ══════════════════════════════════════════
let _pdCurrentId = null;

// ══════════════════════════════════════════
// AWARDS — a player's medals, shown in an "Awards" showcase on the profile.
// Config list, easy to extend. Each award has an English title/subtitle and a
// `criteria`: `team` (everyone on that team) or `ids` (specific players, e.g. a
// future "Marathon Fighter"). Descriptions are English on purpose so the
// showcase reads the same as future awards.
// NOTE: `team` criteria follows the CURRENT team colour — if a later season
// reshuffles teams, pin the winners with `ids` (or add a superadmin declare).
// ══════════════════════════════════════════
// Computed awards. Champion is handled separately (it is admin-declared via
// currentChampion(), so its label is dynamic).
const AWARDS = [
  { id: 'mvp',              title: 'MVP',              subtitle: 'Top points this season', criteria: { dynamic: 'mvp' } },
  { id: 'marathon_fighter', title: 'Marathon Fighter', subtitle: 'Most time on court',      criteria: { dynamic: 'marathon' } },
];

// Player(s) with the most total time on court — sum of match durations across
// matchHistory. Ties all win; nobody wins if no match carries a duration.
function marathonWinnerIds() {
  const total = {};
  (appState.matchHistory || []).forEach(h => {
    const d = Number(h.duration) || 0;
    if (d <= 0) return;
    [h.r1, h.r2, h.b1, h.b2].forEach(id => { if (id) total[id] = (total[id] || 0) + d; });
  });
  let max = 0;
  Object.values(total).forEach(v => { if (v > max) max = v; });
  return max > 0 ? Object.keys(total).filter(id => total[id] === max) : [];
}
// Player(s) with the most points this season. Ties all win; none if all zero.
function mvpWinnerIds() {
  const stats = (typeof getPlayerStats === 'function') ? getPlayerStats() : {};
  let max = 0;
  Object.values(stats).forEach(s => { if ((s.pts || 0) > max) max = s.pts || 0; });
  return max > 0 ? Object.keys(stats).filter(id => (stats[id].pts || 0) === max) : [];
}

// Champion is declared by a superadmin (stored on appState.champion). Until one
// is ever declared it defaults to the season already live; clearing stores an
// empty team so it persists as "no champion" (rather than reverting to default).
function currentChampion() {
  return (appState && appState.champion !== undefined) ? appState.champion : { team: 'Blue', label: 'Summer 2026' };
}

function playerHasAward(p, a) {
  const c = a.criteria || {};
  if (c.team && p.team === c.team) return true;
  if (Array.isArray(c.ids) && c.ids.includes(p.id)) return true;
  if (c.dynamic === 'marathon') return marathonWinnerIds().includes(p.id);
  if (c.dynamic === 'mvp') return mvpWinnerIds().includes(p.id);
  return false;
}
function playerAwards(p) {
  if (!p) return [];
  const out = AWARDS.filter(a => playerHasAward(p, a));
  const ch = currentChampion();
  if (ch && ch.team && p.team === ch.team) {
    out.unshift({ title: 'Champion', subtitle: 'Team ' + ch.team + (ch.label ? ' · ' + ch.label : '') });
  }
  return out;
}

// ── Superadmin: declare the season champion (team + optional label) ──
function declareChampion(team) {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  const label = (document.getElementById('champLabel')?.value || '').trim();
  appState.champion = { team: team || '', label };   // team '' = cleared (persists)
  saveKeys(['champion'], true);
  updateChampControls();
  if (typeof renderPlayersTab === 'function') renderPlayersTab();
  if (_pdCurrentId) openPlayerProfile(_pdCurrentId);   // repaint an open profile
  showToast(team ? `🏆 ประกาศแชมป์: ทีม${team === 'Red' ? 'แดง' : 'น้ำเงิน'}${label ? ' · ' + label : ''}` : '✖ ล้างแชมป์แล้ว', 'success');
}
function updateChampControls() {
  const st = document.getElementById('champStatus');
  const lbl = document.getElementById('champLabel');
  const ch = currentChampion();
  if (st) st.textContent = (ch && ch.team) ? `ปัจจุบัน: ${ch.team}${ch.label ? ' · ' + ch.label : ''}` : 'ยังไม่มีแชมป์';
  if (lbl && ch && ch.label && !lbl.value) lbl.value = ch.label;
}

// Reusable gold star (SVG, crisp at any size, no image asset). Unique gradient
// id per call so multiple stars on the page never collide.
let _awStarSeq = 0;
function awardStarSvg(size) {
  const g = 'awGold' + (++_awStarSeq);
  return `<svg class="award-star" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">`
    + `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#ffe89a"/><stop offset=".48" stop-color="#f0c040"/><stop offset="1" stop-color="#c8901a"/>`
    + `</linearGradient></defs>`
    + `<path d="M50 6 L60.6 35.4 L91.8 36.4 L67.1 55.6 L75.9 85.6 L50 68 L24.1 85.6 L32.9 55.6 L8.2 36.4 L39.4 35.4 Z" `
    + `fill="url(#${g})" stroke="#8a5e10" stroke-width="2" stroke-linejoin="round"/>`
    + `<path d="M50 14 L58 34 L50 40 L42 34 Z" fill="rgba(255,255,255,.35)"/></svg>`;
}

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
  const teamChipBorder = isRed ? 'rgba(255,77,94,0.42)' : 'rgba(77,159,255,0.42)';
  const hdr = document.getElementById('profileHeader');
  // subtle team-colour wash behind the header (no corner award star)
  hdr.style.background = isRed
    ? 'linear-gradient(135deg, rgba(255,77,94,0.13), rgba(255,77,94,0.01) 62%), var(--surface)'
    : 'linear-gradient(135deg, rgba(77,159,255,0.15), rgba(77,159,255,0.01) 62%), var(--surface)';
  hdr.innerHTML = `
    <div class="pd-avatar-wrap">
      <div class="pd-avatar-click${hasPhoto ? ' zoomable' : ''}" ${hasPhoto ? `onclick="openPhotoLightbox('${p.id}')" title="ดูรูปเต็ม"` : ''}>${avatarHtml(p, 170)}</div>
      ${canEdit ? `<button class="pd-avatar-btn" title="${hasPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}" onclick="event.stopPropagation();pickPlayerPhoto('${p.id}')">📷</button>` : ''}
    </div>
    <div style="flex:1;min-width:0;">
      <div class="profile-name" style="color:${teamColor};">${escHtml(p.name)}</div>
      <div class="profile-meta-chips">
        <span class="profile-meta-chip">${p.id}</span>
        <span class="profile-meta-chip" style="color:${teamColor};border-color:${teamChipBorder};">${isRed?'🔴 RED':'🔵 BLUE'}</span>
        <span class="profile-meta-chip">GROUP ${p.group}</span>
      </div>
      ${canEdit ? `<div class="pd-admin-row">
        <button class="btn btn-outline btn-sm" onclick="pickPlayerPhoto('${p.id}')">📷 ${hasPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}</button>
        ${hasPhoto ? `<button class="btn btn-outline btn-sm" onclick="openPhotoAdjust('${p.id}')">🎯 จัดตำแหน่ง</button>` : ''}
        ${hasPhoto ? `<button class="btn btn-outline btn-sm" onclick="removePlayerPhoto('${p.id}')">🗑 ลบรูป</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="togglePdEdit(true)">📝 แก้ไขโปรไฟล์</button>
        <button class="btn btn-outline btn-sm" onclick="closePlayerProfile();openPlayerEdit('${p.id}')">✏️ ชื่อ/ทีม/กลุ่ม</button>
      </div>` : ''}
    </div>`;

  // Hero = win rate across every match; the rest ride as compact tiles.
  const wrColor = s.winRate>=70?'var(--green)':s.winRate>=40?'var(--gold)':s.total>0?'var(--danger)':'var(--muted)';
  const pdVal = s.pointDiff||0;
  const pdColor = pdVal>0?'var(--green)':pdVal<0?'var(--danger)':'var(--muted)';
  document.getElementById('profileStatBar').innerHTML = `
    <div class="pd-statbar">
      <div class="pd-stat-hero">
        <div class="v" style="color:${wrColor}">${s.total>0?s.winRate+'%':'—'}</div>
        <div class="l">Win Rate</div>
        <div class="sub">จากทุกแมตช์</div>
      </div>
      <div class="pd-stat-tiles">
        <div class="pd-stat-tile"><div class="v" style="color:var(--gold)">${s.pts||0}</div><div class="l">Points</div></div>
        <div class="pd-stat-tile"><div class="v" style="color:var(--green)">${s.w||0}</div><div class="l">Game Win</div></div>
        <div class="pd-stat-tile"><div class="v" style="color:var(--danger)">${s.l||0}</div><div class="l">Game Lose</div></div>
        <div class="pd-stat-tile"><div class="v">${s.matchesPlayed||0}</div><div class="l">Matches</div></div>
        <div class="pd-stat-tile"><div class="v" style="color:var(--gold)">${s.matchDraw||0}</div><div class="l">Match Draw</div></div>
        <div class="pd-stat-tile"><div class="v" style="color:${pdColor}">${pdVal>0?'+':''}${pdVal}</div><div class="l">Point Diff</div></div>
      </div>
    </div>`;
  // one page — everything renders up front, no tabs to switch
  renderPdAwards(p);
  renderPdIdentity(prof);
  renderPdScoutNotes(prof);
  renderPdMatchHistory(playerId);
  renderPdH2H(playerId);
  renderPdCareer(playerId);
  renderPdPastMatches(playerId);
  const _rv = document.getElementById('pdReadView'), _ev = document.getElementById('pdEditView');
  if (_rv && _ev) { _rv.hidden = false; _ev.hidden = true; }
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closePlayerProfile() {
  const overlay = document.getElementById('playerProfileOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  togglePdEdit(false);
  _pdCurrentId = null;
}

// Awards showcase — the player's medals (gold star + English title/subtitle).
// Hidden entirely when the player has no awards.
function renderPdAwards(p) {
  const el = document.getElementById('pdAwards');
  if (!el) return;
  const earned = playerAwards(p);
  if (!earned.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="profile-section-title">🏅 Awards</div>
    <div class="pd-awards-row">${earned.map(a => `
      <div class="pd-award-chip">
        <span class="pd-award-star">${awardStarSvg(24)}</span>
        <div class="pd-award-txt">
          <span class="pd-award-title">${escHtml(a.title)}</span>
          <span class="pd-award-sub">${escHtml(a.subtitle)}</span>
        </div>
      </div>`).join('')}</div>`;
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
    { icon:'🏸', label:'ลูกถนัด', value: prof.dominantShot },
  ].filter(c => c.value);
  const styles = (Array.isArray(prof.styles) ? prof.styles : []).filter(Boolean);
  const styleChips = styles.map(id => `<span class="pd-chip pd-chip-style">${pdStyleLabel(id)}</span>`).join('');
  el.innerHTML = chips.map(c => `<span class="pd-chip"><span class="pd-chip-lbl">${c.icon} ${c.label}</span><b>${escHtml(c.value)}</b></span>`).join('') + styleChips;
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
  el.innerHTML = `<div class="profile-section-title">📝 Note</div>
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
  const nameOf = id => (appState.players || []).find(p => p.id === id)?.name || id;
  el.innerHTML = `<div class="profile-section-title">📋 ประวัติการแข่ง (${matches.length} ล่าสุด)</div>` +
    matches.map(h => {
      const isRed=[h.r1,h.r2].includes(playerId);
      const stat=isRed?h.rStat:h.bStat;
      const sc=stat==='W'?'var(--green)':stat==='L'?'var(--danger)':'var(--gold)';
      const sl=stat==='W'?'WIN':stat==='L'?'LOSE':'DRAW';
      // the other player on this player's own side
      const mateId = isRed ? (h.r1 === playerId ? h.r2 : h.r1)
                           : (h.b1 === playerId ? h.b2 : h.b1);
      const oppIds = isRed ? [h.b1, h.b2] : [h.r1, h.r2];
      const sideColor = isRed ? 'var(--red)' : 'var(--blue)';
      const oppColor  = isRed ? 'var(--blue)' : 'var(--red)';
      const tags=(h.analysis?.tags||[]).map(t=>`<span class="finished-tag tag-${t.id||'normal'}">${t.label||t.id}</span>`).join('');
      return `<div class="profile-match-row">
        <div class="profile-match-id">${h.id}</div>
        <div class="profile-match-result" style="background:${sc}22;color:${sc};border:1px solid ${sc}44;">${sl}</div>
        <div class="profile-match-pair">
          <div class="pmr-line">
            <span class="pmr-lbl">คู่กับ</span>
            <b style="color:${sideColor};">${escHtml(mateId ? nameOf(mateId) : '—')}</b>
          </div>
          <div class="pmr-line">
            <span class="pmr-lbl">พบ</span>
            <b style="color:${oppColor};">${escHtml(oppIds.filter(Boolean).map(nameOf).join(' & '))}</b>
          </div>
        </div>
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

// ══════════════════════════════════════════
// PROFILE EDIT — swaps in place over the read view (admin only).
// Writes to playerProfiles[id]; name/team/group live on players and
// keep their own modal (openPlayerEdit).
// ══════════════════════════════════════════
const PD_STYLES = [
  { id:'attacker',   label:'⚔️ Attacker' },
  { id:'defender',   label:'🛡️ Defender' },
  { id:'allround',   label:'🎯 All-Round' },
  { id:'controller', label:'🧠 Controller' },
  { id:'speed',      label:'⚡ Speed Runner' },
  { id:'deceptive',  label:'🔮 Deceptive' },
  { id:'power',      label:'💪 Power Hitter' },
  { id:'netmaster',  label:'🕸️ Net Master' },
];
const PD_HANDS     = ['ขวา', 'ซ้าย', 'ถนัดสองมือ'];
const PD_GENDERS   = ['ชาย', 'หญิง'];
const PD_POSITIONS = ['หน้า', 'หลัง', 'ทั้งคู่'];

function pdStyleLabel(id) { return PD_STYLES.find(s => s.id === id)?.label || id; }

function togglePdEdit(on) {
  const read = document.getElementById('pdReadView');
  const edit = document.getElementById('pdEditView');
  if (!read || !edit) return;
  if (on) {
    if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
    renderPdEditForm((appState.playerProfiles || {})[_pdCurrentId] || {});
    read.hidden = true; edit.hidden = false;
  } else {
    edit.hidden = true; read.hidden = false;
  }
}

function renderPdEditForm(prof) {
  const el = document.getElementById('pdEditView');
  if (!el) return;
  const sel = (id, label, options, value) => `
    <div class="profile-field">
      <label>${label}</label>
      <select id="${id}">
        <option value="">— ไม่ระบุ —</option>
        ${options.map(o => `<option value="${escHtml(o)}"${o === value ? ' selected' : ''}>${escHtml(o)}</option>`).join('')}
      </select>
    </div>`;
  const txt = (id, label, value, ph) => `
    <div class="profile-field">
      <label>${label}</label>
      <input type="text" id="${id}" value="${escHtml(value || '')}" placeholder="${ph || ''}">
    </div>`;
  const area = (id, label, value, ph) => `
    <div class="profile-field">
      <label>${label}</label>
      <textarea id="${id}" placeholder="${ph || ''}">${escHtml(value || '')}</textarea>
    </div>`;

  const styles = Array.isArray(prof.styles) ? prof.styles : [];
  el.innerHTML = `
    <div class="profile-section-title">📝 แก้ไขโปรไฟล์</div>
    <div class="profile-field-grid">
      ${sel('pdfGender',   'เพศ',       PD_GENDERS,   prof.gender)}
      ${sel('pdfHand',     'มือถนัด',   PD_HANDS,     prof.hand)}
      ${sel('pdfPosition', 'ตำแหน่ง',   PD_POSITIONS, prof.position)}
      ${txt('pdfShot',     'ลูกถนัด',   prof.dominantShot, 'เช่น ตบ, หยอด, ดาด')}
    </div>

    <div class="profile-field" style="margin-top:14px;">
      <label>สไตล์การเล่น (เลือกได้หลายอย่าง)</label>
      <div class="pd-style-picker" id="pdfStyles">
        ${PD_STYLES.map(s => `
          <label class="pd-style-opt${styles.includes(s.id) ? ' on' : ''}">
            <input type="checkbox" value="${s.id}"${styles.includes(s.id) ? ' checked' : ''}
                   onchange="this.closest('.pd-style-opt').classList.toggle('on', this.checked)">
            <span>${s.label}</span>
          </label>`).join('')}
      </div>
    </div>

    <div class="pd-edit-notes">
      ${area('pdfStrengths', '💪 จุดแข็ง', prof.strengths, 'เช่น ลูกเซฟดี วางลูกแม่น ใจเย็น')}
      ${area('pdfWeakness',  '🎯 จุดอ่อน', prof.weakness,  'เช่น แบ็คแฮนด์ไม่ถึงหลัง เหนื่อยง่าย')}
      ${area('pdfNotes',     '📝 โน้ต',    prof.notes,     'บันทึกอื่น ๆ ที่อยากจำ')}
    </div>

    <div class="profile-save-row">
      <button class="btn btn-primary" onclick="savePdProfile()">💾 บันทึก</button>
      <button class="btn btn-outline" onclick="togglePdEdit(false)">ยกเลิก</button>
    </div>`;
}

function savePdProfile() {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Admin', 'error');
  const id = _pdCurrentId;
  if (!id) return;
  const v = elId => document.getElementById(elId)?.value.trim() || '';
  const styles = [...document.querySelectorAll('#pdfStyles input:checked')].map(c => c.value);

  if (!appState.playerProfiles) appState.playerProfiles = {};
  const prev = appState.playerProfiles[id] || {};
  appState.playerProfiles[id] = {
    ...prev,                       // keep fields this form does not edit
    gender:       v('pdfGender'),
    hand:         v('pdfHand'),
    position:     v('pdfPosition'),
    dominantShot: v('pdfShot'),
    styles,
    strengths:    v('pdfStrengths'),
    weakness:     v('pdfWeakness'),
    notes:        v('pdfNotes'),
  };
  saveKeys(['playerProfiles'], true);
  togglePdEdit(false);
  openPlayerProfile(id);          // repaint the read view with the new values
  showToast('✅ บันทึกโปรไฟล์แล้ว', 'success');
}