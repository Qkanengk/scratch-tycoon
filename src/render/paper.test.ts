import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/state';
import { buyTicket } from '../game/economy';
import { receiptLines, rentLines } from './paper';

describe('printed kiosk accounting', () => {
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
