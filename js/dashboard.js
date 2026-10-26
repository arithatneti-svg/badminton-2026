// ── DASHBOARD & CHARTS (Admin) ──
// Every colour on a canvas is read from the design tokens at draw time (dbTokens), so a token change repaints the
// charts too. A chart is never the only carrier of its numbers: each has a legend (team = word + shape), an
// aria-label and a screen-reader sentence. Canvas text is 12 px and up.

function dbTokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  return { red: v('--red'), blue: v('--blue'), gold: v('--gold'), hi: v('--t-hi'), mid: v('--t-mid'), low: v('--t-low'), line: v('--line-strong'), bg: v('--bg'), font: v('--font-ui') };
}
// the canvas is drawn at the pixel size of its box (CSS owns the size); returns a 2D context in CSS pixels
function dbPrepCanvas(canvas) {
  const box = canvas.parentElement;
  const W = Math.floor(box.clientWidth) || 320, H = Math.floor(box.clientHeight) || 220;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
// the two team shapes on a canvas: circle = red, diamond = blue (the same as .ds-team)
function dbShape(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === 'red') ctx.arc(x, y, r, 0, Math.PI * 2);
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); }
}

function renderDashboard() {
  const hist = appState.matchHistory || [];
  const total = hist.length, ongoing = (appState.ongoingMatches || []).length;
  const rWins = hist.filter(m => m.rStat==='W').length, bWins = hist.filter(m => m.bStat==='W').length, draws = hist.filter(m => m.rStat==='D').length;
  const rScore = appState.globalScoreRed || 0, bScore = appState.globalScoreBlue || 0;
  const lead = rScore > bScore ? 'red' : bScore > rScore ? 'blue' : 'draw';
  renderRecentMatches();
  const kpi = (cls, label, value, sub) => `<div class="db-kpi ${cls}"><div class="db-kpi-l">${label}</div><div class="db-kpi-v">${value}</div><div class="db-kpi-s">${sub}</div></div>`;
  document.getElementById('dbKpiRow').innerHTML =
    kpi('is-matches', 'แมตช์เสร็จ', total, `${ongoing} กำลังแข่ง`) +
    kpi('is-red', 'คะแนน <span class="ds-team ds-team-red">RED</span>', rScore, `${rWins} ชนะ`) +
    kpi('is-lead' + (lead === 'draw' ? '' : ' lead-' + lead), 'ผู้นำ', lead === 'draw' ? 'เสมอ' : rpTeamTag(lead === 'red' ? 'Red' : 'Blue'), `ห่าง ${Math.abs(rScore - bScore)} คะแนน`) +
    kpi('is-blue', 'คะแนน <span class="ds-team ds-team-blue">BLUE</span>', bScore, `${bWins} ชนะ`) +
    kpi('is-draws', 'เสมอ', draws, 'แมตช์');
  renderMomentumChart(); renderTopPlayers(); renderMatchDist();
  renderRawScoreChart(); renderDurationStats();
}

// the charts are drawn at the size of their box: redraw when it changes (rotate a phone, resize a window)
let _dbResizeT;
window.addEventListener('resize', () => {
  clearTimeout(_dbResizeT);
  _dbResizeT = setTimeout(() => {
    const d = document.getElementById('dashboard');
    if (d && d.classList.contains('active') && typeof appState !== 'undefined' && appState && appState.matchHistory) { renderMomentumChart(); renderRawScoreChart(); }
  }, 150);
});

