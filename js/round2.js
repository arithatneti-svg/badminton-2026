/* ============================================================
   Round-2 draw (organiser page). Sports Day, Saturday 14 Nov 2026.
   1. Asks for the admin or superadmin passcode (the same two codes as the main page) before it shows anything.
   2. Reads the players of the main app (sportsday_2026_data/players): colour (team) + subgroup (sub). People without both do not play round 2.
   3. "สุ่มรอบ 2" runs shared/round2-rules.js (the owner's poster rules); with ?send=1 a draw can be made ONCE (the result is kept in this browser so a reload cannot re-roll it; only "ยกเลิกที่ส่งไป" frees it); the plain preview can reshuffle. Nothing is saved yet.
   4. "ยืนยัน" puts the pairs in the main app's WAITING BOX (sportsday_2026_data/stagedMatches, in the poster's order, strongest match first) with
      fresh match numbers (the same atomic matchCounter the match creator uses) and records what it sent in draw_2026/round2.
      The admin then sends them on to the real queue from the main app, exactly like any other staged match.
   (Sending is OFF unless the address has ?send=1: without it this page is a look-only preview, safe to give to other teams to check the draw.
   After a draw the matches are announced ONE BY ONE ("ถัดไป"), then a summary page lists them all.)
   5. "ยกเลิกที่ส่งไป" takes the pairs that are STILL in the waiting box back out (pairs already sent on to the queue stay), so it can be drawn again.
   ============================================================ */
