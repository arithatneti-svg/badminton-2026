// ── MATCH BOARD (tap-first, single screen) ──
const picker = { round: '1', red: [], blue: [], redGroup: '', blueGroup: '' };

function getPlayerMatchCountInRound(playerId, round) {
  const inHistory = appState.matchHistory.filter(h => h.round === String(round) && [h.r1,h.r2,h.b1,h.b2].includes(playerId)).length;
  const inOngoing = appState.ongoingMatches.filter(m => m.round === String(round) && [m.r1,m.r2,m.b1,m.b2].includes(playerId)).length;
  return inHistory + inOngoing;
}

function renderMatchBoard() {
  const board = document.getElementById('matchBoard');
  if (!board) return;
  const nameOf = id => { const p = (appState.players||[]).find(x=>x.id===id); return p ? p.name : '—'; };

  // ── slots ──
  [['red', picker.red], ['blue', picker.blue]].forEach(([team, arr]) => {
    [0,1].forEach(i => {
      const el = document.getElementById('mbSlot' + (team==='red'?'R':'B') + i);
      if (!el) return;
      const id = arr[i];
      if (id) {
        el.className = 'mb-slot filled ' + team;
        el.innerHTML = `<span class="mb-slot-num">${i+1}</span><span class="mb-slot-name">${escHtml(nameOf(id))}</span><span class="mb-slot-x" aria-hidden="true">✕</span>`;
      } else {
        el.className = 'mb-slot ' + team;
        el.innerHTML = `<span class="mb-slot-num">${i+1}</span><span class="mb-slot-hint">แตะเลือกคนที่ ${i+1}</span>`;
      }
    });
  });

  // ── pools ──
  const activeIds = appState.ongoingMatches.flatMap(m => [m.r1,m.r2,m.b1,m.b2]);
  const round = picker.round || '1';
  const renderPool = (team) => {
    const isRed = team === 'red';
    const el = document.getElementById(isRed ? 'mbPoolRed' : 'mbPoolBlue');
    if (!el) return;
    const search = (document.getElementById(isRed ? 'mbSearchRed' : 'mbSearchBlue')?.value || '').toLowerCase();
    const group = isRed ? picker.redGroup : picker.blueGroup;
    const sel = isRed ? picker.red : picker.blue;
    const players = (appState.players||[]).filter(p =>
      p.team === (isRed?'Red':'Blue') && (!group || p.group === group) && (!search || p.name.toLowerCase().includes(search)));
    if (!players.length) { el.innerHTML = `<div class="mb-empty">ไม่พบผู้เล่น</div>`; return; }
    el.innerHTML = players.map(p => {
      const picked  = sel.includes(p.id);
      const inMatch = activeIds.includes(p.id);
      const cnt = getPlayerMatchCountInRound(p.id, round);
      const meta = inMatch ? 'กำลังแข่ง' : (cnt > 0 ? `R${round}·${cnt}` : '');
      const cls = 'mb-chip ' + team + (picked ? ' picked' : '') + (inMatch ? ' live' : '');
      return `<button class="${cls}" onclick="boardToggle('${p.id}','${team}')">${avatarHtml(p, 22, {className:'mb-chip-pav'})}${escHtml(p.name)}${meta ? `<span class="mb-chip-meta">${meta}</span>` : ''}</button>`;
    }).join('');
  };
  renderPool('red'); renderPool('blue');

  const n = picker.red.length + picker.blue.length;
  const st = document.getElementById('mbStatus');
  if (st) { st.textContent = n === 4 ? '✓ พร้อมสร้างแมตช์' : `เลือกแล้ว ${n}/4`; st.style.color = n === 4 ? 'var(--green)' : 'var(--muted)'; }
  // dim the create button until both teams are full — it still guards on
  // tap, but a lit button that cannot succeed reads as broken
  const cb = document.getElementById('mbCreateBtn');
  if (cb) cb.classList.toggle('mb-create-ready', n === 4);
}

