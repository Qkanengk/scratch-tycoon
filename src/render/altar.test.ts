import { describe, expect, it } from 'vitest';
import { prestigeThreshold } from '../data/prestige';
import { createInitialState } from '../game/state';
import { altarLines } from './altar';
import { formatMoney } from '../game/format';

describe('painted altar tablet', () => {
  it('shows fresh progress, the new bonus/curse and missing licence', () => {
    const lines = altarLines(createInitialState(1), false).join('\n');
    expect(lines).toContain('Đổi đời I');
    expect(lines).toContain(`0 / ${formatMoney(prestigeThreshold(1))}`);
    expect(lines).toContain('+20%');
    expect(lines).toContain('thuế');
    expect(lines).toContain('Rồng');
  });
  it('warns of every reset cost only when an eligible offering is armed', () => {
    const state = createInitialState(1);
    expect(altarLines(state, true).join(' ')).not.toContain('LẦN NỮA');
    state.licenses = ['rong'];
    state.prestige.runEarned = prestigeThreshold(1);
    const lines = altarLines(state, true).join(' ');
    for (const word of ['LẦN NỮA', 'tiền', 'vé', 'đồ nghề', 'thợ cào', 'giấy phép', '6 giây']) expect(lines).toContain(word);
  });
  it('keeps the active bonus and curse count visible and handles completion', () => {
    const state = createInitialState(1);
    state.prestige.tier = 3;
    expect(altarLines(state, false).join(' ')).toContain('+60% · Gánh 3');
    expect(altarLines(state, false)[0]).toBe('Đổi đời IV');
    state.prestige.tier = 5;
    const complete = altarLines(state, false).join(' ');
    expect(complete).toContain('đạt Đổi đời V');
    expect(complete).toContain('+100% · Gánh 5');
    expect(complete).not.toContain('Infinity');
  });
});
