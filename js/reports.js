// ── REPORTS ──
// Two datasets, one panel each: players (54) and matches (39); a third panel compares seasons (js/career.js).
// The points chart, PERF score, round summary, match analysis and umpire load are views of those two, so each
// lives inside the panel it belongs to. Colour is never the only cue here: a team carries a shape (circle = red,
// diamond = blue) and a word, a match quality carries its name, a tag carries an icon.

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
    const on = icon.getAttribute('data-col') === state.col;
    if (on) th.classList.add(state.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    th.setAttribute('aria-sort', on ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}
let activeGroup = '';
function setGroupFilter(g) {
  activeGroup = g;
  ['gpAll','gp1','gp2','gp3'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const on = id === (g === '' ? 'gpAll' : `gp${g}`);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  renderReports();
}
// the way out of "no player matches": empty the search, the team and the group
function clearReportFilters() {
  const s = document.getElementById('reportSearch'); if (s) s.value = '';
  const t = document.getElementById('reportFilterTeam'); if (t) t.value = '';
  setGroupFilter('');
}

// ── Report sub-tab switcher ──
let _activeReportTab = 'players';
function switchReportTab(tab, btn) {
  _activeReportTab = tab;
  document.querySelectorAll('.rpt-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('.rpt-panel').forEach(p => p.classList.remove('active'));
  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
  document.getElementById('rpanel-' + tab)?.classList.add('active');
  if (tab === 'players') { renderReportHero(); renderReports(); }
  if (tab === 'matches') renderMatchesPanel();
  if (tab === 'compare') renderSeasonCompare();
}

// Export menu is a <details>; close it when the user taps anywhere else (or presses Esc),
// otherwise the panel stays open over the list on touch devices.
document.addEventListener('click', (e) => {
  document.querySelectorAll('#report .rp-export[open]').forEach(d => {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('#report .rp-export[open]').forEach(d => { d.removeAttribute('open'); d.querySelector('summary')?.focus(); });
});

// ── shared bits (also used by js/dashboard.js and js/career.js) ──
// empty state: ds-empty with the mascot (searching when there is a filter to clear), one sentence and, when there is a way out, one button
function rpEmptyHtml(title, text, btn) {
  return `<div class="ds-empty rp-empty"><div class="ds-empty-art">${dsMascot(btn ? 'search' : 'waiting')}</div>
    <div class="ds-empty-title">${title}</div>${text ? `<div class="ds-empty-text">${text}</div>` : ''}${btn || ''}</div>`;
}
// match quality (stored in analysis.status) -> a step from "very close" (q1) to "one-sided" (q4); the colour is
// only a helper, the status name is always printed next to it
const RP_QUALITY = { 'Evenly Matched': 'q1', 'True Tie': 'q1', 'Competitive Edge': 'q2', 'Close Encounter': 'q2', 'Superior': 'q3', 'Deceptive Draw': 'q3', 'Outclassed': 'q4' };
// special tags: one icon per kind (the stored labels start with an emoji; those are not shown)
function rpTagIcon(id) {
  id = String(id || '');
  if (id.startsWith('epic')) return 'fire';
  if (id === 'clutch') return 'target';
  if (id === 'marathon') return 'timer';
  if (id === 'rollercoaster') return 'arrows-left-right';
  if (id === 'blowout') return 'lightning';
  if (id.startsWith('flawless')) return 'star';
  return 'flag';
}
// "🔥 Epic Comeback G1 Red" -> "Epic Comeback เกม 1 Red": no emoji as chrome, and games are เกม 1 / เกม 2, never G1 / G2
function rpTagText(label) {
  return String(label || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\bG([12])\b/g, 'เกม $1');
}
function rpTagChip(t) { return `<span class="rp-tag">${dsIcon(rpTagIcon(t.id), { size: 14 })}${escHtml(rpTagText(t.label || t.id))}</span>`; }
function rpSigned(n) { return (n > 0 ? '+' : '') + n; }
function rpTeamTag(team) { const red = team === 'Red'; return `<span class="ds-team ds-team-${red ? 'red' : 'blue'}">${red ? 'RED' : 'BLUE'}</span>`; }

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

  // win-share bar: flex-grow carries the proportion, so a segment with zero wins is omitted
  // rather than collapsing to a hairline
  const bar = document.getElementById('rptHeroBar');
  if (bar) {
    bar.innerHTML = total === 0 ? '' : [
      redWins  > 0 ? `<span class="rp-hb-red"  style="--n:${redWins}"></span>`  : '',
      draws    > 0 ? `<span class="rp-hb-draw" style="--n:${draws}"></span>`    : '',
      blueWins > 0 ? `<span class="rp-hb-blue" style="--n:${blueWins}"></span>` : '',
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
  const sortSel = document.getElementById('reportSort');   // phone sort menu follows the table header
  if (sortSel && sortSel.value !== pCol) sortSel.value = pCol;
  const playerArr = Object.values(stats).filter(s =>
      (!rSearch || s.name.toLowerCase().includes(rSearch) || s.id.toLowerCase().includes(rSearch)) &&
      (!rTeam || s.team === rTeam) &&
      (!activeGroup || s.group === activeGroup)
    ).sort((a,b) => {
      let av = a[pCol], bv = b[pCol];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      const c = pDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
      // equal PTS: point difference, then game wins (what the legend promises and what the leader and the medals use)
      return c || (pCol === 'pts' ? (b.pointDiff - a.pointDiff || b.w - a.w) : 0);
    });

  renderChart(playerArr);
  const byPts = [...playerArr].sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff || b.w - a.w);
  // rank by points among the players shown; it stays the same whichever column the list is sorted by
  const rankMap = {};
  byPts.forEach((p, i) => { if (p.pts > 0 || p.matchesPlayed > 0) rankMap[p.id] = i + 1; });

  renderPlayerMetrics(playerArr, byPts);
  renderPlayerCards(playerArr, rankMap);
  renderPlayerTable(playerArr, rankMap);
}

function renderPlayerMetrics(playerArr, byPts) {
  const el = document.getElementById('playerStatCards');
  if (!el) return;
  const totalPts = playerArr.reduce((s,p) => s + (p.pts||0), 0);
  const avgWR    = playerArr.length ? Math.round(playerArr.reduce((s,p) => s + (p.winRate||0), 0) / playerArr.length) : 0;
  const epicPlayers = playerArr.filter(p => p.epicTags > 0).length;
  const lead = byPts[0] && byPts[0].pts > 0 ? byPts[0] : null;   // nobody has points yet = no leader
  const cell = (cls, val, lbl) => `<div class="rp-kpi ${cls}"><div class="rp-kpi-v">${val}</div><div class="rp-kpi-l">${lbl}</div></div>`;
  const leader = lead
    ? `<span class="ds-team ds-team-${lead.team === 'Red' ? 'red' : 'blue'}">${escHtml(lead.name)} · ${lead.team === 'Red' ? 'RED' : 'BLUE'}</span>`
    : '—';
  el.innerHTML =
    cell('', playerArr.length, 'ผู้เล่น') +
    cell('is-pts', totalPts, 'PTS รวม') +
    cell('', avgWR + '%', 'WR เฉลี่ย') +
    cell('', epicPlayers, 'Epic Kings') +
    cell('is-leader', leader, 'ผู้นำ');
}

// shared bits between the card list and the table
// one decimal: a 2–4 match sample does not support two
function perfText(s)    { return (s.perf > 0 ? '+' : '') + s.perf.toFixed(1); }
// match record as W L D; a zero is dimmed (CSS) so the real numbers stand out without any colour
function wlHtml(s) {
  const w = s.matchWin || 0, l = s.matchLose || 0, d = s.matchDraw || 0;
  const z = n => n ? '' : ' class="is-zero"';
  return `<span class="rp-wl"><i${z(w)}>${w}W</i><i${z(l)}>${l}L</i>${d ? `<i>${d}D</i>` : ''}</span>`;
}
// Each special tag rides as an icon + count chip. The kind is in the icon (and in the screen-reader text),
// the legend at the top of the Reports tab lists the four icons.
const RP_SPEC = [
  { k: 'epicTags',     icon: 'fire',              name: 'Epic Comeback' },
  { k: 'clutchTags',   icon: 'target',            name: 'The Gladiators' },
  { k: 'marathonTags', icon: 'timer',             name: 'Marathon Match' },
  { k: 'rollerTags',   icon: 'arrows-left-right', name: 'Rollercoaster' },
];
function specTagsOf(s) {
  return RP_SPEC.filter(t => s[t.k] > 0).map(t =>
    `<span class="rp-tag" title="${t.name} ×${s[t.k]}">${dsIcon(t.icon, { size: 14 })}<b>${s[t.k]}</b><span class="ds-sr-only">${t.name}</span></span>`).join('');
}
function rpNoPlayersHtml() {
  const filtering = (document.getElementById('reportSearch')?.value || '') || (document.getElementById('reportFilterTeam')?.value || '') || activeGroup;
  return filtering
    ? rpEmptyHtml('ไม่พบผู้เล่นที่ตรงกับตัวกรอง', '', `<button type="button" class="ds-btn" onclick="clearReportFilters()">ล้างตัวกรอง</button>`)
    : rpEmptyHtml('ยังไม่มีผู้เล่น', 'เพิ่มผู้เล่นได้ที่แท็บ Admin');
}

// Phone and tablet view — CSS decides card vs table, so both render from one array
function renderPlayerCards(playerArr, rankMap) {
  const el = document.getElementById('statsCardList');
  if (!el) return;
  if (playerArr.length === 0) { el.innerHTML = rpNoPlayersHtml(); return; }
  el.innerHTML = playerArr.map(s => {
    const red = s.team === 'Red', rank = rankMap[s.id];
    const tags = specTagsOf(s);
    return `<article class="rp-prow ${red ? 'ds-edge-red' : 'ds-edge-blue'}">
      <span class="rp-prow-pos${rank && rank <= 3 && s.pts > 0 ? ' is-top' : ''}">${rank ? `<span class="ds-sr-only">อันดับ </span>${rank}` : '–'}</span>
      <button type="button" class="rp-prow-main" onclick="openPlayerProfile('${s.id}')" aria-label="ดูโปรไฟล์ ${escHtml(s.name)}">
        <span class="rp-prow-name">${escHtml(s.name)}</span>
        <span class="rp-prow-meta">${rpTeamTag(s.team)}<span>G${s.group}</span><span>${s.id}</span></span>
      </button>
      <span class="rp-prow-pts"><b>${s.pts}</b><i>PTS</i></span>
      <div class="rp-prow-stats">
        <div class="rp-st"><span class="rp-st-l">ผลแมตช์</span><span class="rp-st-v">${wlHtml(s)}</span></div>
        <div class="rp-st"><span class="rp-st-l">WR%</span><span class="rp-st-v">${s.total > 0 ? s.winRate + '%' : '—'}</span></div>
        <div class="rp-st"><span class="rp-st-l">±PD</span><span class="rp-st-v">${rpSigned(s.pointDiff)}</span></div>
        <div class="rp-st"><span class="rp-st-l">PERF</span><span class="rp-st-v">${perfText(s)}</span></div>
      </div>
      ${tags ? `<div class="rp-prow-tags">${tags}</div>` : ''}
    </article>`;
  }).join('');
}

// Laptop view — 10 columns. It was 15, but nobody plays more than 4 matches,
// so the two win-rate columns and the two W/L columns said the same thing
// twice, and "Form (last 5)" could never be a rolling window.
function renderPlayerTable(playerArr, rankMap) {
  const tb = document.getElementById('statsTableBody');
  if (!tb) return;
  tb.innerHTML = playerArr.length === 0
    ? `<tr><td colspan="10">${rpNoPlayersHtml()}</td></tr>`
    : playerArr.map(s => {
      const rank = rankMap[s.id];
      const top = rank && rank <= 3 && s.pts > 0;
      const tags = specTagsOf(s);
      return `<tr>
        <td class="rp-id">${s.id}</td>
        <td><button type="button" class="rp-name-link" onclick="openPlayerProfile('${s.id}')">${top ? `<span class="rp-rank"><span class="ds-sr-only">อันดับ </span>${rank}</span>` : ''}<span>${escHtml(s.name)}</span></button></td>
        <td>${rpTeamTag(s.team)}</td>
        <td>G${s.group}</td>
        <td class="is-num rp-pts">${s.pts}</td>
        <td class="is-num">${perfText(s)}</td>
        <td class="is-num">${rpSigned(s.pointDiff)}</td>
        <td>${wlHtml(s)}</td>
        <td class="is-num">${s.total > 0 ? `<span class="rp-wr"><b>${s.winRate}%</b><span class="ds-bar"><i style="width:${s.winRate}%"></i></span></span>` : '—'}</td>
        <td>${tags ? `<div class="rp-spec-cell">${tags}</div>` : '<span class="ds-muted">—</span>'}</td>
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
  const open = !_openMatchDetails.has(id);
  if (open) _openMatchDetails.add(id); else _openMatchDetails.delete(id);
  det.hidden = !open;
  if (row) { row.classList.toggle('open', open); row.setAttribute('aria-expanded', open ? 'true' : 'false'); }
}

// the way out of "no match fits": empty the search, the round, the game type and the tag chips
function clearMatchFilters() {
  ['matchSearch', 'perfFilterRound', 'perfFilterStatus'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  _selectedTagFilters.clear();
  renderMatchesPanel();
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
    el.innerHTML = all.length === 0
      ? rpEmptyHtml('ยังไม่มีแมตช์ที่จบแล้ว', 'สรุปผลจะขึ้นหลังบันทึกผลแมตช์แรก',
          `<button type="button" class="ds-btn" onclick="switchTab('ongoing', document.getElementById('tab-ongoing'))">ดูแมตช์ที่กำลังแข่ง</button>`)
      : rpEmptyHtml('ไม่พบแมตช์ที่ตรงกับตัวกรอง', '',
          `<button type="button" class="ds-btn" onclick="clearMatchFilters()">ล้างตัวกรอง</button>`);
    return;
  }

  const rounds = [...new Set(matches.map(m => m.round))].sort((a,b) => parseInt(a) - parseInt(b));
  el.innerHTML = rounds.map(r => {
    const ms    = matches.filter(m => m.round === r);
    const redW  = ms.filter(m => m.rStat === 'W').length;
    const blueW = ms.filter(m => m.bStat === 'W').length;
    const draws = ms.filter(m => m.rStat === 'D').length;
    const lead  = redW > blueW ? 'red' : blueW > redW ? 'blue' : 'draw';
    return `<section class="rp-round">
      <header class="rp-round-head">
        <h3 class="rp-round-no"><span>รอบ</span><b>${escHtml(r)}</b></h3>
        <div class="rp-round-count">${ms.length} แมตช์</div>
        <div class="rp-round-tally">
          <span class="ds-chip ds-chip-red"><i class="rp-mark is-red"></i>RED <b>${redW}W</b></span>
          <span class="ds-chip">เสมอ <b>${draws}</b></span>
          <span class="ds-chip ds-chip-blue"><i class="rp-mark is-blue"></i>BLUE <b>${blueW}W</b></span>
        </div>
        <div class="rp-round-lead">ผู้นำรอบ ${lead === 'draw' ? '<b>เสมอ</b>' : rpTeamTag(lead === 'red' ? 'Red' : 'Blue')}</div>
        <div class="rp-round-bar" aria-hidden="true">
          ${redW  > 0 ? `<span class="rp-hb-red"  style="--n:${redW}"></span>`  : ''}
          ${draws > 0 ? `<span class="rp-hb-draw" style="--n:${draws}"></span>` : ''}
          ${blueW > 0 ? `<span class="rp-hb-blue" style="--n:${blueW}"></span>` : ''}
        </div>
      </header>
      <div class="rp-round-body">${ms.map(matchItemHtml).join('')}</div>
    </section>`;
  }).join('');
}

// "21:15" -> one team's score of that game, and whether that team won it
function rpGameCells(g, side) {
  const sc = String(g || '').split(':').map(Number);
  if (!g || sc.length < 2 || sc.some(isNaN) || (sc[0] === 0 && sc[1] === 0)) return '<b class="rp-g">–</b>';
  return `<b class="rp-g${sc[side] > sc[1 - side] ? ' is-win' : ''}">${sc[side]}</b>`;
}

// one match = a small scoreboard: red line over blue line, one column per game (same at every width)
function matchItemHtml(m) {
  const res = (m.result||'').replace(/[🔴🔵🤝]/g,'').trim();
  const resCls = m.rStat === 'W' ? 'is-red' : m.bStat === 'W' ? 'is-blue' : '';
  const open = _openMatchDetails.has(m.id);
  const a = m.analysis;
  const q = a ? RP_QUALITY[a.status] || '' : '';
  const team = (cls, word, names, side) => `<span class="rp-mteam ${cls}"><i class="rp-mark ${cls}"></i>` +
    `<span class="rp-mnames"><span class="ds-sr-only">${word} </span>${escHtml(names)}</span>${rpGameCells(m.game1, side)}${rpGameCells(m.game2, side)}</span>`;
  return `<div class="rp-mitem">
    <button type="button" class="rp-mrow${open?' open':''}" id="mrow-${m.id}" aria-expanded="${open}" aria-controls="mdet-${m.id}" onclick="toggleMatchDetail('${m.id}')">
      <span class="rp-mrow-id">${m.id}</span>
      <span class="rp-mres rp-mrow-res ${resCls}">${escHtml(res)}</span>
      <span class="rp-mteams">${team('is-red', 'แดง', m.redNames, 0)}${team('is-blue', 'น้ำเงิน', m.blueNames, 1)}</span>
      <span class="rp-mrow-q">${a ? `<span class="rp-q ${q}">${escHtml(a.status)}</span>` : ''}${((a && a.tags) || []).map(t => `<span class="rp-tag" title="${escHtml(rpTagText(t.label || t.id))}">${dsIcon(rpTagIcon(t.id), { size: 14 })}<span class="ds-sr-only">${escHtml(rpTagText(t.label || t.id))}</span></span>`).join('')}</span>
      ${dsIcon('caret-down', { cls: 'rp-caret' })}
    </button>
    <div class="rp-mdetail" id="mdet-${m.id}"${open?'':' hidden'}>${matchDetailHtml(m)}</div>
  </div>`;
}

function matchDetailHtml(m) {
  const a = m.analysis;
  const dur = m.duration > 0 ? formatTimer(m.duration) : '–';
  const q = a ? RP_QUALITY[a.status] || '' : '';
  const tagHtml = a && a.tags && a.tags.length ? `<div class="rp-tags">${a.tags.map(rpTagChip).join('')}</div>` : '';
  const metrics = a ? `<dl class="rp-m3">
      <div><dt>Total Margin</dt><dd>${a.totalMargin}</dd></div>
      <div><dt>Net Margin</dt><dd>${a.netMargin}</dd></div>
      <div><dt>Volatility</dt><dd>${a.volatility}</dd></div>
    </dl>` : '';
  return `
    <div class="rp-mdetail-head">
      ${a ? `<span class="rp-q ${q}">${escHtml(a.status)}</span>` : ''}
      <span class="ds-chip">${dsIcon('timer')}${dur}</span>
      <span class="ds-chip">${dsIcon('user')}${escHtml(m.umpire||'ไม่ระบุ')}</span>
      <button type="button" class="ds-btn rp-mdetail-edit" onclick="event.stopPropagation();openEditResult('${m.id}')">${dsIcon('pencil-simple')}แก้ไขผล</button>
    </div>
    ${tagHtml}
    ${a && a.summary ? `<p class="rp-summary">${escHtml(a.summary)}</p>` : ''}
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
    el.innerHTML = rpEmptyHtml('ยังไม่มีข้อมูลกรรมการ', 'ชื่อกรรมการจะถูกบันทึกเมื่อเริ่มแมตช์จากแผงกรรมการ');
    return;
  }

  const maxTotal = umpires[0].total || 1;
  const counts = umpires.map(u => u.done).sort((a,b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const fewest = umpires[umpires.length - 1];

  const rows = umpires.map((u, i) => {
    // "ว่างสุด" is the question the desk actually asks mid-event. The old
    // ">1.5x average" overload warning fired on anyone with 4+ matches when
    // the average is ~2, i.e. on perfectly normal workloads.
    const badges =
      (u.live > 0 ? `<span class="ds-chip ds-chip-live"><i class="ds-dot ds-dot-live"></i>LIVE ×${u.live}</span>` : '') +
      (u === fewest && umpires.length > 1 ? `<span class="ds-chip ds-chip-gold">${dsIcon('check-circle')}ว่างสุด</span>` : '');
    return `<article class="rp-ucard">
      <header class="rp-uhead">
        <span class="rp-upos${i < 3 ? ' is-top' : ''}"><span class="ds-sr-only">อันดับ </span>${i + 1}</span>
        <span class="rp-uname">${dsIcon('user')}<span>${escHtml(u.name)}</span></span>
        <span class="rp-ucount"><b>${u.total}</b><span>แมตช์</span></span>
        <span class="rp-ubadges">${badges}</span>
      </header>
      <div class="rp-ubar" aria-hidden="true"><i class="is-done" style="--w:${u.done / maxTotal * 100}%"></i><i class="is-live" style="--w:${u.live / maxTotal * 100}%"></i></div>
      <div class="rp-ufoot">
        <span class="is-done">${dsIcon('check-circle')}จบแล้ว <b>${u.done}</b></span>
        <span class="is-live">${dsIcon('timer')}กำลังตัดสิน <b>${u.live}</b></span>
      </div>
    </article>`;
  }).join('');

  const liveCount = live.filter(m => m.umpire).length;
  if (subEl) subEl.textContent =
    `${umpires.length} คน · ${hist.length} แมตช์จบแล้ว · ${liveCount} กำลังตัดสิน · มัธยฐาน ${median} แมตช์/คน (น้อยสุด ${counts[0]} · มากสุด ${counts[counts.length-1]})`;
  el.innerHTML = `<div class="rp-ulist">${rows}</div>`;
}
