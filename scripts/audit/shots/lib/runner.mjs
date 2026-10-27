// One scenario at one viewport = one isolated browser context (own storage, no service worker, no shared state),
// driven over CDP. The scenario only ever sees the small `page` object below.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FETCH_PATTERNS } from './net.mjs';

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FIXED_NOW = Date.UTC(2026, 9, 24, 3, 0, 0);   // 2026-10-24 10:00:00 in Bangkok
const NOISE = /ERR_BLOCKED_BY_CLIENT|firebaseio|firebasedatabase|favicon|\[Intervention\]|apple-touch-icon|Download the React DevTools/i;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const parseVp = (s) => { const m = /^(\d+)x(\d+)$/.exec(String(s)); if (!m) throw new Error('bad viewport ' + s); return { w: +m[1], h: +m[2], key: `${m[1]}x${m[2]}` }; };

function describe(d) {
  if (!d) return 'unknown error';
  return (d.exception && (d.exception.description || d.exception.value)) || d.text || 'error';
}

// the helper object scenarios use
class PageApi {
  constructor(ctx) { Object.assign(this, ctx); this.shots = []; this.notes = []; }

  S(method, params) { return this.cdp.send(method, params, this.sessionId); }

  // run an expression in the page; promises are awaited; returns the value
  async eval(expression) {
    const r = await this.S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(describe(r.exceptionDetails));
    return r.result ? r.result.value : undefined;
  }

  // run a real function in the page (it must not use variables from the scenario file; pass them as `arg`)
  run(fn, arg) { return this.eval(`(${fn.toString()})(${JSON.stringify(arg === undefined ? null : arg)})`); }

  wait(ms) { return sleep(ms); }

  async waitUntil(expr, ms = 8000, what) {
    const t0 = Date.now();
    for (;;) {
      let ok = false;
      try { ok = !!(await this.eval(expr)); } catch (e) { ok = false; }
      if (ok) return true;
      if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + (what || expr.slice(0, 80)));
      await sleep(80);
    }
  }

  waitFor(sel, ms = 8000) {
    const q = JSON.stringify(sel);
    return this.waitUntil(`(() => { const e = document.querySelector(${q}); if (!e) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; })()`, ms, 'selector ' + sel);
  }

  click(sel) {
    return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('click: no element ' + ${JSON.stringify(sel)}); e.click(); return true; })()`);
  }

  type(sel, text) {
    return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('type: no element ' + ${JSON.stringify(sel)});
      e.focus(); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(text)});
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  }

  scrollTo(sel, top) {
    return this.eval(`(() => { const e = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'document.scrollingElement'}; if (!e) throw new Error('scrollTo: no element'); e.scrollTop = ${+top || 0}; return e.scrollTop; })()`);
  }

  // the role the scoreboard was booted with is already in place; this switches it in the page (needs board-wp5.js)
  setRole(role) { return this.eval(`typeof __setRole === 'function' ? (__setRole(${JSON.stringify(role)}), true) : false`); }

  // load helper files (they are IIFEs written to be eval'd in a page) from <root>/scripts/audit — the worktree under
  // test — and, for a file that is not there, from the copy next to this tool
  async injectHelpers(names) {
    for (const n of names) {
      const dir = this.auditDirs.find((d) => existsSync(join(d, n)));
      if (!dir) throw new Error('helper ' + n + ' not found in ' + this.auditDirs.join(' or '));
      const src = readFileSync(join(dir, n), 'utf8');
      const r = await this.S('Runtime.evaluate', { expression: src, awaitPromise: false, returnByValue: true });
      if (r.exceptionDetails) throw new Error('helper ' + n + ': ' + describe(r.exceptionDetails));
    }
  }

  async fontsReady(ms = 5000) {
    try { await this.eval(`Promise.race([document.fonts.ready.then(() => document.fonts.status), new Promise((r) => setTimeout(() => r('timeout'), ${ms}))])`); } catch (e) { /* the page may be navigating */ }
  }

  async settle() {
    for (let i = 0; i < 3; i++) {
      await this.fontsReady(3000);
      await this.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))');
      if ((await this.eval('document.fonts.status')) !== 'loading') break;
    }
  }

  // <id>[-suffix]__<W>x<H>.png  — before / after sets pair by file name
  //   { full: true }       the whole page (it grows past the viewport)
  //   { tall: '<selector>' } a fixed, scrolling overlay (profile, modal, ...): the window is made as tall as the element's content for the shot
  async shot(suffix, opts = {}) {
    await this.settle();
    const name = `${this.scenario.id}${suffix ? '-' + suffix : ''}__${this.vp.key}.png`;
    const params = { format: 'png', fromSurface: true };
    let resized = false;
    if (opts.tall) {
      const h = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(opts.tall)}); return e ? Math.ceil(e.scrollHeight) : 0; })()`);
      if (h > this.vp.h) {
        const height = Math.min(h, opts.maxHeight || 6000);
        await this.S('Emulation.setDeviceMetricsOverride', Object.assign({}, this.metrics, { height, screenHeight: height }));
        resized = true;
        await sleep(200);
        await this.settle();
      }
    } else if (opts.full) {
      const m = await this.S('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: Math.max(this.vp.w, Math.ceil(cs.width)), height: Math.min(Math.max(this.vp.h, Math.ceil(cs.height)), opts.maxHeight || 6000), scale: 1 };
    }
    try {
      const r = await this.S('Page.captureScreenshot', params);
      writeFileSync(join(this.outDir, name), Buffer.from(r.data, 'base64'));
    } finally {
      if (resized) { await this.S('Emulation.setDeviceMetricsOverride', this.metrics); await sleep(150); }
    }
    this.shots.push(name);
    return name;
  }

  note(text) { this.notes.push(String(text)); }
}

