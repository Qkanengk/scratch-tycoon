import { describe, expect, it } from 'vitest';
import { percentile, simulatePacing } from '../../scripts/pacing';
import { TICKETS } from '../data/tickets';

describe('licence pacing at the measured scratch cadence', () => {
  const licenses = TICKETS.slice(1);
  const runs = Array.from({ length: 384 }, (_, i) => simulatePacing(10_001 + i, 6 * 3600));

  it('reaches every licence median near the long end of 20 to 40 minutes', () => {
    for (const { id } of licenses) {
      const times = runs.map(run => run.intervals[id] ?? Infinity);
      const median = percentile(times, 0.5) / 60;
      expect(median, id).toBeGreaterThanOrEqual(20);
      expect(median, id).toBeLessThanOrEqual(40);
    }
  }, 20_000);

  it('makes the first upgrade affordable around one minute into a new game', () => {
    const median = percentile(runs.map(run => run.firstUpgrade), 0.5);
    expect(median).toBeGreaterThanOrEqual(45);
    expect(median).toBeLessThanOrEqual(75);
  });

  it('buys progressively better tools over several hours', () => {
    let previous = 0;
    for (const id of ['key', 'card', 'scraper', 'machine', 'laser'] as const) {
      const median = percentile(runs.map(run => run.toolPurchases[id] ?? Infinity), 0.5);
      expect(median).toBeGreaterThan(previous);
      expect(median).toBeLessThan(6 * 3600);
      previous = median;
    }
  });
});
