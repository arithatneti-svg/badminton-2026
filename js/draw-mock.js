/* ============================================================
   Team draw - MOCK-UP (Sports Day 2027).
   A clickable prototype of the pre-event page: a player picks who they are, gets a greeting from น้องดาว (the star mascot), answers a few
   questions, presses "สุ่มทีม" and sees their colour; a big-screen board shows who is on which team; an admin view shows progress.
   Everything here is FAKE data kept in this browser (localStorage) - nothing is read from or written to Firebase. The real balancing
   logic (women / skill spread across the two teams) is only sketched in pickTeam(); the real page will replace this file's data layer.
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'bdm_draw_mock_v1';
  var TOTAL = 40;
  var NAMES = ['แพร', 'ภูมิ', 'นนท์', 'ใบเตย', 'ต้น', 'มายด์', 'ปอนด์', 'ฟลุค', 'น้ำหวาน', 'เก่ง', 'ไอซ์', 'บอส', 'ออม', 'กอล์ฟ', 'เบลล์',
    'ตั้ม', 'พลอย', 'เจ', 'มิกซ์', 'เกม', 'ฝ้าย', 'ท็อป', 'นิว', 'อาร์ม', 'พิม', 'แบงค์', 'ขวัญ', 'ธีร์', 'ปัน', 'แอมป์', 'มะปราง', 'เอิร์ธ',
    'ฟิล์ม', 'โบ๊ท', 'จูน', 'เติ้ล', 'กุ๊ก', 'ไบร์ท', 'มุก', 'เฟรม'];
  var STYLES = [['attacker', 'Attacker'], ['defender', 'Defender'], ['allround', 'All-Round'], ['controller', 'Controller'],
    ['speed', 'Speed Runner'], ['deceptive', 'Deceptive'], ['power', 'Power Hitter'], ['netmaster', 'Net Master']];
  var SHOTS = ['ตบ', 'หยอด', 'ดาด', 'เคลียร์', 'เสิร์ฟ'];
  // "I don't know" / "I'm not telling": a third kind of answer next to the real choices (the chip finishes the question on its own)
  var NOANS = [['ไม่รู้', 'ไม่รู้', true], ['ไม่บอก', 'ไม่บอก', true]];
  var VIEWS = [['player', 'ผู้เล่น'], ['board', 'จอใหญ่'], ['admin', 'แอดมิน']];

  var $root, S, view, runToken = 0, busy = false;

  // ── helpers ──────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pid(n) { return 'P' + (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function teamName(t) { return t === 'Red' ? 'RED TEAM' : 'BLUE TEAM'; }
  function byPid(id) { return S.players.filter(function (p) { return p.pid === id; })[0]; }
  function me() { return S.meId ? byPid(S.meId) : null; }
  function drawn() { return S.players.filter(function (p) { return p.team; }); }
  function initials(n) { return String(n).replace(/\s+/g, '').slice(0, 2); }
  function ico(n) { return window.dsIcon ? window.dsIcon(n) : ''; }
  function mascot(n, w, cls) { return window.dsMascot ? window.dsMascot(n, w, true, cls) : ''; }

  // ── fake data ────────────────────────────────────────────
  function freshState() {
    var r = rng(2027), players = [], i;
    for (i = 0; i < TOTAL; i++) {
      var returning = i < 28;
      var w = returning ? Math.floor(r() * 6) : 0, l = returning ? Math.floor(r() * 6) : 0, d = returning ? Math.floor(r() * 2) : 0;
      if (returning && w + l + d < 3) w += 2;   // nobody has a 0-0 season in the demo
      players.push({
        pid: pid(i + 1), name: NAMES[i], group: 1 + Math.floor(r() * 3), female: r() < 0.3, level: 1 + Math.floor(r() * 5),
        returning: returning,
        last: returning ? { team: r() < 0.5 ? 'Red' : 'Blue', w: w, l: l, d: d, pts: w * 3 + d, rank: 1 + Math.floor(r() * 28),
          outcome: w - l >= 2 ? 'won' : l - w >= 1 ? 'lost' : 'mid' } : null,
        checked: false, team: null, profile: null,
      });
    }
    var st = { players: players, meId: null, step: 'pick', last: null };
    // a few people have already drawn, so the board and the admin view are not empty (returning players 13-28; the first 12 and all the new players are free to try the flow)
    var pre = [];
    for (i = 27; i >= 12; i--) pre.push(i);
    pre.forEach(function (idx) { var p = players[idx]; p.checked = true; p.profile = { hand: r() < 0.85 ? 'ขวา' : 'ซ้าย', shot: SHOTS[Math.floor(r() * 5)], styles: [STYLES[Math.floor(r() * 8)][0]] }; });
    S = st;
    pre.forEach(function (idx) { players[idx].team = pickTeam(players[idx]); });
    return st;
  }
  function load() {
    try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // ── the draw: a SKETCH of the balancing, not the real rule ──
  function teamStats(t) {
    var list = S.players.filter(function (p) { return p.team === t; });
    return { n: list.length, women: list.filter(function (p) { return p.female; }).length, lvl: list.reduce(function (a, p) { return a + p.level; }, 0) };
  }
  function pickTeam(p) {
    var cost = {};
    ['Red', 'Blue'].forEach(function (t) {
      var o = t === 'Red' ? 'Blue' : 'Red', a = teamStats(t), b = teamStats(o);
      var n = a.n + 1, w = a.women + (p.female ? 1 : 0), l = a.lvl + p.level;
      cost[t] = Math.abs(n - b.n) * 10 + Math.abs(w - b.women) * 4 + Math.abs(l - b.lvl);
    });
    if (cost.Red === cost.Blue) return Math.random() < 0.5 ? 'Red' : 'Blue';
    return cost.Red < cost.Blue ? 'Red' : 'Blue';
  }

  // ── shell ────────────────────────────────────────────────
  function shell() {
    var tabs = VIEWS.map(function (v) {
      return '<a class="dw-tab' + (v[0] === view ? ' is-on' : '') + '" href="?view=' + v[0] + '" data-act="view" data-v="' + v[0] + '">' + v[1] + '</a>';
    }).join('');
    return '<div class="dw-mockbar"><b>MOCK-UP</b><span>ข้อมูลหลอก · ยังไม่เชื่อมระบบจริง · ไม่มีอะไรถูกบันทึกลงฐานข้อมูล</span>' +
      '<button type="button" class="dw-reset" data-act="reset">เริ่มเดโมใหม่</button></div>' +
      '<header class="dw-top"><div class="dw-brand">' + mascot('serve', 44, 'dw-brand-star') + '<div><div class="dw-brand-t">สุ่มทีม</div><div class="dw-brand-s">SPORTS DAY 2027</div></div></div>' +
      '<nav class="dw-tabs" aria-label="มุมมอง">' + tabs + '</nav></header>' +
      '<main id="dwMain" class="dw-main dw-v-' + view + '"></main><div id="dwLayer"></div>';
  }

  function paint() {
    runToken++;
    var main = document.getElementById('dwMain');
    main.className = 'dw-main dw-v-' + view;
    document.querySelectorAll('.dw-tab').forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('data-v') === view); });
    if (view === 'board') main.innerHTML = boardHtml();
    else if (view === 'admin') main.innerHTML = adminHtml();
    else playerPaint(main);
  }

  // ── player view ──────────────────────────────────────────
  function playerPaint(main) {
    var step = S.step, p = me();
    if (!p && step !== 'pick') { S.step = step = 'pick'; }
    if (step === 'pick') main.innerHTML = pickHtml('');
    else if (step === 'hello') main.innerHTML = helloHtml(p);
    else if (step === 'chat') { main.innerHTML = chatShell(p); runChat(p); }
    else if (step === 'draw') main.innerHTML = drawHtml(p);
    else main.innerHTML = resultHtml(p);
  }

  function pickHtml(q) {
    var list = S.players.filter(function (p) { return !q || p.name.indexOf(q) >= 0 || p.pid.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    var left = TOTAL - drawn().length;
    return '<section class="dw-card dw-pick"><div class="dw-hero">' + mascot('search', 96) + '<div><h1>คุณคือใคร?</h1>' +
      '<p>เลือกชื่อของคุณ น้องดาวจะได้รู้จัก · ยังไม่ได้สุ่ม <b>' + left + '</b> / ' + TOTAL + ' คน</p></div></div>' +
      '<label class="dw-search">' + ico('magnifying-glass') + '<input id="dwQ" type="search" placeholder="พิมพ์ชื่อหรือเลข P…" value="' + esc(q) + '" autocomplete="off"></label>' +
      '<ul class="dw-names">' + (list.length ? list.map(function (p) {
        return '<li><button type="button" class="dw-name' + (p.team ? ' is-done' : '') + '" data-act="pickme" data-pid="' + p.pid + '"' + (p.team ? ' disabled' : '') + '>' +
          '<span class="dw-ini">' + esc(initials(p.name)) + '</span><span class="dw-nm"><b>' + esc(p.name) + '</b><small>' + p.pid + '</small></span>' +
          (p.team ? '<span class="dw-tag is-' + p.team.toLowerCase() + '">' + (p.team === 'Red' ? 'RED' : 'BLUE') + '</span>'
            : p.returning ? '<span class="dw-tag">ผู้เล่นเก่า</span>' : '<span class="dw-tag is-new">ใหม่</span>') + '</button></li>';
      }).join('') : '<li class="dw-empty">ไม่พบชื่อนี้ ลองพิมพ์ใหม่ หรือแจ้งแอดมินเพิ่มชื่อให้</li>') + '</ul></section>';
  }

  function greeting(p) {
    if (!p.returning) {
      return { m: 'serve', h: 'ยินดีต้อนรับสู่ Sports Day 2027!', t: 'สวัสดี ' + p.name + '! ปีนี้เป็นปีแรกของคุณ น้องดาวดีใจที่ได้เจอ เตรียมตัวให้พร้อม เดี๋ยวเราไปสุ่มทีมกัน' };
    }
    var L = p.last, side = L.team === 'Red' ? 'แดง' : 'น้ำเงิน';
    if (L.outcome === 'lost') return { m: 'miss', h: 'ปีที่แล้วแพ้ ปีนี้พร้อมล้างแค้นหรือยัง?', t: 'สวัสดี ' + p.name + '! ปีที่แล้วทีม' + side + ' ชนะ ' + L.w + ' แพ้ ' + L.l + ' ปีนี้ได้เวลาแก้มือแล้ว' };
    if (L.outcome === 'won') return { m: 'champion', h: 'แชมป์เก่ากลับมาแล้ว!', t: 'สวัสดี ' + p.name + '! ปีที่แล้วทีม' + side + ' ชนะ ' + L.w + ' แพ้ ' + L.l + ' ปีนี้จะรักษาฟอร์มไว้ได้ไหม?' };
    return { m: 'flick', h: 'กลับมาอีกครั้ง ยินดีต้อนรับ!', t: 'สวัสดี ' + p.name + '! ปีที่แล้วทีม' + side + ' ชนะ ' + L.w + ' แพ้ ' + L.l + ' เสมอ ' + L.d + ' ปีนี้เอาให้สนุกกว่าเดิม' };
  }
  function helloHtml(p) {
    var g = greeting(p), L = p.last;
    var stats = L ? '<ul class="dw-last"><li class="is-' + L.team.toLowerCase() + '"><span>ปีที่แล้ว</span><b>' + (L.team === 'Red' ? 'RED' : 'BLUE') + '</b></li>' +
      '<li><span>ชนะ</span><b>' + L.w + '</b></li><li><span>แพ้</span><b>' + L.l + '</b></li><li><span>คะแนน</span><b>' + L.pts + '</b></li><li><span>อันดับ</span><b>' + L.rank + '</b></li></ul>' : '';
    return '<section class="dw-card dw-hello"><div class="dw-who">' + mascot(g.m, 150) + '</div><div class="dw-bubble"><h1>' + esc(g.h) + '</h1><p>' + esc(g.t) + '</p></div>' + stats +
      '<div class="dw-row"><button type="button" class="ds-btn ds-btn-primary ds-btn-lg" data-act="tochat">ได้เลย น้องดาว ' + ico('caret-right') + '</button>' +
      '<button type="button" class="ds-btn ds-btn-ghost" data-act="notme">ไม่ใช่ฉัน</button></div></section>';
  }

  // ── the chat with น้องดาว ────────────────────────────────
  function chatShell(p) {
    return '<section class="dw-card dw-chat"><header class="dw-chat-h">' + mascot('serve', 40, 'dw-av') + '<div><b>น้องดาว</b><small>กำลังคุยกับ ' + esc(p.name) + '</small></div></header>' +
      '<div id="dwMsgs" class="dw-msgs" aria-live="polite"></div><div id="dwAns" class="dw-ans"></div></section>';
  }
  function msgs() { return document.getElementById('dwMsgs'); }
  function scrollDown() { var m = msgs(); if (m) { m.scrollTop = m.scrollHeight; } window.scrollTo(0, document.body.scrollHeight); }
  function bubble(who, html) {
    var m = msgs(); if (!m) return;
    var d = document.createElement('div'); d.className = 'dw-m is-' + who;
    d.innerHTML = (who === 'bot' ? mascot('serve', 34, 'dw-av') : '') + '<div class="dw-mb">' + html + '</div>';
    m.appendChild(d); scrollDown();
  }
  async function say(text, alive, extra) {
    var m = msgs(); if (!m || !alive()) return;
    var t = document.createElement('div'); t.className = 'dw-m is-bot is-typing';
    t.innerHTML = mascot('serve', 34, 'dw-av') + '<div class="dw-mb"><i></i><i></i><i></i></div>';
    m.appendChild(t); scrollDown();
    await wait((extra || 0) + 450 + Math.min(900, String(text).length * 16));
    t.remove();
    if (!alive()) return;
    bubble('bot', esc(text));
  }
  function ask(q, opts, multi, alive) {
    return new Promise(async function (resolve) {
      await say(q, alive);
      var box = document.getElementById('dwAns'); if (!box || !alive()) return;
      var chosen = [];
      function done() { box.innerHTML = ''; bubble('me', esc(chosen.join(', '))); resolve(chosen.slice()); }
      box.innerHTML = '<div class="dw-chips">' + opts.map(function (o) { return '<button type="button" class="dw-chip' + (o[2] ? ' is-solo' : '') + '" data-o="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>' +
        (multi ? '<button type="button" class="ds-btn ds-btn-primary dw-ok" disabled>ต่อไป</button>' : '');
      var ok = box.querySelector('.dw-ok');
      box.querySelectorAll('.dw-chip').forEach(function (b) {
        b.onclick = function () {
          var label = b.textContent;
          if (!multi || b.classList.contains('is-solo')) { chosen = [label]; return done(); }
          var i = chosen.indexOf(label);
          if (i >= 0) chosen.splice(i, 1); else if (chosen.length < 3) chosen.push(label);
          b.classList.toggle('is-on', i < 0 && chosen.indexOf(label) >= 0);
          box.querySelectorAll('.dw-chip').forEach(function (c) { c.classList.toggle('is-on', chosen.indexOf(c.textContent) >= 0); });
          ok.disabled = !chosen.length;
        };
      });
      if (ok) ok.onclick = done;
      scrollDown();
    });
  }
  function askText(placeholder, alive) {
    return new Promise(function (resolve) {
      var box = document.getElementById('dwAns'); if (!box || !alive()) return;
      box.innerHTML = '<form class="dw-txt"><input type="text" maxlength="80" placeholder="' + esc(placeholder) + '" autocomplete="off"><button type="submit" class="ds-btn ds-btn-primary">ส่ง</button></form>' +
        '<button type="button" class="ds-btn ds-btn-ghost dw-skip">ข้ามไปก่อน</button>';
      var f = box.querySelector('form'), inp = box.querySelector('input');
      f.onsubmit = function (e) { e.preventDefault(); var v = inp.value.trim(); if (!v) return; box.innerHTML = ''; bubble('me', esc(v)); resolve(v); };
      box.querySelector('.dw-skip').onclick = function () { box.innerHTML = ''; resolve(null); };
      scrollDown();
    });
  }
  function noAnswer(v) { return v === 'ไม่รู้' ? 'unknown' : v === 'ไม่บอก' ? 'private' : null; }
  // the mascot's reply to "don't know" (kind) and "not telling" (teasing; a second time is a different line)
  async function reactNo(kind, what, nth, alive) {
    if (kind === 'unknown') {
      await say(what === 'shot' ? 'ไม่รู้ก็ไม่เป็นไรนะ~ ตีไปตีมาเดี๋ยวก็รู้เองว่าถนัดอะไร 😄' : 'ไม่เป็นไรเลย บางทีเพื่อนในสนามมองออกก่อนเจ้าตัวอีก เดี๋ยวดูกันตอนแข่ง 😄', alive);
    } else {
      await say(nth ? 'อีกแล้ว! กั๊กหนักมากนะคุณพรี่ 😆 ได้ๆ งั้นไปลุ้นกันในสนามเลย' : 'หยั่นแน่~ กั๊กฝีมือหรอจ๊ะคุณพรี่ 😏', alive);
    }
  }
  async function runChat(p) {
    var tok = ++runToken, alive = function () { return tok === runToken && view === 'player' && S.step === 'chat'; };
    p.profile = p.profile || {};
    await say('ก่อนสุ่มทีม น้องดาวขอรู้จักคุณนิดนึงนะ ตอบได้เลย ไม่ต้องเขินนะ', alive);
    var g = await ask('เพศอะไรดี? (ไว้ช่วยแบ่งทีมให้สมดุล)', [['ชาย', 'ชาย'], ['หญิง', 'หญิง']], false, alive); if (!alive()) return;
    p.female = g[0] === 'หญิง';
    var h = await ask('ตีมือไหนครับ?', [['ขวา', 'ขวา'], ['ซ้าย', 'ซ้าย'], ['สองมือ', 'ถนัดสองมือ']], false, alive); if (!alive()) return;
    p.profile.hand = h[0];
    var hid = 0;   // how many times this person has kept it to themselves
    var s = await ask('ลูกถนัดคือ?', SHOTS.map(function (x) { return [x, x]; }).concat(NOANS), false, alive); if (!alive()) return;
    var sn = noAnswer(s[0]);
    p.profile.shot = sn ? null : s[0]; p.profile.shotNote = sn;
    if (sn) { await reactNo(sn, 'shot', sn === 'private' ? hid++ : 0, alive); if (!alive()) return; }
    var st = await ask('สไตล์การเล่นของคุณ? (เลือกได้ถึง 3 อย่าง)', STYLES.map(function (x) { return [x[0], x[1]]; }).concat(NOANS), true, alive); if (!alive()) return;
    var tn = noAnswer(st[0]);
    p.profile.styles = tn ? [] : st; p.profile.stylesNote = tn;
    if (tn) { await reactNo(tn, 'styles', tn === 'private' ? hid++ : 0, alive); if (!alive()) return; }
    // the weakness joke: ask, take it back, then ask again
    await say('ส่วนจุดอ่อน จุดบอดของคุณ… บอกน้องดาวได้นะ น้องดาวอยากรู้ 👀', alive);
    await say('…', alive, 900); if (!alive()) return;
    await say('ล้อเล่นๆ 😆 ไม่ต้องบอกก็ได้ เดี๋ยวคู่แข่งก็รู้เองตอนแข่งอยู่แล้ว', alive, 700);
    await say('แต่ถ้าอยากพิมพ์จุดอ่อนมาจริงๆ ก็พิมพ์ได้เลยนะ น้องดาวไม่บอกใคร (มั้ง) 🤫', alive, 900);
    var weak = await askText('จุดอ่อนของฉันคือ…', alive); if (!alive()) return;
    if (weak) await say('บันทึกแล้ว! แล้วก็ส่งให้ทีมตรงข้ามทุกคนเรียบร้อย 😈 ล้อเล่นอีกแล้ว น้องดาวไม่ได้เก็บไว้จริงๆ หรอก', alive, 400);
    else await say('ใจดีจังเลย~ งั้นเราไปสุ่มทีมกัน!', alive);
    if (!alive()) return;
    p.checked = true; S.step = 'draw'; save();
    var box = document.getElementById('dwAns');
    if (box) box.innerHTML = '<button type="button" class="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" data-act="todraw">ไปสุ่มทีม ' + ico('caret-right') + '</button>';
    scrollDown();
  }

  // ── draw + result ────────────────────────────────────────
  function drawHtml(p) {
    return '<section class="dw-card dw-draw"><div class="dw-who">' + mascot('smash', 150) + '</div><h1>พร้อมแล้ว ' + esc(p.name) + '!</h1>' +
      '<p>กดแล้วน้องดาวจะสุ่มทีมให้ทันที กดได้ครั้งเดียวนะ</p>' +
      '<div class="dw-bigwrap"><button type="button" class="dw-big" data-act="draw"><span>สุ่มทีม</span></button></div>' +
      '<p class="dw-note">ตอนนี้สุ่มแล้ว ' + drawn().length + ' / ' + TOTAL + ' คน</p></section>';
  }
  function resultHtml(p) {
    var t = p.team || 'Red', rank = drawn().length;
    return '<section class="dw-card dw-result"><div class="dw-field is-' + t.toLowerCase() + '"><small>คุณอยู่</small><b>' + teamName(t) + '</b></div>' +
      '<div class="dw-who">' + mascot('victory', 140) + '</div><p class="dw-lead">ยินดีด้วย ' + esc(p.name) + '! คุณเป็นคนที่ <b>' + rank + '</b> จาก ' + TOTAL + ' ที่สุ่มแล้ว</p>' +
      '<div class="dw-row"><button type="button" class="ds-btn ds-btn-primary ds-btn-lg" data-act="go-board">ดูหน้าจอเปิดตัวทีม</button>' +
      '<button type="button" class="ds-btn" data-act="notme">เสร็จแล้ว</button></div></section>';
  }
  function confetti() {
    var layer = document.getElementById('dwLayer'), i, html = '';
    for (i = 0; i < 36; i++) {
      html += '<i class="dw-cf" style="left:' + Math.round(Math.random() * 100) + '%;animation-delay:' + (Math.random() * 0.6).toFixed(2) + 's;animation-duration:' + (1.6 + Math.random() * 1.4).toFixed(2) +
        's;--s:' + (10 + Math.round(Math.random() * 14)) + 'px;--c:' + (['#e11d24', '#0956b8', '#f4c430', '#0b2a52'][i % 4]) + '"></i>';
    }
    var d = document.createElement('div'); d.className = 'dw-cfs'; d.innerHTML = html; layer.appendChild(d);
    setTimeout(function () { d.remove(); }, 3600);
  }
  async function doDraw() {
    var p = me(); if (!p || p.team || busy) return;
    busy = true;
    var team = pickTeam(p), layer = document.getElementById('dwLayer');
    layer.innerHTML = '<div class="dw-reveal" id="dwRv">' + mascot('flick', 96) + '<div class="dw-rv-card is-red" id="dwRc"><b>RED</b></div><p>น้องดาวกำลังสุ่ม…</p></div>';
    var card = document.getElementById('dwRc'), cur = 'Red', ms = 70, i;
    for (i = 0; i < 16; i++) {
      cur = cur === 'Red' ? 'Blue' : 'Red';
      card.className = 'dw-rv-card is-' + cur.toLowerCase(); card.firstChild.textContent = cur === 'Red' ? 'RED' : 'BLUE';
      await wait(ms); ms += 18;
    }
    if (cur !== team) { card.className = 'dw-rv-card is-' + team.toLowerCase(); card.firstChild.textContent = team === 'Red' ? 'RED' : 'BLUE'; await wait(260); }
    p.team = team; S.last = p.pid; S.step = 'result'; save();
    card.classList.add('is-final');
    await wait(700);
    confetti();
    await wait(1500);
    layer.innerHTML = ''; busy = false;
    paint();
  }

  // ── big screen ───────────────────────────────────────────
  function boardHtml() {
    function col(t) {
      var list = S.players.filter(function (p) { return p.team === t; }), st = teamStats(t);
      return '<section class="dw-col is-' + t.toLowerCase() + '"><header><b>' + teamName(t) + '</b><span>' + st.n + ' คน</span></header><ul>' +
        list.map(function (p) {
          return '<li class="' + (S.last === p.pid ? 'is-just' : '') + '"><span class="dw-ini">' + esc(initials(p.name)) + '</span><b>' + esc(p.name) + '</b></li>';
        }).join('') + (list.length ? '' : '<li class="dw-wait">รอการสุ่ม…</li>') + '</ul></section>';
    }
    var left = TOTAL - drawn().length, pool = '';
    for (var i = 0; i < left; i++) pool += '<span class="dw-q">?</span>';
    return '<div class="dw-board"><div class="dw-bh"><div>' + mascot('victory', 84) + '</div><div><h1>เปิดตัวทีม</h1><p>สุ่มแล้ว <b>' + drawn().length + '</b> / ' + TOTAL + ' คน</p></div>' +
      '<div class="dw-bh-act"><button type="button" class="ds-btn" data-act="demo">จำลองมีคนกดสุ่ม</button><button type="button" class="ds-btn" data-act="fs">เต็มจอ</button></div></div>' +
      '<div class="dw-cols">' + col('Red') + col('Blue') + '</div>' + (left ? '<div class="dw-pool"><small>ยังไม่สุ่ม ' + left + ' คน</small><div>' + pool + '</div></div>' : '<div class="dw-pool"><b>ครบทุกคนแล้ว!</b></div>') + '</div>';
  }
  async function demoDraw() {
    var rest = S.players.filter(function (p) { return !p.team; });
    if (!rest.length) return;
    var p = rest[Math.floor(Math.random() * rest.length)];
    p.checked = true; p.profile = p.profile || { hand: 'ขวา', shot: SHOTS[Math.floor(Math.random() * 5)], styles: ['allround'] };
    p.team = pickTeam(p); S.last = p.pid; save(); paint();
  }

  // ── admin ────────────────────────────────────────────────
  function bar(a, b) { var t = a + b || 1; return '<span class="dw-bar"><i class="is-red" style="width:' + Math.round(a * 100 / t) + '%"></i><i class="is-blue" style="width:' + Math.round(b * 100 / t) + '%"></i></span>'; }
  function adminHtml() {
    var R = teamStats('Red'), B = teamStats('Blue'), checked = S.players.filter(function (p) { return p.checked; }).length;
    var rows = S.players.map(function (p) {
      var st = p.team ? '<span class="dw-tag is-' + p.team.toLowerCase() + '">' + (p.team === 'Red' ? 'RED' : 'BLUE') + '</span>' : p.checked ? '<span class="dw-tag">เช็กอินแล้ว</span>' : '<span class="dw-tag is-none">ยังไม่เข้า</span>';
      return '<tr><td>' + p.pid + '</td><td><b>' + esc(p.name) + '</b></td><td>G' + p.group + '</td><td>' + (p.female ? 'หญิง' : 'ชาย') + '</td><td>' + '★'.repeat(p.level) + '</td><td>' + (p.returning ? 'เก่า' : 'ใหม่') + '</td><td>' + st + '</td>' +
        '<td>' + (p.team ? '<button type="button" class="ds-btn ds-btn-sm" data-act="undo" data-pid="' + p.pid + '">รีเซ็ต</button>' : '') + '</td></tr>';
    }).join('');
    return '<div class="dw-admin"><section class="dw-card"><h2>ความคืบหน้า</h2><div class="dw-prog"><div><b>' + checked + '</b><span>เช็กอินแล้ว / ' + TOTAL + '</span></div><div><b>' + drawn().length + '</b><span>สุ่มแล้ว / ' + TOTAL + '</span></div></div>' +
      '<h3>สมดุลสองทีม (ตัวอย่างการแสดงผล)</h3><dl class="dw-bal"><dt>จำนวนคน</dt><dd>' + R.n + ' : ' + B.n + bar(R.n, B.n) + '</dd><dt>ผู้หญิง</dt><dd>' + R.women + ' : ' + B.women + bar(R.women, B.women) + '</dd><dt>ฝีมือรวม</dt><dd>' + R.lvl + ' : ' + B.lvl + bar(R.lvl, B.lvl) + '</dd></dl>' +
      '<p class="dw-note">ตรรกะถ่วงสมดุลจริง (เพศ + ระดับฝีมือ) จะลงรายละเอียดกันทีหลัง ตอนนี้เดโมใช้แบบง่ายๆ ให้เห็นภาพเท่านั้น</p>' +
      '<div class="dw-row"><button type="button" class="ds-btn ds-btn-primary" disabled>ส่งเข้าระบบหลัก (ยังไม่เปิดในเดโม)</button></div></section>' +
      '<section class="dw-card"><h2>รายชื่อผู้เล่น (' + TOTAL + ' คน)</h2><div class="dw-tablewrap"><table class="ds-table"><thead><tr><th>เลข</th><th>ชื่อ</th><th>กลุ่ม</th><th>เพศ</th><th>ฝีมือ</th><th>ปีที่แล้ว</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section></div>';
  }

  // ── events ───────────────────────────────────────────────
  function onClick(e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'view') { e.preventDefault(); view = el.getAttribute('data-v'); try { history.replaceState(null, '', '?view=' + view); } catch (x) {} paint(); return; }
    if (act === 'reset') { if (window.confirm('เริ่มเดโมใหม่? ข้อมูลหลอกจะกลับไปเป็นค่าเริ่มต้น')) { freshState(); save(); paint(); } return; }
    if (act === 'pickme') { S.meId = el.getAttribute('data-pid'); S.step = 'hello'; save(); paint(); return; }
    if (act === 'notme') { S.meId = null; S.step = 'pick'; save(); paint(); return; }
    if (act === 'tochat') { S.step = 'chat'; save(); paint(); return; }
    if (act === 'todraw') { S.step = 'draw'; save(); paint(); return; }
    if (act === 'draw') { doDraw(); return; }
    if (act === 'go-board') { view = 'board'; try { history.replaceState(null, '', '?view=board'); } catch (x) {} paint(); return; }
    if (act === 'demo') { demoDraw(); return; }
    if (act === 'fs') { var d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); return; }
    if (act === 'undo') { var p = byPid(el.getAttribute('data-pid')); if (p) { p.team = null; if (S.last === p.pid) S.last = null; if (S.meId === p.pid) S.step = 'draw'; save(); paint(); } }
  }
  function onInput(e) {
    if (e.target.id !== 'dwQ') return;
    var q = e.target.value.trim(), main = document.getElementById('dwMain');
    var pos = e.target.selectionStart;
    main.innerHTML = pickHtml(q);
    var inp = document.getElementById('dwQ'); inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (x) {}
  }

  function start() {
    $root = document.getElementById('dw');
    S = load();
    if (!S || !S.players || S.players.length !== TOTAL) { freshState(); save(); }
    var v = (new URLSearchParams(location.search)).get('view');
    view = v === 'board' || v === 'admin' ? v : 'player';
    $root.innerHTML = shell();
    $root.addEventListener('click', onClick);
    $root.addEventListener('input', onInput);
    // a second tab (the big screen) follows the first one live
    window.addEventListener('storage', function (e) { if (e.key === KEY && !busy) { S = load() || S; if (view !== 'player') paint(); } });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
