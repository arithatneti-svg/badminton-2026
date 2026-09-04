// ── BADMINTON SCORE VALIDATION ──
function isValidBadmintonScore(a, b) {
  // ต้องได้อย่างน้อย 21 และนำ 2 แต้ม หรือจบที่ 30:29
  if (a < 0 || b < 0) return false;
  const winner = Math.max(a, b);
  const loser  = Math.min(a, b);
  if (winner < 21) return false;          // ยังไม่ถึง 21
  if (winner === 30 && loser === 29) return true;  // cap 30:29
  if (winner > 30 || loser > 29) return false;    // เกิน cap
  if (winner - loser < 2) return false;   // นำไม่พอ 2 แต้ม
  return true;
}

function scoreValidationMsg(a, b, label) {
  if (a < 0 || b < 0) return `${label}: คะแนนติดลบไม่ได้`;
  const winner = Math.max(a, b), loser = Math.min(a, b);
  if (winner < 21) return `${label}: ต้องได้อย่างน้อย 21 แต้มก่อนจบ (ตอนนี้ ${winner})`;
  if (winner - loser < 2) return `${label}: ต้องนำห่างอย่างน้อย 2 แต้ม (${a}:${b})`;
  if (winner > 30 || (winner === 30 && loser !== 29)) return `${label}: คะแนนสูงสุดคือ 30:29`;
  return null;
}

// ── MANUAL RESULT ENTRY (ADMIN FORCE RESULT) ──
// Shared result calculator so the live preview shows EXACTLY what will be saved.
function _calcResult(g1R, g1B, g2R, g2B) {
  let rWin = 0, bWin = 0;
  if (g1R > g1B) rWin++; else if (g1B > g1R) bWin++; else { rWin += 0.5; bWin += 0.5; }
  if (g2R > g2B) rWin++; else if (g2B > g2R) bWin++; else { rWin += 0.5; bWin += 0.5; }
  let pRed = 0, pBlue = 0, rStat = '', bStat = '', resText = '';
  if (rWin > bWin)      { pRed = 3;  rStat = 'W'; bStat = 'L'; resText = '🔴 Red Win 2–0 (+3pts)'; }
  else if (bWin > rWin) { pBlue = 3; rStat = 'L'; bStat = 'W'; resText = '🔵 Blue Win 2–0 (+3pts)'; }
  else if (rWin === 1 && bWin === 1) { pRed = 1; pBlue = 1; rStat = 'D'; bStat = 'D'; resText = '🤝 เสมอ 1–1 (+1pt each)'; }
  else {
    const pdRed = (g1R - g1B) + (g2R - g2B), pdBlue = -pdRed;
    if (pdRed > 0)      { pRed = 3;  rStat = 'W'; bStat = 'L'; resText = `🔴 Red Win (Point Diff +${pdRed}) (+3pts)`; }
    else if (pdBlue > 0){ pBlue = 3; rStat = 'L'; bStat = 'W'; resText = `🔵 Blue Win (Point Diff +${pdBlue}) (+3pts)`; }
    else                { pRed = 1;  pBlue = 1;  rStat = 'D'; bStat = 'D'; resText = '🤝 Perfect Draw (+1pt each)'; }
  }
  return { pRed, pBlue, rStat, bStat, resText };
}

// Build the RED-vs-BLUE header with avatars for the Force Result modal.
function _forceTeamsHtml(m) {
  const names = s => (s || '').split(' & ').map(x => stripGroup(x.trim()));
  const red = names(m.redNames), blue = names(m.blueNames);
  const redIds = [m.r1, m.r2], blueIds = [m.b1, m.b2];
  const row = (id, nm) => `<div class="fr-p">${avatarHtml(id, 26)}<span class="fr-pn">${escHtml(nm)}</span></div>`;
  return `<div class="fr-team red"><span class="fr-tlabel">🔴 RED</span>${red.map((n, i) => row(redIds[i], n)).join('')}</div>
    <span class="fr-vs">VS</span>
    <div class="fr-team blue"><span class="fr-tlabel">BLUE 🔵</span>${blue.map((n, i) => row(blueIds[i], n)).join('')}</div>`;
}

