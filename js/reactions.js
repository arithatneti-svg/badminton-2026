// ══════════════════════════════════════════
// LIVE REACTIONS — anyone watching can send a 🔥👏😮💪😂 to a match that is being played.
//
//   reactions/{matchId}/{emoji} = running total (a number, bumped with a server-side increment)
//
// Kept OUTSIDE the live blob (sportsday_2026_data) on purpose: a tap inside the blob would wake the score listener, the full clone
// and the repaint of every phone for every tap. Here a tap only moves one number, and the page repaints just the counters.
//
// Limits (the database itself is open, so these live in the page):
//   - taps are collected and sent once per RX_FLUSH_MS, one write per match, each emoji at most RX_BURST at a time
//   - a token bucket: RX_BUCKET taps at once, then one more every RX_REFILL_MS (about 2-3 a second); extra taps are ignored
//   - one phone can send at most RX_PER_MATCH taps to one match (remembered in localStorage, so a refresh does not reset it)
// Taps use pointerdown, not click: the court cards are rebuilt on every score, and a rebuild between touch-start and touch-end
// would swallow a click.
// ══════════════════════════════════════════

const RX_EMOJI = [['fire', '🔥', 'สู้ๆ'], ['clap', '👏', 'ปรบมือ'], ['wow', '😮', 'ว้าว'], ['muscle', '💪', 'ไฟต์'], ['haha', '😂', 'ฮา']];
const RX_FLUSH_MS = 1500, RX_BURST = 5, RX_BUCKET = 8, RX_REFILL_MS = 400, RX_PER_MATCH = 100, RX_MAX_FLOATS = 10;

// ?rxtest=1 writes to a throw-away node, so the bar can be tried on the real page without touching the real totals
const rxRef = firebase.database().ref(/[?&]rxtest=1(?:&|$)/.test(location.search) ? 'reactions_test' : 'reactions');
let _rx = {};                       // server totals: matchId → { fire: n, … }
let _rxPending = {};                // taps not sent yet: matchId → { fire: n, … }
let _rxSuppress = {};               // our own sends still to come back from the listener (so they are not drawn twice): 'm|e' → n
let _rxFlushTimer = null, _rxPaintTimer = null, _rxListening = false;
let _rxTokens = RX_BUCKET, _rxTokenAt = Date.now(), _rxWarnAt = 0;

function _rxSent(mId) { try { return Number(localStorage.getItem('bdm_rx_' + mId)) || 0; } catch (e) { return 0; } }
function _rxSetSent(mId, n) { try { localStorage.setItem('bdm_rx_' + mId, String(n)); } catch (e) { /* private window: the bucket still limits */ } }

function _rxCount(mId, e) { return (Number((_rx[mId] || {})[e]) || 0) + (Number((_rxPending[mId] || {})[e]) || 0); }

// the bar on a live court card (rebuilt with the card; the numbers come from the cache, so a rebuild never shows 0)
function reactionBarHtml(mId) {
  const id = escHtml(mId);
  return `<div class="rx-bar" data-rx-m="${id}" role="group" aria-label="ส่งกำลังใจให้แมตช์ ${id}">` +
    RX_EMOJI.map(([k, ch, label]) => {
      const n = _rxCount(mId, k);
      return `<button type="button" class="rx-btn" data-rx-e="${k}" aria-label="ส่ง ${label}"><span class="rx-ch" aria-hidden="true">${ch}</span><b class="rx-n">${n > 0 ? _rxFmt(n) : ''}</b></button>`;
    }).join('') + `<span class="rx-floats" aria-hidden="true"></span></div>`;
}
function _rxFmt(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }

function _rxPaint() {
  _rxPaintTimer = null;
  document.querySelectorAll('.rx-bar').forEach(bar => {
    const m = bar.dataset.rxM;
    bar.querySelectorAll('.rx-btn').forEach(btn => {
      const n = _rxCount(m, btn.dataset.rxE), el = btn.querySelector('.rx-n'), txt = n > 0 ? _rxFmt(n) : '';
      if (el && el.textContent !== txt) el.textContent = txt;
    });
  });
}
function _rxSchedulePaint() { if (!_rxPaintTimer) _rxPaintTimer = setTimeout(_rxPaint, 250); }   // at most 4 repaints a second, however many taps arrive

function _rxFloat(mId, e, count) {
  const bar = document.querySelector(`.rx-bar[data-rx-m="${CSS.escape(mId)}"] .rx-floats`);
  const ch = (RX_EMOJI.find(x => x[0] === e) || [])[1];
  if (!bar || !ch || document.hidden) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < count && bar.childElementCount < RX_MAX_FLOATS; i++) {
    const s = document.createElement('span');
    s.className = 'rx-float'; s.textContent = ch;
    s.style.left = (8 + Math.random() * 84) + '%';
    s.style.animationDelay = (i * 90) + 'ms';
    s.addEventListener('animationend', () => s.remove());
    bar.appendChild(s);
  }
}

