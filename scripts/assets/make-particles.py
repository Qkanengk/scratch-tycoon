"""Writes the flat toon particle and brand SVGs (public/assets/particles, public/assets/brand).

Original work for this game. Run: python3 scripts/assets/make-particles.py
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "public/assets"
INK = "#2b1b17"


def write(folder, name, size, body):
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
    (ROOT / folder / f"{name}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">\n{body}\n</svg>\n')


def burst(cx, cy, points, outer, inner, turn=-math.pi / 2):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = turn + i * math.pi / points
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return " ".join(pts)


STROKE = f'stroke="{INK}" stroke-width="6" stroke-linejoin="round"'

write("particles", "star", 96, f'<polygon points="{burst(48, 50, 5, 40, 18)}" fill="#ffd23f" {STROKE}/>')
write("particles", "sparkle", 96, f'<polygon points="{burst(48, 48, 4, 42, 11)}" fill="#fff6d6" {STROKE}/>')
write("particles", "foil-flake-a", 96, f'<polygon points="18,30 60,14 82,44 66,80 26,72" fill="#c4c9d6" {STROKE}/><path d="M34 40 L58 32" stroke="#f4f6fb" stroke-width="6" stroke-linecap="round"/>')
write("particles", "foil-flake-b", 96, f'<polygon points="14,52 40,18 80,30 74,70 38,82" fill="#aeb4c2" {STROKE}/><path d="M36 50 L60 44" stroke="#f4f6fb" stroke-width="6" stroke-linecap="round"/>')
write("particles", "foil-curl", 96, f'<path d="M16 62 C20 24 62 14 76 36 C86 54 66 70 54 58 C46 50 54 40 62 44" fill="none" stroke="{INK}" stroke-width="18" stroke-linecap="round"/><path d="M16 62 C20 24 62 14 76 36 C86 54 66 70 54 58 C46 50 54 40 62 44" fill="none" stroke="#c4c9d6" stroke-width="8" stroke-linecap="round"/>')
write("particles", "coin", 96, f'<circle cx="48" cy="48" r="36" fill="#ffd23f" {STROKE}/><circle cx="48" cy="48" r="22" fill="#f7b500"/><rect x="40" y="40" width="16" height="16" rx="2" fill="#ffd23f" stroke="{INK}" stroke-width="4"/>')
write("particles", "ring", 96, f'<circle cx="48" cy="48" r="34" fill="none" stroke="{INK}" stroke-width="18"/><circle cx="48" cy="48" r="34" fill="none" stroke="#fff6d6" stroke-width="7"/>')
for name, colour in (("confetti-red", "#ef4b3f"), ("confetti-blue", "#3d8bfd"), ("confetti-green", "#3bb273"), ("confetti-yellow", "#ffd23f")):
    write("particles", name, 96, f'<rect x="22" y="34" width="52" height="28" rx="4" transform="rotate(-18 48 48)" fill="{colour}" {STROKE}/>')
write("particles", "smoke-puff", 96, f'<path d="M24 66 C8 62 10 40 28 40 C28 22 54 18 60 34 C78 28 90 48 78 60 C82 74 60 82 50 72 C42 82 26 78 24 66 Z" fill="#f4ede0" {STROKE}/>')

# Brand mark: a ticket with a scratched window and the scratching coin. No lettering, so it needs no font.
TICKET = (
    f'<g transform="rotate(-10 128 128)">'
    f'<rect x="42" y="62" width="172" height="132" rx="16" fill="#ef4b3f" stroke="{INK}" stroke-width="10"/>'
    f'<path d="M42 104 H214" stroke="{INK}" stroke-width="8"/>'
    f'<polygon points="{burst(74, 83, 5, 14, 6)}" fill="#ffd23f"/>'
    f'<rect x="96" y="76" width="96" height="14" rx="7" fill="#fff6d6"/>'
    f'<rect x="60" y="120" width="136" height="56" rx="10" fill="#c4c9d6" stroke="{INK}" stroke-width="8"/>'
    f'<path d="M72 162 C92 128 104 166 122 136 C134 118 142 158 160 132" fill="none" stroke="#fff6d6" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>'
    f'</g>'
)
COIN = (
    f'<circle cx="182" cy="170" r="46" fill="#ffd23f" stroke="{INK}" stroke-width="10"/>'
    f'<circle cx="182" cy="170" r="28" fill="#f7b500"/>'
    f'<rect x="171" y="159" width="22" height="22" rx="3" fill="#ffd23f" stroke="{INK}" stroke-width="6"/>'
)
write("brand", "logo-mark", 256, TICKET + COIN)
write("brand", "favicon", 256, f'<rect width="256" height="256" rx="56" fill="#3bb273"/>' + TICKET + COIN)
print("ok")
