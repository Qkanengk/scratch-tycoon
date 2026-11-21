import { describe, expect, it, vi } from 'vitest';
import { TICKETS } from '../data/tickets';
import { createMask, scratchSegment } from '../game/scratch';
import { drawFace, restoreFoil, ticketMetrics } from './ticketFace';

vi.mock('./assets', () => ({ image: () => ({}), rasterize: () => ({}) }));

describe('ticketMetrics', () => {
  it.each(['ngoc', 'rong'] as const)('keeps the %s seal below the entire printed rule line', id => {
    const fillText = vi.fn();
    const arc = vi.fn();
    const translate = vi.fn();
    const ctx = new Proxy({ fillText, arc, translate, measureText: () => ({ width: 100 }), font: '' }, { get: (target, key) => Reflect.get(target, key) ?? vi.fn() });
    const canvas = { width: 1024, height: 1024, getContext: () => ctx } as unknown as HTMLCanvasElement;
    drawFace(canvas, id, null, false);
    const rule = fillText.mock.calls.find(([text]) => text.startsWith(id === 'ngoc' ? 'Trùng số' : 'Đủ 3'))!;
    const sealCenter = translate.mock.calls.at(-1)!;
    const radius = arc.mock.calls.at(-1)![2];
    const ruleFontHeight = .25 * 1024 * .86 * .29;
    expect(sealCenter[1] - radius).toBeGreaterThan(rule[2] + ruleFontHeight / 2);
  });
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
    const cells = [{ x: 0, y: 0, w: 1, h: 1 }];
    const mask = createMask(cells, 1, 1);
    restoreFoil(canvas, mask, cells);
    expect(clearRect).not.toHaveBeenCalled();
    scratchSegment(mask, { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }, 0.05);
    restoreFoil(canvas, mask, cells);
    expect(clearRect).toHaveBeenCalledTimes(mask.cells[0]!.scratched);
    for (const [x, y, w, h] of clearRect.mock.calls) {
      expect(mask.removed[(y / 12) * mask.cols + x / 12]).toBe(1);
      expect([w, h]).toEqual([12, 12]);
    }
  });

  it('restores the entire peeled patch after its cell reaches the threshold', () => {
    const clearRect = vi.fn();
    const canvas = { width: 768, getContext: () => ({ clearRect }) } as unknown as HTMLCanvasElement;
    const cells = [{ x: 0, y: 0, w: 1, h: 1 }];
    const mask = createMask(cells, 1, 0.5);
    scratchSegment(mask, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, 1);
    restoreFoil(canvas, mask, cells);
    const [x, y, width, height] = clearRect.mock.lastCall!;
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
    expect(width).toBeGreaterThan(768);
    expect(height).toBeGreaterThan(768);
  });
});
