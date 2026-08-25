function goPickerStep(step) {
  if (step >= 3 && picker.red.length < 2) return showToast('Pick 2 Red players first', 'error');
  if (step >= 4 && picker.blue.length < 2) return showToast('Pick 2 Blue players first', 'error');
  [1,2,3,4].forEach(s => {
    const panel = document.getElementById(`pickerStep${s}`);
    const ind = document.getElementById(`step${s}Indicator`);
    if(panel) panel.style.display = s === step ? 'block' : 'none';
    if(ind) { ind.classList.toggle('active', s === step); ind.classList.toggle('done', s < step); }
  });
  if (step === 2) renderCardPicker('red');
  if (step === 3) renderCardPicker('blue');
  if (step === 4) renderConfirmPreview();
}

function renderCardPicker(team) {
  const isRed = team === 'red';
  const grid = document.getElementById(isRed ? 'redCardGrid' : 'blueCardGrid');
  const searchInput = document.getElementById(isRed ? 'redCardSearch' : 'blueCardSearch');
  const search = (searchInput?.value || '').toLowerCase();
  const group = isRed ? picker.redGroup : picker.blueGroup;
  const selected = isRed ? picker.red : picker.blue;
  const otherSelected = isRed ? picker.blue : picker.red;
  const activeIds = appState.ongoingMatches.flatMap(m => [m.r1,m.r2,m.b1,m.b2]);

  const round = picker.round;
  const players = appState.players.filter(p => p.team === (isRed?'Red':'Blue') && (!group || p.group === group) && (!search || p.name.toLowerCase().includes(search)));

  grid.innerHTML = players.map(p => {
    const isSelected = selected.includes(p.id);
    const isInMatch = activeIds.includes(p.id);
    const matchesInRound = getPlayerMatchCountInRound(p.id, round);
    const isDisabled = (!isSelected && selected.length >= 2) || otherSelected.includes(p.id);
    // isInMatch no longer disables the card — player can be queued while playing
    let cls = 'player-card' + (isSelected ? (isRed?' red-selected':' blue-selected') : '') + ((isDisabled&&!isSelected) ? ' disabled' : '') + (isInMatch ? ' in-match-warn' : '');
    const warnBadge = isInMatch ? `<span style="position:absolute;top:50%;right:12px;transform:translateY(-50%);font-size:9px;font-weight:700;color:var(--gold);letter-spacing:1px;background:rgba(245,200,66,0.12);padding:2px 6px;border-radius:6px;border:1px solid rgba(245,200,66,0.25);">⚡ LIVE</span>` : '';
    return `<div class="${cls}" onclick="toggleCard('${p.id}','${team}')"><div class="card-radio"><div class="card-radio-inner"></div></div><div class="card-info"><div class="card-name">${escHtml(p.name)}</div><div class="card-sub">G${p.group} · R${round}: ${matchesInRound} match${isInMatch?' · กำลังแข่งอยู่':''}</div></div>${warnBadge}</div>`;
  }).join('');

  [0, 1].forEach(i => { 
      const slot = document.getElementById(`${team}Slot${i+1}`); 
      const pid = selected[i]; 
      if (pid) { 
          const pl = ( appState.players || [] ).find(p => p.id === pid); 
          slot.className = `selected-slot ${isRed?'filled-red':'filled-blue'}`; 
          slot.innerHTML = `<span class="slot-num">${i+1}</span><span class="slot-name">${escHtml(pl.name)}</span><span class="slot-remove" onclick="event.stopPropagation();removeCardSlot('${pid}','${team}')">✕</span>`; 
      } else { 
          slot.className = 'selected-slot'; 
          slot.innerHTML = `<span class="slot-num">${i+1}</span><span style="color:var(--muted);font-size:13px;">Select Player ${i+1}</span>`; 
      } 
  });
  
  const countLabel = document.getElementById(`${team}CountLabel`);
  if(countLabel) countLabel.textContent = `${selected.length} / 2`; 
  
  const nextBtn = document.getElementById(`${team}NextBtn`); 
  if(nextBtn) {
      nextBtn.disabled = selected.length !== 2; 
      nextBtn.style.opacity = selected.length === 2 ? '1' : '0.4';
  }
}