// everyone's totals, live. One small listener for the whole node: a tap sends a few bytes, not the page.
function startReactions() {
  if (_rxListening) return;
  _rxListening = true;
  rxRef.on('value', snap => {
    const next = snap.val() || {};
    // somebody else's taps float up on their card (ours already floated when we tapped)
    Object.keys(next).forEach(m => {
      Object.keys(next[m] || {}).forEach(e => {
        const d = (Number(next[m][e]) || 0) - (Number((_rx[m] || {})[e]) || 0);
        if (d <= 0) return;
        const key = m + '|' + e, mine = Math.min(d, _rxSuppress[key] || 0);
        if (mine) _rxSuppress[key] -= mine;
        if (d - mine > 0) _rxFloat(m, e, Math.min(d - mine, 3));
      });
    });
    _rx = next;
    _rxSchedulePaint();
  }, () => { /* read refused / offline: the bars simply show no numbers */ });
}

function _rxRefill() {
  const now = Date.now(), add = Math.floor((now - _rxTokenAt) / RX_REFILL_MS);
  if (add > 0) { _rxTokens = Math.min(RX_BUCKET, _rxTokens + add); _rxTokenAt += add * RX_REFILL_MS; }
}
function _rxWarn(text) {
  const now = Date.now();
  if (now - _rxWarnAt < 8000) return;      // one gentle note, not one per ignored tap
  _rxWarnAt = now;
  if (typeof showToast === 'function') showToast(text, 'info');
}

function reactionTap(mId, e, btn) {
  if (!mId || !RX_EMOJI.some(x => x[0] === e)) return;
  _rxRefill();
  if (_rxTokens < 1) { btn && btn.classList.add('is-cool'); setTimeout(() => btn && btn.classList.remove('is-cool'), 400); return _rxWarn('กดถี่ไปหน่อย พักแป๊บนะ 🙂'); }
  const sent = _rxSent(mId), queued = Object.values(_rxPending[mId] || {}).reduce((a, b) => a + b, 0);
  if (sent + queued >= RX_PER_MATCH) return _rxWarn('ส่งกำลังใจให้คู่นี้ครบแล้ว ไปเชียร์คู่อื่นต่อนะ 🎉');
  _rxTokens -= 1;
  (_rxPending[mId] = _rxPending[mId] || {})[e] = ((_rxPending[mId] || {})[e] || 0) + 1;
  if (btn) { btn.classList.add('is-pop'); setTimeout(() => btn.classList.remove('is-pop'), 220); }
  _rxFloat(mId, e, 1);
  _rxSchedulePaint();
  if (!_rxFlushTimer) _rxFlushTimer = setTimeout(rxFlush, RX_FLUSH_MS);
}

// one write per match: every emoji tapped in the last 1.5 s as one atomic server-side increment
function rxFlush() {
  _rxFlushTimer = null;
  const inc = firebase.database.ServerValue.increment;
  Object.keys(_rxPending).forEach(m => {
    const p = _rxPending[m], upd = {}; let total = 0;
    Object.keys(p).forEach(e => { const k = Math.min(p[e], RX_BURST); if (k > 0) { upd[e] = inc(k); total += k; _rxSuppress[m + '|' + e] = (_rxSuppress[m + '|' + e] || 0) + k; } });
    delete _rxPending[m];
    if (!total) return;
    _rxSetSent(m, _rxSent(m) + total);
    rxRef.child(m).update(upd).catch(err => { console.warn('reaction not sent:', err && err.code || err); });
  });
}
window.addEventListener('pagehide', () => { if (_rxFlushTimer) rxFlush(); });

// tap handling for every bar on the page (one listener; the bars are rebuilt all the time)
document.addEventListener('pointerdown', ev => {
  if (ev.button !== undefined && ev.button !== 0) return;
  const btn = ev.target.closest && ev.target.closest('.rx-btn');
  if (!btn) return;
  const bar = btn.closest('.rx-bar');
  if (!bar) return;
  ev.preventDefault();
  reactionTap(bar.dataset.rxM, btn.dataset.rxE, btn);
});
// keyboard: Enter / Space on a focused emoji button (a mouse or touch tap is handled by pointerdown above and never reaches here)
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const btn = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rx-btn');
  if (!btn || !btn.closest('.rx-bar')) return;
  ev.preventDefault();
  reactionTap(btn.closest('.rx-bar').dataset.rxM, btn.dataset.rxE, btn);
});

// a new season starts with no cheers: match numbers begin again at M01, so the old totals must go (called by the season reset)
function clearReactions() { return rxRef.remove().catch(() => {}); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startReactions); else startReactions();