function boardToggle(id, team) {
  const sel = team === 'red' ? picker.red : picker.blue;
  const idx = sel.indexOf(id);
  if (idx >= 0) sel.splice(idx, 1);
  else if (sel.length < 2) sel.push(id);
  else return showToast('ทีมนี้ครบ 2 คนแล้ว — แตะช่องเพื่อเอาออกก่อน', 'warning');
  renderMatchBoard();
}

function boardRemove(team, i) {
  const sel = team === 'red' ? picker.red : picker.blue;
  if (sel[i]) { sel.splice(i, 1); renderMatchBoard(); }
}

// สุ่มลงกระดาน (ให้แอดมินตรวจก่อนกดสร้าง)
function boardFillRandom() {
  const activeIds = appState.ongoingMatches.flatMap(m => [m.r1,m.r2,m.b1,m.b2]);
  const round = picker.round || '1';
  const free = teamName => appState.players.filter(p => p.team === teamName && !activeIds.includes(p.id));
  const pick2 = list => {
    const fresh = list.filter(p => getPlayerMatchCountInRound(p.id, round) < 1);
    const pool = (fresh.length >= 2 ? fresh : list).slice();
    // Fisher-Yates. sort(() => Math.random() - 0.5) is NOT a shuffle: the
    // comparator is inconsistent, so the engine leaves most elements near
    // their original index and the same first two names keep coming up.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 2).map(p => p.id);
  };
  const reds = free('Red'), blues = free('Blue');
  if (reds.length < 2 || blues.length < 2) return showToast('ผู้เล่นที่ว่าง (ไม่ติดแมตช์สด) มีไม่พอ 2 คนต่อทีม', 'error');
  picker.red = pick2(reds);
  picker.blue = pick2(blues);
  renderMatchBoard();
}

function selectRound(r) {
  picker.round = String(r);
  [1,2,3].forEach(n => document.getElementById('rpill'+n)?.classList.toggle('round-active', String(n) === String(r)));
  renderMatchBoard();
}

function setBoardGroup(team, g) {
  if (team === 'red') picker.redGroup = g; else picker.blueGroup = g;
  const wrap = document.getElementById(team === 'red' ? 'mbGroupRed' : 'mbGroupBlue');
  if (wrap) wrap.querySelectorAll('.filter-pill').forEach((b,i) => b.classList.toggle('active', (i===0 && g==='') || (g===String(i))));
  renderMatchBoard();
}

function resetPicker() { picker.red = []; picker.blue = []; renderMatchBoard(); }

function createMatch() {
  if (picker.red.length < 2 || picker.blue.length < 2) return showToast('❌ เลือกผู้เล่นให้ครบ 2 คนต่อทีมก่อน', 'error');
  const r1 = picker.red[0], r2 = picker.red[1], b1 = picker.blue[0], b2 = picker.blue[1];
  const getP = id => (appState.players || []).find(p => p.id === id);
  const p_r1 = getP(r1), p_r2 = getP(r2), p_b1 = getP(b1), p_b2 = getP(b2);
  if (!p_r1 || !p_r2 || !p_b1 || !p_b2) return showToast('❌ ไม่พบข้อมูลผู้เล่น กรุณาลองใหม่', 'error');
  const n = appState.matchCounter, mId = 'M' + (n < 10 ? '0'+n : n), round = picker.round || '1';
  appState.ongoingMatches.push({
    id: mId, round, r1, r2, b1, b2,
    redNames:  `${p_r1.name} (G${p_r1.group}) & ${p_r2.name} (G${p_r2.group})`,
    blueNames: `${p_b1.name} (G${p_b1.group}) & ${p_b2.name} (G${p_b2.group})`
  });
  appState.matchCounter++;
  resetPicker();
  saveData(true);
  showToast(`✅ ${mId} (R${round}): ${p_r1.name} & ${p_r2.name}  vs  ${p_b1.name} & ${p_b2.name} → คิว`, 'success');
  playSound('match');
}

function removeOngoingMatch(mId) {
  if (userRole !== 'admin' && userRole !== 'superadmin') return;
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
