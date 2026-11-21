import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/state';
import { buyTicket } from '../game/economy';
import { receiptLines, rentLines } from './paper';

describe('printed kiosk accounting', () => {
  it('prints exact amounts that reconcile before and after debt withholding', () => {
    const ticket = { ...buyTicket(createInitialState(4), 'dong').ticket!, gross: 24000, tax: 1680, net: 22320 };
    expect(receiptLines(ticket, 320).map(line => line.text).slice(1)).toEqual([
      'Giải gốc: 24.000 xu', 'Thuế lãi: −1.680 xu', 'Thực lĩnh: 22.320 xu', 'Trừ nợ sạp: 320 xu', 'Vào ví: 22.000 xu',
    ]);
    expect(receiptLines(ticket, 0)).toHaveLength(5);
    expect(receiptLines(ticket, 30000).at(-1)?.text).toBe('Vào ví: 0 xu');
    expect(receiptLines({ ...ticket, gross: 1234567890 }, 0)[1]?.text).toBe('Giải gốc: 1.234.567.890 xu');
  });
  it('prints play-time rent, red debt and a paid stamp', () => {
    const state = createInitialState(1);
    expect(rentLines(state, false)[1]!.text).toContain('3:00');
    expect(rentLines({ ...state, rentDebt: 80 }, true)[2]).toMatchObject({ color: '#bb3026', text: 'CÒN NỢ: 80 xu' });
    expect(rentLines(state, true)[2]!.text).toContain('ĐÃ THU');
  });
  it('prints gross, tax, net and debt withholding separately', () => {
    const ticket = buyTicket(createInitialState(4), 'dong').ticket!;
    const lines = receiptLines(ticket, 20);
    expect(lines[1]!.text).toContain('Giải gốc:');
    expect(lines[2]!.text).toContain('Thuế lãi:');
    expect(lines[3]!.text).toContain('Thực lĩnh:');
    expect(lines[4]!.text).toContain('Trừ nợ sạp:');
    expect(receiptLines({ ...ticket, fakeTell: 'missing-seal', gross: 0, tax: 0, net: 0 }, 0)[0]!.text).toContain('VÉ GIẢ');
  });
});
