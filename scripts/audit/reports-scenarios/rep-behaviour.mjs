// Behaviour checks for the Reports + Dashboard screens: the same sorting, filtering, folding, tab and chart logic as before the
// redesign, driven through the real controls on the 39-match bench. Every check is an assertion in the page; a failed one fails
// the scenario and is listed in the manifest. Nothing is written anywhere (board-mock.js keeps the data in memory).
import { repBench } from './rep.mjs';

async function checks(o) {
  const out = [], fail = [];
  const ok = (name, cond, extra) => { out.push(name); if (!cond) fail.push(name + (extra !== undefined ? ' -> ' + extra : '')); };
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = (el) => { if (!el) throw new Error('no element to click'); el.click(); };

  // ── players: hero, default sort, PERF sort, group, search, clear ──
  const hist = appState.matchHistory;
  const tot = +$('#rptHeroMatches').textContent, rw = +$('#rptHeroRedWins').textContent, dr = +$('#rptHeroDraws').textContent, bw = +$('#rptHeroBlueWins').textContent;
  ok('hero numbers add up to the matches played', tot === hist.length && rw + dr + bw === tot, [tot, rw, dr, bw].join('/'));
  ok('players tab is selected', $('#rtab-players').getAttribute('aria-selected') === 'true' && $('#rpanel-players').classList.contains('active'));
  ok('default sort is PTS desc and the sort menu agrees', sortState.players.col === 'pts' && sortState.players.dir === 'desc' && $('#reportSort').value === 'pts');
  ok('the PTS header says descending', $('#playerStatsTable th .sort-icon[data-col="pts"]').closest('th').getAttribute('aria-sort') === 'descending');
  ok('54 cards and 54 table rows', $$('#statsCardList .rp-prow').length === 54 && $$('#statsTableBody tr').length === 54, $$('#statsCardList .rp-prow').length + '/' + $$('#statsTableBody tr').length);
  const pts = $$('#statsTableBody td.rp-pts').map(e => +e.textContent);
  ok('rows are in PTS order', pts.every((v, i) => i === 0 || pts[i - 1] >= v));
  ok('rank 1 is the leader', $('#statsCardList .rp-prow .rp-prow-pos').textContent.includes('1') && $('#playerStatCards .rp-kpi.is-leader .rp-kpi-v').textContent.includes($('#statsCardList .rp-prow .rp-prow-name').textContent));
  click($('#playerStatsTable .rp-th[onclick*="perf"]'));
  ok('PERF header sorts desc first', sortState.players.col === 'perf' && sortState.players.dir === 'desc' && $('#reportSort').value === 'perf');
  const perf = $$('#statsTableBody tr').map(tr => parseFloat(tr.children[5].textContent));
  ok('rows are in PERF order', perf.every((v, i) => i === 0 || perf[i - 1] >= v));
  click($('#playerStatsTable .rp-th[onclick*="perf"]'));
  ok('second click flips to asc', sortState.players.dir === 'asc' && $('#playerStatsTable th .sort-icon[data-col="perf"]').closest('th').getAttribute('aria-sort') === 'ascending');
  const sel = $('#reportSort'); sel.value = 'name'; sel.dispatchEvent(new Event('change'));
  ok('the phone sort menu sorts by name asc', sortState.players.col === 'name' && sortState.players.dir === 'asc');
  click($('#gp2'));
  ok('group G2 pressed, others not', $('#gp2').getAttribute('aria-pressed') === 'true' && $('#gpAll').getAttribute('aria-pressed') === 'false' && activeGroup === '2');
  ok('only G2 players are listed', $$('#statsTableBody tr').length > 0 && $$('#statsTableBody tr').every(tr => tr.children[3].textContent.trim() === 'G2'), $$('#statsTableBody tr').length);
  ok('KPI strip counts the filtered players', +$('#playerStatCards .rp-kpi-v').textContent === $$('#statsTableBody tr').length);
  const s = $('#reportSearch'); s.value = 'zzzz'; s.dispatchEvent(new Event('input'));
  ok('a search with no match shows the empty state with a way out', !!$('#statsCardList .ds-empty') && !!$('#statsCardList .ds-empty button'));
  click($('#statsCardList .ds-empty button'));
  ok('"ล้างตัวกรอง" clears search, team, group', $('#reportSearch').value === '' && activeGroup === '' && $('#gpAll').getAttribute('aria-pressed') === 'true' && $$('#statsCardList .rp-prow').length === 54);
  const t = $('#reportFilterTeam'); t.value = 'Red'; t.dispatchEvent(new Event('change'));
  ok('team filter keeps only Red', $$('#statsTableBody tr').every(tr => /RED/.test(tr.children[2].textContent)) && $$('#statsTableBody tr').length === appState.players.filter(p => p.team === 'Red').length);
  t.value = ''; t.dispatchEvent(new Event('change'));
  ok('points chart has 20 ranked rows', $$('#statsChart .rp-chart-row').length === 20 && $('#statsChart').getAttribute('role') === 'list');

  // ── matches ──
  switchReportTab('matches', $('#rtab-matches')); await sleep(150);
  ok('matches tab is selected', $('#rtab-matches').getAttribute('aria-selected') === 'true' && $('#rtab-players').getAttribute('aria-selected') === 'false' && $('#rpanel-matches').classList.contains('active'));
  const rounds = [...new Set(hist.map(m => m.round))].length;
  ok('one card per round, all matches listed', $$('#matchesPanelContent .rp-round').length === rounds && $$('#matchesPanelContent .rp-mrow').length === hist.length, $$('#matchesPanelContent .rp-round').length + '/' + $$('#matchesPanelContent .rp-mrow').length);
  const row = $('#matchesPanelContent .rp-mrow'), det = document.getElementById(row.getAttribute('aria-controls'));
  ok('detail starts closed', row.getAttribute('aria-expanded') === 'false' && det.hidden);
  click(row);
  ok('tap opens the analysis', row.getAttribute('aria-expanded') === 'true' && !det.hidden && row.classList.contains('open') && !!det.querySelector('.rp-m3'));
  click(row);
  ok('tap again closes it', row.getAttribute('aria-expanded') === 'false' && det.hidden);
  const m0 = hist.find(m => m.id === row.id.replace('mrow-', ''));
  const g = $$('.rp-g', row).map(e => e.textContent);
  ok('game scores are the stored scores', g.length === 4 && m0.game1.split(':')[0] === g[0] && m0.game1.split(':')[1] === g[2] && (m0.game2 === '0:0' || m0.game2.split(':')[0] === g[1]), g.join(',') + ' vs ' + m0.game1 + ' ' + m0.game2);
  ok('tag folder is there and starts closed', !$('#rpTagFold').hidden && !$('#rpTagFold').open && $$('#perfTagFilterRow .rp-tagpill').length > 0);
  const pill = $('#perfTagFilterRow .rp-tagpill'); const tagId = (pill.getAttribute('onclick').match(/'([^']+)'/) || [])[1];
  click(pill);
  const expected = hist.filter(m => (m.analysis && m.analysis.tags || []).some(x => x.id === tagId)).length;
  ok('a tag chip filters the list and the count shows it', _selectedTagFilters.size === 1 && !$('#rpTagCount').hidden && $('#rpTagCount').textContent === '1' && $$('#matchesPanelContent .rp-mrow').length === expected, expected + ' vs ' + $$('#matchesPanelContent .rp-mrow').length);
  ok('the pressed chip says so', $('#perfTagFilterRow .rp-tagpill').getAttribute('aria-pressed') === 'true');
  const rs = $('#perfFilterRound'); rs.value = '2'; rs.dispatchEvent(new Event('change'));
  ok('round filter keeps one round', $$('#matchesPanelContent .rp-round').length <= 1);
  clearMatchFilters();
  ok('clear restores everything', _selectedTagFilters.size === 0 && $('#rpTagCount').hidden && $('#perfFilterRound').value === '' && $$('#matchesPanelContent .rp-mrow').length === hist.length);
  const umps = new Set(hist.map(m => (m.umpire || 'ไม่ระบุ').trim()));
  appState.ongoingMatches.forEach(m => { if (m.umpire) umps.add(m.umpire.trim()); });
  ok('umpire load lists every umpire once with one "ว่างสุด"', $$('#umpireWorkloadContent .rp-ucard').length === umps.size && $$('#umpireWorkloadContent .ds-chip-gold').length === 1, $$('#umpireWorkloadContent .rp-ucard').length + '/' + umps.size);

  // ── dashboard ──
  switchTab('dashboard', document.getElementById('tab-dashboard')); await sleep(300);
  ok('five KPI tiles', $$('#dbKpiRow .db-kpi').length === 5);
  ok('KPI numbers are the app numbers', $('#dbKpiRow .is-red .db-kpi-v').textContent == appState.globalScoreRed && $('#dbKpiRow .is-blue .db-kpi-v').textContent == appState.globalScoreBlue && $('#dbKpiRow .is-matches .db-kpi-v').textContent == hist.length);
  const c = $('#momentumChart'), box = c.parentElement;
  ok('momentum canvas is drawn at the size of its box and has a text alternative', c.width >= box.clientWidth && c.height >= box.clientHeight && c.getAttribute('aria-label').includes('RED') && $('#momentumText').textContent.length > 40, c.width + 'x' + c.height + ' in ' + box.clientWidth + 'x' + box.clientHeight);
  ok('raw score canvas too', $('#rawScoreChart').getAttribute('aria-label').includes('BLUE') && $('#rawScoreText').textContent.length > 40);
  const px = (cv, x, y) => { const d = cv.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
  const cs = getComputedStyle(document.documentElement), tokRed = cs.getPropertyValue('--red').trim();
  // the canvas colours come from the tokens: change --red and redraw, a pixel on the red line changes with it
  document.documentElement.style.setProperty('--red', '#00ff00'); renderMomentumChart();
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let green = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 40 && data[i + 1] > 200 && data[i + 2] < 40 && data[i + 3] > 200) green++;
  document.documentElement.style.removeProperty('--red'); renderMomentumChart();
  ok('canvas colours follow the --red token', green > 50, green + ' green pixels (token was ' + tokRed + ')');
  ok('quality bars: 7 statuses, counts add up to the analysed matches', $$('#dbMatchDist .db-dist-row').length === 7 && $$('#dbMatchDist .db-dist-n').reduce((a, e) => a + +e.textContent, 0) === hist.filter(m => m.analysis).length);
  ok('top 8 players and 8 recent matches', $$('#dbTopPlayers .db-top-row').length === 8 && $$('#dbRecentMatches .db-r-item').length === 8);
  ok('duration list has every match, newest first', $$('#dbDurationList .db-dur-row').length === hist.length && $('#dbDurationList .db-dur-id').textContent.trim() === hist[hist.length - 1].id);
  window.dispatchEvent(new Event('resize')); await sleep(300);
  ok('a resize redraws without errors', $('#momentumChart').width > 0);

  return { passed: out.length - fail.length, total: out.length, fail };
}

export default [{
  id: 'rep-behaviour', app: 'board', path: '/', role: 'admin', viewports: ['390x844', '1280x800'],
  async setup(page) {
    await repBench(page, { tab: 'report' });
    const r = await page.run(checks, {});
    page.note(JSON.stringify(r));
    if (r.fail.length) throw new Error('behaviour checks failed: ' + r.fail.join(' | '));
    await page.shot('');
  },
}];
