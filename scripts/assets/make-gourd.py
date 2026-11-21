"""Builds public/assets/models/original/gourd.glb: a low-poly calabash for the "bầu" symbol.

Original work for this game (lathe of a hand-tuned profile), released with the repo.
Run: python3 scripts/assets/make-gourd.py
"""
import json
import math
import struct
from pathlib import Path

SEGMENTS = 14
# (radius, height) profiles, bottom to top.
BODY = [(0.0, 0.0), (0.2, 0.01), (0.36, 0.1), (0.42, 0.24), (0.38, 0.4), (0.24, 0.52),
        (0.19, 0.58), (0.25, 0.66), (0.28, 0.76), (0.22, 0.88), (0.08, 0.95), (0.0, 0.955)]
STEM = [(0.0, 0.93), (0.055, 0.94), (0.045, 1.02), (0.06, 1.1), (0.0, 1.1)]
PARTS = [("gourd", BODY, [0.13, 0.32, 0.05, 1.0]), ("stem", STEM, [0.45, 0.27, 0.12, 1.0])]


def lathe(profile):
    positions, normals, indices = [], [], []
    for i, (r, y) in enumerate(profile):
        prev_r, prev_y = profile[max(i - 1, 0)]
        next_r, next_y = profile[min(i + 1, len(profile) - 1)]
        dr, dy = next_r - prev_r, next_y - prev_y
        length = math.hypot(dr, dy) or 1.0
        nr, ny = dy / length, -dr / length
        for s in range(SEGMENTS + 1):
            a = 2 * math.pi * s / SEGMENTS
            positions.append((r * math.cos(a), y, r * math.sin(a)))
            normals.append((nr * math.cos(a), ny, nr * math.sin(a)))
    ring = SEGMENTS + 1
    for i in range(len(profile) - 1):
        for s in range(SEGMENTS):
            a, b = i * ring + s, (i + 1) * ring + s
            indices += [a, b, a + 1, a + 1, b, b + 1]
    return positions, normals, indices


def main():
    blob = bytearray()
    views, accessors, meshes, materials, nodes = [], [], [], [], []

    def add(data, target, component, kind, count, bounds=None):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        accessor = {"bufferView": len(views) - 1, "componentType": component, "count": count, "type": kind}
        if bounds:
            accessor["min"], accessor["max"] = bounds
        accessors.append(accessor)
        return len(accessors) - 1

    for name, profile, colour in PARTS:
        positions, normals, indices = lathe(profile)
        lo = [min(p[k] for p in positions) for k in range(3)]
        hi = [max(p[k] for p in positions) for k in range(3)]
        pos = add(b"".join(struct.pack("<3f", *p) for p in positions), 34962, 5126, "VEC3", len(positions), (lo, hi))
        nor = add(b"".join(struct.pack("<3f", *n) for n in normals), 34962, 5126, "VEC3", len(normals))
        idx = add(struct.pack(f"<{len(indices)}H", *indices), 34963, 5123, "SCALAR", len(indices))
        materials.append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": colour, "metallicFactor": 0, "roughnessFactor": 1}})
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": idx, "material": len(materials) - 1}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})

    while len(blob) % 4:
        blob.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "scratch-tycoon make-gourd.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "materials": materials,
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(blob)}],
    }
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    out = Path(__file__).resolve().parents[2] / "public/assets/models/original/gourd.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(text) + 8 + len(blob))
        + struct.pack("<I4s", len(text), b"JSON") + text
        + struct.pack("<I4s", len(blob), b"BIN\0") + bytes(blob)
    )
    print(out, out.stat().st_size)


main()
