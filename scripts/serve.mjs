// Tiny static server for local dev/preview.
//   node scripts/serve.mjs [dir] [port]
//   dev:     serves the source root (classic scripts, no build needed)
//   preview: serves dist/ (the built output)
import { createServer } from 'http';
import { readFile, statSync } from 'fs';
import { join, extname, dirname, resolve } from 'path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 5173);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.gif':'image/gif', '.ico':'image/x-icon' };

// Stamp local css/js refs with the file's mtime when serving HTML.
// no-store alone is not enough: an entry cached *before* the header
// existed keeps being reused, so an edited file can silently keep
// serving the old version. A changing URL can never do that.
// Dev only — Cloudflare Pages serves the source index.html directly and
// never goes through this file.
function stampAssets(html) {
  return html.replace(/(src|href)="((?:js|css|shared|umpire)\/[^"?]+\.(?:js|css))"/g, (full, attr, path) => {
    try {
      const m = statSync(join(root, path)).mtimeMs;
      return `${attr}="${path}?v=${Math.floor(m)}"`;
    } catch {
      return full;
    }
  });
}

createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404 ' + p); }
    const ext = extname(fp);
    let body = data;
    if (ext === '.html') body = Buffer.from(stampAssets(data.toString('utf8')), 'utf8');
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  });
}).listen(port, () => console.log(`serving ${root} → http://localhost:${port}`));
