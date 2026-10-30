"""Cut the owner's Riso kit sheets (art-source/riso-kit) into the app's media/riso/ files.

usage: python scripts/riso/slice-kit.py <riso-kit dir> <media dir>

A  lines + markers (ink on white)   -> line-*.webp, crayon-red, squiggle-navy, marker-*-1/2   (colour-to-alpha: multiplies onto any paper)
D  courts + marks                   -> court-*.webp (rotated level), arrow-*.webp, circle, scribble, check, cross, star-*
C1 torn paper strips (on grey)      -> tear-red-paper / tear-red-ink / tear-blue-*   (paper = alpha mask the css fills with the page colour)
E  grain tiles                      -> grain-paper.webp (seamless, near white: multiply), grain-ink.webp (seamless navy halftone, alpha)
"""
import os, sys, math
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_lib import blobs, crop_piece, unmultiply, solid, trim

kit, media = [a for a in sys.argv[1:] if not a.startswith('--')][:2]
out = os.path.join(media, "riso")
os.makedirs(out, exist_ok=True)
total = 0


# only what the app uses is written (pass --all to cut every piece of the kit into media/riso for experiments)
SHIP = {"line-red", "line-blue", "marker-yellow-1", "marker-yellow-2", "arrow-red", "arrow-blue", "court-blue",
        "tear-red-paper", "tear-red-ink", "grain-paper", "grain-ink"}
ALL = "--all" in sys.argv


def save(im, name, q=88):
    global total
    if not ALL and name not in SHIP:
        return
    p = os.path.join(out, name + ".webp")
    im.save(p, "WEBP", quality=q, method=6, alpha_quality=100)
    total += os.path.getsize(p)
    print(f"{name:22s} {im.size}  {os.path.getsize(p) // 1024} KB")


def crop(im, b, m=10):
    return im.crop((max(0, b[0] - m), max(0, b[1] - m), min(im.width, b[2] + m), min(im.height, b[3] + m)))


# ---- A: lines and markers ----
A = Image.open(os.path.join(kit, "A-lines-and-markers.jpeg")).convert("RGB")
bs = blobs(A)
bs.sort(key=lambda p: (round((p[0][1] + p[0][3]) / 2 / 150), (p[0][0] + p[0][2]) / 2))
names = ["line-red", "line-blue", "line-navy", "line-yellow", "crayon-red", "squiggle-navy",
         "marker-yellow-1", "marker-yellow-2", "marker-red-1", "marker-red-2", "marker-blue-1", "marker-blue-2"]
for b, n in zip(bs, names):
    im = trim(unmultiply(crop_piece(A, b)))
    w = 1400 if n.startswith(("line", "crayon", "squiggle")) else 700
    if im.width > w:
        im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    save(im, n)

# ---- D: courts and marks ----
D = Image.open(os.path.join(kit, "D-courts-and-marks.jpeg")).convert("RGB")
bs = blobs(D)
bs.sort(key=lambda p: (round((p[0][1] + p[0][3]) / 2 / 150), (p[0][0] + p[0][2]) / 2))
by = {i: b for i, b in enumerate(bs)}
# index by position found on the sheet (see the listing in the commit notes): 0 red arrow, 1 blue arrow, 2 star, 3 navy court outline,
# 4 red court, 5 blue court, 6 circle, 7 blue up arrow, 8 check, 9 cross, 10 star 2, 11 scribble
roles = {0: ("arrow-red", "u"), 1: ("arrow-blue", "u"), 2: ("star-yellow-1", "u"), 3: ("court-lines", "u"), 4: ("court-red", "s"),
         5: ("court-blue", "s"), 6: ("circle-navy", "u"), 7: ("arrow-blue-up", "u"), 8: ("check-red", "u"), 9: ("cross-blue", "u"),
         10: ("star-yellow-2", "u"), 11: ("scribble-navy", "u")}
