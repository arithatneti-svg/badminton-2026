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
  const winColor = isDraw ? 'var(--gold)' : redWins ? 'var(--red)' : 'var(--blue)';
  const winName = isDraw ? "IT'S A DRAW!" : redWins ? 'RED TEAM' : 'BLUE TEAM';

  const stats = getPlayerStats(); // FIX-7d: use shared stats builder

  // หาผู้ชนะในแต่ละหมวด
  const topMVP = (team) => Object.values(stats).filter(p => p.team === team && p.pts > 0).sort((a,b) => b.pts - a.pts || b.pointDiff - a.pointDiff || b.w - a.w).slice(0, 5);
  const redTop = topMVP('Red'), blueTop = topMVP('Blue');

  // 🛡️ Toughest Player: d desc → |pointDiff| asc (เข้าใกล้ 0)
  const toughestPlayers = Object.values(stats).filter(p => p.d > 0)
    .sort((a,b) => b.d - a.d || Math.abs(a.pointDiff) - Math.abs(b.pointDiff))
    .slice(0, 3);
  // 🔥 Epic Comeback Kings: epicTags desc → w desc → pointDiff desc
  const epicKings = Object.values(stats).filter(p => p.epicTags > 0)
    .sort((a,b) => b.epicTags - a.epicTags || b.w - a.w || b.pointDiff - a.pointDiff)
    .slice(0, 3);
  // ⚔️ The Gladiators: clutchTags desc → |pointDiff| asc → d desc
  const gladiators = Object.values(stats).filter(p => p.clutchTags > 0)
    .sort((a,b) => b.clutchTags - a.clutchTags || Math.abs(a.pointDiff) - Math.abs(b.pointDiff) || b.d - a.d)
    .slice(0, 3);
  // 🏃‍♂️ Iron Lungs: marathonTags desc → w desc → pointDiff desc
  const ironLungs = Object.values(stats).filter(p => p.marathonTags > 0)
    .sort((a,b) => b.marathonTags - a.marathonTags || b.w - a.w || b.pointDiff - a.pointDiff)
    .slice(0, 3);

  document.getElementById('trophyOverlay').style.display = 'block';
  document.getElementById('trophyBg').className = isDraw ? 'is-draw' : redWins ? 'is-red' : 'is-blue';
  // the star holds the cup (the champion star; the racket star for a draw) with a white sticker edge on the team colour
  document.getElementById('trophySvgWrap').innerHTML = dsMascot(isDraw ? 'victory' : 'champion', 300, true);

  // ── Broadcast ไปทุก user ผ่าน Firebase remoteCommand ──
  if (userRole === 'admin' || userRole === 'superadmin') {
    appState.remoteCommand = { action: 'SHOW_TROPHY', ts: Date.now() };
    saveData(true);
  }

  document.getElementById('trophyWinnerLabel').innerHTML = `${dsShuttle(22)}<span>${escHtml((document.getElementById('seasonNavTitle') || {}).textContent || 'SPORTS DAY')} · CHAMPION</span>`;
  const teamNameEl = document.getElementById('trophyTeamName');
  teamNameEl.textContent = winName; teamNameEl.style.color = winColor;
  document.getElementById('trophyScore').innerHTML = `<span class="cer-r">${r}</span><span class="cer-dash">—</span><span class="cer-b">${b}</span>`;

  const totalMatches = appState.matchHistory.length;
  const redWinCount = appState.matchHistory.filter(m => m.rStat === 'W').length;
  const blueWinCount = appState.matchHistory.filter(m => m.bStat === 'W').length;
  const drawCount = appState.matchHistory.filter(m => m.rStat === 'D').length;

  const statCard = (label, val, cls) => `<div class="cer-stat ${cls}"><div class="cer-stat-l">${label}</div><div class="cer-stat-n">${val}</div></div>`;
  document.getElementById('trophyStats').innerHTML = statCard('MATCHES', totalMatches, '') + statCard('RED WINS', redWinCount, 'is-red') + statCard('DRAWS', drawCount, 'is-gold') + statCard('BLUE WINS', blueWinCount, 'is-blue');

  // สร้าง Card สรุปรางวัลพิเศษแบบ Grid
  const medalOf = i => i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
  const who = p => `<span class="award-card-who ds-team ${p.team === 'Red' ? 'ds-team-red' : 'ds-team-blue'}">${escHtml(p.name)}</span>`;
  function buildAwardCard(title, icon, arr, countKey, tagText, criteriaDesc) {
      if (arr.length === 0) return '';
      return `<div class="award-card">
        <span class="award-card-icon">${icon}</span>
        <div class="award-card-title">${title}</div>
        ${criteriaDesc ? `<div class="award-card-sub">${criteriaDesc}</div>` : ''}
        <div class="award-card-names">${arr.map((p, i) => `<div class="award-card-name"><span class="award-card-medal">${medalOf(i)}</span>${who(p)}<span class="award-card-tag">${p[countKey]} ${tagText}</span></div>`).join('')}</div>
      </div>`;
  }

  const specialAwardsDiv = document.getElementById('trophySpecialAwards');
  let awHtml = '';

  // 1. Epic Comeback Kings
  if (epicKings.length > 0) awHtml += buildAwardCard(
    'EPIC COMEBACK KINGS (ราชาพลิกนรก)', '🔥', epicKings, 'epicTags', 'Tag',
    'ตามหลัง 4+ คะแนนช่วงท้ายแล้วพลิกชนะ · ตัดเชือก: Tags → Wins → Point Diff'
  );
  // 2. The Gladiators
  if (gladiators.length > 0) awHtml += buildAwardCard(
    'THE GLADIATORS (นักสู้หัวใจเพชร)', '⚔️', gladiators, 'clutchTags', 'แมตช์',
    'คะแนนรวม 2 เกมห่างกันไม่เกิน 5 คะแนน · ตัดเชือก: Tags → |Point Diff| → Draws'
  );
  // 3. Iron Lungs
  if (ironLungs.length > 0) awHtml += buildAwardCard(
    'IRON LUNGS (ปอดเหล็ก)', '🏃‍♂️', ironLungs, 'marathonTags', 'แมตช์',
    'มีเกมที่ดิวซ์ยาวถึง 22 คะแนนขึ้นไป · ตัดเชือก: Tags → Wins → Point Diff'
  );
  // 4. Toughest Player (ใช้โครงสร้างแบบพิเศษ เพราะโชว์เสมอ/PD)
  if (toughestPlayers.length > 0) {
      awHtml += `<div class="award-card">
        <span class="award-card-icon">🛡️</span>
        <div class="award-card-title">TOUGHEST PLAYER (ผู้เล่นเคี้ยวยาก)</div>
        <div class="award-card-sub">พาทีมเสมอมากสุด · ตัดเชือก: Draws → |Point Diff| ใกล้ 0</div>
        <div class="award-card-names">${toughestPlayers.map((p, i) => `<div class="award-card-name"><span class="award-card-medal">${medalOf(i)}</span>${who(p)}<span class="award-card-tag">เสมอ <b>${p.d}</b> · PD: ${p.pointDiff}</span></div>`).join('')}</div>
      </div>`;
  }
  specialAwardsDiv.innerHTML = awHtml;

  // Render Top 5 MVP
  const top5El = document.getElementById('trophyTop5');

  function renderTeamTop(players) {
    if (players.length === 0) return `<div class="cer-empty">ยังไม่มีข้อมูลแมตช์</div>`;
    return players.map((p, i) => {
      const diffSign = p.pointDiff > 0 ? '+' : '';
      const pd = p.pointDiff > 0 ? 'is-up' : p.pointDiff < 0 ? 'is-down' : '';
      const medals = ['🥇','🥈','🥉'];
      const rankDisp = medals[i] || `<span class="cer-rk">${i+1}.</span>`;
      return `<div class="cer-row">
        <div class="cer-rank">${rankDisp}</div>
        <div class="cer-who">
          <div class="cer-name">${escHtml(p.name)}</div>
          <div class="cer-sub">กลุ่ม ${escHtml(p.group)} · PD: <span class="cer-pd ${pd}">${diffSign}${p.pointDiff}</span></div>
        </div>
        <div class="cer-pts">${p.pts}<small>PTS</small></div>
      </div>`;
    }).join('');
  }

  top5El.innerHTML = `<h2 class="cer-h"><span class="cer-h-l"></span>${dsIcon('trophy', { fill: true })}MVP TOP 5<span class="cer-h-r"></span></h2>
    <div class="cer-cols">
      <section class="cer-col is-red"><div class="cer-col-h"><span class="ds-team ds-team-red">RED TEAM · MVP</span></div>${renderTeamTop(redTop)}</section>
      <section class="cer-col is-blue"><div class="cer-col-h"><span class="ds-team ds-team-blue">BLUE TEAM · MVP</span></div>${renderTeamTop(blueTop)}</section>
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    ['trophyWinnerLabel','trophySvgWrap','trophyTeamName','trophyScore','trophyStats','trophySpecialAwards','trophyTop5','trophyCloseBtn'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '1'; el.style.transform = 'scale(1) translateY(0)'; } });
  }));

  startConfetti(winColor, isDraw, redWins);
  animateTrophy();
}

function closeTrophy() { stopConfetti(); document.getElementById('trophyOverlay').style.opacity = '0'; document.getElementById('trophyOverlay').style.transition = 'opacity 0.5s'; setTimeout(() => { document.getElementById('trophyOverlay').style.display = 'none'; document.getElementById('trophyOverlay').style.opacity = ''; document.getElementById('trophyOverlay').style.transition = ''; ['trophyWinnerLabel','trophySvgWrap','trophyTeamName','trophyScore','trophyStats','trophySpecialAwards','trophyTop5','trophyCloseBtn'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '0'; el.style.transform = ''; el.style.display = ''; } }); document.getElementById('trophySvgWrap').style.transform = 'scale(0.2) translateY(80px)'; document.getElementById('trophyTeamName').style.transform = 'scale(0.6)'; }, 500); }
let confettiRAF = null; const confettiParticles = []; function startConfetti(mainColor, isDraw, redWins) { const canvas = document.getElementById('confettiCanvas'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; const ctx = canvas.getContext('2d'); confettiParticles.length = 0; const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(); /* confetti colours come from the tokens, read when the ceremony starts */ const palettes = { red: [tok('--red'), tok('--red-text'), tok('--gold'), tok('--gold-hi'), tok('--red-ink'), tok('--t-hi')], blue: [tok('--blue'), tok('--blue-text'), tok('--gold'), tok('--gold-hi'), tok('--blue-ink'), tok('--t-hi')], draw: [tok('--gold'), tok('--red'), tok('--blue'), tok('--gold-hi'), tok('--live'), tok('--t-hi')] }; const colors = isDraw ? palettes.draw : redWins ? palettes.red : palettes.blue; function spawnBurst(count) { for (let i = 0; i < count; i++) { confettiParticles.push({ x: Math.random() * canvas.width, y: -20, w: 6 + Math.random() * 10, h: 3 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 5, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2, gravity: 0.06 + Math.random() * 0.04, shape: Math.random() > 0.5 ? 'rect' : 'circle', life: 0, maxLife: 200 + Math.random() * 150 }); } } let frame = 0; function loop() { ctx.clearRect(0, 0, canvas.width, canvas.height); frame++; if (frame < 180 && frame % 3 === 0) spawnBurst(8); for (let i = confettiParticles.length - 1; i >= 0; i--) { const p = confettiParticles[i]; p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.rot += p.rotV; p.life++; if (p.y > canvas.height + 30 || p.life > p.maxLife) { confettiParticles.splice(i,1); continue; } const alpha = p.life > p.maxLife - 40 ? 1 - (p.life - (p.maxLife-40))/40 : 1; ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w/2, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); } ctx.restore(); ctx.globalAlpha = 1; } confettiRAF = requestAnimationFrame(loop); } loop(); } function stopConfetti() { if (confettiRAF) { cancelAnimationFrame(confettiRAF); confettiRAF = null; } const canvas = document.getElementById('confettiCanvas'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); confettiParticles.length = 0; }
// FIX-14: resize confetti canvas on window resize so it covers full viewport
window.addEventListener('resize', () => { const c = document.getElementById('confettiCanvas'); if (c && confettiRAF) { c.width = window.innerWidth; c.height = window.innerHeight; } });
function animateTrophy() { const wrap = document.getElementById('trophySvgWrap'); let t = 0; function tick() { t += 0.02; if (!document.getElementById('trophyOverlay') || document.getElementById('trophyOverlay').style.display === 'none') return; wrap.style.transform = `scale(1) translateY(${Math.sin(t) * 8}px) rotate(${Math.sin(t*0.7)*2}deg)`; requestAnimationFrame(tick); } setTimeout(() => { wrap.style.transition = 'none'; tick(); }, 1400); }  // the float rewrites transform every frame: without this a late reveal transition restarts for ever and the star stays at 0.2

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
