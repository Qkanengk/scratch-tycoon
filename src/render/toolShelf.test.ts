import { describe, expect, it } from 'vitest';
import { TOOLS, toolDef } from '../data/tools';
import { createInitialState } from '../game/state';
import { buyTool } from '../game/tools';
import { shelfOffer, shelfSlot } from './toolShelf';

describe('tool shelf offers and layout', () => {
  it('offers only affordable upgrades and purchases in a new game', () => {
    const state = createInitialState(1);
    expect(shelfOffer(state, 'coin')).toMatchObject({ kind: 'upgrade', affordable: true, price: 19 });
    expect(shelfOffer(state, 'key')).toMatchObject({ kind: 'buy', affordable: false, price: 200 });
  });

  it('shows buy, equip, upgrade and max-level states without mutating progress', () => {
    const state = buyTool({ ...createInitialState(1), money: 1000 }, 'key');
    expect(shelfOffer(state, 'coin').kind).toBe('equip');
    expect(shelfOffer(state, 'key').kind).toBe('upgrade');
    expect(shelfOffer({ ...state, toolLevels: { ...state.toolLevels, key: toolDef('key').maxLevel } }, 'key').kind).toBe('max');
    expect(shelfOffer({ ...state, money: 0 }, 'key').affordable).toBe(false);
    expect(state.toolLevels.key).toBe(0);
  });

  it('lays out all six tools in two columns and three rows within the pegboard', () => {
    const slots = TOOLS.map((_, i) => shelfSlot(i));
    expect(new Set(slots.map(p => p.x)).size).toBe(2);
    expect(new Set(slots.map(p => p.y)).size).toBe(3);
    expect(new Set(slots.map(p => p.toArray().join(','))).size).toBe(6);
    for (const slot of slots) {
      expect(Math.abs(slot.x)).toBeLessThan(0.875);
      expect(slot.y).toBeGreaterThan(0.4);
      expect(slot.y).toBeLessThan(2);
    }
  });
});
