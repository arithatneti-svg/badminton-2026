// ============================================================
// Match time & status — shared by the scoreboard app and the umpire app.
// Pure functions (no DOM), unit-tested by scripts/test-match-time.mjs.
//
// A match has three stages:
//   queue   — no umpire yet
//   ready   — an umpire claimed it (and chose a court) but no point is scored: "พร้อมแข่ง"
//   playing — the first point has been scored (timerStartedAt is set at that moment;
//             matches claimed before this existed have it from the claim — they count as playing)
// ============================================================

// m:ss, or h:mm:ss from one hour on. It used to stop at 60:00, so a match that had been
// open for hours looked like it had only just reached an hour.
function formatTimer(ms) {
  ms = Math.max(0, Number(ms) || 0);
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function matchStage(m) {
  if (!m || !m.umpire) return 'queue';
  return m.timerStartedAt ? 'playing' : 'ready';
}

// How long a match has really been PLAYED: from its first point, minus the time it was
// paused. This is what gets stored as the match duration (and feeds the Marathon award) —
// it used to be "time since the umpire claimed it", which counted waiting and breaks.
function matchPlayMs(m, now) {
  now = now || Date.now();
  if (!m || !m.timerStartedAt) return 0;
  const lv = m.live || {};
  const pausedNow = lv.isPaused && lv.pauseStartedAt ? Math.max(0, now - lv.pauseStartedAt) : 0;
  return Math.max(0, now - m.timerStartedAt - (Number(lv.totalPauseMs) || 0) - pausedNow);
}

// last sign of life of a claimed match: its last point (live.lastAt), else when it started,
// else when it was claimed; 0 when there is none (a queued match)
function matchLastActivityAt(m) {
  if (!m) return 0;
  const lv = m.live || {};
  return Number(lv.lastAt) || Number(m.timerStartedAt) || Number(m.claimedAt) || 0;
}
function matchIdleMs(m, now) {
  const t = matchLastActivityAt(m);
  return t ? Math.max(0, (now || Date.now()) - t) : 0;
}

// a claimed match with no point (or a pause) for this long gets a "no activity" tag
const MATCH_IDLE_WARN_MS = 10 * 60 * 1000;

// "12 นาที" · "2 ชม." · "3 วัน"
function fmtAgo(ms) {
  const mins = Math.floor(Math.max(0, ms) / 60000);
  if (mins < 60) return Math.max(1, mins) + ' นาที';
  const h = Math.floor(mins / 60);
  return h < 24 ? h + ' ชม.' : Math.floor(h / 24) + ' วัน';
}

// the tag a claimed match wears when something looks off, or '' when all is well:
// "พักเกม" (paused; with how long once that is long) · "ไม่มีความเคลื่อนไหว 12 นาที"
function matchStatusTag(m, now) {
  if (matchStage(m) === 'queue') return '';
  now = now || Date.now();
  const lv = m.live || {};
  if (lv.isPaused) {
    const p = lv.pauseStartedAt ? now - lv.pauseStartedAt : 0;
    return 'พักเกม' + (p >= MATCH_IDLE_WARN_MS ? ' · ' + fmtAgo(p) : '');
  }
  const idle = matchIdleMs(m, now);
  return idle >= MATCH_IDLE_WARN_MS ? 'ไม่มีความเคลื่อนไหว ' + fmtAgo(idle) : '';
}

// looks abandoned: paused for a long time, or silent for a long time
function matchLooksStuck(m, now) {
  if (matchStage(m) === 'queue') return false;
  now = now || Date.now();
  const lv = m.live || {};
  if (lv.isPaused) return !!lv.pauseStartedAt && now - lv.pauseStartedAt >= MATCH_IDLE_WARN_MS;
  return matchIdleMs(m, now) >= MATCH_IDLE_WARN_MS;
}

function courtLabel(m) {
  return m && m.court ? 'คอร์ต ' + m.court : '';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatTimer, matchStage, matchPlayMs, matchLastActivityAt, matchIdleMs, MATCH_IDLE_WARN_MS, fmtAgo, matchStatusTag, matchLooksStuck, courtLabel };
}
