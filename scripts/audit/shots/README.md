# shots — headless screenshots for Badminton 2026

Photographs the **umpire app**, the **scoreboard app** (guest / admin / superadmin) and **TV mode** as PNG files, and records for every
page its console errors, uncaught exceptions and refused database writes. No npm packages: Node 22+ and the Edge (or Chrome) that is
already on the machine. Several agents can run it at the same time (each run starts its own browsers and its own web server).

## Usage (copy-paste)

```powershell
# the whole set against a worktree  (--root = the worktree UNDER TEST, --label = output folder name)
node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\umpire" --label umpire-after

# only some scenarios (ids or id prefixes, comma list; * allowed) and/or only some viewports
node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\umpire" --label umpire-after --only umpire-scoring,umpire-pause --viewports 390x844,844x390

# your own scenarios in addition to (or replacing) the built-in ones
node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --root "C:\Badminton 2026\ux-v3\umpire" --label umpire-after --scenarios "C:\Badminton 2026\ux-v3\umpire\scripts\audit\my-scenarios"

# what exists
node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --list
node "C:\Badminton 2026\ux-wt\scripts\audit\shots\shots.mjs" --list --only board-admin
```

All options: `--root <dir>` · `--label <name>` · `--only <ids|prefixes>` · `--viewports <WxH,WxH>` · `--scenarios <dir[,dir]>` · `--out <dir>` ·
`--port <n>` · `--jobs <n>` (browsers side by side, default 3; use 2 when several agents shoot at once) · `--timeout <s>` (per attempt, default 40) ·
`--list` · `--fresh` · `--refresh-data` · `--real-time` · `--data <snapshot.json>`. Exit code 1 if any scenario failed.
Re-running a few scenarios into the same `--label` folder **merges** into its `manifest.json` (keyed by id + viewport, the new entry wins); `--fresh` starts a new manifest.

* **`--root` selects the worktree under test.** The web server serves that directory, so the browser runs *its* `index.html`, `umpire.html`,
  css and js — and the page-side helpers (`scripts/audit/audit-helpers.js`, `umpire-mock.js`, `umpire-wp3.js`, `umpire-wp4.js`, `board-mock.js`,
  `board-wp5.js`, `tv-grid.js`) are read from **`<root>\scripts\audit\`**, not from ux-wt. If a helper is missing there, the copy that sits
  next to this tool is used. The tool itself (this folder) can live anywhere; it never serves or reads app files from its own worktree.
  `manifest.json` records `helpersFrom` and the git `head` of `--root`.
* **`--scenarios <dir>`** loads every `*.mjs` in `<dir>` (files starting with `_` are skipped) *after* the built-in ones. A scenario whose `id`
  already exists **replaces** the built-in one (the run prints `replaced built-in: …`), so a writer can adapt a scenario to the new markup, or add
  scenarios for new screens, without touching the shared tool. Several directories: comma-separated.
* Output goes to `<scratchpad>\shots\<label>\` (`--out` or the `SHOTS_OUT` environment variable change it):
  `<id>[-suffix]__<W>x<H>.png` (device pixel ratio 2, so 390x844 is a 780x1688 file) + `manifest.json`.
  **Before / after sets pair by file name**: compare `shots\baseline\umpire-scoring-mid__390x844.png` with `shots\umpire-after\umpire-scoring-mid__390x844.png`.
* A scenario that fails leaves `FAILED_<id>__<W>x<H>.png` (the page at the moment it failed) and an `error` in the manifest.
* Time: about 4–10 s per job; the full set is 309 jobs (126 scenarios × viewports) = ~12 minutes with 3 browsers. Use `--only` for your area (a few minutes).
  Several agents at once: give each run `--jobs 2`, they are CPU-bound (every browser renders in software).

### Baseline

The pristine `main` (bcc639f, release 2026.10.04.1) is photographed from `C:\Badminton 2026\ux-v3\base` into
`C:\Users\arithat.n\AppData\Local\Temp\claude\C--Users-arithat-n--claude-spares-spare-WTUBYa\93f61434-a0b4-42df-9392-41c425f90ec2\scratchpad\shots\baseline\`
— 309 jobs, 0 failed, 0 refused writes (same file names as an after run; its `manifest.json` lists what was shot).
Known in the baseline itself: `board-admin-trophy` / `board-superadmin-trophy` log 7–13 console errors (`<polygon> attribute points: Expected number "…%"` from `js/effects.js`,
a real bug in the ceremony confetti, not the tool); the 🔒 wake-lock chip overlaps the court pill on 320x568; the TV "stale" bar covers the heading at 1280x720.

## Writing your own scenarios

```js
// <your worktree>\scripts\audit\my-scenarios\umpire-new.mjs     (run with --scenarios <that dir>)
// the shared helpers are importable from the tool folder (a file: URL, or a relative path if you run your own copy of the tool):
import { UMP, openScoring } from 'file:///C:/Badminton%202026/ux-wt/scripts/audit/shots/scenarios/_lib.mjs';