for i, (n, mode) in roles.items():
    c = crop_piece(D, by[i])
    im = trim(solid(c) if mode == "s" else unmultiply(c))
    if mode == "s":  # level the court: its long axis follows the principal axis of the opaque pixels
        al = np.array(im)[..., 3] > 128
        ys, xs = np.where(al)
        cov = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
        w, v = np.linalg.eigh(cov)
        ang = math.degrees(math.atan2(v[1, 1], v[0, 1]))
        ang = ((ang + 90) % 180) - 90
        im = trim(im.rotate(ang, expand=True, resample=Image.BICUBIC))
    mx = {"court-lines": 1000, "court-red": 900, "court-blue": 900}.get(n, 420)
    if max(im.size) > mx:
        s = mx / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    save(im, n)

# ---- C1: torn paper strips (paper on grey) ----
C = Image.open(os.path.join(kit, "C1-torn-paper-strips-on-grey.jpeg")).convert("RGB")
ca = np.array(C).astype(int)
H, W = ca.shape[:2]
nongrey = np.abs(ca - 128).max(axis=2) > 22
rows = nongrey[:, 200:2500].mean(axis=1) > 0.2
bands, s = [], None
for y, v in enumerate(rows):
    if v and s is None: s = y
    if not v and s is not None:
        if y - s > 80: bands.append((s, y))
        s = None
print("strips:", bands)
for idx, nm in ((0, "tear-red"), (1, "tear-blue")):
    y0, y1 = bands[idx]
    x0, x1 = 160, 2590
    sub = ca[y0:y1 + 12, x0:x1]
    ng = np.abs(sub - 128).max(axis=2) > 22
    # ink = saturated red / blue pixels; paper = the rest of the non-grey pixels
    mx, mn = sub.max(axis=2), sub.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)
    ink_a = np.clip((sat - 0.22) / 0.4, 0, 1) * ng
    paper = ng
    # keep only the torn lower part: from 40 px above the highest tear point to the lowest
    col_bottom = np.array([np.where(ng[:, x])[0].max() if ng[:, x].any() else 0 for x in range(ng.shape[1])])
    top = max(0, int(col_bottom.min()) - 46)
    bot = int(col_bottom.max()) + 6
    pa = (paper[top:bot] * 255).astype(np.uint8)
    # soft edge for the paper mask
    mask = np.dstack([np.full(pa.shape + (3,), 255, np.uint8), pa])
    save(Image.fromarray(mask, "RGBA").resize((1400, round(pa.shape[0] * 1400 / pa.shape[1])), Image.LANCZOS), nm + "-paper", 90)
    ink = np.dstack([sub[top:bot].astype(np.uint8), (ink_a[top:bot] * 255).astype(np.uint8)])
    save(Image.fromarray(ink, "RGBA").resize((1400, round(pa.shape[0] * 1400 / pa.shape[1])), Image.LANCZOS), nm + "-ink", 90)


# ---- E: grain tiles (made seamless with a cross-fade through a half-shifted copy) ----
def seamless(a):
    h, w = a.shape[:2]
    for axis, n in ((1, w), (0, h)):
        t = np.arange(n)
        m = np.sin(np.pi * t / n) ** 2
        m = m[None, :, None] if axis == 1 else m[:, None, None]
        a = a * m + np.roll(a, n // 2, axis=axis) * (1 - m)
    return a


E = Image.open(os.path.join(kit, "E-paper-and-ink-grain-tiles.jpeg")).convert("RGB")
paper = np.array(E.crop((300, 280, 1300, 1280))).astype(float)
paper = seamless(paper)
paper = np.clip(paper / np.percentile(paper.reshape(-1, 3), 50, axis=0) * 250, 0, 255)   # near white: only fibres and tone remain
save(Image.fromarray(paper.astype(np.uint8)).resize((640, 640), Image.LANCZOS), "grain-paper", 80)
ink = np.array(E.crop((1560, 280, 2560, 1280))).astype(float)
ink = seamless(ink)
dark = np.clip((255 - ink.min(axis=2)) / 200.0, 0, 1)
navy = np.dstack([np.full(dark.shape, 11), np.full(dark.shape, 42), np.full(dark.shape, 82), dark * 255]).astype(np.uint8)
save(Image.fromarray(navy, "RGBA").resize((640, 640), Image.LANCZOS), "grain-ink", 80)
print(f"{total // 1024} KB")
