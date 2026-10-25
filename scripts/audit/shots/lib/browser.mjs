// Launch a headless Chromium (Edge first, Chrome as the fallback) with a throw-away profile, and make sure it dies
// on every exit path (normal end, Ctrl-C, crash): on Windows a child's renderers outlive it unless the whole tree is killed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.SHOTS_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const live = new Set();   // { child, dir }
let hooked = false;

function killTree(child) {
  if (!child || child.pid === undefined) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGKILL');
  } catch (e) { /* already dead */ }
}

// a killed browser releases its profile folder a moment later; wait a little, then remove it
function removeDir(dir) {
  for (let i = 0; i < 6; i++) {
    try { rmSync(dir, { recursive: true, force: true }); return; } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); }
  }
}

// profile folders of runs that were killed hard (no exit handler ran) — older than 30 minutes and nobody uses them
function sweepStale() {
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith('shots-profile-')) continue;
      const p = join(tmpdir(), name);
      try { if (Date.now() - statSync(p).mtimeMs > 30 * 60 * 1000) removeDir(p); } catch (e) { /* in use */ }
    }
  } catch (e) { /* ignore */ }
}

export function killAll() {
  for (const b of live) { killTree(b.child); }
  for (const b of live) removeDir(b.dir);
  live.clear();
}

function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on('exit', killAll);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(130); });
  process.on('uncaughtException', (e) => { console.error('uncaught:', e && e.stack || e); killAll(); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error('unhandled rejection:', e && e.stack || e); killAll(); process.exit(1); });
}

export function findBrowser() {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('No Edge/Chrome found. Set SHOTS_BROWSER to a chromium executable.');
  return exe;
}

export async function launchBrowser() {
  hookExit();
  sweepStale();
  const exe = findBrowser();
  const dir = mkdtempSync(join(tmpdir(), 'shots-profile-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-component-update',
    '--disable-default-apps', '--disable-popup-blocking', '--disable-features=Translate,OptimizationHints,MediaRouter,msEdgeFRE,msEdgeSignIn',
    '--mute-audio', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text',
    '--autoplay-policy=no-user-gesture-required', '--hide-crash-restore-bubble', 'about:blank',
  ];
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true, detached: false });
  const rec = { child, dir };
  live.add(rec);
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', (e) => { console.error('browser failed to start:', e.message); });
  // Chromium writes DevToolsActivePort (port, then the browser websocket path) into the profile once it listens
  const file = join(dir, 'DevToolsActivePort');
  const t0 = Date.now();
  let ws = '';
  while (Date.now() - t0 < 20000) {
    if (exited) throw new Error('browser exited before it opened the debugging port');
    if (existsSync(file)) {
      try {   // the browser may still hold the file open (EBUSY on Windows): look again in a moment
        const [port, path] = readFileSync(file, 'utf8').split(/\r?\n/);
        if (port && path) { ws = `ws://127.0.0.1:${port}${path}`; break; }
      } catch (e) { /* not readable yet */ }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ws) { killAll(); throw new Error('browser did not open a debugging port within 20 s'); }
  return { exe, ws, close: () => { killTree(child); removeDir(dir); live.delete(rec); } };
}