export default [{
  id: 'umpire-scoring-mid',            // same id as a built-in = replaces it
  app: 'umpire',                       // 'umpire' | 'board' | 'tv'  (decides which helpers are loaded)
  path: '/umpire.html',                // what to open on the served root
  viewports: UMP,                      // ['390x844', ...]
  // role: 'admin',                    // board only: guest | admin | superadmin (seeded in localStorage, no passcode)
  // hold: true,                       // the data never arrives (loading screens); page.eval('__shots.release()') lets it in
  async setup(page) {
    await openScoring(page, { live: { g1R: 11, g1B: 9 }, elapsedMs: 600000 });
    await page.shot('');               // optional: if setup takes no shot, one is taken afterwards
  },
}];
```

`page` API: `eval(js)` · `run(fn, arg)` (a real function that is serialised and run **in the page**: it may use only `arg` and the page's globals) ·
`click(sel)` · `type(sel, text)` · `wait(ms)` · `waitFor(sel, ms)` (visible) · `waitUntil(js, ms)` · `scrollTo(sel, top)` · `setRole(role)` ·
`shot(suffix, { full, tall })` · `note(text)` · `injectHelpers([...])`. `shot('')` writes `<id>__<vp>.png`, `shot('full', { full: true })` the whole page,
`shot('x', { tall: '#playerProfileOverlay' })` a fixed, scrolling overlay (the window is made as tall as its content for the picture).
**`page.eval` / `page.run` wait for a returned promise.** The umpire's `logoutUmpire()`, `confirmExit()` and `chooseCourt()` only settle when somebody answers the box, so call them as
`page.eval('(() => { confirmExit(); })()')` (returns nothing) and then `page.waitFor('#customModal.open')`.
Handy helpers in `scenarios/_lib.mjs`: `umpireBench(page)`, `openScoring(page, { live, court, elapsedMs })`, `boardBench(page, { role, tab, matches })`, `PICK_PROFILE`.
In the page: `window.__shots` = `{ cfg, release(), setNow(ms), advance(ms), now(), dialogs, connected }`.

## What makes the shots comparable and safe

* **The database is never reached.** Pages read a *canned copy* of the live data (`sportsday_2026_data`, photos, gallery, archive, backups …), taken once with plain
  read-only GETs and cached in `<scratchpad>\shots\_data\snapshot.json` (`--refresh-data` takes a new copy on purpose; every label shares the same copy, so a
  baseline and an after run see the same players, photos and history). The Firebase SDK is switched offline the moment it loads, its reads are answered from
  that copy, **every write is refused and listed** in `manifest.json` (`blockedWrites` — must be 0), a WebSocket to a Firebase host cannot open, and the network layer
  fails every Firebase request (a plain `GET …/x.json` is answered from the copy; the TV's health probe uses that).
* No passcode is ever typed: the role is put in `localStorage` (`bdm_scoreboard_role`) before the app boots.
* The clock is frozen at **2026-10-24 10:00 (Bangkok)** and `Math.random` is seeded: timers, "x min ago" and random pairing read the same in every run
  (`--real-time` turns that off; `__shots.advance(ms)` moves the frozen clock). Animations and transitions are off, reduced motion is on, there is no service worker,
  no Fullscreen API, a working fake wake lock (the 🔒 chip shows) and `navigator.standalone` is true — what an iPhone home-screen app looks like, and nothing
  that pops up a few seconds later. `alert / confirm / prompt / open / print` are recorded (`dialogs` in the manifest) and never agree to anything.
* Under 768 px wide = an Android phone with touch; the umpire page also gets an iPhone-style safe area (top 47 / bottom 34 px portrait; 47 px sides + 21 px bottom landscape).
  768 px and wider = a desktop browser. Locale th-TH, time zone Asia/Bangkok.
* Google Fonts and the Firebase SDK scripts are fetched once and kept in `<scratchpad>\shots\_cache`, so type never differs between runs.
* Every scenario runs in its own browser context (own storage); each `--jobs` lane has its own browser process (pages of one browser slow each other down a lot);
  one retry on failure; a hung page is closed for real at the time limit; every browser is killed on every exit path.

## Scenario ids

Roles `guest`, `admin`, `superadmin` all have the families marked `<role>`; staff = admin + superadmin. Viewports: **U** = 390x844 360x740 320x568,
**U+L** = U + 844x390, **B** = 390x844 1280x800, **B+T** = B + 768x1024, **TV** = 1920x1080 1280x720. The exact list is also in `SCENARIOS.txt` (`--list`).

```
umpire (U unless marked)
  umpire-login  umpire-login-ready  umpire-login-loading  umpire-login-slow
  umpire-list  umpire-list-onlyfree  umpire-list-empty  umpire-alert-taken  umpire-logout-confirm
  umpire-court-picker  umpire-second-match-confirm  umpire-vs-intro
  umpire-scoring-0-0 (U+L)  umpire-scoring-0-0-running (U+L)  umpire-scoring-mid (U+L)  umpire-scoring-gamepoint (U+L)  umpire-scoring-deuce (U+L)
  umpire-scoring-ready (U+L)  umpire-scoring-g2 (U+L)  umpire-scoring-scored (U+L)  umpire-scoring-two-line-names
  umpire-submit-confirm  umpire-submit-confirm-warn  umpire-submit-confirm-match  umpire-exit-confirm
  umpire-pause (U+L)  umpire-result-sent  umpire-result  umpire-result-empty
  umpire-offline  umpire-sending  umpire-error-notice  umpire-notice-ok

