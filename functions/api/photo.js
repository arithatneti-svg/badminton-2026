// ============================================================
// Cloudflare Pages Function — photo upload / delete on R2
// Route: /api/photo   (POST = upload, DELETE = remove)
//
// Bindings required on the Pages project (Settings → Functions):
//   • R2 bucket binding named  PHOTOS
//   • Environment variable      PHOTO_UPLOAD_KEY  (any random string)
//
// Auth model: a shared upload key. The browser bundle holds the same
// key, so this is obscurity-level protection — it blocks random internet
// scanners, matching the app's existing passcode-in-JS model. It is NOT
// a real identity check; upgrade to Firebase-Auth token verification when
// the app gains real accounts.
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

function authed(request, env) {
  const key = env.PHOTO_UPLOAD_KEY;
  if (!key) return false; // not configured → refuse rather than run open
  const hdr = request.headers.get('Authorization') || '';
  const got = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  return got === key;
}

// keys look like  gallery/2026/<uuid>.jpg  — never allow traversal / other prefixes
function safeKey(key) {
  return typeof key === 'string' && /^gallery\/[0-9A-Za-z_-]{1,20}\/[0-9a-f-]{8,40}\.jpg$/.test(key);
}

const ALLOWED = { 'image/jpeg': 'jpg' };
const MAX_BYTES = 6 * 1024 * 1024; // hard ceiling; the client compresses well below this

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!env.PHOTOS) return json({ error: 'r2-unbound' }, 501);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);

  const ctype = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!ALLOWED[ctype]) return json({ error: 'unsupported-type', ctype }, 415);

  const url = new URL(request.url);
  const year = (url.searchParams.get('year') || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 20);
  if (!year) return json({ error: 'missing-year' }, 400);

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ error: 'empty' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: 'too-large', bytes: buf.byteLength }, 413);

  const key = `gallery/${year}/${crypto.randomUUID()}.${ALLOWED[ctype]}`;
  await env.PHOTOS.put(key, buf, {
    httpMetadata: { contentType: ctype, cacheControl: 'public, max-age=31536000, immutable' },
  });
  return json({ key, url: `/img/${key}` }, 201);
}

export async function onRequestDelete({ request, env }) {
  if (!env.PHOTOS) return json({ error: 'r2-unbound' }, 501);
  if (!authed(request, env)) return json({ error: 'unauthorized' }, 401);

  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const key = body.key;
  if (!safeKey(key)) return json({ error: 'bad-key' }, 400);

  await env.PHOTOS.delete(key);
  return json({ ok: true, key });
}
