"""Cut the 10-pose pastel star sheet (cream background, labels underneath) into transparent WebP files.

usage: python scripts/riso/slice-pastel.py <sheet.jpeg> <media_dir>   -> media/mascot/<role>.webp
Figures are the blobs of non-background pixels above the label rows; the cream that touches the outside becomes
transparent (soft edge), cream that is enclosed (eye whites, racket mesh) stays.
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

src, media = sys.argv[1:3]
ROLES = ["serve", "smash", "dive", "block", "victory", "miss", "flick", "drop", "tangled", "break"]
im = Image.open(src).convert("RGB")
a = np.array(im).astype(int)
H, W = a.shape[:2]
bg = np.median(a[:40, :40].reshape(-1, 3), axis=0)
dist = np.abs(a - bg).max(axis=2)
fg = dist > 34
fg[int(H * 0.575):int(H * 0.6) + 1, :] = False
# label rows: first row labels sit at 42-51 % of the height, second at 89-97 %
fg[int(H * .415):int(H * .525)] = False
fg[int(H * .875):] = False
S = 2
h2, w2 = H // S, W // S
low = fg[:h2 * S, :w2 * S].reshape(h2, S, w2, S).any(axis=(1, 3))
R = 6
pad = np.pad(low, R)
dil = np.zeros_like(low)
for dy in range(-R, R + 1):
    for dx in range(-R, R + 1):
        if dx * dx + dy * dy <= R * R:
            dil |= pad[R + dy:R + dy + h2, R + dx:R + dx + w2]
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
sizes = np.bincount(lab.ravel()); sizes[0] = 0
keep = [int(i) for i in np.argsort(-sizes)[:10]]
boxes = []
for l in keep:
    ys, xs = np.where(lab == l)
    boxes.append((l, xs.min() * S, ys.min() * S, (xs.max() + 1) * S, (ys.max() + 1) * S))
boxes.sort(key=lambda b: (0 if (b[2] + b[4]) / 2 < H * .5 else 1, (b[1] + b[3]) / 2))
assert len(boxes) == 10, len(boxes)
os.makedirs(os.path.join(media, "mascot"), exist_ok=True)
for role, (l, x0, y0, x1, y1) in zip(ROLES, boxes):
    m = 6
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    crop = a[y0:y1, x0:x1]
    d = dist[y0:y1, x0:x1]
    h, w = d.shape
    near = d <= 30
    ext = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not ext[y, x]:
                ext[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not ext[y, x]:
                ext[y, x] = True; q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True; q.append((ny, nx))
    # small enclosed cream pockets low in the figure (between the legs) are background too
    rest = near & ~ext
    seen = np.zeros((h, w), bool)
    for y0 in range(h):
        for x0 in range(w):
            if rest[y0, x0] and not seen[y0, x0]:
                comp = [(y0, x0)]; seen[y0, x0] = True; q = deque([(y0, x0)])
                while q:
                    cy, cx = q.popleft()
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and rest[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; comp.append((ny, nx)); q.append((ny, nx))
                cy_mean = sum(c[0] for c in comp) / len(comp)
                if len(comp) < 6000 and cy_mean > 0.6 * h:   # between the legs only: eye whites sit higher and must stay opaque
                    for cy, cx in comp:
                        ext[cy, cx] = True
    alpha = np.where(ext, np.clip((d - 5) / 24.0, 0, 1), 1.0)
    out = np.dstack([crop.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(out, "RGBA")
    if img.width > 380:
        img = img.resize((380, round(img.height * 380 / img.width)), Image.LANCZOS)
    p = os.path.join(media, "mascot", role + ".webp")
    img.save(p, "WEBP", quality=88, method=6, alpha_quality=100)
    print(role, img.size, os.path.getsize(p) // 1024, "KB")