board (B unless marked)
  board-login  board-login-staff  board-login-passcode
  board-<role>-scoreboard-ongoing (B+T)  board-<role>-scoreboard-live (B+T)  board-<role>-scoreboard-idle (B+T)  board-<role>-scoreboard-empty
  board-<role>-scoreboard-finished (B+T)  board-<role>-players (B+T)  board-<role>-profile  board-<role>-profile-edit (staff shots only)
  board-<role>-gallery  board-guest-gallery-lightbox  board-guest-me-picker
  board-<role>-more-menu  board-<role>-popup  board-<role>-toast  board-<role>-offline
  board-<role>-loading  board-<role>-loading-slow  board-<role>-loading-failed
  staff only (admin, superadmin):
  board-<staff>-dashboard  board-<staff>-reports-players  board-<staff>-reports-matches  board-<staff>-admin  board-<staff>-admin-board-filled
  board-<staff>-admin-player-mgmt  board-<staff>-result-modal  board-<staff>-player-edit  board-<staff>-qr  board-<staff>-trophy
  superadmin only:
  board-superadmin-extras  board-superadmin-quickscore  board-superadmin-edit-result  board-superadmin-backup  board-superadmin-reset-menu
  board-superadmin-season-wizard  board-superadmin-season-archive

tv (TV)
  tv-battle  tv-vs  tv-live-grid  tv-live-quiet  tv-live-6  tv-10-courts  tv-board  tv-idle  tv-climax  tv-event-finished  tv-event-game1  tv-stale  tv-loading