// Live result preview — recomputed on every keystroke so there is no surprise
// "Preview" step: the admin sees the outcome, then saves in one click.
function updateForceLiveResult() {
  const box = document.getElementById('forceLiveResult');
  if (!box) return;
  const g1Re = document.getElementById('g1Red').value, g1Bl = document.getElementById('g1Blue').value;
  if (g1Re === '' || g1Bl === '') {
    box.className = 'fr-live';
    box.innerHTML = `<span class="lbl">ผลลัพธ์การแข่ง</span><span class="val">— กรอกคะแนน Game 1 —</span>`;
    return;
  }
  const g1R = parseInt(g1Re) || 0, g1B = parseInt(g1Bl) || 0;
  const g2R = parseInt(document.getElementById('g2Red').value) || 0, g2B = parseInt(document.getElementById('g2Blue').value) || 0;
  const r = _calcResult(g1R, g1B, g2R, g2B);
  const cls = r.rStat === 'W' ? 'red' : r.rStat === 'L' ? 'blue' : 'gold';
  const label = r.resText.replace(/\s*\(\+.*?\)\s*$/, '').trim();  // drop the "(+3pts)" suffix
  const pts = r.rStat === 'D' ? '+1 แต้ม/ทีม' : '+3 แต้ม';
  box.className = 'fr-live ' + cls;
  box.innerHTML = `<span class="lbl">ผลลัพธ์การแข่ง</span><span class="val">${label}</span><span class="pts">${pts}</span>`;
}

function openResultModal(mId) {
    const m = appState.ongoingMatches.find(x => x.id === mId);
    if(!m) return;
    document.getElementById('currentMatchId').value = mId;
    document.getElementById('forceMatchSub').innerHTML = `Match <b>${escHtml(m.id)}</b> · Round <b>${escHtml(String(m.round))}</b>`;
    document.getElementById('forceTeams').innerHTML = _forceTeamsHtml(m);
    ['g1Red','g1Blue','g2Red','g2Blue'].forEach(id => document.getElementById(id).value = '');
    updateForceLiveResult();
    document.getElementById('resultModal').classList.add('open');
}

function closeModal() { document.getElementById('resultModal').classList.remove('open'); }

let _pendingResult = null;
function previewResult() {
  const mId = document.getElementById('currentMatchId').value; 
  const m = appState.ongoingMatches.find(x => x.id === mId);
  // ดึงค่าโดยแปลงเป็นตัวเลขเสมอ
  const g1R = parseInt(document.getElementById('g1Red').value) || 0, g1B = parseInt(document.getElementById('g1Blue').value) || 0; 
  const g2R = parseInt(document.getElementById('g2Red').value) || 0, g2B = parseInt(document.getElementById('g2Blue').value) || 0;
  if ([g1R,g1B,g2R,g2B].some(s => s < 0 || s > 30)) return showToast('❌ คะแนนต้องอยู่ระหว่าง 0–30', 'error');
  
  if (document.getElementById('g1Red').value === '' || document.getElementById('g1Blue').value === '') return showToast('กรุณากรอกคะแนนให้ครบ', 'error');

  // คะแนนไม่เข้ากติกา 21 แต้มมาตรฐาน (เกมสั้น/ยอมแพ้/exhibition) → เตือนแต่ให้บันทึกต่อได้ ไม่ block
  const hasG2 = document.getElementById('g2Red').value !== '' || document.getElementById('g2Blue').value !== '';
  const _scoreWarns = [
    scoreValidationMsg(g1R, g1B, 'Game 1'),
    hasG2 ? scoreValidationMsg(g2R, g2B, 'Game 2') : null,
  ].filter(Boolean);
  const { pRed, pBlue, rStat, bStat, resText } = _calcResult(g1R, g1B, g2R, g2B);
  if (!m) return showToast('❌ Match not found', 'error');
  _pendingResult = { mId, m, g1R, g1B, g2R, g2B, pRed, pBlue, rStat, bStat, resText };
  const _warnHtml = _scoreWarns.length
    ? `<div style="margin-top:10px;color:var(--gold);font-size:12px;line-height:1.6;background:rgba(245,200,66,0.08);border:1px solid rgba(245,200,66,0.25);border-radius:8px;padding:8px 12px;">⚠️ คะแนนไม่เข้ากติกา 21 แต้มมาตรฐาน:<br>${_scoreWarns.join('<br>')}<br><b>กด Confirm เพื่อบันทึกตามนี้ได้เลย</b></div>`
    : '';
  document.getElementById('confirmText').innerHTML = resText + `<br><span style="color:var(--muted);font-size:16px;">${g1R}:${g1B} / ${g2R}:${g2B}</span>` + _warnHtml;
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); _pendingResult = null; }

