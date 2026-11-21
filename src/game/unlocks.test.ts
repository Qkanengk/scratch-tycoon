import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKETS, ticketDef } from '../data/tickets';
import { buyTicket, claimPromo, collectTicket, isBroke, isUnlocked, revealTicket, selectTicket, updatePromo } from './economy';
import { createInitialState, type GameState } from './state';
import { buyLicense, unlockProgress } from './unlocks';

/** A player who meets every requirement for Vé Bạc. */
function readyForBac(): GameState {
  const state = createInitialState(1);
  return {
    ...state,
    money: 150,
    totalEarned: 250,
    stats: { ...state.stats, dong: { scratched: 30, wins: 8, jackpots: 0 } },
  };
}

describe('unlock data', () => {
  it('only the first ticket is free to play', () => {
    expect(TICKETS.map((def) => def.unlock === null)).toEqual([true, false, false, false, false]);
  });

  it('each ticket is unlocked through the one before it', () => {
    for (let i = 1; i < TICKETS.length; i++) {
      const previous = TICKETS[i - 1];
      const unlock = TICKETS[i]?.unlock;
      expect(unlock?.mission.ticket).toBe(previous?.id);
      expect(unlock?.licenseCost).toBe((previous?.price ?? 0) * 5);
    }
    expect(TICKETS.map((def) => def.unlock?.totalEarned ?? 0)).toEqual([0, 250, 7_500, 120_000, 2_000_000]);
  });
});

describe('licenses', () => {
  it('a new player has only Vé Đồng', () => {
    const state = createInitialState(1);
    expect(isUnlocked(state, 'dong')).toBe(true);
    expect(isUnlocked(state, 'bac')).toBe(false);
    expect(unlockProgress(state, 'bac')).toMatchObject({
      unlocked: false,
      revenueDone: false,
      scratchedDone: false,
      winsDone: false,
      affordable: false,
      requiredMoney: 150,
      canBuyLicense: false,
    });
  });

  it.each([
    ['revenue', (s: GameState) => ({ ...s, totalEarned: 249 })],
    ['tickets scratched', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, scratched: 29 } } })],
    ['wins', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, wins: 7 } } })],
    ['license and first ticket money', (s: GameState) => ({ ...s, money: 149 })],
  ])('is refused while the %s requirement is short', (_name, shorten) => {
    const state = shorten(readyForBac());
    expect(unlockProgress(state, 'bac').canBuyLicense).toBe(false);
    expect(buyLicense(state, 'bac')).toBe(state);
  });

  it('is sold once every requirement is met, and then the ticket can be bought', () => {
    const ready = readyForBac();
    expect(unlockProgress(ready, 'bac').canBuyLicense).toBe(true);
    const licensed = buyLicense(ready, 'bac');
    expect(licensed.money).toBe(100);
    expect(licensed.licenses).toEqual(['bac']);
    expect(unlockProgress(licensed, 'bac').unlocked).toBe(true);
    expect(buyLicense(licensed, 'bac')).toBe(licensed);

    const bought = buyTicket(selectTicket(licensed, 'bac'), 'bac');
    expect(bought.ticket?.type).toBe('bac');
    expect(bought.money).toBe(0);
    expect(bought.selected).toBe('bac');
  });

  it('does not skip a ticket type', () => {
    const state = { ...readyForBac(), money: 1e12, totalEarned: 1e12 };
    expect(buyLicense(state, 'vang')).toBe(state);
    expect(selectTicket(state, 'vang')).toBe(state);
  });

  it('missions count wins of the right ticket', () => {
    const state = { ...readyForBac(), money: 1e6, totalEarned: 1e6 };
    const unlock = ticketDef('vang').unlock;
    expect(unlock?.mission).toEqual({ ticket: 'bac', scratched: 75, wins: 20 });
    expect(unlockProgress(state, 'vang').winsDone).toBe(false);
    const withBacWins = { ...state, stats: { ...state.stats, bac: { scratched: 75, wins: 20, jackpots: 0 } } };
    expect(unlockProgress(withBacWins, 'vang').canBuyLicense).toBe(true);
  });

  it('can recover a broke starter run and buy a first Bạc ticket without a jackpot', () => {
    let state = createInitialState(453);
    let promos = 0;
    for (let i = 0; i < 30; i++) {
      if (isBroke(state)) {
        state = claimPromo(updatePromo(state, 0), BALANCE.promoIntervalMs);
        expect(state.ticket?.free).toBe(true);
        promos++;
      } else {
        state = buyTicket(state, 'dong');
      }
      state = collectTicket(revealTicket(state));
    }
    expect(promos).toBe(1);
    expect(state.stats.dong.jackpots).toBe(0);
    expect(unlockProgress(state, 'bac').canBuyLicense).toBe(true);
    expect(buyTicket(buyLicense(state, 'bac'), 'bac').ticket?.type).toBe('bac');
  });
});
