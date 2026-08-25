// ── TIMERS & DISPLAY ──
function formatTimer(ms) { 
  ms = Math.min(ms, 3600000); 
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60); 
  return `${m}:${String(s % 60).padStart(2, '0')}`; 
}

function getCourtElapsed(mId) { const m = appState.ongoingMatches.find(x => x.id === mId); if (!m || !m.timerStartedAt) return 0; return Date.now() - m.timerStartedAt; }

// FIX-6: skip timer updates when tab is hidden (saves CPU in background)
setInterval(() => {
  if (document.hidden) return;
  if (document.getElementById('ongoing').classList.contains('active')) {
    appState.ongoingMatches.forEach(m => {
      const elapsed = getCourtElapsed(m.id); const mins = Math.floor(elapsed / 60000); const col = elapsed === 0 ? 'var(--muted)' : mins >= 30 ? 'var(--danger)' : mins >= 20 ? 'var(--gold)' : 'var(--green)';
      const pubEl = document.getElementById(`pubTimer-${m.id}`); if (pubEl) { pubEl.textContent = '⏱ ' + (elapsed > 0 ? formatTimer(elapsed) : '0:00'); pubEl.style.color = col; }
    });
  }
  if (document.getElementById('dashboard')?.classList.contains('active')) {
      appState.ongoingMatches.forEach(m => {
          const el = document.getElementById(`dbTimer-${m.id}`);
          if (el) { const e = getCourtElapsed(m.id); el.textContent = e>0?formatTimer(e):'—'; el.style.color = e===0?'var(--muted)':(e>=1800000?'var(--danger)':e>=1200000?'var(--gold)':'var(--green)'); }
      });
  }
}, 1000);

// ── RENDER MATCHES ──
// ── STRIP GROUP SUFFIX e.g. " (G1)" / " (G2)" / " (G3)" from player names ──
function stripGroup(name) {
  return name.replace(/\s*\(G\d\)/g, '').trim();
}

// ── FORMAT TEAM NAMES (2-line display, no truncation) ──
function formatTeamNames(namesStr, teamColor) {
  if (!namesStr) return '<span style="color:var(--muted);">—</span>';
  const parts = namesStr.split(' & ');
  if (parts.length === 2) {
    return parts.map(p => `<span style="display:block;font-size:13px;font-weight:700;color:${teamColor};line-height:1.35;">${escHtml(stripGroup(p.trim()))}</span>`).join('');
  }
  return `<span style="font-size:13px;font-weight:700;color:${teamColor};">${escHtml(stripGroup(namesStr))}</span>`;
}

// ── FIX-SHAKE: lightweight badge-only update, called on every Firebase tick ──
// Does NOT touch liveContainer/queueContainer innerHTML, so no reflow/scroll jank.
function updateOngoingBadges() {
  if (!appState) return;
  const liveMatches     = appState.ongoingMatches.filter(m => m.umpire);
  const upcomingMatches = appState.ongoingMatches.filter(m => !m.umpire);
  const liveCountEl = document.getElementById('ongoingLiveCount');
  if (liveCountEl) liveCountEl.textContent = liveMatches.length > 0 ? liveMatches.length : '—';
  const queueEl = document.getElementById('ongoingQueueCount');
  if (queueEl) queueEl.textContent = upcomingMatches.length > 0 ? `${upcomingMatches.length} รอคิว` : 'ไม่มีคิว';
  const navOB = document.getElementById('navOngoingBadge');
  if (navOB) { const t = appState.ongoingMatches.length; navOB.textContent = t; navOB.style.display = t > 0 ? 'inline-block' : 'none'; }
  const navFB = document.getElementById('navFinishedBadge');
  if (navFB) { const fc = appState.matchHistory.length; navFB.textContent = fc; navFB.style.display = fc > 0 ? 'inline-block' : 'none'; }
}