/* ── RAW SCORE BATTLE ── */
function renderRawScoreChart() {
  const kpiEl    = document.getElementById('dbRawScoreKpi');
  const canvas   = document.getElementById('rawScoreChart');
  const emptyEl  = document.getElementById('rawScoreEmpty');
  const textEl   = document.getElementById('rawScoreText');
  if (!kpiEl || !canvas) return;

  const history = appState.matchHistory;
  if (history.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    dbPrepCanvas(canvas);
    kpiEl.innerHTML = '';
    if (textEl) textEl.textContent = '';
    return;
  }
  if (emptyEl) emptyEl.hidden = true;

  // คะแนนดิบสะสม (ผลรวม g1+g2 ของแต่ละทีม)
  let totalRawRed = 0, totalRawBlue = 0;
  const perMatch = history.map(m => {
    const [g1r, g1b] = (m.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (m.game2 || '0:0').split(':').map(Number);
    const rawR = g1r + g2r, rawB = g1b + g2b;
    totalRawRed  += rawR;
    totalRawBlue += rawB;
    return { id: m.id, rawR, rawB };
  });

  const rawDiff = totalRawRed - totalRawBlue;
  const rawLeader = rawDiff > 0 ? 'RED นำ' : rawDiff < 0 ? 'BLUE นำ' : 'เท่ากัน';

  // mini tiles: the two totals and the gap
  const mini = (cls, label, value, sub) => `<div class="${cls}"><div class="db-mini-l">${label}</div><div class="db-mini-v">${value}</div>${sub ? `<div class="db-mini-s">${sub}</div>` : ''}</div>`;
  kpiEl.innerHTML =
    mini('is-red', '<span class="ds-team ds-team-red">RED</span> รวม', totalRawRed) +
    mini('is-blue', '<span class="ds-team ds-team-blue">BLUE</span> รวม', totalRawBlue) +
    mini('is-gold', 'ห่าง', Math.abs(rawDiff), rawLeader);

  // grouped bars: red then blue for every finished match
  const t = dbTokens();
  const { ctx, W, H } = dbPrepCanvas(canvas);
  const pad = { t: 14, r: 8, b: 30, l: 34 };
  const W2 = W - pad.l - pad.r, H2 = H - pad.t - pad.b;
  const n  = perMatch.length;
  const maxVal = Math.max(...perMatch.map(d => Math.max(d.rawR, d.rawB)), 1);

  ctx.font = `600 12px ${t.font}`;
  // grid + y axis
  [0, 0.5, 1].forEach(f => {
    const y = pad.t + H2 * (1 - f);
    ctx.strokeStyle = t.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y + .5); ctx.lineTo(pad.l + W2, y + .5); ctx.stroke();
    ctx.fillStyle = t.low; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(maxVal * f), pad.l - 6, y);
  });

  const slotW = W2 / n;
  const barW  = Math.max(Math.min(slotW * 0.38, 18), 2);
  const gap   = slotW > 8 ? 1 : 0;
  const bar = (x, h, color) => {
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, pad.t + H2 - h, barW, h, [2, 2, 0, 0]); else ctx.rect(x, pad.t + H2 - h, barW, h);
    ctx.fill();
  };
  perMatch.forEach((d, i) => {
    const cx = pad.l + (i + 0.5) * slotW;
    bar(cx - barW - gap / 2, (d.rawR / maxVal) * H2, t.red);
    bar(cx + gap / 2, (d.rawB / maxVal) * H2, t.blue);
  });
  // x labels: as many as fit without touching (a label is about 34 px wide)
  const every = Math.max(1, Math.ceil(34 / slotW));
  ctx.fillStyle = t.low; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  perMatch.forEach((d, i) => { if (i % every === 0) ctx.fillText(d.id, pad.l + (i + 0.5) * slotW, pad.t + H2 + 20); });

  const sentence = `คะแนนดิบรวม ${n} แมตช์: RED ${totalRawRed} · BLUE ${totalRawBlue} · ${rawDiff === 0 ? 'เท่ากัน' : 'ห่าง ' + Math.abs(rawDiff) + ' (' + rawLeader + ')'}`;
  canvas.setAttribute('aria-label', sentence);
  if (textEl) textEl.textContent = sentence + '. ' + perMatch.map(d => `${d.id}: RED ${d.rawR}, BLUE ${d.rawB}`).join('; ');
}