function finalizeResult() {
  if (!_pendingResult) return;
  const { mId, m, g1R, g1B, g2R, g2B, pRed, pBlue, rStat, bStat, resText } = _pendingResult; 
  const matchDuration = getCourtElapsed(mId);
  appState.globalScoreRed += pRed; appState.globalScoreBlue += pBlue;
  
  const analysis = analyzeSkillGap(g1R, g1B, g2R, g2B, rStat, mId, m ? m.potFlags : null);
  appState.matchHistory.push({ id: m.id, round: m.round, r1: m.r1, r2: m.r2, b1: m.b1, b2: m.b2, redNames: m.redNames, blueNames: m.blueNames, game1: `${g1R}:${g1B}`, game2: `${g2R}:${g2B}`, result: resText, pRed, pBlue, rStat, bStat, duration: matchDuration, analysis: analysis, umpire: m.umpire || 'Admin (Force)' });
  
  appState.ongoingMatches = appState.ongoingMatches.filter(x => x.id !== mId);
  _pendingResult = null;
  document.getElementById('confirmModal').classList.remove('open');
  closeModal();
  // Refresh the UI locally instead of waiting for the Firebase echo — otherwise
  // a dropped/slow connection leaves the score looking un-updated even though the
  // write is queued and will sync on reconnect. Mirrors autoFinalizeMatchFromUmpire.
  invalidateStatsCache();
  _adminJustFinalized = true;   // stop the eventual echo from re-showing the noti
  saveData(true);
  updateUI();
  showToast(resText, 'success');
  playSound('point');

  // ── NOTIFICATION ──
  const globalRedBefore = appState.globalScoreRed - pRed;
  const globalBlueBefore = appState.globalScoreBlue - pBlue;
  const gWinner = rStat === 'W' ? 'red' : rStat === 'L' ? 'blue' : 'draw';
  // แสดง game 1 noti ก่อนถ้า game 2 มีคะแนน แล้วค่อย match end
  // Best-of-2: แสดง notification เฉพาะตอนจบ Match เท่านั้น
  showMatchNoti({ matchId: m.id, redNames: m.redNames, blueNames: m.blueNames, g1r: g1R, g1b: g1B, g2r: g2R, g2b: g2B, gameNum: 2, gameWinner: gWinner, globalRedBefore, globalBlueBefore, pRed, pBlue, tags: analysis.tags, isMatchEnd: true, rStat });
}

