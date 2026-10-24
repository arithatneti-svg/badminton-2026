// Builds shared/icons.js from Phosphor Icons (MIT). The network is used ONLY by this build step, never by the app.
//
//   node scripts/icons-fetch.mjs --list scripts/icons-list.json --raw <new empty dir> --catalog <phosphor-icons-upstream.json> --out shared/icons.js
//
// To add an icon: put its name in scripts/icons-list.json ("regular" and/or "fill") and run the line above again.
// --catalog is optional (it only lets the script report unknown names with suggestions before downloading).
// Downloaded SVG text is untrusted: only a whitelist of shapes and attributes survives into icons.js.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const listFile = arg('list') || 'scripts/icons-list.json';
const rawDir = arg('raw');
const outFile = arg('out') || 'shared/icons.js';
const catalogFile = arg('catalog');
if (!rawDir) { console.error('--raw <dir> is required (a new, empty folder for the downloads)'); process.exit(2); }

const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
const VERSION = list.version || '2.1.1';
const BASE = `https://cdn.jsdelivr.net/npm/@phosphor-icons/core@${VERSION}/assets`;

// ── optional catalog check ──────────────────────────────────────────────
if (catalogFile && fs.existsSync(catalogFile)) {
  const names = new Set(JSON.parse(fs.readFileSync(catalogFile, 'utf8')).icons.map((i) => i.name));
  const all = new Set([...list.regular, ...list.fill]);
  const missing = [...all].filter((n) => !names.has(n));
  if (missing.length) {
    console.error('Unknown icon names (not in the Phosphor catalog):');
    for (const m of missing) {
      const part = m.split('-')[0];
      const like = [...names].filter((n) => n.includes(part)).slice(0, 6);
      console.error('  ' + m + '   similar: ' + like.join(', '));
    }
    process.exit(3);
  }
}

// ── download (cached in --raw) ───────────────────────────────────────────
fs.mkdirSync(path.join(rawDir, 'regular'), { recursive: true });
fs.mkdirSync(path.join(rawDir, 'fill'), { recursive: true });
const jobs = [];
for (const n of list.regular) jobs.push({ key: n, weight: 'regular', url: `${BASE}/regular/${n}.svg`, file: path.join(rawDir, 'regular', n + '.svg') });
for (const n of list.fill) jobs.push({ key: n + '-fill', weight: 'fill', url: `${BASE}/fill/${n}-fill.svg`, file: path.join(rawDir, 'fill', n + '-fill.svg') });

async function get(job) {
  if (fs.existsSync(job.file)) return fs.readFileSync(job.file, 'utf8');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(job.url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    fs.writeFileSync(job.file, text);
    return text;
  } finally { clearTimeout(t); }
}

