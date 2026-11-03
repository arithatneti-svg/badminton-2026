/* ============================================================
   Team draw - Sports Day, Saturday 14 Nov 2026.
   A player picks who they are, gets a greeting from น้องดาว (the star mascot), answers a few jokes, presses "สุ่มทีม" and sees their colour.
   The teams are NOT drawn on the press: the organiser creates ONE full assignment in the admin view (shared/draw-rules.js holds every rule and
   is tested by scripts/test-draw-rules.mjs), it is stored in Firebase under draw_2026/plan and locked; a press only reveals that person's own
   entry (draw_2026/reveal/<pid>, written once by a transaction). The big screen and the admin view follow draw_2026/reveal live.
   Nothing here touches the match-day data (sportsday_2026_data). ?test=1 uses a throw-away node (draw_2026_test).
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'bdm_draw_local_v3';   // only this phone's own state: who I am, where I am in the chat, my answers
  var TEST = /[?&]test=1(?:&|$)/.test(location.search);
  var BASE = TEST ? 'draw_2026_test' : 'draw_2026';
  var RULES = window.DrawRules;
  var ROSTER = RULES.ROSTER.map(function (r) { return r.name; });
  var TOTAL = ROSTER.length;
  // Summer 2026 (archived 2026-08-27 in seasons_archive/2026, read from the database): Blue beat Red 53 - 50
  var SUMMER = { winner: 'Blue', blue: 53, red: 50 };
  var EVENT_DATE = 'เสาร์ที่ 14 พ.ย.', WRONG_DATE = 'เสาร์ที่ 21 พ.ย.';
  var VIEWS = [['player', 'ผู้เล่น'], ['board', 'จอใหญ่'], ['admin', 'แอดมิน']];

  var $root, S, view, runToken = 0, busy = false;
  var REVEAL = {}, PLAN = null, PLAN_READY = false, PLAN_LOADING = false, dbErr = null;

  // ── helpers ──────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pid(n) { return 'P' + (n < 10 ? '00' : n < 100 ? '0' : '') + n; }
  function teamName(t) { return t === 'Red' ? 'RED TEAM' : 'BLUE TEAM'; }
  function byPid(id) { return S.players.filter(function (p) { return p.pid === id; })[0]; }
  function me() { return S.meId ? byPid(S.meId) : null; }
  function drawn() { return S.players.filter(function (p) { return p.team; }); }
  function initials(n) {
    var s = String(n).replace(/\s+/g, '').replace(/^พี่(?=.)/, ''), m = s.match(/^[เแโใไ]?[ก-ฮ][\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]*/);
    return m ? m[0] : s.slice(0, 2);
  }
  function ico(n) { return window.dsIcon ? window.dsIcon(n) : ''; }
  function mascot(n, w, cls) { return window.dsMascot ? window.dsMascot(n, w, true, cls) : ''; }

  // ── the roster and this phone's own state ────────────────
  function freshState() {
    S = { players: RULES.ROSTER.map(function (r, i) { return { pid: pid(i + 1), name: r.name, sub: r.subgroup, skill: r.skill, isNew: r.isNew, captain: r.captain, checked: false, team: null, profile: null }; }), meId: null, step: 'pick', last: null };
    return S;
  }
  function save() {
    var pr = {}; S.players.forEach(function (p) { if (p.profile) pr[p.pid] = p.profile; });
    try { localStorage.setItem(KEY, JSON.stringify({ meId: S.meId, step: S.step, profiles: pr })); } catch (e) {}
  }
  function restore() {
    freshState();
    var raw = null; try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!raw) return;
    S.meId = raw.meId || null; S.step = raw.step || 'pick';
    S.players.forEach(function (p) { if (raw.profiles && raw.profiles[p.pid]) p.profile = raw.profiles[p.pid]; });
  }
  function teamStats(t) { return { n: S.players.filter(function (p) { return p.team === t; }).length }; }
  function isAdmin() { try { return localStorage.getItem('bdm_scoreboard_role') === 'superadmin'; } catch (e) { return false; } }   // same login as the main page
  function rankOf(p) {
    var at = REVEAL[p.pid] && REVEAL[p.pid].at; if (!at) return drawn().length;
    return Object.keys(REVEAL).filter(function (k) { return REVEAL[k] && REVEAL[k].at <= at; }).length;
  }
  function latestPid() {
    var best = null; Object.keys(REVEAL).forEach(function (k) { if (REVEAL[k] && (!best || REVEAL[k].at > REVEAL[best].at)) best = k; });
    return best;
  }

  // ── shared state (Firebase) ──────────────────────────────
  function dbOk() { return !!(window.firebase && firebase.database); }
  function ref(path) { return firebase.database().ref(BASE + (path ? '/' + path : '')); }
  function applyReveal(map) {
    REVEAL = map || {};
    S.players.forEach(function (p) { p.team = REVEAL[p.pid] && REVEAL[p.pid].team || null; if (p.team) p.checked = true; });
  }
  function listen() {
    if (!dbOk()) { dbErr = 'ต่อฐานข้อมูลไม่ได้ ลองเปิดหน้านี้ใหม่'; return; }
    function fail() { dbErr = 'อ่านข้อมูลไม่ได้ ลองเปิดหน้านี้ใหม่'; onShared(); }
    ref('planMeta').on('value', function (s) { PLAN_READY = !!s.val(); if (!PLAN_READY) PLAN = null; onShared(); }, fail);
    ref('reveal').on('value', function (s) { applyReveal(s.val()); onShared(); }, fail);
  }
  // a change that somebody else made: repaint, but never in the middle of the chat or the reveal animation
  function onShared() {
    if (busy || !$root) return;
    var p = me();
    if (view === 'player') {
      if (S.step === 'chat' || S.step === 'hello') return;
      if (p && p.team && S.step !== 'result') { S.step = 'result'; save(); }
      else if (S.step === 'pick') { var q = document.getElementById('dwQ'); if (q && q.value) return; }
    }
    paint();
  }
  // this person's colour: the one already revealed, otherwise their locked entry of the plan, written once (race-safe)
  async function claim(p) {
    if (!dbOk()) throw new Error('db');
    var mine = (await ref('reveal/' + p.pid).once('value')).val();
    if (mine && mine.team) return mine.team;
    var plan = (await ref('plan/' + p.pid).once('value')).val();
    if (plan !== 'Red' && plan !== 'Blue') throw new Error('noplan');
    var res = await ref('reveal/' + p.pid).transaction(function (cur) { return cur || { team: plan, at: firebase.database.ServerValue.TIMESTAMP }; });
    return res.snapshot.val().team;
  }

  // ── shell ────────────────────────────────────────────────
  function shell() {
    var tabs = VIEWS.filter(function (v) { return v[0] !== 'admin' || isAdmin() || view === 'admin'; }).map(function (v) {
      return '<a class="dw-tab' + (v[0] === view ? ' is-on' : '') + '" href="?view=' + v[0] + '" data-act="view" data-v="' + v[0] + '">' + v[1] + '</a>';
    }).join('');
    return '<div class="dw-mockbar"><b>' + (TEST ? 'TEST' : 'DRAW') + '</b><span>' + (TEST ? 'โหมดทดสอบ · ใช้ฐานข้อมูลสำรอง ไม่กระทบผลจริง' : 'สุ่มได้ครั้งเดียวต่อชื่อ · ทุกเครื่องเห็นผลตรงกัน') + '</span>' +
      (isAdmin() ? '<button type="button" class="dw-reset" data-act="reset">ล้างข้อมูลในเครื่องนี้</button>' : '') + '</div>' +
      '<header class="dw-top"><div class="dw-brand">' + mascot('serve', 44, 'dw-brand-star') + '<div><div class="dw-brand-t">สุ่มทีม</div><div class="dw-brand-s">SPORTS DAY · 14 NOV 2026</div></div></div>' +
      '<nav class="dw-tabs" aria-label="มุมมอง">' + tabs + '</nav></header>' +
      '<main id="dwMain" class="dw-main dw-v-' + view + '"></main><div id="dwLayer"></div>';
  }

  function paint() {
    runToken++;
    var main = document.getElementById('dwMain');
    main.className = 'dw-main dw-v-' + view;
    document.querySelectorAll('.dw-tab').forEach(function (a) { a.classList.toggle('is-on', a.getAttribute('data-v') === view); });
    if (view === 'board') main.innerHTML = boardHtml();
    else if (view === 'admin') { main.innerHTML = adminHtml(); ensurePlan(); }
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
        return '<li><button type="button" class="dw-name' + (p.team ? ' is-done' : '') + '" data-act="pickme" data-pid="' + p.pid + '">' +
          '<span class="dw-ini">' + esc(initials(p.name)) + '</span><span class="dw-nm"><b>' + esc(p.name) + '</b><small>' + p.pid + '</small></span>' +
          (p.team ? '<span class="dw-tag is-' + p.team.toLowerCase() + '">' + (p.team === 'Red' ? 'RED' : 'BLUE') + '</span>'
            : (p.isNew ? '<span class="dw-tag is-new">NEW</span>' : '')) + '</button></li>';
      }).join('') : '<li class="dw-empty">ไม่พบชื่อนี้ ลองพิมพ์ใหม่ หรือแจ้งแอดมินเพิ่มชื่อให้</li>') + '</ul></section>';
  }

  function greeting(p) {
    if (p.isNew) return { m: 'serve', h: 'ยินดีต้อนรับสมาชิกใหม่!', t: 'สวัสดี ' + p.name + '! ปีนี้เป็นปีแรกของคุณ น้องดาวดีใจที่ได้เจอ เตรียมตัวให้พร้อม เดี๋ยวเราไปสุ่มทีมกัน' };
    return { m: 'serve', h: 'ยินดีต้อนรับสู่กีฬาสี!', t: 'สวัสดี ' + p.name + '! น้องดาวรออยู่ เตรียมตัวให้พร้อม เดี๋ยวเราไปสุ่มทีมกัน' };
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
  function shuffled(a) { return a.slice().sort(function () { return Math.random() - 0.5; }); }
  var WEAK = {
    'หัวใจ': 'ใจอ่อนล่ะสิ ระวังโดนเล่นกับใจนะ 💘',
    'เธอ': 'เธอ?! ใครกัน… คู่แข่งรู้แล้วนะ 😏',
    'ไม่รู้': 'ไม่รู้ตัวนี่แหละอันตราย 😆',
    'ไม่มี': 'มั่นใจจัง ไม่มีจุดอ่อนเลย เดี๋ยวสนามพิสูจน์ให้',
    'ไม่บอก': 'หยั่นแน่~ กั๊กอีกแล้ว 😏'
  };
  async function runChat(p) {
    var tok = ++runToken, alive = function () { return tok === runToken && view === 'player' && S.step === 'chat'; };
    p.profile = p.profile || {};
    // 1 last winter's champion, always answered with the real result
    await say('ก่อนสุ่มทีม ขอถามนิดนึงนะ ตอบได้เลย ไม่ต้องเขินนะ', alive);
    var c = await ask('รู้ไหม ต้นปี (Summer 2026) ใครได้แชมป์?', [['Red', 'Team Red'], ['Blue', 'Team Blue']], false, alive); if (!alive()) return;
    var guess = /Blue/.test(c[0]) ? 'Blue' : 'Red';   // the chip label is 'Team Blue' / 'Team Red'
    p.profile.guessWinner = guess;
    await say((guess === SUMMER.winner ? 'ถูกต้อง! ' : 'ไม่ใช่นะ~ ') + 'ผู้ชนะคือ Team Blue เฉือนชนะไปได้ ' + SUMMER.blue + ' – ' + SUMMER.red, alive);
    // 2 "you decide your colour" + which colour they like
    await say('แต่ปลายปีนี้ คุณคือหนึ่งในผู้กำหนดชะตาสีของตัวเอง', alive, 300);
    var f = await ask('ชอบสีไหนมากกว่ากัน? (แต่ไม่เกี่ยวกับสีที่จะได้นะ สุ่มล้วนๆ)', [['น้ำเงิน', 'น้ำเงิน'], ['แดง', 'แดง']], false, alive); if (!alive()) return;
    p.profile.fav = f[0];
    await say('รับทราบ! สี' + f[0] + 'ก็ดี แต่ไม่การันตีนะ 😏', alive);
    // 3 which day is the event: two choices, in random order; a wrong answer gets it hammered in
    var d = await ask('รู้ไหมเราจะจัดกีฬาสีวันไหน?', shuffled([[EVENT_DATE, EVENT_DATE], [WRONG_DATE, WRONG_DATE]]), false, alive); if (!alive()) return;
    p.profile.guessDate = d[0];
    if (d[0] === EVENT_DATE) await say('เก่งมาก! ' + EVENT_DATE + ' เจอกันที่สนาม', alive);
    else {
      await say('ผิด! ห้ามมาผิดวันนะ!!', alive);
      await say('วัน เสาร์ ที่ 14 พ.ย. — เสาร์ที่ 14 พฤศจิกายน จำให้ขึ้นใจ ไม่ใช่เสาร์ที่ 21 นะ!', alive, 300);
    }
    // 4 which hand: a joke answer, then asked again with the two real ones only
    var h = await ask('ตีมือไหน?', [['ซ้าย', 'ซ้าย'], ['ขวา', 'ขวา'], ['ตีมือเธอ', 'ตีมือเธอ']], false, alive); if (!alive()) return;
    if (h[0] === 'ตีมือเธอ') {
      await say('น้องดาวถามว่ามือไหน ไม่ได้ถามว่าตีมือใคร 😆', alive);
      h = await ask('ถามใหม่นะ ตีมือไหน?', [['ซ้าย', 'ซ้าย'], ['ขวา', 'ขวา']], false, alive); if (!alive()) return;
    }
    p.profile.hand = h[0];
    // 5 the weakness, picked from a list and teased per item, then "just kidding"
    var w = await ask('จุดอ่อนของคุณคืออะไร?', ['หัวใจ', 'เธอ', 'ไม่รู้', 'ไม่มี', 'ไม่บอก'].map(function (x) { return [x, x]; }), false, alive); if (!alive()) return;
    p.profile.weak = w[0];
    await say(WEAK[w[0]], alive);
    await say('ขำๆ น้า ไม่ได้เอาไปบอกใครหรอก 🤫', alive, 300);
    await say('เอาล่ะ ไปสุ่มทีมกัน!', alive);
    if (!alive()) return;
    p.checked = true; S.step = 'draw'; save();
    var box = document.getElementById('dwAns');
    if (box) box.innerHTML = '<button type="button" class="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" data-act="todraw">ไปสุ่มทีม ' + ico('caret-right') + '</button>';
    scrollDown();
  }

  // ── draw + result ────────────────────────────────────────
  function drawHtml(p) {
    return '<section class="dw-card dw-draw"><div class="dw-who">' + mascot('smash', 150) + '</div><h1>พร้อมแล้ว ' + esc(p.name) + '!</h1>' +
      (PLAN_READY ? '<p>กดแล้วน้องดาวจะเปิดทีมของคุณทันที กดได้ครั้งเดียวนะ</p>' +
        '<div class="dw-bigwrap"><button type="button" class="dw-big" data-act="draw"><span>สุ่มทีม</span></button></div>'
        : '<p>ผู้จัดยังไม่เปิดให้สุ่ม รอสักครู่นะ หน้านี้จะเปิดเองเมื่อพร้อม</p>') +
      '<p class="dw-note" id="dwDrawErr">' + esc(dbErr || '') + '</p>' +
      '<p class="dw-note">ตอนนี้สุ่มแล้ว ' + drawn().length + ' / ' + TOTAL + ' คน</p></section>';
  }
  function resultHtml(p) {
    var t = p.team || 'Red', rank = rankOf(p), sideTh = t === 'Red' ? 'แดง' : 'น้ำเงิน', fav = p.profile && p.profile.fav;
    return '<section class="dw-card dw-result"><div class="dw-field is-' + t.toLowerCase() + '"><small>คุณอยู่</small><b>' + teamName(t) + '</b></div>' +
      '<div class="dw-who">' + mascot('victory', 140) + '</div><p class="dw-lead">ยินดีด้วย ' + esc(p.name) + '! คุณเป็นคนที่ <b>' + rank + '</b> จาก ' + TOTAL + ' ที่สุ่มแล้ว</p>' +
      // the reminder before match day: look after yourself, your colour needs you, the rest comes from the organiser
      (p.captain ? '<p class="dw-fav">คุณคือหัวหน้าทีม' + sideTh + '!</p>' : '') +
      (fav ? '<p class="dw-fav">' + (fav === sideTh ? 'ได้สีที่ชอบ โชคดีไป!' : 'ไม่ได้สีที่ชอบ แต่สี' + sideTh + 'ต้องการคุณ') + '</p>' : '') +
      '<div class="dw-remind is-' + t.toLowerCase() + '"><b>ฝากไว้ก่อนวันแข่ง</b>' +
      '<p>อีกไม่กี่วันก็แข่งแล้วนะ ดูแลตัวเองดีๆ <u>อย่าเจ็บ อย่าป่วย</u>น้า</p>' +
      '<p class="dw-need"><span class="dw-tc">' + (t === 'Red' ? 'สีแดง' : 'สีน้ำเงิน') + '</span> ต้องการคุณ!</p>' +
      '<p class="dw-remind-sub">ส่วนที่เหลือ รออัพเดทจากผู้จัดอีกที</p></div>' +
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
    var p = me(); if (!p || busy) return;
    if (p.team) { S.step = 'result'; save(); paint(); return; }
    busy = true;
    var team, err = document.getElementById('dwDrawErr');
    try { team = await claim(p); }
    catch (e) {
      busy = false;
      if (err) err.textContent = e && e.message === 'noplan' ? 'ผู้จัดยังไม่เปิดให้สุ่ม รอสักครู่นะ' : 'ต่อฐานข้อมูลไม่ได้ ลองกดอีกครั้ง';
      return;
    }
    var layer = document.getElementById('dwLayer');
    layer.innerHTML = '<div class="dw-reveal" id="dwRv">' + mascot('flick', 96) + '<div class="dw-rv-card is-red" id="dwRc"><b>RED</b></div><p>น้องดาวกำลังสุ่ม…</p></div>';
    var card = document.getElementById('dwRc'), cur = 'Red', ms = 70, i;
    for (i = 0; i < 16; i++) {
      cur = cur === 'Red' ? 'Blue' : 'Red';
      card.className = 'dw-rv-card is-' + cur.toLowerCase(); card.firstChild.textContent = cur === 'Red' ? 'RED' : 'BLUE';
      await wait(ms); ms += 18;
    }
    if (cur !== team) { card.className = 'dw-rv-card is-' + team.toLowerCase(); card.firstChild.textContent = team === 'Red' ? 'RED' : 'BLUE'; await wait(260); }
    p.team = team; S.step = 'result'; save();
    card.classList.add('is-final');
    await wait(700);
    confetti();
    await wait(1500);
    layer.innerHTML = ''; busy = false;
    paint();
  }

  // ── big screen ───────────────────────────────────────────
  function boardHtml() {
    var lastPid = latestPid();
    function col(t) {
      var list = S.players.filter(function (p) { return p.team === t; }), st = teamStats(t);
      return '<section class="dw-col is-' + t.toLowerCase() + '"><header><b>' + teamName(t) + '</b><span>' + st.n + ' คน</span></header><ul>' +
        list.map(function (p) {
          return '<li class="' + (lastPid === p.pid ? 'is-just' : '') + '"><span class="dw-ini">' + esc(initials(p.name)) + '</span><b>' + esc(p.name) + '</b>' + (p.captain ? '<span class="dw-tag is-new">หัวหน้า</span>' : '') + (p.isNew ? '<span class="dw-tag">NEW</span>' : '') + '</li>';
        }).join('') + (list.length ? '' : '<li class="dw-wait">รอการสุ่ม…</li>') + '</ul></section>';
    }
    var left = TOTAL - drawn().length, pool = '';
    for (var i = 0; i < left; i++) pool += '<span class="dw-q">?</span>';
    return '<div class="dw-board"><div class="dw-bh"><div>' + mascot('victory', 84) + '</div><div><h1>เปิดตัวทีม</h1><p>สุ่มแล้ว <b>' + drawn().length + '</b> / ' + TOTAL + ' คน</p></div>' +
      '<div class="dw-bh-act"><button type="button" class="ds-btn" data-act="fs">เต็มจอ</button></div></div>' +
      '<div class="dw-cols">' + col('Red') + col('Blue') + '</div>' + (left ? '<div class="dw-pool"><small>ยังไม่สุ่ม ' + left + ' คน</small><div>' + pool + '</div></div>' : '<div class="dw-pool"><b>ครบทุกคนแล้ว!</b></div>') + '</div>';
  }

  // ── admin ────────────────────────────────────────────────
  function bar(a, b) { var t = a + b || 1; return '<span class="dw-bar"><i class="is-red" style="width:' + Math.round(a * 100 / t) + '%"></i><i class="is-blue" style="width:' + Math.round(b * 100 / t) + '%"></i></span>'; }
  function planByName() { var a = {}; S.players.forEach(function (p) { a[p.name] = PLAN && PLAN[p.pid]; }); return a; }
  function ensurePlan() {
    if (!isAdmin() || !PLAN_READY || PLAN || PLAN_LOADING || !dbOk()) return;
    PLAN_LOADING = true;
    ref('plan').once('value').then(function (s) { PLAN = s.val() || null; PLAN_LOADING = false; if (view === 'admin' && !busy) paint(); }, function () { PLAN_LOADING = false; });
  }
  function tag(t) { return '<span class="dw-tag is-' + t.toLowerCase() + '">' + (t === 'Red' ? 'RED' : 'BLUE') + '</span>'; }
  function adminHtml() {
    if (!isAdmin()) return '<section class="dw-card"><h2>หน้านี้สำหรับผู้จัด</h2><p>เข้าสู่ระบบ Super Admin ในหน้าหลักก่อน แล้วกลับมาเปิดหน้านี้อีกครั้ง</p><div class="dw-row"><a class="ds-btn ds-btn-primary" href="./">ไปหน้าหลัก</a></div></section>';
    var head, rows = '', plan = PLAN_READY && PLAN;
    if (!PLAN_READY) head = '<p>ยังไม่ได้สร้างผลสุ่ม ผู้เล่นจะกดสุ่มไม่ได้จนกว่าจะสร้างและล็อก</p><div class="dw-row"><button type="button" class="ds-btn ds-btn-primary" data-act="create">สร้างผลสุ่มและล็อก</button></div>';
    else if (!plan) head = '<p>กำลังอ่านผลที่ล็อกไว้…</p>';
    else {
      var a = planByName(), bad = RULES.check(a), r = 0;
      S.players.forEach(function (p) { if (PLAN[p.pid] === 'Red') r++; });
      head = '<p>' + (bad.length ? '<b>ผลที่ล็อกไว้ขัดเงื่อนไข: ' + esc(bad.join('; ')) + '</b>' : 'ล็อกผลสุ่มแล้ว · ตรวจผ่านทุกเงื่อนไข ✓') + '</p>' +
        '<h3>สมดุลสองทีม (จากผลที่ล็อกไว้)</h3><dl class="dw-bal"><dt>จำนวนคน</dt><dd>' + r + ' : ' + (TOTAL - r) + bar(r, TOTAL - r) + '</dd></dl>' +
        (drawn().length ? '<p class="dw-note">ผลถูกล็อกไว้ ล้างทั้งหมดไม่ได้ขณะที่มีคนสุ่มไปแล้ว</p>' : '<div class="dw-row"><button type="button" class="ds-btn" data-act="wipe">ล้างทั้งหมดแล้วสร้างใหม่</button></div>');
      rows = S.players.map(function (p) {
        var rv = p.team ? tag(p.team) : '<span class="dw-tag is-none">ยังไม่สุ่ม</span>';
        return '<tr><td>' + p.pid + '</td><td><b>' + esc(p.name) + '</b>' + (p.captain ? ' <span class="dw-tag is-new">หัวหน้า</span>' : '') + (p.isNew ? ' <span class="dw-tag">NEW</span>' : '') + '</td><td>' + p.sub + '</td><td>' + p.skill + '</td><td>' + tag(PLAN[p.pid]) + '</td><td>' + rv + '</td>' +
          '<td>' + (p.team ? '<button type="button" class="ds-btn ds-btn-sm" data-act="undo" data-pid="' + p.pid + '">ให้สุ่มใหม่</button>' : '') + '</td></tr>';
      }).join('');
    }
    return '<div class="dw-admin"><section class="dw-card"><h2>ความคืบหน้า</h2><div class="dw-prog"><div><b>' + drawn().length + '</b><span>สุ่มแล้ว / ' + TOTAL + '</span></div></div>' + head +
      '<p class="dw-note">ผลที่ล็อกไว้อยู่ในฐานข้อมูล draw_2026 ผู้เล่นเห็นเฉพาะของตัวเองตอนกดสุ่ม</p></section>' +
      (plan ? '<section class="dw-card"><h2>รายชื่อผู้เล่น (' + TOTAL + ' คน)</h2><div class="dw-tablewrap"><table class="ds-table"><thead><tr><th>เลข</th><th>ชื่อ</th><th>กลุ่มย่อย</th><th>Skill</th><th>ผลที่ล็อก</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' : '') + '</div>';
  }
  async function createPlan() {
    if (!dbOk() || !isAdmin()) return;
    var meta = (await ref('planMeta').once('value')).val();
    if (meta) { window.alert('มีผลที่ล็อกไว้แล้ว'); return; }
    var a = RULES.generate(), bad = RULES.check(a);
    if (bad.length) { window.alert('สร้างไม่สำเร็จ: ' + bad.join('; ')); return; }
    var plan = {}; S.players.forEach(function (p) { plan[p.pid] = a[p.name]; });
    await ref('').update({ plan: plan, planMeta: { at: firebase.database.ServerValue.TIMESTAMP } });
  }
  async function wipeAll() {
    if (!dbOk() || !isAdmin() || drawn().length) return;   // once anybody has drawn, the plan cannot be wiped from the page
    if ((window.prompt('จะลบผลที่ล็อกไว้และผลที่ทุกคนสุ่มไปแล้ว พิมพ์คำว่า ล้าง เพื่อยืนยัน') || '').trim() !== 'ล้าง') return;
    PLAN = null;
    await ref('').remove();
  }

  // ── events ───────────────────────────────────────────────
  function onClick(e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'view') { e.preventDefault(); view = el.getAttribute('data-v'); try { history.replaceState(null, '', '?view=' + view + (TEST ? '&test=1' : '')); } catch (x) {} paint(); return; }
    if (act === 'reset') { if (!isAdmin()) return; if (window.confirm('ล้างข้อมูลของเครื่องนี้ (ชื่อที่เลือกและคำตอบ) แล้วเริ่มใหม่? ผลสุ่มที่ทุกคนได้ไปแล้วไม่หาย')) { freshState(); applyReveal(REVEAL); save(); paint(); } return; }
    if (act === 'pickme') { var q = byPid(el.getAttribute('data-pid')); S.meId = q.pid; S.step = q.team ? 'result' : 'hello'; save(); paint(); return; }
    if (act === 'notme') { S.meId = null; S.step = 'pick'; save(); paint(); return; }
    if (act === 'tochat') { S.step = 'chat'; save(); paint(); return; }
    if (act === 'todraw') { S.step = 'draw'; save(); paint(); return; }
    if (act === 'draw') { doDraw(); return; }
    if (act === 'go-board') { view = 'board'; try { history.replaceState(null, '', '?view=board' + (TEST ? '&test=1' : '')); } catch (x) {} paint(); return; }
    if (act === 'fs') { var d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); return; }
    if (act === 'create') { createPlan(); return; }
    if (act === 'wipe') { wipeAll(); return; }
    if (act === 'undo') { if (isAdmin() && dbOk()) ref('reveal/' + el.getAttribute('data-pid')).remove(); }
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
    restore();
    var v = (new URLSearchParams(location.search)).get('view');
    view = v === 'board' || v === 'admin' ? v : 'player';
    $root.innerHTML = shell();
    $root.addEventListener('click', onClick);
    $root.addEventListener('input', onInput);
    paint();
    listen();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
