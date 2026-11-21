import type { Ticket } from './state';

/** Rectangle in ticket units: the scratch area is 1 wide and `height` tall. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MASK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Sample grid over the scratch area. Zero means no foil; other values point
 * at the individual prize cell the point belongs to (one-based).
 */
export interface ScratchMask {
  cols: number;
  rows: number;
  points: Uint8Array;
  removed: Uint8Array;
  cells: { target: number; scratched: number }[];
}

export interface Point {
  x: number;
  y: number;
}

export function createMask(cells: readonly Rect[], height: number, threshold: number, cols = 64): ScratchMask {
  const rows = Math.max(1, Math.round(cols * height));
  const points = new Uint8Array(cols * rows);
  const totals = cells.map(() => 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) / cols;
      const y = (row + 0.5) / cols;
      const cell = cells.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (cell >= 0) {
        points[row * cols + col] = cell + 1;
        totals[cell] = totals[cell]! + 1;
      }
    }
  }
  return { cols, rows, points, removed: new Uint8Array(points.length), cells: totals.map((total) => ({ target: Math.ceil(total * threshold), scratched: 0 })) };
}

/** Removes foil swept by the coin and reports any cells ready to peel clean. */
export function scratchSegment(mask: ScratchMask, from: Point, to: Point, radius: number): {
  cleared: number[];
  contact: Point | null;
} {
  const { x: x0, y: y0 } = from;
  const { x: x1, y: y1 } = to;
  const { cols, rows, points, cells } = mask;
  const minCol = Math.max(0, Math.floor((Math.min(x0, x1) - radius) * cols));
  const maxCol = Math.min(cols - 1, Math.ceil((Math.max(x0, x1) + radius) * cols));
  const minRow = Math.max(0, Math.floor((Math.min(y0, y1) - radius) * cols));
  const maxRow = Math.min(rows - 1, Math.ceil((Math.max(y0, y1) + radius) * cols));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const cleared: number[] = [];
  let contact: Point | null = null;
  let nearest = Infinity;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * cols + col;
      const cellIndex = (points[index] ?? 0) - 1;
      const cell = cells[cellIndex];
      if (!cell || cell.scratched >= cell.target) continue;
      const px = (col + 0.5) / cols;
      const py = (row + 0.5) / cols;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSq));
      const ex = px - (x0 + t * dx);
      const ey = py - (y0 + t * dy);
      if (ex * ex + ey * ey <= radius * radius) {
        points[index] = 0;
        mask.removed[index] = 1;
        if (++cell.scratched === cell.target) cleared.push(cellIndex);
        const distance = (px - x1) ** 2 + (py - y1) ** 2;
        if (distance < nearest) {
          nearest = distance;
          contact = { x: px, y: py };
        }
      }
    }
  }
  return { cleared, contact };
}

export function scratchProgress({ cells }: ScratchMask): number {
  if (!cells.length) return 1;
  return cells.reduce((sum, cell) => sum + (cell.target ? cell.scratched / cell.target : 1), 0) / cells.length;
}

export function encodeMask(mask: ScratchMask): string {
  let text = '';
  for (let start = 0; start < mask.points.length; start += 6) {
    let bits = 0;
    for (let bit = 0; bit < 6; bit++) if (mask.removed[start + bit]) bits |= 1 << bit;
    text += MASK_CHARS[bits];
  }
  return text;
}

/** Restores only scratched prize points; malformed input leaves the mask untouched. */
export function restoreMask(mask: ScratchMask, text: unknown): boolean {
  if (typeof text !== 'string' || text.length !== Math.ceil(mask.points.length / 6)) return false;
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const bits = MASK_CHARS.indexOf(text[i]!);
    if (bits < 0) return false;
    for (let bit = 0; bit < 6; bit++) {
      if (!(bits & (1 << bit))) continue;
      const index = i * 6 + bit;
      if (!mask.points[index] && !mask.removed[index]) return false;
      indices.push(index);
    }
  }
  for (const index of indices) {
    if (!mask.removed[index]) {
      const cell = mask.cells[mask.points[index]! - 1]!;
      mask.points[index] = 0;
      mask.removed[index] = 1;
      cell.scratched = Math.min(cell.target, cell.scratched + 1);
    }
  }
  return true;
}

export function ticketContentKey(ticket: Ticket): string {
  return JSON.stringify([ticket.serial, ticket.type, ticket.cells, ticket.tier, ticket.prize, ticket.free]);
}
