// ── TIMERS & DISPLAY ──
// formatTimer() lives in shared/match-time.js (shows hours past 60 minutes)
function getCourtElapsed(mId) { const m = appState.ongoingMatches.find(x => x.id === mId); if (!m || !m.timerStartedAt) return 0; return Date.now() - m.timerStartedAt; }

// ── COURT NUMBER + STATUS LABEL — the same on the live arena, the Ongoing tab and the admin cards ──
function courtPillHtml(m) { return m && m.court ? `<span class="court-no">${escHtml(courtLabel(m))}</span>` : ''; }
// "พักเกม" / "ไม่มีความเคลื่อนไหว N นาที": it ages with the clock, not with data (a stalled court
// sends none), so every label carries its match id and the 1 s timer below refreshes them all.
function matchStatusHtml(m) {
  const now = Date.now();
  return `<span class="m-status${matchLooksStuck(m, now) ? ' stuck' : ''}" data-status-mid="${escHtml(m.id)}">${escHtml(matchStatusTag(m, now))}</span>`;
}
function patchMatchStatusTags() {
  const now = Date.now();
  document.querySelectorAll('[data-status-mid]').forEach(el => {
    const m = (appState.ongoingMatches || []).find(x => x && x.id === el.dataset.statusMid); if (!m) return;
    const tag = matchStatusTag(m, now);
    if (el.textContent !== tag) el.textContent = tag;
    el.classList.toggle('stuck', matchLooksStuck(m, now));
  });
}