// ── AUTO-FINALIZE FROM UMPIRE ──
const _finalizingMatches = new Set();
function autoFinalizeMatchFromUmpire(cmd) {
  const m = appState.ongoingMatches.find(x => x.id === cmd.mId); if (!m) return;
  if (_finalizingMatches.has(cmd.mId)) return;
  _finalizingMatches.add(cmd.mId);
  
  // ให้ความสำคัญกับคะแนนที่แนบมากับ cmd ก่อน ถ้าไม่มีให้ดึงจาก m.live โดยแปลงเป็นตัวเลขเสมอ
  const src = cmd.g1R !== undefined ? cmd : (m.live || {});
  const g1r = Number(src.g1R || 0), g1b = Number(src.g1B || 0);
  const g2r = Number(src.g2R || 0), g2b = Number(src.g2B || 0);

  // รับคะแนนไม่มาตรฐานได้ (กรรมการตัดสินว่าจบแล้ว) — block เฉพาะกรณีไม่มีคะแนนเลย
  if (g1r === 0 && g1b === 0 && g2r === 0 && g2b === 0) {
    _finalizingMatches.delete(cmd.mId);
    showToast(`❌ ยังไม่มีคะแนน (${cmd.mId}) — ไม่บันทึกผล`, 'error');
    return;
  }

  let rWin = 0, bWin = 0; 
  if (g1r > g1b) rWin++; else if (g1b > g1r) bWin++; else { rWin += 0.5; bWin += 0.5; } 
  if (g2r > g2b) rWin++; else if (g2b > g2r) bWin++; else { rWin += 0.5; bWin += 0.5; }

  let pRed = 0, pBlue = 0, rStat = '', bStat = '', resText = '';
  if (rWin > bWin) { pRed = 3; rStat = 'W'; bStat = 'L'; resText = '🔴 Red Win 2–0 (+3pts)'; }
  else if (bWin > rWin) { pBlue = 3; rStat = 'L'; bStat = 'W'; resText = '🔵 Blue Win 2–0 (+3pts)'; }
  else {
    if (rWin === 1 && bWin === 1) { pRed=1; pBlue=1; rStat='D'; bStat='D'; resText='🤝 เสมอ 1–1 (+1pt each)'; }
    else {
      const pdRed = (g1r - g1b) + (g2r - g2b);
      const pdBlue = -pdRed;
      if (pdRed > 0) { pRed = 3; rStat = 'W'; bStat = 'L'; resText = `🔴 Red Win (Point Diff +${pdRed}) (+3pts)`; }
      else if (pdBlue > 0) { pBlue = 3; rStat = 'L'; bStat = 'W'; resText = `🔵 Blue Win (Point Diff +${pdBlue}) (+3pts)`; }
      else { pRed = 1; pBlue = 1; rStat = 'D'; bStat = 'D'; resText = '🤝 Perfect Draw (+1pt each)'; }
    }
  }
  
  const matchDuration = getCourtElapsed(cmd.mId); 
  appState.globalScoreRed += pRed; appState.globalScoreBlue += pBlue; 
  
  const analysis = analyzeSkillGap(g1r, g1b, g2r, g2b, rStat, cmd.mId, m.potFlags);
  appState.matchHistory.push({ id: m.id, round: m.round, r1: m.r1, r2: m.r2, b1: m.b1, b2: m.b2, redNames: m.redNames, blueNames: m.blueNames, game1: `${g1r}:${g1b}`, game2: `${g2r}:${g2b}`, result: resText, pRed, pBlue, rStat, bStat, duration: matchDuration, analysis, umpire: m.umpire || cmd.umpire || 'System' });
  appState.ongoingMatches = appState.ongoingMatches.filter(x => x.id !== cmd.mId);
  _finalizingMatches.delete(cmd.mId); // release lock immediately after success
  invalidateStatsCache(); // stats เปลี่ยนแล้ว
  _adminJustFinalized = true; // FIX: block dbRef.on echo from queuing duplicate noti
  saveData(true);
  updateUI();
  showToast(`✅ Match ${m.id} Auto-Closed by Umpire`, 'success');
  playSound('point');

  const umpHasG2 = g2r > 0 || g2b > 0;
  const lastGr = umpHasG2 ? g2r : g1r;
  const lastGb = umpHasG2 ? g2b : g1b;
  const lastGameWinner = lastGr > lastGb ? 'red' : lastGb > lastGr ? 'blue' : 'draw';
  const globalRedBefore2 = (appState.globalScoreRed || 0) - pRed;
  const globalBlueBefore2 = (appState.globalScoreBlue || 0) - pBlue;
  // แสดง noti ทันที — _justAutoFinalized flag จะป้องกัน dbRef.on แสดงซ้ำ
  showMatchNoti({ matchId: m.id, redNames: m.redNames, blueNames: m.blueNames, g1r, g1b, g2r, g2b, gameNum: 2, gameWinner: lastGameWinner, globalRedBefore: globalRedBefore2, globalBlueBefore: globalBlueBefore2, pRed, pBlue, tags: analysis.tags, isMatchEnd: true, rStat });
}

