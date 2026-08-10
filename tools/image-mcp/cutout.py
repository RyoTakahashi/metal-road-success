#!/usr/bin/env python3
"""Background-removal pass: turn generated (opaque) renders into transparent
standing-sprite PNGs, matching the base sprites (RGBA with alpha).

    python3 tools/image-mcp/cutout.py <in1.jpg> <out1.png> [<in2> <out2> ...]

Uses rembg (u2net). Also trims fully-transparent margins and re-pads so the
character sits centred with feet near the bottom edge, like the base art.
"""
import sys
from rembg import remove, new_session
from PIL import Image

def cutout(session, src, dst):
    img = Image.open(src).convert("RGBA")
    out = remove(img, session=session)
    # Trim transparent border, then pad to a consistent vertical sprite frame.
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    w, h = out.size
    # target ratio ~ 720:1120 (9:14); pad width to that around the subject.
    target_w = max(w, int(h * 720 / 1120))
    canvas = Image.new("RGBA", (target_w, h), (0, 0, 0, 0))
    canvas.paste(out, ((target_w - w) // 2, 0), out)
    canvas.save(dst)
    print(f"  ✓ {dst}  {canvas.size}")

def main():
    args = sys.argv[1:]
    if not args or len(args) % 2:
        print("usage: cutout.py <in> <out> [<in> <out> ...]"); sys.exit(1)
    session = new_session("u2net")
    for i in range(0, len(args), 2):
        cutout(session, args[i], args[i + 1])

if __name__ == "__main__":
    main()
