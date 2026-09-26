// ============================================================
// Sync merge — pure helpers for conflict-safe saves (no dependencies).
//
// Why: several devices write the same sportsday_2026_data blob at once —
// umpires score points on their courts while an admin creates / finalizes /
// edits matches. Writing "my whole copy" (set / whole-key update) silently
// reverts whatever changed on the server since that copy was taken: a point
// scored a moment ago, another court's finished match, a new command.
//
// A save is therefore a 3-way merge inside a transaction:
//   base   = the server state this client last saw
//   local  = this client's state now (base + the user's edits)
//   server = the server state at commit time (transaction retries if it moves)
// Rules, applied recursively:
//   - untouched locally        → keep the server's value
//   - untouched on the server  → take ours
//   - numbers changed on both  → apply our delta on top (scores, counters)
//   - lists of {id} objects    → merge per id: ours for what we changed, theirs
//                                otherwise; items added on either side are
//                                kept; an item deleted on either side stays
//                                deleted; rows with no id (corrupt) are dropped
//   - anything else on both    → ours wins (the user's explicit intent)
//
// Loaded as a plain browser script (globals) and require()-able from Node for
// the unit tests in scripts/test-sync-merge.mjs.
// ============================================================

function _smIsObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// Firebase drops null / empty values and may return a list as an object keyed
// "0","1"… — normalise so equality and merging see the same thing.
function _smNz(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object' && !Object.keys(v).some(k => _smNz(v[k]) !== null)) return null;
  return v;
}

function smToArr(v) {
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined);
  if (_smIsObj(v)) return Object.keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]).filter(x => x !== null && x !== undefined);
  return [];
}

function smDeepEq(a, b) {
  a = _smNz(a); b = _smNz(b);
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a).filter(k => _smNz(a[k]) !== null);
  const kb = Object.keys(b).filter(k => _smNz(b[k]) !== null);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!smDeepEq(a[k], b[k])) return false;
  return true;
}

// a list (array, or Firebase's object-with-numeric-keys form) of {id,…} rows
function _smIsIdList(v) {
  let arr = null;
  if (Array.isArray(v)) arr = v;
  else if (_smIsObj(v) && Object.keys(v).length && Object.keys(v).every(k => /^\d+$/.test(k))) arr = Object.values(v);
  if (!arr) return false;
  const rows = arr.filter(x => x !== null && x !== undefined);
  return rows.length > 0 && rows.every(x => _smIsObj(x) && x.id !== undefined && x.id !== null);
}

function _smById(arr) {
  const o = {};
  arr.forEach(x => { if (_smIsObj(x) && x.id !== undefined && x.id !== null && !(x.id in o)) o[x.id] = x; });
  return o;
}

function smMergeById(b, l, s) {
  const B = _smById(smToArr(b)), S = _smById(smToArr(s));
  const out = [], seen = new Set();
  smToArr(l).forEach(m => {
    if (!_smIsObj(m) || m.id === undefined || m.id === null) return;   // corrupt / ghost row
    if (seen.has(m.id)) return;
    const bm = B[m.id], sm = S[m.id];
    if (bm && !sm) return;                  // deleted on the server since we synced → stays deleted
    seen.add(m.id);
    out.push(bm ? smMerge3(bm, m, sm) : (sm ? smMerge3(undefined, m, sm) : m));
  });
  // rows someone else added since we synced (and that we never saw)
  smToArr(s).forEach(sm => {
    if (_smIsObj(sm) && sm.id !== undefined && sm.id !== null && !seen.has(sm.id) && !B[sm.id]) { seen.add(sm.id); out.push(sm); }
  });
  return out;
}

function smMerge3(b, l, s) {
  if (smDeepEq(l, b)) return s;             // we didn't change it → theirs
  if (smDeepEq(s, b)) return l;             // they didn't change it → ours
  if (smDeepEq(l, s)) return l;             // same change on both sides
  if (typeof l === 'number' && typeof s === 'number' && typeof b === 'number') return s + (l - b);
  if (_smIsIdList(b) || _smIsIdList(l) || _smIsIdList(s)) return smMergeById(b, l, s);
  if (_smIsObj(l) && _smIsObj(s)) {
    const bb = _smIsObj(b) ? b : {};
    const out = {};
    new Set([...Object.keys(bb), ...Object.keys(l), ...Object.keys(s)]).forEach(k => {
      const v = smMerge3(bb[k], l[k], s[k]);
      if (_smNz(v) !== null) out[k] = v;
    });
    return out;
  }
  return l;                                 // real conflict on a value → the user's intent wins
}

function smSanitize(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

// Merge a whole state object. onlyKeys limits which top-level keys our local
// edits may touch (saveKeys) — every other key keeps the server's value.
function smMergeState(base, local, server, onlyKeys) {
  const b = base || {}, l = local || {}, s = server || {};
  const out = { ...s };
  const keys = onlyKeys || [...new Set([...Object.keys(b), ...Object.keys(l)])];
  keys.forEach(k => {
    const v = smMerge3(b[k], l[k], s[k]);
    if (_smNz(v) === null) delete out[k]; else out[k] = v;
  });
  return smSanitize(out);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { smToArr, smDeepEq, smMergeById, smMerge3, smMergeState, smSanitize };
}
