// ==========================================
// 0. UTILITIES
// ==========================================
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

