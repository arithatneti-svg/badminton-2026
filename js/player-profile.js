// ══════════════════════════════════════════
// PLAYER PROFILE SYSTEM
// ══════════════════════════════════════════
let _pdCurrentId = null;
let _pdOpener = null;   // what had focus when the profile opened: focus goes back there on close

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

// A badminton match is over well inside this: no single match counts for more, so one that was left open
// (a duration recorded before play time was measured properly) can no longer decide the award on its own.
const MARATHON_CAP_MS = 90 * 60 * 1000;

// Player(s) with the most total time on court — sum of match durations across
// matchHistory, each capped at MARATHON_CAP_MS. Ties all win; nobody wins if no match carries a duration.
function marathonWinnerIds() {
  const total = {};
  (appState.matchHistory || []).forEach(h => {
    const d = Math.min(Number(h.duration) || 0, MARATHON_CAP_MS);
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
  if (userRole !== 'superadmin') return showToast('ต้องใช้สิทธิ์ Super Admin', 'error');
  const label = (document.getElementById('champLabel')?.value || '').trim();
  appState.champion = { team: team || '', label };   // team '' = cleared (persists)
  saveKeys(['champion'], true);
  updateChampControls();
  if (typeof renderPlayersTab === 'function') renderPlayersTab();
  if (_pdCurrentId) openPlayerProfile(_pdCurrentId);   // repaint an open profile
  showToast(team ? `ประกาศแชมป์: ทีม${team === 'Red' ? 'แดง' : 'น้ำเงิน'}${label ? ' · ' + label : ''}` : 'ล้างแชมป์แล้ว', 'success');
}
function updateChampControls() {
  const st = document.getElementById('champStatus');
  const lbl = document.getElementById('champLabel');
  const ch = currentChampion();
  if (st) st.textContent = (ch && ch.team) ? `ปัจจุบัน: ${ch.team}${ch.label ? ' · ' + ch.label : ''}` : 'ยังไม่มีแชมป์';
  if (lbl && ch && ch.label && !lbl.value) lbl.value = ch.label;
}

// one icon per award (names stay English on purpose; a future award falls back to a medal)
const AWARD_ICON = { 'Champion': 'trophy', 'MVP': 'crown', 'Marathon Fighter': 'timer' };
// the star that carries each award (media/mascot); an award without one keeps its icon
const AWARD_ART = { 'Champion': 'champion', 'MVP': 'rising', 'Marathon Fighter': 'streak' };
function awardIcon(a) {
  const k = AWARD_ICON[a.title] || 'medal';
  return dsIcon(k, { fill: k === 'trophy' || k === 'crown' });
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
  const canEdit = userRole === 'admin' || userRole === 'superadmin';
  const hasPhoto = !!playerPhoto(p.id);
  const earned = playerAwards(p);
  // rank = this player's place in the directory's default order (points, then group)
  const ranking = (appState.players || []).slice().sort((a, b) => (stats[b.id]?.pts || 0) - (stats[a.id]?.pts || 0) || a.group - b.group);
  const rank = ranking.findIndex(x => x.id === playerId) + 1;
  const hdr = document.getElementById('profileHeader');
  hdr.classList.toggle('is-red', isRed);
  hdr.classList.toggle('is-blue', !isRed);
  const tool = (cls, onclick, icon, label) => `<button type="button" class="ds-btn pf-tool${cls}" onclick="${onclick}">${dsIcon(icon)}${label}</button>`;
  hdr.innerHTML = `
    <div class="pf-id">
      <div class="pd-avatar-wrap">
        <div class="pd-avatar-click${hasPhoto ? ' zoomable' : ''}" ${hasPhoto ? `onclick="openPhotoLightbox('${p.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPhotoLightbox('${p.id}')}" tabindex="0" role="button" aria-label="ดูรูปเต็ม" title="ดูรูปเต็ม"` : ''}>${avatarHtml(p, 112)}</div>
        ${earned.length ? `<span class="pf-star" role="img" aria-label="มีรางวัล ${earned.length} รายการ">${dsIcon('star', { fill: true })}</span>` : ''}
      </div>
      <div class="pf-who">
        <h2 class="profile-name${String(p.name).length > 20 ? ' is-long' : ''}">${escHtml(p.name)}</h2>
        <div class="pf-tags">
          <span class="ds-team ds-team-${isRed ? 'red' : 'blue'}">${isRed ? 'RED' : 'BLUE'}</span>
          <span class="ds-chip">G${p.group}</span>
          <span class="ds-chip">${p.id}</span>
          ${(typeof isMe === 'function' && isMe(p.id)) ? '<span class="ds-chip ds-chip-gold">คุณ</span>' : ''}
        </div>
      </div>
    </div>
    <div class="pf-kpis">
      <div class="pf-kpi"><b class="ds-num">${s.pts || 0}</b><span>คะแนน</span></div>
      <div class="pf-kpi"><b class="ds-num">${rank}<small>/${ranking.length}</small></b><span>อันดับ</span></div>
    </div>
    ${canEdit ? `<div class="pf-tools" role="group" aria-label="เครื่องมือทีมงาน">
      ${tool('', `pickPlayerPhoto('${p.id}')`, 'camera', hasPhoto ? 'เปลี่ยนรูป' : 'เพิ่มรูป')}
      ${hasPhoto ? tool('', `openPhotoAdjust('${p.id}')`, 'target', 'จัดตำแหน่ง') : ''}
      ${tool('', 'togglePdEdit(true)', 'pencil-simple', 'แก้ไขโปรไฟล์')}
      ${tool('', `closePlayerProfile();openPlayerEdit('${p.id}')`, 'users', 'ชื่อ/ทีม/กลุ่ม')}
      ${hasPhoto ? tool(' ds-btn-danger', `removePlayerPhoto('${p.id}')`, 'trash', 'ลบรูป') : ''}
    </div>` : ''}`;

  // Stat strip: win rate over every game, then the counts. (Points and rank are in the hero.)
  const pdVal = s.pointDiff || 0;
  document.getElementById('profileStatBar').innerHTML = `
    <dl class="pd-statbar">
      <div class="pd-stat"><dt>อัตราชนะ<small>จากทุกแมตช์</small></dt><dd class="ds-num">${s.total > 0 ? s.winRate + '%' : '—'}</dd></div>
      <div class="pd-stat"><dt>แมตช์</dt><dd class="ds-num">${s.matchesPlayed || 0}</dd></div>
      <div class="pd-stat"><dt>เกมชนะ</dt><dd class="ds-num">${s.w || 0}</dd></div>
      <div class="pd-stat"><dt>เกมแพ้</dt><dd class="ds-num">${s.l || 0}</dd></div>
      <div class="pd-stat"><dt>แมตช์เสมอ</dt><dd class="ds-num">${s.matchDraw || 0}</dd></div>
      <div class="pd-stat"><dt>ผลต่างคะแนน</dt><dd class="ds-num">${pdVal > 0 ? '+' : ''}${pdVal}</dd></div>
    </dl>`;
  // one page — everything renders up front, no tabs to switch
  renderPdAwards(p);
  renderPdIdentity(prof);
  renderPdScoutNotes(prof);
  // staff, a player nobody has written anything about yet: say where to start
  if (canEdit && ['pdAwards', 'pdIdentityRow', 'pdScoutNotes'].every(id => !document.getElementById(id)?.innerHTML.trim())) {
    document.getElementById('pdScoutNotes').innerHTML = `<section class="pd-sec"><div class="ds-banner is-info">${dsIcon('info')}<span>ยังไม่มีข้อมูลผู้เล่น แตะ “แก้ไขโปรไฟล์” เพื่อเพิ่มเพศ มือถนัด จุดแข็ง และโน้ต</span></div></section>`;
  }
  renderPdMatchHistory(playerId);
  renderPdH2H(playerId);
  renderPdCareer(playerId);
  renderPdPastMatches(playerId);
  const _rv = document.getElementById('pdReadView'), _ev = document.getElementById('pdEditView');
  if (_rv && _ev) { _rv.hidden = false; _ev.hidden = true; }
  const wasOpen = overlay.classList.contains('open');
  if (!wasOpen) _pdOpener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) overlay.querySelector('.pf-back')?.focus({ preventScroll: true });   // keyboard users land inside the dialog
  // Push a history entry the first time we open, so the phone/browser Back
  // button closes the profile instead of leaving the app (which dumped the
  // user back on the Scoreboard). A re-render of an already-open profile
  // (refreshPlayerVisuals) must not stack more entries.
  if (!wasOpen) { try { history.pushState({ pdOpen: true }, ''); } catch (e) {} }
}

// Hide the overlay only — no history changes (used by the popstate handler).
function _pdCloseUI() {
  const overlay = document.getElementById('playerProfileOverlay');
  const wasOpen = overlay && overlay.classList.contains('open');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
  togglePdEdit(false);
  _pdCurrentId = null;
  if (wasOpen && _pdOpener && _pdOpener.isConnected) { try { _pdOpener.focus({ preventScroll: true }); } catch (e) {} }
  _pdOpener = null;
}
function closePlayerProfile() {
  const overlay = document.getElementById('playerProfileOverlay');
  const wasOpen = overlay && overlay.classList.contains('open');
  _pdCloseUI();
  // balance the entry we pushed on open so Back state stays consistent
  if (wasOpen && history.state && history.state.pdOpen) { try { history.back(); } catch (e) {} }
}

// Back button (browser / phone / gesture): close an open overlay instead of
// navigating away. The state was already popped, so just close the UI.
window.addEventListener('popstate', () => {
  const pf = document.getElementById('playerProfileOverlay');
  if (pf && pf.classList.contains('open')) { _pdCloseUI(); return; }
  const lb = document.getElementById('galleryLightbox');
  if (lb && lb.classList.contains('open') && typeof _lbCloseUI === 'function') { _lbCloseUI(); return; }
});

// Awards showcase — one medal per award the player holds (English titles/subtitles).
// Hidden entirely when the player has no awards.
function renderPdAwards(p) {
  const el = document.getElementById('pdAwards');
  if (!el) return;
  const earned = playerAwards(p);
  if (!earned.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">รางวัล</h3>
    <ul class="pd-awards" role="list">${earned.map(a => `
      <li class="pd-award${AWARD_ART[a.title] ? ' has-art' : ''}">
        <span class="pd-award-ic">${AWARD_ART[a.title] ? dsMascot(AWARD_ART[a.title], 72) : awardIcon(a)}</span>
        <span class="pd-award-txt">
          <span class="pd-award-title">${escHtml(a.title)}</span>
          <span class="pd-award-sub">${escHtml(a.subtitle)}</span>
        </span>
      </li>`).join('')}</ul></section>`;
}

// เพศ / มือถนัด / ตำแหน่ง / ลูกถนัด — four short values as small cells, the play styles as chips
function renderPdIdentity(prof) {
  const el = document.getElementById('pdIdentityRow');
  if (!el) return;
  const facts = [
    { label: 'เพศ',     value: prof.gender },
    { label: 'มือถนัด', value: prof.hand },
    { label: 'ตำแหน่ง', value: prof.position },
    { label: 'ลูกถนัด', value: prof.dominantShot },
  ].filter(c => c.value);
  const styles = (Array.isArray(prof.styles) ? prof.styles : []).filter(Boolean);
  if (!facts.length && !styles.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">ข้อมูลผู้เล่น</h3>
    ${facts.length ? `<dl class="pd-facts">${facts.map(c => `<div class="pd-fact"><dt>${c.label}</dt><dd>${escHtml(c.value)}</dd></div>`).join('')}</dl>` : ''}
    ${styles.length ? `<div class="pd-styles">${styles.map(id => `<span class="ds-chip">${escHtml(pdStyleLabel(id))}</span>`).join('')}</div>` : ''}
  </section>`;
}

// จุดแข็ง / จุดอ่อน / โน้ต — free text the desk wrote per player.
// Text only: the radar / ability / base-score analytics stay removed.
function renderPdScoutNotes(prof) {
  const el = document.getElementById('pdScoutNotes');
  if (!el) return;
  const blocks = [
    { cls:'good', icon:'check-circle',  title:'จุดแข็ง',  text: prof.strengths },
    { cls:'bad',  icon:'target',        title:'จุดอ่อน',  text: prof.weakness },
    { cls:'note', icon:'pencil-simple', title:'โน้ต',     text: prof.notes },
  ].filter(b => b.text && String(b.text).trim());
  if (!blocks.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">โน้ตจากทีมงาน</h3>
    <div class="pd-notes">${blocks.map(b => `
      <div class="pd-note pd-note-${b.cls}">
        <div class="pd-note-title">${dsIcon(b.icon)}${b.title}</div>
        <div class="pd-note-text">${escHtml(String(b.text).trim())}</div>
      </div>`).join('')}</div></section>`;
}

// one game of a match as "เกม 1  21:15" — the left number is the red side, the right one the blue side (as stored)
function pdGameHtml(label, raw) {
  const m = /^(\d+):(\d+)$/.exec(String(raw || ''));
  return `<span class="pd-game"><i>${label}</i><b>${m ? `<s class="r">${m[1]}</s>:<s class="b">${m[2]}</s>` : escHtml(raw || '—')}</b></span>`;
}
// a team as word + shape, coloured (circle = red, diamond = blue)
function pdTeamTag(team) {
  return team === 'Red' ? '<span class="ds-team ds-team-red">RED</span>' : '<span class="ds-team ds-team-blue">BLUE</span>';
}

function renderPdMatchHistory(playerId) {
  const el = document.getElementById('pdMatchHistory');
  if (!el) return;
  const matches = appState.matchHistory.filter(h=>[h.r1,h.r2,h.b1,h.b2].includes(playerId)).slice(-10).reverse();
  if (!matches.length) {
    el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">ประวัติการแข่ง</h3>
      <div class="ds-card"><div class="ds-empty">
        <div class="ds-empty-art">${dsMascot('waiting')}</div>
        <div class="ds-empty-title">ยังไม่ลงแข่ง</div>
        <div class="ds-empty-text">ผลแมตช์ของผู้เล่นคนนี้จะแสดงที่นี่</div>
      </div></div></section>`;
    return;
  }
  const nameOf = id => (appState.players || []).find(p => p.id === id)?.name || id;
  el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">ประวัติการแข่ง<span class="pd-h-sub">${matches.length} ล่าสุด</span></h3>
    <ol class="pd-hist" role="list">` +
    matches.map(h => {
      const isRed=[h.r1,h.r2].includes(playerId);
      const stat=isRed?h.rStat:h.bStat;
      const res=stat==='W'?'ชนะ':stat==='L'?'แพ้':'เสมอ';
      // the other player on this player's own side
      const mateId = isRed ? (h.r1 === playerId ? h.r2 : h.r1)
                           : (h.b1 === playerId ? h.b2 : h.b1);
      const oppIds = isRed ? [h.b1, h.b2] : [h.r1, h.r2];
      const side = isRed ? 'red' : 'blue', opp = isRed ? 'blue' : 'red';
      const tags=(h.analysis?.tags||[]).map(t=>`<span class="finished-tag tag-${t.id||'normal'}">${t.label||t.id}</span>`).join('');
      return `<li class="pd-match${stat==='W' ? ' is-win' : ''}">
        <div class="pd-match-head">
          <span class="pd-match-id">${h.id}</span>
          <span class="ds-chip pd-res${stat==='W' ? ' ds-chip-gold' : ''}">${res}</span>
          <span class="pd-games">${pdGameHtml('เกม 1', h.game1)}${pdGameHtml('เกม 2', h.game2)}</span>
        </div>
        <div class="pd-who">
          <div class="pd-line"><span class="pd-k">คู่กับ</span><b class="ds-team ds-team-${side}">${escHtml(mateId ? nameOf(mateId) : '—')}</b></div>
          <div class="pd-line"><span class="pd-k">พบ</span><b class="ds-team ds-team-${opp}">${escHtml(oppIds.filter(Boolean).map(nameOf).join(' & '))}</b></div>
        </div>
        ${tags ? `<div class="pd-tags">${tags}</div>` : ''}
      </li>`;
    }).join('') + `</ol></section>`;
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
  el.innerHTML = `<section class="pd-sec"><h3 class="pd-h">ผลเจอกัน<span class="pd-h-sub">นับรายเกม</span></h3>
    <ul class="pd-h2h" role="list">` +
    entries.sort((a,b) => b[1].w - a[1].w).map(([oId,rec]) => {
      const op = ( appState.players || [] ).find(x=>x.id===oId);
      if (!op) return '';
      const total = rec.w + rec.l;
      const wr = total > 0 ? Math.round(rec.w/total*100) : 0;
      return `<li class="pd-h2h-row">
        ${avatarHtml(op, 36)}
        <span class="pd-h2h-name"><b>${escHtml(op.name)}</b><span>ชนะ ${rec.w} · แพ้ ${rec.l}</span></span>
        <b class="pd-h2h-pct ds-num">${wr}%</b>
        <span class="ds-bar" role="img" aria-label="ชนะ ${wr}%"><i style="width:${wr}%"></i></span>
      </li>`;
    }).join('') + `</ul></section>`;
}

// ══════════════════════════════════════════
// PROFILE EDIT — swaps in place over the read view (admin only).
// Writes to playerProfiles[id]; name/team/group live on players and
// keep their own modal (openPlayerEdit).
// ══════════════════════════════════════════
const PD_STYLES = [
  { id:'attacker',   label:'Attacker' },
  { id:'defender',   label:'Defender' },
  { id:'allround',   label:'All-Round' },
  { id:'controller', label:'Controller' },
  { id:'speed',      label:'Speed Runner' },
  { id:'deceptive',  label:'Deceptive' },
  { id:'power',      label:'Power Hitter' },
  { id:'netmaster',  label:'Net Master' },
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
    if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('ต้องใช้สิทธิ์ Admin', 'error');
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
    <div class="ds-field">
      <label class="ds-label" for="${id}">${label}</label>
      <select id="${id}" class="ds-select">
        <option value="">— ไม่ระบุ —</option>
        ${options.map(o => `<option value="${escHtml(o)}"${o === value ? ' selected' : ''}>${escHtml(o)}</option>`).join('')}
      </select>
    </div>`;
  const txt = (id, label, value, ph) => `
    <div class="ds-field">
      <label class="ds-label" for="${id}">${label}</label>
      <input type="text" id="${id}" class="ds-input" value="${escHtml(value || '')}" placeholder="${ph || ''}" autocomplete="off">
    </div>`;
  const area = (id, icon, label, value, ph) => `
    <div class="ds-field">
      <label class="ds-label" for="${id}">${dsIcon(icon)}${label}</label>
      <textarea id="${id}" class="ds-textarea" placeholder="${ph || ''}">${escHtml(value || '')}</textarea>
    </div>`;

  const styles = Array.isArray(prof.styles) ? prof.styles : [];
  el.innerHTML = `
    <section class="pd-sec pd-form">
      <h3 class="pd-h">แก้ไขโปรไฟล์</h3>
      <div class="pd-form-grid">
        ${sel('pdfGender',   'เพศ',       PD_GENDERS,   prof.gender)}
        ${sel('pdfHand',     'มือถนัด',   PD_HANDS,     prof.hand)}
        ${sel('pdfPosition', 'ตำแหน่ง',   PD_POSITIONS, prof.position)}
        ${txt('pdfShot',     'ลูกถนัด',   prof.dominantShot, 'เช่น ตบ, หยอด, ดาด')}
      </div>

      <div class="ds-field">
        <span class="ds-label" id="pdfStylesLbl">สไตล์การเล่น (เลือกได้หลายอย่าง)</span>
        <div class="pd-style-picker" id="pdfStyles" role="group" aria-labelledby="pdfStylesLbl">
          ${PD_STYLES.map(s => `
            <label class="pd-style-opt${styles.includes(s.id) ? ' on' : ''}">
              <input type="checkbox" value="${s.id}"${styles.includes(s.id) ? ' checked' : ''}
                     onchange="this.closest('.pd-style-opt').classList.toggle('on', this.checked)">
              <span>${s.label}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="pd-form-notes">
        ${area('pdfStrengths', 'check-circle',  'จุดแข็ง', prof.strengths, 'เช่น ลูกเซฟดี วางลูกแม่น ใจเย็น')}
        ${area('pdfWeakness',  'target',        'จุดอ่อน', prof.weakness,  'เช่น แบ็คแฮนด์ไม่ถึงหลัง เหนื่อยง่าย')}
        ${area('pdfNotes',     'pencil-simple', 'โน้ต',    prof.notes,     'บันทึกอื่น ๆ ที่อยากจำ')}
      </div>

      <div class="profile-save-row">
        <button type="button" class="ds-btn ds-btn-primary ds-btn-lg" onclick="savePdProfile()">${dsIcon('floppy-disk')}บันทึก</button>
        <button type="button" class="ds-btn ds-btn-lg" onclick="togglePdEdit(false)">ยกเลิก</button>
      </div>
    </section>`;
}

function savePdProfile() {
  if (userRole !== 'admin' && userRole !== 'superadmin') return showToast('ต้องใช้สิทธิ์ Admin', 'error');
  const id = _pdCurrentId;
  if (!id) return;
  const v = elId => document.getElementById(elId)?.value.trim() || '';
  const styles = [...document.querySelectorAll('#pdfStyles input:checked')].map(c => c.value);

  if (!appState.playerProfiles) appState.playerProfiles = {};
  const prev = appState.playerProfiles[id] || {};
  const fields = {
    gender:       v('pdfGender'),
    hand:         v('pdfHand'),
    position:     v('pdfPosition'),
    dominantShot: v('pdfShot'),
    styles,
    strengths:    v('pdfStrengths'),
    weakness:     v('pdfWeakness'),
    notes:        v('pdfNotes'),
  };
  appState.playerProfiles[id] = { ...prev, ...fields };   // keep fields this form does not edit
  // write just this player's edited fields — saveKeys(['playerProfiles'])
  // re-uploaded every profile (and every legacy photo) for one edit
  dbRef.child(`playerProfiles/${id}`).update(fields);
  togglePdEdit(false);
  openPlayerProfile(id);          // repaint the read view with the new values
  showToast('บันทึกโปรไฟล์แล้ว', 'success');
}
