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

RISO = {  # piece number on the sheet -> file name
    1: "shuttle-red", 2: "shuttle-blue", 5: "shuttle-swoosh", 6: "shuttle-streak",
    7: "racket-swoosh", 8: "racket-smash", 11: "racket-wide",
    19: "brush-red", 21: "brush-blue", 23: "brush-sweep",
    16: "arrow-red", 25: "arrow-blue", 27: "chevrons",
    28: "rays-lines", 30: "rays-burst", 33: "halftone-red", 35: "halftone-blue",
    20: "torn-red", 22: "torn-blue-sm", 24: "torn-blue", 26: "torn-mix", 34: "torn-red-sm",
    36: "court-blue", 37: "court-red", 44: "court-view", 38: "net",
}
MASCOT = {  # calm_NN -> role name used by dsMascot()
    1: "loading", 2: "waiting", 3: "win", 4: "error", 5: "champion", 6: "live", 7: "search",
    8: "conflict", 9: "rising", 10: "offline", 12: "admin", 13: "streak", 14: "reward", 15: "replay",
}


def save(im, path, q):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6, alpha_quality=100)
    return os.path.getsize(path)


total = 0
for n, name in RISO.items():
    im = Image.open(os.path.join(pieces, f"piece-{n:02d}.png")).convert("RGBA")
    total += save(im, os.path.join(media, "riso", name + ".webp"), 86)
for n, name in MASCOT.items():
    im = Image.open(os.path.join(mascots, f"calm_{n:02d}.png")).convert("RGBA")
    total += save(im, os.path.join(media, "mascot", name + ".webp"), 88)
print(f"{len(RISO)} riso + {len(MASCOT)} mascot files, {total / 1024:.0f} KB")
