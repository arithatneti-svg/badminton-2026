function printReport() { const w = window.open('', '_blank'); const statsHtml = document.getElementById('playerStatsTable').outerHTML; const histHtml = document.getElementById('matchDetailsTable').outerHTML; w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Badminton Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111;}h2{color:#111;border-bottom:2px solid #f5c842;padding-bottom:8px;margin-top:32px;}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;}th{background:#1a1a1a;color:#f5c842;padding:8px 10px;text-align:left;}td{padding:7px 10px;border-bottom:1px solid #ddd;}tr:nth-child(even) td{background:#f9f9f9;}@media print{button{display:none;}}</style></head><body><h1 style="text-align:center;">🏸 Badminton Sports Day 2026 — Report</h1><p style="text-align:center;color:#666;">Printed ${new Date().toLocaleString()}</p><h2>Top Players</h2>${statsHtml}<h2>Match History</h2>${histHtml}</body></html>`); w.document.close(); setTimeout(() => w.print(), 400); }

// ── EFFECTS ──
function flashScore(elId, color) { const overlay = document.createElement('div'); overlay.style.cssText = `position:fixed; inset:0; pointer-events:none; z-index:999; background: radial-gradient(ellipse at ${elId.includes('Red') ? '25%' : '75%'} 50%, ${color}22 0%, transparent 60%); animation: flash-fade 0.6s ease-out forwards;`; if (!document.getElementById('flash-style')) { const s = document.createElement('style'); s.id = 'flash-style'; s.textContent = '@keyframes flash-fade { from{opacity:1} to{opacity:0} }'; document.head.appendChild(s); } document.body.appendChild(overlay); setTimeout(() => overlay.remove(), 700); }
function createFireEngine(canvasId, colorR, colorG, colorB) { const canvas = document.getElementById(canvasId); if (!canvas) return null; const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height; const particles = []; let active = false; let raf = null; function spawn() { const count = 4 + Math.floor(Math.random() * 3); for (let i = 0; i < count; i++) { particles.push({ x: W * 0.3 + Math.random() * W * 0.4, y: H * 0.85 + Math.random() * 20, vx: (Math.random() - 0.5) * 2.5, vy: -(2 + Math.random() * 4), life: 0, maxLife: 55 + Math.random() * 40, size: 6 + Math.random() * 14, wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.05 + Math.random() * 0.08 }); } } function draw() { ctx.clearRect(0, 0, W, H); for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life++; p.x += p.vx + Math.sin(p.wobble) * 0.8; p.y += p.vy; p.vy *= 0.985; p.wobble += p.wobbleSpeed; p.size *= 0.975; const t = p.life / p.maxLife; if (t >= 1 || p.size < 1) { particles.splice(i, 1); continue; } const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8; const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size); if (t < 0.3) { grad.addColorStop(0, `rgba(255,255,200,${alpha})`); grad.addColorStop(0.3, `rgba(${colorR},${colorG},${colorB*0.5},${alpha * 0.9})`); grad.addColorStop(1, `rgba(${colorR},${Math.floor(colorG*0.3)},0,0)`); } else { grad.addColorStop(0, `rgba(${colorR},${Math.floor(colorG*0.6)},0,${alpha * 0.8})`); grad.addColorStop(0.5, `rgba(${Math.floor(colorR*0.7)},${Math.floor(colorG*0.2)},0,${alpha * 0.4})`); grad.addColorStop(1, `rgba(${Math.floor(colorR*0.3)},0,0,0)`); } ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill(); } } let spawnTimer = 0; function loop() { if (!active) { ctx.clearRect(0, 0, W, H); return; } spawnTimer++; if (spawnTimer % 2 === 0) spawn(); draw(); raf = requestAnimationFrame(loop); } return { start() { if (active) return; active = true; loop(); }, stop() { active = false; if (raf) { cancelAnimationFrame(raf); raf = null; } ctx.clearRect(0, 0, W, H); } }; }
const fireRed = createFireEngine('fireCanvasRed', 255, 80, 0); const fireBlue = createFireEngine('fireCanvasBlue', 30, 140, 255);
let soundOn = false; const AudioCtx = window.AudioContext || window.webkitAudioContext; let audioCtx = null; function toggleSound() { soundOn = !soundOn; const btn = document.getElementById('soundBtn'); btn.textContent = soundOn ? '🔔' : '🔇'; btn.classList.toggle('active', soundOn); if (soundOn && !audioCtx) audioCtx = new AudioCtx(); showToast(soundOn ? 'Sound ON 🔔' : 'Sound OFF 🔇', ''); } function playSound(type) { if (!soundOn || !audioCtx) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); if (type === 'point') { o.frequency.setValueAtTime(523, audioCtx.currentTime); o.frequency.setValueAtTime(659, audioCtx.currentTime + 0.1); o.frequency.setValueAtTime(784, audioCtx.currentTime + 0.2); g.gain.setValueAtTime(0.18, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5); o.start(); o.stop(audioCtx.currentTime + 0.5); } else if (type === 'match') { o.frequency.setValueAtTime(440, audioCtx.currentTime); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3); o.start(); o.stop(audioCtx.currentTime + 0.3); } }

