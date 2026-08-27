// ══════════════════════════════════════════════════════════════
// PLAYER IDENTITY ACROSS SEASONS
//
// A player has two identifiers:
//   id  — the season jersey (R01 / B15). Encodes the team colour, so it
//         changes when someone switches sides between seasons.
//   pid — the person (P001). Assigned once, never changes. Everything
//         that must outlive a season keys off this.
//
// The active season blob (sportsday_2026_data) keeps working exactly as
// before — players[], playerProfiles keyed by jersey — so nothing in the
// day-to-day app has to care about pid. Only the rollover and the career
// / compare views do.
//
//   masterPlayers/{pid}  = the durable person record
//   seasons_archive/{yr} = the full snapshot of a finished season
// ══════════════════════════════════════════════════════════════

let _masterPlayers = {};        // pid -> record
let _masterLoaded = false;

function loadMasterPlayers() {
  return firebase.database().ref('masterPlayers').once('value').then(snap => {
    _masterPlayers = snap.val() || {};
    _masterLoaded = true;
    return _masterPlayers;
  }).catch(() => { _masterLoaded = true; return _masterPlayers; });
}

function loadSeasonArchives() {
  return firebase.database().ref('seasons_archive').once('value')
    .then(snap => snap.val() || {})
    .catch(() => ({}));
}

// ── pid allocation ────────────────────────────────────────────
function _takenPids() {
  const taken = new Set(Object.keys(_masterPlayers || {}));
  (appState.players || []).forEach(p => { if (p.pid) taken.add(p.pid); });
  return taken;
}
function _formatPid(n) { return 'P' + String(n).padStart(3, '0'); }

function nextPid(taken) {
  taken = taken || _takenPids();
  let n = 1;
  while (taken.has(_formatPid(n))) n++;
  return _formatPid(n);
}

// Backfill pids for anyone who predates this system. Idempotent, and it
// never reuses a pid that masterPlayers already holds.
function ensurePlayerPids() {
  const taken = _takenPids();
  let assigned = 0;
  (appState.players || []).forEach(p => {
    if (p.pid) return;
    const pid = nextPid(taken);
    taken.add(pid);
    p.pid = pid;
    assigned++;
  });
  return assigned;
}

function pidOf(jerseyId) {
  return (appState.players || []).find(p => p.id === jerseyId)?.pid || null;
}
function playerByPid(pid) {
  return (appState.players || []).find(p => p.pid === pid) || null;
}

