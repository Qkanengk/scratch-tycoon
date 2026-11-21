import type { Ticket } from './state';

/** Rectangle in ticket units: the scratch area is 1 wide and `height` tall. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COVERED = 1;
const SCRATCHED = 2;
const MASK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Coarse grid over the scratch area. Only points inside a prize cell count,
 * so progress is measured without reading canvas pixels.
 */
export interface ScratchMask {
  cols: number;
  rows: number;
  points: Uint8Array;
  total: number;
  scratched: number;
}

export function createMask(cells: readonly Rect[], height: number, cols = 48): ScratchMask {
  const rows = Math.max(1, Math.round(cols * height));
  const points = new Uint8Array(cols * rows);
  let total = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) / cols;
      const y = (row + 0.5) / cols;
      if (cells.some((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h)) {
        points[row * cols + col] = COVERED;
        total += 1;
      }
    }
  }
  return { cols, rows, points, total, scratched: 0 };
}

/** Marks every prize point within `radius` of the segment as scratched. */
export function scratchSegment(
  mask: ScratchMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): void {
  const { cols, rows, points } = mask;
  const minCol = Math.max(0, Math.floor((Math.min(x0, x1) - radius) * cols));
  const maxCol = Math.min(cols - 1, Math.ceil((Math.max(x0, x1) + radius) * cols));
  const minRow = Math.max(0, Math.floor((Math.min(y0, y1) - radius) * cols));
  const maxRow = Math.min(rows - 1, Math.ceil((Math.max(y0, y1) + radius) * cols));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const index = row * cols + col;
      if (points[index] !== COVERED) continue;
      const px = (col + 0.5) / cols;
      const py = (row + 0.5) / cols;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lengthSq));
      const ex = px - (x0 + t * dx);
      const ey = py - (y0 + t * dy);
      if (ex * ex + ey * ey <= radius * radius) {
        points[index] = SCRATCHED;
        mask.scratched += 1;
      }
    }
  }
}

export function coverage(mask: ScratchMask): number {
  return mask.total === 0 ? 1 : mask.scratched / mask.total;
}

export function encodeMask(mask: ScratchMask): string {
  let text = '';
  for (let start = 0; start < mask.points.length; start += 6) {
    let bits = 0;
    for (let bit = 0; bit < 6; bit++) if (mask.points[start + bit] === SCRATCHED) bits |= 1 << bit;
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
      if (!mask.points[index]) return false;
      indices.push(index);
    }
  }
  for (const index of indices) {
    if (mask.points[index] !== SCRATCHED) {
      mask.points[index] = SCRATCHED;
      mask.scratched++;
    }
  }
  return true;
}

export function ticketContentKey(ticket: Ticket): string {
  return JSON.stringify([ticket.serial, ticket.type, ticket.cells, ticket.tier, ticket.prize, ticket.free]);
}