function renderPublicOngoingMatches() {
  const liveContainer  = document.getElementById('publicLiveMatches');
  const queueContainer = document.getElementById('publicUpcomingMatches');
  const liveCountEl    = document.getElementById('ongoingLiveCount');
  if (!liveContainer || !queueContainer) return;

  liveContainer.innerHTML = ''; queueContainer.innerHTML = '';
  const liveMatches     = appState.ongoingMatches.filter(m => m.umpire);
  const upcomingMatches = appState.ongoingMatches.filter(m => !m.umpire);
  if (liveCountEl) liveCountEl.textContent = liveMatches.length > 0 ? liveMatches.length : '—';
  const queueEl = document.getElementById('ongoingQueueCount');
  if (queueEl) queueEl.textContent = upcomingMatches.length > 0 ? `${upcomingMatches.length} รอคิว` : 'ไม่มีคิว';
  const navOB = document.getElementById('navOngoingBadge');
  if (navOB) { const t = appState.ongoingMatches.length; navOB.textContent = t; navOB.style.display = t > 0 ? 'inline-block' : 'none'; }
  const navFB = document.getElementById('navFinishedBadge');
  if (navFB) { const fc = appState.matchHistory.length; navFB.textContent = fc; navFB.style.display = fc > 0 ? 'inline-block' : 'none'; }

  if (liveMatches.length === 0) {
    liveContainer.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--muted);font-size:14px;font-weight:600;background:var(--surface2);border-radius:14px;border:1px dashed var(--border);">
        🏸 ยังไม่มีคอร์ทที่กำลังแข่งขันอยู่
      </div>`;
  } else {
    liveMatches.forEach(m => {
      const elapsed    = getCourtElapsed(m.id);
      const mins       = Math.floor(elapsed / 60000);
      const timerColor = elapsed === 0 ? 'var(--muted)' : mins >= 30 ? 'var(--danger)' : mins >= 20 ? 'var(--gold)' : 'var(--green)';
      const timerLabel = elapsed > 0 ? formatTimer(elapsed) : '0:00';
      const timerLongClass = mins >= 30 ? ' long-game' : '';

      // ── Climax Detection ──
      // เช็คทั้ง G1 (ถ้ายังไม่ lock) และ G2 (ถ้า locked แล้ว)
      let climaxLevel = 0; // 0=ปกติ, 1=climax, 2=deuce
      if (m.live) {
        const checkClimax = (r, b, locked) => {
          if (locked) return 0; // เกมจบแล้ว ไม่นับ
          const hi = Math.max(r, b), lo = Math.min(r, b), diff = hi - lo;
          if (hi >= 20 && diff <= 2) return 2; // deuce zone
          if (hi >= 18 && diff <= 3) return 1; // climax zone
          return 0;
        };
        const g1Level = checkClimax(
          Number(m.live.g1R||0), Number(m.live.g1B||0), m.live.g1Locked
        );
        const g2Level = m.live.g1Locked
          ? checkClimax(Number(m.live.g2R||0), Number(m.live.g2B||0), false)
          : 0;
        climaxLevel = Math.max(g1Level, g2Level);
      }
      const climaxClass = climaxLevel === 2 ? 'deuce' : climaxLevel === 1 ? 'climax' : '';
      const climaxBadge = climaxLevel === 2
        ? `<span class="climax-badge type-deuce">⚡ DEUCE</span>`
        : climaxLevel === 1
        ? `<span class="climax-badge type-climax">🔥 CLIMAX</span>`
        : '';

      // ── Score rows ──
      let scoreBlockHtml = '';
      if (m.live) {
        const pf  = m.potFlags || {};
        const g1r = Number(m.live.g1R||0), g1b = Number(m.live.g1B||0);
        const g2r = Number(m.live.g2R||0), g2b = Number(m.live.g2B||0);

        const g1RedCB  = pf.g1R_pot && !m.live.g1Locked && g1r < g1b;
        const g1BlueCB = pf.g1B_pot && !m.live.g1Locked && g1b > g1r;
        const g2RedCB  = pf.g2R_pot && m.live.g1Locked  && g2r < g2b;
        const g2BlueCB = pf.g2B_pot && m.live.g1Locked  && g2b > g2r;

        // winner dim: if g1 locked, loser score dims
        const g1rDim = m.live.g1Locked && g1r < g1b;
        const g1bDim = m.live.g1Locked && g1b < g1r;

        const cbBadge = (isRed, isBlue) => {
          if (isRed)  return `<span class="court-comeback-badge" style="color:var(--red);background:rgba(255,59,92,0.15);border:1px solid rgba(255,59,92,0.3);">⚡COMEBACK?</span>`;
          if (isBlue) return `<span class="court-comeback-badge" style="color:var(--blue);background:rgba(59,142,255,0.15);border:1px solid rgba(59,142,255,0.3);">⚡COMEBACK?</span>`;
          return '';
        };

        const scoreRow = (labelCls, labelTxt, rS, bS, rDim, bDim, cbRed, cbBlue) => `
          <div class="court-score-row">
            <span class="court-glabel ${labelCls}">${labelTxt}</span>
            <div class="court-score-nums">
              <span class="court-snum red ${rDim?'dim':''}">${rS}</span>
              <span class="court-ssep">:</span>
              <span class="court-snum blue ${bDim?'dim':''}">${bS}</span>
              ${cbBadge(cbRed, cbBlue)}
            </div>
          </div>`;

        scoreBlockHtml = `
          <div class="court-score-block">
            ${scoreRow('', 'G1', m.live.g1R, m.live.g1B, g1rDim, g1bDim, g1RedCB, g1BlueCB)}
            ${m.live.g1Locked
              ? scoreRow('g2', 'G2', m.live.g2R, m.live.g2B, false, false, g2RedCB, g2BlueCB)
              : `<div class="court-g2-placeholder">G2 ยังไม่เริ่ม</div>`}
          </div>`;
      } else {
        scoreBlockHtml = `
          <div class="court-waiting">
            <div class="court-waiting-score">– : –</div>
            <div class="court-waiting-label">รอ Umpire เริ่มนับ</div>
          </div>`;
      }

      // ── Player names ──
      const redParts  = (m.redNames||'').split(' & ').map(n => stripGroup(n.trim()));
      const blueParts = (m.blueNames||'').split(' & ').map(n => stripGroup(n.trim()));
      const redPlayersHtml  = redParts.map(n  => `<div class="court-player-name red">${escHtml(n)}</div>`).join('');
      const bluePlayersHtml = blueParts.map(n => `<div class="court-player-name blue">${escHtml(n)}</div>`).join('');

      const predHtml = '';

      liveContainer.innerHTML += `
        <div class="court-card ${climaxClass}">
          <div class="court-card-header">
            <span class="court-card-id">${m.id}</span>
            <span class="court-card-round">R${m.round}</span>
            ${m.umpire ? `<span class="court-card-umpire">👔 ${escHtml(m.umpire)}</span>` : ''}
            ${climaxBadge}
            <div class="live-indicator" style="margin-left:auto;"><span class="live-dot"></span>LIVE</div>
            <span class="court-card-timer${timerLongClass}" style="color:${timerColor};" id="pubTimer-${m.id}">⏱${timerLabel}</span>
          </div>
          ${scoreBlockHtml}
          <div class="court-players">
            <div class="court-team red">
              <div class="court-team-label red">🔴 RED</div>
              ${redPlayersHtml}
            </div>
            <div class="court-team blue">
              <div class="court-team-label blue">BLUE 🔵</div>
              ${bluePlayersHtml}
            </div>
          </div>
          ${predHtml}
          ${(userRole==='superadmin') ? `<div class="frow-footer" style="border-top:1px solid rgba(255,255,255,0.05);padding:7px 12px 9px;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
            <span style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-right:auto;align-self:center;">👑 SUPERADMIN</span>
            <button class="frow-admin-btn edit" onclick="openResultModal('${m.id}')" title="ใส่ผล manual">⚡ Force Result</button>
            <button class="frow-admin-btn del" onclick="removeOngoingMatch('${m.id}')" title="ลบ match นี้">🗑 Delete</button>
          </div>` : ''}
        </div>`;
    });
  }

  // ── Queue list — compact horizontal rows ──
  if (upcomingMatches.length === 0) {
    queueContainer.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;font-weight:600;">ไม่มีแมตช์รอคิว</div>`;
  } else {
    upcomingMatches.forEach((m, i) => {
      // BUG-FIX: detect corrupt match (missing id, players, or names)
      const isCorrupt = !m.id || m.id === 'undefined' || !m.r1 || !m.r2 || !m.b1 || !m.b2 || !m.redNames || m.redNames.includes('undefined') || !m.blueNames || m.blueNames.includes('undefined');
      const safeId    = m.id && m.id !== 'undefined' ? m.id : '⚠️ CORRUPT';
      const redNames  = isCorrupt ? '—' : (m.redNames||'').split(' & ').map(n => stripGroup(n.trim())).join(' & ');
      const blueNames = isCorrupt ? '—' : (m.blueNames||'').split(' & ').map(n => stripGroup(n.trim())).join(' & ');
      const qPredHtml = '';
      const corruptBadge = isCorrupt ? `<span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px;background:rgba(255,69,96,0.15);color:var(--danger);border:1px solid rgba(255,69,96,0.3);">⚠️ ข้อมูลเสีย</span>` : '';
      queueContainer.innerHTML += `
        <div class="queue-row" style="flex-direction:column;align-items:stretch;padding:10px 14px;gap:6px;${isCorrupt?'border-color:rgba(255,69,96,0.3);background:rgba(255,69,96,0.04);':''}">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="queue-num">#${i+1}</span>
            <span class="queue-mid">${safeId}</span>
            <span class="queue-round">R${m.round||'?'}</span>
            <div class="queue-teams" style="flex:1;min-width:0;">
              <span class="queue-team-names" style="color:var(--red);">${escHtml(redNames)}</span>
              <span class="queue-vs">VS</span>
              <span class="queue-team-names" style="color:var(--blue);">${escHtml(blueNames)}</span>
            </div>
            ${corruptBadge}
            <span class="queue-status">⏳ รอ</span>
          </div>
          ${qPredHtml ? `<div style="margin:0 -14px -10px;border-radius:0 0 8px 8px;overflow:hidden;">${qPredHtml}</div>` : ''}
          ${(userRole==='superadmin') ? `<div style="display:flex;gap:6px;justify-content:flex-end;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">
            <span style="font-size:10px;color:var(--muted);letter-spacing:1px;margin-right:auto;align-self:center;">👑 SUPERADMIN</span>
            ${!isCorrupt ? `<button class="frow-admin-btn edit" onclick="openResultModal('${m.id}')" title="ใส่ผล manual">⚡ Force Result</button>` : ''}
            <button class="frow-admin-btn del" onclick="removeOngoingMatch('${isCorrupt ? '' : m.id}')" title="ลบ match นี้">🗑 Delete</button>
          </div>` : ''}
        </div>`;
    });
  }
}

