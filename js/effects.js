// Print = the players table plus the round-grouped match list, taken from the Reports tab as drawn. The print window
// has its own light stylesheet; the screen markup is cleaned first (icons, sort buttons and the expanding
// detail panels are screen things, and an svg without the sprite would print as an empty box).
function printReport() {
  if (typeof renderMatchesPanel === 'function') renderMatchesPanel();
  const clean = (html) => {
    const d = document.createElement('div'); d.innerHTML = html;
    d.querySelectorAll('.rp-tag[title]').forEach(t => { t.textContent = t.getAttribute('title'); });   // an icon cannot print: say the tag
    d.querySelectorAll('svg, .sort-icon, .rp-caret, .rp-mdetail, .rp-mrow-q, .ds-sr-only, .ds-bar').forEach(e => e.remove());
    d.querySelectorAll('button').forEach(b => { const s = document.createElement('span'); s.className = b.className; s.innerHTML = b.innerHTML; b.replaceWith(s); });
    d.querySelectorAll('[onclick]').forEach(e => e.removeAttribute('onclick'));
    return d.innerHTML;
  };
  const statsHtml = clean(document.getElementById('playerStatsTable')?.outerHTML || '');
  const histHtml = clean(document.getElementById('matchesPanelContent')?.innerHTML || '');
  const css = `
    *{box-sizing:border-box} body{font-family:'Noto Sans Thai','Leelawadee UI',Tahoma,Arial,sans-serif;padding:24px;color:#111;font-size:13px}
    h1{text-align:center;margin:0 0 4px} h2{color:#111;border-bottom:2px solid #f0c040;padding-bottom:8px;margin-top:32px}
    table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px;table-layout:auto}
    th{background:#1a1a1a;color:#f0c040;padding:7px 8px;text-align:left;font-size:11px;white-space:nowrap} td{padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:middle}
    th.is-num,td.is-num{text-align:right} tr:nth-child(even) td{background:#f9f9f9}
    .rp-th,.rp-name-link{font:inherit;color:inherit} .rp-name-link{font-weight:700} .rp-pts{font-weight:800}
    .ds-team{font-weight:700} .ds-team-red{color:#b3262a} .ds-team-blue{color:#1f5fbf}
    .rp-rank{display:inline-block;min-width:18px;margin-right:6px;text-align:center;border-radius:9px;background:#f0c040;font-weight:800}
    .rp-wl{display:inline-flex;gap:6px} .rp-wl i{font-style:normal} .rp-wl i.is-zero{color:#999}
    .rp-wr{display:block} .rp-spec-cell{display:flex;flex-wrap:wrap;gap:4px}
    .rp-tag{display:inline-flex;gap:3px;font-size:11px;border:1px solid #ccc;border-radius:10px;padding:1px 6px}
    .rp-round{margin-top:18px;break-inside:avoid} .rp-round-head{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;border-bottom:2px solid #f0c040;padding-bottom:6px}
    .rp-round-no{margin:0;font-size:15px} .rp-round-no b{font-size:20px;margin-left:6px} .rp-round-tally{display:flex;gap:6px} .rp-round-bar{display:none}
    .ds-chip{display:inline-flex;gap:4px;border:1px solid #ccc;border-radius:10px;padding:1px 8px;font-size:11px}
    .rp-mrow{display:grid;grid-template-columns:56px 1fr;gap:2px 10px;width:100%;padding:6px 0;border-bottom:1px solid #eee;font-size:12px}
    .rp-mrow-id{font-weight:800} .rp-mres{justify-self:end;border:1px solid #ccc;border-radius:10px;padding:0 8px;font-size:11px}
    .rp-mteams{grid-column:1/-1;display:grid;gap:2px} .rp-mteam{display:grid;grid-template-columns:14px 1fr 28px 28px;align-items:center}
    .rp-g{text-align:right;color:#777} .rp-g.is-win{color:#111;font-weight:800}
    .rp-mark{display:inline-block;width:8px;height:8px;background:#999} .rp-mark.is-red{background:#e03a3a;border-radius:50%} .rp-mark.is-blue{background:#2f7be0;transform:rotate(45deg) scale(.9)}
    th,.rp-mark,.rp-rank{-webkit-print-color-adjust:exact;print-color-adjust:exact} @media print{button{display:none}}`;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>Badminton Report</title><style>${css}</style></head><body><h1>Badminton Sports Day 2026 — Report</h1><p style="text-align:center;color:#666;">Printed ${new Date().toLocaleString()}</p><h2>Top Players</h2>${statsHtml}<h2>Match History</h2>${histHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ── EFFECTS ──
// A point scored: a short edge flash on the side of the team that scored (red = left edge, blue = right edge).
// 220 ms, low opacity, nothing over the middle of the screen. Called exactly when it was before (js/ui.js).
function flashScore(elId, color) {
  if (!document.getElementById('flash-style')) { const s = document.createElement('style'); s.id = 'flash-style'; s.textContent = '@keyframes flash-fade { from{opacity:.55} to{opacity:0} }'; document.head.appendChild(s); }
  const red = elId.includes('Red');
  const edge = document.createElement('div');
  edge.setAttribute('aria-hidden', 'true');
  edge.style.cssText = `position:fixed; top:0; bottom:0; ${red ? 'left' : 'right'}:0; width:6px; pointer-events:none; z-index:var(--z-overlay); background:${red ? 'var(--red)' : 'var(--blue)'}; animation:flash-fade .22s ease-out forwards;`;
  document.body.appendChild(edge);
  setTimeout(() => edge.remove(), 260);
}
let soundOn = false; const AudioCtx = window.AudioContext || window.webkitAudioContext; let audioCtx = null; function playSound(type) { if (!soundOn || !audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); if (type === 'point') { o.frequency.setValueAtTime(523, audioCtx.currentTime); o.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1); o.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2); g.gain.setValueAtTime(0.18, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5); o.start(); o.stop(audioCtx.currentTime + 0.5); } else if (type === 'match') { o.frequency.setValueAtTime(440, audioCtx.currentTime); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3); o.start(); o.stop(audioCtx.currentTime + 0.3); } }

