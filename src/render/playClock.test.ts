import { describe, expect, it } from 'vitest';
import { PlayClock } from './playClock';

describe('active frame clock', () => {
  it('batches elapsed play time rather than using the capped animation delta', () => {
    const clock = new PlayClock();
    expect(clock.update(100, true)).toBe(0);
    expect(clock.update(600, true)).toBe(0);
    expect(clock.update(1600, true)).toBe(1500);
  });

  it('flushes a partial second at hide or pause and never charges the gap', () => {
    const clock = new PlayClock();
    clock.update(0, true);
    expect(clock.update(350, false)).toBe(350);
    expect(clock.update(100000, false)).toBe(0);
    expect(clock.update(200000, true)).toBe(0);
    expect(clock.update(201000, true)).toBe(1000);
  });

  it('handles an initially hidden tab and a nonincreasing frame timestamp', () => {
    const clock = new PlayClock();
    expect(clock.update(1000, false)).toBe(0);
    expect(clock.update(2000, true)).toBe(0);
    expect(clock.update(1900, true)).toBe(0);
    expect(clock.update(2400, false)).toBe(500);
  });
});