function renderAdminOngoingMatches() {
  const c = document.getElementById('adminOngoingMatchesContainer'); if (!c) return;
  document.getElementById('ongoingCount').textContent = appState.ongoingMatches.length;
  c.innerHTML = '';
  appState.ongoingMatches.forEach(m => {
    const isLive = !!m.umpire;
    c.innerHTML += `<div class="match-card ${isLive ? 'live-card' : ''}">
      <div class="match-card-inner">
        <div class="match-id-badge">
          <div style="display:flex;align-items:center;gap:8px;">
            <span>${m.id}</span>
            <span class="round-badge">Round ${m.round}</span>
          </div>
          ${isLive
            ? `<div class="live-indicator"><span class="live-dot"></span>LIVE · ${m.umpire||''}</div>`
            : `<span style="font-size:10px;font-weight:700;letter-spacing:2px;color:var(--muted);">QUEUE</span>`}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:10px 0;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:var(--red);font-weight:700;margin-bottom:1px;">🔴</div>
            <div>${formatTeamNames(m.redNames,'var(--text)')}</div>
          </div>
          <div style="font-family:'Bebas Neue';color:var(--muted);letter-spacing:2px;font-size:0.9em;flex-shrink:0;">VS</div>
          <div style="flex:1;min-width:0;text-align:right;">
            <div style="font-size:11px;color:var(--blue);font-weight:700;margin-bottom:1px;">🔵</div>
            <div style="text-align:right;">${formatTeamNames(m.blueNames,'var(--text)')}</div>
          </div>
        </div>
        <div class="match-footer">
          <button class="btn btn-info btn-sm" onclick="openResultModal('${m.id}')">⚡ Force Result</button>
          <button class="btn btn-danger btn-sm" onclick="removeOngoingMatch('${m.id}')">🗑 Delete</button>
        </div>
      </div>
    </div>`;
  });
}

