from __future__ import annotations

import math
import re
import struct
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SHAPE_DIR = ROOT / "assets" / "shapes"
OUTPUT_DIR = ROOT / "stl"

INCH_MM = 25.4
OVERLAY_WIDTH_MM = 4.0 * INCH_MM
BASE_THICKNESS_MM = 1.2
RELIEF_HEIGHT_MM = 0.9
GRID_CELLS = 180
SIGIL_SIZE_MM = 58.0

TOKEN_RE = re.compile(r"[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def tokenize_path(data: str) -> list[str]:
    return TOKEN_RE.findall(data)


def is_command(token: str) -> bool:
    return len(token) == 1 and token.isalpha()


def cubic_point(p0, p1, p2, p3, t: float):
    u = 1.0 - t
    return (
        u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
    )


def quadratic_point(p0, p1, p2, t: float):
    u = 1.0 - t
    return (
        u**2 * p0[0] + 2 * u * t * p1[0] + t**2 * p2[0],
        u**2 * p0[1] + 2 * u * t * p1[1] + t**2 * p2[1],
    )


def parse_path(data: str) -> list[list[tuple[float, float]]]:
    tokens = tokenize_path(data)
    paths: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    i = 0
    cmd = ""
    pos = (0.0, 0.0)
    start = (0.0, 0.0)
    last_ctrl = None

    def number() -> float:
      nonlocal i
      value = float(tokens[i])
      i += 1
      return value

    def close_current():
      nonlocal current
      if len(current) > 2:
          paths.append(current)
      current = []

    while i < len(tokens):
        if is_command(tokens[i]):
            cmd = tokens[i]
            i += 1
        if not cmd:
            break

        relative = cmd.islower()
        op = cmd.upper()

        if op == "M":
            x = number()
            y = number()
            if relative:
                x += pos[0]
                y += pos[1]
            close_current()
            pos = (x, y)
            start = pos
            current = [pos]
            last_ctrl = None
            cmd = "l" if relative else "L"
            continue

        if op == "Z":
            if current and current[-1] != start:
                current.append(start)
            close_current()
            pos = start
            last_ctrl = None
            continue

        if op == "L":
            while i < len(tokens) and not is_command(tokens[i]):
                x = number()
                y = number()
                if relative:
                    x += pos[0]
                    y += pos[1]
                pos = (x, y)
                current.append(pos)
            last_ctrl = None
            continue

        if op == "H":
            while i < len(tokens) and not is_command(tokens[i]):
                x = number()
                if relative:
                    x += pos[0]
                pos = (x, pos[1])
                current.append(pos)
            last_ctrl = None
            continue

        if op == "V":
            while i < len(tokens) and not is_command(tokens[i]):
                y = number()
                if relative:
                    y += pos[1]
                pos = (pos[0], y)
                current.append(pos)
            last_ctrl = None
            continue

        if op == "C":
            while i < len(tokens) and not is_command(tokens[i]):
                x1, y1 = number(), number()
                x2, y2 = number(), number()
                x3, y3 = number(), number()
                if relative:
                    x1 += pos[0]; y1 += pos[1]
                    x2 += pos[0]; y2 += pos[1]
                    x3 += pos[0]; y3 += pos[1]
                p0 = pos
                p1 = (x1, y1)
                p2 = (x2, y2)
                p3 = (x3, y3)
                for step in range(1, 17):
                    current.append(cubic_point(p0, p1, p2, p3, step / 16))
                pos = p3
                last_ctrl = p2
            continue

        if op == "S":
            while i < len(tokens) and not is_command(tokens[i]):
                if last_ctrl:
                    x1, y1 = 2 * pos[0] - last_ctrl[0], 2 * pos[1] - last_ctrl[1]
                else:
                    x1, y1 = pos
                x2, y2 = number(), number()
                x3, y3 = number(), number()
                if relative:
                    x2 += pos[0]; y2 += pos[1]
                    x3 += pos[0]; y3 += pos[1]
                p0, p1, p2, p3 = pos, (x1, y1), (x2, y2), (x3, y3)
                for step in range(1, 17):
                    current.append(cubic_point(p0, p1, p2, p3, step / 16))
                pos = p3
                last_ctrl = p2
            continue

        if op == "Q":
            while i < len(tokens) and not is_command(tokens[i]):
                x1, y1 = number(), number()
                x2, y2 = number(), number()
                if relative:
                    x1 += pos[0]; y1 += pos[1]
                    x2 += pos[0]; y2 += pos[1]
                p0, p1, p2 = pos, (x1, y1), (x2, y2)
                for step in range(1, 13):
                    current.append(quadratic_point(p0, p1, p2, step / 12))
                pos = p2
                last_ctrl = p1
            continue

        # Arc commands are rare in these potrace files; skip unsupported chunks defensively.
        if op == "A":
            while i < len(tokens) and not is_command(tokens[i]):
                rx, ry, angle, large, sweep, x, y = [number() for _ in range(7)]
                if relative:
                    x += pos[0]
                    y += pos[1]
                pos = (x, y)
                current.append(pos)
            last_ctrl = None
            continue

        raise ValueError(f"Unsupported SVG path command: {cmd}")

    close_current()
    return paths


def parse_transform(transform: str):
    tx, ty = 0.0, 0.0
    sx, sy = 1.0, 1.0
    translate = re.search(r"translate\(([^)]+)\)", transform)
    if translate:
        parts = [float(p) for p in re.split(r"[,\s]+", translate.group(1).strip()) if p]
        tx = parts[0]
        ty = parts[1] if len(parts) > 1 else 0.0
    scale = re.search(r"scale\(([^)]+)\)", transform)
    if scale:
        parts = [float(p) for p in re.split(r"[,\s]+", scale.group(1).strip()) if p]
        sx = parts[0]
        sy = parts[1] if len(parts) > 1 else sx
    return tx, ty, sx, sy


def load_svg_polygons(svg_path: Path) -> list[list[tuple[float, float]]]:
    tree = ElementTree.parse(svg_path)
    root = tree.getroot()
    ns = {"svg": "http://www.w3.org/2000/svg"}
    group = root.find(".//svg:g", ns)
    tx, ty, sx, sy = parse_transform(group.attrib.get("transform", "") if group is not None else "")
    polygons = []
    for path in root.findall(".//svg:path", ns):
        for poly in parse_path(path.attrib["d"]):
            transformed = [(x * sx + tx, y * sy + ty) for x, y in poly]
            if len(transformed) > 2:
                polygons.append(transformed)
    return polygons


def make_sigil_mask(svg_path: Path, cells: int) -> Image.Image:
    polygons = load_svg_polygons(svg_path)
    points = [point for poly in polygons for point in poly]
    min_x = min(p[0] for p in points)
    max_x = max(p[0] for p in points)
    min_y = min(p[1] for p in points)
    max_y = max(p[1] for p in points)
    width = max_x - min_x
    height = max_y - min_y

    scale = (SIGIL_SIZE_MM / OVERLAY_WIDTH_MM * cells) / max(width, height)
    center = (4 * OVERLAY_WIDTH_MM / (3 * math.pi), 4 * OVERLAY_WIDTH_MM / (3 * math.pi))
    center_px = (center[0] / OVERLAY_WIDTH_MM * cells, (1 - center[1] / OVERLAY_WIDTH_MM) * cells)

    mask = Image.new("L", (cells, cells), 0)
    draw = ImageDraw.Draw(mask)
    for poly in polygons:
        mapped = [
            (
                center_px[0] + (x - (min_x + max_x) / 2) * scale,
                center_px[1] + (y - (min_y + max_y) / 2) * scale,
            )
            for x, y in poly
        ]
        draw.polygon(mapped, fill=255)
    return mask


def normal(a, b, c):
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / length, ny / length, nz / length)


