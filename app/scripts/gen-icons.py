#!/usr/bin/env python3
"""Generate the 30 Days English visual identity: a dot-matrix "30" glyph
(Nothing-OS dot aesthetic) in white on pure black, with a single red accent dot
as a full-stop. One mark, consistent across favicon / PWA / apple-touch / maskable.

Run: python3 scripts/gen-icons.py   (requires Pillow)
Outputs to app/public/.
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "public"))

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
RED = (214, 0, 28, 255)

# 5x7 dot-matrix bitmaps
GLYPHS = {
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
}


def draw_dot_matrix(draw, text, box, color, dot_ratio=0.40):
    """Render `text` as a dot-matrix inside box=(x0,y0,x1,y1), keeping aspect."""
    cols_per = 5
    gap = 1
    n = len(text)
    total_cols = n * cols_per + (n - 1) * gap
    rows = 7
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0
    cell = min(bw / total_cols, bh / rows)
    grid_w = total_cols * cell
    grid_h = rows * cell
    ox = bx0 + (bw - grid_w) / 2
    oy = by0 + (bh - grid_h) / 2
    r = cell * dot_ratio
    for ci, ch in enumerate(text):
        pat = GLYPHS[ch]
        col_off = ci * (cols_per + gap)
        for ry in range(rows):
            for rx in range(cols_per):
                if pat[ry][rx] == "1":
                    cx = ox + (col_off + rx + 0.5) * cell
                    cy = oy + (ry + 0.5) * cell
                    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    # red full-stop dot, baseline-right of the glyph
    dot_r = cell * 0.55
    dcx = ox + grid_w + cell * 0.9
    dcy = oy + grid_h - dot_r
    if dcx + dot_r > bx1:  # keep inside; nudge onto baseline under last glyph
        dcx = ox + grid_w - dot_r
        dcy = oy + grid_h + cell * 0.6
    draw.ellipse([dcx - dot_r, dcy - dot_r, dcx + dot_r, dcy + dot_r], fill=RED)
    return cell


def make_icon(size, pad_ratio=0.20, grid=True):
    img = Image.new("RGBA", (size, size), BLACK)
    d = ImageDraw.Draw(img)
    if grid:
        # subtle Nothing dot-grid
        step = max(12, size // 22)
        gr = max(1, size // 340)
        for y in range(step, size, step):
            for x in range(step, size, step):
                d.ellipse([x - gr, y - gr, x + gr, y + gr], fill=(255, 255, 255, 12))
    pad = size * pad_ratio
    draw_dot_matrix(d, "30", (pad, pad, size - pad, size - pad), WHITE)
    return img


def make_maskable(size):
    # Full-bleed black; glyph confined to the ~80% safe zone (no grid for clarity).
    img = Image.new("RGBA", (size, size), BLACK)
    d = ImageDraw.Draw(img)
    pad = size * 0.30
    draw_dot_matrix(d, "30", (pad, pad, size - pad, size - pad), WHITE)
    return img


def save(img, name):
    path = os.path.join(PUBLIC, name)
    img.save(path)
    print("wrote", path, img.size)


if __name__ == "__main__":
    save(make_icon(512, pad_ratio=0.22, grid=True), "pwa-512.png")
    save(make_icon(192, pad_ratio=0.22, grid=True), "pwa-192.png")
    save(make_maskable(512), "maskable-512.png")
    save(make_icon(180, pad_ratio=0.20, grid=False), "apple-touch-icon.png")
    save(make_icon(32, pad_ratio=0.14, grid=False), "favicon-32.png")
    print("done")
