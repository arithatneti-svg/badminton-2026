// A5 admin checks (extra scenarios; load with --scenarios <this folder>): text contrast, tap targets under 44 px,
// English words and sideways overflow, per screen and per dialog, at 390 / 1280 / 320. Results are page notes in manifest.json.
// Nothing here writes anywhere: the shots tool refuses every database write.
import { boardBench } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);

const REPORT = (label, root) => `JSON.stringify((() => {
  const A = __audit, r = document.querySelector(${JSON.stringify(root)});
  if (!r) return { screen: ${JSON.stringify(label)}, missing: true };
  const c = A.contrast(${JSON.stringify(root)});
  const ww = (() => { try { return A.wp5English(${JSON.stringify(root)}); } catch (e) { return 'n/a'; } })();
  return { screen: ${JSON.stringify(label)}, textFail: c.fail, textTotal: c.total, worst: c.worst.slice(0, 6).map(w => w.sel + ' ' + w.fg + '/' + w.bg + ' ' + w.ratio + ' "' + w.sample + '"'),
    small44: A.small(${JSON.stringify(root)}, 44), english: ww, overflowX: document.documentElement.scrollWidth - innerWidth,
    sheetOverflowX: r.scrollWidth - r.clientWidth };
})())`;

const TYPE = `(vals) => { Object.entries(vals).forEach(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }); }`;
const closeAll = `(() => { document.querySelectorAll('.ds-scrim.open, .modal-overlay.open').forEach(e => e.classList.remove('open')); const rc = document.getElementById('resetChoiceModal'); if (rc) rc.style.display = 'none'; const t = document.getElementById('trophyOverlay'); if (t) t.style.display = 'none'; })()`;

const OUT = [];
for (const role of ['admin', 'superadmin']) addAudit(role);
function addAudit(role) {
  OUT.push(mk(`a5-audit-${role}`, role, ['390x844', '1280x800', '320x568'], async (page) => {
    await boardBench(page, { role, tab: 'admin' });
    await page.eval(`(() => { const red = appState.players.filter(p => p.team === 'Red'), blue = appState.players.filter(p => p.team === 'Blue');
      boardToggle(red[0].id, 'red'); boardToggle(red[1].id, 'red'); boardToggle(blue[0].id, 'blue'); boardToggle(blue[1].id, 'blue'); })()`);
    await page.wait(250);
    page.note(await page.eval(REPORT('admin-tab', '#admin')));
    await page.eval("document.querySelector('#admin .adm-collapse').open = true");
    page.note(await page.eval(REPORT('admin-tab-open', '#admin')));

    // dialogs a plain admin may open
    await page.eval("openResultModal('T01')"); await page.waitFor('#resultModal.open');
    await page.eval(`(${TYPE})({ g1Red: 15, g1Blue: 11, g2Red: 9, g2Blue: 9 })`);
    page.note(await page.eval(REPORT('force-result', '#resultModal .ds-sheet')));
    await page.eval('previewResult()'); await page.waitFor('#confirmModal.open');
    page.note(await page.eval(REPORT('confirm-warn', '#confirmModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('openQrModal()'); await page.waitFor('#qrModal.open');
    page.note(await page.eval(REPORT('qr', '#qrModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('openPlayerEdit(appState.players[0].id)'); await page.waitFor('#playerEditModal.open');
    page.note(await page.eval(REPORT('player-edit', '#playerEditModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('openEndGame()'); await page.wait(900);
    page.note(await page.eval(REPORT('trophy', '#trophyOverlay')));
    await page.eval('closeTrophy()'); await page.wait(700);

    if (role !== 'superadmin') return;
    await page.eval("switchTab('players', document.getElementById('tab-players'))"); await page.wait(300);
    await page.eval("document.getElementById('staffTools').open = true"); await page.wait(200);
    page.note(await page.eval(REPORT('staff-tools', '#players')));
    await page.eval("switchTab('scoreboard', document.getElementById('tab-scoreboard'))"); await page.wait(300);
    page.note(await page.eval(REPORT('quickscore-line', '.adm-qs')));
    await page.eval('openQuickScore()'); await page.waitFor('#quickScoreModal.open');
    page.note(await page.eval(REPORT('quick-score', '#quickScoreModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval("switchTab('finished', document.getElementById('tab-finished'))"); await page.wait(300);
    await page.eval("openEditResult('H01')"); await page.waitFor('#editResultModal.open');
    page.note(await page.eval(REPORT('edit-result', '#editResultModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval("openEditTagsModal('H01')"); await page.waitFor('#editTagsModal.open');
    page.note(await page.eval(REPORT('tags', '#editTagsModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('clearData()'); await page.waitFor('#resetChoiceModal');
    page.note(await page.eval(REPORT('reset-choice', '#resetChoiceModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('openBackupModal()'); await page.waitFor('#backupModal.open'); await page.wait(600);
    page.note(await page.eval(REPORT('backup', '#backupModal .ds-sheet')));
    await page.eval(closeAll);
    await page.eval('openSeasonWizard()'); await page.waitFor('#seasonWizardModal.open');
    for (const n of [1, 2, 3, 4]) {
      await page.eval(`wzGoStep(${n})`); await page.wait(150);
      page.note(await page.eval(REPORT('wizard-' + n, '#seasonWizardModal .ds-sheet')));
    }
    await page.eval(closeAll);
    await page.eval('openSeasonArchive()'); await page.waitFor('#seasonArchiveModal.open'); await page.wait(500);
    page.note(await page.eval(REPORT('archive', '#seasonArchiveModal .ds-sheet')));
  }));
}

export default OUT;
