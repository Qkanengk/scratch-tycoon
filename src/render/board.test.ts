import { describe, expect, it } from 'vitest';
import { licenseWait, wrapBoardLabel } from './board';
import { createInitialState } from '../game/state';
import { prestigeScenario } from '../ui/debugPrestige';

describe('landscape board labels', () => {
  const measure = (text: string) => text.length;

  it('keeps a short label on one line', () => {
    expect(wrapBoardLabel('Cào 0 / 50', measure, 20)).toEqual(['Cào 0 / 50']);
  });

  it('wraps long requirements without losing words', () => {
    const label = 'Cần 1.100 xu (phí 1.000 xu + vé đầu)';
    const lines = wrapBoardLabel(label, measure, 18);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe(label);
  });

  it('handles an empty label', () => {
    expect(wrapBoardLabel('', measure, 18)).toEqual([]);
  });

  it('preserves an oversized word for canvas fitting', () => {
    expect(wrapBoardLabel('requirement', measure, 4)).toEqual(['requirement']);
  });

  it('counts down only when the active-time requirement is the last one left', () => {
    const state = prestigeScenario('board');
    expect(licenseWait(state, 'vutru')).toContain('0:40');
    expect(licenseWait({ ...state, licenseElapsedMs: 20 * 60_000 }, 'vutru')).toBeNull();
    expect(licenseWait({ ...state, money: 0 }, 'vutru')).toBeNull();
    expect(licenseWait({ ...state, stats: createInitialState(1).stats }, 'vutru')).toBeNull();
    expect(licenseWait(createInitialState(1), 'vutru')).toBeNull();
  });
});
