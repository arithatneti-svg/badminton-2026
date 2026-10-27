// Admin + superadmin tools (A5): every dialog of the admin area, in the states a person actually meets.
// Run:  node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\admin" --label admin-after \
//         --scenarios "C:\Badminton 2026\ux-v3\admin\scripts\audit\admin-scenarios" --only board-admin,board-superadmin
// Ids that exist in the built-in set REPLACE it (the "full" shot measures the sheet itself, which scrolls inside the scrim).
import { BOARD, boardBench } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);
const VP = [...BOARD, '320x568'];
const out = [];

// type scores into the force-result form the way a person does (fires the same oninput)
const TYPE = `(vals) => { Object.entries(vals).forEach(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }); }`;

for (const r of ['admin', 'superadmin']) {
  // ── the Admin tab, narrow phone as well ──
  out.push(mk(`board-${r}-admin`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.wait(400);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-admin-board-filled`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval(`(() => { const red = appState.players.filter(p => p.team === 'Red'), blue = appState.players.filter(p => p.team === 'Blue');
      boardToggle(red[0].id, 'red'); boardToggle(red[1].id, 'red'); boardToggle(blue[0].id, 'blue'); boardToggle(blue[1].id, 'blue'); })()`);
    await page.wait(300);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  // the blue pool on a phone (the radio switch), one red picked: the half-filled ticket
  out.push(mk(`board-${r}-admin-board-blue`, r, ['390x844'], async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval(`(() => { const red = appState.players.filter(p => p.team === 'Red'); boardToggle(red[2].id, 'red'); document.getElementById('mbPoolTabBlue').click(); })()`);
    await page.wait(300);
    await page.shot('');
  }));
  out.push(mk(`board-${r}-admin-empty`, r, ['390x844', '1280x800'], async (page) => {   // no match in the queue at all
    await boardBench(page, { role: r, tab: 'admin', matches: 'none' });
    await page.wait(300);
    await page.shot('');
  }));
  out.push(mk(`board-${r}-admin-player-mgmt`, r, ['390x844', '1280x800'], async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("document.querySelector('#admin .adm-collapse').open = true");
    await page.wait(250);
    await page.shot('', {}); await page.shot('full', { full: true, maxHeight: 5000 });
  }));

  // ── result entry ──
  out.push(mk(`board-${r}-result-modal`, r, VP, async (page) => {   // empty
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.wait(200);
    await page.shot('', {}); await page.shot('full', { tall: '#resultModal .ds-sheet' });
  }));
  out.push(mk(`board-${r}-force-typed`, r, VP, async (page) => {   // 21-15 / 18-21: a 1-1 draw, and a red win below
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 21, g1Blue: 15, g2Red: 18, g2Blue: 21 })`);
    await page.wait(200);
    await page.shot('', {}); await page.shot('full', { tall: '#resultModal .ds-sheet' });
  }));
  out.push(mk(`board-${r}-force-redwin`, r, ['390x844'], async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 21, g1Blue: 15, g2Red: 21, g2Blue: 19 })`);
    await page.wait(200);
    await page.shot('', {});
  }));
  out.push(mk(`board-${r}-force-error`, r, ['390x844', '320x568'], async (page) => {   // G1 left empty, "บันทึกผล" pressed
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 21 })`);
    await page.eval('previewResult()');
    await page.wait(250);
    await page.shot('', {});
  }));
  out.push(mk(`board-${r}-confirm-result`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 21, g1Blue: 15, g2Red: 21, g2Blue: 19 })`);
    await page.eval('previewResult()');
    await page.waitFor('#confirmModal.open');
    await page.wait(200);
    await page.shot('', {});
  }));
  out.push(mk(`board-${r}-confirm-warn`, r, ['390x844', '1280x800'], async (page) => {   // a short game: warn, then allow
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 15, g1Blue: 11, g2Red: 9, g2Blue: 9 })`);
    await page.eval('previewResult()');
    await page.waitFor('#confirmModal.open');
    await page.wait(200);
    await page.shot('', {});
  }));

  out.push(mk(`board-${r}-player-edit`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'players' });
    await page.eval('openPlayerEdit(appState.players[0].id)');
    await page.waitFor('#playerEditModal.open');
    await page.wait(250);
    await page.shot('', {});
  }));
  out.push(mk(`board-${r}-qr`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('openQrModal()');
    await page.waitFor('#qrModal.open');
    await page.wait(400);
    await page.shot('', {}); await page.shot('full', { tall: '#qrModal .ds-sheet' });
  }));
  out.push(mk(`board-${r}-trophy`, r, VP, async (page) => {
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval('openEndGame()');
    await page.wait(900);
    await page.shot('', {}); await page.shot('full', { tall: '#trophyOverlay' });
  }));
}

