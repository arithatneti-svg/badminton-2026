// ============================================================
// shared/art.js - the brand mark and the few illustrations, all inline SVG.
// The marks and line drawings are inline SVG (sharp on the TV, follow the tokens, cost bytes not requests);
// the mascot and the Riso pieces are small lazy WebP files.
//
//   dsMark(48)          gold tile + shuttlecock: login screens, headers, app icon source
//   dsShuttle(32)       the shuttlecock alone in currentColor (inline, next to text)
//   dsArt('court')      doubles court seen from above with a rally arc (empty states, hero)
//   dsArt('shuttle')    big shuttlecock with speed lines (nothing here yet)
//   dsMascot('break')   the star mascot (media/mascot/*.webp) for empty / waiting / celebrating states
//   dsSpot('shuttle-streak') one piece of the Riso art sheet (media/riso/*.webp): brushes, shuttlecocks, rackets, torn paper
// Colours come from css/tokens.css (gold, gold-ink, currentColor), so a token change repaints them.
// ============================================================
(function () {
  'use strict';

  // one shuttlecock, drawn upright on a 64 grid: feather skirt, cork, feather lines + binding
  var SKIRT = 'M24 41 13 14Q32 7 51 14L40 41Z';
  var CORK = 'M23 41h18a9 9 0 0 1-18 0z';
  var LINES = 'M28.6 41 22.6 11.5M32 41V9.5M35.4 41l6-29.5M17.5 26.5Q32 31 46.5 26.5';

  function box(size) {
    return size ? ' width="' + (+size) + '" height="' + (+size) + '"' : '';
  }

  window.dsMark = function (size) {
    return '<svg class="ds-mark" viewBox="0 0 64 64"' + box(size) + ' role="img" aria-label="Badminton Sports Day">' +
      '<rect width="64" height="64" rx="16" style="fill:var(--gold)"/>' +
      '<g transform="translate(32 32) rotate(-32) scale(.95) translate(-32 -29)">' +
      '<path d="' + SKIRT + '" style="fill:var(--gold-ink)"/>' +
      '<path d="' + CORK + '" style="fill:var(--gold-ink)"/>' +
      '<path d="' + LINES + '" style="fill:none;stroke:var(--gold);stroke-width:1.7;stroke-linecap:round"/>' +
      '</g></svg>';
  };

  window.dsShuttle = function (size) {
    return '<svg class="ds-shuttle" viewBox="0 0 64 64"' + box(size || 32) + ' aria-hidden="true" focusable="false">' +
      '<g transform="translate(32 32) rotate(-32) scale(.95) translate(-32 -29)">' +
      '<path d="' + SKIRT + '" style="fill:none;stroke:currentColor;stroke-width:2.4;stroke-linejoin:round"/>' +
      '<path d="' + CORK + '" style="fill:var(--gold)"/>' +
      '<path d="' + LINES + '" style="fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;opacity:.75"/>' +
      '</g></svg>';
  };

  var ART = {
    // doubles court, to scale (13.4 x 6.1 m, 1 unit = 10 cm), a dashed rally arc and a small shuttle over the net
    court: function () {
      return '<svg class="ds-art ds-art-court" viewBox="0 0 134 61" fill="none" stroke="currentColor" stroke-width=".6" ' +
        'stroke-linecap="round" aria-hidden="true" focusable="false">' +
        '<rect x=".3" y=".3" width="133.4" height="60.4" rx="1"/>' +
        '<path d="M0 4.6H134M0 56.4H134M67 0V61M47.2 0V61M86.8 0V61M7.6 0V61M126.4 0V61M0 30.5H47.2M86.8 30.5H134" style="opacity:.7"/>' +
        '<path d="M26 50C52 18 88 6 104 10" style="stroke:var(--gold);stroke-width:.9;stroke-dasharray:1.6 2.2"/>' +
        '<g transform="translate(103 3) rotate(-32 6.4 6.4) scale(.2)" style="stroke:none">' +
        '<path d="' + SKIRT + '" style="fill:var(--gold)"/><path d="' + CORK + '" style="fill:var(--gold)"/></g>' +
        '</svg>';
    },
    // large shuttle with three speed lines
    shuttle: function () {
      return '<svg class="ds-art ds-art-shuttle" viewBox="0 0 120 96" fill="none" stroke="currentColor" stroke-width="2.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<g transform="translate(66 46) rotate(-32) scale(1.15) translate(-32 -29)">' +
        '<path d="' + SKIRT + '"/><path d="' + CORK + '" style="fill:var(--gold);stroke:none"/>' +
        '<path d="' + LINES + '" style="stroke-width:1.6;opacity:.75"/></g>' +
        '<path d="M12 70h22M6 82h30M16 58h14" style="opacity:.45"/>' +
        '</svg>';
    }
  };

  window.dsArt = function (name) {
    return ART[name] ? ART[name]() : '';
  };

  // ---- raster art (media/, built by scripts/riso/*.py from the owner's Riso sheet and the star mascot) ----
  // Name -> [width, height] of the file, so the <img> reserves its box before it loads (no layout jump).
  var MASCOT = {
    loading: [333, 310], champion: [301, 355],
    search: [296, 258], rising: [287, 258], offline: [316, 257],
    admin: [304, 262], streak: [311, 275], reward: [342, 278], replay: [299, 301],
    // the pastel set (10 poses): serving, jump smash, dive save, defense block, victory, the miss, backhand flick, net drop, tangled, break time
    serve: [380, 470], smash: [380, 502], dive: [380, 257], block: [380, 356], victory: [380, 489], miss: [380, 331],
    flick: [380, 330], drop: [380, 313], tangled: [380, 329], 'break': [380, 351]
  };
  // how each mascot moves (css .ds-mascot--*, all slow and small; off under prefers-reduced-motion)
  var MASCOT_MOVE = {
    loading: 'bob', reward: 'bob', streak: 'bob', champion: 'bob',
    search: 'sway', admin: 'sway', replay: 'sway',
    offline: 'sink', rising: 'float',
    serve: 'bob', smash: 'bob', victory: 'bob', dive: 'float', block: 'sway', flick: 'sway', drop: 'sway', 'break': 'sway', tangled: 'sway', miss: 'sink'
  };
  var SPOT = {
    'shuttle-streak': [216, 130], 'shuttle-swoosh': [180, 136],
    'brush-red': [143, 63], 'brush-blue': [158, 65], 'brush-red-line': [143, 32], 'brush-blue-line': [158, 32],
    'arrow-red': [101, 35], 'arrow-blue': [96, 39], 'court-view': [235, 68]
  };


  function raster(dir, name, table, width, cls, eager) {
    var d = table[name];
    if (!d) return '';
    var w = Math.round(width || d[0]), h = Math.round(w * d[1] / d[0]);
    return '<img class="' + cls + '" src="media/' + dir + '/' + name + '.webp" width="' + w + '" height="' + h + '" alt="" ' +
      'decoding="async"' + (eager ? '' : ' loading="lazy"') + ' draggable="false">';
  }

  // dsMascot('break', 132): the star mascot as a quiet picture for empty, waiting and celebrating states.
  // width in CSS px (css can override it, the height follows). Decorative: the sentence next to it says the same.
  // cls: extra class, e.g. 'ds-mascot--sticker' (white edge) when it sits on a solid team colour
  window.dsMascot = function (name, width, eager, cls) {
    return raster('mascot', name, MASCOT, width || 132, 'ds-mascot ds-mascot--' + (MASCOT_MOVE[name] || 'bob') + (cls ? ' ' + cls : ''), eager);
  };
  // dsSpot('shuttle-red', 96): one piece of the Riso sheet (brush, shuttlecock, racket, torn paper ...)
  window.dsSpot = function (name, width, eager, cls) {
    return raster('riso', name, SPOT, width, 'ds-spot ds-spot--' + name + (cls ? ' ' + cls : ''), eager);
  };
})();
