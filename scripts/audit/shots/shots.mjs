#!/usr/bin/env node
// Headless screenshot tool for Badminton 2026 (umpire + scoreboard + TV). No dependencies: Node 22+ and Edge/Chrome.
//
//   node scripts/audit/shots/shots.mjs --root <worktree dir to serve> --label <output folder name>
//        [--only <ids or id prefixes, comma list>] [--viewports <WxH,WxH>] [--scenarios <dir[,dir]>] [--out <dir>] [--port <n>]
//        [--jobs <n, default 3>] [--timeout <seconds per attempt, default 40>] [--list] [--fresh] [--refresh-data] [--real-time] [--data <snapshot.json>]
//
// --root       the worktree UNDER TEST: its files are what the browser loads, and the page-side helpers
//              (<root>/scripts/audit/*.js) are read from there too (the copy next to this tool is only the fallback).
// --scenarios  extra scenario files (*.mjs, not starting with "_") from a directory of your own, e.g. your worktree;
//              they are added to the built-in ones, and a scenario with an id that already exists REPLACES the built-in one.
// PNGs go to <out>/<id>[-suffix]__<W>x<H>.png (default <out> = <scratchpad>/shots/<label>), so a before set and an
// after set pair up by file name. manifest.json lists every shot with the console errors, uncaught exceptions and
// refused database writes of its page. Exit code 1 if any scenario failed.
//
// The database is never reached: pages read a canned copy of the live data (taken once, read-only, cached) and every
// write is refused. See preload.js. The clock is frozen at 2026-10-24 10:00 (Bangkok) unless --real-time.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CDP } from './lib/cdp.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { startServer } from './lib/server.mjs';
import { databaseUrlFrom, loadSnapshot } from './lib/snapshot.mjs';
import { createNetPolicy } from './lib/net.mjs';
import { parseVp, runJob, runPool, writeManifest } from './lib/runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL_AUDIT_DIR = resolve(HERE, '..');   // fallback copy of the page-side helpers
const BASE = process.env.SHOTS_OUT || 'C:\\Users\\arithat.n\\AppData\\Local\\Temp\\claude\\C--Users-arithat-n--claude-spares-spare-WTUBYa\\93f61434-a0b4-42df-9392-41c425f90ec2\\scratchpad\\shots';

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    if (['list', 'refresh-data', 'real-time', 'fresh', 'help'].includes(k)) o[k] = true;
    else o[k] = argv[++i];
  }
  return o;
}

// built-in scenarios first, then every extra directory; a later scenario with the same id replaces the earlier one
async function loadScenarios(extraDirs) {
  const byId = new Map();
  const replaced = [];
  for (const dir of [join(HERE, 'scenarios'), ...extraDirs]) {
    if (!existsSync(dir)) throw new Error('scenario directory not found: ' + dir);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')).sort()) {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      for (const sc of (mod.default || mod.scenarios || [])) {
        if (byId.has(sc.id)) replaced.push(sc.id);
        byId.set(sc.id, Object.assign({ file: join(dir, f) }, sc));
      }
    }
  }
  return { list: [...byId.values()], replaced };
}