/* ── MATCH DURATION STATS ── */
function renderDurationStats() {
  const kpiEl  = document.getElementById('dbDurationKpi');
  const listEl = document.getElementById('dbDurationList');
  if (!kpiEl || !listEl) return;

  const history = appState.matchHistory;
  if (history.length === 0) {
    kpiEl.innerHTML  = '';
    listEl.innerHTML = `<div class="db-empty-block">${dsIcon('timer', { cls: 'ds-ic-lg' })}<span>ยังไม่มีข้อมูล</span></div>`;
    return;
  }

  const withDur  = history.filter(m => m.duration > 0);
  const avgMs    = withDur.length > 0 ? withDur.reduce((s, m) => s + m.duration, 0) / withDur.length : 0;
  const maxM     = withDur.length > 0 ? withDur.reduce((a, b) => a.duration > b.duration ? a : b) : null;
  const minM     = withDur.length > 0 ? withDur.reduce((a, b) => a.duration < b.duration ? a : b) : null;

  const mini = (cls, label, value, sub) => `<div class="${cls}"><div class="db-mini-l">${label}</div><div class="db-mini-v">${value}</div>${sub ? `<div class="db-mini-s">${sub}</div>` : ''}</div>`;
  kpiEl.innerHTML =
    mini('is-gold', 'เฉลี่ย/แมตช์', avgMs > 0 ? formatTimer(avgMs) : '–', '') +
    mini('', 'นานสุด', maxM ? formatTimer(maxM.duration) : '–', maxM ? maxM.id : '') +
    mini('', 'สั้นสุด', minM ? formatTimer(minM.duration) : '–', minM ? minM.id : '');

  // Per-match duration list (newest first). The bar is the share of the longest match; the colour only grades it.
  const maxDur = withDur.length > 0 ? Math.max(...withDur.map(m => m.duration)) : 1;
  listEl.innerHTML = [...history].reverse().map(m => {
    const dur = m.duration > 0 ? m.duration : 0;
    const durStr = dur > 0 ? formatTimer(dur) : '–';
    const pct = maxDur > 0 && dur > 0 ? (dur / maxDur * 100) : 0;
    const mins = dur / 60000;
    const grade = mins >= 30 ? 'is-long' : mins >= 20 ? 'is-mid' : mins > 0 ? '' : 'is-none';
    const mark = m.rStat === 'W' ? 'is-red' : m.bStat === 'W' ? 'is-blue' : '';
    return `<div class="db-dur-row ${grade}">
      <div class="db-dur-id"><i class="rp-mark ${mark}"></i>${m.id}</div>
      <div class="db-dur-bar"><i style="--w:${pct}%"></i></div>
      <div class="db-dur-t">${durStr}</div>
    </div>`;
  }).join('');
}

/* ── POINTS CHART (Reports > Players fold): the 20 best by PTS, one ranked bar each ── */
function renderChart(playerArr) {
  const chart = document.getElementById('statsChart');
  if (!chart) return;
  // same order as the leaderboard: PTS, then point difference, then game wins
  const top = [...playerArr].filter(p => p.pts > 0).sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff || b.w - a.w).slice(0, 20);
  if (top.length === 0) {
    chart.setAttribute('role', 'group');
    chart.innerHTML = rpEmptyHtml('ยังไม่มีคะแนน', 'กราฟจะขึ้นเมื่อมีแมตช์ที่จบแล้ว');
    return;
  }
  const maxPts = Math.max(...top.map(p => p.pts));
  chart.setAttribute('role', 'list');
  chart.innerHTML = top.map((p, i) => {
    const red = p.team === 'Red', cls = red ? 'is-red' : 'is-blue';
    return `<div class="rp-chart-row" role="listitem">
      <span class="rp-chart-rank">${i + 1}</span>
      <span class="rp-chart-name"><i class="rp-mark ${cls}"></i><span><span class="ds-sr-only">${red ? 'แดง' : 'น้ำเงิน'} </span>${escHtml(p.name)}</span></span>
      <span class="rp-chart-track"><span class="rp-chart-bar ${cls}" style="--w:${Math.max(p.pts / maxPts * 100, 2)}%"></span></span>
      <b class="rp-chart-val">${p.pts}</b>
    </div>`;
  }).join('');
}

