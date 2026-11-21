import { describe, expect, it } from 'vitest';
import { wrapBoardLabel } from './board';

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
});
