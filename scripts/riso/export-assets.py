"""Export the shipped Riso art as transparent WebP into media/.

usage: python scripts/riso/export-assets.py <pieces_dir> <mascot_dir> <media_dir>

  pieces_dir  output of scripts/riso/slice-sheet.py (piece-NN.png, GROW=1)
  mascot_dir  the star-mascot tiles (calm_NN.png, white sticker border already stripped)
  media_dir   the repo's media/ folder -> media/riso/<name>.webp and media/mascot/<name>.webp

Only pieces that the app uses are exported (see the maps below), so the budget stays small.
"""
import os, sys
from PIL import Image

pieces, mascots, media = sys.argv[1:4]

RISO = {  # piece number on the sheet -> file name (only what the app uses; the new Riso kit in art-source/riso-kit replaces most of it)
    5: "shuttle-swoosh", 6: "shuttle-streak", 19: "brush-red", 21: "brush-blue",
    16: "arrow-red", 25: "arrow-blue", 44: "court-view",
}
MASCOT = {  # calm_NN -> role name used by dsMascot()
    1: "loading", 5: "champion", 7: "search",
    9: "rising", 10: "offline", 12: "admin", 13: "streak", 14: "reward", 15: "replay",
}


def save(im, path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6, alpha_quality=100)
    return os.path.getsize(path)


total = 0
for n, name in RISO.items():
    im = Image.open(os.path.join(pieces, f"piece-{n:02d}.png")).convert("RGBA")
    total += save(im, os.path.join(media, "riso", name + ".webp"), 86)
# thin strokes cut from the middle of the brushes: the marker mark beside section titles (css .section-title::after)
LINES = {"brush-red-line": "brush-red", "brush-blue-line": "brush-blue"}
for name, src_name in LINES.items():
    im = Image.open(os.path.join(media, "riso", src_name + ".webp")).convert("RGBA")
    h = im.height
    total += save(im.crop((0, int(h * 0.28), im.width, int(h * 0.78))), os.path.join(media, "riso", name + ".webp"), 86)
for n, name in MASCOT.items():
    im = Image.open(os.path.join(mascots, f"calm_{n:02d}.png")).convert("RGBA")
    total += save(im, os.path.join(media, "mascot", name + ".webp"), 88)
print(f"{len(RISO)} riso + {len(MASCOT)} mascot files, {total / 1024:.0f} KB")
