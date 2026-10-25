// Static server for ONE worktree, plus the canned database at /__shots/db/<top-level key>.json.
// Always no-store: an edited file must never be served stale.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

export function startServer({ root, port = 0, db }) {
  const base = resolve(root);
  const encoded = new Map();   // top-level database key -> its JSON text, made on first request (the gallery alone is 15 MB)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);
      const m = /^\/__shots\/db\/(.+)\.json$/.exec(p);
      if (m) {   // one top-level key of the canned database; the page asks only for the keys it reads
        if (!encoded.has(m[1])) encoded.set(m[1], JSON.stringify(Object.prototype.hasOwnProperty.call(db, m[1]) ? db[m[1]] : null));
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
        return res.end(encoded.get(m[1]));
      }
      if (p === '/') p = '/index.html';
      const fp = resolve(join(base, p));
      if (fp !== base && !fp.startsWith(base + sep)) { res.writeHead(403); return res.end('forbidden'); }
      let target = fp;
      try { if ((await stat(target)).isDirectory()) target = join(target, 'index.html'); } catch (e) { /* 404 below */ }
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store, must-revalidate', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 ' + req.url);
    }
  });
  return new Promise((resolveP, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolveP({ server, port: server.address().port, close: () => new Promise((r) => server.close(() => r())) }));
  });
}