// ── TROPHY CEREMONY ──
function openEndGame() { 
  const r = appState.globalScoreRed, b = appState.globalScoreBlue; 
  if (r === 0 && b === 0) return showToast('No scores yet!', 'error'); 
  
  const isDraw = r === b, redWins = r > b; 
  const winColor = isDraw ? '#f5c842' : redWins ? '#ff3b3b' : '#3b8eff'; 
  const winName = isDraw ? "IT'S A DRAW!" : redWins ? 'RED TEAM' : 'BLUE TEAM'; 
  const bgGrad = isDraw ? 'radial-gradient(ellipse at 50% 25%, #2a2000 0%, #0a0a0f 65%)' : redWins ? 'radial-gradient(ellipse at 35% 25%, #2a0000 0%, #0a0a0f 65%)' : 'radial-gradient(ellipse at 65% 25%, #00112a 0%, #0a0a0f 65%)'; 
  
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
  document.getElementById('trophyBg').style.background = bgGrad;

  // ── Broadcast ไปทุก user ผ่าน Firebase remoteCommand ──
  if (userRole === 'admin' || userRole === 'superadmin') {
    appState.remoteCommand = { action: 'SHOW_TROPHY', ts: Date.now() };
    saveData(true);
  }
  
  const teamNameEl = document.getElementById('trophyTeamName'); 
  teamNameEl.textContent = winName; teamNameEl.style.color = winColor; 
  document.getElementById('trophyScore').innerHTML = `<span style="color:#ff3b3b">${r}</span> <span style="color:rgba(255,255,255,0.3)">—</span> <span style="color:#3b8eff">${b}</span>`; 
  
  const totalMatches = appState.matchHistory.length;
  const redWinCount = appState.matchHistory.filter(m => m.rStat === 'W').length;
  const blueWinCount = appState.matchHistory.filter(m => m.bStat === 'W').length;
  const drawCount = appState.matchHistory.filter(m => m.rStat === 'D').length; 
  
  const statCard = (label, val, color, bg) => `<div style="text-align:center;padding:12px 18px;background:${bg};border:1px solid ${color}33;border-radius:10px;min-width:80px;"><div style="font-size:10px;letter-spacing:2px;color:${color}99;font-weight:700;margin-bottom:5px;">${label}</div><div style="font-family:'Bebas Neue',sans-serif;font-size:2em;color:${color};">${val}</div></div>`; 
  document.getElementById('trophyStats').innerHTML = statCard('MATCHES', totalMatches, '#ffffff', 'rgba(255,255,255,0.07)') + statCard('RED WINS', redWinCount, '#ff3b3b', 'rgba(255,59,59,0.1)') + statCard('DRAWS', drawCount, '#f5c842', 'rgba(245,200,66,0.08)') + statCard('BLUE WINS', blueWinCount, '#3b8eff', 'rgba(59,142,255,0.1)'); 

  // สร้าง Card สรุปรางวัลพิเศษแบบ Grid
  function buildAwardCard(title, icon, arr, countKey, tagText, borderColor, bgColor, criteriaDesc) {
      if (arr.length === 0) return '';
      let html = `<div class="award-card" style="border-color:${borderColor};background:${bgColor};">
        <span class="award-card-icon">${icon}</span>
        <div class="award-card-title">${title}</div>`;
      if (criteriaDesc) {
        html += `<div class="award-card-sub">${criteriaDesc}</div>`;
      }
      html += `<div class="award-card-names">`;
      arr.forEach((p, i) => {
          const tColor = p.team === 'Red' ? 'var(--red)' : 'var(--blue)';
          const medal = i===0?'🥇':i===1?'🥈':'🥉';
          html += `<div class="award-card-name" style="color:${tColor};">
            <span style="font-size:16px;">${medal}</span>
            <span>${p.name}</span>
            <span style="margin-left:auto;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7);">${p[countKey]} ${tagText}</span>
          </div>`;
      });
      html += `</div></div>`;
      return html;
  }

  const specialAwardsDiv = document.getElementById('trophySpecialAwards');
  let awHtml = '';
  
  // 1. Epic Comeback Kings
  if (epicKings.length > 0) awHtml += buildAwardCard(
    'EPIC COMEBACK KINGS (ราชาพลิกนรก)', '🔥', epicKings, 'epicTags', 'Tags',
    'rgba(155, 89, 182, 0.4)', 'rgba(155, 89, 182, 0.15)',
    'ตามหลัง 4+ แต้มช่วงท้ายแล้วพลิกชนะ · ตัดเชือก: Tags → Wins → Point Diff'
  );
  // 2. The Gladiators
  if (gladiators.length > 0) awHtml += buildAwardCard(
    'THE GLADIATORS (นักสู้หัวใจเพชร)', '⚔️', gladiators, 'clutchTags', 'Matches',
    'rgba(241, 196, 15, 0.4)', 'rgba(241, 196, 15, 0.15)',
    'แต้มรวม 2 เกมห่างกันไม่เกิน 5 แต้ม · ตัดเชือก: Tags → |Point Diff| → Draws'
  );
  // 3. Iron Lungs
  if (ironLungs.length > 0) awHtml += buildAwardCard(
    'IRON LUNGS (ปอดเหล็ก)', '🏃‍♂️', ironLungs, 'marathonTags', 'Matches',
    'rgba(59, 142, 255, 0.4)', 'rgba(59, 142, 255, 0.15)',
    'มีเกมที่ดิวซ์ยาวถึง 22 แต้มขึ้นไป · ตัดเชือก: Tags → Wins → Point Diff'
  );
  // 4. Toughest Player (ใช้โครงสร้างแบบพิเศษ เพราะโชว์เสมอ/PD)
  if (toughestPlayers.length > 0) {
      awHtml += `<div class="award-card" style="border-color:rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);">
        <span class="award-card-icon">🛡️</span>
        <div class="award-card-title">TOUGHEST PLAYER (ผู้เล่นเคี้ยวยาก)</div>
        <div class="award-card-sub">พาทีมเสมอมากสุด · ตัดเชือก: Draws → |Point Diff| ใกล้ 0</div>
        <div class="award-card-names">`;
      toughestPlayers.forEach((p, i) => {
          const tColor = p.team === 'Red' ? 'var(--red)' : 'var(--blue)';
          awHtml += `<div class="award-card-name" style="color:${tColor};">
            <span style="font-size:16px;">${i===0?'🥇':i===1?'🥈':'🥉'}</span>
            <span>${p.name}</span>
            <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.6);">เสมอ <b style="color:#fff">${p.d}</b> · PD: ${p.pointDiff}</span>
          </div>`;
      });
      awHtml += `</div></div>`;
  }
  specialAwardsDiv.innerHTML = awHtml;

  // Render Top 5 MVP
  const top5El = document.getElementById('trophyTop5'); 
  const medalsIcons = ['🥇','🥈','🥉','4.','5.']; 
  
  function renderTeamTop(players, color, accentColor) {
    if (players.length === 0) return `<div style="color:rgba(255,255,255,0.3);font-size:13px;padding:20px;text-align:center;">No match data</div>`;
    return players.map((p, i) => {
      const diffSign = p.pointDiff > 0 ? '+' : '';
      const pdColor = p.pointDiff > 0 ? 'var(--green)' : p.pointDiff < 0 ? 'var(--danger)' : 'var(--muted)';
      const medals = ['🥇','🥈','🥉'];
      const rankDisp = medals[i] || `<span style="font-size:14px;font-weight:700;color:var(--muted);">${i+1}.</span>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="font-size:${i<3?'22':'14'}px;flex-shrink:0;width:28px;text-align:center;">${rankDisp}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:${color};line-height:1.3;word-break:break-word;">${p.name}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px;">กลุ่ม ${p.group} · PD: <span style="color:${pdColor};font-weight:700;">${diffSign}${p.pointDiff}</span></div>
        </div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:1.6em;color:${color};flex-shrink:0;text-align:right;">
          ${p.pts}<span style="font-size:0.35em;color:rgba(255,255,255,0.3);letter-spacing:1px;margin-left:2px;">PTS</span>
        </div>
      </div>`;
    }).join('');
  }

  const mvpSectionTitle = `<div style="font-family:'Bebas Neue',sans-serif;font-size:1.6em;letter-spacing:5px;color:var(--gold);margin-bottom:16px;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px;">
    <span style="flex:1;height:1px;background:linear-gradient(to right,transparent,rgba(245,200,66,0.3));"></span>
    🏆 MVP TOP 5
    <span style="flex:1;height:1px;background:linear-gradient(to left,transparent,rgba(245,200,66,0.3));"></span>
  </div>`;

  // Responsive: mobile = 1 col, desktop = 2 col
  const isMobile = window.innerWidth <= 600;
  const gridStyle = isMobile
    ? 'display:flex;flex-direction:column;gap:12px;text-align:left;'
    : 'display:grid;grid-template-columns:1fr 1fr;gap:14px;text-align:left;';

  top5El.innerHTML = mvpSectionTitle + `<div style="${gridStyle}">
    <div style="background:rgba(255,59,92,0.06);border:1px solid rgba(255,59,92,0.18);border-radius:16px;overflow:hidden;">
      <div style="padding:12px 16px 10px;border-bottom:1px solid rgba(255,59,92,0.12);display:flex;align-items:center;gap:8px;">
        <div style="width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red);flex-shrink:0;"></div>
        <span style="font-size:10px;letter-spacing:3px;color:var(--red);font-weight:700;">RED TEAM · MVP</span>
      </div>
      <div>${renderTeamTop(redTop, 'var(--red)', '#ff3b5c')}</div>
    </div>
    <div style="background:rgba(59,142,255,0.06);border:1px solid rgba(59,142,255,0.18);border-radius:16px;overflow:hidden;">
      <div style="padding:12px 16px 10px;border-bottom:1px solid rgba(59,142,255,0.12);display:flex;align-items:center;gap:8px;">
        <div style="width:7px;height:7px;border-radius:50%;background:var(--blue);box-shadow:0 0 8px var(--blue);flex-shrink:0;"></div>
        <span style="font-size:10px;letter-spacing:3px;color:var(--blue);font-weight:700;">BLUE TEAM · MVP</span>
      </div>
      <div>${renderTeamTop(blueTop, 'var(--blue)', '#3b8eff')}</div>
    </div>
  </div>`; 
  
  requestAnimationFrame(() => requestAnimationFrame(() => { 
    ['trophyWinnerLabel','trophySvgWrap','trophyTeamName','trophyScore','trophyStats','trophySpecialAwards','trophyTop5','trophyCloseBtn'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '1'; el.style.transform = 'scale(1) translateY(0)'; } }); 
  })); 
  
  startConfetti(winColor, isDraw, redWins); 
  startStarBursts(winColor); 
  animateTrophy(); 
}