// ── EDIT & DELETE FINISHED MATCH (ADMIN) ──
function openEditResult(historyId) {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  const h = appState.matchHistory.find(x => x.id === historyId); if (!h) return;
  document.getElementById('editMatchHistoryId').value = historyId; document.getElementById('editModalMatchInfo').innerHTML = `<strong style="color:var(--text)">Match ${h.id} · Round ${h.round}</strong><br><br><span class="red-text">🔴 ${h.redNames}</span><br><span style="color:var(--muted)">vs</span><br><span class="blue-text">🔵 ${h.blueNames}</span><br><br><span style="color:var(--muted);font-size:12px;">Current: ${h.game1} / ${h.game2} → ${(h.result||'').replace(/[🔴🔵🤝]/g,'').trim()}</span>`;
  const [g1r,g1b] = (h.game1||'0:0').split(':'); const [g2r,g2b] = (h.game2||'0:0').split(':');
  document.getElementById('eg1Red').value = g1r; document.getElementById('eg1Blue').value = g1b; document.getElementById('eg2Red').value = g2r; document.getElementById('eg2Blue').value = g2b;
  // populate player selectors
  const allPlayers = appState.players || [];
  const redPlayers  = allPlayers.filter(p => p.team === 'Red');
  const bluePlayers = allPlayers.filter(p => p.team === 'Blue');
  const makeOpts = (players, selId) => `<option value="">-- เลือกผู้เล่น --</option>` + players.map(p => `<option value="${p.id}" ${p.id===selId?'selected':''}>${escHtml(p.name)} (G${p.group})</option>`).join('');
  document.getElementById('editR1').innerHTML = makeOpts(redPlayers,  h.r1);
  document.getElementById('editR2').innerHTML = makeOpts(redPlayers,  h.r2);
  document.getElementById('editB1').innerHTML = makeOpts(bluePlayers, h.b1);
  document.getElementById('editB2').innerHTML = makeOpts(bluePlayers, h.b2);
  document.getElementById('editResultModal').classList.add('open');
}
function closeEditModal() { document.getElementById('editResultModal').classList.remove('open'); }
function submitEditResult() {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  const histId = document.getElementById('editMatchHistoryId').value; const idx = appState.matchHistory.findIndex(x => x.id === histId); if (idx < 0) return; const old = appState.matchHistory[idx];
  const g1R = parseInt(document.getElementById('eg1Red').value)||0, g1B = parseInt(document.getElementById('eg1Blue').value)||0; const g2R = parseInt(document.getElementById('eg2Red').value)||0, g2B = parseInt(document.getElementById('eg2Blue').value)||0;
  
  if (document.getElementById('eg1Red').value === '' || document.getElementById('eg1Blue').value === '') return showToast('กรุณากรอกคะแนน Game 1', 'error');
  // คะแนนไม่มาตรฐานก็แก้ได้ (superadmin แก้ข้อมูลเอง) — ไม่ block

  // player reassignment
  const newR1 = document.getElementById('editR1').value || old.r1;
  const newR2 = document.getElementById('editR2').value || old.r2;
  const newB1 = document.getElementById('editB1').value || old.b1;
  const newB2 = document.getElementById('editB2').value || old.b2;
  if (newR1 === newR2) return showToast('❌ Red Team: ผู้เล่น 2 คนต้องไม่ซ้ำกัน', 'error');
  if (newB1 === newB2) return showToast('❌ Blue Team: ผู้เล่น 2 คนต้องไม่ซ้ำกัน', 'error');
  const getP = id => (appState.players||[]).find(p=>p.id===id);
  const p_r1=getP(newR1),p_r2=getP(newR2),p_b1=getP(newB1),p_b2=getP(newB2);
  if (!p_r1||!p_r2||!p_b1||!p_b2) return showToast('❌ ไม่พบข้อมูลผู้เล่น', 'error');
  const newRedNames = `${p_r1.name} (G${p_r1.group}) & ${p_r2.name} (G${p_r2.group})`;
  const newBlueNames = `${p_b1.name} (G${p_b1.group}) & ${p_b2.name} (G${p_b2.group})`;
  
  let rWin = 0, bWin = 0; if (g1R > g1B) rWin++; else if (g1B > g1R) bWin++; else { rWin += 0.5; bWin += 0.5; } if (g2R > g2B) rWin++; else if (g2B > g2R) bWin++; else { rWin += 0.5; bWin += 0.5; }
  let pRed = 0, pBlue = 0, rStat = '', bStat = '', resText = '';
  if (rWin > bWin) { pRed = 3; rStat = 'W'; bStat = 'L'; resText = '🔴 Red Win 2–0 (+3pts)'; } else if (bWin > rWin){ pBlue = 3; rStat = 'L'; bStat = 'W'; resText = '🔵 Blue Win 2–0 (+3pts)'; }
  else if (rWin===1 && bWin===1) { pRed=1; pBlue=1; rStat='D'; bStat='D'; resText='🤝 เสมอ 1–1 (+1pt each)'; }
  else {
    const pdR = (g1R - g1B) + (g2R - g2B); const pdB = -pdR;
    if (pdR > 0) { pRed = 3; rStat = 'W'; bStat = 'L'; resText = `🔴 Red Win (Point Diff +${pdR}) (+3pts)`; }
    else if (pdB > 0) { pBlue = 3; rStat = 'L'; bStat = 'W'; resText = `🔵 Blue Win (Point Diff +${pdB}) (+3pts)`; }
    else { pRed = 1; pBlue = 1; rStat = 'D'; bStat = 'D'; resText = '🤝 Perfect Draw (+1pt each)'; }
  }
  appState.globalScoreRed = Math.max(0, appState.globalScoreRed - (old.pRed||0) + pRed); appState.globalScoreBlue = Math.max(0, appState.globalScoreBlue - (old.pBlue||0) + pBlue);
  appState.matchHistory[idx] = { ...old, r1:newR1, r2:newR2, b1:newB1, b2:newB2, redNames:newRedNames, blueNames:newBlueNames, game1: `${g1R}:${g1B}`, game2: `${g2R}:${g2B}`, result: resText, pRed, pBlue, rStat, bStat, analysis: analyzeSkillGap(g1R, g1B, g2R, g2B, rStat, histId, old.analysis ? old.analysis.potFlags : null) };
  closeEditModal(); invalidateStatsCache(); saveData(true); showToast('Match updated ✓ (ผู้เล่น + คะแนน)', 'success');
}

