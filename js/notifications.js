function preloadGif(url) {
  if (!url) return;
  _preloadedGifUrl = url;
  const img = new Image();
  img.src = url;
}

function pickGifFromPool(key, pool) {
  if (!pool || pool.length === 0) return null;
  if (!_gifSeenMap[key] || _gifSeenMap[key].length === 0) {
    // reset: สร้าง index array ใหม่แบบ shuffle
    const indices = pool.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    _gifSeenMap[key] = indices;
  }
  return pool[_gifSeenMap[key].pop()];
}

// ── USER THEME (red / blue / normal) ──
let userTheme = localStorage.getItem('userTheme') || 'normal';

function selectLoginTheme(theme) {
  userTheme = theme;
  localStorage.setItem('userTheme', theme);

  // apply data-theme to documentElement — consistent กับ head script ที่ set ก่อน render
  document.documentElement.setAttribute('data-theme', theme === 'normal' ? '' : theme);

  // sync login screen buttons
  ['red','normal','blue'].forEach(t => {
    const btn = document.getElementById('themeBtn' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle('active', t === theme);
  });

  // sync navbar buttons
  ['Red','Normal','Blue'].forEach(t => {
    const btn = document.getElementById('navTheme' + t);
    if (btn) btn.classList.toggle('active', t.toLowerCase() === theme);
  });

  // update login hint
  const hints = {
    red:    'ถ้าทีมแดงแพ้ จะได้ GIF พิเศษ 😢',
    blue:   'ถ้าทีมน้ำเงินแพ้ จะได้ GIF พิเศษ 😢',
    normal: 'ถ้าทีมที่เลือกแพ้ จะได้เห็น GIF พิเศษ 😢',
  };
  const hint = document.getElementById('themeHint');
  if (hint) hint.textContent = hints[theme] || hints.normal;
}

// init theme button state on load
document.addEventListener('DOMContentLoaded', () => {
  selectLoginTheme(userTheme); // จะ set data-theme และ sync buttons ทั้งหมด
});

function pickGif({ tags, rStat, winnerSide }) {
  // Best-of-2: แสดง GIF เฉพาะตอนจบ Match เท่านั้น
  const tagIds = tags ? tags.map(t => t.id) : [];
  const hasEpic          = tagIds.some(t => t.includes('epic'));
  const hasBlowout       = tagIds.includes('blowout');
  const hasGladiators    = tagIds.includes('clutch');
  const hasRollercoaster = tagIds.includes('rollercoaster');
  const hasEpicRed       = tagIds.some(t => t.includes('epic_red'));
  const hasEpicBlue      = tagIds.some(t => t.includes('epic_blue'));

  const themeIsRed  = userTheme === 'red';
  const themeIsBlue = userTheme === 'blue';

  let key = null;

  // ── เสมอ: ไม่มีฝั่งชนะ/แพ้ — ใช้ draw pool เสมอ ──
  if (rStat === 'D') {
    if (hasRollercoaster) key = 'draw_rollercoaster';
    else if (hasGladiators) key = 'draw_bloody';
    else key = 'draw_normal';
    return pickGifFromPool(key, GIF_LIBRARY[key]);
  }

  // ── มีผู้ชนะ: แยกตาม Theme ──
  const themeLost = (themeIsRed  && winnerSide === 'blue') ||
                    (themeIsBlue && winnerSide === 'red');
  const themeWon  = (themeIsRed  && winnerSide === 'red') ||
                    (themeIsBlue && winnerSide === 'blue');

  if (themeLost) {
    // ── ผู้ดูเลือกทีมที่แพ้ → lose pool ──
    const opponentComeback = themeIsRed ? hasEpicBlue : hasEpicRed;
    if (opponentComeback) key = 'lose_comeback';
    else if (hasBlowout)  key = 'lose_blowout';
    else                  key = 'lose_normal';

  } else if (themeWon) {
    // ── ผู้ดูเลือกทีมที่ชนะ → win pool ──
    if (hasBlowout)         key = 'win_blowout';
    else if (hasEpic)       key = 'win_comeback';
    else if (hasGladiators) key = 'win_hardfought';
    else                    key = 'win_normal';

  } else {
    // ── Theme กลาง (normal/gold): ใช้ win pool ของฝั่งที่ชนะ ──
    if (hasBlowout)         key = 'win_blowout';
    else if (hasEpic)       key = 'win_comeback';
    else if (hasGladiators) key = 'win_hardfought';
    else                    key = 'win_normal';
  }

  return pickGifFromPool(key, GIF_LIBRARY[key]);
}

// ── MATCH NOTIFICATION QUEUE ──
const _notiQueue = [];
let _notiActive = false;
let _currentNotiMatchId = null;  // FIX-DEDUP: track which match is currently showing
let _currentNotiIsMatchEnd = false;

function queueMatchNoti(params) {
  // FIX-DEDUP: block duplicate matchId+isMatchEnd combos from being queued
  // (caused by dbRef.on echo after saveData when _adminJustFinalized wasn't set in time)
  const isDuplicateEnd = params.isMatchEnd && _notiQueue.some(q => q.matchId === params.matchId && q.isMatchEnd);
  const isCurrentlyShowing = _notiActive && _currentNotiMatchId === params.matchId && _currentNotiIsMatchEnd && params.isMatchEnd;
  if (isDuplicateEnd || isCurrentlyShowing) {
    console.warn('[noti] Blocked duplicate noti for match', params.matchId, '— skipping');
    return;
  }

  // preload GIF ล่วงหน้าทันทีที่ queue เพื่อให้โหลดเสร็จก่อน popup โผล่
  const winnerSideQ = params.rStat === 'W' ? 'red' : params.rStat === 'L' ? 'blue' : 'draw';
  const gifUrlQ = pickGif({ tags: params.tags, rStat: params.rStat, winnerSide: winnerSideQ });
  if (gifUrlQ) {
    preloadGif(gifUrlQ);
    params._preloadedGif = gifUrlQ;
  }
  _notiQueue.push(params);
  if (!_notiActive) _processNotiQueue();
}

function _processNotiQueue() {
  if (_notiQueue.length === 0) { _notiActive = false; return; }
  _notiActive = true;
  _showMatchNotiNow(_notiQueue.shift());
}

// ── GAME 1 DONE TOAST — compact indicator, non-blocking ──
function showG1DoneToast(matchId, g1r, g1b, winnerText) {
  // ลบ toast เก่าออกก่อน
  document.querySelectorAll('.g1-toast').forEach(el => el.remove());

  const toast = document.createElement('div');
  toast.className = 'g1-toast';
  toast.innerHTML = `
    <div class="g1-toast-inner">
      <div class="g1-toast-badge">G1 จบแล้ว</div>
      <div class="g1-toast-score">
        <span style="color:var(--red);font-family:'Bebas Neue',sans-serif;font-size:1.4em;">${g1r}</span>
        <span style="color:var(--muted);font-size:1em;margin:0 4px;">:</span>
        <span style="color:var(--blue);font-family:'Bebas Neue',sans-serif;font-size:1.4em;">${g1b}</span>
      </div>
      <div class="g1-toast-label">${winnerText} ชนะ · รอ Game 2</div>
    </div>
  `;
  document.body.appendChild(toast);

  // animate in
  requestAnimationFrame(() => toast.classList.add('g1-toast-show'));

  // auto dismiss หลัง 4 วินาที
  setTimeout(() => {
    toast.classList.remove('g1-toast-show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function showMatchNoti(params) {
  queueMatchNoti(params);
}

function _showMatchNotiNow({ matchId, redNames, blueNames, g1r, g1b, g2r, g2b, gameNum, gameWinner, globalRedBefore, globalBlueBefore, pRed, pBlue, tags, isMatchEnd, rStat, _preloadedGif }) {

  // FIX-DEDUP: track what's currently on screen so queueMatchNoti can dedup
  _currentNotiMatchId = matchId;
  _currentNotiIsMatchEnd = !!isMatchEnd;

  // ── กำหนด accent สี ──
  const accentKey = gameWinner === 'red' ? 'red' : gameWinner === 'blue' ? 'blue' : 'draw';
  const box = document.getElementById('matchNotiBox');
  box.className = `noti-accent-${accentKey}`;
  document.getElementById('matchNotiGlow').className = `noti-glow-${accentKey}`;

  // ── Header ──
  document.getElementById('matchNotiMatchId').textContent = `MATCH ${matchId}`;
  document.getElementById('matchNotiStatusBadge').textContent = isMatchEnd ? '🏁 จบแมตช์' : `GAME ${gameNum} FINISHED`;

  // ── Team names — strip (G1)/(G2)/(G3) suffix, show full names ──
  const fmtNotiNames = (str) => (str||'').split(' & ').map(n => stripGroup(n.trim())).join(' & ');
  document.getElementById('matchNotiRedName').textContent = fmtNotiNames(redNames) || 'RED';
  document.getElementById('matchNotiBlueNameEl').textContent = fmtNotiNames(blueNames) || 'BLUE';

  // ── Score board — แสดงทั้ง 2 เกม ──
  const g1rWin = g1r > g1b, g1bWin = g1b > g1r, g1Draw = g1r === g1b;
  const g2rWin = g2r > g2b, g2bWin = g2b > g2r, g2Draw = g2r === g2b;

  // Game 1
  document.getElementById('mnotiG1Red').textContent = g1r;
  document.getElementById('mnotiG1Blue').textContent = g1b;
  document.getElementById('mnotiG1Red').className = `mnoti-score-cell red${g1bWin ? ' dim' : ''}`;
  document.getElementById('mnotiG1Blue').className = `mnoti-score-cell blue${g1rWin ? ' dim' : ''}`;
  const g1w = document.getElementById('mnotiG1Winner');
  if (g1rWin) { g1w.textContent = '🔴 ชนะ'; g1w.className = 'mnoti-game-winner red'; }
  else if (g1bWin) { g1w.textContent = '🔵 ชนะ'; g1w.className = 'mnoti-game-winner blue'; }
  else { g1w.textContent = 'เสมอ'; g1w.className = 'mnoti-game-winner draw'; }

  // Game 2 — แสดงเฉพาะถ้าจบ Match แล้ว
  const g2Row = document.getElementById('mnotiG2Row');
  if (isMatchEnd) {
    g2Row.style.display = 'flex';
    document.getElementById('mnotiG2Red').textContent = g2r;
    document.getElementById('mnotiG2Blue').textContent = g2b;
    document.getElementById('mnotiG2Red').className = `mnoti-score-cell red${g2bWin ? ' dim' : ''}`;
    document.getElementById('mnotiG2Blue').className = `mnoti-score-cell blue${g2rWin ? ' dim' : ''}`;
    const g2w = document.getElementById('mnotiG2Winner');
    if (g2rWin) { g2w.textContent = '🔴 ชนะ'; g2w.className = 'mnoti-game-winner red'; }
    else if (g2bWin) { g2w.textContent = '🔵 ชนะ'; g2w.className = 'mnoti-game-winner blue'; }
    else { g2w.textContent = 'เสมอ'; g2w.className = 'mnoti-game-winner draw'; }
  } else {
    g2Row.style.display = 'none';
  }

  // ── Result headline ──
  const resultLine = document.getElementById('matchNotiResultLine');
  if (isMatchEnd) {
    if (rStat === 'D') {
      resultLine.textContent = '🤝 เสมอ 1–1';
      resultLine.style.cssText = 'background:rgba(245,200,66,0.1);color:var(--gold);border:1px solid rgba(245,200,66,0.25);font-family:Bebas Neue,sans-serif;font-size:clamp(1.3em,4vw,1.8em);letter-spacing:3px;margin-bottom:12px;padding:10px 16px;border-radius:10px;line-height:1.3;';
    } else if (rStat === 'W') {
      resultLine.innerHTML = `🔴 <span style="color:var(--red)">${redNames}</span> ชนะ 2–0 <span style="color:rgba(255,255,255,0.4);font-size:0.7em">(+3 pts)</span>`;
      resultLine.style.cssText = 'background:rgba(255,59,59,0.1);color:var(--red);border:1px solid rgba(255,59,59,0.25);font-family:Bebas Neue,sans-serif;font-size:clamp(1em,3vw,1.4em);letter-spacing:2px;margin-bottom:12px;padding:10px 16px;border-radius:10px;line-height:1.3;';
    } else {
      resultLine.innerHTML = `🔵 <span style="color:var(--blue)">${blueNames}</span> ชนะ 2–0 <span style="color:rgba(255,255,255,0.4);font-size:0.7em">(+3 pts)</span>`;
      resultLine.style.cssText = 'background:rgba(59,142,255,0.1);color:var(--blue);border:1px solid rgba(59,142,255,0.25);font-family:Bebas Neue,sans-serif;font-size:clamp(1em,3vw,1.4em);letter-spacing:2px;margin-bottom:12px;padding:10px 16px;border-radius:10px;line-height:1.3;';
    }
  } else {
    resultLine.textContent = '';
    resultLine.style.cssText = '';
  }

  // ── Tags ──
  const tagHtml = tags && tags.length ? tags.map(t => `<span class="finished-tag ${t.class || 'tag-normal'}">${t.label}</span>`).join('') : '';
  document.getElementById('matchNotiTags').innerHTML = tagHtml;

  // ── Narrative / Situation Summary ──
  const tagIds = tags ? tags.map(t => t.id) : [];
  const narrative = buildNarrative({ rStat, isMatchEnd, tagIds, redNames, blueNames, g1r, g1b, g2r, g2b, gameNum, gameWinner, globalRedBefore, globalBlueBefore, pRed, pBlue });
  const notiNarrative = document.getElementById('matchNotiNarrative');
  notiNarrative.textContent = narrative;

  // ── GIF — robust display with fallback chain ──
  const winnerSide = rStat === 'W' ? 'red' : rStat === 'L' ? 'blue' : 'draw';
  const gifUrl = _preloadedGif || pickGif({ tags, rStat, winnerSide });
  const gifWrap = document.getElementById('matchNotiGifWrap');
  
  if (gifUrl) {
    gifWrap.innerHTML = '';
    
    const img = document.createElement('img');
    img.alt = 'reaction gif';
    img.style.cssText = 'width:100%;display:block;max-height:260px;object-fit:contain;background:#000;border-radius:8px;';
    
    const themeIsRed  = userTheme === 'red';
    const themeIsBlue = userTheme === 'blue';
    const viewerLost  = (themeIsRed && winnerSide === 'blue') || (themeIsBlue && winnerSide === 'red');
    
    let fallbackUrl;
    if (winnerSide === 'draw') {
      fallbackUrl = GIF_LIBRARY.draw_normal[0];
    } else if (viewerLost) {
      fallbackUrl = GIF_LIBRARY.lose_normal[0];
    } else {
      fallbackUrl = GIF_LIBRARY.win_normal[0];
    }
    
    let errorCount = 0;
    img.onerror = function() {
      errorCount++;
      if (errorCount === 1 && fallbackUrl && this.src !== fallbackUrl) {
        // First failure: try the fallback
        this.src = fallbackUrl;
      } else if (errorCount === 2) {
        // Second failure: try the most reliable static fallback
        const lastResort = 'https://media.giphy.com/media/3ohs4BSacFKI1vYSgE/giphy.gif';
        if (this.src !== lastResort) {
          this.src = lastResort;
        } else {
          // All fallbacks failed — hide wrap
          gifWrap.innerHTML = '';
        }
      } else {
        gifWrap.innerHTML = '';
      }
    };
    
    img.src = gifUrl;
    gifWrap.appendChild(img);
  } else {
    gifWrap.innerHTML = '';
  }

  // ── Overall score + แต้มที่ได้ ──
  const newRed = globalRedBefore + pRed;
  const newBlue = globalBlueBefore + pBlue;
  const ptsRedStr = pRed > 0 ? ` <span style="color:var(--red);font-size:0.85em">(+${pRed})</span>` : '';
  const ptsBluStr = pBlue > 0 ? ` <span style="color:var(--blue);font-size:0.85em">(+${pBlue})</span>` : '';
  const gap = Math.abs(newRed - newBlue);
  let gapStr = '';
  if (gap > 0) {
    const leadColor = newRed > newBlue ? 'var(--red)' : 'var(--blue)';
    gapStr = ` <span style="color:${leadColor};font-size:0.85em;font-weight:800;">🔺นำห่าง ${gap} แต้ม</span>`;
  }
  document.getElementById('matchNotiOverallScore').innerHTML =
    `<span style="color:var(--muted);font-size:12px;letter-spacing:2px;font-weight:700;">คะแนนทีมรวม</span><br>` +
    `<span style="color:var(--red);font-weight:800;font-size:1.8em;">${newRed}</span>${ptsRedStr}` +
    `<span style="color:var(--muted);margin:0 10px;font-size:1.3em;">:</span>` +
    `<span style="color:var(--blue);font-weight:800;font-size:1.8em;">${newBlue}</span>${ptsBluStr}` +
    `<br>${gapStr}`;

  // ── Close button ──
  const queueLen = _notiQueue.length;
  document.getElementById('matchNotiClose').textContent = queueLen > 0 ? `ถัดไป (+${queueLen})` : 'ปิด';

  document.getElementById('matchNotiProgressBar').style.transition = 'none';
  document.getElementById('matchNotiProgressBar').style.width = '100%';
  document.getElementById('matchNotiOverlay').classList.add('open');

  // ── Auto-dismiss: 40 วินาที สำหรับ match จบ, 6 วินาทีสำหรับ G1 ──
  const dismissDelay = isMatchEnd ? 40000 : 6000;
  if (_notiDismissTimer) clearTimeout(_notiDismissTimer);

  // Animate progress bar
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const bar = document.getElementById('matchNotiProgressBar');
      if (bar) {
        bar.style.transition = `width ${dismissDelay}ms linear`;
        bar.style.width = '0%';
      }
    });
  });

  _notiDismissTimer = setTimeout(() => {
    closeMatchNoti();
  }, dismissDelay);
}