(function () {
  'use strict';

  var PASSCODES = ['admin2026', 'ph123'];          // the same two codes as js/auth.js (client-side by design, see the project notes)
  var SESSION_KEY = 'bdm_round2_ok';
  // ?test=1: the players are still READ from the real data, but everything the page WRITES (match numbers, the waiting box, the record)
  // goes to a throw-away node, so the whole flow can be tried without touching the match-day data
  var TEST = /[?&]test=1(?:&|$)/.test(location.search);
  // sending to the waiting box only works with ?send=1; the plain /round2 address is a preview: draw, reveal, check, never saved
  var SEND = /[?&]send=1(?:&|$)/.test(location.search);
  var ROOT = 'sportsday_2026_data';
  var WROOT = TEST ? 'round2_test' : ROOT;
  var RECORD = TEST ? 'round2_test/record' : 'draw_2026/round2';
  var RULES = window.Round2Rules;

  var $root, players = [], loaded = false, loadErr = '', result = null, record = null, busy = false, notice = null, drawCount = 0, step = null;   // step: which match is being announced (0-based); null or n = the summary

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n) { return window.dsIcon ? window.dsIcon(n) : ''; }
  function mascot(n, w) { return window.dsMascot ? window.dsMascot(n, w, true, '') : ''; }
  function db() { return firebase.database(); }
  function dbOk() { return !!(window.firebase && firebase.database); }
  function unlocked() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  function matchId(n) { return 'M' + (n < 10 ? '0' + n : n); }
  function byId(id) { return players.filter(function (p) { return p.id === id; })[0]; }
  function nameOf(p) { return p ? p.name : '?'; }

  // ── passcode gate ────────────────────────────────────────
  function gateHtml(err) {
    return '<div class="r2-gate"><section class="dw-card"><div class="dw-who">' + mascot('search', 110) + '</div><h1>หน้านี้สำหรับผู้จัด</h1>' +
      '<p>ใส่รหัส Admin หรือ Super Admin เพื่อเข้าสุ่มคู่รอบ 2</p>' +
      '<form id="r2Gate"><input class="r2-pass" id="r2Pass" type="password" inputmode="text" autocomplete="off" placeholder="รหัสผ่าน" aria-label="รหัสผ่าน">' +
      '<div class="r2-err" id="r2Err" role="alert">' + esc(err || '') + '</div>' +
      '<button type="submit" class="ds-btn ds-btn-primary ds-btn-lg">เข้าสู่ระบบ</button></form></section></div>';
  }
  function showGate(err) {
    $root.innerHTML = gateHtml(err);
    var f = document.getElementById('r2Gate'), inp = document.getElementById('r2Pass');
    f.onsubmit = function (e) {
      e.preventDefault();
      if (PASSCODES.indexOf(inp.value) >= 0) { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (x) {} enter(); }
      else { inp.value = ''; document.getElementById('r2Err').textContent = 'รหัสไม่ถูกต้อง'; inp.focus(); }
    };
    setTimeout(function () { inp.focus(); }, 60);
  }

  // ── data ─────────────────────────────────────────────────
  // the one real draw is remembered in this browser (ids only), so a reload cannot re-roll it
  var DRAW_KEY = 'bdm_round2_draw' + (TEST ? '_test' : '');
  function saveDraw(res) {
    if (!SEND || !res || !res.ok) return;
    try { localStorage.setItem(DRAW_KEY, JSON.stringify({ same: res.same, matches: res.matches.map(function (m) { return { r: [m.red[0].id, m.red[1].id], b: [m.blue[0].id, m.blue[1].id], sum: m.sum }; }) })); } catch (e) { /* no storage: the lock then only lasts until reload */ }
  }
  function forgetDraw() { try { localStorage.removeItem(DRAW_KEY); } catch (e) { /* ignore */ } }
  function restoreDraw() {
    if (!SEND || result) return;
    try {
      var raw = localStorage.getItem(DRAW_KEY); if (!raw) return;
      var d = JSON.parse(raw), map = {}; players.forEach(function (p) { map[p.id] = p; });
      var ms = d.matches.map(function (m) { return { red: m.r.map(function (i) { return map[i]; }), blue: m.b.map(function (i) { return map[i]; }), sum: m.sum }; });
      var ok = ms.length && ms.every(function (m) { return m.red.concat(m.blue).every(function (p) { return !!p; }); }) && !RULES.check(ms, null).length;
      if (!ok) { forgetDraw(); return; }       // players changed since that draw: it is void, draw again
      result = { ok: true, matches: ms, same: d.same || 0, skipped: [], red: ms.length * 2, blue: ms.length * 2 };
      drawCount = 1; step = null;
    } catch (e) { forgetDraw(); }
  }

  function loadPlayers() {
    loaded = false; loadErr = '';
    if (!dbOk()) { loadErr = 'ต่อฐานข้อมูลไม่ได้ ลองเปิดหน้านี้ใหม่'; paint(); return Promise.resolve(); }
    return db().ref(ROOT + '/players').once('value').then(function (s) {
      players = smToArr(s.val()).filter(function (p) { return p && p.id; });
      loaded = true; restoreDraw(); paint();
    }, function () { loadErr = 'อ่านรายชื่อผู้เล่นไม่ได้ ลองกด “โหลดรายชื่อใหม่”'; paint(); });
  }
  function listenRecord() {
    if (!SEND || !dbOk()) return;          // the preview never looks at (or shows) what was really sent
    db().ref(RECORD).on('value', function (s) { record = s.val() || null; if (!busy) paint(); }, function () {});
  }

  // ── draw ─────────────────────────────────────────────────
  function doDraw() {
    if (record) return;
    if (SEND && result && result.ok) return;   // the real draw is made once
    var res = RULES.draw(players);
    drawCount++;
    saveDraw(res);
    notice = null;
    result = res;
    step = res.ok ? 0 : null;                // a good draw starts the announcement at match 1
    paint();
    window.scrollTo(0, 0);
  }

  function matchCount() { return result && result.ok ? result.matches.length : 0; }
  function go(to) {
    var n = matchCount(); if (!n) return;
    step = Math.max(0, Math.min(n, to));
    paint();
    window.scrollTo(0, 0);
  }

  // one transaction on the match counter reserves k numbers at once: M(n) ... M(n+k-1) are ours alone, like the match creator does for one
  function reserveNumbers(k) {
    return db().ref(WROOT + '/matchCounter').transaction(function (c) { return (Number(c) || 1) + k; }).then(function (r) {
      if (!r.committed) throw new Error('counter');
      return Number(r.snapshot.val()) - k;
    });
  }

  async function confirmSend() {
    if (!SEND || busy || !result || !result.ok || record) return;
    var n = result.matches.length;
    if (!window.confirm('ยืนยันส่ง ' + n + ' แมตช์เข้ากล่องรอ?\nแมตช์จะยังไม่ขึ้นบอร์ด จนกว่าแอดมินจะกด “ต่อคิว” ในหน้าหลัก')) return;
    busy = true; notice = null; paint();
    try {
      // the players may have changed since the draw (a colour or subgroup edited): look again and draw again if so
      var fresh = smToArr((await db().ref(ROOT + '/players').once('value')).val()).filter(function (p) { return p && p.id; });
      var map = {}; fresh.forEach(function (p) { map[p.id] = p; });
      var stale = result.matches.some(function (m) {
        return m.red.concat(m.blue).some(function (p) { var q = map[p.id]; return !q || q.team !== p.team || q.sub !== p.sub || q.name !== p.name; });
      });
      if (stale) { players = fresh; result = null; forgetDraw(); notice = { t: 'warn', m: 'ข้อมูลผู้เล่นเปลี่ยนไประหว่างนี้ (สี / ซับกรุ๊ป / ชื่อ) ยังไม่ได้ส่งอะไรเข้ากล่องรอ กรุณากดสุ่มใหม่' }; busy = false; paint(); return; }
      var bad = RULES.check(result.matches, null);
      if (bad.length) { notice = { t: 'warn', m: 'ผลสุ่มขัดกติกา ยังไม่ได้ส่ง: ' + bad.join('; ') }; busy = false; paint(); return; }
      var existing = (await db().ref(RECORD).once('value')).val();
      if (existing) { notice = { t: 'warn', m: 'มีการส่งรอบ 2 เข้ากล่องรอไปแล้ว กด “ยกเลิกที่ส่งไป” ก่อนถ้าจะสุ่มใหม่' }; busy = false; paint(); return; }

      var first = await reserveNumbers(n);
      var items = result.matches.map(function (m, i) {
        var g = function (p) { var q = map[p.id]; return q.name + ' (G' + q.group + ')'; };
        return { id: matchId(first + i), r1: m.red[0].id, r2: m.red[1].id, b1: m.blue[0].id, b2: m.blue[1].id,
          redNames: g(m.red[0]) + ' & ' + g(m.red[1]), blueNames: g(m.blue[0]) + ' & ' + g(m.blue[1]) };
      });
      var tx = await db().ref(WROOT + '/stagedMatches').transaction(function (cur) { return smToArr(cur).concat(items); });
      if (!tx.committed) throw new Error('staged');
      var rec = { at: firebase.database.ServerValue.TIMESTAMP, matches: items.map(function (it, i) { return { id: it.id, r: [it.r1, it.r2], b: [it.b1, it.b2], sum: result.matches[i].sum }; }) };
      await db().ref(RECORD).set(rec);
      notice = { t: 'ok', m: 'ส่ง ' + n + ' แมตช์ (' + items[0].id + ' – ' + items[n - 1].id + ') เข้ากล่องรอแล้ว' };
      result = null; forgetDraw();
    } catch (e) {
      console.error('round 2 send failed:', e);
      notice = { t: 'warn', m: 'ส่งเข้ากล่องรอไม่สำเร็จ ตรวจสัญญาณแล้วลองอีกครั้ง (ถ้าเห็นแมตช์ซ้ำในกล่องรอ ให้ลบในหน้าหลัก)' };
    }
    busy = false; paint();
  }

  async function cancelSent() {
    if (busy || !record) return;
    if (!window.confirm('เอาแมตช์รอบ 2 ที่ยังอยู่ในกล่องรอออก แล้วสุ่มใหม่?\n(แมตช์ที่แอดมินต่อคิวไปแล้ว จะไม่ถูกลบ)')) return;
    busy = true; notice = null; paint();
    try {
      var ids = {}; smToArr(record.matches).forEach(function (m) { ids[m.id] = 1; });
      var removed = 0, kept = 0;
      var tx = await db().ref(WROOT + '/stagedMatches').transaction(function (cur) {
        removed = 0;
        var list = smToArr(cur), out = list.filter(function (s) { if (s && ids[s.id]) { removed++; return false; } return true; });
        return out.length ? out : null;
      });
      if (!tx.committed) throw new Error('staged');
      kept = Object.keys(ids).length - removed;
      await db().ref(RECORD).remove();
      result = null; forgetDraw();
      notice = { t: 'ok', m: 'เอาออกจากกล่องรอ ' + removed + ' แมตช์' + (kept ? ' · อีก ' + kept + ' แมตช์ถูกต่อคิวไปแล้ว (ยังอยู่)' : '') + ' · สุ่มใหม่ได้เลย' };
    } catch (e) {
      console.error('round 2 cancel failed:', e);
      notice = { t: 'warn', m: 'ยกเลิกไม่สำเร็จ ลองอีกครั้ง' };
    }
    busy = false; paint();
  }

  // ── render ───────────────────────────────────────────────
  function who(p) { return '<div class="r2-who"><b>' + esc(nameOf(p)) + '</b><span class="r2-lv">' + esc(p ? p.sub : '') + '</span></div>'; }
  function rowHtml(m, i, id) {
    var sameR = m.red[0].sub === m.red[1].sub, sameB = m.blue[0].sub === m.blue[1].sub;
    return '<li class="r2-row"><div class="r2-no">' + (i + 1) + (id ? '<span class="r2-id">' + esc(id) + '</span>' : '') + '</div>' +
      '<div class="r2-plate is-red' + (sameR ? ' r2-same' : '') + '">' + who(m.red[0]) + who(m.red[1]) + '</div>' +
      '<div class="r2-sum" title="ผลบวกเลเวล">' + m.sum + '</div>' +
      '<div class="r2-plate is-blue' + (sameB ? ' r2-same' : '') + '">' + who(m.blue[0]) + who(m.blue[1]) + '</div></li>';
  }
  function recordMatches() {
    return smToArr(record.matches).map(function (m) {
      var r = smToArr(m.r).map(byId), b = smToArr(m.b).map(byId);
      return { id: m.id, red: r, blue: b, sum: m.sum };
    }).filter(function (m) { return m.red.length === 2 && m.blue.length === 2 && m.red.concat(m.blue).every(Boolean); });
  }
  function counts() {
    var use = players.filter(RULES.eligible), skipped = players.filter(function (p) { return !RULES.eligible(p); });
    return { red: use.filter(function (p) { return p.team === 'Red'; }).length, blue: use.filter(function (p) { return p.team === 'Blue'; }).length, skipped: skipped };
  }
  function reasonText(r) {
    if (r.reason === 'unequal') return 'ทีมมีคนไม่เท่ากัน (แดง ' + r.red + ' · น้ำเงิน ' + r.blue + ') จับคู่ 2 ต่อ 2 ไม่ได้ ให้เติม / ลดคนในหน้าหลักให้เท่ากันก่อน';
    if (r.reason === 'odd') return 'แต่ละทีมมี ' + r.red + ' คน เป็นเลขคี่ จับคู่ครบทุกคนไม่ได้ ให้เติม / ลดคนในหน้าหลักให้เป็นเลขคู่ก่อน';
    if (r.reason === 'empty') return 'ยังไม่มีผู้เล่นที่มีสีและซับกรุ๊ป';
    return 'หาผลสุ่มที่ผ่านกติกาทุกข้อไม่เจอ ลองกดสุ่มอีกครั้ง ถ้ายังไม่ได้ ให้ตรวจซับกรุ๊ปของผู้เล่นในหน้าหลัก';
  }
  function rulesHtml() {
    return '<details class="dw-card r2-rules"><summary>กติกาจับคู่รอบ 2 (5 ข้อ)</summary><ol>' +
      '<li><b>คู่เดียวกันห่างไม่เกิน 3 เลเวล</b> — 1.1=7 · 1.2=6 · 2.1=5 · 2.2=4 · 2.3=3 · 3.1=2 · 3.2=1 (7+4 ได้ 7+3 ไม่ได้)</li>' +
      '<li><b>ทุกคนเจอฝั่งตรงข้ามห่างไม่เกิน 3 เลเวล</b> เช็กทุกคนกับทุกคนในแมตช์เดียวกัน</li>' +
      '<li><b>ผลบวกเลเวลสองฝั่งเท่ากัน</b> (แดง 7+4 = น้ำเงิน 6+5)</li>' +
      '<li><b>ห้าม 1.1+1.1 สู้ 1.1+1.1</b> — 1.1 จึงจับคู่กับ 1.2 / 2.1 / 2.2 เท่านั้น</li>' +
      '<li><b>พยายามไม่ให้ซับกรุ๊ปเดียวกันเป็นคู่กัน</b> (กรอบเหลืองประ = เลี่ยงไม่ได้)</li></ol></details>';
  }

  // ── the announcement: one match at a time, the players appear one by one so there is a little suspense ──
  function stageHtml() {
    var ms = result.matches, n = ms.length, m = ms[step], last = step === n - 1;
    var dots = ms.map(function (x, i) { return '<i class="' + (i < step ? 'is-done' : i === step ? 'is-now' : '') + '"></i>'; }).join('');
    var sameR = m.red[0].sub === m.red[1].sub, sameB = m.blue[0].sub === m.blue[1].sub;
    return modeBar() + '<main class="r2-main"><section class="dw-card r2-stage" data-step="' + step + '">' +
      '<div class="r2-stage-top"><span>คู่ที่</span><b>' + (step + 1) + '</b><em>จาก ' + n + (drawCount > 1 ? ' · สุ่มครั้งที่ ' + drawCount : '') + '</em></div>' +
      '<div class="r2-dots" aria-hidden="true">' + dots + '</div>' +
      '<div class="r2-stage-match" aria-live="polite">' +
        '<div class="r2-plate is-red' + (sameR ? ' r2-same' : '') + '">' + who(m.red[0]) + who(m.red[1]) + '</div>' +
        '<div class="r2-sum" title="ผลบวกเลเวล">' + m.sum + '</div>' +
        '<div class="r2-plate is-blue' + (sameB ? ' r2-same' : '') + '">' + who(m.blue[0]) + who(m.blue[1]) + '</div>' +
      '</div></section>' +
      '<div class="r2-bar"><span>กดถัดไปเพื่อประกาศคู่ต่อไป</span><div class="r2-actions">' +
        '<button type="button" class="ds-btn" data-act="prev"' + (step === 0 ? ' disabled' : '') + ' aria-label="คู่ก่อนหน้า">‹ ก่อนหน้า</button>' +
        '<button type="button" class="ds-btn" data-act="skip">ข้ามไปสรุป</button>' +
        '<button type="button" class="ds-btn ds-btn-primary ds-btn-lg" data-act="next">' + (last ? 'ดูสรุปทั้งหมด' : 'ถัดไป ›') + '</button></div></div></main>';
  }
  function modeBar() {
    if (!SEND) return '<div class="dw-mockbar"><b>PREVIEW</b><span>โหมดดูผลสุ่ม · ผลไม่ถูกบันทึก และไม่ถูกส่งเข้าระบบหลัก ไม่ว่าจะกดกี่ครั้ง</span></div>';
    if (TEST) return '<div class="dw-mockbar"><b>TEST</b><span>โหมดทดสอบ · อ่านรายชื่อจริง แต่ส่งเข้ากล่องรอจริงไม่ได้ (เขียนลงที่ทดสอบ)</span></div>';
    return '';
  }

  function paint() {
    if (!$root || !unlocked()) return;
    if (!record && result && result.ok && step != null && step < result.matches.length) { $root.innerHTML = stageHtml(); return; }
    var c = counts(), head, body = '', bar = '';
    var shown = record ? recordMatches() : (result && result.ok ? result.matches : null);

    head = '<div class="r2-head"><div class="dw-brand">' + mascot('serve', 44) + '<div><div class="dw-brand-t">สุ่มคู่รอบ 2</div><div class="dw-brand-s">SPORTS DAY · 14 NOV 2026 · ROUND 2</div></div></div>' +
      '<div class="r2-actions"><button type="button" class="ds-btn" data-act="reload"' + (busy ? ' disabled' : '') + '>โหลดรายชื่อใหม่</button></div></div>';

    var info = '';
    if (!loaded) info = '<p>' + (loadErr ? '<span class="r2-warn">' + esc(loadErr) + '</span>' : 'กำลังโหลดรายชื่อผู้เล่น…') + '</p>';
    else {
      info = '<div class="r2-count"><div class="is-red"><b>' + c.red + '</b><span>ทีมแดง</span></div><div class="is-blue"><b>' + c.blue + '</b><span>ทีมน้ำเงิน</span></div>' +
        '<div class="is-lv"><b>' + Math.min(c.red, c.blue) / 2 + '</b><span>แมตช์ที่จะได้</span></div></div>' +
        (c.skipped.length ? '<details class="r2-skip"><summary>ไม่ได้แข่งรอบนี้ (ยังไม่มีสี / ซับกรุ๊ป) ' + c.skipped.length + ' คน</summary><p>' + c.skipped.map(function (p) { return esc(p.name); }).join(' · ') + '</p></details>' : '');
    }

    var main = '';
    if (notice) main += '<div class="' + (notice.t === 'ok' ? 'r2-ok' : 'r2-warn') + '" role="status">' + esc(notice.m) + '</div>';
    if (loaded && result && !result.ok) main += '<div class="r2-warn" role="alert">' + esc(reasonText(result)) + '</div>';
    if (record) {
      var at = record.at ? new Date(record.at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '';
      main += '<div class="r2-ok">ส่ง ' + smToArr(record.matches).length + ' แมตช์เข้ากล่องรอแล้ว' + (at ? ' · ' + esc(at) : '') + '<small>ไปที่หน้าหลัก แท็บสร้างแมตช์ → กล่องรอ แล้วกด “ต่อคิว” หรือลากเข้าคิว</small></div>' +
        '<div class="r2-actions"><a class="ds-btn ds-btn-primary" href="./">ไปหน้าหลัก</a><button type="button" class="ds-btn" data-act="cancel"' + (busy ? ' disabled' : '') + '>ยกเลิกที่ส่งไป (เฉพาะที่ยังอยู่ในกล่องรอ)</button></div>';
    }
    if (shown && shown.length) {
      var gaps = record ? 0 : result.same;
      main += '<section class="dw-card" id="r2List"><h2>' + (record ? 'คู่ที่ส่งไปแล้ว' : 'สรุปผลสุ่ม' + (drawCount > 1 ? ' (ครั้งที่ ' + drawCount + ')' : '')) + ' · ' + shown.length + ' แมตช์</h2>' +
        (record ? '' : '<p class="dw-note">ผ่านกติกาครบทุกข้อ ✓' + (gaps ? ' · มีคู่ซับกรุ๊ปเดียวกัน ' + gaps + ' คู่ (เลี่ยงไม่ได้)' : ' · ไม่มีคู่ซับกรุ๊ปเดียวกัน') + (SEND ? ' · ยังไม่ได้บันทึกอะไร จนกว่าจะกดยืนยัน' : ' · ดูผลเท่านั้น ไม่ได้บันทึก') + '</p>' +
          '<div class="r2-actions r2-replay"><button type="button" class="ds-btn" data-act="replay">▶ ประกาศทีละคู่อีกครั้ง</button></div>') +
        '<ul class="r2-list">' + shown.map(function (m, i) { return rowHtml(m, i, record ? m.id : ''); }).join('') + '</ul></section>';
    } else if (loaded && !result && !record) {
      main += '<section class="dw-card"><div class="dw-who">' + mascot('smash', 120) + '</div><h2>พร้อมสุ่มรอบ 2</h2><p>กด “สุ่มรอบ 2” แล้วระบบจะประกาศทีละคู่ กด “ถัดไป” ไปเรื่อยๆ จนถึงหน้าสรุป ' + (SEND ? 'สุ่มได้ครั้งเดียว แล้วกดยืนยันส่งเข้ากล่องรอ ' : 'ถ้ายังไม่ถูกใจกด “สุ่มใหม่” ได้เรื่อยๆ ') + (SEND ? 'ผลจะยังไม่เข้าระบบจนกว่าจะกดยืนยัน' : 'ผลไม่ถูกบันทึกและไม่เข้าระบบหลัก') + '</p></section>';
    }

    var canDraw = loaded && !record && !busy;
    if (!record && loaded) {
      var hasRes = result && result.ok;
      bar = '<div class="r2-bar"><span>' + (hasRes ? (SEND ? 'ยังไม่ได้บันทึก · ยืนยันเพื่อส่งเข้ากล่องรอทันที' : 'ดูผลเท่านั้น · ไม่ได้ส่งเข้าระบบหลัก') : 'ยังไม่ได้สุ่ม') + '</span><div class="r2-actions">' +
        (hasRes && SEND ? '' : '<button type="button" class="ds-btn' + (hasRes ? '' : ' ds-btn-primary ds-btn-lg') + '" data-act="draw"' + (canDraw ? '' : ' disabled') + '>' + (hasRes ? 'สุ่มใหม่ (Reshuffle)' : 'สุ่มรอบ 2') + '</button>') +
        (hasRes && SEND ? '<button type="button" class="ds-btn ds-btn-primary ds-btn-lg" data-act="confirm"' + (busy ? ' disabled' : '') + '>' + (busy ? 'กำลังส่ง…' : 'ยืนยัน ส่งเข้ากล่องรอ') + '</button>' : '') + '</div></div>';
    }

    $root.innerHTML = modeBar() +
      '<main class="r2-main"><section class="dw-card">' + head + info + '</section>' + rulesHtml() + main + bar + '</main>';
  }

  function onClick(e) {
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    var a = el.getAttribute('data-act');
    if (a === 'draw') doDraw();
    else if (a === 'next') go(step + 1);
    else if (a === 'prev') go(step - 1);
    else if (a === 'skip') go(matchCount());
    else if (a === 'replay') go(0);
    else if (a === 'confirm') confirmSend();
    else if (a === 'cancel') cancelSent();
    else if (a === 'reload') { result = null; step = null; notice = null; loadPlayers(); }
  }

  function enter() { $root.onclick = onClick; $root.innerHTML = ''; paint(); loadPlayers(); listenRecord(); }

  function start() {
    $root = document.getElementById('r2');
    if (unlocked()) enter(); else showGate('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
