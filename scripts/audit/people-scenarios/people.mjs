// Extra scenarios for the people area (Players directory, Profile, Gallery, photo tools, award dialog) and the in-page audits.
// Run:  node <ux-wt>/scripts/audit/shots/shots.mjs --root <this worktree> --label people-extra --scenarios <this worktree>/scripts/audit/people-scenarios --only people-
// Self-contained on purpose (it does not import the tool's _lib.mjs). Nothing here writes to a database: the shots tool refuses every write.
const PHONE = '390x844', LAPTOP = '1280x800', TABLET = '768x1024', SMALL = '320x568';
const mk = (id, role, viewports, setup, extra = {}) => Object.assign({ id, app: 'board', path: '/', role, viewports, setup }, extra);

async function bench(page, role, tab) {
  await page.run(async (o) => {
    await __audit.wp5Setup();
    __setRole(o.role);
    if (o.tab) switchTab(o.tab, document.getElementById('tab-' + o.tab));
    await new Promise((r) => setTimeout(r, 500));
  }, { role, tab });
}
// a Blue player with a photo and at least two awards (any player with a photo as a fallback)
const PICK = () => {
  const ps = appState.players || [], withPhoto = ps.filter((p) => !!playerPhoto(p.id));
  const best = withPhoto.find((p) => p.team === 'Blue' && playerAwards(p).length >= 2) || withPhoto[0] || ps[0];
  return best ? best.id : null;
};
// the first player nobody has written anything about: no photo, no award
const PICK_BARE = () => { const p = (appState.players || []).find((x) => !playerPhoto(x.id) && playerAwards(x).length === 0); return p ? p.id : appState.players[appState.players.length - 1].id; };
const LONG = ['ธนาธิปพงศ์พัฒน์ วงศ์วิริยะกุลเจริญสุข ณ อยุธยา', 'Maximilian Alexander von Hohenzollern-Sigmaringen', 'สมชายสมหญิงสมศักดิ์สมศรี', 'ชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆ', 'Jo'];

