// ==========================================
// 0b. PREDICTION ENGINE
// ==========================================
// Analyst passcode gate — separate from admin/superadmin
let _analystUnlocked = localStorage.getItem('bdm_analyst_unlocked') === '1';
const ANALYST_PASS   = 'guest2026'; // passcode to unlock predictions

function unlockAnalyst() {
  const p = prompt('🔮 Enter Analyst passcode:');
  if (p === ANALYST_PASS) {
    _analystUnlocked = true;
    localStorage.setItem('bdm_analyst_unlocked', '1');
    renderPublicOngoingMatches();
    showToast('🔮 Analyst Mode ปลดล็อคแล้ว!', 'success');
  } else if (p !== null) {
    showToast('❌ รหัสไม่ถูกต้อง', 'error');
  }
}

/**
 * getMatchPrediction(r1id, r2id, b1id, b2id)
 * Returns { redWin, draw, blueWin, advantage, diff, label, analystNote }
 * All probabilities 0–100 summing to 100.
 */
function getMatchPrediction(r1id, r2id, b1id, b2id) {
  const getP    = id => (appState.players || []).find(p => p.id === id);
  const getProf = id => (appState.playerProfiles || {})[id] || {};
  const p = [r1id, r2id, b1id, b2id].map(getP);
  if (p.some(x => !x)) return null; // missing player

  // baseScore lives in playerProfiles, not in players array
  const rawBs   = id => getProf(id).baseScore;
  const bs      = id => { const v = parseFloat(rawBs(id)); return isNaN(v) ? 0 : v; };
  const hasScore= id => { const v = rawBs(id); return v !== null && v !== undefined && v !== ''; };

  const redBase  = bs(r1id) + bs(r2id);
  const blueBase = bs(b1id) + bs(b2id);

  // ── ต้องมีทั้งสองทีมมี baseScore ถึงจะ predict ได้ ──
  // ถ้าแค่ฝั่งเดียวมีค่า diff จะเบี้ยว
  const redHasScore  = [r1id, r2id].some(hasScore);
  const blueHasScore = [b1id, b2id].some(hasScore);
  if (!redHasScore || !blueHasScore) {
    return { noBaseScore: true, redBase, blueBase };
  }

  const diff    = redBase - blueBase;
  const absDiff = Math.round(Math.abs(diff) * 1000) / 1000;

  // ── Probability table ตาม Logic: BaseScore ขยับทีละ 0.5 ──
  let redWin, draw, blueWin, label, advantage;

  if (absDiff < 0.25) {
    // เท่ากัน (diff = 0) → 25% / 50% / 25%
    redWin = 25; draw = 50; blueWin = 25;
    label = 'Even Match'; advantage = 'none';

  } else if (absDiff < 0.75) {
    // diff = 0.5 → 65% / 20% / 15%
    redWin  = diff > 0 ? 65 : 15;
    draw    = 20;
    blueWin = diff > 0 ? 15 : 65;
    label = diff > 0 ? 'Red slight edge' : 'Blue slight edge';
    advantage = diff > 0 ? 'red' : 'blue';

  } else if (absDiff < 1.25) {
    // diff = 1.0 → 75% / 15% / 10%
    redWin  = diff > 0 ? 75 : 10;
    draw    = 15;
    blueWin = diff > 0 ? 10 : 75;
    label = diff > 0 ? 'Red advantage' : 'Blue advantage';
    advantage = diff > 0 ? 'red' : 'blue';

  } else {
    // diff >= 1.5 → 85% / 10% / 5%
    redWin  = diff > 0 ? 85 : 5;
    draw    = 10;
    blueWin = diff > 0 ? 5  : 85;
    label = diff > 0 ? 'Red strong advantage' : 'Blue strong advantage';
    advantage = diff > 0 ? 'red' : 'blue';
  }

  // ── H2H modifier: check past encounters between these exact pairs ──
  // Find history where same 4 player ids faced each other (any order within team)
  const rIds = new Set([r1id, r2id]);
  const bIds = new Set([b1id, b2id]);
  const h2h  = (appState.matchHistory || []).filter(h => {
    const hRed  = new Set([h.r1, h.r2]);
    const hBlue = new Set([h.b1, h.b2]);
    return (areSetsEqual(hRed, rIds) && areSetsEqual(hBlue, bIds)) ||
           (areSetsEqual(hRed, bIds) && areSetsEqual(hBlue, rIds));
  });

  let h2hNote = '';
  if (h2h.length > 0) {
    let redH2hW = 0, blueH2hW = 0;
    h2h.forEach(h => {
      const flipped = areSetsEqual(new Set([h.r1, h.r2]), bIds); // roles swapped
      const stat = flipped ? h.bStat : h.rStat;
      if (stat === 'W') redH2hW++; else if (stat === 'L') blueH2hW++;
    });
    const total = h2h.length;
    // Nudge ±5 per H2H win, capped at ±15
    const nudge = Math.min(15, (redH2hW - blueH2hW) * 5);
    redWin  = Math.max(3, Math.min(94, redWin  + nudge));
    blueWin = Math.max(3, Math.min(94, blueWin - nudge));
    draw    = Math.max(3, 100 - redWin - blueWin); // คำนวณ draw จาก remainder ก่อน normalize
    h2hNote = `H2H ${total} แมตช์: Red ${redH2hW}W / Blue ${blueH2hW}W`;
  }

  // Normalise to exactly 100
  const total = redWin + draw + blueWin;
  redWin  = Math.round(redWin  / total * 100);
  blueWin = Math.round(blueWin / total * 100);
  draw    = 100 - redWin - blueWin;

  // ── Analyst note ──
  const redName  = `${getP(r1id)?.name||''} & ${getP(r2id)?.name||''}`;
  const blueName = `${getP(b1id)?.name||''} & ${getP(b2id)?.name||''}`;
  let analystNote = '';
  if (advantage === 'none') {
    analystNote = `⚖️ คู่นี้สูสีมาก — Base Score เท่ากัน คาดว่าสนุกแน่`;
  } else {
    const favTeam  = advantage === 'red' ? redName  : blueName;
    const undTeam  = advantage === 'red' ? blueName : redName;
    const favColor = advantage === 'red' ? '🔴' : '🔵';
    if (absDiff > 1.5) {
      analystNote = `${favColor} ${favTeam} เป็นเต็งหนักในแมตช์นี้ — ห่างกัน ${absDiff.toFixed(1)} แต้ม`;
    } else if (absDiff > 1.0) {
      analystNote = `${favColor} ${favTeam} มีความได้เปรียบชัดเจน แต่ ${undTeam} พลิกได้`;
    } else {
      analystNote = `${favColor} ${favTeam} ได้เปรียบนิดหน่อย — คู่นี้ลุ้นได้ทั้งสองฝ่าย`;
    }
  }
  if (h2hNote) analystNote += ` (${h2hNote})`;

  return { redWin, draw, blueWin, advantage, diff, absDiff, label,
           redBase, blueBase, analystNote, h2hCount: h2h.length };
}

function areSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * buildPredictionHTML(pred, compact)
 * Returns HTML string for the prediction bar.
 * compact=true → short version for queue rows
 * Requires _analystUnlocked or admin/superadmin role to show numbers.
 */

// ── Thai label map ──
const PRED_LABEL_TH = {
  'Even Match':           '⚖️ คู่สูสี',
  'Red slight edge':      '🔴 แดงได้เปรียบ (0.5)',
  'Blue slight edge':     '🔵 น้ำเงินได้เปรียบ (0.5)',
  'Red advantage':        '🔴 แดงได้เปรียบ (1.0)',
  'Blue advantage':       '🔵 น้ำเงินได้เปรียบ (1.0)',
  'Red strong advantage': '🔴 แดงได้เปรียบชัดเจน (1.5+)',
  'Blue strong advantage':'🔵 น้ำเงินได้เปรียบชัดเจน (1.5+)',
};

// ── Tier explanation in Thai ──
const PRED_TIER_DESC = {
  'Even Match':           'Base Score เท่ากัน — 25% / 50% draw / 25%',
  'Red slight edge':      'ห่างกัน 0.5 — 65% / 20% draw / 15%',
  'Blue slight edge':     'ห่างกัน 0.5 — 65% / 20% draw / 15%',
  'Red advantage':        'ห่างกัน 1.0 — 75% / 15% draw / 10%',
  'Blue advantage':       'ห่างกัน 1.0 — 75% / 15% draw / 10%',
  'Red strong advantage': 'ห่างกัน 1.5+ — 85% / 10% draw / 5%',
  'Blue strong advantage':'ห่างกัน 1.5+ — 85% / 10% draw / 5%',
};