def add_quad(tris, p1, p2, p3, p4):
    tris.append((p1, p2, p3))
    tris.append((p1, p3, p4))


def write_binary_stl(path: Path, triangles):
    with path.open("wb") as fh:
        header = f"Sigil Simon overlay: {path.stem}".encode("ascii")[:80]
        fh.write(header + b" " * (80 - len(header)))
        fh.write(struct.pack("<I", len(triangles)))
        for tri in triangles:
            n = normal(*tri)
            fh.write(struct.pack("<3f", *n))
            for vertex in tri:
                fh.write(struct.pack("<3f", *vertex))
            fh.write(struct.pack("<H", 0))


def build_overlay(mask: Image.Image):
    cells = GRID_CELLS
    cell = OVERLAY_WIDTH_MM / cells
    inside = [[False] * cells for _ in range(cells)]
    height = [[0.0] * cells for _ in range(cells)]
    pixels = mask.load()
    for y in range(cells):
        for x in range(cells):
            cx = (x + 0.5) * cell
            cy = (y + 0.5) * cell
            if cx * cx + cy * cy <= OVERLAY_WIDTH_MM * OVERLAY_WIDTH_MM:
                inside[y][x] = True
                mask_y = cells - 1 - y
                raised = pixels[x, mask_y] > 0
                height[y][x] = BASE_THICKNESS_MM + (RELIEF_HEIGHT_MM if raised else 0.0)

    tris = []
    for y in range(cells):
        for x in range(cells):
            if not inside[y][x]:
                continue
            x0, x1 = x * cell, (x + 1) * cell
            y0, y1 = y * cell, (y + 1) * cell
            z = height[y][x]
            top = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
            bottom = [(x0, y0, 0.0), (x0, y1, 0.0), (x1, y1, 0.0), (x1, y0, 0.0)]
            add_quad(tris, *top)
            add_quad(tris, *bottom)

            neighbors = [
                (x, y - 1, (x0, y0), (x1, y0)),
                (x + 1, y, (x1, y0), (x1, y1)),
                (x, y + 1, (x1, y1), (x0, y1)),
                (x - 1, y, (x0, y1), (x0, y0)),
            ]
            for nx, ny, a2, b2 in neighbors:
                neighbor_inside = 0 <= nx < cells and 0 <= ny < cells and inside[ny][nx]
                neighbor_height = height[ny][nx] if neighbor_inside else 0.0
                if neighbor_height == z:
                    continue
                low = min(z, neighbor_height)
                high = max(z, neighbor_height)
                p1 = (a2[0], a2[1], low)
                p2 = (b2[0], b2[1], low)
                p3 = (b2[0], b2[1], high)
                p4 = (a2[0], a2[1], high)
                add_quad(tris, p1, p2, p3, p4)
    return tris


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    for name in ["chaos", "oracle", "directive", "sacred"]:
        mask = make_sigil_mask(SHAPE_DIR / f"{name}.svg", GRID_CELLS)
        triangles = build_overlay(mask)
        write_binary_stl(OUTPUT_DIR / f"sigil_overlay_{name}.stl", triangles)
        print(f"{name}: {len(triangles)} triangles")


if __name__ == "__main__":
    main()