// ── FINISHED RESULT FILTER ──
let _finishedResultFilter = '';
function setFinishedResultFilter(val) {
  _finishedResultFilter = val;
  ['frAll','frRed','frDraw','frBlue'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  const map = { '':'frAll', 'red':'frRed', 'draw':'frDraw', 'blue':'frBlue' };
  document.getElementById(map[val])?.classList.add('active');
  renderFinishedMatches();
}

function renderFinishedMatches() {
  const container = document.getElementById('finishedMatchesGrid');
  if (!container) return;
  const search = (document.getElementById('finishedSearch')?.value||'').toLowerCase();
  const round  = document.getElementById('finishedFilterRound')?.value||'';
  const matches = appState.matchHistory.filter(m => {
    if (search && !m.redNames.toLowerCase().includes(search) && !m.blueNames.toLowerCase().includes(search) && !m.id.toLowerCase().includes(search)) return false;
    if (round && m.round !== round) return false;
    if (_finishedResultFilter === 'red'  && m.rStat !== 'W') return false;
    if (_finishedResultFilter === 'blue' && m.bStat !== 'W') return false;
    if (_finishedResultFilter === 'draw' && m.rStat !== 'D') return false;
    return true;
  }).slice().reverse();

  if (!matches.length) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--muted);font-size:14px;font-weight:600;background:var(--surface2);border-radius:14px;border:1px dashed var(--border);">🏁 ยังไม่มีแมตช์ที่จบแล้ว</div>`;
    return;
  }

  container.innerHTML = matches.map(m => {
    const isRedWin = m.rStat==='W', isBlueWin = m.bStat==='W';
    const winnerClass = isRedWin?'winner-red':isBlueWin?'winner-blue':'';
    const resultBadgeClass = isRedWin?'win-red':isBlueWin?'win-blue':'draw';
    const resultLabel = isRedWin?'🔴 RED WINS':isBlueWin?'🔵 BLUE WINS':'🤝 DRAW';
    const [g1r,g1b] = (m.game1||'0:0').split(':').map(Number);
    const [g2r,g2b] = (m.game2||'0:0').split(':').map(Number);
    const g2played = g2r > 0 || g2b > 0;
    // ── ชื่อผู้เล่น (ไม่มี G1/G2/G3, winner bold/สี, loser dim) ──
    const makePlayerDiv = (namesStr, isWinner, side) => {
      return (namesStr||'').split(' & ').map(n => {
        const cls = isWinner ? 'frow-player winner' : 'frow-player loser';
        return `<div class="${cls}">${escHtml(stripGroup(n.trim()))}</div>`;
      }).join('');
    };
    const redPlayers  = makePlayerDiv(m.redNames,  isRedWin,  'left');
    const bluePlayers = makePlayerDiv(m.blueNames, isBlueWin, 'right');

    // ── Score hero ──
    const scoreRow = (glabelCls, glabelTxt, r, b) => `
      <div class="frow-score-row">
        <span class="frow-glabel ${glabelCls}">${glabelTxt}</span>
        <span class="frow-snum red">${r}</span>
        <span class="frow-ssep">:</span>
        <span class="frow-snum blue">${b}</span>
      </div>`;

    const scoreHero = `
      <div class="frow-score-hero">
        ${scoreRow('', 'G1', g1r, g1b)}
        ${g2played ? scoreRow('g2-label', 'G2', g2r, g2b) : `<div style="font-size:9px;color:rgba(255,255,255,0.15);letter-spacing:1px;font-weight:700;">— G2 —</div>`}
      </div>`;

    // ── Tags ── compact, max 3 shown
    const tags = m.analysis?.tags || [];
    const tagHtml = tags.slice(0,4).map(t =>
      `<span class="frow-tag-icon ${t.class||'tag-normal'}">${t.label}</span>`
    ).join('');

    // ── Umpire ──
    const umpireHtml = m.umpire
      ? `<span class="frow-umpire">👔 ${escHtml(m.umpire)}</span>` : '';

    // ── Admin controls ──
    let adminHtml = '';
    if (userRole==='admin'||userRole==='superadmin') {
      const tagsBtn = `<button class="frow-admin-btn" onclick="openEditTagsModal('${m.id}')">🏷 Tags</button>`;
      const editBtn = userRole==='superadmin' ? `<button class="frow-admin-btn edit" onclick="openEditResult('${m.id}')">✏️ Edit</button>` : '';
      const delBtn  = userRole==='superadmin' ? `<button class="frow-admin-btn del" onclick="deleteFinishedMatch('${m.id}')">🗑</button>` : '';
      adminHtml = `<div class="frow-admin">${tagsBtn}${editBtn}${delBtn}</div>`;
    }

    // ── Footer only if something to show ──
    const hasFooter = tagHtml || umpireHtml || adminHtml;
    const footerHtml = hasFooter
      ? `<div class="frow-footer">${tagHtml}${umpireHtml}${adminHtml}</div>` : '';

    const predAccHtml = '';

    // ── Winner class ──
    const winClass = isRedWin ? 'winner-red' : isBlueWin ? 'winner-blue' : 'draw-match';

    return `<div class="frow ${winClass}">
      <div class="frow-meta">
        <span class="frow-match-id">${m.id}</span>
        <span class="round-badge">R${m.round}</span>
        <div class="frow-meta-right">
          <span class="result-badge ${resultBadgeClass}">${resultLabel}</span>
        </div>
      </div>
      <div class="frow-body">
        <div class="frow-team-left">${redPlayers}</div>
        ${scoreHero}
        <div class="frow-team-right">${bluePlayers}</div>
      </div>
      ${footerHtml}
      ${predAccHtml}
    </div>`;


  }).join('');
}