// ── NARRATIVE BUILDER ──
function buildNarrative({ rStat, isMatchEnd, tagIds, redNames, blueNames, g1r, g1b, g2r, g2b, gameNum, gameWinner, globalRedBefore, globalBlueBefore, pRed, pBlue }) {
  // ── Game 1 จบ (ยังไม่จบ Match) ──
  if (!isMatchEnd) {
    const score  = gameNum === 1 ? `${g1r}–${g1b}` : `${g2r}–${g2b}`;
    const winner = gameWinner === 'red' ? redNames : gameWinner === 'blue' ? blueNames : null;
    if (gameWinner === 'draw') return `เกมที่ ${gameNum} เสมอกัน ${score} — เกมต่อไปจะชี้ขาด!`;
    const margin = gameWinner === 'red' ? g1r - g1b : g1b - g1r;
    if (margin >= 8) return `${winner} กวาดชัยเกม ${gameNum} ได้อย่างขาดลอย ${score} — มาดูว่าเกม 2 จะรักษาฟอร์มได้ไหม`;
    return `${winner} เอาไปก่อน ${score} — เกมต่อไปตัดสิน!`;
  }

  // ── Match จบ ──
  const totalR  = g1r + g2r, totalB = g1b + g2b;
  const isDraw  = rStat === 'D';
  const winTeam  = rStat === 'W' ? redNames  : rStat === 'L' ? blueNames : null;
  const loseTeam = rStat === 'W' ? blueNames : rStat === 'L' ? redNames  : null;

  // ── ต้อง declare ก่อน comebackTeam ──
  const hasEpicRed       = tagIds.some(t => t.includes('epic') && t.includes('red'));
  const hasEpicBlue      = tagIds.some(t => t.includes('epic') && t.includes('blue'));
  const hasEpic          = hasEpicRed || hasEpicBlue;
  const hasBlowout       = tagIds.includes('blowout');
  const hasClutch        = tagIds.includes('clutch');
  const hasRollercoaster = tagIds.includes('rollercoaster');
  const hasMarathon      = tagIds.includes('marathon');
  const hasFlawlessR     = tagIds.includes('flawless_red');
  const hasFlawlessB     = tagIds.includes('flawless_blue');

  const comebackTeam = hasEpicRed ? redNames : hasEpicBlue ? blueNames : winTeam;

  let gameLine = '';
  if (!isDraw) {
    if (hasBlowout && (hasFlawlessR || hasFlawlessB))
      gameLine = `${winTeam} โดดเด่นอย่างสมบูรณ์แบบ — ครองทั้ง 2 เกมด้วยคะแนนรวม ${totalR}:${totalB} ไม่เปิดโอกาสให้คู่แข่งแม้แต่น้อย`;
    else if (hasBlowout)
      gameLine = `${winTeam} ควบคุมเกมได้อย่างเด็ดขาด — คะแนนรวม ${totalR}:${totalB} บอกเล่าความเหนือชั้นได้ชัดเจน`;
    else if (hasEpic && hasClutch)
      gameLine = `ดราม่าสูงสุด! ${comebackTeam} พลิกสถานการณ์กลับมา${winTeam?"ชนะ":"เสมอ"}ในเกมที่เฉียดฉิวสุดขีด — คะแนนรวม ${totalR}:${totalB}`;
    else if (hasEpic)
      gameLine = `${comebackTeam} ล้มแล้วลุกได้อย่างน่าทึ่ง — พลิกเกมกลับมา${winTeam?"จนชนะแมตช์":"จนเสมอ"} คะแนนรวม ${totalR}:${totalB}`;
    else if (hasMarathon && hasClutch)
      gameLine = `แมตช์มาราธอนสุดสูสี! ทั้งสองทีมสู้กันถึงขั้น Deuce — ${winTeam} ผ่านมาได้ด้วยความทรหด`;
    else if (hasMarathon)
      gameLine = `แมตช์ยืดยาวเกินปกติ — ${winTeam} คว้าชัยมาได้หลังสู้กันมาอย่างยาวนาน`;
    else if (hasClutch)
      gameLine = `เฉียดฉิวมาก! ${winTeam} เอาชนะ ${loseTeam} ในแมตช์ที่ต่างฝ่ายต่างไม่ยอมแพ้ง่ายๆ — คะแนนรวม ${totalR}:${totalB}`;
    else
      gameLine = `${winTeam} เอาชนะ ${loseTeam} ได้สำเร็จ — คะแนนรวม ${totalR}:${totalB}`;
  } else {
    if (hasRollercoaster && hasClutch)
      gameLine = `โรลเลอร์โคสเตอร์สุดขีด! ทั้งสองทีมผลัดกันนำคนละเกม แล้วยังสูสีสุดๆในทุก set — แมตช์นี้ไม่มีผู้แพ้จริงๆ`;
    else if (hasRollercoaster)
      gameLine = `สลับกันนำคนละเกม! ${redNames} ชนะ G1 ส่วน ${blueNames} ตีเสมอใน G2 — แต้มรวม ${totalR}:${totalB}`;
    else if (hasClutch)
      gameLine = `เสมอในแบบที่ทุกคนประทับใจ — ทั้งสองทีมทุ่มสุดตัว ไม่มีใครยอมใครสักนิด`;
    else
      gameLine = `ผลเสมอ 1–1 — ทั้งสองทีมแบ่งคะแนนกันไปทีมละ 1 แต้ม`;
  }

  // ── บรรยายสถานการณ์คะแนนทีม ──
  const situationLine = buildTeamSituationLine({
    redNames, blueNames,
    prevR: globalRedBefore || 0,
    prevB: globalBlueBefore || 0,
    newRed:  (globalRedBefore  || 0) + (pRed  || 0),
    newBlue: (globalBlueBefore || 0) + (pBlue || 0),
    isDraw, rStat, pRed: pRed || 0, pBlue: pBlue || 0
  });

  return situationLine ? `${gameLine}

${situationLine}` : gameLine;
}

