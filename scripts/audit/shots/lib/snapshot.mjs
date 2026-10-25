// The canned database the pages read instead of Firebase.
// One READ-ONLY copy of the live data (plain REST GETs, nothing is ever written), cached on disk so every run
// - baseline and after, any agent - sees exactly the same players, photos, history and gallery.
// Refresh on purpose with --refresh-data.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const DB_KEYS = ['sportsday_2026_data', 'sportsday_2026_photos', 'masterPlayers', 'gallery', 'seasons_archive', 'sportsday_2026_backups'];
const FALLBACK_DB = 'https://badminton-2026-687e7-default-rtdb.asia-southeast1.firebasedatabase.app';

// the databaseURL the served app is configured with (so a worktree that points elsewhere is respected)
export function databaseUrlFrom(root) {
  try {
    const t = readFileSync(root + '/shared/firebase-config.js', 'utf8');
    const m = /databaseURL\s*:\s*["']([^"']+)["']/.exec(t);
    if (m) return m[1].replace(/\/+$/, '');
  } catch (e) { /* use the fallback */ }
  return FALLBACK_DB;
}

export async function loadSnapshot({ cacheFile, refresh, dbUrl }) {
  if (!refresh && existsSync(cacheFile)) {
    try { return { snap: JSON.parse(readFileSync(cacheFile, 'utf8')), cached: true }; } catch (e) { /* corrupt: fetch again */ }
  }
  const snap = {};
  for (const k of DB_KEYS) {
    try {
      const r = await fetch(`${dbUrl}/${k}.json`, { method: 'GET', headers: { Accept: 'application/json' } });
      snap[k] = r.ok ? await r.json() : null;
    } catch (e) {
      snap[k] = null;
    }
  }
  snap.__fetchedAt = new Date().toISOString();
  snap.__dbUrl = dbUrl;
  mkdirSync(dirname(cacheFile), { recursive: true });
  const tmp = cacheFile + '.' + process.pid + '.tmp';   // atomic: two agents starting together never read a half-written file
  writeFileSync(tmp, JSON.stringify(snap));
  renameSync(tmp, cacheFile);
  return { snap, cached: false };
}