function appReady(app) {
  if (app === 'umpire') return 'typeof appState !== "undefined" && !!appState && !!appState.players && appState.players.length > 0';
  return 'typeof _dataReady !== "undefined" && _dataReady === true && typeof appState !== "undefined" && !!appState && !!appState.players && appState.players.length > 0';
}

const HELPERS = {
  umpire: ['audit-helpers.js', 'umpire-mock.js', 'umpire-wp3.js', 'umpire-wp4.js'],
  board: ['audit-helpers.js', 'board-mock.js', 'board-wp5.js'],
  tv: ['audit-helpers.js', 'board-mock.js', 'board-wp5.js', 'tv-grid.js'],
};

export async function runAttempt({ cdp, env, scenario, vp, handle }) {
  const t0 = Date.now();
  const res = { id: scenario.id, app: scenario.app, viewport: vp.key, files: [], consoleErrors: [], exceptions: [], dialogs: [], blockedWrites: 0, blockedNet: 0, mockWrites: 0, notes: [] };
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
  if (handle) handle.browserContextId = browserContextId;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, width: vp.w, height: vp.h });
  if (handle) handle.targetId = targetId;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);
  let page;
  try {
    cdp.on(sessionId, 'Runtime.consoleAPICalled', (p) => {
      if (p.type !== 'error') return;
      const t = (p.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ');
      if (!NOISE.test(t)) res.consoleErrors.push(t.slice(0, 300));
    });
    cdp.on(sessionId, 'Runtime.exceptionThrown', (p) => res.exceptions.push(describe(p.exceptionDetails).slice(0, 300)));
    cdp.on(sessionId, 'Log.entryAdded', (p) => { const e = p.entry || {}; if (e.level === 'error' && !NOISE.test((e.text || '') + ' ' + (e.url || ''))) res.consoleErrors.push(((e.text || '') + (e.url ? ' ' + e.url : '')).slice(0, 300)); });
    cdp.on(sessionId, 'Page.javascriptDialogOpening', (p) => { res.dialogs.push(p.type + ': ' + p.message); S('Page.handleJavaScriptDialog', { accept: false }).catch(() => {}); });
    cdp.on(sessionId, 'Fetch.requestPaused', (p) => { env.net(sessionId, p); });

    await Promise.all([S('Page.enable'), S('Runtime.enable'), S('Network.enable'), S('Log.enable')]);
    await S('Fetch.enable', { patterns: FETCH_PATTERNS });
    await S('Network.setCacheDisabled', { cacheDisabled: true });
    await S('Network.setBypassServiceWorker', { bypass: true });
    const mobile = vp.w < 768;
    const ua = mobile ? MOBILE_UA : DESKTOP_UA;
    const metrics = Object.assign({ width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile, screenWidth: vp.w, screenHeight: vp.h },
      mobile ? { screenOrientation: vp.w > vp.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } } : {});
    await S('Emulation.setDeviceMetricsOverride', metrics);
    await S('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'th-TH,th;q=0.9,en;q=0.8' });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Bangkok' }).catch(() => {});
    await S('Emulation.setLocaleOverride', { locale: 'th-TH' }).catch(() => {});
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }).catch(() => {});
    // an iPhone's notch and home bar (only the umpire page asks for the whole screen with viewport-fit=cover)
    if (mobile && scenario.safeArea !== false && scenario.app === 'umpire') {
      const land = vp.w > vp.h;
      await S('Emulation.setSafeAreaInsetsOverride', { insets: land ? { top: 0, bottom: 21, left: 47, right: 47 } : { top: 47, bottom: 34, left: 0, right: 0 } }).catch(() => {});
    }

    const cfg = Object.assign({ now: env.realTime ? 0 : FIXED_NOW, seed: 20261024, role: scenario.role || '', hold: !!scenario.hold, storage: Object.assign({}, scenario.storage || {}, process.env.SHOTS_THEME ? { bdm_theme: process.env.SHOTS_THEME } : {}), dataDelayMs: 15 }, scenario.cfg || {});
    const preload = `window.__SHOTS_CFG = ${JSON.stringify(cfg)};\n` + env.preloadSource;
    await S('Page.addScriptToEvaluateOnNewDocument', { source: preload });

    page = new PageApi({ cdp, sessionId, vp, scenario, outDir: env.outDir, auditDirs: env.auditDirs, cfg, metrics });
    const loaded = new Promise((resolve) => { cdp.on(sessionId, 'Page.loadEventFired', () => resolve(true)); setTimeout(() => resolve(false), 15000); });
    await S('Page.navigate', { url: `http://127.0.0.1:${env.port}${scenario.path || '/'}` });
    const tm = res.timing = { start: Date.now() - t0 };
    await loaded; tm.loaded = Date.now() - t0;
    if (!scenario.hold) await page.waitUntil(appReady(scenario.app), 12000, 'the app to have its data');
    tm.data = Date.now() - t0;
    await page.fontsReady(5000); tm.fonts = Date.now() - t0;
    await page.injectHelpers(scenario.helpers || HELPERS[scenario.app] || HELPERS.board); tm.helpers = Date.now() - t0;
    await scenario.setup(page); tm.setup = Date.now() - t0;
    if (!page.shots.length) await page.shot('');

    // what the page refused
    const info = await page.eval('JSON.stringify({ blocked: window.__blocked || [], writes: (window.__writes || []).length, dialogs: (window.__shots && window.__shots.dialogs) || [], errs: window.__errs || [] })').catch(() => '{}');
    const i = JSON.parse(info || '{}');
    res.blockedWrites = (i.blocked || []).filter((x) => !/^ws-open/.test(x)).length;
    res.blockedNet = (i.blocked || []).filter((x) => /^ws-open/.test(x)).length;
    res.mockWrites = i.writes || 0;
    res.dialogs.push(...(i.dialogs || []));
    if (i.errs && i.errs.length) res.exceptions.push(...i.errs.map((x) => 'page: ' + x));
    res.blockedList = (i.blocked || []).slice(0, 8);
    res.files = page.shots;
    res.notes = page.notes;
    res.ok = true;
  } catch (e) {
    res.ok = false;
    res.error = String(e && e.message || e);
    try { if (page) { page.scenario = { id: 'FAILED_' + scenario.id }; await Promise.race([page.shot(''), sleep(6000).then(() => { throw new Error('diag shot timed out'); })]); res.files = page.shots; } } catch (e2) { /* a failed page cannot always be photographed */ }
  } finally {
    cdp.off(sessionId);
    try { await cdp.send('Target.closeTarget', { targetId }); } catch (e) { /* gone */ }
    try { await cdp.send('Target.disposeBrowserContext', { browserContextId }); } catch (e) { /* gone */ }
  }
  res.ms = Date.now() - t0;
  return res;
}

