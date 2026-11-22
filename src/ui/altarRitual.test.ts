import { describe, expect, it } from 'vitest';
import { prestigeThreshold } from '../data/prestige';
import { prestige } from '../game/prestige';
import { createInitialState } from '../game/state';
import { offerIncense } from './altarRitual';

function eligible() {
  const state = createInitialState(1);
  state.licenses = ['rong'];
  state.totalEarned = state.prestige.runEarned = prestigeThreshold(1);
  return state;
}

describe('incense confirmation', () => {
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
