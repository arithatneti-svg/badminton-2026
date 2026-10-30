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

RISO = {  # the first sheet: only the two shuttle streaks are still used; everything else comes from scripts/riso/slice-kit.py (the owner's Riso kit)
    5: "shuttle-swoosh", 6: "shuttle-streak",
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
for n, name in MASCOT.items():
    im = Image.open(os.path.join(mascots, f"calm_{n:02d}.png")).convert("RGBA")
    total += save(im, os.path.join(media, "mascot", name + ".webp"), 88)
print(f"{len(RISO)} riso + {len(MASCOT)} mascot files, {total / 1024:.0f} KB")
