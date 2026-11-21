import { describe, expect, it } from 'vitest';
import { TICKETS } from '../data/tickets';
import { ticketMetrics } from './ticketFace';

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
});
