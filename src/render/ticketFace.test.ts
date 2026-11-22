import { describe, expect, it, vi } from 'vitest';
import { TICKETS } from '../data/tickets';
import { createMask, scratchSegment } from '../game/scratch';
import { drawFace, restoreFoil, ticketMetrics } from './ticketFace';

vi.mock('./assets', async importOriginal => ({
  ...await importOriginal<typeof import('./assets')>(),
  image: (path: string) => ({ path, naturalWidth: 100, naturalHeight: 100 }),
  rasterize: (path: string, size: number) => ({ path, size }),
}));

describe('ticketMetrics', () => {
  it.each(['dong', 'bac', 'vang', 'ngoc', 'rong'] as const)('tiles the original %s paper rather than stretching a card back', id => {
    const createPattern = vi.fn(() => '#fff');
    const ctx = new Proxy({ createPattern, measureText: () => ({ width: 100 }) }, { get: (target, key) => Reflect.get(target, key) ?? vi.fn() });
    const canvas = { width: 1024, height: 1024, getContext: () => ctx } as unknown as HTMLCanvasElement;
    drawFace(canvas, id, null, false);
    expect(createPattern).toHaveBeenCalledWith({ path: `patterns/paper-${id}.svg`, size: 266 }, 'repeat');
  });

  it.each(['ngoc', 'rong', 'vutru'] as const)('keeps the %s seal below the entire printed rule line', id => {
    const fillText = vi.fn();
    const drawImage = vi.fn();
    const ctx = new Proxy({ fillText, drawImage, measureText: () => ({ width: 100 }), font: '' }, { get: (target, key) => Reflect.get(target, key) ?? vi.fn() });
    const canvas = { width: 1024, height: 1024, getContext: () => ctx } as unknown as HTMLCanvasElement;
    drawFace(canvas, id, null, false);
    const rule = fillText.mock.calls.find(([text]) => text.startsWith(id === 'rong' ? 'Đủ 3' : 'Trùng số'))!;
    const seal = drawImage.mock.calls.find(([img]) => img.path === 'stickers/jewel.png')!;
    const ruleFontHeight = .25 * 1024 * .86 * .29;
    expect(seal[2]).toBeGreaterThan(rule[2] + ruleFontHeight / 2);
    if (id === 'vutru') {
      const [, x, y, width] = drawImage.mock.calls.find(([img]) => img.path === 'stickers/spaceship.png')!;
      const [, serialX, , serialWidth] = fillText.mock.calls.find(([text]) => text.includes('000001'))!;
      expect(y).toBeGreaterThan(rule[2] + ruleFontHeight / 2);
      expect(x + width).toBeLessThan(serialX - serialWidth / 2);
    }
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
