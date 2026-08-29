// ============================================================
// Cloudflare Pages Function — serve a photo from R2
// Route: /img/*   (GET only)
//
// Same-origin image delivery: the browser (and the service worker) sees
// these as ordinary same-origin GETs, so no public R2 bucket, no custom
// domain and no CORS config are needed. Objects are immutable (unique
// key per upload), so they cache hard at the edge and in the SW.
//
// Requires the R2 bucket binding named PHOTOS on the Pages project.
// ============================================================

export async function onRequestGet({ params, env }) {
  if (!env.PHOTOS) return new Response('r2-unbound', { status: 501 });

  // [[path]] gives an array of the path segments after /img/
  const parts = Array.isArray(params.path) ? params.path : [params.path];
  const key = parts.join('/');
  if (!key || key.includes('..')) return new Response('bad-key', { status: 400 });

  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('not-found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
}