```

What the less obvious ones show: `umpire-scoring-0-0` the real fresh state (clock idle 0:00), `-0-0-running` the same with the clock at 0:06; `-ready` a valid game-1 finish (21–17);
`-scored` the "just scored" glow; `-two-line-names` very long Thai / Latin names; `umpire-second-match-confirm` "you already hold T03, take another?"; `umpire-result` the finished tab,
`umpire-result-sent` the "✅ ส่งผลแล้ว" box after submitting game 2; `board-<role>-scoreboard-live` the Scoreboard tab while courts are live (arena), `-idle` the same tab with nothing started,
`-ongoing` the กำลังแข่ง tab; `tv-vs` ONE live court big (the second TV panel is called `live` in the code; `TV_PANELS` is looked up by name, `vs` or `live`);
`tv-live-grid` 4 courts, `tv-live-quiet` the same with two courts tagged "no activity", `tv-live-6` 6 + 2 queued, `tv-10-courts` the tightest layout; `board-superadmin-reset-menu` only opens the reset choice box, nothing is pressed.

## The page contract the built-in scenarios rely on

A redesign may change markup freely, but these names are what the scenarios call. If one is renamed, replace the scenario (`--scenarios`) in the same commit.

* **Umpire**: globals `appState currentUmpire activeMatchId _uKeys _uOnSnapshot updateCurrentScreen goToTab switchScreen selectMatch dismissVsIntro _vsIntroTimer exitMatch togglePause submitGame
  confirmExit logoutUmpire toggleOnlyFree showNotice _uWriteFailed _uRenderNet _uPending _uPendingSince _uOfflinePoints _uLoadSlow _uRenderLoadStates _modalDone renderGameUI _lastScored
  scoringNamesHtml setTeamFilter updateLoginReady`; elements `#screen-scoring.active #customModal.open .court-grid #vsIntro.show #pauseOverlay.show #modalBtns .modal-btn-confirm #modalTitle
  #tbtn-Red #umpireSelect`; and everything `scripts/audit/umpire-mock.js / umpire-wp3.js / umpire-wp4.js` touches.
* **Board**: `switchTab('<id>', btn)` with tab ids `scoreboard ongoing finished players gallery dashboard admin report` and buttons `#tab-<id>`; `__setRole` (board-wp5.js); `openPlayerProfile
  #playerProfileOverlay.open togglePdEdit playerPhoto playerAwards`; `openLightbox #galleryLightbox.open`; `openMePicker`; `toggleNavMenu`; `showMatchNoti #matchNotiOverlay #matchNotiBox`; `showToast`;
  `_dbOnline _dbEverOnline _lastSnapshotAt _dbRenderConn`; `_dataShow _dataPhase _dataFail #dataState`; `switchReportTab #rtab-players #rtab-matches`; `boardToggle`; `openResultModal #resultModal.open`;
  `openPlayerEdit #playerEditModal.open`; `openQrModal #qrModal.open`; `openEndGame`; `openQuickScore #quickScoreModal.open`; `openEditResult #editResultModal.open`; `openBackupModal #backupModal.open`;
  `clearData #resetChoiceModal`; `openSeasonWizard #seasonWizardModal.open`; `openSeasonArchive #seasonArchiveModal.open`; `updateChampControls`; `loginAdmin #passcodeModal`; `#loginOverlay`;
  `.login-staff`; and everything `board-mock.js / board-wp5.js` touches (`_syncBase`, `updateUI`, `renderPublicOngoingMatches`, …).
* **TV**: `TV_PANELS _tvPanel _tvTimer _tvEvent _tvEventTimer _tvClimaxOn _tvClimaxIdx _tvClimaxCooldown _tvBoardPage renderTvPanel _tvHealth _tvProbeFails _tvAliveAt _tvOfflineSince dbRef` and `tv-grid.js`.

## Files

`shots.mjs` CLI · `preload.js` page-side setup (role, frozen clock, SDK patch, no network) · `lib/cdp.mjs` DevTools-protocol client · `lib/browser.mjs` launch + kill ·
`lib/server.mjs` static server + `/__shots/db/<key>.json` (the canned database, one top-level key per request) · `lib/snapshot.mjs` canned data · `lib/net.mjs` network policy · `lib/runner.mjs` page API, one attempt, retry, lanes ·
`scenarios/` what to photograph (`_lib.mjs` = shared helpers) · `SCENARIOS.txt` the exact list.