function closeTrophy() { stopConfetti(); stopStarBursts(); document.getElementById('trophyOverlay').style.opacity = '0'; document.getElementById('trophyOverlay').style.transition = 'opacity 0.5s'; setTimeout(() => { document.getElementById('trophyOverlay').style.display = 'none'; document.getElementById('trophyOverlay').style.opacity = ''; document.getElementById('trophyOverlay').style.transition = ''; ['trophyWinnerLabel','trophySvgWrap','trophyTeamName','trophyScore','trophyStats','trophySpecialAwards','trophyTop5','trophyCloseBtn'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = '0'; el.style.transform = ''; el.style.display = ''; } }); document.getElementById('trophySvgWrap').style.transform = 'scale(0.2) translateY(80px)'; document.getElementById('trophyTeamName').style.transform = 'scale(0.6)'; }, 500); }
let confettiRAF = null; const confettiParticles = []; function startConfetti(mainColor, isDraw, redWins) { const canvas = document.getElementById('confettiCanvas'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; const ctx = canvas.getContext('2d'); confettiParticles.length = 0; const palettes = { red: ['#ff3b3b','#ff7700','#ffcc00','#ff6699','#ffffff','#ffaaaa'], blue: ['#3b8eff','#00ccff','#ffcc00','#aa88ff','#ffffff','#aaddff'], draw: ['#f5c842','#ff3b3b','#3b8eff','#ffffff','#ffaaff','#aaffaa'] }; const colors = isDraw ? palettes.draw : redWins ? palettes.red : palettes.blue; function spawnBurst(count) { for (let i = 0; i < count; i++) { confettiParticles.push({ x: Math.random() * canvas.width, y: -20, w: 6 + Math.random() * 10, h: 3 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 5, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.2, gravity: 0.06 + Math.random() * 0.04, shape: Math.random() > 0.5 ? 'rect' : 'circle', life: 0, maxLife: 200 + Math.random() * 150 }); } } let frame = 0; function loop() { ctx.clearRect(0, 0, canvas.width, canvas.height); frame++; if (frame < 180 && frame % 3 === 0) spawnBurst(8); for (let i = confettiParticles.length - 1; i >= 0; i--) { const p = confettiParticles[i]; p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.rot += p.rotV; p.life++; if (p.y > canvas.height + 30 || p.life > p.maxLife) { confettiParticles.splice(i,1); continue; } const alpha = p.life > p.maxLife - 40 ? 1 - (p.life - (p.maxLife-40))/40 : 1; ctx.globalAlpha = alpha; ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w/2, 0, Math.PI*2); ctx.fill(); } else { ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); } ctx.restore(); ctx.globalAlpha = 1; } confettiRAF = requestAnimationFrame(loop); } loop(); } function stopConfetti() { if (confettiRAF) { cancelAnimationFrame(confettiRAF); confettiRAF = null; } const canvas = document.getElementById('confettiCanvas'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); confettiParticles.length = 0; }
// FIX-14: resize confetti canvas on window resize so it covers full viewport
window.addEventListener('resize', () => { const c = document.getElementById('confettiCanvas'); if (c && confettiRAF) { c.width = window.innerWidth; c.height = window.innerHeight; } });
let starRAF = null; function startStarBursts(color) { const svg = document.getElementById('starLayer'); svg.innerHTML = ''; let count = 0; function burst() { if (count++ > 12) return; const x = 10 + Math.random() * 80, y = 5 + Math.random() * 60; const size = 20 + Math.random() * 40; const opacity = 0.4 + Math.random() * 0.5; const star = document.createElementNS('http://www.w3.org/2000/svg','polygon'); const pts = []; for (let i = 0; i < 5; i++) { const outer = (i * 72 - 90) * Math.PI / 180; const inner = outer + 36 * Math.PI / 180; pts.push(`${x + Math.cos(outer)*size}% ${y + Math.sin(outer)*size*1.5}%`); pts.push(`${x + Math.cos(inner)*size*0.4}% ${y + Math.sin(inner)*size*0.6}%`); } star.setAttribute('points', pts.join(' ')); star.setAttribute('fill', color); star.style.opacity = '0'; star.style.transition = 'opacity 0.3s'; svg.appendChild(star); requestAnimationFrame(() => { star.style.opacity = String(opacity); }); setTimeout(() => { star.style.opacity = '0'; setTimeout(() => star.remove(), 400); }, 600 + Math.random() * 800); starRAF = setTimeout(burst, 200 + Math.random() * 400); } burst(); } function stopStarBursts() { if (starRAF) { clearTimeout(starRAF); starRAF = null; } } function animateTrophy() { const wrap = document.getElementById('trophySvgWrap'); let t = 0; function tick() { t += 0.02; if (!document.getElementById('trophyOverlay') || document.getElementById('trophyOverlay').style.display === 'none') return; wrap.style.transform = `scale(1) translateY(${Math.sin(t) * 8}px) rotate(${Math.sin(t*0.7)*2}deg)`; requestAnimationFrame(tick); } setTimeout(tick, 1400); }