// Cumulative points, Red vs Blue, one point per finished match.
// With ~40 matches a label per point turns into a grey smear, so labels
// and dots thin out as the season grows; the two end values are always
// drawn because "who is ahead right now" is the whole question.
function renderMomentumChart() {
  const canvas = document.getElementById('momentumChart');
  const emptyEl = document.getElementById('momentumEmpty');
  const textEl = document.getElementById('momentumText');
  if (!canvas) return;
  const t = dbTokens();
  const { ctx, W, H } = dbPrepCanvas(canvas);

  if (appState.matchHistory.length === 0) { if (emptyEl) emptyEl.hidden = false; if (textEl) textEl.textContent = ''; return; }
  if (emptyEl) emptyEl.hidden = true;

  let rC = 0, bC = 0;
  const pts = [{ r: 0, b: 0 }];
  appState.matchHistory.forEach(m => { rC += m.pRed; bC += m.pBlue; pts.push({ r: rC, b: bC }); });
  const n = pts.length;
  const maxV = Math.max(...pts.map(p => Math.max(p.r, p.b)), 1);

  // right padding leaves room for the two end-value pills
  const pad = { t: 14, r: 52, b: 30, l: 34 };
  const W2 = W - pad.l - pad.r, H2 = H - pad.t - pad.b;
  const px = i => pad.l + (i / (n - 1 || 1)) * W2;
  const py = v => pad.t + H2 - (v / maxV) * H2;

  ctx.font = `600 12px ${t.font}`;
  // grid + y axis
  [0, 0.5, 1].forEach(f => {
    const y = pad.t + H2 * (1 - f);
    ctx.strokeStyle = t.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, Math.round(y) + .5); ctx.lineTo(pad.l + W2, Math.round(y) + .5); ctx.stroke();
    ctx.fillStyle = t.low; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(maxV * f), pad.l - 6, y);
  });

  // dots only while they still read as separate points; the head of each line is always marked
  const showDots = n <= 16;
  const drawLine = (color, kind, key) => {
    ctx.beginPath();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(px(i), py(p[key])) : ctx.lineTo(px(i), py(p[key])));
    ctx.stroke();
    ctx.fillStyle = color;
    (showDots ? pts.map((p, i) => i) : [n - 1]).forEach(i => { dbShape(ctx, kind, px(i), py(pts[i][key]), i === n - 1 ? 5 : 3.4); ctx.fill(); });
  };
  drawLine(t.red, 'red', 'r');
  drawLine(t.blue, 'blue', 'b');

  // x labels: aim for ~6 ticks whatever the match count
  const step = Math.max(1, Math.ceil((n - 1) / 6));
  ctx.fillStyle = t.low; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < n; i += step) {
    ctx.fillText(i === 0 ? 'Start' : 'M' + i, Math.min(Math.max(px(i), pad.l + 14), W - 16), pad.t + H2 + 20);
  }
  // always label the final match, unless the step already landed on it
  const prevTick = Math.floor((n - 1) / step) * step;
  if (prevTick !== n - 1 && px(n - 1) - px(prevTick) >= 36) ctx.fillText('M' + (n - 1), px(n - 1), pad.t + H2 + 20);

  // end-value pills — nudged apart when the two lines finish close together, and kept inside the canvas
  let yR = py(pts[n - 1].r), yB = py(pts[n - 1].b);
  const upper = yR <= yB ? 'r' : 'b';
  let yHi = Math.max(Math.min(yR, yB), 11), yLo = Math.max(Math.max(yR, yB), yHi + 22);
  if (yLo > pad.t + H2) { yLo = pad.t + H2; yHi = Math.min(yHi, yLo - 22); }
  yR = upper === 'r' ? yHi : yLo; yB = upper === 'r' ? yLo : yHi;
  const pill = (y, color, text) => {
    const w = Math.max(30, ctx.measureText(text).width + 14), x = W - pad.r + 10;
    ctx.fillStyle = color; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y - 10, w, 20, 10); else ctx.rect(x, y - 10, w, 20);
    ctx.fill();
    ctx.fillStyle = t.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 12px ${t.font}`;
    ctx.fillText(text, x + w / 2, y + .5);
  };
  pill(yR, t.red, String(pts[n - 1].r));
  pill(yB, t.blue, String(pts[n - 1].b));

  const sentence = `คะแนนสะสมหลัง ${n - 1} แมตช์: RED ${pts[n - 1].r} · BLUE ${pts[n - 1].b}`;
  canvas.setAttribute('aria-label', sentence);
  if (textEl) textEl.textContent = sentence + '. ' + pts.slice(1).map((p, i) => `M${i + 1}: RED ${p.r}, BLUE ${p.b}`).join('; ');
}

function renderTopPlayers() {
  const el = document.getElementById('dbTopPlayers');
  if (!el) return;
  const stats = {};
  appState.players.forEach(p => { stats[p.id] = { ...p, pts: 0, w: 0, total: 0 }; });
  appState.matchHistory.forEach(h => {
    [h.r1, h.r2].forEach(id => { if (stats[id]) { stats[id].pts += h.pRed; if (h.rStat === 'W') stats[id].w++; stats[id].total++; } });
    [h.b1, h.b2].forEach(id => { if (stats[id]) { stats[id].pts += h.pBlue; if (h.bStat === 'W') stats[id].w++; stats[id].total++; } });
  });
  const top = Object.values(stats).filter(p => p.pts > 0).sort((a, b) => b.pts - a.pts || b.w - a.w).slice(0, 8);
  if (top.length === 0) {
    el.innerHTML = `<div class="db-empty-block">${dsIcon('star', { cls: 'ds-ic-lg' })}<span>ยังไม่มีข้อมูล</span></div>`;
    return;
  }
  const maxPts = top[0].pts;
  el.innerHTML = `<ol class="db-top">${top.map((p, i) => {
    const red = p.team === 'Red';
    const wr = p.total > 0 ? Math.round(p.w / p.total * 100) : 0;
    return `<li class="db-top-row ${red ? 'is-red' : 'is-blue'}">
      <span class="db-top-rank${i < 3 ? ' is-top' : ''}"><span class="ds-sr-only">อันดับ </span>${i + 1}</span>
      <div class="db-top-main">
        <b class="db-top-name">${escHtml(p.name)}</b>
        <span class="db-top-sub">${rpTeamTag(p.team)}<span>G${p.group}</span><span>WR ${wr}%</span></span>
        <div class="ds-bar" aria-hidden="true"><i style="width:${Math.round(p.pts / maxPts * 100)}%"></i></div>
      </div>
      <span class="db-top-pts"><b>${p.pts}</b><i>PTS</i></span>
    </li>`;
  }).join('')}</ol>`;
}

// how close the finished matches were: win types on top, draw types below (the status names are the stored ones)
function renderMatchDist() {
  const el = document.getElementById('dbMatchDist');
  if (!el) return;
  const groups = [
    { h: 'ผลแพ้ชนะ', keys: ['Evenly Matched', 'Competitive Edge', 'Superior', 'Outclassed'] },
    { h: 'ผลเสมอ',   keys: ['True Tie', 'Close Encounter', 'Deceptive Draw'] },
  ];
  const analyzed = appState.matchHistory.filter(m => m.analysis);
  if (analyzed.length === 0) {
    el.innerHTML = `<div class="db-empty-block">${dsIcon('chart-bar', { cls: 'ds-ic-lg' })}<span>ยังไม่มีข้อมูล</span></div>`;
    return;
  }
  const counts = {};
  analyzed.forEach(m => { counts[m.analysis.status] = (counts[m.analysis.status] || 0) + 1; });
  const maxC = Math.max(...Object.values(counts), 1);
  el.innerHTML = `<div class="db-dist">${groups.map(g => `<div class="db-dist-group" role="group" aria-label="${g.h}">
    <div class="db-dist-h">${g.h}</div>
    ${g.keys.map(k => { const c = counts[k] || 0; return `<div class="db-dist-row ${RP_QUALITY[k]}${c ? '' : ' is-zero'}">
      <span class="db-dist-l">${k}</span>
      <span class="db-dist-bar" aria-hidden="true"><i style="--w:${c ? Math.max(c / maxC * 100, 4) : 0}%"></i></span>
      <b class="db-dist-n">${c}</b>
    </div>`; }).join('')}
  </div>`).join('')}</div>`;
}

function renderRecentMatches() {
  const el = document.getElementById('dbRecentMatches');
  if (!el) return;
  const recent = [...appState.matchHistory].reverse().slice(0, 8);
  if (recent.length === 0) {
    el.innerHTML = `<div class="db-empty-block">${dsIcon('flag', { cls: 'ds-ic-lg' })}<span>ยังไม่มีแมตช์ที่จบ</span></div>`;
    return;
  }
  el.innerHTML = `<div class="db-recent">${recent.map(m => {
    const res = (m.result || '').replace(/[🔴🔵🤝]/g, '').trim();
    const resCls = m.rStat === 'W' ? 'is-red' : m.bStat === 'W' ? 'is-blue' : '';
    const team = (cls, word, names, side) => `<span class="rp-mteam ${cls}"><i class="rp-mark ${cls}"></i>` +
      `<span class="rp-mnames"><span class="ds-sr-only">${word} </span>${escHtml(names)}</span>${rpGameCells(m.game1, side)}${rpGameCells(m.game2, side)}</span>`;
    const tags = m.analysis && m.analysis.tags ? m.analysis.tags : [];
    return `<div class="db-r-item">
      <div class="db-r-head">
        <span class="db-r-id">${m.id}</span><span class="db-r-round">รอบ ${escHtml(m.round)}</span>
        <span class="rp-mres ${resCls}">${escHtml(res)}</span>
      </div>
      <div class="rp-mteams">${team('is-red', 'แดง', m.redNames, 0)}${team('is-blue', 'น้ำเงิน', m.blueNames, 1)}</div>
      ${tags.length ? `<div class="db-r-tags">${tags.slice(0, 3).map(rpTagChip).join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

let _selectedTagFilters = new Set();

// the chips under the Matches toolbar; the ids are the ones stored in analysis.tags
const TAG_FILTER_OPTIONS = [
  { id: 'epic_blue_g1', label: 'Epic Comeback เกม 1 Blue' },
  { id: 'epic_red_g1',  label: 'Epic Comeback เกม 1 Red' },
  { id: 'epic_blue_g2', label: 'Epic Comeback เกม 2 Blue' },
  { id: 'epic_red_g2',  label: 'Epic Comeback เกม 2 Red' },
  { id: 'clutch',       label: 'The Gladiators' },
  { id: 'marathon',     label: 'Marathon Match' },
  { id: 'rollercoaster',label: 'Rollercoaster' },
  { id: 'blowout',      label: 'ยำใหญ่ (Blowout)' },
  { id: 'flawless_red', label: 'Flawless Red' },
  { id: 'flawless_blue',label: 'Flawless Blue' },
];

function renderTagFilterPills() {
  const row = document.getElementById('perfTagFilterRow');
  if (!row) return;
  const fold = document.getElementById('rpTagFold'), count = document.getElementById('rpTagCount');

  // เช็คว่า tag ไหนมีข้อมูลจริงใน matchHistory
  const usedTagIds = new Set();
  appState.matchHistory.forEach(m => {
    if (m.analysis && m.analysis.tags) m.analysis.tags.forEach(t => usedTagIds.add(t.id));
  });

  const available = TAG_FILTER_OPTIONS.filter(t => usedTagIds.has(t.id));
  if (fold) fold.hidden = available.length === 0;     // no tags in the data = no folder either
  if (count) {                                         // how many chips are on, visible while the folder is closed
    count.hidden = _selectedTagFilters.size === 0;
    count.textContent = _selectedTagFilters.size;
    count.setAttribute('aria-label', 'เลือกอยู่ ' + _selectedTagFilters.size);
  }
  if (available.length === 0) { row.innerHTML = ''; return; }

  const pills = available.map(t => {
    const on = _selectedTagFilters.has(t.id);
    return `<button type="button" class="ds-chip is-btn rp-tagpill${on ? ' is-on' : ''}" aria-pressed="${on}" onclick="toggleTagFilter('${t.id}')">${dsIcon(rpTagIcon(t.id), { size: 16 })}${t.label}</button>`;
  }).join('');

  const clearBtn = _selectedTagFilters.size > 0
    ? `<button type="button" class="ds-chip is-btn rp-tagpill rp-tagclear" onclick="clearTagFilters()">${dsIcon('x', { size: 16 })}ล้างทั้งหมด</button>`
    : '';

  row.innerHTML = pills + clearBtn;
}

function toggleTagFilter(tagId) {
  if (_selectedTagFilters.has(tagId)) _selectedTagFilters.delete(tagId);
  else _selectedTagFilters.add(tagId);
  renderTagFilterPills();
  renderMatchesPanel();
}

function clearTagFilters() {
  _selectedTagFilters.clear();
  renderTagFilterPills();
  renderMatchesPanel();
}
