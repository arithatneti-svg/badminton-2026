"""Cut the Riso asset sheet (transparent PNG/WebP) into one file per piece.

usage: python scripts/riso/slice-sheet.py <sheet.webp> <out_dir> [--list]

Pieces are the connected blobs of the alpha channel (grown a little so ink fragments stay with
their object). Each piece is cropped to its bounding box and written as <out_dir>/piece-NN.png
in reading order (rows by y, then x). --list prints the boxes only.
"""
import sys, os, json
from collections import deque
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
list_only = "--list" in sys.argv
GROW = int(os.environ.get("GROW", "5"))
im = Image.open(src).convert("RGBA")
a = np.array(im)
H, W = a.shape[:2]
mask = a[..., 3] > 14

h2, w2 = H // 2, W // 2
low = mask[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).any(axis=(1, 3))
pad = np.pad(low, GROW)
dil = np.zeros_like(low)
for dy in range(-GROW, GROW + 1):
    for dx in range(-GROW, GROW + 1):
        if dx * dx + dy * dy <= GROW * GROW:
            dil |= pad[GROW + dy:GROW + dy + h2, GROW + dx:GROW + dx + w2]

lab = np.zeros((h2, w2), np.int32)
n = 0
for y0 in range(h2):
    for x0 in range(w2):
        if dil[y0, x0] and not lab[y0, x0]:
            n += 1
            lab[y0, x0] = n
            q = deque([(y0, x0)])
            while q:
                cy, cx = q.popleft()
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h2 and 0 <= nx < w2 and dil[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))

full = np.kron(lab, np.ones((2, 2), np.int32))
fl = np.zeros((H, W), np.int32)
fl[:full.shape[0], :full.shape[1]] = full
pieces = []
for l in range(1, n + 1):
    m = (fl == l) & mask
    if m.sum() < 400:
        continue
    ys, xs = np.where(m)
    pieces.append((l, xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, int(m.sum())))

# reading order: bucket by row band (centre y / 110), then x
pieces.sort(key=lambda p: (round(((p[2] + p[4]) / 2) / 120), (p[1] + p[3]) / 2))
info = []
for i, (l, x0, y0, x1, y1, area) in enumerate(pieces, 1):
    info.append({"n": i, "box": [int(x0), int(y0), int(x1), int(y1)], "size": [int(x1 - x0), int(y1 - y0)], "area": area})
    if not list_only:
        os.makedirs(out, exist_ok=True)
        t = a[y0:y1, x0:x1].copy()
        t[~((fl[y0:y1, x0:x1] == l) & (a[y0:y1, x0:x1, 3] > 0))] = 0
        Image.fromarray(t).save(os.path.join(out, f"piece-{i:02d}.png"))
print(json.dumps(info))
