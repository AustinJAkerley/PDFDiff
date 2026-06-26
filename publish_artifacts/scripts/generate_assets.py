#!/usr/bin/env python3
"""Generate Chrome Web Store assets for PDF Diff.

Pure standard-library image generation (no Pillow/cairo required) so the assets
can be regenerated in any environment that has Python 3.

Outputs (relative to publish_artifacts/):
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  icons/icon-128.png
  promo/promo-tile-440x280.png      (Chrome Web Store small promo tile)
  promo/marquee-1400x560.png        (Chrome Web Store marquee promo)
  screenshots/screenshot-1-*.png    (1280x800 placeholders to replace with
  screenshots/screenshot-2-*.png     real captures of the running extension)

Brand colors mirror the in-app diff styling:
  red   = removed text  (#e5484d)
  green = added text     (#30a46c)
  ink   = document text  (#1f2933)
"""

from __future__ import annotations

import os
import struct
import zlib

# ---------------------------------------------------------------------------
# Palette
# ---------------------------------------------------------------------------
BG_DEEP = (0x12, 0x20, 0x33)    # deep slate
BRAND = (0x2F, 0x6F, 0xED)      # brand blue
BRAND_DARK = (0x1B, 0x4D, 0xB5)
PAPER = (0xFF, 0xFF, 0xFF)
PAPER_SHADE = (0xE9, 0xED, 0xF2)
INK = (0x1F, 0x29, 0x33)
INK_SOFT = (0x9A, 0xA5, 0xB1)
RED = (0xE5, 0x48, 0x4D)
GREEN = (0x30, 0xA4, 0x6C)
WHITE = (0xFF, 0xFF, 0xFF)


class Canvas:
    """A simple RGBA canvas with alpha compositing and supersampling helpers."""

    def __init__(self, w: int, h: int, bg=(0, 0, 0, 0)):
        self.w = w
        self.h = h
        self.px = bytearray()
        r, g, b, a = _rgba(bg)
        for _ in range(w * h):
            self.px += bytes((r, g, b, a))

    def _idx(self, x: int, y: int) -> int:
        return (y * self.w + x) * 4

    def blend(self, x: int, y: int, color, alpha: float = 1.0):
        if x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        r, g, b, a = _rgba(color)
        alpha *= a / 255.0
        if alpha <= 0:
            return
        i = self._idx(x, y)
        dr, dg, db, da = self.px[i], self.px[i + 1], self.px[i + 2], self.px[i + 3]
        out_a = alpha + (da / 255.0) * (1 - alpha)
        if out_a <= 0:
            return
        nr = (r * alpha + dr * (da / 255.0) * (1 - alpha)) / out_a
        ng = (g * alpha + dg * (da / 255.0) * (1 - alpha)) / out_a
        nb = (b * alpha + db * (da / 255.0) * (1 - alpha)) / out_a
        self.px[i] = int(nr + 0.5)
        self.px[i + 1] = int(ng + 0.5)
        self.px[i + 2] = int(nb + 0.5)
        self.px[i + 3] = int(out_a * 255 + 0.5)

    def fill_rect(self, x0, y0, x1, y1, color, alpha=1.0):
        for y in range(max(0, int(y0)), min(self.h, int(y1))):
            for x in range(max(0, int(x0)), min(self.w, int(x1))):
                self.blend(x, y, color, alpha)

    def rounded_rect(self, x0, y0, x1, y1, radius, color, alpha=1.0):
        x0, y0, x1, y1 = float(x0), float(y0), float(x1), float(y1)
        r = float(radius)
        for y in range(max(0, int(y0)), min(self.h, int(round(y1)))):
            for x in range(max(0, int(x0)), min(self.w, int(round(x1)))):
                cov = _rounded_coverage(x + 0.5, y + 0.5, x0, y0, x1, y1, r)
                if cov > 0:
                    self.blend(x, y, color, alpha * cov)

    def line(self, x0, y0, x1, y1, color, width=1.0, alpha=1.0):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for s in range(steps + 1):
            t = s / steps
            cx = x0 + (x1 - x0) * t
            cy = y0 + (y1 - y0) * t
            self._dot(cx, cy, width / 2.0, color, alpha)

    def _dot(self, cx, cy, rad, color, alpha=1.0):
        for y in range(int(cy - rad - 1), int(cy + rad + 2)):
            for x in range(int(cx - rad - 1), int(cx + rad + 2)):
                d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
                cov = max(0.0, min(1.0, rad - d + 0.5))
                if cov > 0:
                    self.blend(x, y, color, alpha * cov)

    def downsample(self, factor: int) -> "Canvas":
        out = Canvas(self.w // factor, self.h // factor)
        for y in range(out.h):
            for x in range(out.w):
                r = g = b = a = 0
                for dy in range(factor):
                    for dx in range(factor):
                        i = self._idx(x * factor + dx, y * factor + dy)
                        r += self.px[i]
                        g += self.px[i + 1]
                        b += self.px[i + 2]
                        a += self.px[i + 3]
                n = factor * factor
                j = out._idx(x, y)
                out.px[j] = r // n
                out.px[j + 1] = g // n
                out.px[j + 2] = b // n
                out.px[j + 3] = a // n
        return out

    def text(self, x, y, s, color, scale=1, spacing=1):
        cx = x
        for ch in s.upper():
            glyph = FONT.get(ch, FONT[" "])
            for row, bits in enumerate(glyph):
                for col in range(5):
                    if bits & (1 << (4 - col)):
                        self.fill_rect(
                            cx + col * scale,
                            y + row * scale,
                            cx + col * scale + scale,
                            y + row * scale + scale,
                            color,
                        )
            cx += (5 + spacing) * scale
        return cx

    def text_width(self, s, scale=1, spacing=1):
        return len(s) * (5 + spacing) * scale

    def write_png(self, path: str):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            i = self._idx(0, y)
            raw += self.px[i:i + self.w * 4]
        compressed = zlib.compress(bytes(raw), 9)

        def chunk(tag, data):
            c = struct.pack(">I", len(data)) + tag + data
            c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            return c

        ihdr = struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0)
        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", ihdr)
        png += chunk(b"IDAT", compressed)
        png += chunk(b"IEND", b"")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(png)