// one retry; the time limit per attempt is --timeout (default 40 s: with 3 pages rendering at once a heavy scenario
// takes 15-20 s on a laptop CPU, so 25 s timed out healthy runs)
export async function runJob(args, timeoutMs = 40000) {
  timeoutMs = Math.max(timeoutMs, args.scenario.timeoutMs || 0);   // a scenario may ask for more (the gallery decodes ~60 big photos)
  let last;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const handle = {};
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true, ok: false, id: args.scenario.id, app: args.scenario.app, viewport: args.vp.key, files: [], consoleErrors: [], exceptions: [], dialogs: [], blockedWrites: 0, blockedNet: 0, mockWrites: 0, notes: [], error: `timed out after ${timeoutMs / 1000} s`, ms: timeoutMs }), timeoutMs); });
    const work = runAttempt({ ...args, handle });
    work.catch(() => {});   // an abandoned attempt may still fail later: that must never become an unhandled rejection
    last = await Promise.race([work, timeout]);
    clearTimeout(timer);
    if (last.timedOut) {
      // a hung page keeps burning CPU for everybody else until it is really closed
      if (handle.targetId) { try { await args.cdp.send('Target.closeTarget', { targetId: handle.targetId }); } catch (e) { /* gone */ } }
      if (handle.browserContextId) { try { await args.cdp.send('Target.disposeBrowserContext', { browserContextId: handle.browserContextId }); } catch (e) { /* gone */ } }
    }
    last.attempts = attempt;
    if (last.ok) return last;
  }
  return last;
}