// ── TEAM SITUATION LINE ──
function buildTeamSituationLine({ redNames, blueNames, prevR, prevB, newRed, newBlue, isDraw, rStat, pRed, pBlue }) {
  const prevGap = prevR - prevB;
  const newGap  = newRed - newBlue;
  const absPrev = Math.abs(prevGap);
  const absNew  = Math.abs(newGap);

  const rLeadsBefore = prevGap > 0, bLeadsBefore = prevGap < 0, tiedBefore = prevGap === 0;
  const rLeadsAfter  = newGap  > 0, bLeadsAfter  = newGap  < 0, tiedAfter  = newGap  === 0;

  // ── แมตช์แรก ยังไม่มีแต้มก่อนหน้า ──
  if (prevR === 0 && prevB === 0) {
    if (tiedAfter)
      return `📊 เปิดสนามด้วยผลเสมอ — คะแนนทีมยังเท่ากัน ${newRed}:${newBlue}`;
    if (rLeadsAfter)
      return `📊 ${redNames} ขึ้นนำเป็นทีมแรก ${newRed}:${newBlue} ในการแข่งขันนี้!`;
    return `📊 ${blueNames} ขึ้นนำเป็นทีมแรก ${newBlue}:${newRed} ในการแข่งขันนี้!`;
  }

  // ── ทีมที่แพ้ตีกลับมาเสมอ ──
  if (tiedAfter && !tiedBefore) {
    const who = rStat === 'W' ? redNames : rStat === 'L' ? blueNames : null;
    if (who) return `📊 ${who} ตีตื้นกลับมาเสมอได้แล้ว! คะแนนทีมเท่ากันที่ ${newRed}:${newBlue}`;
    return `📊 คะแนนทีมกลับมาเสมอกันที่ ${newRed}:${newBlue}`;
  }

  // ── พลิกนำ ──
  if (rLeadsAfter && bLeadsBefore)
    return `📊 พลิกสถานการณ์! ${redNames} พลิกขึ้นนำ ${newRed}:${newBlue} — จากที่เคยตามหลังอยู่`;
  if (bLeadsAfter && rLeadsBefore)
    return `📊 พลิกสถานการณ์! ${blueNames} พลิกขึ้นนำ ${newBlue}:${newRed} — จากที่เคยตามหลังอยู่`;

  // ── ขยายช่องว่าง ──
  if (rLeadsAfter && rLeadsBefore && absNew > absPrev) {
    if (absNew >= 9)
      return `📊 ${redNames} ถลำนำห่างออกไปเรื่อยๆ — ${newRed}:${newBlue} ห่าง ${absNew} แต้ม`;
    return `📊 ${redNames} ขยายช่องว่าง — นำ ${newRed}:${newBlue} (ห่างขึ้นจาก ${absPrev} → ${absNew} แต้ม)`;
  }
  if (bLeadsAfter && bLeadsBefore && absNew > absPrev) {
    if (absNew >= 9)
      return `📊 ${blueNames} ถลำนำห่างออกไปเรื่อยๆ — ${newBlue}:${newRed} ห่าง ${absNew} แต้ม`;
    return `📊 ${blueNames} ขยายช่องว่าง — นำ ${newBlue}:${newRed} (ห่างขึ้นจาก ${absPrev} → ${absNew} แต้ม)`;
  }

  // ── ตีตื้นขึ้นมา แต่ยังตามอยู่ ──
  if (rLeadsAfter && rLeadsBefore && absNew < absPrev)
    return `📊 ${blueNames} ตีตื้นขึ้นมา — ยังตามอยู่ ${newRed}:${newBlue} (ห่างเหลือ ${absNew} แต้ม)`;
  if (bLeadsAfter && bLeadsBefore && absNew < absPrev)
    return `📊 ${redNames} ตีตื้นขึ้นมา — ยังตามอยู่ ${newBlue}:${newRed} (ห่างเหลือ ${absNew} แต้ม)`;

  // ── นำห่างมากอยู่แล้ว คะแนนไม่ขยับ (Draw ฝั่งนำ) ──
  // gap ที่เป็นไปได้: 0, 2, 3, 4, 6, 7, 8, 9... (ไม่มี 1 เพราะ W=+3, D=+1 ทั้งคู่, L=+0)
  if (rLeadsAfter && absNew >= 6)
    return `📊 ${redNames} ยังคงนำห่าง — ${newRed}:${newBlue} ห่าง ${absNew} แต้ม`;
  if (bLeadsAfter && absNew >= 6)
    return `📊 ${blueNames} ยังคงนำห่าง — ${newBlue}:${newRed} ห่าง ${absNew} แต้ม`;

  // ── เสมออยู่แล้วและยังเสมอ ──
  if (tiedAfter && tiedBefore)
    return `📊 ยังสูสีกัน — คะแนนทีมเสมอกันที่ ${newRed}:${newBlue}`;

  // ── สูสี (gap 2-3 แต้ม เท่านั้นที่เป็นไปได้ในช่วงนี้) ──
  if (rLeadsAfter && absNew <= 3)
    return `📊 ${redNames} นำสูสีมาก — ${newRed}:${newBlue} ห่างกันแค่ ${absNew} แต้ม`;
  if (bLeadsAfter && absNew <= 3)
    return `📊 ${blueNames} นำสูสีมาก — ${newBlue}:${newRed} ห่างกันแค่ ${absNew} แต้ม`;

  // fallback
  return `📊 คะแนนทีมปัจจุบัน — 🔴 ${newRed} : 🔵 ${newBlue}`;
}

function closeMatchNoti() {
  document.getElementById('matchNotiOverlay').classList.remove('open');
  if (_notiDismissTimer) { clearTimeout(_notiDismissTimer); _notiDismissTimer = null; }
  // FIX-DEDUP: clear tracking vars when noti closes
  _currentNotiMatchId = null;
  _currentNotiIsMatchEnd = false;
  // ถ้ามีในคิว ให้แสดงอันต่อไปหลัง 300ms (รอ animation ปิด)
  if (_notiQueue.length > 0) {
    setTimeout(_processNotiQueue, 300);
  } else {
    _notiActive = false;
  }
}

// ── CUSTOM CONFIRM DIALOG ──
let _confirmCallback = null;
function showConfirmDialog(msg, onOk) {
  const modal = document.getElementById('confirmDialogModal');
  document.getElementById('confirmDialogMsg').textContent = msg;
  _confirmCallback = onOk;
  modal.style.display = 'flex';
  document.getElementById('confirmDialogOK').onclick = function() {
    const cb = _confirmCallback; 
    closeConfirmDialog();        
    if (cb) cb();                
  };
}
function closeConfirmDialog() {
  document.getElementById('confirmDialogModal').style.display = 'none';
  _confirmCallback = null;
}

