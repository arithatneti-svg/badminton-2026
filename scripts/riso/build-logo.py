"""Cut the logo mark and wordmark out of the owner's sheets and rebuild the app icons.

usage: python scripts/riso/build-logo.py <riso-kit dir> <repo root>

K-logo-shuttle-marks.jpeg  piece 1 (the shuttlecock on its own)  -> media/logo/mark.webp + icons/*.png
M-logo-wordmark.jpeg       the one-line "SPORTS DAY 2026" with the red underline -> media/logo/wordmark.webp
Icons: icon-* = the mark on marker yellow, umpire-* = the mark on a cream plate over navy; *-maskable-512 are full-bleed with the mark
inside the 80 % safe zone, the plain ones have rounded corners.
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_lib import blobs, crop_piece, unmultiply, trim

kit, root = sys.argv[1:3]
logo_dir = os.path.join(root, "media", "logo")
os.makedirs(logo_dir, exist_ok=True)


def piece(sheet, idx, name):
    im = Image.open(os.path.join(kit, sheet)).convert("RGB")
    bs = blobs(im, bg_thresh=225, grow=10, min_area=30000)
    bs.sort(key=lambda p: (round((p[0][1] + p[0][3]) / 2 / 600), (p[0][0] + p[0][2]) / 2))
    print(name, "pieces:", len(bs))
    return trim(unmultiply(crop_piece(im, bs[idx], 14)), 4)


mark = piece("K-logo-shuttle-marks.jpeg", 0, "mark")
side = max(mark.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.alpha_composite(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
sq.resize((512, 512), Image.LANCZOS).save(os.path.join(logo_dir, "mark.webp"), "WEBP", quality=90, method=6, alpha_quality=100)

word = piece("M-logo-wordmark.jpeg", 0, "wordmark")
w = 900
word.resize((w, round(word.height * w / word.width)), Image.LANCZOS).save(os.path.join(logo_dir, "wordmark.webp"), "WEBP", quality=90, method=6, alpha_quality=100)
print("wordmark", word.size, "ratio", round(word.width / word.height, 2))


def icon(size, bg, plate, maskable, scale):
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if maskable:
        d.rectangle((0, 0, size, size), fill=bg)
    else:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * .22), fill=bg)
    if plate:
        r = size * (.34 if maskable else .38)
        d.ellipse((size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r), fill=plate)
    m = sq.resize((round(size * scale), round(size * scale)), Image.LANCZOS)
    base.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return base


YEL, NAVY, CREAM = (244, 196, 48, 255), (11, 42, 82, 255), (246, 240, 228, 255)
for name, size, mask in (("icon-192", 192, False), ("icon-512", 512, False), ("icon-maskable-512", 512, True)):
    icon(size, YEL, None, mask, .66 if mask else .72).save(os.path.join(root, "icons", name + ".png"), optimize=True)
for name, size, mask in (("umpire-192", 192, False), ("umpire-512", 512, False), ("umpire-maskable-512", 512, True)):
    icon(size, NAVY, CREAM, mask, .5 if mask else .56).save(os.path.join(root, "icons", name + ".png"), optimize=True)
print("icons written")
