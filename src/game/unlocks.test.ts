import { describe, expect, it } from 'vitest';
import { TICKETS, ticketDef } from '../data/tickets';
import { buyTicket, isUnlocked, selectTicket } from './economy';
import { createInitialState, type GameState } from './state';
import { buyLicense, unlockProgress } from './unlocks';

/** A player who meets every requirement for Vé Bạc. */
function readyForBac(): GameState {
  const state = createInitialState(1);
  return {
    ...state,
    money: 500,
    totalEarned: 5_000,
    stats: { ...state.stats, dong: { scratched: 200, wins: 90, jackpots: 1 } },
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
      expect(unlock?.licenseCost).toBe((previous?.price ?? 0) * 50);
    }
    expect(TICKETS.map((def) => def.unlock?.totalEarned ?? 0)).toEqual([0, 5_000, 150_000, 5_000_000, 200_000_000]);
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
      jackpotDone: false,
      affordable: false,
      canBuyLicense: false,
    });
  });

  it.each([
    ['revenue', (s: GameState) => ({ ...s, totalEarned: 4_999 })],
    ['tickets scratched', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, scratched: 199 } } })],
    ['jackpot', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, jackpots: 0 } } })],
    ['license money', (s: GameState) => ({ ...s, money: 499 })],
  ])('is refused while the %s requirement is short', (_name, shorten) => {
    const state = shorten(readyForBac());
    expect(unlockProgress(state, 'bac').canBuyLicense).toBe(false);
    expect(buyLicense(state, 'bac')).toBe(state);
  });

  it('is sold once every requirement is met, and then the ticket can be bought', () => {
    const ready = { ...readyForBac(), money: 700 };
    expect(unlockProgress(ready, 'bac').canBuyLicense).toBe(true);
    const licensed = buyLicense(ready, 'bac');
    expect(licensed.money).toBe(200);
    expect(licensed.licenses).toEqual(['bac']);
    expect(unlockProgress(licensed, 'bac').unlocked).toBe(true);
    expect(buyLicense(licensed, 'bac')).toBe(licensed);

    const bought = buyTicket(selectTicket(licensed, 'bac'), 'bac');
    expect(bought.ticket?.type).toBe('bac');
    expect(bought.money).toBe(100);
    expect(bought.selected).toBe('bac');
  });

  it('does not skip a ticket type', () => {
    const state = { ...readyForBac(), money: 1e12, totalEarned: 1e12 };
    expect(buyLicense(state, 'vang')).toBe(state);
    expect(selectTicket(state, 'vang')).toBe(state);
  });

  it('missions count jackpots of the right ticket', () => {
    const unlock = ticketDef('vang').unlock;
    expect(unlock?.mission).toEqual({ ticket: 'bac', scratched: 200, jackpots: 1 });
  });
});