const matcher = (tokens) => {
  const res = tokens.map((t) => (t.includes('*') ? new RegExp('^' + t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$') : null));
  return (id) => tokens.some((t, i) => (res[i] ? res[i].test(id) : id === t || id.startsWith(t)));
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const extraDirs = args.scenarios ? args.scenarios.split(',').map((s) => resolve(s.trim())).filter(Boolean) : [];
const { list: scenarios, replaced } = await loadScenarios(extraDirs);
let chosen = scenarios;
if (args.only) { const m = matcher(args.only.split(',').map((s) => s.trim()).filter(Boolean)); chosen = scenarios.filter((s) => m(s.id)); }

if (args.list) {
  for (const s of chosen) console.log(`${s.id.padEnd(44)} ${String(s.app).padEnd(7)} ${(s.viewports || ['390x844']).join(' ')}`);
  console.log(`\n${chosen.length} scenarios`);
  process.exit(0);
}
if (!args.root) { console.error('--root <worktree dir> is required (see --help)'); process.exit(2); }
if (!args.label && !args.out) { console.error('--label <name> is required (see --help)'); process.exit(2); }
if (!chosen.length) { console.error('no scenario matches --only ' + args.only); process.exit(2); }

const root = resolve(args.root);
if (!existsSync(join(root, 'index.html'))) { console.error('no index.html in ' + root); process.exit(2); }
const outDir = resolve(args.out || join(BASE, args.label));
mkdirSync(outDir, { recursive: true });
const override = args.viewports ? args.viewports.split(',').map((s) => parseVp(s.trim())) : null;
const jobs = [];
for (const sc of chosen) for (const vp of (override || (sc.viewports || ['390x844']).map(parseVp))) jobs.push({ scenario: sc, vp });

const t0 = Date.now();
const dbUrl = databaseUrlFrom(root);
const { snap, cached } = await loadSnapshot({ cacheFile: resolve(args.data || join(BASE, '_data', 'snapshot.json')), refresh: !!args['refresh-data'], dbUrl });
if (!snap.sportsday_2026_data) { console.error('the canned database has no sportsday_2026_data (offline? run once with network)'); process.exit(2); }
const server = await startServer({ root, port: args.port ? +args.port : 0, db: snap });

// One browser PER LANE. Contexts of one browser share its GPU / compositor process, so three pages in one browser
// took three times as long each (no speed-up at all); separate browsers really run side by side.
const lanes = Math.max(1, Math.min(+(args.jobs || 3), jobs.length));
const stats = { cacheHit: 0, cacheFill: 0, blockedWrites: 0, blockedNet: 0 };
const preloadSource = readFileSync(join(HERE, 'preload.js'), 'utf8');
const rootAudit = join(root, 'scripts', 'audit');
const laneState = [];
for (let i = 0; i < lanes; i++) {
  const browser = await launchBrowser();
  const cdp = await new CDP(browser.ws).connect();
  laneState.push({
    browser, cdp,
    env: {
      port: server.port, outDir, auditDirs: [rootAudit, TOOL_AUDIT_DIR], realTime: !!args['real-time'], preloadSource,
      net: createNetPolicy({ cdp, cacheDir: join(BASE, '_cache'), snapshot: snap, stats }),
    },
  });
}
console.log(`shots: ${jobs.length} jobs from ${chosen.length} scenarios · ${lanes} browser${lanes > 1 ? 's' : ''} · root ${root} · out ${outDir}\n       ${laneState[0].browser.exe}\n       data ${cached ? 'cached' : 'fetched now'} (${snap.__fetchedAt || '?'})`
  + `\n       helpers from ${existsSync(rootAudit) ? rootAudit : '(none in root) ' + TOOL_AUDIT_DIR}${extraDirs.length ? '\n       extra scenarios from ' + extraDirs.join(', ') : ''}${replaced.length ? '\n       replaced built-in: ' + replaced.join(', ') : ''}`);

let done = 0, failed = 0;
const timeoutMs = Math.round(+(args.timeout || 40) * 1000);
const results = await runPool(jobs, lanes, (j, lane) => runJob({ cdp: laneState[lane].cdp, env: laneState[lane].env, scenario: j.scenario, vp: j.vp }, timeoutMs), (r) => {
  done++;
  if (!r.ok) failed++;
  const warn = (r.exceptions.length ? ` exc:${r.exceptions.length}` : '') + (r.consoleErrors.length ? ` err:${r.consoleErrors.length}` : '') + (r.blockedWrites ? ` BLOCKED-WRITES:${r.blockedWrites}` : '');
  console.log(`[${String(done).padStart(String(jobs.length).length)}/${jobs.length}] ${r.ok ? 'ok  ' : 'FAIL'} ${r.id} ${r.viewport} ${(r.ms / 1000).toFixed(1)}s${r.attempts > 1 ? ' (retry)' : ''}${warn}${r.ok ? '' : '  → ' + r.error}`);
});

let head = '';
try { head = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(); } catch (e) { /* not a git dir */ }
writeManifest(outDir, {
  label: args.label || '', root, head, startedAt: new Date(t0).toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
  frozenClock: args['real-time'] ? null : '2026-10-24T10:00:00+07:00', snapshot: { fetchedAt: snap.__fetchedAt, cached },
  helpersFrom: existsSync(rootAudit) ? rootAudit : TOOL_AUDIT_DIR, extraScenarioDirs: extraDirs, replacedScenarios: replaced,
  net: stats, results,
}, { merge: !args.fresh });
console.log(`\ndone in ${Math.round((Date.now() - t0) / 1000)} s: ${jobs.length - failed}/${jobs.length} ok, ${failed} failed · blocked db writes: ${results.reduce((n, r) => n + r.blockedWrites, 0)} · ${outDir}`);
for (const l of laneState) { l.cdp.close(); l.browser.close(); }
await server.close();
process.exit(failed ? 1 : 0);