// ── TROPHY CEREMONY ──
// The cup, the confetti and the staggered reveal are the spectacle and stay. Everything that is a dialog (buttons, stat cards,
// award cards, the MVP lists) is plain classes on the tokens - see css/trophy.css.
function openEndGame() {
  const r = appState.globalScoreRed, b = appState.globalScoreBlue;
  if (r === 0 && b === 0) return showToast('ยังไม่มีคะแนน', 'error');

  const isDraw = r === b, redWins = r > b;
  const result = isDraw ? 'draw' : redWins ? 'red' : 'blue';
  const winTeam = isDraw ? '' : redWins ? 'Red' : 'Blue';
  const winName = isDraw ? "IT'S A DRAW!" : redWins ? 'RED TEAM' : 'BLUE TEAM';

  const stats = getPlayerStats(); // FIX-7d: use shared stats builder
  const everyone = Object.values(stats);

  // หาผู้ชนะในแต่ละหมวด
  const topMVP = (team) => everyone.filter(p => p.team === team && p.pts > 0).sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff || b.w - a.w).slice(0, 5);
  const redTop = topMVP('Red'), blueTop = topMVP('Blue');

  // 🛡️ Toughest Player: d desc → |pointDiff| asc (เข้าใกล้ 0)
  const toughestPlayers = everyone.filter(p => p.d > 0)
    .sort((a,b) => b.d - a.d || Math.abs(a.pointDiff) - Math.abs(b.pointDiff))
    .slice(0, 3);
  // 🔥 Epic Comeback Kings: epicTags desc → w desc → pointDiff desc
  const epicKings = everyone.filter(p => p.epicTags > 0)
    .sort((a,b) => b.epicTags - a.epicTags || b.w - a.w || b.pointDiff - a.pointDiff)
    .slice(0, 3);
  // ⚔️ The Gladiators: clutchTags desc → |pointDiff| asc → d desc
  const gladiators = everyone.filter(p => p.clutchTags > 0)
    .sort((a,b) => b.clutchTags - a.clutchTags || Math.abs(a.pointDiff) - Math.abs(b.pointDiff) || b.d - a.d)
    .slice(0, 3);
  // 🏃‍♂️ Iron Lungs: marathonTags desc → w desc → pointDiff desc
  const ironLungs = everyone.filter(p => p.marathonTags > 0)
    .sort((a,b) => b.marathonTags - a.marathonTags || b.w - a.w || b.pointDiff - a.pointDiff)
    .slice(0, 3);

  const overlay = document.getElementById('trophyOverlay');
  overlay.style.display = 'block';
  overlay.dataset.result = result;                      // the stage colour (css/trophy.css) follows this
  document.getElementById('trophyBg').className = 'is-' + result;
  // the star holds the cup (the champion star; the racket star for a draw), on a podium
  document.getElementById('trophySvgWrap').innerHTML = dsMascot(isDraw ? 'victory' : 'champion', 300, true);

  // ── Broadcast ไปทุก user ผ่าน Firebase remoteCommand ──
  if (userRole === 'admin' || userRole === 'superadmin') {
    appState.remoteCommand = { action: 'SHOW_TROPHY', ts: Date.now() };
    saveData(true);
  }

  document.getElementById('trophyWinnerLabel').innerHTML = `${dsShuttle(22)}<span>${escHtml((document.getElementById('seasonNavTitle') || {}).textContent || 'SPORTS DAY')} · ${isDraw ? 'FINAL' : 'CHAMPION'}</span>`;
  document.getElementById('trophyTeamName').textContent = winName;
  const plate = (cls, n, label) => `<span class="cer-plate ${cls}"><b>${n}</b><small>${label}</small></span>`;
  document.getElementById('trophyScore').innerHTML = `${plate('is-red' + (redWins ? ' is-win' : ''), r, 'RED')}<span class="cer-dash">—</span>${plate('is-blue' + (!isDraw && !redWins ? ' is-win' : ''), b, 'BLUE')}`;

  // a face is the point of a ceremony: the champion team's whole roster, then the MVPs and the special awards all show photos
  const face = (p, size) => avatarHtml(p.id, size, { className: 'cer-pav' });
  const winners = winTeam ? everyone.filter(p => p.team === winTeam).sort((a, c) => c.pts - a.pts || c.pointDiff - a.pointDiff || a.name.localeCompare(c.name)).slice(0, 30) : [];
  document.getElementById('trophyRoster').innerHTML = winners.length
    ? `<h2 class="cer-h cer-h-sm"><span>ทีมแชมป์ · ${winName}</span></h2><ul class="cer-faces">${winners.map(p => `<li>${face(p, 76)}<span>${escHtml(p.name)}</span></li>`).join('')}</ul>`
    : '';

  const totalMatches = appState.matchHistory.length;
  const redWinCount = appState.matchHistory.filter(m => m.rStat === 'W').length;
  const blueWinCount = appState.matchHistory.filter(m => m.bStat === 'W').length;
  const drawCount = appState.matchHistory.filter(m => m.rStat === 'D').length;
  const statCard = (label, val, cls) => `<div class="cer-tile ${cls}"><div class="cer-tile-l">${label}</div><div class="cer-tile-n">${val}</div></div>`;
  document.getElementById('trophyStats').innerHTML = statCard('MATCHES', totalMatches, '') + statCard('RED WINS', redWinCount, 'is-red') + statCard('DRAWS', drawCount, 'is-gold') + statCard('BLUE WINS', blueWinCount, 'is-blue');

  // ── special awards: a hand-drawn icon, the criteria, and the winners with their faces ──
  const rk = i => `<span class="cer-rk">${i + 1}</span>`;
  const awardRow = (p, i, tag) => `<li>${rk(i)}${face(p, 52)}<span class="cer-aw-n">${escHtml(p.name)}<small>${p.team === 'Red' ? 'RED' : 'BLUE'} · G${escHtml(p.group)}</small></span><span class="award-card-tag">${tag}</span></li>`;
  function awardCard(title, thai, icon, sub, rows) {
    return `<div class="award-card cer-aw">
      <header class="cer-aw-h"><span class="cer-aw-ic">${dsIcon(icon)}</span><div><div class="award-card-title">${title}</div><div class="cer-aw-th">${thai}</div></div></header>
      <p class="award-card-sub">${sub}</p>
      <ul class="cer-aw-list">${rows}</ul>
    </div>`;
  }
  let awHtml = '';
  if (epicKings.length > 0) awHtml += awardCard('EPIC COMEBACK KINGS', 'ราชาพลิกนรก', 'fire',
    'ตามหลัง 4+ คะแนนช่วงท้ายแล้วพลิกชนะ · ตัดเชือก: Tags → Wins → Point Diff',
    epicKings.map((p, i) => awardRow(p, i, `${p.epicTags} Tag`)).join(''));
  if (gladiators.length > 0) awHtml += awardCard('THE GLADIATORS', 'นักสู้หัวใจเพชร', 'target',
    'คะแนนรวม 2 เกมห่างกันไม่เกิน 5 คะแนน · ตัดเชือก: Tags → |Point Diff| → Draws',
    gladiators.map((p, i) => awardRow(p, i, `${p.clutchTags} แมตช์`)).join(''));
  if (ironLungs.length > 0) awHtml += awardCard('IRON LUNGS', 'ปอดเหล็ก', 'timer',
    'มีเกมที่ดิวซ์ยาวถึง 22 คะแนนขึ้นไป · ตัดเชือก: Tags → Wins → Point Diff',
    ironLungs.map((p, i) => awardRow(p, i, `${p.marathonTags} แมตช์`)).join(''));
  if (toughestPlayers.length > 0) awHtml += awardCard('TOUGHEST PLAYER', 'ผู้เล่นเคี้ยวยาก', 'medal',
    'พาทีมเสมอมากสุด · ตัดเชือก: Draws → |Point Diff| ใกล้ 0',
    toughestPlayers.map((p, i) => awardRow(p, i, `เสมอ <b>${p.d}</b> · PD ${p.pointDiff}`)).join(''));
  document.getElementById('trophySpecialAwards').innerHTML = awHtml
    ? `<h2 class="cer-h"><span>${dsMascot('reward', 78, false, 'cer-h-m')}รางวัลพิเศษ</span></h2><div class="cer-aw-grid">${awHtml}</div>` : '';

  // ── MVP top 5: the leader of each team is a big card with a face, the rest are rows with faces ──
  function renderTeamTop(players) {
    if (players.length === 0) return `<div class="cer-empty">ยังไม่มีข้อมูลแมตช์</div>`;
    const pd = p => { const s = p.pointDiff > 0 ? '+' : ''; return `<span class="cer-pd ${p.pointDiff > 0 ? 'is-up' : p.pointDiff < 0 ? 'is-down' : ''}">${s}${p.pointDiff}</span>`; };
    const [lead, ...rest] = players;
    return `<div class="cer-lead">
        <span class="cer-crown">${dsIcon('crown')}</span>${face(lead, 104)}
        <div class="cer-lead-n">${escHtml(lead.name)}</div>
        <div class="cer-lead-s">กลุ่ม ${escHtml(lead.group)} · PD ${pd(lead)}</div>
        <div class="cer-lead-p">${lead.pts}<small>PTS</small></div>
      </div>
      ${rest.map((p, i) => `<div class="cer-row">${rk(i + 1)}${face(p, 56)}
        <div class="cer-who"><div class="cer-name">${escHtml(p.name)}</div><div class="cer-sub">กลุ่ม ${escHtml(p.group)} · PD ${pd(p)}</div></div>
        <div class="cer-pts">${p.pts}<small>PTS</small></div></div>`).join('')}`;
  }
  document.getElementById('trophyTop5').innerHTML = `<h2 class="cer-h"><span>${dsMascot('rising', 78, false, 'cer-h-m')}MVP TOP 5</span></h2>
    <div class="cer-cols">
      <section class="cer-col is-red"><div class="cer-col-h">RED TEAM · MVP</div>${renderTeamTop(redTop)}</section>
      <section class="cer-col is-blue"><div class="cer-col-h">BLUE TEAM · MVP</div>${renderTeamTop(blueTop)}</section>
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    CER_PARTS.forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '1'; el.style.transform = 'scale(1) translateY(0)'; } });
  }));

  startConfetti(null, isDraw, redWins);
  animateTrophy();
}

// every piece of the ceremony that fades in (openEndGame) and is put back when it closes (closeTrophy)
const CER_PARTS = ['trophyWinnerLabel', 'trophySvgWrap', 'trophyTeamName', 'trophyScore', 'trophyRoster', 'trophyStats', 'trophyTop5', 'trophySpecialAwards', 'trophyCloseBtn'];

function closeTrophy() { stopConfetti(); document.getElementById('trophyOverlay').style.opacity = '0'; document.getElementById('trophyOverlay').style.transition = 'opacity 0.5s'; setTimeout(() => { document.getElementById('trophyOverlay').style.display = 'none'; document.getElementById('trophyOverlay').style.opacity = ''; document.getElementById('trophyOverlay').style.transition = ''; CER_PARTS.forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '0'; el.style.transform = ''; el.style.display = ''; } }); document.getElementById('trophySvgWrap').style.transform = 'scale(0.2) translateY(80px)'; document.getElementById('trophyTeamName').style.transform = 'scale(0.6)'; }, 500); }

// confetti: paper stars and strips in the poster's four inks (team colour first), drawn on the canvas behind the content
let confettiRAF = null; const confettiParticles = [];
function startConfetti(mainColor, isDraw, redWins) {
  const canvas = document.getElementById('confettiCanvas');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  confettiParticles.length = 0;
  const palettes = {
    red:  ['#d81a21', '#d81a21', '#f4c430', '#fff6ea', '#0b2a52'],
    blue: ['#0956b8', '#0956b8', '#f4c430', '#fff6ea', '#0b2a52'],
    draw: ['#f4c430', '#f4c430', '#d81a21', '#0956b8', '#fff6ea'],
  };
  const colors = isDraw ? palettes.draw : redWins ? palettes.red : palettes.blue;
  const star = (R) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rad = i % 2 ? R * 0.45 : R; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); };
  function spawnBurst(count) {
    for (let i = 0; i < count; i++) {
      confettiParticles.push({ x: Math.random() * canvas.width, y: -20, w: 8 + Math.random() * 12, h: 3 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 5, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2, gravity: 0.06 + Math.random() * 0.04,
        shape: Math.random() < 0.5 ? 'star' : 'rect', life: 0, maxLife: 200 + Math.random() * 150 });
    }
  }
  let frame = 0;
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); frame++;
    if (frame < 180 && frame % 3 === 0) spawnBurst(8);
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const p = confettiParticles[i]; p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.rot += p.rotV; p.life++;
      if (p.y > canvas.height + 30 || p.life > p.maxLife) { confettiParticles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life > p.maxLife - 40 ? 1 - (p.life - (p.maxLife - 40)) / 40 : 1;
      ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.shape === 'star') { star(p.w * 0.8); } else { ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    confettiRAF = requestAnimationFrame(loop);
  }
  loop();
}
function stopConfetti() { if (confettiRAF) { cancelAnimationFrame(confettiRAF); confettiRAF = null; } const canvas = document.getElementById('confettiCanvas'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); confettiParticles.length = 0; }
// FIX-14: resize confetti canvas on window resize so it covers full viewport
window.addEventListener('resize', () => { const c = document.getElementById('confettiCanvas'); if (c && confettiRAF) { c.width = window.innerWidth; c.height = window.innerHeight; } });
function animateTrophy() { const wrap = document.getElementById('trophySvgWrap'); let t = 0; function tick() { t += 0.02; if (!document.getElementById('trophyOverlay') || document.getElementById('trophyOverlay').style.display === 'none') return; wrap.style.transform = `scale(1) translateY(${Math.sin(t) * 8}px) rotate(${Math.sin(t*0.7)*2}deg)`; requestAnimationFrame(tick); } setTimeout(() => { wrap.style.transition = 'none'; tick(); }, 1400); }  // the float rewrites transform every frame: without this a late reveal transition restarts for ever and the star stays at 0.2

// ?ceremony=1 opens the ceremony on THIS screen only, once the data is in and you are in as a spectator ("เข้าดูคะแนนสด"): nothing is broadcast
// (the admin button sends SHOW_TROPHY to every screen, the TV included). It exists to look at the design without touching the live screens.
if (/[?&]ceremony=1(?:&|$)/.test(location.search)) {
  const _cerPoll = setInterval(() => {
    if (typeof _dataReady !== 'undefined' && _dataReady && typeof userRole !== 'undefined' && userRole === 'guest' && (appState.players || []).length) {
      clearInterval(_cerPoll); setTimeout(() => { if (userRole === 'guest') openEndGame(); }, 2500);   // after the first screens have drawn
    }
  }, 400);
  setTimeout(() => clearInterval(_cerPoll), 120000);
}

// ── MATCH NOTIFICATION SYSTEM ──

// ── MATCH REACTIONS — self-contained (emoji + line). No external GIF/CDN:
// works offline, never shows a broken image, and cuts ~50 hardcoded URLs.
const NOTI_REACTIONS = {
  win_blowout:        { emoji: '🔥💪', mascot: 'smash', text: 'ถล่มขาดลอย!' },
  win_comeback:       { emoji: '😤🔥', mascot: 'dive', text: 'พลิกกลับมาชนะ!' },
  win_hardfought:     { emoji: '💪🏸', mascot: 'block', text: 'สู้สุดใจ คว้าชัย!' },
  win_normal:         { emoji: '🎉🏸', mascot: 'victory', text: 'ชนะ!' },
  lose_comeback:      { emoji: '😱💔', text: 'โดนพลิกกลับ…' },
  lose_blowout:       { emoji: '😭',   text: 'พ่ายยับ ไว้แก้มือ!' },
  lose_normal:        { emoji: '😢',   text: 'สู้ใหม่รอบหน้า!' },
  draw_rollercoaster: { emoji: '🎢😮‍💨', mascot: 'tangled', text: 'สูสีสุด ๆ เสมอ!' },
  draw_bloody:        { emoji: '⚔️🤝', mascot: 'block', text: 'ศึกดุเดือด เสมอ!' },
  draw_normal:        { emoji: '🤝',   mascot: 'break', text: 'เสมอ!' },
};
