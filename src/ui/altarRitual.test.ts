import { describe, expect, it, vi } from 'vitest';
import { prestigeThreshold } from '../data/prestige';
import { prestige } from '../game/prestige';
import { createInitialState } from '../game/state';
import { blockRepeatedOffering, offerIncense } from './altarRitual';

function eligible() {
  const state = createInitialState(1);
  state.licenses = ['rong'];
  state.totalEarned = state.prestige.runEarned = prestigeThreshold(1);
  return state;
}

describe('incense confirmation', () => {
  it.each(['Enter', ' '])('cancels native %j repeat activation but permits two distinct presses', key => {
    const preventDefault = vi.fn();
    const state = eligible();
    let armedUntil = 0;
    let confirmed = false;
    const press = (repeat: boolean) => {
      if (blockRepeatedOffering({ key, repeat, preventDefault })) return;
      const result = offerIncense(state, armedUntil, 1000);
      armedUntil = result.armedUntil;
      confirmed = result.confirm;
    };
    press(false);
    for (let i = 0; i < 12; i++) press(true);
    expect(preventDefault).toHaveBeenCalledTimes(12);
    expect(confirmed).toBe(false);
    expect(armedUntil).toBe(7000);
    press(false);
    expect(confirmed).toBe(true);
  });
  it('leaves non-activation keys alone', () => {
    const preventDefault = vi.fn();
    expect(blockRepeatedOffering({ key: 'ArrowRight', repeat: true, preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
  it('requires two eligible offerings within six seconds', () => {
    const state = eligible();
    const first = offerIncense(state, 0, 1000);
    expect(first).toEqual({ armedUntil: 7000, confirm: false });
    expect(offerIncense(state, first.armedUntil, 6999)).toEqual({ armedUntil: 0, confirm: true });
    expect(state.prestige.tier).toBe(0);
  });
  it('re-arms instead of confirming at or after the deadline', () => {
    expect(offerIncense(eligible(), 7000, 7000)).toEqual({ armedUntil: 13000, confirm: false });
    expect(offerIncense(eligible(), 7000, 9000).confirm).toBe(false);
  });
  it('cannot confirm an ineligible, replaced or already prestiged run', () => {
    expect(offerIncense(createInitialState(1), 7000, 1001)).toEqual({ armedUntil: 0, confirm: false });
    const state = eligible();
    expect(offerIncense({ ...state, licenses: [] }, 7000, 1001).confirm).toBe(false);
    expect(offerIncense(prestige(state), 7000, 1001).confirm).toBe(false);
    state.prestige.tier = 5;
    expect(offerIncense(state, 7000, 1001).confirm).toBe(false);
  });
});