def _rgba(color):
    if len(color) == 4:
        return color
    return (color[0], color[1], color[2], 255)


def _rounded_coverage(px, py, x0, y0, x1, y1, r):
    # Distance from point to the rounded-rectangle area, sub-pixel coverage.
    if r <= 0:
        inside = x0 <= px <= x1 and y0 <= py <= y1
        return 1.0 if inside else 0.0
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    dx = px - cx
    dy = py - cy
    dist = (dx * dx + dy * dy) ** 0.5
    if px < x0 or px > x1 or py < y0 or py > y1:
        # outside the straight edges; still may be within corner radius
        return max(0.0, min(1.0, r - dist + 0.5))
    if (px < x0 + r or px > x1 - r) and (py < y0 + r or py > y1 - r):
        return max(0.0, min(1.0, r - dist + 0.5))
    return 1.0


# ---------------------------------------------------------------------------
# Minimal 5x7 bitmap font (used only for promo/screenshot labels)
# ---------------------------------------------------------------------------
FONT = {
    " ": [0, 0, 0, 0, 0, 0, 0],
    "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "B": [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    "D": [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
    "E": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    "G": [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
    "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "J": [0x07, 0x02, 0x02, 0x02, 0x12, 0x12, 0x0C],
    "K": [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    "N": [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    "Q": [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
    "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    "S": [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    "W": [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11],
    "X": [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    "Y": [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
    "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "2": [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
    "3": [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
    "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    ".": [0, 0, 0, 0, 0, 0x0C, 0x0C],
    ",": [0, 0, 0, 0, 0, 0x04, 0x08],
    "+": [0, 0x04, 0x04, 0x1F, 0x04, 0x04, 0],
    "-": [0, 0, 0, 0x1F, 0, 0, 0],
    "_": [0, 0, 0, 0, 0, 0, 0x1F],
    ":": [0, 0x0C, 0x0C, 0, 0x0C, 0x0C, 0],
    "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
    "&": [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D],
}


# ---------------------------------------------------------------------------
# Icon
# ---------------------------------------------------------------------------
def draw_document(c: Canvas, x, y, w, h, paper, lines_color, ss):
    """Draw a stylized document page with a folded corner and text lines."""
    fold = 18 * ss
    # shadow
    c.rounded_rect(x + 4 * ss, y + 6 * ss, x + w + 4 * ss, y + h + 6 * ss,
                   10 * ss, (0, 0, 0, 60))
    # page body
    c.rounded_rect(x, y, x + w, y + h, 10 * ss, paper)
    # folded corner accent
    c.fill_rect(x + w - fold, y, x + w, y + fold, PAPER_SHADE)
    return fold


def make_icon(size: int, path: str):
    ss = 4  # supersample
    S = size * ss
    c = Canvas(S, S)

    # rounded brand background with subtle vertical gradient
    for y in range(S):
        t = y / S
        col = (
            int(BRAND[0] * (1 - t) + BRAND_DARK[0] * t),
            int(BRAND[1] * (1 - t) + BRAND_DARK[1] * t),
            int(BRAND[2] * (1 - t) + BRAND_DARK[2] * t),
        )
        c.fill_rect(0, y, S, y + 1, col)
    # mask corners by overlaying transparency via re-draw of rounded rect on fresh bg
    bg = Canvas(S, S)
    bg.rounded_rect(0, 0, S, S, S * 0.22, BRAND)
    for y in range(S):
        t = y / S
        col = (
            int(BRAND[0] * (1 - t) + BRAND_DARK[0] * t),
            int(BRAND[1] * (1 - t) + BRAND_DARK[1] * t),
            int(BRAND[2] * (1 - t) + BRAND_DARK[2] * t),
        )
        for x in range(S):
            j = bg._idx(x, y)
            if bg.px[j + 3] > 0:
                bg.px[j] = col[0]
                bg.px[j + 1] = col[1]
                bg.px[j + 2] = col[2]
    c = bg

    # two overlapping document pages
    dw, dh = int(S * 0.42), int(S * 0.56)
    # back page (left / original) with red removed line
    bx, by = int(S * 0.14), int(S * 0.20)
    draw_document(c, bx, by, dw, dh, PAPER, INK_SOFT, ss)
    # front page (right / new) with green added line
    fx, fy = int(S * 0.44), int(S * 0.24)
    draw_document(c, fx, fy, dw, dh, PAPER, INK_SOFT, ss)

    # text lines on front page
    lx0 = fx + 12 * ss
    lx1 = fx + dw - 12 * ss
    ly = fy + 14 * ss
    gap = 11 * ss
    for k in range(8):
        yy = ly + k * gap
        if yy > fy + dh - 12 * ss:
            break
        if k == 2:
            # removed (red) highlight on this line
            c.rounded_rect(lx0, yy - 3 * ss, lx0 + (lx1 - lx0) * 0.62,
                           yy + 7 * ss, 4 * ss, RED)
        elif k == 4:
            # added (green) highlight
            c.rounded_rect(lx0, yy - 3 * ss, lx0 + (lx1 - lx0) * 0.8,
                           yy + 7 * ss, 4 * ss, GREEN)
        else:
            c.rounded_rect(lx0, yy, lx0 + (lx1 - lx0) * (0.9 - 0.1 * (k % 3)),
                           yy + 5 * ss, 3 * ss, INK_SOFT)

    out = c.downsample(ss)
    out.write_png(path)
    print("wrote", path)


# ---------------------------------------------------------------------------
# Promo tiles
# ---------------------------------------------------------------------------
def gradient_bg(c: Canvas, top, bottom):
    for y in range(c.h):
        t = y / c.h
        col = (
            int(top[0] * (1 - t) + bottom[0] * t),
            int(top[1] * (1 - t) + bottom[1] * t),
            int(top[2] * (1 - t) + bottom[2] * t),
        )
        c.fill_rect(0, y, c.w, y + 1, col)


def draw_doc_panel(c, x, y, w, h, highlight):
    c.rounded_rect(x + 6, y + 8, x + w + 6, y + h + 8, 14, (0, 0, 0, 70))
    c.rounded_rect(x, y, x + w, y + h, 14, PAPER)
    pad = int(w * 0.12)
    lx0, lx1 = x + pad, x + w - pad
    gap = int(h * 0.085)
    yy = y + pad
    for k in range(9):
        if yy > y + h - pad:
            break
        if highlight == "red" and k == 3:
            c.rounded_rect(lx0, yy - 2, lx0 + (lx1 - lx0) * 0.6, yy + 9, 4, RED)
        elif highlight == "green" and k == 3:
            c.rounded_rect(lx0, yy - 2, lx0 + (lx1 - lx0) * 0.75, yy + 9, 4, GREEN)
        elif highlight == "red" and k == 6:
            c.rounded_rect(lx0, yy - 2, lx0 + (lx1 - lx0) * 0.5, yy + 9, 4, RED)
        elif highlight == "green" and k == 6:
            c.rounded_rect(lx0, yy - 2, lx0 + (lx1 - lx0) * 0.85, yy + 9, 4, GREEN)
        else:
            c.rounded_rect(lx0, yy, lx0 + (lx1 - lx0) * (0.9 - 0.08 * (k % 4)),
                           yy + 6, 3, INK_SOFT)
        yy += gap


def make_promo(w, h, path, title, subtitle):
    ss = 2
    c = Canvas(w * ss, h * ss)
    gradient_bg(c, (0x21, 0x53, 0xC9), (0x14, 0x2A, 0x66))

    # two document panels on the right
    pw = int(w * ss * 0.20)
    ph = int(h * ss * 0.62)
    py = int(h * ss * 0.19)
    px1 = int(w * ss * 0.52)
    px2 = px1 + int(pw * 0.78)
    draw_doc_panel(c, px1, py, pw, ph, "red")
    draw_doc_panel(c, px2, py - int(ph * 0.06), pw, ph, "green")

    # title text (left)
    tx = int(w * ss * 0.07)
    scale = max(2, int(h * ss / 110))
    ty = int(h * ss * 0.30)
    c.text(tx, ty, title, WHITE, scale=scale, spacing=1)
    c.text(tx, ty + scale * 9, subtitle, (0xBF, 0xD2, 0xFF),
           scale=max(1, scale // 2), spacing=1)

    out = c.downsample(ss)
    out.write_png(path)
    print("wrote", path)


# ---------------------------------------------------------------------------
# Screenshot placeholders (replace with real captures before publishing)
# ---------------------------------------------------------------------------
def make_screenshot_placeholder(path, label):
    w, h = 1280, 800
    c = Canvas(w, h)
    gradient_bg(c, (0xF4, 0xF6, 0xFB), (0xE4, 0xE9, 0xF2))

    # top toolbar mock
    c.fill_rect(0, 0, w, 56, BRAND)
    c.text(28, 20, "PDF DIFF", WHITE, scale=2, spacing=1)
    c.rounded_rect(w - 250, 14, w - 30, 44, 8, (255, 255, 255, 40))
    c.text(w - 232, 21, "OPEN PDF DIFF", WHITE, scale=1, spacing=1)

    # summary bar
    c.rounded_rect(28, 76, w - 28, 120, 8, WHITE)
    c.text(48, 92, "3 CHANGED PAGES   12 DIFFERENCE REGIONS", INK, scale=1)

    # two document panes
    pane_y = 140
    pane_h = h - pane_y - 30
    left = (28, pane_y, (w // 2) - 14, pane_y + pane_h)
    right = ((w // 2) + 14, pane_y, w - 28, pane_y + pane_h)
    for (x0, y0, x1, y1), hl in ((left, "red"), (right, "green")):
        c.rounded_rect(x0, y0, x1, y1, 10, WHITE)
        draw_doc_panel(c, x0 + 40, y0 + 30, x1 - x0 - 80, pane_h - 70, hl)

    # label banner
    c.fill_rect(0, h - 30, w, h, (0x12, 0x20, 0x33))
    msg = "PLACEHOLDER - REPLACE WITH REAL SCREENSHOT - " + label
    c.text(20, h - 23, msg, WHITE, scale=1, spacing=1)

    c.write_png(path)
    print("wrote", path)


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(here, "icons")
    promo = os.path.join(here, "promo")
    shots = os.path.join(here, "screenshots")

    for size in (16, 32, 48, 128):
        make_icon(size, os.path.join(icons, f"icon-{size}.png"))

    make_promo(440, 280, os.path.join(promo, "promo-tile-440x280.png"),
               "PDF DIFF", "COMPARE TWO PDFS INSTANTLY")
    make_promo(1400, 560, os.path.join(promo, "marquee-1400x560.png"),
               "PDF DIFF", "SIDE BY SIDE PDF COMPARISON IN YOUR BROWSER")

    make_screenshot_placeholder(
        os.path.join(shots, "screenshot-1-side-by-side.png"),
        "SIDE BY SIDE DIFF")
    make_screenshot_placeholder(
        os.path.join(shots, "screenshot-2-change-navigator.png"),
        "CHANGE NAVIGATOR")

    print("done")


if __name__ == "__main__":
    main()