let next = 0;
const results = new Map();
const failed = [];
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    try { results.set(job.key, await get(job)); }
    catch (e) { failed.push(job.key + ' (' + e.message + ')'); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
if (failed.length) { console.error('Download failed for: ' + failed.join(', ')); process.exit(4); }

// ── sanitize: keep only whitelisted shapes + attributes ──────────────────
const TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'fill-rule', 'clip-rule', 'opacity', 'transform']);
const SAFE_VAL = /^[A-Za-z0-9eE.,\-+\s()#%]*$/;

function clean(key, text) {
  const m = text.match(/^\s*(?:<\?xml[^>]*>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i);
  if (!m) throw new Error('not a plain svg');
  if (!/viewBox="0 0 256 256"/.test(m[1])) throw new Error('unexpected viewBox');
  const body = m[2];
  if (/<(script|style|image|foreignObject|use|a|animate|set|text|filter|mask|clipPath|defs|linearGradient|radialGradient)\b/i.test(body)) throw new Error('forbidden element');
  if (/\son[a-z]+\s*=|javascript:|href\s*=/i.test(body)) throw new Error('forbidden attribute');
  const out = [];
  const re = /<([a-zA-Z]+)\b([^>]*?)\/?>/g;
  let t;
  while ((t = re.exec(body))) {
    const tag = t[1].toLowerCase();
    if (!TAGS.has(tag)) throw new Error('unexpected <' + tag + '>');
    const attrs = [];
    const are = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
    let a;
    let hidden = false;
    while ((a = are.exec(t[2]))) {
      const name = a[1];
      const val = a[2];
      if (name === 'fill' && val === 'none') { hidden = true; continue; }   // Phosphor draws an invisible 256x256 rect on some icons
      if (!ATTRS.has(name)) continue;
      if (!SAFE_VAL.test(val)) throw new Error('unsafe value in ' + name);
      attrs.push(name + '="' + val + '"');
    }
    if (hidden) continue;
    out.push('<' + tag + ' ' + attrs.join(' ') + '/>');
  }
  if (!out.length) throw new Error('no shapes');
  return out.join('');
}

const data = {};
const bad = [];
for (const job of jobs) {
  try { data[job.key] = clean(job.key, results.get(job.key)); }
  catch (e) { bad.push(job.key + ' (' + e.message + ')'); }
}
if (bad.length) { console.error('Rejected: ' + bad.join(', ')); process.exit(5); }

// ── write shared/icons.js ────────────────────────────────────────────────
const header = `/* shared/icons.js - generated by scripts/icons-fetch.mjs, do not edit by hand.
 *
 * Icons: Phosphor Icons ${VERSION} (https://github.com/phosphor-icons/core)
 * MIT License - Copyright (c) 2020-2023 Phosphor Icons
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
 * copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
 * SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * Use:  dsIcon('trophy')                          decorative icon (aria-hidden)
 *       dsIcon('trophy', {fill:true})             filled weight (only the names listed in scripts/icons-list.json "fill")
 *       dsIcon('trophy', {size:20, cls:'x'})      fixed px size / extra class
 *       dsIcon('wifi-slash', {label:'ออฟไลน์'})   meaningful icon: role=img + aria-label
 *     or in static html:  <svg class="ds-ic" aria-hidden="true"><use href="#ic-trophy"/></svg>
 *     Colour = currentColor. Size = 1.25em unless .ds-ic-sm / .ds-ic-lg / width+height are set (css/ui.css).
 */
`;

const entries = Object.keys(data).map((k) => '    ' + JSON.stringify(k) + ': ' + JSON.stringify(data[k])).join(',\n');
const runtime = `
(function () {
  'use strict';
  var D = {
${entries}
  };

  window.DS_ICONS = Object.keys(D);

  window.dsIcon = function (name, o) {
    o = o || {};
    var key = String(name).replace(/[^a-z0-9-]/g, '') + (o.fill ? '-fill' : '');
    if (!D[key] && window.console) console.warn('dsIcon: unknown icon', key);
    var size = o.size ? ' width="' + (+o.size) + '" height="' + (+o.size) + '"' : '';
    var a = o.label
      ? ' role="img" aria-label="' + String(o.label).replace(/"/g, '&quot;') + '"'
      : ' aria-hidden="true" focusable="false"';
    return '<svg class="ds-ic' + (o.cls ? ' ' + String(o.cls).replace(/[^\\w -]/g, '') : '') + '"' + size + a +
      '><use href="#ic-' + key + '"/></svg>';
  };

  function mount() {
    if (document.getElementById('ds-icons')) return;
    var s = '<svg id="ds-icons" xmlns="http://www.w3.org/2000/svg" width="0" height="0" ' +
      'style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">';
    for (var k in D) if (Object.prototype.hasOwnProperty.call(D, k)) {
      s += '<symbol id="ic-' + k + '" viewBox="0 0 256 256">' + D[k] + '</symbol>';
    }
    document.body.insertAdjacentHTML('beforeend', s + '</svg>');
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
`;

fs.writeFileSync(outFile, header + runtime);
console.log('icons: ' + Object.keys(data).length + ' (' + list.regular.length + ' regular, ' + list.fill.length + ' fill) -> ' + outFile + ' (' + fs.statSync(outFile).size + ' bytes)');