function toggleCard(id, team) { const sel = team==='red' ? picker.red : picker.blue; const idx = sel.indexOf(id); if (idx>=0) sel.splice(idx,1); else if (sel.length<2) sel.push(id); renderCardPicker(team); }
function removeCardSlot(id, team) { const sel = team==='red' ? picker.red : picker.blue; const idx = sel.indexOf(id); if (idx>=0) sel.splice(idx,1); renderCardPicker(team); }

function renderConfirmPreview() {
  const getP = id => ( appState.players || [] ).find(p=>p.id===id); const [r1,r2] = picker.red.map(getP), [b1,b2] = picker.blue.map(getP);
  document.getElementById('matchConfirmPreview').innerHTML = `<div class="confirm-team-box" style="background:rgba(255,59,59,0.08);border:1px solid rgba(255,59,59,0.2);"><div class="red-text" style="font-family:'Bebas Neue',sans-serif;font-size:1.2em;letter-spacing:3px;margin-bottom:10px;">🔴 RED TEAM</div><div><span class="confirm-player-pill" style="background:rgba(255,59,59,0.12);color:var(--red);">${r1?.name}</span><span class="confirm-player-pill" style="background:rgba(255,59,59,0.12);color:var(--red);">${r2?.name}</span></div></div><div style="font-family:'Bebas Neue',sans-serif;font-size:2em;color:var(--muted);letter-spacing:4px;padding:0 10px;">VS</div><div class="confirm-team-box" style="background:rgba(59,142,255,0.08);border:1px solid rgba(59,142,255,0.2);"><div class="blue-text" style="font-family:'Bebas Neue',sans-serif;font-size:1.2em;letter-spacing:3px;margin-bottom:10px;">🔵 BLUE TEAM</div><div><span class="confirm-player-pill" style="background:rgba(59,142,255,0.12);color:var(--blue);">${b1?.name}</span><span class="confirm-player-pill" style="background:rgba(59,142,255,0.12);color:var(--blue);">${b2?.name}</span></div></div>`;
}

function resetPicker() { picker.red=[]; picker.blue=[]; goPickerStep(1); }

function getPlayerMatchCountInRound(playerId, round) {
  const inHistory = appState.matchHistory.filter(h => h.round === String(round) && [h.r1,h.r2,h.b1,h.b2].includes(playerId)).length;
  const inOngoing = appState.ongoingMatches.filter(m => m.round === String(round) && [m.r1,m.r2,m.b1,m.b2].includes(playerId)).length;
  return inHistory + inOngoing;
}

function createMatch() {
  // BUG-FIX: guard picker length FIRST before destructuring — prevents undefined r1/r2/b1/b2
  if (picker.red.length < 2 || picker.blue.length < 2) return showToast('❌ เลือกผู้เล่นให้ครบ 2 คนต่อทีมก่อน', 'error');
  const r1 = picker.red[0], r2 = picker.red[1];
  const b1 = picker.blue[0], b2 = picker.blue[1];
  // guard: r1/r2/b1/b2 must all be non-null strings
  if (!r1 || !r2 || !b1 || !b2) return showToast('❌ ข้อมูลผู้เล่นไม่ครบ กรุณาเลือกใหม่', 'error');
  const getP = id => (appState.players || []).find(p => p.id === id);
  const n = appState.matchCounter, mId = 'M' + (n < 10 ? '0' + n : n);
  const round = picker.round;
  // guard: player might be deleted between render and submit
  const p_r1 = getP(r1), p_r2 = getP(r2), p_b1 = getP(b1), p_b2 = getP(b2);
  if (!p_r1 || !p_r2 || !p_b1 || !p_b2) return showToast('❌ ไม่พบข้อมูลผู้เล่น กรุณาลองใหม่', 'error');
  appState.ongoingMatches.push({ id: mId, round, r1, r2, b1, b2, redNames: `${p_r1.name} (G${p_r1.group}) & ${p_r2.name} (G${p_r2.group})`, blueNames: `${p_b1.name} (G${p_b1.group}) & ${p_b2.name} (G${p_b2.group})` });
  appState.matchCounter++; resetPicker(); saveData(true); showToast(`✅ ${mId} (R${round}): ${p_r1.name} & ${p_r2.name}  vs  ${p_b1.name} & ${p_b2.name} → Queue`, 'success'); playSound('match');
}

