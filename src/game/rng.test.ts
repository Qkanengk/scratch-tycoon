import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('resumes from a saved state', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it('stays in [0, 1) and covers the integer range', () => {
    const rng = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      seen.add(rng.int(6));
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('shuffle keeps every item', () => {
    const items = new Rng(3).shuffle([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...items].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