function buildPredictionHTML(pred, compact = false) {
  if (!pred) return '';
  // Guest view: ไม่แสดง Prediction เลย
  if (userRole === 'guest' || !userRole) return '';
  const isGuest = (userRole === 'guest' || !userRole);
  const canSee = !isGuest && (_analystUnlocked || userRole === 'admin' || userRole === 'superadmin');

  if (!canSee) {
    return `<div class="pred-teaser" onclick="unlockAnalyst()">
      🔮 <span>ดู Prediction</span> <span style="color:var(--gold);font-size:0.85em;">🔒</span>
    </div>`;
  }

  // ── No base scores warning ──
  if (pred.noBaseScore) {
    return `<div class="pred-teaser" style="color:var(--muted2);cursor:default;">
      🔮 <span>ยังไม่มีข้อมูล Base Score — กรุณาเพิ่มใน Players</span>
    </div>`;
  }

  const { redWin, draw, blueWin, advantage, label, analystNote, absDiff, redBase, blueBase } = pred;
  const advColor   = advantage === 'red' ? 'var(--red)' : advantage === 'blue' ? 'var(--blue)' : 'var(--muted)';
  const labelTh    = PRED_LABEL_TH[label]   || label;
  const tierDesc   = PRED_TIER_DESC[label]  || '';
  const baseInfo   = `Base: 🔴 ${redBase.toFixed(1)} vs 🔵 ${blueBase.toFixed(1)}`;

  if (compact) {
    return `<div class="pred-compact">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="pred-label-sm" style="color:${advColor};">🔮 ${labelTh}</span>
        <span style="font-size:9px;color:var(--muted2);font-weight:600;">${baseInfo}</span>
      </div>
      <div class="pred-bar-row">
        <span class="pred-pct" style="color:var(--red);">${redWin}%</span>
        <div class="pred-bar" title="🔴 ชนะ ${redWin}% | เสมอ ${draw}% | 🔵 ชนะ ${blueWin}%">
          <div class="pred-bar-red"   style="width:${redWin}%"></div>
          <div class="pred-bar-draw"  style="width:${draw}%"></div>
          <div class="pred-bar-blue"  style="width:${blueWin}%"></div>
        </div>
        <span class="pred-pct" style="color:var(--blue);">${blueWin}%</span>
      </div>
      <div style="text-align:center;font-size:9px;color:var(--muted2);margin-top:3px;">เสมอ ${draw}% · ${tierDesc}</div>
    </div>`;
  }

  return `<div class="pred-block">
    <div class="pred-header">
      <span class="pred-icon">🔮</span>
      <span class="pred-title">PRE-MATCH PREDICTION</span>
      <span class="pred-label-badge" style="background:${advColor}22;color:${advColor};border-color:${advColor}44;">${labelTh}</span>
    </div>
    <div class="pred-bar-full-row">
      <div class="pred-team-stat">
        <span class="pred-pct-big" style="color:var(--red);">${redWin}%</span>
        <span class="pred-pct-lbl">🔴 ชนะ</span>
      </div>
      <div style="flex:1;min-width:0;">
        <div class="pred-bar pred-bar-lg" title="🔴 ชนะ ${redWin}% | เสมอ ${draw}% | 🔵 ชนะ ${blueWin}%">
          <div class="pred-bar-red"  style="width:${redWin}%"></div>
          <div class="pred-bar-draw" style="width:${draw}%"></div>
          <div class="pred-bar-blue" style="width:${blueWin}%"></div>
        </div>
        <div class="pred-draw-label">เสมอ ${draw}%</div>
        <div style="text-align:center;font-size:9px;color:var(--muted2);margin-top:2px;">${baseInfo} · ${tierDesc}</div>
      </div>
      <div class="pred-team-stat" style="text-align:right;">
        <span class="pred-pct-big" style="color:var(--blue);">${blueWin}%</span>
        <span class="pred-pct-lbl">🔵 ชนะ</span>
      </div>
    </div>
    <div class="pred-note">${escHtml(analystNote)}</div>
    <div class="pred-howto">
      <details>
        <summary>🧮 วิธีคำนวณ Prediction</summary>
        <div class="pred-howto-body">
          <p>ระบบเปรียบเทียบ <strong>Base Score รวมของทีม</strong> (คะแนนความสามารถรายบุคคลของผู้เล่นทั้งสองคนรวมกัน)</p>
          <table class="pred-tier-table">
            <tr><th>ช่วง Base Score Diff</th><th>ทีมได้เปรียบ</th><th>เสมอ</th><th>ทีมเสียเปรียบ</th></tr>
            <tr><td>= 0 (เท่ากัน)</td><td>25%</td><td>50%</td><td>25%</td></tr>
            <tr><td>0.5</td><td>65%</td><td>20%</td><td>15%</td></tr>
            <tr><td>1.0</td><td>75%</td><td>15%</td><td>10%</td></tr>
            <tr><td>1.5 ขึ้นไป</td><td>85%</td><td>10%</td><td>5%</td></tr>
          </table>
          <p style="margin-top:6px;">หากทีมนี้เคยแข่งกันมาก่อน ระบบจะปรับค่าตาม <strong>สถิติ H2H (Head-to-Head)</strong> เพิ่มหรือลด ±5% ต่อ 1 แมตช์ที่ชนะ (สูงสุด ±15%)</p>
        </div>
      </details>
    </div>
  </div>`;
}

// ── Check if actual result matched prediction ──
function checkPredictionAccuracy(pred, rStat) {
  if (!pred || !rStat) return null;
  const actual = rStat === 'W' ? 'red' : rStat === 'L' ? 'blue' : 'draw';
  const predicted = pred.redWin >= pred.blueWin && pred.redWin >= pred.draw ? 'red'
                  : pred.blueWin >= pred.redWin && pred.blueWin >= pred.draw ? 'blue'
                  : 'draw';
  return { correct: actual === predicted, actual, predicted, confidence: Math.max(pred.redWin, pred.draw, pred.blueWin) };
}