// ── superadmin only ──
const S = 'superadmin';
out.push(mk('board-superadmin-extras', S, ['390x844', '1280x800'], async (page) => {   // Players tab: the folded staff tools, opened
  await boardBench(page, { role: S, tab: 'players' });
  await page.eval('updateChampControls()');
  await page.shot('');                                                                   // folded
  await page.eval("document.getElementById('staffTools').open = true");
  await page.wait(300);
  await page.shot('open', {}); await page.shot('full', { full: true, maxHeight: 3000 });
}));
out.push(mk('board-superadmin-quickscore', S, VP, async (page) => {
  await boardBench(page, { role: S, tab: 'scoreboard', matches: 'idle' });
  await page.shot('line', {});                                                           // the Quick Score line under the idle board
  await page.eval('openQuickScore()');
  await page.waitFor('#quickScoreModal.open');
  await page.wait(200);
  await page.shot('', {});
}));
out.push(mk('board-superadmin-edit-result', S, VP, async (page) => {
  await boardBench(page, { role: S, tab: 'finished' });
  await page.eval("openEditResult('H01')");
  await page.waitFor('#editResultModal.open');
  await page.wait(200);
  await page.shot('', {}); await page.shot('full', { tall: '#editResultModal .ds-sheet' });
}));
out.push(mk('board-superadmin-tags', S, VP, async (page) => {
  await boardBench(page, { role: S, tab: 'finished' });
  await page.eval("openEditTagsModal('H01')");
  await page.waitFor('#editTagsModal.open');
  await page.eval("(() => { const b = document.querySelectorAll('.tag-checkbox-item input'); b[0].checked = true; b[2].checked = true; })()");   // one red-only tag and one for all four: both drawn states
  await page.wait(200);
  await page.shot('', {}); await page.shot('full', { tall: '#editTagsModal .ds-sheet' });
}));
out.push(mk('board-superadmin-backup', S, VP, async (page) => {
  await boardBench(page, { role: S, tab: 'players' });
  await page.eval('openBackupModal()');
  await page.waitFor('#backupModal.open');
  await page.wait(700);
  await page.shot('', {}); await page.shot('full', { tall: '#backupModal .ds-sheet' });
}));
out.push(mk('board-superadmin-backup-empty', S, ['390x844'], async (page) => {   // nothing backed up yet
  await boardBench(page, { role: S, tab: 'players' });
  await page.eval(`(() => { backupsRef.orderByKey = () => ({ limitToLast: () => ({ once: () => Promise.resolve({ forEach() {} }) }) }); })()`);
  await page.eval('openBackupModal()');
  await page.waitFor('#backupModal.open');
  await page.wait(500);
  await page.shot('', {});
}));
out.push(mk('board-superadmin-reset-menu', S, VP, async (page) => {
  await boardBench(page, { role: S, tab: 'ongoing' });
  await page.eval('clearData()');
  await page.waitFor('#resetChoiceModal');
  await page.wait(200);
  await page.shot('', {});
}));
for (const n of [1, 2, 3, 4]) {
  out.push(mk(n === 1 ? 'board-superadmin-season-wizard' : `board-superadmin-wizard-${n}`, S, n === 3 ? VP : ['390x844', '1280x800'], async (page) => {
    await boardBench(page, { role: S, tab: 'ongoing' });
    await page.eval('openSeasonWizard()');
    await page.waitFor('#seasonWizardModal.open');
    if (n === 3) await page.eval(`(() => { wzGoStep(3); _wzNewPlayers.push({ name: 'น้องใหม่ ชื่อยาวมากๆ เพื่อทดสอบการตัดบรรทัด', team: 'Blue', group: '2' }, { name: 'ใหม่', team: 'Red', group: '1' }); wzPaintNewPlayers(); _wzReassignData[1].keep = false; wzPaintReassignGrid(); })()`);
    else if (n > 1) await page.eval(`wzGoStep(${n})`);
    await page.wait(300);
    await page.shot('', {}); await page.shot('full', { tall: '#seasonWizardModal .ds-sheet' });
  }));
}
out.push(mk('board-superadmin-season-archive', S, VP, async (page) => {   // three archived seasons, one of them drawn
  await boardBench(page, { role: S, tab: 'ongoing' });
  await page.eval(`(() => {
    const mk = (n, r, b, np) => ({ seasonName: 'Sports Day ' + n, archivedAt: n + '-10-25T09:00:00.000Z', globalScoreRed: r, globalScoreBlue: b, players: Array.from({ length: np }, (_, i) => ({ name: 'ผู้เล่น ' + (i + 1), team: i % 2 ? 'Blue' : 'Red' })), matchHistory: new Array(39).fill({}) });
    const data = { 2025: mk(2025, 61, 67, 54), 2024: mk(2024, 50, 50, 46), 2023: mk(2023, 72, 40, 40) };
    seasonsArchiveRef.once = () => Promise.resolve({ val: () => data });
    seasonsArchiveRef.child = (k) => ({ once: () => Promise.resolve({ val: () => data[String(k).split('/')[0]].players }) });
  })()`);
  await page.eval('openSeasonArchive()');
  await page.waitFor('#seasonArchiveModal.open');
  await page.wait(400);
  await page.eval("document.querySelector('.arc-card .ds-btn-sm').click()");
  await page.wait(400);
  await page.shot('', {}); await page.shot('full', { tall: '#seasonArchiveModal .ds-sheet' });
}));
out.push(mk('board-superadmin-archive-empty', S, ['390x844'], async (page) => {
  await boardBench(page, { role: S, tab: 'ongoing' });
  await page.eval(`(() => { seasonsArchiveRef.once = () => Promise.resolve({ val: () => null }); })()`);
  await page.eval('openSeasonArchive()');
  await page.waitFor('#seasonArchiveModal.open');
  await page.wait(400);
  await page.shot('', {});
}));

export default out;
