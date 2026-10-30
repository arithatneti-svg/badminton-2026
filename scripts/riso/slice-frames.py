"""Cut the round Riso photo frames (art-source/riso-kit/G-round-frames.jpeg) into media/riso/ring-<colour>-<n>.webp.

usage: python scripts/riso/slice-frames.py <G sheet> <media dir>   (prints the opening geometry as json)

The flat green #00FF00 in the middle is keyed out, and so is every white pocket inside the ring (the page / the photo shows through
up to the ink). The photo sits under the ring; the css places the ring so that the opening (area-equivalent diameter d, centre cx,cy
in the piece's pixels) fits the photo box: see css/paper.css 'player faces'.
"""
import os, sys, json
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_lib import blobs, crop_piece, unmultiply, trim

sheet, media = sys.argv[1:3]
im = Image.open(sheet).convert("RGB")
bs = blobs(im, bg_thresh=225, grow=10, min_area=20000)
bs.sort(key=lambda p: (round((p[0][1] + p[0][3]) / 2 / 600), (p[0][0] + p[0][2]) / 2))
assert len(bs) == 6, len(bs)
names = ["ring-red-1", "ring-blue-1", "ring-red-2", "ring-blue-2", "ring-red-3", "ring-blue-3"]
geo = {}
for p, n in zip(bs, names):
    c = np.array(crop_piece(im, p, 14)).astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    green = (g > 170) & (r < 120) & (b < 120)
    # the opening: the biggest green blob (before it is whitened)
    ys, xs = np.where(green)
    area = green.sum()
    cx, cy = xs.mean(), ys.mean()
    d = 2 * (area / np.pi) ** 0.5
    # whiten green plus a 3 px skirt (anti-aliased fringe), then de-spill what is left
    pad = np.pad(green, 3)
    skirt = np.zeros_like(green)
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            if dx * dx + dy * dy <= 9:
                skirt |= pad[3 + dy:3 + dy + green.shape[0], 3 + dx:3 + dx + green.shape[1]]
    c[skirt & (g > r + 18) & (g > b + 18)] = 255
    c[green] = 255
    spill = (g > r + 18) & (g > b + 18) & ~skirt
    c[..., 1][spill] = ((r + b) // 2)[spill]
    pieceimg = Image.fromarray(c.astype(np.uint8))
    rgba = unmultiply(pieceimg)
    al = np.array(rgba)[..., 3]
    yy, xx = np.where(al > 6)
    x0, y0, x1, y1 = max(0, xx.min() - 2), max(0, yy.min() - 2), min(al.shape[1], xx.max() + 3), min(al.shape[0], yy.max() + 3)
    rgba = rgba.crop((x0, y0, x1, y1))
    W, H = rgba.size
    s = 560 / W
    out = rgba.resize((560, round(H * s)), Image.LANCZOS)
    path = os.path.join(media, "riso", n + ".webp")
    out.save(path, "WEBP", quality=88, method=6, alpha_quality=100)
    geo[n] = {"w": 560, "h": out.height, "d": round(d * s, 1), "cx": round((cx - x0) * s, 1), "cy": round((cy - y0) * s, 1)}
    print(n, out.size, geo[n], os.path.getsize(path) // 1024, "KB")
json.dump(geo, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "frames.json"), "w"), indent=1)