// contrast / small targets / English words for one root; the result goes into the manifest notes of this scenario
async function audit(page, label, root) {
  const r = await page.run((o) => {
    const A = __audit, c = A.contrast(o.root, 8);
    return { contrast: { total: c.total, fail: c.fail, worst: (c.worst || []).slice(0, 6).map((w) => `${w.sel} ${w.fg} on ${w.bg} ${w.ratio}:1 (${w.fs}px) "${w.sample}"`) }, small44: A.small(o.root, 44), english: A.wp5English ? A.wp5English(o.root) : 'n/a', overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  }, { root });
  page.note(`${label} @ ${root}: contrast fail ${r.contrast.fail}/${r.contrast.total} ${JSON.stringify(r.contrast.worst)} | small<44: ${JSON.stringify(r.small44)} | english: ${JSON.stringify(r.english)} | overflowX: ${r.overflowX}`);
  return r;
}

// sideways scroll of the page, in px (0 = none): a note in the manifest
async function overflow(page) { page.note('overflowX: ' + await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')); }

const out = [];

// ── the audits: every screen of the area, per role, at the two sizes that matter ──
for (const role of ['guest', 'superadmin']) {
  out.push(mk(`people-audit-${role}`, role, [PHONE, LAPTOP], async (page) => {
    await bench(page, role, 'players');
    await page.wait(400);
    await audit(page, 'players', '#players');
    const id = await page.run(PICK);
    await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
    await page.waitFor('#playerProfileOverlay.open');
    await page.wait(400);
    await audit(page, 'profile', '#playerProfileOverlay');
    if (role !== 'guest') { await page.eval('togglePdEdit(true)'); await page.wait(200); await audit(page, 'profile-edit', '#playerProfileOverlay'); await page.eval('togglePdEdit(false)'); }
    await page.eval('closePlayerProfile()');
    await page.eval("switchTab('gallery', document.getElementById('tab-gallery'))");
    await page.waitUntil("document.querySelectorAll('#galleryGrid .gal-item').length > 0", 9000, 'gallery photos');
    await page.wait(300);
    await audit(page, 'gallery', '#gallery');
    await page.eval('openLightbox(0)');
    await page.waitFor('#galleryLightbox.open');
    await audit(page, 'lightbox', '#galleryLightbox');
    await page.eval('closeLightbox()');
    await page.eval("document.getElementById('awardInfoModal').classList.add('open')");
    await page.wait(150);
    await audit(page, 'award-info', '#awardInfoModal');
    await page.shot('');
  }));
}

// ── players directory states ──
out.push(mk('people-players-filters', 'guest', [PHONE], async (page) => {   // the phone's filter panel open, a team chosen, sorted by win rate
  await bench(page, 'guest', 'players');
  await page.eval("togglePlayersFilters(true)");
  await page.eval("(() => { document.getElementById('playersTabFilterTeam').value = 'Red'; document.getElementById('playersTabSortBy').value = 'winRate'; renderPlayersTab(); })()");
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-players-empty', 'guest', [PHONE, LAPTOP], async (page) => {   // a search that finds nobody
  await bench(page, 'guest', 'players');
  await page.type('#playersTabSearch', 'zzzzzz');
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-players-name', 'superadmin', [PHONE, LAPTOP], async (page) => {   // sorted by name: no podium, no ranks; staff actions on a laptop
  await bench(page, 'superadmin', 'players');
  await page.eval("(() => { document.getElementById('playersTabSortBy').value = 'name'; renderPlayersTab(); })()");
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-players-long', 'guest', [SMALL, PHONE, TABLET], async (page) => {   // 30+ character names in the podium and the rows, and "me" set
  await bench(page, 'guest', 'players');
  await page.run((names) => {
    const st = getPlayerStats();
    const top = [...appState.players].sort((a, b) => (st[b.id].pts || 0) - (st[a.id].pts || 0) || a.group - b.group).slice(0, 5);
    top.forEach((p, i) => { p.name = names[i]; });
    try { localStorage.setItem('bdm_me_player', top[3].id); loadMe(); } catch (e) {}
    renderPlayersTab();
  }, LONG);
  await page.wait(300);
  await overflow(page);
  await page.shot('');
}));

// ── profile states ──
out.push(mk('people-profile-bare', 'superadmin', [PHONE, LAPTOP], async (page) => {   // nothing written about this player yet: the staff hint
  await bench(page, 'superadmin', 'players');
  const id = await page.run(PICK_BARE);
  await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
  await page.waitFor('#playerProfileOverlay.open');
  await page.wait(400);
  await page.shot('', { tall: '#playerProfileOverlay' });
}));
out.push(mk('people-profile-bare-guest', 'guest', [PHONE, LAPTOP], async (page) => {   // the same player for a viewer: one calm column
  await bench(page, 'guest', 'players');
  const id = await page.run(PICK_BARE);
  await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
  await page.waitFor('#playerProfileOverlay.open');
  await page.wait(400);
  await page.shot('', { tall: '#playerProfileOverlay' });
}));
out.push(mk('people-profile-long', 'superadmin', [SMALL, PHONE], async (page) => {   // long name + staff tools on the narrowest phone
  await bench(page, 'superadmin', 'players');
  const id = await page.run((names) => { const p = appState.players.find((x) => !!playerPhoto(x.id)) || appState.players[0]; p.name = names[0]; return p.id; }, LONG);
  await page.eval(`openPlayerProfile(${JSON.stringify(id)})`);
  await page.waitFor('#playerProfileOverlay.open');
  await page.wait(400);
  await overflow(page);
  await page.shot('', { tall: '#playerProfileOverlay' });
}));
out.push(mk('people-photo-lightbox', 'guest', [PHONE, LAPTOP], async (page) => {   // a face, full size, over the profile
  await bench(page, 'guest', 'players');
  const id = await page.run(PICK);
  await page.eval(`openPlayerProfile(${JSON.stringify(id)}); openPhotoLightbox(${JSON.stringify(id)})`);
  await page.waitFor('#photoLightbox.open');
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-photo-adjust', 'superadmin', [PHONE, LAPTOP], async (page) => {   // the focal-point dialog
  await bench(page, 'superadmin', 'players');
  const id = await page.run(PICK);
  await page.eval(`openPlayerProfile(${JSON.stringify(id)}); openPhotoAdjust(${JSON.stringify(id)})`);
  await page.waitFor('#photoAdjustModal.open');
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-award-info', 'superadmin', [PHONE, LAPTOP], async (page) => {   // the award criteria (opened from the ceremony)
  await bench(page, 'superadmin', 'ongoing');
  await page.eval("document.getElementById('awardInfoModal').classList.add('open')");
  await page.wait(300);
  await page.shot('', { tall: '#awardInfoModal .modal-box' });
}));

// ── gallery states ──
const galleryReady = (page) => page.waitUntil("document.querySelectorAll('#galleryGrid .gal-item').length > 0", 9000, 'gallery photos');
out.push(mk('people-gallery-select', 'superadmin', [PHONE, LAPTOP], async (page) => {   // select mode, three photos chosen, then the move dialog
  await bench(page, 'superadmin', 'gallery');
  await galleryReady(page);
  await page.eval("toggleGalSelect()");
  await page.eval("[0, 1, 2].forEach(i => document.querySelectorAll('.gal-item')[i].click())");
  await page.wait(300);
  await page.shot('');
  await page.eval('openGalMove()');
  await page.waitFor('#galMoveModal.open');
  await page.wait(200);
  await page.shot('move');
}));
out.push(mk('people-gallery-lightbox-admin', 'superadmin', [PHONE, LAPTOP], async (page) => {   // the lightbox with the staff delete
  await bench(page, 'superadmin', 'gallery');
  await galleryReady(page);
  await page.eval('openLightbox(2)');
  await page.waitFor('#galleryLightbox.open');
  await page.wait(500);
  await page.shot('');
}));
out.push(mk('people-gallery-empty', 'superadmin', [PHONE], async (page) => {   // an album with no photos yet (staff see the action)
  await bench(page, 'superadmin', 'gallery');
  await galleryReady(page);
  await page.eval("(() => { _gallery = {}; _galleryLoaded = true; _galleryPhase = 'ready'; _galleryYear = ''; paintGallery(); })()");
  await page.wait(300);
  await page.shot('');
}));
out.push(mk('people-gallery-states', 'guest', [PHONE], async (page) => {   // loading tiles, then the failed state with its retry
  await bench(page, 'guest', 'gallery');
  await galleryReady(page);
  await page.eval("(() => { _galleryLoaded = false; _galleryPhase = 'loading'; paintGallery(); })()");
  await page.wait(250);
  await page.shot('loading');
  await page.eval("(() => { _galleryPhase = 'failed'; paintGallery(); })()");
  await page.wait(250);
  await page.shot('failed');
}));
out.push(mk('people-gallery-cap', 'superadmin', [PHONE], async (page) => {   // an upload in progress and an album close to its 200-photo cap
  await bench(page, 'superadmin', 'gallery');
  await galleryReady(page);
  await page.eval(`(() => { const px = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    _gallery['2026'] = Object.fromEntries(Array.from({ length: 186 }, (_, i) => ['p' + i, { url: px, caption: '', event: 'ต้นปี', ts: i }]));
    _galUp = { done: 3, total: 12 }; paintGallery(); })()`);
  await page.wait(300);
  await page.shot('');
}));

export default out;
