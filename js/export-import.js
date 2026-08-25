// ── EXPORT / IMPORT ──
function exportPlayerProfiles() {
  const data = {
    exportedAt: new Date().toISOString(),
    players: appState.players,
    playerProfiles: appState.playerProfiles || {},
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `player_profiles_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('📤 Export สำเร็จ','success');
}

function exportPlayerCSV() {
  const rows = [['ID','Name','Team','Group','Speed','Power','Stamina','Technique','Accuracy','Styles','Form','DominantShot','BaseScore']];
  appState.players.forEach(p => {
    const prof = (appState.playerProfiles||{})[p.id]||{};
    rows.push([
      p.id, p.name, p.team, p.group,
      prof.speed||0, prof.power||0, prof.stamina||0, prof.technique||0, prof.accuracy||0,
      (prof.styles||[]).join('|'), prof.form||'normal', prof.dominantShot||'', prof.baseScore||''
    ]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `player_stats_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  showToast('📊 Export CSV สำเร็จ','success');
}

function importPlayerProfiles(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let imported = 0;
      if (data.playerProfiles) {
        if (!appState.playerProfiles) appState.playerProfiles = {};
        Object.entries(data.playerProfiles).forEach(([id, prof]) => {
          appState.playerProfiles[id] = { ...(appState.playerProfiles[id]||{}), ...prof };
          imported++;
        });
      }
      saveData(true);
      renderPlayersTab();
      showToast(`📥 Import สำเร็จ ${imported} ผู้เล่น`, 'success');
    } catch(err) {
      showToast('❌ ไฟล์ไม่ถูกต้อง', 'error');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

// UX-9: Escape key closes any open modal
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modals = [
    { el: document.getElementById('seasonWizardModal'),  close: () => closeSeasonWizard() },
    { el: document.getElementById('seasonArchiveModal'), close: () => closeSeasonArchive() },
    { el: document.getElementById('compareModal'),        close: () => closeCompareModal() },
    { el: document.getElementById('passcodeModal'),      close: () => closePasscodeModal() },
    { el: document.getElementById('resultModal'),        close: () => closeModal() },
    { el: document.getElementById('confirmModal'),       close: () => closeConfirm() },
    { el: document.getElementById('editResultModal'),    close: () => closeEditModal() },
    { el: document.getElementById('editTagsModal'),      close: () => closeEditTagsModal() },
    { el: document.getElementById('quickScoreModal'),    close: () => closeQuickScore() },
    { el: document.getElementById('matchNotiOverlay'),   close: () => closeMatchNoti() },
    { el: document.getElementById('playerProfileOverlay'), close: () => closePlayerProfile() },
    { el: document.getElementById('playerProfileOverlay'), close: () => closePlayerProfile() },
    { el: document.getElementById('confirmDialogModal'), close: () => closeConfirmDialog() },
    { el: document.getElementById('resetChoiceModal'),   close: () => document.getElementById('resetChoiceModal').style.display = 'none' },
  ];
  for (const m of modals) {
    if (m.el && (m.el.style.display === 'flex' || m.el.classList.contains('open'))) {
      m.close(); break;
    }
  }
});

// ── ADMIN PLAYER MANAGEMENT ──
function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  const team = document.getElementById('newPlayerTeam').value;
  const group = document.getElementById('newPlayerGroup').value;
  if (!name) return showToast('Please enter a player name', 'error');
  if (appState.players.some(p => p.name.toLowerCase() === name.toLowerCase() && p.team === team)) return showToast(`${name} already exists`, 'error');

  const prefix = team === 'Red' ? 'R' : 'B';
  let maxNum = 0;
  appState.players.filter(p => p.team === team).forEach(p => { const n = parseInt(p.id.substring(1)); if (!isNaN(n) && n > maxNum) maxNum = n; });
  const num = maxNum + 1;
  const newId = prefix + (num < 10 ? '0' + num : num);
  appState.players.push({ id: newId, name, team, group });
  document.getElementById('newPlayerName').value = '';
  saveData(); showToast(`${name} added`, 'success');
}

function deletePlayer(id) {
  const inMatch = appState.ongoingMatches.some(m => [m.r1,m.r2,m.b1,m.b2].includes(id));
  if (inMatch) return showToast('Cannot delete — player is in active match', 'error');
  showConfirmDialog(`Delete player ${id}?`, function() {
    appState.players = appState.players.filter(p => p.id !== id);
    saveData(); showToast('Player removed', 'success'); // UX-12: was using wrong 'error' type
  });
}

function importCSV(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    lines.forEach(line => {
      const [name, team, group] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (!name || !['Red','Blue'].includes(team)) return;
      if (appState.players.some(p => p.name.toLowerCase() === name.toLowerCase() && p.team === team)) return;
      const prefix = team === 'Red' ? 'R' : 'B';
      let maxNum = 0;
      appState.players.filter(p => p.team === team).forEach(p => { const n = parseInt(p.id.substring(1)); if (n > maxNum) maxNum = n; });
      appState.players.push({ id: prefix + (maxNum + 1 < 10 ? '0'+(maxNum+1) : maxNum+1), name, team, group: group||'1' });
      added++;
    });
    input.value = ''; saveData(true); showToast(`Imported ${added} players`, 'success');
  };
  reader.readAsText(file);
}

// ── MATCH CREATION ──
const picker = { round: '1', red: [], blue: [], redGroup: '', blueGroup: '' };

function selectRound(r) {
  picker.round = r;
  [1,2,3].forEach(n => { document.getElementById(`rpill${n}`)?.classList.remove('round-active'); });
  document.getElementById(`rpill${r}`)?.classList.add('round-active');
}

function setCardGroup(team, g) {
  if (team === 'red') { picker.redGroup = g; document.querySelectorAll('#redGroupFilter .filter-pill').forEach((b,i) => b.classList.toggle('active', (i===0&&g==='')||(g===String(i)))); }
  else { picker.blueGroup = g; document.querySelectorAll('#blueGroupFilter .filter-pill').forEach((b,i) => b.classList.toggle('active', (i===0&&g==='')||(g===String(i)))); }
  renderCardPicker(team);
}

