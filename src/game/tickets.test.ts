import { describe, expect, it } from 'vitest';
import { TICKETS } from '../data/tickets';
import { Rng } from './rng';
import { cellCount, evaluateCells, expectedReturn, generateCells, rollTier } from './tickets';

describe.each(TICKETS)('prize table of $id', (def) => {
  it('has six tiers from a miss up to the jackpot', () => {
    expect(def.prizes).toHaveLength(6);
    expect(def.prizes[0]?.multiplier).toBe(0);
    expect(def.prizes[1]?.multiplier).toBe(1);
    const multipliers = def.prizes.map((tier) => tier.multiplier);
    expect(multipliers).toEqual([...multipliers].sort((a, b) => a - b));
  });

  it('weights add up to 10,000', () => {
    expect(def.prizes.reduce((sum, tier) => sum + tier.weight, 0)).toBe(10_000);
  });

  it('pays the base return the plan sets', () => {
    expect(expectedReturn(def.prizes)).toBeCloseTo(def.baseReturn, 3);
  });

  it('rolls tiers at their weights', () => {
    const rng = new Rng(2024);
    const rolls = 200_000;
    let paid = 0;
    for (let i = 0; i < rolls; i++) paid += def.prizes[rollTier(def.prizes, rng)]?.multiplier ?? 0;
    // The jackpot dominates the variance, so the tolerance is wide.
    expect(Math.abs(paid / rolls - def.baseReturn)).toBeLessThan(0.08);
  });

  it('prints cells that show exactly the rolled prize', () => {
    const rng = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 20_000; i++) {
      const { tier, cells } = generateCells(def, rng);
      seen.add(tier);
      expect(cells).toHaveLength(cellCount(def.rules));
      expect(evaluateCells(def, cells)).toBe(def.prizes[tier]?.multiplier);
      const anyWin = cells.some((cell) => 'win' in cell && cell.win);
      expect(anyWin).toBe(tier > 0);
    }
    expect(seen.size).toBe(def.prizes.length);
  });
});

it('ticket prices rise and returns fall with each type', () => {
  for (let i = 1; i < TICKETS.length; i++) {
    expect(TICKETS[i]?.price).toBeGreaterThan(TICKETS[i - 1]?.price ?? 0);
    expect(TICKETS[i]?.baseReturn).toBeLessThan(TICKETS[i - 1]?.baseReturn ?? 0);
  }
});

it('keeps the planned paid-ticket returns', () => {
  expect(TICKETS.map((def) => expectedReturn(def.prizes))).toEqual([1.08, 1.04, 1, 0.96, 0.92, 0.88]);
});