// FIX-6: skip timer updates when tab is hidden (saves CPU in background)
setInterval(() => {
  if (document.hidden) return;
  patchMatchStatusTags();
  if (document.getElementById('ongoing').classList.contains('active')) {
    appState.ongoingMatches.forEach(m => {
      const elapsed = getCourtElapsed(m.id);
      const pubEl = document.getElementById(`pubTimer-${m.id}`); if (pubEl) { pubEl.textContent = elapsed > 0 ? formatTimer(elapsed) : '0:00'; pubEl.dataset.tone = _timerTone(elapsed); }
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

// ── FORMAT TEAM NAMES (admin card: one span per player; the card css wraps and separates them, no truncation) ──
function formatTeamNames(namesStr) {
  if (!namesStr) return '<span class="am-name ds-muted">—</span>';
  return namesStr.split(' & ').map(p => `<span class="am-name">${escHtml(stripGroup(p.trim()))}</span>`).join('');
}

// ── FIX-SHAKE: lightweight badge-only update, called on every Firebase tick ──
// Does NOT touch liveContainer/queueContainer innerHTML, so no reflow/scroll jank.
// "LIVE ON COURT" counts matches being played; one an umpire has only taken is "พร้อมแข่ง" (N-01)
function _ongoingCounts() {
  const ong = (appState && appState.ongoingMatches) || [];
  return { playing: ong.filter(m => matchStage(m) === 'playing').length, ready: ong.filter(m => matchStage(m) === 'ready').length, queue: ong.filter(m => !m.umpire).length };
}
function _ongoingQueueText(c) {
  const parts = [c.ready ? `${c.ready} พร้อมแข่ง` : '', c.queue ? `${c.queue} รอคิว` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ไม่มีคิว';
}
function updateOngoingBadges() {
  if (!appState) return;
  const c = _ongoingCounts();
  const liveCountEl = document.getElementById('ongoingLiveCount');
  if (liveCountEl) liveCountEl.textContent = c.playing > 0 ? c.playing : '—';
  const queueEl = document.getElementById('ongoingQueueCount');
  if (queueEl) queueEl.textContent = _ongoingQueueText(c);
  const navOB = document.getElementById('navOngoingBadge');
  if (navOB) { const t = appState.ongoingMatches.length; navOB.textContent = t; navOB.style.display = t > 0 ? 'inline-block' : 'none'; }
  const navFB = document.getElementById('navFinishedBadge');
  if (navFB) { const fc = appState.matchHistory.length; navFB.textContent = fc; navFB.style.display = fc > 0 ? 'inline-block' : 'none'; }
}

// the clock on a court card: its tone says how long the match has been going (css/climax.css .court-card-timer)
function _timerTone(elapsed) {
  const mins = Math.floor(elapsed / 60000);
  return elapsed === 0 ? 'none' : mins >= 30 ? 'late' : mins >= 20 ? 'warn' : 'ok';
}

function renderPublicOngoingMatches() {
  const liveContainer  = document.getElementById('publicLiveMatches');
  const queueContainer = document.getElementById('publicUpcomingMatches');
  const liveCountEl    = document.getElementById('ongoingLiveCount');
  if (!liveContainer || !queueContainer) return;

  liveContainer.innerHTML = ''; queueContainer.innerHTML = '';
  const liveMatches     = sortByCourt(appState.ongoingMatches.filter(m => m.umpire));   // on court: playing, or ready to
  const upcomingMatches = appState.ongoingMatches.filter(m => !m.umpire);
  const counts = _ongoingCounts();
  if (liveCountEl) liveCountEl.textContent = counts.playing > 0 ? counts.playing : '—';
  const queueEl = document.getElementById('ongoingQueueCount');
  if (queueEl) queueEl.textContent = _ongoingQueueText(counts);
  const navOB = document.getElementById('navOngoingBadge');
  if (navOB) { const t = appState.ongoingMatches.length; navOB.textContent = t; navOB.style.display = t > 0 ? 'inline-block' : 'none'; }
  const navFB = document.getElementById('navFinishedBadge');
  if (navFB) { const fc = appState.matchHistory.length; navFB.textContent = fc; navFB.style.display = fc > 0 ? 'inline-block' : 'none'; }

  if (liveMatches.length === 0) {
    liveContainer.innerHTML = `
      <div class="court-empty ds-empty">
        <div class="ds-empty-art">${dsMascot('break')}</div>
        <div class="ds-empty-title">ยังไม่มีแมตช์ที่กำลังแข่ง</div>
        <div class="ds-empty-text">แมตช์ถัดไปจะขึ้นที่นี่</div>
      </div>`;
  } else {
    liveMatches.forEach(m => {
      const elapsed    = getCourtElapsed(m.id);
      const timerLabel = elapsed > 0 ? formatTimer(elapsed) : '0:00';

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
        ? `<span class="climax-badge type-deuce">${dsIcon('lightning')}DEUCE</span>`
        : climaxLevel === 1
        ? `<span class="climax-badge type-climax">${dsIcon('fire')}ลุ้นสูสี</span>`
        : '';

      // ── Score rows ──
      // taken but no first point yet: no 0–0 scoreboard, say "พร้อมแข่ง" (N-01)
      const isReady = matchStage(m) === 'ready';
      let scoreBlockHtml = '';
      if (m.live && !isReady) {
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

        // "may turn it round": the side that is behind has been ahead before
        const cbBadge = (isRed, isBlue) => {
          if (isRed)  return `<span class="court-comeback-badge red">${dsIcon('arrow-counter-clockwise')}ลุ้นพลิก</span>`;
          if (isBlue) return `<span class="court-comeback-badge blue">${dsIcon('arrow-counter-clockwise')}ลุ้นพลิก</span>`;
          return '';
        };

        const scoreRow = (labelCls, labelTxt, rS, bS, rDim, bDim, cbRed, cbBlue) => `
          <div class="court-score-row">
            <div class="court-gside"><span class="court-glabel ${labelCls}">${labelTxt}</span>${cbBadge(cbRed, cbBlue)}</div>
            <div class="court-score-nums">
              <span class="court-snum red ${rDim?'dim':''}">${rS}</span>
              <span class="court-ssep">:</span>
              <span class="court-snum blue ${bDim?'dim':''}">${bS}</span>
            </div>
          </div>`;

        scoreBlockHtml = `
          <div class="court-score-block">
            ${scoreRow('', 'เกม 1', m.live.g1R, m.live.g1B, g1rDim, g1bDim, g1RedCB, g1BlueCB)}
            ${m.live.g1Locked
              ? scoreRow('g2', 'เกม 2', m.live.g2R, m.live.g2B, false, false, g2RedCB, g2BlueCB)
              : `<div class="court-g2-placeholder">เกม 2 ยังไม่เริ่ม</div>`}
          </div>`;
      } else {
        scoreBlockHtml = `
          <div class="court-waiting">
            <div class="court-waiting-score">– : –</div>
            <div class="court-waiting-label">${isReady ? 'พร้อมแข่ง · รอคะแนนแรก' : 'รอกรรมการเริ่มนับ'}</div>
          </div>`;
      }

      // ── Player names ──
      const redParts  = (m.redNames||'').split(' & ').map(n => stripGroup(n.trim()));
      const blueParts = (m.blueNames||'').split(' & ').map(n => stripGroup(n.trim()));
      // faces on the live card: this is the one place identification is
      // time-critical — who is on court right now
      const redIds  = [m.r1, m.r2], blueIds = [m.b1, m.b2];
      const redPlayersHtml  = redParts.map((n, i)  => `<div class="court-player-name red">${avatarHtml(redIds[i], 32, {className:'court-pav'})}<span>${escHtml(n)}</span></div>`).join('');
      const bluePlayersHtml = blueParts.map((n, i) => `<div class="court-player-name blue">${avatarHtml(blueIds[i], 32, {className:'court-pav'})}<span>${escHtml(n)}</span></div>`).join('');

      const mineCls = (typeof matchHasMe === 'function' && matchHasMe(m)) ? ' is-mine' : '';
      const meta = [
        isReady
          ? `<span class="court-ready">พร้อมแข่ง</span>`
          : `<span class="ds-chip ds-chip-live"><i class="ds-dot ds-dot-live"></i>LIVE</span>`,
        `<span class="court-card-round">รอบ ${escHtml(String(m.round))}</span>`,
        m.umpire ? `<span class="court-card-umpire">${dsIcon('user')}<span>${escHtml(m.umpire)}</span></span>` : '',
        matchStatusHtml(m),
        climaxBadge
      ].join('');
      liveContainer.innerHTML += `
        <article class="court-card ${climaxClass}${mineCls}">
          <header class="court-card-header">
            ${courtPillHtml(m)}
            <span class="court-card-id">${escHtml(m.id)}</span>
            <span class="court-card-timer" data-tone="${_timerTone(elapsed)}" id="pubTimer-${m.id}">${timerLabel}</span>
          </header>
          <div class="court-card-meta">${meta}</div>
          ${scoreBlockHtml}
          <div class="court-players">
            <div class="court-team red">
              <div class="court-team-label ds-team ds-team-red">RED</div>
              ${redPlayersHtml}
            </div>
            <div class="court-team blue">
              <div class="court-team-label ds-team ds-team-blue">BLUE</div>
              ${bluePlayersHtml}
            </div>
          </div>
          ${(userRole==='superadmin') ? `<div class="court-admin">
            <button type="button" class="ds-btn" onclick="openResultModal('${m.id}')" title="ใส่ผลแมตช์เอง">${dsIcon('lightning')}Force Result</button>
            <button type="button" class="ds-btn ds-btn-danger" onclick="removeOngoingMatch('${m.id}')" title="ลบแมตช์นี้">${dsIcon('trash')}ลบ</button>
          </div>` : ''}
        </article>`;
    });
  }

  // ── Queue list — compact horizontal rows ──
  if (upcomingMatches.length === 0) {
    queueContainer.innerHTML = `<div class="queue-empty">ไม่มีแมตช์รอคิว</div>`;
  } else {
    upcomingMatches.forEach((m, i) => {
      // BUG-FIX: detect corrupt match (missing id, players, or names)
      const isCorrupt = !m.id || m.id === 'undefined' || !m.r1 || !m.r2 || !m.b1 || !m.b2 || !m.redNames || m.redNames.includes('undefined') || !m.blueNames || m.blueNames.includes('undefined');
      const safeId    = m.id && m.id !== 'undefined' ? m.id : '—';
      const redNames  = isCorrupt ? '—' : (m.redNames||'').split(' & ').map(n => stripGroup(n.trim())).join(' & ');
      const blueNames = isCorrupt ? '—' : (m.blueNames||'').split(' & ').map(n => stripGroup(n.trim())).join(' & ');
      const corruptBadge = isCorrupt ? `<span class="queue-corrupt">${dsIcon('warning')}ข้อมูลเสีย</span>` : '';
      queueContainer.innerHTML += `
        <div class="queue-row${isCorrupt ? ' is-corrupt' : ''}">
          <div class="queue-head">
            <span class="queue-num">#${i+1}</span>
            <span class="queue-mid">${escHtml(safeId)}</span>
            <span class="queue-round">รอบ ${escHtml(String(m.round||'?'))}</span>
            ${corruptBadge}
            <span class="queue-status">${dsIcon('hourglass-medium')}รอ</span>
          </div>
          <div class="queue-teams">
            <span class="queue-team-names red">${escHtml(redNames)}</span>
            <span class="queue-vs">VS</span>
            <span class="queue-team-names blue">${escHtml(blueNames)}</span>
          </div>
          ${(userRole==='superadmin') ? `<div class="court-admin">
            ${!isCorrupt ? `<button type="button" class="ds-btn" onclick="openResultModal('${m.id}')" title="ใส่ผลแมตช์เอง">${dsIcon('lightning')}Force Result</button>` : ''}
            <button type="button" class="ds-btn ds-btn-danger" onclick="removeOngoingMatch('${isCorrupt ? '' : m.id}')" title="ลบแมตช์นี้">${dsIcon('trash')}ลบ</button>
          </div>` : ''}
        </div>`;
    });
  }
}

// the court picker on an admin card — same ten courts as the umpire's chips
function courtSelectHtml(m) {
  const opts = [];
  if (!m.court) opts.push('<option value="" selected>ยังไม่ระบุคอร์ต</option>');
  for (let n = 1; n <= 10; n++) opts.push(`<option value="${n}"${Number(m.court) === n ? ' selected' : ''}>คอร์ต ${n}</option>`);
  return `<select class="ds-select am-court" aria-label="เลขคอร์ตของ ${escHtml(m.id)}" onchange="adminSetCourt('${escHtml(m.id)}', this.value)">${opts.join('')}</select>`;
}

// An admin sets or corrects the court of a match an umpire has taken (the umpire can do the same
// from the scoring screen). A court that already holds a match asks first — warn, never block.
function adminSetCourt(mId, val) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  const n = Number(val) || 0;
  const m = (appState.ongoingMatches || []).find(x => x && x.id === mId);
  if (!m || !n || Number(m.court) === n) return;
  const other = (appState.ongoingMatches || []).find(x => x && x.id !== mId && x.umpire && Number(x.court) === n);
  const go = () => setMatchField(mId, 'court', n).then(ok => showToast(ok ? `${mId} → คอร์ต ${n}` : 'บันทึกเลขคอร์ตไม่สำเร็จ', ok ? 'success' : 'error'));
  if (other) showConfirmDialog(`คอร์ต ${n} มีแมตช์ ${other.id} อยู่แล้ว — ใช้คอร์ต ${n} ต่อไหม?`, go); else go();
  renderAdminOngoingMatches();    // put the picker back to the saved value until the save (or the cancel) settles
}

// "ปล่อยแมตช์" — an umpire took a match and walked away: give it back to the queue so someone else can take it.
// A score already counted is thrown away, so the dialog says so and points to Force Result instead.
function adminReleaseMatch(mId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  const m = (appState.ongoingMatches || []).find(x => x && x.id === mId);
  if (!m || !m.umpire) return;
  const seen = matchLastActivityAt(m), lv = m.live || {};
  const pts = (Number(lv.g1R) || 0) + (Number(lv.g1B) || 0) + (Number(lv.g2R) || 0) + (Number(lv.g2B) || 0);
  const score = pts
    ? ` คะแนนที่นับไว้ (เกม 1 ${lv.g1R || 0}–${lv.g1B || 0}${lv.g1Locked ? ` · เกม 2 ${lv.g2R || 0}–${lv.g2B || 0}` : ''}) จะหายไป — ถ้าต้องการเก็บผล ให้ใช้ ใส่ผลเอง แทน`
    : '';
  showConfirmDialog(`ปล่อย ${mId}${m.court ? ' (คอร์ต ' + m.court + ')' : ''} กลับเข้าคิว? กรรมการ ${m.umpire} จะหลุดจากแมตช์นี้.${score}`, () => {
    releaseMatch(mId, seen).then(r => {
      if (r.ok) return showToast(`ปล่อย ${mId} กลับเข้าคิวแล้ว`, 'success');
      const msg = r.reason === 'active' ? `${mId} เพิ่งมีความเคลื่อนไหว — ยังไม่ปล่อย ลองดูสถานะอีกครั้ง`
        : (r.reason === 'already' || r.reason === 'missing') ? `${mId} ไม่ได้อยู่ในสถานะที่ปล่อยได้แล้ว`
        : 'ปล่อยแมตช์ไม่สำเร็จ — ลองอีกครั้ง';
      showToast(msg, 'error');
    });
  });
}

// One card per match, live court or queue. Same hooks as before: [data-status-mid] (patched every second), the court <select>,
// and the three actions - the destructive one (ลบ) sits apart at the end of the row and is still behind its own confirmation.
function renderAdminOngoingMatches() {
  const c = document.getElementById('adminOngoingMatchesContainer'); if (!c) return;
  document.getElementById('ongoingCount').textContent = appState.ongoingMatches.length;
  if (!appState.ongoingMatches.length) {
    c.innerHTML = `<div class="ds-empty am-empty">${dsMascot('drop')}
      <div class="ds-empty-title">ยังไม่มีแมตช์ในคิว</div>
      <div class="ds-empty-text">เลือกผู้เล่น 2 คนต่อทีม แล้วกด สร้างแมตช์</div>
      <button type="button" class="ds-btn am-empty-act" onclick="document.getElementById('matchBoard').scrollIntoView({ block: 'start' })">${dsIcon('arrow-left')}ไปสร้างแมตช์</button>
    </div>`;
    return;
  }
  c.innerHTML = appState.ongoingMatches.map(m => {
    const isLive = !!m.umpire;
    const corrupt = !m.id || m.id === 'undefined' || !m.r1 || !m.r2 || !m.b1 || !m.b2 || !m.redNames || m.redNames.includes('undefined') || !m.blueNames || m.blueNames.includes('undefined');
    const state = !isLive ? '<span class="ds-chip">รอคิว</span>'
      : matchStage(m) === 'ready' ? '<span class="ds-chip">พร้อมแข่ง</span>'
      : '<span class="ds-chip ds-chip-live"><span class="ds-dot ds-dot-live"></span>LIVE</span>';
    const ump = isLive ? `<span class="am-ump">${dsIcon('user', { cls: 'ds-ic-sm' })}${escHtml(m.umpire || '')}</span>` : '';
    const bad = corrupt ? '<span class="ds-chip ds-chip-err">ข้อมูลเสีย</span>' : '';
    return `<article class="am-card${isLive ? ' is-live' : ''}" aria-label="แมตช์ ${escHtml(m.id || '—')}">
      <div class="am-head">
        <span class="am-id">${escHtml(m.id && m.id !== 'undefined' ? m.id : '—')}</span>
        <span class="ds-chip">รอบ ${escHtml(String(m.round || '?'))}</span>
        ${isLive ? courtSelectHtml(m) : courtPillHtml(m)}${bad}
        <span class="am-state">${state}${isLive ? matchStatusHtml(m) : ''}${ump}</span>
      </div>
      <div class="am-teams">
        <div class="am-side"><span class="ds-team ds-team-red">RED</span><span class="am-names">${formatTeamNames(m.redNames)}</span></div>
        <div class="am-side"><span class="ds-team ds-team-blue">BLUE</span><span class="am-names">${formatTeamNames(m.blueNames)}</span></div>
      </div>
      <div class="am-foot">
        ${isLive ? `<button type="button" class="ds-btn ds-btn-sm" onclick="adminReleaseMatch('${m.id}')" title="ให้กรรมการหลุดจากแมตช์นี้ แล้วกลับเข้าคิว">${dsIcon('arrow-counter-clockwise')}ปล่อยแมตช์</button>` : ''}
        ${corrupt ? '' : `<button type="button" class="ds-btn ds-btn-sm am-force" onclick="openResultModal('${m.id}')">${dsIcon('pencil-simple')}ใส่ผลเอง</button>`}
        <button type="button" class="ds-btn ds-btn-sm ds-btn-danger am-del" onclick="removeOngoingMatch('${m.id}')">${dsIcon('trash')}ลบ</button>
      </div>
    </article>`;
  }).join('');
}

// ── FINISHED RESULT FILTER ──
let _finishedResultFilter = '';
function setFinishedResultFilter(val) {
  _finishedResultFilter = val;
  ['frAll','frRed','frDraw','frBlue'].forEach(id => { const b = document.getElementById(id); if (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); } });
  const map = { '':'frAll', 'red':'frRed', 'draw':'frDraw', 'blue':'frBlue' };
  const on = document.getElementById(map[val]);
  if (on) { on.classList.add('active'); on.setAttribute('aria-pressed', 'true'); }
  renderFinishedMatches();
}

// A tag (Epic Comeback, The Gladiators …) is stored with an emoji in its label: the chip draws an icon by tag id instead
// and leaves the glyph off the shown text (the stored label is untouched). Used by the finished rows and the result pop-up.
const TAG_ICON = { clutch: 'target', marathon: 'timer', rollercoaster: 'chart-line-up', blowout: 'lightning' };
function _tagIconName(id) {
  id = String(id || '');
  return id.indexOf('epic') === 0 ? 'fire' : id.indexOf('flawless') === 0 ? 'star' : (TAG_ICON[id] || '');
}
function _tagChipHtml(t, cls) {
  const raw = String(t.label || t.id || '');
  const label = raw.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '') || raw;
  const ic = _tagIconName(t.id);
  return `<span class="${cls || 'finished-tag'} ${t.class || 'tag-normal'}">${ic ? dsIcon(ic) : ''}${escHtml(label)}</span>`;
}

function renderFinishedMatches() {
  const container = document.getElementById('finishedMatchesGrid');
  if (!container) return;
  const search = (document.getElementById('finishedSearch')?.value||'').toLowerCase();
  const round  = document.getElementById('finishedFilterRound')?.value||'';
  const matches = appState.matchHistory.filter(m => {
    // "only my matches" — a player should not scroll 39 rows to find themselves
    if (typeof meFilterActive === 'function' && meFilterActive() && !matchHasMe(m)) return false;
    if (search && !m.redNames.toLowerCase().includes(search) && !m.blueNames.toLowerCase().includes(search) && !m.id.toLowerCase().includes(search)) return false;
    if (round && m.round !== round) return false;
    if (_finishedResultFilter === 'red'  && m.rStat !== 'W') return false;
    if (_finishedResultFilter === 'blue' && m.bStat !== 'W') return false;
    if (_finishedResultFilter === 'draw' && m.rStat !== 'D') return false;
    return true;
  }).slice().reverse();

  if (!matches.length) {
    const none = appState.matchHistory.length === 0;
    container.innerHTML = `<div class="fin-empty ds-empty">
      <div class="ds-empty-art">${dsMascot(none ? 'serve' : 'search')}</div>
      <div class="ds-empty-title">${none ? 'ยังไม่มีแมตช์ที่จบแล้ว' : 'ไม่พบแมตช์ที่ตรงกับที่ค้นหา'}</div>
      <div class="ds-empty-text">${none ? 'ผลจะขึ้นที่นี่เมื่อแมตช์จบ' : 'ลองล้างคำค้นหาหรือตัวกรอง'}</div>
    </div>`;
    return;
  }

  // One row per match: the two sides as two lines (red above blue, as in the umpire app) with their scores per game on
  // the right; the side that won reads brighter, the game a side won reads brighter. No faces: the owner took them off
  // the results log — they stay on live cards, the TV, the umpire app and the directory.
  const names = namesStr => (namesStr || '').split(' & ').map(n => escHtml(stripGroup(n.trim()))).join(' <i>&amp;</i> ');
  container.innerHTML = matches.map(m => {
    const isRedWin = m.rStat === 'W', isBlueWin = m.bStat === 'W';
    const cls = isRedWin ? 'red' : isBlueWin ? 'blue' : 'draw';
    const result = isRedWin ? `<i class="tsh tsh-red" aria-hidden="true"></i>ทีมแดงชนะ` : isBlueWin ? `<i class="tsh tsh-blue" aria-hidden="true"></i>ทีมน้ำเงินชนะ` : 'เสมอ';
    const [g1r, g1b] = (m.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (m.game2 || '0:0').split(':').map(Number);
    const g2played = g2r > 0 || g2b > 0;
    const cell = (mine, theirs) => `<span class="fm-g${mine > theirs ? ' w' : ''}">${mine}</span>`;
    const side = (sideCls, namesStr, win, a1, b1, a2, b2) => `
      <div class="fm-team ${sideCls}${win ? ' win' : ''}">
        <span class="fm-name"><i class="tsh tsh-${sideCls}" aria-hidden="true"></i><span>${names(namesStr)}</span></span>
        ${cell(a1, b1)}${g2played ? cell(a2, b2) : ''}
      </div>`;

    const tags = (m.analysis?.tags || []).slice(0, 3).map(t => _tagChipHtml(t, 'finished-tag')).join('');
    const umpire = m.umpire ? `<span class="fm-ump">${dsIcon('user')}<span>${escHtml(m.umpire)}</span></span>` : '';
    let admin = '';
    if (userRole === 'admin' || userRole === 'superadmin') {
      const tagsBtn = `<button type="button" class="fm-act" onclick="openEditTagsModal('${m.id}')" title="แก้ Tags" aria-label="แก้ Tags ของ ${escHtml(m.id)}">${dsIcon('medal')}</button>`;
      const editBtn = userRole === 'superadmin' ? `<button type="button" class="fm-act" onclick="openEditResult('${m.id}')" title="แก้ผล" aria-label="แก้ผล ${escHtml(m.id)}">${dsIcon('pencil-simple')}</button>` : '';
      const delBtn  = userRole === 'superadmin' ? `<button type="button" class="fm-act del" onclick="deleteFinishedMatch('${m.id}')" title="ลบ" aria-label="ลบ ${escHtml(m.id)}">${dsIcon('trash')}</button>` : '';
      admin = `<span class="fm-admin">${tagsBtn}${editBtn}${delBtn}</span>`;
    }
    const foot = (tags || umpire || admin)
      ? `<footer class="fm-foot"><span class="fm-tags">${tags}</span><span class="fm-meta">${umpire}${admin}</span></footer>` : '';

    const mineCls = (typeof matchHasMe === 'function' && matchHasMe(m)) ? ' is-mine' : '';
    return `<article class="fm ${cls}${mineCls}">
      <header class="fm-head">
        <span class="fm-id">${escHtml(m.id)}</span>
        <span class="fm-round">รอบ ${escHtml(String(m.round))}</span>
        <span class="fm-result ${cls}">${result}</span>
      </header>
      <div class="fm-body${g2played ? ' g2' : ''}">
        <div class="fm-cols" aria-hidden="true"><span></span><span>เกม 1</span>${g2played ? '<span>เกม 2</span>' : ''}</div>
        ${side('red', m.redNames, isRedWin, g1r, g1b, g2r, g2b)}
        ${side('blue', m.blueNames, isBlueWin, g1b, g1r, g2b, g2r)}
      </div>
      ${foot}
    </article>`;
  }).join('');
}

