// ============================================================
// shared/art.js - the brand mark and the few illustrations, all inline SVG.
// No raster images: they stay sharp on the TV, follow the tokens and cost bytes, not requests.
//
//   dsMark(48)          gold tile + shuttlecock: login screens, headers, app icon source
//   dsShuttle(32)       the shuttlecock alone in currentColor (inline, next to text)
//   dsArt('court')      doubles court seen from above with a rally arc (empty states, hero)
//   dsArt('shuttle')    big shuttlecock with speed lines (nothing here yet)
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
})();
