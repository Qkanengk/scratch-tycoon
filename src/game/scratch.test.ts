import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKETS } from '../data/tickets';
import { layoutTicket } from '../render/layout';
import { coverage, createMask, scratchSegment } from './scratch';

const cell = { x: 0.1, y: 0.1, w: 0.4, h: 0.2 };

describe('scratch mask', () => {
  it('starts fully covered', () => {
    expect(coverage(createMask([cell], 0.4))).toBe(0);
  });

  it('ignores scratching outside the prize cells', () => {
    const mask = createMask([cell], 0.4);
    scratchSegment(mask, 0.6, 0.35, 0.95, 0.35, 0.03);
    expect(coverage(mask)).toBe(0);
  });

  it('measures the scratched share of a cell', () => {
    const mask = createMask([cell], 0.4);
    // One pass along the middle with a brush half as tall as the cell.
    scratchSegment(mask, 0.1, 0.2, 0.5, 0.2, 0.05);
    expect(coverage(mask)).toBeGreaterThan(0.4);
    expect(coverage(mask)).toBeLessThan(0.6);
  });

  it('does not count the same spot twice', () => {
    const mask = createMask([cell], 0.4);
    scratchSegment(mask, 0.1, 0.2, 0.5, 0.2, 0.05);
    const once = coverage(mask);
    scratchSegment(mask, 0.5, 0.2, 0.1, 0.2, 0.05);
    expect(coverage(mask)).toBe(once);
  });

  it('a single tap is not enough, a full pass over every cell is', () => {
    for (const def of TICKETS) {
      const layout = layoutTicket(def.rules);
      const mask = createMask(layout.cells, layout.height);
      const first = layout.cells[0];
      if (!first) throw new Error('no cells');
      scratchSegment(mask, first.x + first.w / 2, first.y + first.h / 2, first.x + first.w / 2, first.y + first.h / 2, BALANCE.brushRadius);
      expect(coverage(mask)).toBeLessThan(BALANCE.scratchThreshold);
      for (let y = 0; y <= layout.height; y += BALANCE.brushRadius) {
        scratchSegment(mask, 0, y, 1, y, BALANCE.brushRadius);
      }
      expect(coverage(mask)).toBe(1);
    }
  });
});

describe('ticket layout', () => {
  it.each(TICKETS)('$id has one box per cell, inside the ticket and not overlapping', (def) => {
    const layout = layoutTicket(def.rules);
    const { cells, height } = layout;
    for (const [i, a] of cells.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(1);
      expect(a.y + a.h).toBeLessThanOrEqual(height);
      for (const b of cells.slice(i + 1)) {
        const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
        expect(apart).toBe(true);
      }
    }
  });
});
