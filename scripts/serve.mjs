// Tiny static server for local dev/preview.
//   node scripts/serve.mjs [dir] [port]
//   dev:     serves the source root (classic scripts, no build needed)
//   preview: serves dist/ (the built output)
import { createServer } from 'http';
import { readFile } from 'fs';
import { join, extname, dirname, resolve } from 'path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 5173);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml', '.gif':'image/gif', '.ico':'image/x-icon' };

createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = join(root, p);
  if (!fp.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404 ' + p); }
    // never cache in dev — otherwise an edited js/css keeps serving stale
    // until a hard refresh, which silently hides changes you just made
    res.writeHead(200, {
      'Content-Type': TYPES[extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} → http://localhost:${port}`));