function createMockMatch() {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  
  // หารอบที่ยังสร้างได้อยู่ (ผู้เล่นยังไม่ครบ 1 แมตช์)
  let targetRound = null;
  for (let r = 1; r <= 3; r++) {
    const reds = appState.players.filter(p => p.team === 'Red' && getPlayerMatchCountInRound(p.id, r) < 1);
    const blues = appState.players.filter(p => p.team === 'Blue' && getPlayerMatchCountInRound(p.id, r) < 1);
    if (reds.length >= 2 && blues.length >= 2) { targetRound = r; break; }
  }
  if (targetRound === null) return showToast('❌ ทุกรอบผู้เล่นเล่นครบแล้ว ไม่สามารถสร้างแมตช์ได้', 'error');

  const activeIds = appState.ongoingMatches.flatMap(m => [m.r1, m.r2, m.b1, m.b2]);
  let availableReds = appState.players.filter(p => p.team === 'Red' && !activeIds.includes(p.id) && getPlayerMatchCountInRound(p.id, targetRound) < 1);
  let availableBlues = appState.players.filter(p => p.team === 'Blue' && !activeIds.includes(p.id) && getPlayerMatchCountInRound(p.id, targetRound) < 1);

  if (availableReds.length < 2 || availableBlues.length < 2) {
    return showToast("ผู้เล่นที่ว่างอยู่มีไม่พอสำหรับรอบนี้ครับ", "error");
  }

  availableReds.sort(() => 0.5 - Math.random());
  availableBlues.sort(() => 0.5 - Math.random());
  const r1 = availableReds[0], r2 = availableReds[1];
  const b1 = availableBlues[0], b2 = availableBlues[1];

  const n = appState.matchCounter;
  const mId = 'M' + (n < 10 ? '0'+n : n);
  appState.ongoingMatches.push({
    id: mId, round: String(targetRound),
    r1: r1.id, r2: r2.id, b1: b1.id, b2: b2.id,
    redNames: `${r1.name} (G${r1.group}) & ${r2.name} (G${r2.group})`,
    blueNames: `${b1.name} (G${b1.group}) & ${b2.name} (G${b2.group})`
  });
  appState.matchCounter++;
  saveData(true);
  showToast(`⚡ สุ่มสร้างแมตช์ ${mId} (Round ${targetRound}) สำเร็จ`, 'success');
  playSound('match');
}

function removeOngoingMatch(mId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
  // BUG-FIX: if mId is literally 'undefined' (string) or falsy, allow purge of all corrupt entries
  if (!mId || mId === 'undefined') {
    showConfirmDialog('ลบแมตช์ที่ข้อมูลเสีย (undefined) ทั้งหมด?', function() {
      appState.ongoingMatches = appState.ongoingMatches.filter(m => m.id && m.id !== 'undefined' && m.r1 && m.r2 && m.b1 && m.b2);
      saveData(true);
      showToast('🗑 ลบแมตช์ที่ข้อมูลเสียออกแล้ว', 'success');
    });
    return;
  }
  showConfirmDialog(`Force remove match ${mId}?`, function() {
    appState.ongoingMatches = appState.ongoingMatches.filter(m => m.id !== mId);
    if (appState.courtTimers?.[mId]) delete appState.courtTimers[mId];
    saveData(true);
  });
}

