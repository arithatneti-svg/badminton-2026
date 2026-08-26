// ══════════════════════════════════════════════════════════════
// PERFORMANCE RANKING ENGINE
// ══════════════════════════════════════════════════════════════

const TIER = { '1': 3, '2': 2, '3': 1 }; // G1=3 (เก่งสุด), G3=1 (มือหน้าบ้าน)

function getPlayerTier(playerId) {
  const p = ( appState.players || [] ).find(x => x.id === playerId);
  return p ? (TIER[p.group] || 1) : 1;
}

// Elo-lite: expected win probability based on tier difference
function expectedWin(myTier, oppTierAvg) {
  // scale: tier diff of 1 → expect ~72% win if higher
  return 1 / (1 + Math.pow(10, (oppTierAvg - myTier) * 0.4));
}

// pointDiff bonus: sูสีมาก (≤5) → ×1.125, ห่างมาก (≥20) → ×1.5
function pointDiffBonus(g1r, g1b, g2r, g2b) {
  const total = Math.abs(g1r - g1b) + Math.abs(g2r - g2b);
  return 1 + Math.min(total, 20) / 40; // 1.0 – 1.5
}

function computePerfRanking() {
  const perfMap = {}; // id → { perf, upsetCount, overCount, underCount, matches }

  appState.players.forEach(p => {
    perfMap[p.id] = {
      id: p.id, name: p.name, team: p.team, group: p.group,
      perf: 0, upsetCount: 0, overCount: 0, underCount: 0, matchCount: 0,
      pts: 0, rawWinRate: 0, wins: 0, totalGames: 0,
    };
  });

  appState.matchHistory.forEach(h => {
    const [g1r, g1b] = (h.game1 || '0:0').split(':').map(Number);
    const [g2r, g2b] = (h.game2 || '0:0').split(':').map(Number);
    if (isNaN(g1r) || isNaN(g1b)) return;

    const hasG2 = g2r > 0 || g2b > 0;
    const pdBonus = pointDiffBonus(g1r, g1b, hasG2 ? g2r : 0, hasG2 ? g2b : 0);

    // tier averages
    const t_r1 = getPlayerTier(h.r1), t_r2 = getPlayerTier(h.r2);
    const t_b1 = getPlayerTier(h.b1), t_b2 = getPlayerTier(h.b2);

    const redTierAvg  = (t_r1 + t_r2) / 2;
    const blueTierAvg = (t_b1 + t_b2) / 2;
    const matchStr    = (t_r1 + t_r2 + t_b1 + t_b2) / 4; // 1–3

    // actual outcome
    const rActual = h.rStat === 'W' ? 1 : h.rStat === 'D' ? 0.5 : 0;
    const bActual = 1 - rActual;

    // game wins (for raw stats)
    let rGames = 0, bGames = 0;
    if (g1r > g1b) rGames++; else if (g1b > g1r) bGames++;
    if (hasG2) { if (g2r > g2b) rGames++; else if (g2b > g2r) bGames++; }
    const totalGames = hasG2 ? 2 : 1;

    const processTeam = (ids, myTierAvg, oppTierAvg, actual, myPts, myGames) => {
      const expWin = expectedWin(myTierAvg, oppTierAvg);
      const rawScore = (actual - expWin) * matchStr * pdBonus;
      // upset bonus: win against clearly stronger team (tier diff ≥ 0.5)
      const tierDiff = oppTierAvg - myTierAvg;
      const upsetBonus = actual === 1 && tierDiff >= 0.5
        ? tierDiff * 0.5 * matchStr
        : 0;
      const totalScore = rawScore + upsetBonus;

      ids.forEach(id => {
        if (!perfMap[id]) return;
        perfMap[id].perf       += totalScore;
        perfMap[id].pts        += myPts;
        perfMap[id].matchCount += 1;
        perfMap[id].wins       += myGames;
        perfMap[id].totalGames += totalGames;
        if (upsetBonus > 0)   perfMap[id].upsetCount++;
        if (rawScore  > 0.15) perfMap[id].overCount++;
        if (rawScore  < -0.1) perfMap[id].underCount++;
      });
    };

    processTeam([h.r1, h.r2], redTierAvg,  blueTierAvg, rActual, h.pRed  || 0, rGames);
    processTeam([h.b1, h.b2], blueTierAvg, redTierAvg,  bActual, h.pBlue || 0, bGames);
  });

  // compute raw win rate
  Object.values(perfMap).forEach(p => {
    p.rawWinRate = p.totalGames > 0 ? Math.round(p.wins / p.totalGames * 100) : 0;
    p.perf = Math.round(p.perf * 100) / 100; // 2 dp
  });

  return perfMap;
}


// renderPerfRanking / setRankView / renderPerformance were removed:
// the group rank cards and the per-match analysis cards are now the
// PERF column and the expandable match rows in js/reports.js.