// ── MATCH NOTIFICATION SYSTEM ──

// ── MATCH REACTIONS — self-contained (emoji + line). No external GIF/CDN:
// works offline, never shows a broken image, and cuts ~50 hardcoded URLs.
const NOTI_REACTIONS = {
  win_blowout:        { emoji: '🔥💪', text: 'ถล่มขาดลอย!' },
  win_comeback:       { emoji: '😤🔥', text: 'พลิกกลับมาชนะ!' },
  win_hardfought:     { emoji: '💪🏸', text: 'สู้สุดใจ คว้าชัย!' },
  win_normal:         { emoji: '🎉🏸', text: 'ชนะ!' },
  lose_comeback:      { emoji: '😱💔', text: 'โดนพลิกกลับ…' },
  lose_blowout:       { emoji: '😭',   text: 'พ่ายยับ ไว้แก้มือ!' },
  lose_normal:        { emoji: '😢',   text: 'สู้ใหม่รอบหน้า!' },
  draw_rollercoaster: { emoji: '🎢😮‍💨', text: 'สูสีสุด ๆ เสมอ!' },
  draw_bloody:        { emoji: '⚔️🤝', text: 'ศึกดุเดือด เสมอ!' },
  draw_normal:        { emoji: '🤝',   text: 'เสมอ!' },
};