// `worker(job, laneIndex)`: lane i always uses the same browser
export async function runPool(jobs, concurrency, worker, onDone) {
  const results = new Array(jobs.length);
  let next = 0;
  const lane = async (_, laneIdx) => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      results[i] = await worker(jobs[i], laneIdx);
      if (onDone) onDone(results[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, idx) => lane(null, idx)));
  return results;
}

// A re-run of a few scenarios into the same label folder MERGES into the existing manifest (entries are keyed by id + viewport,
// the new one wins), so the folder always describes every PNG in it. `merge: false` (--fresh) starts a new manifest.
export function writeManifest(outDir, data, { merge = true } = {}) {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, 'manifest.json');
  const lastRun = { startedAt: data.startedAt, seconds: data.seconds, jobs: data.results.length, failed: data.results.filter((r) => !r.ok).length };
  if (merge && existsSync(file)) {
    try {
      const prev = JSON.parse(readFileSync(file, 'utf8'));
      if (prev && Array.isArray(prev.results)) {
        const key = (r) => r.id + '|' + r.viewport;
        const map = new Map(prev.results.map((r) => [key(r), r]));
        for (const r of data.results) map.set(key(r), r);
        data.results = [...map.values()];
      }
    } catch (e) { /* unreadable old manifest: write a new one */ }
  }
  data.totals = { jobs: data.results.length, ok: data.results.filter((r) => r.ok).length, failed: data.results.filter((r) => !r.ok).length };
  data.lastRun = lastRun;
  writeFileSync(file, JSON.stringify(data, null, 2));
}
