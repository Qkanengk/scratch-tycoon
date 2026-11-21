import { describe, expect, it, vi } from 'vitest';
import { TICKETS } from '../data/tickets';
import { createMask, scratchSegment } from '../game/scratch';
import { restoreFoil, ticketMetrics } from './ticketFace';

describe('ticketMetrics', () => {
  it.each(TICKETS.map((def) => def.id))('keeps the scratch window of %s inside the ticket', (id) => {
    const m = ticketMetrics(id);
    expect(m.window.x).toBeGreaterThan(0);
    expect(m.window.x + m.window.w).toBeLessThan(1);
    expect(m.window.y).toBeGreaterThan(0);
    expect(m.window.y + m.window.h).toBeLessThan(m.height);
    // The window is as tall as the layout it shows, measured in window widths.
    expect(m.window.h / m.window.w).toBeCloseTo(m.layout.height);
  });

  it('gives every cell of a ticket its own rectangle inside the window', () => {
    for (const def of TICKETS) {
      const { layout } = ticketMetrics(def.id);
      for (const cell of layout.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.w).toBeLessThanOrEqual(1);
        expect(cell.y + cell.h).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  it('restores only the saved scratched grid squares on the foil', () => {
    const clearRect = vi.fn();
    const canvas = { width: 768, getContext: () => ({ clearRect }) } as unknown as HTMLCanvasElement;
    const mask = createMask([{ x: 0, y: 0, w: 1, h: 1 }], 1);
    restoreFoil(canvas, mask);
    expect(clearRect).not.toHaveBeenCalled();
    scratchSegment(mask, 0.2, 0.2, 0.5, 0.2, 0.05);
    restoreFoil(canvas, mask);
    expect(clearRect).toHaveBeenCalledTimes(mask.scratched);
    for (const [x, y, w, h] of clearRect.mock.calls) {
      expect(mask.points[(y / 16) * mask.cols + x / 16]).toBe(2);
      expect([w, h]).toEqual([16, 16]);
    }
  });
});
