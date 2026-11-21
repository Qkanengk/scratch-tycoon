"""Writes the tileable SVG patterns in public/assets/patterns (ticket papers, scratch foil, table).

Original work for this game. Every tile is 240x240 and repeats seamlessly; the palette matches
src/render/palette.ts. Run: python3 scripts/assets/make-patterns.py
"""
from pathlib import Path

S = 240
INK = "#2b1b17"
OUT = Path(__file__).resolve().parents[2] / "public/assets/patterns"


def svg(name, body, background):
    OUT.mkdir(parents=True, exist_ok=True)
    text = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">\n'
            f'<rect width="{S}" height="{S}" fill="{background}"/>\n{body}\n</svg>\n')
    (OUT / f"{name}.svg").write_text(text)


def wrapped(draw, x, y, reach):
    """Repeat a shape across the tile edges it overlaps so the tile stays seamless."""
    parts = []
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            if -reach <= x + dx <= S + reach and -reach <= y + dy <= S + reach:
                parts.append(draw(x + dx, y + dy))
    return "".join(parts)


def star(cx, cy, r, fill):
    import math
    pts = []
    for i in range(10):
        rad = r if i % 2 == 0 else r * 0.45
        a = -math.pi / 2 + i * math.pi / 5
        pts.append(f"{cx + rad * math.cos(a):.1f},{cy + rad * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"/>'


def dong():
    # Copper paper: coins with a square hole (old cash coins) on a dotted ground.
    body = []
    for x, y in ((60, 60), (180, 180)):
        body.append(wrapped(lambda cx, cy: (
            f'<circle cx="{cx}" cy="{cy}" r="30" fill="#f2a05c" stroke="#b9602b" stroke-width="5"/>'
            f'<rect x="{cx - 9}" y="{cy - 9}" width="18" height="18" rx="2" fill="#e58a45" stroke="#b9602b" stroke-width="4"/>'), x, y, 36))
    for x, y in ((180, 60), (60, 180), (0, 0), (120, 120), (120, 0), (0, 120)):
        body.append(wrapped(lambda cx, cy: f'<circle cx="{cx}" cy="{cy}" r="7" fill="#f2a05c"/>', x, y, 8))
    svg("paper-dong", "\n".join(body), "#e58a45")


def bac():
    # Silver paper: seigaiha waves, for the bầu cua (fish, crab) ticket.
    body = []
    r = 40
    for row in range(-1, 8):
        y = row * 30
        off = 0 if row % 2 == 0 else r
        for col in range(-1, 5):
            x = col * 2 * r + off
            for k, colour in ((r, "#cfdcec"), (r * 0.7, "#b7c9df"), (r * 0.4, "#cfdcec")):
                body.append(f'<circle cx="{x}" cy="{y}" r="{k:.0f}" fill="{colour}" stroke="#8fa6c4" stroke-width="3"/>')
    svg("paper-bac", "\n".join(body), "#cfdcec")


def vang():
    # Gold paper: diamond lattice with stars.
    body = ['<path d="M0 60 L60 0 M0 180 L180 0 M60 240 L240 60 M180 240 L240 180 M0 60 L180 240 M0 180 L60 240 M60 0 L240 180 M180 0 L240 60" '
            'stroke="#e0a21a" stroke-width="5" fill="none"/>']
    for x, y in ((0, 0), (120, 120)):
        body.append(wrapped(lambda cx, cy: star(cx, cy, 20, "#fff1b8"), x, y, 22))
    for x, y in ((120, 0), (0, 120)):
        body.append(wrapped(lambda cx, cy: f'<circle cx="{cx}" cy="{cy}" r="8" fill="#e0a21a"/>', x, y, 9))
    svg("paper-vang", "\n".join(body), "#f7c948")


def ngoc():
    # Jade paper: cut-gem facets.
    body = []
    for x, y in ((60, 60), (180, 180), (180, 60), (60, 180)):
        light = (x == y)
        a, b = ("#7fd6b0", "#4fb88f") if light else ("#5cc49a", "#3da37c")
        body.append(
            f'<polygon points="{x},{y - 52} {x + 52},{y} {x},{y + 52} {x - 52},{y}" fill="{a}" stroke="#2f8a68" stroke-width="4" stroke-linejoin="round"/>'
            f'<polygon points="{x},{y - 26} {x + 26},{y} {x},{y + 26} {x - 26},{y}" fill="{b}"/>'
            f'<path d="M{x} {y - 52} V{y - 26} M{x + 52} {y} H{x + 26} M{x} {y + 52} V{y + 26} M{x - 52} {y} H{x - 26}" stroke="#2f8a68" stroke-width="3"/>')
    svg("paper-ngoc", "\n".join(body), "#46ad86")


def rong():
    # Dragon paper: overlapping scales, red with gold rims.
    body = []
    r = 30
    for row in range(9, -2, -1):
        y = row * 30
        off = 0 if row % 2 == 0 else r
        for col in range(-1, 6):
            x = col * 2 * r + off
            body.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#d83a2e" stroke="#f7c948" stroke-width="4"/>'
                        f'<circle cx="{x}" cy="{y + 8}" r="9" fill="#b3261e"/>')
    svg("paper-rong", "\n".join(body), "#d83a2e")


def foil():
    # Scratch foil: brushed silver stripes with sparkles; the renderer tints it per ticket.
    body = []
    for i in range(-6, 7):
        x = i * 40
        body.append(f'<path d="M{x} 240 L{x + 240} 0" stroke="#aeb4c2" stroke-width="12"/>')
    for x, y, r in ((40, 60, 12), (160, 40, 8), (200, 170, 13), (90, 190, 9), (120, 110, 7)):
        body.append(star(x, y, r, "#f4f6fb"))
    svg("foil", "\n".join(body), "#c4c9d6")


def wood():
    # Table top: toon planks with ink seams. Tiles horizontally and vertically.
    body = []
    shades = ("#c98a4b", "#bd7d40", "#d1955a", "#c2854a")
    for i, shade in enumerate(shades):
        y = i * 60
        body.append(f'<rect x="0" y="{y}" width="{S}" height="60" fill="{shade}"/>')
        body.append(f'<path d="M0 {y} H{S}" stroke="{INK}" stroke-width="4"/>')
        joint = (70, 190, 130, 30)[i]
        body.append(f'<path d="M{joint} {y} V{y + 60}" stroke="{INK}" stroke-width="4"/>')
        body.append(f'<path d="M{(joint + 40) % S} {y + 22} h46 M{(joint + 120) % 180} {y + 40} h30" stroke="#9a6230" stroke-width="4" stroke-linecap="round"/>')
    svg("table-wood", "\n".join(body), shades[0])


def felt():
    # Scratch mat under the ticket: green felt with a stitched weave.
    body = []
    for x in range(0, S, 40):
        for y in range(0, S, 40):
            if (x // 40 + y // 40) % 2 == 0:
                body.append(f'<path d="M{x + 12} {y + 20} h16" stroke="#2f9a63" stroke-width="5" stroke-linecap="round"/>')
            else:
                body.append(f'<path d="M{x + 20} {y + 12} v16" stroke="#2f9a63" stroke-width="5" stroke-linecap="round"/>')
    svg("mat-felt", "\n".join(body), "#3bb273")


for make in (dong, bac, vang, ngoc, rong, foil, wood, felt):
    make()
print(sorted(p.name for p in OUT.iterdir()))