function deleteFinishedMatch(mId) {
  if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
  showConfirmDialog(`Permanently delete match ${mId}?\nScores will be reverted.`, function() {
    const idx = appState.matchHistory.findIndex(m => m.id === mId);
    if (idx === -1) return;
    const old = appState.matchHistory[idx];
    appState.globalScoreRed = Math.max(0, appState.globalScoreRed - (old.pRed || 0));
    appState.globalScoreBlue = Math.max(0, appState.globalScoreBlue - (old.pBlue || 0));
    appState.matchHistory.splice(idx, 1);
    saveData(true); showToast(`Match ${mId} deleted`, 'success');
  });
}

// ── EDIT TAGS (ADMIN) ──
function openEditTagsModal(historyId) {
    if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
    const h = appState.matchHistory.find(x => x.id === historyId); if (!h) return;
    
    document.getElementById('editTagsMatchId').value = historyId;
    document.getElementById('editTagsMatchInfo').innerHTML = `<strong style="color:var(--text)">Match ${h.id}</strong><br><span class="red-text">${h.redNames}</span> vs <span class="blue-text">${h.blueNames}</span>`;
    
    document.querySelectorAll('.tag-checkbox-item input').forEach(cb => cb.checked = false);
    
    if (h.analysis && h.analysis.tags) {
        const existingIds = h.analysis.tags.map(t => t.id);
        document.querySelectorAll('.tag-checkbox-item input').forEach(cb => {
            if (existingIds.includes(cb.value)) cb.checked = true;
        });
    }
    document.getElementById('editTagsModal').classList.add('open');
}

