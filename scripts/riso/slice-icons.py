"""Trace the hand-drawn Riso icon sheets (art-source/riso-kit/N1, N2) into SVG symbol markup.

usage: python scripts/riso/slice-icons.py <N1.jpeg> <N2.jpeg> <out.json> [--debug <dir>]

Each sheet is 3 rows x 6 icons: navy ink outlines over a flat yellow "second plate". The two layers are separated by colour
(ink: low red channel, plate: green well above blue), cleaned, and traced (potrace) into two paths per icon.
Output: { "<icon key>": "<path style=plate .../><path .../>" } for a 256x256 viewBox; the ink uses currentColor, the plate
uses var(--ic-plate, #F4C430). The keys are the Phosphor names the app already uses, so every dsIcon() / <use href="#ic-..">
call site picks the drawing up without a code change (see scripts/icons-fetch.mjs --hand).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
import potrace

SHEET1 = ["trophy", "crown", "medal", "star", "fire", "lightning",
          "flag", "timer", "hourglass-medium", "play", "pause", "check-circle",
          "warning", "warning-circle", "wifi-slash", "info", "arrows-left-right", "arrow-counter-clockwise"]
SHEET2 = ["user", "users", "pencil-simple", "trash", "camera", "images",
          "calendar-blank", "chart-bar", "gear-six", "magnifying-glass", "lock-simple", "lock-simple-open",
          "upload-simple", "floppy-disk", "funnel", "arrows-clockwise", "plus", "minus"]
ALIAS = {"arrows-clockwise": ["arrow-clockwise"]}                      # same drawing, second Phosphor name
FILL = ["trophy", "users", "images", "chart-bar", "gear-six", "star", "check-circle", "warning", "play", "pause", "flag", "crown"]
BOX = 232.0                                                              # longest icon side in the 256 box
UP = 2                                                                   # trace at 2x so the curves come out smooth
BLUR = 2.2                                                               # px on the 2048 sheet


def layers(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ink = np.clip((215.0 - r) / 155.0, 0, 1)                             # white 255 / yellow ~250 / navy ~10
    plate = np.clip((g - b - 40.0) / 90.0, 0, 1)                         # yellow: green far above blue
    return gauss(ink), gauss(plate)


def gauss(m):
    """Blur a 0..1 layer so the JPEG grain and the dry-brush speckle do not turn into hundreds of curve nodes."""
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(BLUR))
    return np.array(im).astype(np.float32) / 255.0


def gaps(profile, n_gaps, min_run=6):
    """Indices of the n widest empty runs in a 1-D 'has ink' profile -> list of (start, end)."""
    runs, start = [], None
    for i, v in enumerate(profile):
        if not v and start is None:
            start = i
        elif v and start is not None:
            runs.append((start, i)); start = None
    runs = [r for r in runs if r[0] > 0 and r[1] - r[0] >= min_run]       # drop the paper margin before the first ink
    runs.sort(key=lambda r: r[1] - r[0], reverse=True)
    return sorted(runs[:n_gaps])


def split(profile, parts):
    cuts = gaps(profile, parts - 1)
    edges = [0] + [(a + b) // 2 for a, b in cuts] + [len(profile)]
    return list(zip(edges[:-1], edges[1:]))


def morph(mask, size, grow):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MaxFilter(size) if grow else ImageFilter.MinFilter(size))
    return np.array(im) > 127


def trace(binary, tol):
    bm = potrace.Bitmap(~binary)                                   # potracer treats True as background
    return bm.trace(turdsize=80, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.3, opticurve=True, opttolerance=tol)


def path_d(plist, cx, cy, s):
    """Relative commands on rounded absolute points (no drift): the same curve in about a third of the bytes."""
    pt = lambda p: (int(round((p.x - cx) * s + 128.0)), int(round((p.y - cy) * s + 128.0)))
    num = lambda *v: " ".join(str(x) for x in v).replace(" -", "-")
    out = []
    for c in plist:
        x0, y0 = pt(c.start_point)
        out.append("M" + num(x0, y0))
        px, py = x0, y0
        for seg in c.segments:
            if seg.is_corner:
                a, b = pt(seg.c), pt(seg.end_point)
                out.append("l" + num(a[0] - px, a[1] - py, b[0] - a[0], b[1] - a[1]))
                px, py = b
            else:
                a, b, e = pt(seg.c1), pt(seg.c2), pt(seg.end_point)
                out.append("c" + num(a[0] - px, a[1] - py, b[0] - px, b[1] - py, e[0] - px, e[1] - py))
                px, py = e
        out.append("z")
    return "".join(out)


def cut_icons(path, names):
    a = np.array(Image.open(path).convert("RGB")).astype(np.float32)
    ink, plate = layers(a)
    fg = (ink > .3) | (plate > .3)
    rows = split(fg.any(axis=1), 3)
    out = []
    k = 0
    for (y0, y1) in rows:
        cols = split(fg[y0:y1].any(axis=0), 6)
        for (x0, x1) in cols:
            sub = fg[y0:y1, x0:x1]
            ys, xs = np.where(sub)
            bx0, by0, bx1, by1 = x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1
            m = 10
            box = (bx0 - m, by0 - m, bx1 + m, by1 + m)
            out.append((names[k], box, ink[box[1]:box[3], box[0]:box[2]], plate[box[1]:box[3], box[0]:box[2]], (bx0 - box[0], by0 - box[1], bx1 - box[0], by1 - box[1])))
            k += 1
    return out


def main():
    n1, n2, out_json = sys.argv[1:4]
    items = cut_icons(n1, SHEET1) + cut_icons(n2, SHEET2)
    big = max(max(i[4][2] - i[4][0], i[4][3] - i[4][1]) for i in items)
    s = BOX / big
    res, total = {}, 0
    for name, box, ink, plate, tight in items:
        up = lambda arr: np.array(Image.fromarray(arr.astype(np.float32), "F").resize((arr.shape[1] * UP, arr.shape[0] * UP), Image.BICUBIC))
        ink_b = up(ink) > .5
        plate_b = up(plate) > .5
        plate_b = morph(morph(plate_b, 2 * 4 * UP + 1, True), 2 * 4 * UP + 1, False) | plate_b   # close the ink lines that cross the plate
        cx = (tight[0] + tight[2]) / 2.0 * UP
        cy = (tight[1] + tight[3]) / 2.0 * UP
        sc = s / UP                                                      # centre the tight box in the 256 square
        d_plate = path_d(trace(plate_b, 3.0), cx, cy, sc)
        d_ink = path_d(trace(ink_b, 2.5), cx, cy, sc)
        svg = '<path style="fill:var(--ic-plate,#F4C430);stroke:none;fill-rule:evenodd" d="%s"/><path style="stroke:none;fill-rule:evenodd" d="%s"/>' % (d_plate, d_ink)
        res[name] = svg
        for al in ALIAS.get(name, []):
            res[al] = '<use href="#ic-%s"/>' % name
        total += len(svg)
        print("%-24s %5d bytes" % (name, len(svg)))
    for n in FILL:
        res[n + "-fill"] = '<use href="#ic-%s"/>' % n                   # the drawing is already filled: the -fill weight is the same art
    json.dump(res, open(out_json, "w", encoding="utf-8"), separators=(",", ":"))
    print("%d icons, %d KB of path data -> %s" % (len(items), total // 1024, out_json))
    if "--debug" in sys.argv:
        dbg = sys.argv[sys.argv.index("--debug") + 1]
        os.makedirs(dbg, exist_ok=True)
        cells = "".join('<div><svg viewBox="0 0 256 256" width="96" height="96" style="background:#F6F0E4;color:#0B2A52">%s</svg><br><small>%s</small></div>' % (v, k) for k, v in res.items())
        open(os.path.join(dbg, "icons.html"), "w", encoding="utf-8").write('<meta charset="utf-8"><body style="display:flex;flex-wrap:wrap;gap:8px;font:11px sans-serif">' + cells)


main()
