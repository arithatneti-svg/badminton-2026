// Stamps ?v=<APP_VERSION> on every local css/js tag of index.html and umpire.html.
//
// Why: the service worker keeps css/js in its cache. A phone that loads NEW html (network-first) next to OLD css/js
// from that cache shows a half-updated page - the owner's umpire screenshot of 2026-10-24 was exactly that: the new
// bottom bar and an empty banner element next to the old stylesheet that knew neither. A URL that carries the release
// number exists for exactly one release, so new html can only ever pull new files.
//
//   node scripts/stamp-version.mjs            rewrite the tags (run after bumping shared/version.js)
//   node scripts/stamp-version.mjs --check    exit 1 when a tag is missing or carries another release (npm test runs this)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const PAGES = ['index.html', 'umpire.html', 'draw.html'];

export function appVersion(root = ROOT) {
  const m = /APP_VERSION\s*=\s*["']([^"']+)["']/.exec(fs.readFileSync(path.join(root, 'shared/version.js'), 'utf8'));
  if (!m) throw new Error('APP_VERSION not found in shared/version.js');
  return m[1];
}

// local = relative url (no scheme, not protocol-relative) that ends in .css or .js, with an optional ?v=...
const TAG = /(<link\b[^>]*\bhref="|<script\b[^>]*\bsrc=")((?!https?:|\/\/|data:)[^"?#]+\.(?:css|js))(\?v=[^"#]*)?(")/g;

export function listTags(html) {
  const out = [];
  html.replace(TAG, (all, head, file, q) => { out.push({ file, v: q ? q.slice(3) : '' }); return all; });
  return out;
}

export function stamp(html, ver) {
  return html.replace(TAG, (all, head, file, q, quote) => head + file + '?v=' + ver + quote);
}

function main() {
  const ver = appVersion();
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const page of PAGES) {
    const p = path.join(ROOT, page);
    const html = fs.readFileSync(p, 'utf8');
    if (check) {
      const wrong = listTags(html).filter((t) => t.v !== ver);
      for (const t of wrong) console.error(page + ': ' + t.file + ' has ?v=' + (t.v || '(none)') + ', expected ' + ver);
      bad += wrong.length;
    } else {
      const next = stamp(html, ver);
      if (next !== html) fs.writeFileSync(p, next);
      console.log(page + ': ' + listTags(next).length + ' tags at ?v=' + ver + (next === html ? ' (unchanged)' : ''));
    }
  }
  if (bad) { console.error('Run: node scripts/stamp-version.mjs'); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
