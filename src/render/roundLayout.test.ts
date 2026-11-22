import { describe, expect, it } from 'vitest';
import { TICKET_IDS } from '../data/tickets';
import { ticketMetrics } from './ticketFace';
import { roundLayout, roundTileAt } from './roundLayout';

describe('non-overlapping desk rounds', () => {
  it.each(TICKET_IDS)('fits every %s round from one to eight tickets on either layout', id => {
    const height = ticketMetrics(id).height;
    for (const desktop of [false, true]) for (let count = 1; count <= 8; count++) {
      const layout = roundLayout(count, height, desktop ? 2 : .61, desktop);
      expect(layout.tiles).toHaveLength(count);
      layout.tiles.forEach((tile, index) => {
        expect(roundTileAt(layout, height, tile.x, tile.z)).toBe(index);
        expect(Math.abs(tile.x) + tile.scale / 2).toBeLessThanOrEqual(layout.width / 2 + 1e-9);
        expect(Math.abs(tile.z) + height * tile.scale / 2).toBeLessThanOrEqual(layout.height / 2 + 1e-9);
        for (const other of layout.tiles.slice(index + 1)) {
          expect(Math.abs(tile.x - other.x) > tile.scale || Math.abs(tile.z - other.z) > height * tile.scale).toBe(true);
        }
        if (count > 1) expect(tile.z + height * tile.scale / 2).toBeLessThan(layout.badgeZ - .065 * layout.scale);
      });
      expect(roundTileAt(layout, height, 100, 100)).toBe(-1);
    }
  });

  it('preserves the exact single-ticket transform and handles an empty round', () => {
    expect(roundLayout(1, 1.4, .5, false)).toMatchObject({ tiles: [{ x: 0, z: 0, scale: 1 }], width: 1, height: 1.4 });
    expect(roundLayout(0, 1.4, .5, false).tiles).toEqual([]);
  });

  it('reserves a separate return-tag row without covering tickets or the round badge', () => {
    const layout = roundLayout(2, .8, .61, false, true);
    expect(layout.returnZ! - .0575 * layout.scale).toBeGreaterThan(layout.badgeZ + .09 * layout.scale);
    for (const tile of layout.tiles) expect(tile.z + .4 * tile.scale).toBeLessThan(layout.badgeZ - .09 * layout.scale);
  });
});
