"""Shared helpers for cutting the Riso kit sheets (art-source/riso-kit)."""
from collections import deque
import numpy as np
from PIL import Image


def blobs(img_rgb, bg_thresh=225, grow=8, min_area=1500, scale=2):
    """Connected blobs of 'not paper' pixels (grown so ink specks stay with their piece) -> list of (x0,y0,x1,y1,mask_full)."""
    a = np.array(img_rgb.convert("RGB")).astype(int)
    H, W = a.shape[:2]
    fg = a.min(axis=2) < bg_thresh
    h2, w2 = H // scale, W // scale
    low = fg[:h2 * scale, :w2 * scale].reshape(h2, scale, w2, scale).any(axis=(1, 3))
    r = grow // scale
    pad = np.pad(low, r)
    dil = np.zeros_like(low)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                dil |= pad[r + dy:r + dy + h2, r + dx:r + dx + w2]
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
    out = []
    for l in range(1, n + 1):
        ys, xs = np.where(lab == l)
        if len(ys) * scale * scale < min_area:
            continue
        b = (int(xs.min() * scale), int(ys.min() * scale), int((xs.max() + 1) * scale), int((ys.max() + 1) * scale))
        m = np.kron(lab == l, np.ones((scale, scale), bool))
        full = np.zeros((H, W), bool)
        full[:m.shape[0], :m.shape[1]] = m
        out.append((b, full))
    return out


def crop_piece(img, piece, m=10):
    """Crop a blob's bounding box and paint everything that belongs to a neighbouring piece with the paper colour."""
    (x0, y0, x1, y1), full = piece
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(img.width, x1 + m), min(img.height, y1 + m)
    a = np.array(img.convert("RGB"))
    paper = np.median(a[:6].reshape(-1, 3), axis=0).astype(np.uint8)
    c = a[y0:y1, x0:x1].copy()
    c[~full[y0:y1, x0:x1]] = paper
    return Image.fromarray(c)


def unmultiply(crop_rgb, bg=(252, 252, 250), floor=0.04):
    """Ink on white -> RGBA where white becomes transparent (colour-to-alpha), so the piece multiplies onto any paper."""
    a = np.array(crop_rgb.convert("RGB")).astype(float)
    dark = 255.0 - a.min(axis=2)
    top = max(np.percentile(dark, 99.5), 40.0)
    alpha = np.clip(dark / top, 0, 1)
    alpha[alpha < floor] = 0
    al = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((a - 255.0 * (1 - al)) / al, 0, 255)
    return Image.fromarray(np.dstack([col.astype(np.uint8), (alpha * 255).astype(np.uint8)]), "RGBA")


def solid(crop_rgb, near=26, soft=20.0):
    """Filled shape on white (a court): the white outside becomes transparent with a soft edge, enclosed whites stay."""
    a = np.array(crop_rgb.convert("RGB")).astype(int)
    h, w = a.shape[:2]
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3)]), axis=0)
    d = np.abs(a - bg).max(axis=2)
    nearbg = d <= near
    ext = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if nearbg[y, x] and not ext[y, x]:
                ext[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if nearbg[y, x] and not ext[y, x]:
                ext[y, x] = True; q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < h and 0 <= nx < w and nearbg[ny, nx] and not ext[ny, nx]:
                ext[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(ext, np.clip((d - 6) / soft, 0, 1), 1.0)
    return Image.fromarray(np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)]), "RGBA")


def trim(img, pad=2):
    al = np.array(img)[..., 3]
    ys, xs = np.where(al > 6)
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad)))
