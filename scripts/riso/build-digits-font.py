"""Turn the hand-lettered numeral sheet (art-source/riso-kit/O-digits.jpeg) into a small web font.

usage: python scripts/riso/build-digits-font.py <O-digits.jpeg> <out.woff2> [--ttf <out.ttf>]

Row 1 = 0-9, row 2 = - : / + #. Each glyph is traced (potrace) and set on Anton's metrics (2048 upm, digit height 1761) so a
number and the Anton letters next to it ("M07", "RED 3") share a baseline and a height. Only the 15 glyphs exist: the CSS maps
the font in with unicode-range, everything else falls through to Anton / the UI font.
Needs: pillow numpy potracer fonttools brotli (build-time only, not shipped).
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
import potrace
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

UPM = 2048
DIGIT_H = 1761                    # Anton's cap / digit height
SB = 96                           # side bearing each side, font units
ASC, DESC = 2409, -674            # Anton's line metrics, so line boxes do not change when this font is in the mix
NAMES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
SYM = [("hyphen", [0x2D, 0x2013, 0x2212]), ("colon", [0x3A]), ("slash", [0x2F]), ("plus", [0x2B]), ("numbersign", [0x23])]


def gaps(profile, n):
    runs, start = [], None
    for i, v in enumerate(profile):
        if not v and start is None:
            start = i
        elif v and start is not None:
            runs.append((start, i)); start = None
    runs = [r for r in runs if r[0] > 0]
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    return sorted(runs[:n])


def split(profile, parts):
    cuts = gaps(profile, parts - 1)
    edges = [0] + [(a + b) // 2 for a, b in cuts] + [len(profile)]
    return list(zip(edges[:-1], edges[1:]))


def contour_area(pts):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2.0


def main():
    sheet, out = sys.argv[1], sys.argv[2]
    a = np.array(Image.open(sheet).convert("RGB")).astype(np.float32)
    ink = np.clip((200.0 - a[..., 0]) / 140.0, 0, 1)
    ink = np.array(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32) / 255.0
    fg = ink > .5
    rows = split(fg.any(axis=1), 2)
    glyphs = {}
    for ri, (y0, y1) in enumerate(rows):
        cols = split(fg[y0:y1].any(axis=0), 10 if ri == 0 else 5)
        for ci, (x0, x1) in enumerate(cols):
            sub = fg[y0:y1, x0:x1]
            ys, xs = np.where(sub)
            bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
            name = NAMES[ci] if ri == 0 else SYM[ci][0]
            glyphs[name] = (bx0, by0, bx1, by1, fg[by0 - 4:by1 + 4, bx0 - 4:bx1 + 4])

    # one scale for all glyphs: the digit row's flat-bottomed digits define the baseline and the height
    dig = [glyphs[n] for n in NAMES]
    base_px = float(np.median([g[3] for g in dig]))
    h_px = float(np.median([g[3] - g[1] for g in dig]))
    s = DIGIT_H / h_px
    print("digit height %.0f px -> %d units, scale %.3f" % (h_px, DIGIT_H, s))

    order = [".notdef", "space"] + NAMES + [n for n, _ in SYM]
    pens = {}
    advance = {".notdef": 900, "space": 500}
    cmap = {0x20: "space"}
    for i, n in enumerate(NAMES):
        cmap[0x30 + i] = n
    for n, cps in SYM:
        for cp in cps:
            cmap[cp] = n

    def draw(name, g):
        bx0, by0, bx1, by1, bm = g
        if name in NAMES:
            dy = base_px                                  # y (image) of the baseline
        else:
            dy = (by0 + by1) / 2.0 + DIGIT_H / s / 2.0    # symbols centre on the digit's mid-height
        tt = TTGlyphPen(None)
        pen = Cu2QuPen(tt, 1.2, reverse_direction=False)
        bm = np.pad(bm, 0)
        trace = potrace.Bitmap(~bm).trace(turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.6)
        ox = bx0 - 4                                      # the crop origin in sheet pixels
        oy = by0 - 4
        pt = lambda p: (round((p.x + ox - bx0) * s + SB), round((dy - (p.y + oy)) * s))
        for c in trace:
            pen.moveTo(pt(c.start_point))
            for seg in c.segments:
                if seg.is_corner:
                    pen.lineTo(pt(seg.c)); pen.lineTo(pt(seg.end_point))
                else:
                    pen.curveTo(pt(seg.c1), pt(seg.c2), pt(seg.end_point))
            pen.closePath()
        advance[name] = round((bx1 - bx0) * s) + 2 * SB
        return tt.glyph()

    glyf = {".notdef": TTGlyphPen(None).glyph(), "space": TTGlyphPen(None).glyph()}
    for n in NAMES + [n for n, _ in SYM]:
        glyf[n] = draw(n, glyphs[n])

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyf)
    fb.setupHorizontalMetrics({n: (advance[n], getattr(glyf[n], "xMin", 0) or 0) for n in order})
    fb.setupHorizontalHeader(ascent=ASC, descent=DESC)
    fb.setupNameTable({"familyName": "Riso Num", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=ASC, sTypoDescender=DESC, sTypoLineGap=0, usWinAscent=2876, usWinDescent=674, sCapHeight=DIGIT_H, sxHeight=DIGIT_H)
    fb.setupPost()
    if "--ttf" in sys.argv:
        fb.save(sys.argv[sys.argv.index("--ttf") + 1])
    fb.font.flavor = "woff2"
    fb.save(out)
    import os
    print("wrote %s (%d bytes), %d glyphs" % (out, os.path.getsize(out), len(order)))


main()
