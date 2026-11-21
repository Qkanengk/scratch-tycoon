import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKETS } from '../data/tickets';
import { layoutTicket } from '../render/layout';
import { createMask, encodeMask, restoreMask, scratchProgress, scratchSegment, ticketContentKey } from './scratch';
import { buyTicket } from './economy';
import { createInitialState } from './state';
import { ticketMetrics } from '../render/ticketFace';

const cell = { x: 0.1, y: 0.1, w: 0.4, h: 0.2 };

describe('scratch mask', () => {
  it('starts fully covered', () => {
    expect(scratchProgress(createMask([cell], 0.4, 1))).toBe(0);
  });

  it('ignores scratching outside the prize cells', () => {
    const mask = createMask([cell], 0.4, 0.5);
    expect(scratchSegment(mask, { x: 0.6, y: 0.35 }, { x: 0.95, y: 0.35 }, 0.03)).toEqual({ cleared: [], contact: null });
    expect(scratchProgress(mask)).toBe(0);
  });

  it('measures the scratched share of a cell', () => {
    const mask = createMask([cell], 0.4, 1);
    // One pass along the middle with a brush half as tall as the cell.
    scratchSegment(mask, { x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, 0.05);
    expect(scratchProgress(mask)).toBeGreaterThan(0.4);
    expect(scratchProgress(mask)).toBeLessThan(0.6);
  });

  it('does not count the same spot twice', () => {
    const mask = createMask([cell], 0.4, 1);
    const a = { x: 0.1, y: 0.2 };
    const b = { x: 0.5, y: 0.2 };
    scratchSegment(mask, a, b, 0.05);
    const once = scratchProgress(mask);
    expect(scratchSegment(mask, b, a, 0.05).contact).toBeNull();
    expect(scratchProgress(mask)).toBe(once);
  });

  it('peels only the cells hit by a fast stroke and never reports a peeled cell again', () => {
    const cells = [cell, { ...cell, x: 0.55, w: 0.12 }, { ...cell, x: 0.75, w: 0.2 }];
    const mask = createMask(cells, 0.4, 0.5);
    const a = { x: 0.05, y: 0.2 };
    const b = { x: 0.675, y: 0.2 };
    expect(scratchSegment(mask, a, b, 0.07).cleared).toEqual([0, 1]);
    expect(scratchProgress(mask)).toBe(2 / 3);
    expect(scratchSegment(mask, a, b, 0.07)).toEqual({ cleared: [], contact: null });
    expect(scratchSegment(mask, { x: 0.76, y: 0.2 }, { x: 1, y: 0.2 }, 0.07).cleared).toEqual([2]);
    expect(scratchProgress(mask)).toBe(1);
  });

  it.each(TICKETS)('$id requires more than a dab and peels all tiles after sweeping them', (def) => {
    const { layout, window } = ticketMetrics(def.id);
    const radius = BALANCE.brushRadius / window.w;
    const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
    const first = layout.cells[0]!;
    const centre = { x: first.x + first.w / 2, y: first.y + first.h / 2 };
    expect(scratchSegment(mask, centre, centre, radius).cleared).toEqual([]);
    const peeled = [];
    for (let y = 0; y <= layout.height; y += radius) {
      peeled.push(...scratchSegment(mask, { x: 0, y }, { x: 1, y }, radius).cleared);
    }
    expect(peeled.sort((a, b) => a - b)).toEqual(layout.cells.map((_, index) => index));
    expect(scratchProgress(mask)).toBe(1);
  });

  it('packs six grid points per character and restores exactly the same coverage', () => {
    const mask = createMask([cell], 0.4, 0.5);
    scratchSegment(mask, { x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, 0.05);
    const text = encodeMask(mask);
    expect(text.length).toBe(Math.ceil(mask.points.length / 6));
    const restored = createMask([cell], 0.4, 0.5);
    expect(restoreMask(restored, text)).toBe(true);
    expect(restored).toEqual(mask);
    expect(restoreMask(restored, text)).toBe(true);
    expect(restored).toEqual(mask);
  });

  it('round-trips an empty mask and rejects garbage, incorrect lengths and bits outside prize cells atomically', () => {
    const mask = createMask([cell], 0.4, 0.5);
    const text = encodeMask(mask);
    expect(restoreMask(mask, text)).toBe(true);
    for (const invalid of [undefined, null, 7, '', text.slice(1), text + 'A', '!'.repeat(text.length), 'B' + text.slice(1)]) {
      expect(restoreMask(mask, invalid)).toBe(false);
      expect(scratchProgress(mask)).toBe(0);
    }
  });

  it('rejects nonzero padding bits', () => {
    const mask = createMask([{ x: 0, y: 0, w: 1, h: 1 }], 1, 1, 1);
    expect(restoreMask(mask, 'C')).toBe(false);
    expect(restoreMask(mask, 'B')).toBe(true);
  });

  it('restores peeled cells and keeps merged cell progress bounded', () => {
    const cells = [{ x: 0, y: 0, w: 1, h: 1 }];
    const mask = createMask(cells, 1, 0.25, 8);
    scratchSegment(mask, { x: 0, y: 0.125 }, { x: 1, y: 0.125 }, 0.15);
    const restored = createMask(cells, 1, 0.25, 8);
    expect(restoreMask(restored, encodeMask(mask))).toBe(true);
    expect(restored).toEqual(mask);
    const other = createMask(cells, 1, 0.25, 8);
    scratchSegment(other, { x: 0, y: 0.875 }, { x: 1, y: 0.875 }, 0.15);
    expect(encodeMask(other)).not.toBe(encodeMask(mask));
    expect(restoreMask(restored, encodeMask(other))).toBe(true);
    expect(scratchProgress(restored)).toBe(1);
    expect(restored.cells.every((entry) => entry.scratched === entry.target)).toBe(true);
    expect(restored.removed.reduce((sum, bit) => sum + bit, 0)).toBe(32);
    expect(scratchSegment(restored, { x: 0, y: 0 }, { x: 1, y: 0.4 }, 1).cleared).toEqual([]);
  });

  it('diffs printed content even when serial/type/revealed match, independently of scratch progress', () => {
    const ticket = buyTicket(createInitialState(4), 'dong').ticket!;
    expect(ticketContentKey({ ...ticket, cells: [{ type: 'bomb' }] })).not.toBe(ticketContentKey(ticket));
    expect(ticketContentKey({ ...ticket, scratch: 'mask', revealed: true })).toBe(ticketContentKey(ticket));
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
