import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns the Vietnamese string for a key', () => {
    expect(t('app.title')).toBe('Scratch Tycoon');
  });

  it('fills placeholders', () => {
    expect(t('ticket.serial', { serial: 12 })).toBe('Số 12');
  });
});
