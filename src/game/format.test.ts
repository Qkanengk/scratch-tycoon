import { describe, expect, it } from 'vitest';
import { formatCompact, formatMoney } from './format';

describe('formatMoney', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [12_345, '12.345'],
    [999_999, '999.999'],
    [1_000_000, '1 Tr'],
    [1_250_000, '1,2 Tr'],
    [200_000_000, '200 Tr'],
    [5_600_000_000, '5,6 Tỷ'],
  ])('%d -> %s', (value, text) => {
    expect(formatMoney(value)).toBe(text);
  });
});

describe('formatCompact', () => {
  it.each([
    [10, '10'],
    [1_000, '1K'],
    [12_500, '12,5K'],
    [3_000_000, '3 Tr'],
    [75_000_000, '75 Tr'],
  ])('%d -> %s', (value, text) => {
    expect(formatCompact(value)).toBe(text);
  });
});
