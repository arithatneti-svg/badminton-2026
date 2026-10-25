// Network policy for every page (Fetch domain):
//  - Firebase database hosts: NOTHING gets through. A plain GET of "<path>.json" is answered from the canned snapshot
//    (the TV probes matchCounter.json that way); anything else is refused, and a non-GET is counted as a blocked write.
//  - Google Fonts and the Firebase SDK scripts: fetched once with Node, kept on disk, served from there afterwards, so a
//    run does not depend on the network and the type never changes between a baseline and an after run.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FETCH_PATTERNS = [
  { urlPattern: '*://*.firebaseio.com/*', requestStage: 'Request' },
  { urlPattern: '*://*.firebasedatabase.app/*', requestStage: 'Request' },
  { urlPattern: '*://www.gstatic.com/firebasejs/*', requestStage: 'Request' },
  { urlPattern: '*://fonts.googleapis.com/*', requestStage: 'Request' },
  { urlPattern: '*://fonts.gstatic.com/*', requestStage: 'Request' },
];

const DB_HOST = /(^|\.)firebaseio\.com$|(^|\.)firebasedatabase\.app$/i;
const CACHEABLE = /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/i;

export function createNetPolicy({ cdp, cacheDir, snapshot, stats }) {
  mkdirSync(cacheDir, { recursive: true });
  const header = (headers, name) => {
    const k = Object.keys(headers || {}).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? headers[k] : '';
  };
  const fulfill = (sessionId, requestId, status, type, body) => cdp.send('Fetch.fulfillRequest', {
    requestId, responseCode: status,
    responseHeaders: [
      { name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Cache-Control', value: 'no-store' }, { name: 'Timing-Allow-Origin', value: '*' },
    ],
    body: Buffer.from(body).toString('base64'),
  }, sessionId);

  async function fromCache(sessionId, requestId, url, ua, accept) {
    const isCss = /fonts\.googleapis\.com/i.test(url);
    const key = createHash('sha1').update(url + (isCss ? '|' + ua : '')).digest('hex');
    const meta = join(cacheDir, key + '.json'), bin = join(cacheDir, key + '.bin');
    if (!existsSync(meta) || !existsSync(bin)) {
      const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: accept || '*/*' } });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(bin, buf);
      writeFileSync(meta, JSON.stringify({ type: res.headers.get('content-type') || 'application/octet-stream', url }));
      stats.cacheFill++;
    } else {
      stats.cacheHit++;
    }
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    return fulfill(sessionId, requestId, 200, m.type, readFileSync(bin));
  }

  const valAt = (root, parts) => {
    let v = root;
    for (const k of parts) { if (v === null || v === undefined || typeof v !== 'object') return null; v = v[k]; }
    return v === undefined ? null : v;
  };

  return async function onPaused(sessionId, p) {
    const { requestId, request } = p;
    let u;
    try { u = new URL(request.url); } catch (e) { return cdp.send('Fetch.continueRequest', { requestId }, sessionId); }
    try {
      if (DB_HOST.test(u.hostname)) {
        if (request.method === 'GET' && /\.json$/.test(u.pathname)) {
          const parts = decodeURIComponent(u.pathname).replace(/\.json$/, '').split('/').filter(Boolean);
          return await fulfill(sessionId, requestId, 200, 'application/json', JSON.stringify(valAt(snapshot, parts)));
        }
        if (request.method !== 'GET' && request.method !== 'OPTIONS') stats.blockedWrites++; else stats.blockedNet++;
        return await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
      }
      if (CACHEABLE.test(u.hostname)) {
        const ua = header(request.headers, 'User-Agent') || 'Mozilla/5.0';
        return await fromCache(sessionId, requestId, request.url, ua, header(request.headers, 'Accept'));
      }
      return await cdp.send('Fetch.continueRequest', { requestId }, sessionId);
    } catch (e) {
      try { await cdp.send('Fetch.continueRequest', { requestId }, sessionId); } catch (e2) { /* the page may already be gone */ }
    }
  };
}
