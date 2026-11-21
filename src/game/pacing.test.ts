import { describe, expect, it } from 'vitest';
import { percentile, simulatePacing } from '../../scripts/pacing';
import { TICKETS } from '../data/tickets';

describe('licence pacing at the measured scratch cadence', () => {
  const licenses = TICKETS.slice(1);

  it('reaches every licence median near the long end of 20 to 40 minutes', () => {
    const intervals = Array.from({ length: 384 }, (_, i) => simulatePacing(10_001 + i, 6 * 3600).intervals);
    for (const { id } of licenses) {
      const times = intervals.map(run => run[id] ?? Infinity);
      const median = percentile(times, 0.5) / 60;
      expect(median, id).toBeGreaterThanOrEqual(34);
      expect(median, id).toBeLessThanOrEqual(40);
    }
  }, 20_000);
});
