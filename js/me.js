// ══════════════════════════════════════════════════════════════
// "ME" — the spectator/player shortcut
//
// Someone at the event is really asking three things: am I on court
// next, how did my matches go, and where am I on the board. Without a
// sense of "me" they have to remember their own jersey and scroll 39
// matches to find it. Picking a name once (kept in localStorage, never
// written to the shared DB) lets every list highlight them and adds a
// one-tap "my matches only" filter.
// ══════════════════════════════════════════════════════════════

const ME_KEY = 'bdm_me_player';
let _meId = null;

function loadMe() {
  try { _meId = localStorage.getItem(ME_KEY) || null; } catch { _meId = null; }
  // a stale id from a previous season would highlight nobody
  if (_meId && !(appState.players || []).some(p => p.id === _meId)) _meId = null;
  return _meId;
}
function getMe() { return _meId; }
function isMe(playerId) { return !!_meId && playerId === _meId; }
function meName() {
  return (appState.players || []).find(p => p.id === _meId)?.name || null;
}
// does this match involve me?
function matchHasMe(m) {
  return !!_meId && [m.r1, m.r2, m.b1, m.b2].includes(_meId);
}

function setMe(playerId) {
  _meId = playerId || null;
  try { playerId ? localStorage.setItem(ME_KEY, playerId) : localStorage.removeItem(ME_KEY); } catch {}
  closeMePicker();
  renderMeBar();
  // repaint whatever is on screen
  if (typeof renderPublicOngoingMatches === 'function') renderPublicOngoingMatches();
  if (typeof renderFinishedMatches === 'function') renderFinishedMatches();
  if (typeof renderPlayersTab === 'function') renderPlayersTab();
  if (playerId) showToast(`⭐ ตั้งเป็น "${meName()}" แล้ว`, 'success');
}

// ── Picker ────────────────────────────────────────────────────
let _mePickerOpener = null;      // what had focus before the sheet opened: focus goes back to it
function openMePicker() {
  const ov = document.getElementById('mePickerOverlay');
  if (!ov) return;
  if (!ov.classList.contains('open')) _mePickerOpener = document.activeElement;
  ov.classList.add('open');
  const input = document.getElementById('meSearch');
  if (input) { input.value = ''; setTimeout(() => input.focus(), 80); }
  renderMePickerList();
}
function closeMePicker() {
  const ov = document.getElementById('mePickerOverlay');
  const wasOpen = !!ov && ov.classList.contains('open');
  ov?.classList.remove('open');
  if (wasOpen && _mePickerOpener && _mePickerOpener.isConnected && _mePickerOpener.focus) _mePickerOpener.focus();
  _mePickerOpener = null;
}
const _teamTag = team => `<i class="tsh ${team === 'Red' ? 'tsh-red' : 'tsh-blue'}" aria-hidden="true"></i>`;   // circle = red, diamond = blue
function renderMePickerList() {
  const el = document.getElementById('mePickerList');
  if (!el) return;
  const q = (document.getElementById('meSearch')?.value || '').toLowerCase().trim();
  const list = (appState.players || [])
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) {
    el.innerHTML = `<div class="me-empty">ไม่พบชื่อนี้</div>`;
    return;
  }
  el.innerHTML = list.map(p => `
    <button type="button" class="me-opt${isMe(p.id) ? ' on' : ''}" onclick="setMe('${p.id}')" aria-pressed="${isMe(p.id)}">
      ${avatarHtml(p, 40)}
      <span class="me-opt-name">${escHtml(p.name)}</span>
      <span class="me-opt-meta ${p.team === 'Red' ? 'is-red' : 'is-blue'}">${_teamTag(p.team)}G${escHtml(p.group)}</span>
      ${isMe(p.id) ? `<span class="me-opt-check">${dsIcon('check')}</span>` : ''}
    </button>`).join('');
}

// ── The bar that sits under the nav ───────────────────────────
function renderMeBar() {
  const el = document.getElementById('meBar');
  if (!el) return;
  const p = (appState.players || []).find(x => x.id === _meId);
  // this runs on every data update: rewrite the bar only when what it says has changed (the face does not flash)
  const put = html => { if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; } };
  if (!p) {
    put(`<button type="button" class="me-cta" onclick="openMePicker()">${dsIcon('star', { fill: true })}<b>เลือกชื่อคุณ</b></button>`);
    el.classList.remove('has-me');
    return;
  }
  el.classList.add('has-me');
  const s = getPlayerStats()[p.id] || {};
  const live = (appState.ongoingMatches || []).some(matchHasMe);
  const next = (appState.ongoingMatches || []).filter(matchHasMe).length;
  put(`
    <div class="me-chip" onclick="openPlayerProfile('${p.id}')" tabindex="0" role="button" aria-label="ดูโปรไฟล์ของคุณ" title="ดูโปรไฟล์ของคุณ">
      ${avatarHtml(p, 36)}
      <div class="me-chip-txt">
        <b>${escHtml(p.name)}</b>
        <span><span class="${p.team === 'Red' ? 'is-red' : 'is-blue'}">${_teamTag(p.team)} G${escHtml(p.group)}</span> · ${s.pts || 0} คะแนน · ชนะ ${s.matchWin || 0} แพ้ ${s.matchLose || 0}</span>
      </div>
    </div>
    ${live ? `<span class="me-live"><i class="ds-dot ds-dot-live"></i>กำลังแข่ง${next > 1 ? ' ×' + next : ''}</span>` : ''}
    <button type="button" class="me-switch" onclick="openMePicker()" title="เปลี่ยนคน">เปลี่ยน</button>`);
}

// ── "only my matches" toggle, used by Ongoing and Finished ────
let _meFilterOn = false;
function toggleMeFilter(btn) {
  if (!_meId) return openMePicker();
  _meFilterOn = !_meFilterOn;
  document.querySelectorAll('.me-filter-btn').forEach(b => { b.classList.toggle('on', _meFilterOn); b.setAttribute('aria-pressed', String(_meFilterOn)); });
  if (typeof renderFinishedMatches === 'function') renderFinishedMatches();
  if (typeof renderPublicOngoingMatches === 'function') renderPublicOngoingMatches();
}
function meFilterActive() { return _meFilterOn && !!_meId; }
