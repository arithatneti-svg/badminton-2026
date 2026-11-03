// ==========================================
// 0. UTILITIES
// ==========================================
// A player with no team yet (pre-draw) is neither Red nor Blue: every team-coloured
// spot goes through these so "no team" never falls back to blue.
function teamCls(team, pre) { return pre + (team === 'Red' ? 'red' : team === 'Blue' ? 'blue' : 'none'); }
function teamLabel(team) { return team === 'Red' ? 'RED' : team === 'Blue' ? 'BLUE' : 'ยังไม่มีทีม'; }

// UX-5: debounce helper for search inputs
function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// FIX-9: XSS prevention — escape user-supplied strings before injecting into innerHTML
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

