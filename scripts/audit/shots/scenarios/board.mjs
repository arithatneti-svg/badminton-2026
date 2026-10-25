// Scoreboard app (/) — every tab, overlay and state, for the three role views: guest, admin, superadmin.
// The role is seeded in localStorage before the app boots (never a passcode); data and matches come from the audit bench.
import { BOARD, BOARD_TAB, ROLES, STAFF, boardBench, PICK_PROFILE } from './_lib.mjs';

const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);
const out = [];

// ── before anyone has logged in ──
out.push(mk('board-login', '', BOARD, async (page) => { await page.waitFor('#loginOverlay'); }));
out.push(mk('board-login-staff', '', BOARD, async (page) => {
  await page.eval("document.querySelector('.login-staff').open = true");
  await page.wait(150);
}));
out.push(mk('board-login-passcode', '', BOARD, async (page) => {   // the passcode box, opened and left empty
  await page.eval('loginAdmin()');
  await page.waitFor('#passcodeModal');
  await page.wait(150);
}));

for (const r of ROLES) {
  const staff = r !== 'guest';

  // ── the live pages everyone sees ──
  out.push(mk(`board-${r}-scoreboard-ongoing`, r, BOARD_TAB, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.shot(''); await page.shot('full', { full: true });
  }));
  out.push(mk(`board-${r}-scoreboard-live`, r, BOARD_TAB, async (page) => {   // the Scoreboard tab while a court is being scored
    await boardBench(page, { role: r, tab: 'scoreboard' });
    await page.shot(''); await page.shot('full', { full: true });
  }));
  out.push(mk(`board-${r}-scoreboard-idle`, r, BOARD_TAB, async (page) => {   // nothing started: totals + what is next
    await boardBench(page, { role: r, tab: 'scoreboard', matches: 'idle' });
    await page.shot(''); await page.shot('full', { full: true });
  }));
  out.push(mk(`board-${r}-scoreboard-empty`, r, BOARD, async (page) => {   // no match at all
    await boardBench(page, { role: r, tab: 'ongoing', matches: 'none' });
  }));
  out.push(mk(`board-${r}-scoreboard-finished`, r, BOARD_TAB, async (page) => {
    await boardBench(page, { role: r, tab: 'finished' });
    await page.shot(''); await page.shot('full', { full: true });
  }));
  out.push(mk(`board-${r}-players`, r, BOARD_TAB, async (page) => {
    await boardBench(page, { role: r, tab: 'players' });
    await page.wait(500);
    await page.shot(''); await page.shot('full', { full: true });
  }));
  out.push(mk(`board-${r}-profile`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'players' });
    const id = await page.run(PICK_PROFILE);
    page.note('profile of ' + id);
    await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
    await page.waitFor('#playerProfileOverlay.open');
    await page.wait(500);
    await page.shot('');
    await page.shot('full', { tall: '#playerProfileOverlay' });
  }));
  out.push(mk(`board-${r}-profile-edit`, r, BOARD, async (page) => {   // the profile edit form (admin tools show for staff)
    await boardBench(page, { role: r, tab: 'players' });
    const id = await page.run(PICK_PROFILE);
    await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
    await page.waitFor('#playerProfileOverlay.open');
    if (staff) { await page.eval('togglePdEdit(true)'); await page.wait(200); await page.shot('', { tall: '#playerProfileOverlay' }); }
  }));
  out.push(mk(`board-${r}-gallery`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'gallery' });
    await page.waitUntil("document.querySelectorAll('#galleryGrid img, #galleryGrid .gal-item').length > 0 || /ยังไม่มี|ไม่มีรูป/.test(document.getElementById('galleryGrid').textContent)", 8000, 'the gallery');
    await page.wait(600);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 3000 });
  }, { timeoutMs: 100000 }));
  if (r === 'guest') {
    out.push(mk('board-guest-gallery-lightbox', r, BOARD, async (page) => {
      await boardBench(page, { role: r, tab: 'gallery' });
      await page.waitUntil("document.querySelectorAll('#galleryGrid img').length > 0", 8000, 'gallery photos');
      await page.wait(400);
      await page.eval('openLightbox(0)');
      await page.waitFor('#galleryLightbox.open');
      await page.wait(300);
    }, { timeoutMs: 100000 }));
    out.push(mk('board-guest-me-picker', r, BOARD, async (page) => {   // "⭐ คุณคือใคร?"
      await boardBench(page, { role: r, tab: 'ongoing' });
      await page.eval('openMePicker()');
      await page.waitFor('#mePickerOverlay.open, #mePickerOverlay.show, .me-picker-box');
      await page.wait(250);
    }));
  }

  // ── the bar and the pop-ups ──
  out.push(mk(`board-${r}-more-menu`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('toggleNavMenu(true)');
    await page.wait(250);
  }));
  out.push(mk(`board-${r}-popup`, r, BOARD, async (page) => {   // the result pop-up of a finished match
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval(`(() => { const h = appState.matchHistory[0];
      showMatchNoti({ matchId: h.id, redNames: h.redNames, blueNames: h.blueNames, g1r: 21, g1b: 15, g2r: 21, g2b: 17, gameNum: 2, gameWinner: 'red',
        globalRedBefore: 1, globalBlueBefore: 3, pRed: 3, pBlue: 0, tags: [{ id: 'blowout', label: '🌪️ ยำใหญ่ (Blowout)', class: 'tag-blowout', scope: 'red' }], isMatchEnd: true, rStat: 'W' }); })()`);
    await page.waitFor('#matchNotiOverlay.show, #matchNotiOverlay.open, #matchNotiBox');
    await page.wait(500);
  }));
  out.push(mk(`board-${r}-toast`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval("(() => { showToast('⚠️ โหลดข้อมูลใหม่ไม่ได้ — ตรวจสอบสัญญาณ', 'error'); showToast('✓ เชื่อมต่อกลับมาแล้ว', 'success'); })()");
    await page.wait(300);
  }));

  // ── connection and loading states ──
  out.push(mk(`board-${r}-offline`, r, BOARD, async (page) => {   // the signal dropped after data was shown
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('(() => { _dbOnline = false; _dbEverOnline = true; _lastSnapshotAt = Date.now() - 125000; _dbRenderConn(); })()');
    await page.wait(200);
  }));
  out.push(mk(`board-${r}-loading`, r, BOARD, async (page) => { await page.waitFor('#dataState'); await page.wait(200); }, { hold: true }));
  out.push(mk(`board-${r}-loading-slow`, r, BOARD, async (page) => { await page.eval("(() => { _dataPhase = 'slow'; _dataShow(); })()"); await page.wait(200); }, { hold: true }));
  out.push(mk(`board-${r}-loading-failed`, r, BOARD, async (page) => { await page.eval('_dataFail()'); await page.wait(200); }, { hold: true }));

  if (!staff) continue;

  // ── staff pages ──
  out.push(mk(`board-${r}-dashboard`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'dashboard' });
    await page.wait(900);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-reports-players`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'report' });
    await page.eval("switchReportTab('players', document.getElementById('rtab-players'))");
    await page.wait(700);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-reports-matches`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'report' });
    await page.eval("switchReportTab('matches', document.getElementById('rtab-matches'))");
    await page.wait(700);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-admin`, r, BOARD, async (page) => {   // create-match board + management cards
    await boardBench(page, { role: r, tab: 'admin' });
    await page.wait(400);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-admin-board-filled`, r, BOARD, async (page) => {   // the board with a pair on each side
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval(`(() => { const red = appState.players.filter(p => p.team === 'Red'), blue = appState.players.filter(p => p.team === 'Blue');
      boardToggle(red[0].id, 'red'); boardToggle(red[1].id, 'red'); boardToggle(blue[0].id, 'blue'); boardToggle(blue[1].id, 'blue'); })()`);
    await page.wait(300);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 5000 });
  }));
  out.push(mk(`board-${r}-admin-player-mgmt`, r, BOARD, async (page) => {   // "Player Management" folded section open
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("document.querySelector('#admin .adm-collapse').open = true");
    await page.wait(250);
  }));
  out.push(mk(`board-${r}-result-modal`, r, BOARD, async (page) => {   // "force result" entry for a court
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval("openResultModal('T01')");
    await page.waitFor('#resultModal.open');
    await page.wait(200);
    await page.shot('', {}); await page.shot('full', { tall: '#resultModal' });
  }));
  out.push(mk(`board-${r}-player-edit`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'players' });
    await page.eval('openPlayerEdit(appState.players[0].id)');
    await page.waitFor('#playerEditModal.open');
    await page.wait(200);
  }));
  out.push(mk(`board-${r}-qr`, r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('openQrModal()');
    await page.waitFor('#qrModal.open');
    await page.wait(400);
    await page.shot('', {}); await page.shot('full', { tall: '#qrModal' });
  }));
  out.push(mk(`board-${r}-trophy`, r, BOARD, async (page) => {   // the ceremony screen
    await boardBench(page, { role: r, tab: 'admin' });
    await page.eval('openEndGame()');
    await page.wait(900);
  }));

  if (r !== 'superadmin') continue;

  // ── super admin only ──
  out.push(mk('board-superadmin-extras', r, BOARD, async (page) => {   // Players tab: player data, backup, champion bars
    await boardBench(page, { role: r, tab: 'players' });
    await page.eval('updateChampControls()');
    await page.wait(500);
    await page.shot(''); await page.shot('full', { full: true, maxHeight: 4000 });
  }));
  out.push(mk('board-superadmin-quickscore', r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'scoreboard', matches: 'idle' });
    await page.eval('openQuickScore()');
    await page.waitFor('#quickScoreModal.open');
    await page.wait(200);
  }));
  out.push(mk('board-superadmin-edit-result', r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'finished' });
    await page.eval("openEditResult('H01')");
    await page.waitFor('#editResultModal.open');
    await page.wait(200);
    await page.shot('', {}); await page.shot('full', { tall: '#editResultModal' });
  }));
  out.push(mk('board-superadmin-backup', r, BOARD, async (page) => {   // Backup & Restore list (nothing is pressed)
    await boardBench(page, { role: r, tab: 'players' });
    await page.eval('openBackupModal()');
    await page.waitFor('#backupModal.open');
    await page.wait(700);
    await page.shot('', {}); await page.shot('full', { tall: '#backupModal' });
  }));
  out.push(mk('board-superadmin-reset-menu', r, BOARD, async (page) => {   // the reset choice box — screenshot only
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('clearData()');
    await page.waitFor('#resetChoiceModal');
    await page.wait(200);
  }));
  out.push(mk('board-superadmin-season-wizard', r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('openSeasonWizard()');
    await page.waitFor('#seasonWizardModal.open');
    await page.wait(300);
    await page.shot('', {}); await page.shot('full', { tall: '#seasonWizardModal' });
  }));
  out.push(mk('board-superadmin-season-archive', r, BOARD, async (page) => {
    await boardBench(page, { role: r, tab: 'ongoing' });
    await page.eval('openSeasonArchive()');
    await page.waitFor('#seasonArchiveModal.open');
    await page.wait(500);
  }));
}

export default out;