function closeEditTagsModal() {
    document.getElementById('editTagsModal').classList.remove('open');
}

function saveMatchTags() {
    if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error');
    const histId = document.getElementById('editTagsMatchId').value;
    const idx = appState.matchHistory.findIndex(x => x.id === histId);
    if (idx < 0) return;
    
    const newTags = [];
    document.querySelectorAll('.tag-checkbox-item input').forEach(cb => {
        if (cb.checked) {
            let scope = 'all';
            if (cb.value.includes('red')) scope = 'red';
            if (cb.value.includes('blue')) scope = 'blue';
            if (cb.value === 'blowout') scope = appState.matchHistory[idx].rStat === 'W' ? 'red' : 'blue';

            newTags.push({
                id: cb.value,
                label: cb.getAttribute('data-label'),
                class: cb.getAttribute('data-class'),
                scope: scope
            });
        }
    });
    
    if(!appState.matchHistory[idx].analysis) appState.matchHistory[idx].analysis = {};
    appState.matchHistory[idx].analysis.tags = newTags;
    
    closeEditTagsModal();
    invalidateStatsCache();
    saveData(true);
    showToast('Tags updated ✓', 'success');
}

// ── QUICK SCORE ──
let _qsRed = 0, _qsBlue = 0;
function openQuickScore() { if (userRole !== 'superadmin') return showToast('⛔ ต้องใช้สิทธิ์ Super Admin', 'error'); _qsRed = appState.globalScoreRed; _qsBlue = appState.globalScoreBlue; document.getElementById('qsRed').textContent = _qsRed; document.getElementById('qsBlue').textContent = _qsBlue; document.getElementById('quickScoreModal').classList.add('open'); }
function quickAdj(team, delta) { if (team === 'red') _qsRed = Math.max(0, _qsRed + delta); else _qsBlue = Math.max(0, _qsBlue + delta); document.getElementById('qsRed').textContent = _qsRed; document.getElementById('qsBlue').textContent = _qsBlue; }
function applyQuickScore() { appState.globalScoreRed = _qsRed; appState.globalScoreBlue = _qsBlue; closeQuickScore(); saveKeys(['globalScoreRed', 'globalScoreBlue'], true); showToast('Score updated ✓', 'success'); }
function closeQuickScore() { document.getElementById('quickScoreModal').classList.remove('open'); }
function undoLastResult() {
  if (appState.matchHistory.length === 0) return showToast('No results to undo', 'error');
  const last = appState.matchHistory[appState.matchHistory.length - 1];
  showConfirmDialog(`Undo ${last.id}?\n${last.redNames} vs ${last.blueNames}\n${last.game1} / ${last.game2}`, function() {
    appState.globalScoreRed = Math.max(0, appState.globalScoreRed - last.pRed);
    appState.globalScoreBlue = Math.max(0, appState.globalScoreBlue - last.pBlue);
    appState.matchHistory.pop();
    saveData(true); showToast(`↩ Undone: ${last.id}`, 'success');
  });
}

function populateDropdowns() {}

