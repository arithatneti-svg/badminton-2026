// ── REPORTS ──
// Two panels, one per dataset: players (54) and matches (39).
// Points chart, PERF score, round summary, match analysis and umpire load
// are all views of those two, so each lives inside the panel it belongs to.

const sortState = { players: { col: 'pts', dir: 'desc' } };
function sortPlayers(col) {
  if (sortState.players.col === col) sortState.players.dir = sortState.players.dir === 'asc' ? 'desc' : 'asc';
  else { sortState.players.col = col; sortState.players.dir = ['name','id','team'].includes(col) ? 'asc' : 'desc'; }
  renderReports();
}
function updateSortIcons(tableId, state) {
  document.querySelectorAll(`#${tableId} thead th.sortable`).forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (icon.getAttribute('data-col') === state.col) th.classList.add(state.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}
let activeGroup = '';
function setGroupFilter(g) {
  activeGroup = g;
  ['gpAll','gp1','gp2','gp3'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(g === '' ? 'gpAll' : `gp${g}`)?.classList.add('active');
  renderReports();
}

// ── Report sub-tab switcher ──
let _activeReportTab = 'players';
function switchReportTab(tab, btn) {
  _activeReportTab = tab;
  document.querySelectorAll('.rpt-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rpt-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('rpanel-' + tab)?.classList.add('active');
  if (tab === 'players') { renderReportHero(); renderReports(); }
  if (tab === 'matches') renderMatchesPanel();
  if (tab === 'compare') renderSeasonCompare();
}

// Export menu is a <details>; close it when the user taps anywhere else,
// otherwise the panel stays open over the table on touch devices.
document.addEventListener('click', (e) => {
  document.querySelectorAll('#report .rp-export[open]').forEach(d => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});

// ── Hero stats row ──
function renderReportHero() {
  if (!appState) return;
  const hist = appState.matchHistory || [];
  const total    = hist.length;
  const redWins  = hist.filter(m => m.rStat === 'W').length;
  const blueWins = hist.filter(m => m.bStat === 'W').length;
  const draws    = hist.filter(m => m.rStat === 'D').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('rptHeroMatches',  total);
  set('rptHeroRedWins',  redWins);
  set('rptHeroDraws',    draws);
  set('rptHeroBlueWins', blueWins);

  // win-share bar — flex-grow carries the proportion, so a segment with
  // zero wins is omitted rather than collapsing to a hairline
  const bar = document.getElementById('rptHeroBar');
  if (bar) {
    bar.innerHTML = total === 0 ? '' : [
      redWins  > 0 ? `<span class="rp-hb-red"  style="flex:${redWins}"></span>`  : '',
      draws    > 0 ? `<span class="rp-hb-draw" style="flex:${draws}"></span>`    : '',
      blueWins > 0 ? `<span class="rp-hb-blue" style="flex:${blueWins}"></span>` : '',
    ].join('');
  }
}

// ══════════════════════════════════════════
// PANEL 1 — PLAYERS
// ══════════════════════════════════════════
function renderReports() {
  const base = getPlayerStats();
  // PERF rides along as a sortable column instead of owning a tab: the
  // team/group filters above already slice it the way the rank cards did.
  const perfMap = computePerfRanking();
  const stats = {};
  Object.entries(base).forEach(([id, s]) => { stats[id] = { ...s, perf: perfMap[id]?.perf ?? 0 }; });

  const rSearch = (document.getElementById('reportSearch')?.value || '').toLowerCase();
  const rTeam   = document.getElementById('reportFilterTeam')?.value || '';

  const { col: pCol, dir: pDir } = sortState.players;
  const playerArr = Object.values(stats).filter(s =>
      (!rSearch || s.name.toLowerCase().includes(rSearch) || s.id.toLowerCase().includes(rSearch)) &&
      (!rTeam || s.team === rTeam) &&
      (!activeGroup || s.group === activeGroup)
    ).sort((a,b) => {
      let av = a[pCol], bv = b[pCol];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      return pDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
    });

  renderChart(playerArr);
  const byPts = [...playerArr].sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff || b.w - a.w);
  const medalMap = {};
  byPts.forEach((p,i) => { if (p.pts > 0) medalMap[p.id] = i===0?'🥇':i===1?'🥈':i===2?'🥉':''; });

  renderPlayerMetrics(playerArr, byPts);
  renderPlayerCards(playerArr);
  renderPlayerTable(playerArr, medalMap);
}

function renderPlayerMetrics(playerArr, byPts) {
  const el = document.getElementById('playerStatCards');
  if (!el) return;
  const totalPts = playerArr.reduce((s,p) => s + (p.pts||0), 0);
  const avgWR    = playerArr.length ? Math.round(playerArr.reduce((s,p) => s + (p.winRate||0), 0) / playerArr.length) : 0;
  const epicPlayers = playerArr.filter(p => p.epicTags > 0).length;
  const topPts = byPts[0];
  el.innerHTML = [
    { lbl:'PLAYERS',    val: playerArr.length,                    color:'var(--text)' },
    { lbl:'TOTAL PTS',  val: totalPts,                            color:'var(--gold)' },
    { lbl:'AVG WR',     val: avgWR + '%',                         color: avgWR>=50?'var(--green)':'var(--danger)' },
    { lbl:'EPIC KINGS', val: epicPlayers,                         color:'var(--red)' },
    { lbl:'LEADER',     val: topPts ? escHtml(topPts.name) : '—', color: topPts?.team==='Red'?'var(--red)':'var(--blue)' },
  ].map(c => `<div class="rp-metric">
    <div class="rp-metric-val" style="color:${c.color};" title="${c.val}">${c.val}</div>
    <div class="rp-metric-lbl">${c.lbl}</div>
  </div>`).join('');
}

// shared bits between the card list and the table
function wrColorOf(s)   { return s.winRate>=70?'var(--green)':s.winRate>=40?'var(--gold)':s.total>0?'var(--danger)':'var(--muted)'; }
function pdColorOf(s)   { return s.pointDiff>0?'var(--green)':s.pointDiff<0?'var(--danger)':'var(--muted)'; }
function perfColorOf(s) { return s.perf>0.3?'var(--green)':s.perf<-0.3?'var(--danger)':'var(--text2)'; }
// one decimal: a 2–4 match sample does not support two
function perfText(s)    { return (s.perf > 0 ? '+' : '') + s.perf.toFixed(1); }
function specTagsOf(s) {
  let t = '';
  if (s.epicTags>0)     t += `<span title="Epic Comeback">🔥${s.epicTags}</span>`;
  if (s.clutchTags>0)   t += `<span title="The Gladiators">⚔️${s.clutchTags}</span>`;
  if (s.marathonTags>0) t += `<span title="Marathon Match">🏃${s.marathonTags}</span>`;
  if (s.rollerTags>0)   t += `<span title="Rollercoaster">🎢${s.rollerTags}</span>`;
  return t;
}

// Phone view — CSS decides card vs table, so both render from one array
function renderPlayerCards(playerArr) {
  const el = document.getElementById('statsCardList');
  if (!el) return;
  if (playerArr.length === 0) {
    el.innerHTML = `<div class="rp-empty"><span class="rp-empty-icon">🔍</span>ไม่พบผู้เล่นที่ตรงกับตัวกรอง</div>`;
    return;
  }
  el.innerHTML = playerArr.map((s, i) => {
    const posLabel = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
    const posClass = i < 3 ? `p${i+1}` : '';
    const wrColor = wrColorOf(s), pdColor = pdColorOf(s);
    const tags = specTagsOf(s);
    return `<div class="rp-prow ${s.team==='Red'?'is-red':'is-blue'}">
      <div class="rp-prow-pos ${posClass}">${posLabel}</div>
      <div class="rp-prow-id">
        ${avatarHtml(s.id, 26)}
        <span class="rp-prow-name" onclick="openPlayerProfile('${s.id}')" title="ดู Player Profile">${escHtml(s.name)}</span>
      </div>
      <div class="rp-prow-meta">
        <span class="rp-badge ${s.team==='Red'?'b-red':'b-blue'}">${s.team}</span>
        <span>G${s.group}</span><span class="sep">·</span><span>${s.id}</span>
        <span class="sep">·</span><span title="Performance Score">PERF <b style="color:${perfColorOf(s)};">${perfText(s)}</b></span>
      </div>
      <div class="rp-prow-pts"><b>${s.pts}</b><span>PTS</span></div>
      <div class="rp-prow-bar">
        <div class="rp-bar"><div class="rp-bar-fill" style="width:${s.winRate}%;background:${wrColor};"></div></div>
        <span class="rp-prow-wr" style="color:${wrColor};">${s.total>0?s.winRate+'%':'—'}</span>
      </div>
      <div class="rp-prow-foot">
        <span>${s.matchWin||0}W ${s.matchLose||0}L${s.matchDraw?' '+s.matchDraw+'D':''}</span>
        <span class="sep">·</span><span>${s.matchesPlayed||0} แมตช์</span>
        <span class="sep">·</span><span style="color:${pdColor};font-weight:700;">${s.pointDiff>0?'+':''}${s.pointDiff} PD</span>
        ${tags ? `<span class="rp-prow-tags">${tags}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Laptop view — 10 columns. It was 15, but nobody plays more than 4 matches,
// so the two win-rate columns and the two W/L columns said the same thing
// twice, and "Form (last 5)" could never be a rolling window.
function renderPlayerTable(playerArr, medalMap) {
  const tb = document.getElementById('statsTableBody');
  if (!tb) return;
  tb.innerHTML = playerArr.length === 0
    ? `<tr><td colspan="10"><div class="rp-empty"><span class="rp-empty-icon">🔍</span>ไม่พบผู้เล่นที่ตรงกับตัวกรอง</div></td></tr>`
    : playerArr.map(s => {
      const medal = medalMap[s.id] ? `${medalMap[s.id]} ` : '';
      const wrColor = wrColorOf(s);
      const wrCell = s.total > 0
        ? `<div class="wr-cell">
             <span style="font-weight:700;color:${wrColor};min-width:32px;">${s.winRate}%</span>
             <div class="wr-bar-wrap"><div class="wr-bar-fill" style="width:${s.winRate}%;background:${wrColor};"></div></div>
           </div>`
        : '—';
      return `<tr>
        <td class="gold-text">${s.id}</td>
        <td><span class="rp-name-cell">${avatarHtml(s.id, 24, {className:'pav-inline'})}<span class="rp-name-link" onclick="openPlayerProfile('${s.id}')" title="ดู Player Profile">${medal}${escHtml(s.name)}</span></span></td>
        <td><span class="rp-badge ${s.team==='Red'?'b-red':'b-blue'}">${s.team}</span></td>
        <td>G${s.group}</td>
        <td style="font-size:1.1em;font-weight:700;color:var(--gold);">${s.pts}</td>
        <td style="font-weight:700;color:${perfColorOf(s)};">${perfText(s)}</td>
        <td style="font-weight:700;color:${pdColorOf(s)};">${s.pointDiff>0?'+':''}${s.pointDiff}</td>
        <td style="white-space:nowrap;">
          <span class="stat-pill pill-win">${s.matchWin||0}W</span>
          <span class="stat-pill pill-lose">${s.matchLose||0}L</span>
          ${s.matchDraw ? `<span class="stat-pill pill-draw">${s.matchDraw}D</span>` : ''}
        </td>
        <td style="min-width:110px;">${wrCell}</td>
        <td style="font-size:12px;white-space:nowrap;">${specTagsOf(s) || '<span style="color:var(--muted);">—</span>'}</td>
      </tr>`;
    }).join('');
  updateSortIcons('playerStatsTable', sortState.players);
}

// ══════════════════════════════════════════
// PANEL 2 — MATCHES (round summary + list + per-match analysis)
// ══════════════════════════════════════════
const _openMatchDetails = new Set();

function toggleMatchDetail(id) {
  const row = document.getElementById('mrow-' + id);
  const det = document.getElementById('mdet-' + id);
  if (!det) return;
  if (_openMatchDetails.has(id)) { _openMatchDetails.delete(id); det.hidden = true;  row?.classList.remove('open'); }
  else                           { _openMatchDetails.add(id);    det.hidden = false; row?.classList.add('open'); }
}

function renderMatchesPanel() {
  const el = document.getElementById('matchesPanelContent');
  if (!el) return;
  renderTagFilterPills();
  renderUmpireWorkload();

  const search  = (document.getElementById('matchSearch')?.value || '').toLowerCase();
  const fRound  = document.getElementById('perfFilterRound')?.value || '';
  const fStatus = document.getElementById('perfFilterStatus')?.value || '';

  const all = appState.matchHistory || [];
  const matches = all.filter(m => {
    if (search && !(m.id.toLowerCase().includes(search) ||
        (m.redNames||'').toLowerCase().includes(search) ||
        (m.blueNames||'').toLowerCase().includes(search) ||
        (m.umpire||'').toLowerCase().includes(search))) return false;
    if (fRound && m.round !== fRound) return false;
    if (fStatus && m.analysis?.status !== fStatus) return false;
    if (_selectedTagFilters.size > 0) {
      const ids = m.analysis?.tags ? m.analysis.tags.map(t => t.id) : [];
      if (![..._selectedTagFilters].every(f => ids.includes(f))) return false;
    }
    return true;
  });

  if (matches.length === 0) {
    const filtering = search || fRound || fStatus || _selectedTagFilters.size > 0;
    el.innerHTML = `<div class="rp-empty"><span class="rp-empty-icon">📋</span>${
      all.length === 0 ? 'ยังไม่มีแมตช์ที่จบแล้ว<br>สรุปผลจะขึ้นหลังบันทึกผลแมตช์แรก'
      : filtering ? 'ไม่พบแมตช์ที่ตรงกับตัวกรอง — ลองล้างตัวกรองดูครับ'
      : 'ยังไม่มีแมตช์'}</div>`;
    return;
  }

  const rounds = [...new Set(matches.map(m => m.round))].sort((a,b) => parseInt(a) - parseInt(b));
  el.innerHTML = rounds.map(r => {
    const ms    = matches.filter(m => m.round === r);
    const redW  = ms.filter(m => m.rStat === 'W').length;
    const blueW = ms.filter(m => m.bStat === 'W').length;
    const draws = ms.filter(m => m.rStat === 'D').length;
    const winner = redW > blueW ? 'RED' : blueW > redW ? 'BLUE' : 'DRAW';
    const wColor = winner==='RED'?'var(--red)':winner==='BLUE'?'var(--blue)':'var(--gold)';
    return `<div class="rp-card">
      <div class="rp-round-head">
        <div class="rp-round-no">ROUND ${r}</div>
        <div class="rp-round-tally">
          <span class="rp-badge b-red">🔴 ${redW}W</span>
          <span class="rp-badge b-gold">🤝 ${draws}D</span>
          <span class="rp-badge b-blue">🔵 ${blueW}W</span>
        </div>
        <div class="rp-round-lead">${ms.length} แมตช์ · ผู้นำรอบ <b style="color:${wColor};">${winner}</b></div>
      </div>
      <div class="rp-round-bar">
        ${redW  > 0 ? `<span style="flex:${redW};background:var(--red);"></span>`   : ''}
        ${draws > 0 ? `<span style="flex:${draws};background:var(--gold);"></span>` : ''}
        ${blueW > 0 ? `<span style="flex:${blueW};background:var(--blue);"></span>` : ''}
      </div>
      <div class="rp-round-body">${ms.map(matchItemHtml).join('')}</div>
    </div>`;
  }).join('');
}

function matchItemHtml(m) {
  const rc  = m.rStat==='W'?'var(--red)':m.bStat==='W'?'var(--blue)':'var(--gold)';
  const res = (m.result||'').replace(/[🔴🔵🤝]/g,'').trim();
  const open = _openMatchDetails.has(m.id);
  return `<div class="rp-mitem">
    <div class="rp-mrow${open?' open':''}" id="mrow-${m.id}" onclick="toggleMatchDetail('${m.id}')" title="แตะเพื่อดูรายละเอียด">
      <div class="rp-mrow-id">${m.id}<span class="rp-mrow-caret">▾</span></div>
      <div class="rp-mrow-red">${escHtml(m.redNames)}</div>
      <div class="rp-mrow-score">${m.game1} / ${m.game2||'—'}</div>
      <div class="rp-mrow-blue">${escHtml(m.blueNames)}</div>
      <div class="rp-mrow-res" style="color:${rc};">${escHtml(res)}</div>
    </div>
    <div class="rp-mdetail" id="mdet-${m.id}"${open?'':' hidden'}>${matchDetailHtml(m)}</div>
  </div>`;
}

function matchDetailHtml(m) {
  const a = m.analysis;
  const dur = m.duration > 0 ? formatTimer(m.duration) : '–';
  const tagHtml = a && a.tags && a.tags.length
    ? `<div class="perf-tags">${a.tags.map(t => `<span class="perf-tag ${t.class||''}">${t.label}</span>`).join('')}</div>`
    : '';
  const metrics = a ? `<div class="perf-metrics">
      <div class="perf-metric"><div class="perf-metric-val">${a.totalMargin}</div><div class="perf-metric-label">Total Margin</div></div>
      <div class="perf-metric"><div class="perf-metric-val">${a.netMargin}</div><div class="perf-metric-label">Net Margin</div></div>
      <div class="perf-metric"><div class="perf-metric-val">${a.volatility}</div><div class="perf-metric-label">Volatility</div></div>
    </div>` : '';
  return `
    <div class="rp-mdetail-head">
      ${a ? `<span class="perf-status-badge" style="color:${a.statusColor};border-color:${a.statusColor}44;background:${a.statusColor}11;">${a.status}</span>` : ''}
      <span class="rp-badge b-mute">⏱ ${dur}</span>
      <span class="rp-badge b-gold">👔 ${escHtml(m.umpire||'ไม่ระบุ')}</span>
      <button class="btn btn-sm rp-mdetail-edit" onclick="event.stopPropagation();openEditResult('${m.id}')">✏️ แก้ไขผล</button>
    </div>
    ${tagHtml}
    ${a && a.summary ? `<div class="perf-summary">💬 ${escHtml(a.summary)}</div>` : ''}
    ${metrics}`;
}

// ── Umpire workload ──
function renderUmpireWorkload() {
  const el = document.getElementById('umpireWorkloadContent');
  const subEl = document.getElementById('umpireWorkloadSub');
  if (!el) return;
  const hist = appState.matchHistory || [];
  const live = appState.ongoingMatches || [];

  const map = {};
  hist.forEach(m => {
    const u = (m.umpire || 'ไม่ระบุ').trim();
    if (!map[u]) map[u] = { done: 0, live: 0 };
    map[u].done++;
  });
  live.forEach(m => {
    if (!m.umpire) return;
    const u = m.umpire.trim();
    if (!map[u]) map[u] = { done: 0, live: 0 };
    map[u].live++;
  });

  const umpires = Object.entries(map)
    .map(([name, d]) => ({ name, done: d.done, live: d.live, total: d.done + d.live }))
    .sort((a,b) => b.total - a.total);

  if (umpires.length === 0) {
    if (subEl) subEl.textContent = 'ยังไม่มีการบันทึกชื่อกรรมการ';
    el.innerHTML = `<div class="rp-empty"><span class="rp-empty-icon">👔</span>ยังไม่มีข้อมูล Umpire<br>ชื่อกรรมการจะถูกบันทึกเมื่อเริ่มแมตช์จากแผงกรรมการ</div>`;
    return;
  }

  const maxTotal = umpires[0].total || 1;
  const counts = umpires.map(u => u.done).sort((a,b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const fewest = umpires[umpires.length - 1];

  const rows = umpires.map((u, i) => {
    const pct = Math.round(u.total / maxTotal * 100);
    const barColor = u.live > 0 ? 'var(--green)' : 'var(--gold)';
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
    const liveBadge = u.live > 0 ? `<span class="rp-badge b-green">● LIVE ×${u.live}</span>` : '';
    // "ว่างสุด" is the question the desk actually asks mid-event. The old
    // ">1.5x average" overload warning fired on anyone with 4+ matches when
    // the average is ~2, i.e. on perfectly normal workloads.
    const freeBadge = u === fewest && umpires.length > 1 ? `<span class="rp-badge b-blue">✋ ว่างสุด</span>` : '';

    return `<div class="rp-ucard">
      <div class="rp-uhead">
        <span class="rp-upos">${medal}</span>
        <span class="rp-uname">👔 ${escHtml(u.name)}</span>
        ${liveBadge}${freeBadge}
        <span class="rp-ucount"><b style="color:${barColor};">${u.total}</b><span>แมตช์</span></span>
      </div>
      <div class="rp-bar"><div class="rp-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
      <div class="rp-ufoot">
        <span>✅ จบแล้ว <b>${u.done}</b></span>
        <span>⏱ กำลังตัดสิน <b style="color:var(--green);">${u.live}</b></span>
      </div>
    </div>`;
  }).join('');

  const liveCount = live.filter(m => m.umpire).length;
  if (subEl) subEl.textContent =
    `${umpires.length} คน · ${hist.length} แมตช์จบแล้ว · ${liveCount} กำลังตัดสิน · มัธยฐาน ${median} แมตช์/คน (น้อยสุด ${counts[0]} · มากสุด ${counts[counts.length-1]})`;
  el.innerHTML = `<div class="rp-ulist">${rows}</div>`;
}