// ── collision-safe jersey allocation ──────────────────────────
// The old logic scanned only the target team, but a season rollover can
// leave an R-numbered player sitting on Blue. Scanning one team then made
// it possible to mint a jersey that already existed on the other side —
// two players sharing an id merges their stats, photo and profile.
function nextJersey(team, players) {
  const list = players || appState.players || [];
  const prefix = team === 'Red' ? 'R' : 'B';
  const used = new Set(list.map(p => p.id));
  let maxNum = 0;
  list.forEach(p => {
    if (!p.id || p.id[0] !== prefix) return;
    const n = parseInt(p.id.substring(1), 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });
  let n = maxNum + 1;
  let candidate = prefix + (n < 10 ? '0' + n : n);
  while (used.has(candidate)) {           // belt and braces
    n++;
    candidate = prefix + (n < 10 ? '0' + n : n);
  }
  return candidate;
}

// ── per-season stat rollup for one player ─────────────────────
// Colour is structural in a match: r1/r2 are the red slots, b1/b2 blue.
// So an archived season tells us which side someone played on and which
// side they faced, without storing it separately.
function seasonStatsFor(jerseyId, matchHistory) {
  const out = { pts:0, w:0, l:0, d:0, matches:0, pointDiff:0, matchWin:0, matchLose:0, matchDraw:0,
                asRed:0, asBlue:0, vsRed:0, vsBlue:0 };
  (matchHistory || []).forEach(h => {
    const onRed  = [h.r1, h.r2].includes(jerseyId);
    const onBlue = [h.b1, h.b2].includes(jerseyId);
    if (!onRed && !onBlue) return;
    const [g1r, g1b] = (h.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (h.game2 || '0:0').split(':').map(Number);
    const hasG2 = !isNaN(g2r) && (g2r > 0 || g2b > 0);
    let mine = 0, theirs = 0, myGames = 0, theirGames = 0;
    if (!isNaN(g1r) && !isNaN(g1b)) {
      mine += onRed ? g1r : g1b; theirs += onRed ? g1b : g1r;
      if (g1r !== g1b) ((onRed ? g1r > g1b : g1b > g1r) ? myGames++ : theirGames++);
    }
    if (hasG2 && !isNaN(g2r) && !isNaN(g2b)) {
      mine += onRed ? g2r : g2b; theirs += onRed ? g2b : g2r;
      if (g2r !== g2b) ((onRed ? g2r > g2b : g2b > g2r) ? myGames++ : theirGames++);
    }
    const stat = onRed ? h.rStat : h.bStat;
    out.pts       += onRed ? (h.pRed || 0) : (h.pBlue || 0);
    out.w         += myGames;
    out.l         += theirGames;
    out.matches   += 1;
    out.pointDiff += mine - theirs;
    if (stat === 'W') out.matchWin++; else if (stat === 'L') out.matchLose++; else if (stat === 'D') out.matchDraw++;
    if (onRed) { out.asRed++;  out.vsBlue++; } else { out.asBlue++; out.vsRed++; }
  });
  out.d = out.matchDraw;
  return out;
}

// ══════════════════════════════════════════════════════════════
// CAREER VIEW — past seasons for one person
// Reads masterPlayers/{pid}. The colour someone wore and the colour
// they faced is structural in an archived match (r1/r2 = red slots,
// b1/b2 = blue), so it needs no extra storage.
// ══════════════════════════════════════════════════════════════
const TEAM_COLOR = { Red: 'var(--red)', Blue: 'var(--blue)' };
const TEAM_LABEL = { Red: '🔴 Red', Blue: '🔵 Blue' };

function renderPdCareer(playerId) {
  const el = document.getElementById('pdCareer');
  if (!el) return;
  const pid = pidOf(playerId);
  const rec = pid ? (_masterPlayers || {})[pid] : null;
  const seasons = rec?.seasons || {};
  const years = Object.keys(seasons).sort();

  const curYear = String(appState.seasonYear || new Date().getFullYear());
  const cur = getPlayerStats()[playerId];
  const curP = (appState.players || []).find(p => p.id === playerId);

  // current season row is built live; past ones come from the archive
  const rows = years.filter(y => y !== curYear).map(y => ({ year: y, ...seasons[y] }));
  if (cur && curP) {
    rows.push({
      year: curYear, jersey: curP.id, team: curP.team, group: curP.group,
      pts: cur.pts || 0, w: cur.w || 0, l: cur.l || 0,
      matches: cur.matchesPlayed || 0, pointDiff: cur.pointDiff || 0,
      matchWin: cur.matchWin || 0, matchLose: cur.matchLose || 0, matchDraw: cur.matchDraw || 0,
      isCurrent: true,
    });
  }
  if (rows.length <= 1) { el.innerHTML = ''; return; }   // one season = the stat bar already says it

  rows.sort((a, b) => b.year.localeCompare(a.year));
  const tot = rows.reduce((a, r) => ({
    pts: a.pts + (r.pts || 0), matches: a.matches + (r.matches || 0),
    mw: a.mw + (r.matchWin || 0), ml: a.ml + (r.matchLose || 0), md: a.md + (r.matchDraw || 0),
    pd: a.pd + (r.pointDiff || 0),
  }), { pts: 0, matches: 0, mw: 0, ml: 0, md: 0, pd: 0 });

  const switched = new Set(rows.map(r => r.team)).size > 1;

  el.innerHTML = `
    <div class="profile-section-title">🏆 Career — ${rows.length} ซีซั่น</div>
    <div class="pd-career-tot">
      <div><b>${tot.pts}</b><span>TOTAL PTS</span></div>
      <div><b>${tot.matches}</b><span>MATCHES</span></div>
      <div><b style="color:var(--green);">${tot.mw}</b><span>WIN</span></div>
      <div><b style="color:var(--danger);">${tot.ml}</b><span>LOSE</span></div>
      <div><b style="color:${tot.pd >= 0 ? 'var(--green)' : 'var(--danger)'};">${tot.pd > 0 ? '+' : ''}${tot.pd}</b><span>±PD</span></div>
    </div>
    ${switched ? `<div class="pd-career-note">↔ เคยเล่นทั้งสองสี — ดูรายซีซั่นด้านล่าง</div>` : ''}
    <div class="pd-career-list">
      ${rows.map(r => {
        const tc = TEAM_COLOR[r.team] || 'var(--muted)';
        return `<div class="pd-career-row${r.isCurrent ? ' is-current' : ''}" style="border-left-color:${tc};">
          <div class="pdc-year">${r.year}${r.isCurrent ? '<span class="pdc-now">กำลังเล่น</span>' : ''}</div>
          <div class="pdc-team" style="color:${tc};">${TEAM_LABEL[r.team] || '—'}<span>G${r.group || '—'} · ${escHtml(r.jersey || '')}</span></div>
          <div class="pdc-stats">
            <span><b style="color:var(--gold);">${r.pts || 0}</b> pts</span>
            <span class="sep">·</span>
            <span>${r.matchWin || 0}W ${r.matchLose || 0}L${r.matchDraw ? ' ' + r.matchDraw + 'D' : ''}</span>
            <span class="sep">·</span>
            <span>${r.matches || 0} แมตช์</span>
            <span class="sep">·</span>
            <span style="color:${(r.pointDiff || 0) >= 0 ? 'var(--green)' : 'var(--danger)'};">${(r.pointDiff || 0) > 0 ? '+' : ''}${r.pointDiff || 0} PD</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── Past-season match log: which colour they wore, which they faced ──
async function renderPdPastMatches(playerId) {
  const el = document.getElementById('pdPastMatches');
  if (!el) return;
  const pid = pidOf(playerId);
  const rec = pid ? (_masterPlayers || {})[pid] : null;
  const seasons = rec?.seasons || {};
  const curYear = String(appState.seasonYear || new Date().getFullYear());
  const past = Object.keys(seasons).filter(y => y !== curYear).sort().reverse();
  if (!past.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="profile-section-title">📜 แมตช์ซีซั่นก่อน</div>
    <div class="rp-empty" style="padding:20px;">⏳ กำลังโหลด archive...</div>`;
  const archives = await loadSeasonArchives();

  const blocks = past.map(year => {
    const arch = archives[year];
    if (!arch) return '';
    const jersey = seasons[year].jersey;
    const nameIn = id => (arch.players || []).find(p => p.id === id)?.name || id;
    const ms = (arch.matchHistory || []).filter(h => [h.r1, h.r2, h.b1, h.b2].includes(jersey));
    if (!ms.length) return '';
    return `<div class="pd-past-season">
      <div class="pd-past-head">${year}<span>${ms.length} แมตช์ · ใส่เสื้อ ${TEAM_LABEL[seasons[year].team] || ''}</span></div>
      ${ms.slice(-12).reverse().map(h => {
        const onRed = [h.r1, h.r2].includes(jersey);
        const stat = onRed ? h.rStat : h.bStat;
        const sc = stat === 'W' ? 'var(--green)' : stat === 'L' ? 'var(--danger)' : 'var(--gold)';
        const sl = stat === 'W' ? 'WIN' : stat === 'L' ? 'LOSE' : 'DRAW';
        const mate = onRed ? (h.r1 === jersey ? h.r2 : h.r1) : (h.b1 === jersey ? h.b2 : h.b1);
        const opp = (onRed ? [h.b1, h.b2] : [h.r1, h.r2]).filter(Boolean).map(nameIn).join(' & ');
        const myColor = onRed ? 'var(--red)' : 'var(--blue)';
        const oppColor = onRed ? 'var(--blue)' : 'var(--red)';
        return `<div class="profile-match-row">
          <div class="profile-match-id">${h.id}</div>
          <div class="profile-match-result" style="background:${sc}22;color:${sc};border:1px solid ${sc}44;">${sl}</div>
          <div class="profile-match-pair">
            <div class="pmr-line"><span class="pmr-lbl">ใส่</span><b style="color:${myColor};">${onRed ? '🔴 Red' : '🔵 Blue'}</b>
              <span class="pmr-lbl" style="min-width:0;margin-left:6px;">คู่กับ</span><b style="color:${myColor};">${escHtml(mate ? nameIn(mate) : '—')}</b></div>
            <div class="pmr-line"><span class="pmr-lbl">พบ</span><b style="color:${oppColor};">${escHtml(opp)}</b></div>
          </div>
          <div class="profile-match-score">${h.game1} / ${h.game2 || '—'}</div>
        </div>`;
      }).join('')}
    </div>`;
  }).filter(Boolean).join('');

  el.innerHTML = blocks
    ? `<div class="profile-section-title">📜 แมตช์ซีซั่นก่อน</div>${blocks}`
    : '';
}

// ══════════════════════════════════════════════════════════════
// SEASON COMPARE — Reports tab 3
// Sources: masterPlayers (per-person, per-season rollups) and
// seasons_archive (whole-season totals). The active season is folded in
// live so the comparison always includes what is happening right now.
// ══════════════════════════════════════════════════════════════
let _cmpArchives = null;

async function renderSeasonCompare() {
  const el = document.getElementById('cmpContent');
  if (!el) return;
  el.innerHTML = `<div class="rp-empty"><span class="rp-empty-icon">⏳</span>กำลังโหลดข้อมูลซีซั่น...</div>`;
  if (!_masterLoaded) await loadMasterPlayers();
  if (!_cmpArchives) _cmpArchives = await loadSeasonArchives();

  const curYear = String(appState.seasonYear || new Date().getFullYear());
  const hist = appState.matchHistory || [];

  // one row per season: archived years plus the live one
  const seasons = Object.keys(_cmpArchives).filter(y => y !== curYear).map(y => {
    const a = _cmpArchives[y];
    const mh = a.matchHistory || [];
    return {
      year: y, name: a.seasonName || `Sports Day ${y}`,
      players: (a.players || []).length, matches: mh.length,
      red: a.globalScoreRed || 0, blue: a.globalScoreBlue || 0,
      redWins: mh.filter(m => m.rStat === 'W').length,
      blueWins: mh.filter(m => m.bStat === 'W').length,
      draws: mh.filter(m => m.rStat === 'D').length,
    };
  });
  seasons.push({
    year: curYear, name: appState.seasonName || `Sports Day ${curYear}`,
    players: (appState.players || []).length, matches: hist.length,
    red: appState.globalScoreRed || 0, blue: appState.globalScoreBlue || 0,
    redWins: hist.filter(m => m.rStat === 'W').length,
    blueWins: hist.filter(m => m.bStat === 'W').length,
    draws: hist.filter(m => m.rStat === 'D').length,
    isCurrent: true,
  });
  seasons.sort((a, b) => b.year.localeCompare(a.year));

  if (seasons.length < 2) {
    el.innerHTML = `<div class="rp-empty"><span class="rp-empty-icon">🗓️</span>
      ยังมีซีซั่นเดียว — เปรียบเทียบได้หลัง archive ซีซั่นแรกและเริ่มซีซั่นใหม่<br>
      <span style="font-size:12px;">(Admin → New Season Wizard → Archive)</span></div>`;
    return;
  }

  // people who appear in more than one season
  const live = {};
  (appState.players || []).forEach(p => { if (p.pid) live[p.pid] = p; });
  const curStats = getPlayerStats();
  const people = [];
  Object.values(_masterPlayers || {}).forEach(rec => {
    if (!rec || !rec.pid) return;
    const per = { ...(rec.seasons || {}) };
    const lp = live[rec.pid];
    if (lp) {
      const s = curStats[lp.id] || {};
      per[curYear] = { jersey: lp.id, team: lp.team, group: lp.group, pts: s.pts || 0,
        matches: s.matchesPlayed || 0, matchWin: s.matchWin || 0, matchLose: s.matchLose || 0,
        pointDiff: s.pointDiff || 0 };
    }
    const yrs = Object.keys(per).sort();
    if (yrs.length < 2) return;
    people.push({ pid: rec.pid, name: (lp ? lp.name : rec.name) || rec.pid, per, yrs,
      stillPlaying: !!lp, switched: new Set(yrs.map(y => per[y].team)).size > 1 });
  });
  people.sort((a, b) => {
    const la = a.per[a.yrs[a.yrs.length-1]].pts || 0, lb = b.per[b.yrs[b.yrs.length-1]].pts || 0;
    return lb - la;
  });

  const yearCols = seasons.map(s => s.year);

  el.innerHTML = `
    <div class="cmp-seasons">
      ${seasons.map(s => {
        const lead = s.red > s.blue ? 'RED' : s.blue > s.red ? 'BLUE' : 'เสมอ';
        const lc = s.red > s.blue ? 'var(--red)' : s.blue > s.red ? 'var(--blue)' : 'var(--gold)';
        const tot = s.redWins + s.blueWins + s.draws || 1;
        return `<div class="cmp-season-card${s.isCurrent ? ' is-current' : ''}">
          <div class="cmp-season-head">
            <span class="cmp-year">${s.year}</span>
            ${s.isCurrent ? '<span class="cmp-live">กำลังเล่น</span>' : ''}
            <span class="cmp-name">${escHtml(s.name)}</span>
          </div>
          <div class="cmp-score">
            <span style="color:var(--red);">${s.red}</span>
            <span class="cmp-vs">:</span>
            <span style="color:var(--blue);">${s.blue}</span>
          </div>
          <div class="cmp-lead" style="color:${lc};">${lead} นำ</div>
          <div class="rp-hero-bar" style="margin-top:10px;">
            ${s.redWins  ? `<span class="rp-hb-red"  style="flex:${s.redWins}"></span>`  : ''}
            ${s.draws    ? `<span class="rp-hb-draw" style="flex:${s.draws}"></span>`    : ''}
            ${s.blueWins ? `<span class="rp-hb-blue" style="flex:${s.blueWins}"></span>` : ''}
          </div>
          <div class="cmp-meta">${s.players} คน · ${s.matches} แมตช์ · 🔴${s.redWins} 🤝${s.draws} 🔵${s.blueWins}</div>
        </div>`;
      }).join('')}
    </div>

    <div class="rp-sec-title" style="margin-top:22px;">ผู้เล่นข้ามซีซั่น</div>
    <div class="rp-sec-sub">${people.length} คนที่เล่นมากกว่าหนึ่งซีซั่น — สีที่ใส่ในแต่ละปีและคะแนนที่ทำได้</div>
    ${people.length === 0
      ? `<div class="rp-empty"><span class="rp-empty-icon">👤</span>ยังไม่มีใครเล่นข้ามซีซั่น</div>`
      : `<div class="table-wrap"><table class="cmp-table">
          <thead><tr>
            <th>ผู้เล่น</th>
            ${yearCols.map(y => `<th>${y}</th>`).join('')}
            <th>รวม PTS</th>
          </tr></thead>
          <tbody>${people.map(p => {
            const total = p.yrs.reduce((a, y) => a + (p.per[y].pts || 0), 0);
            return `<tr${p.stillPlaying ? '' : ' class="cmp-gone"'}>
              <td>
                <span class="cmp-pname">${escHtml(p.name)}</span>
                ${p.switched ? '<span class="cmp-swap" title="เคยเล่นทั้งสองสี">↔</span>' : ''}
                ${p.stillPlaying ? '' : '<span class="cmp-out">ไม่ได้เล่นแล้ว</span>'}
              </td>
              ${yearCols.map(y => {
                const d = p.per[y];
                if (!d) return `<td class="cmp-none">—</td>`;
                const tc = d.team === 'Red' ? 'var(--red)' : 'var(--blue)';
                return `<td><span class="cmp-dot" style="background:${tc};"></span>
                  <b style="color:var(--gold);">${d.pts || 0}</b>
                  <span class="cmp-sub">${d.matchWin || 0}W ${d.matchLose || 0}L</span></td>`;
              }).join('')}
              <td><b style="color:var(--gold);font-size:1.1em;">${total}</b></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`}`;
}