import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKETS, ticketDef } from '../data/tickets';
import { buyTicket, claimPromo, collectTicket, isBroke, isUnlocked, revealTicket, selectTicket, updatePromo } from './economy';
import { createInitialState, type GameState } from './state';
import { buyLicense, unlockProgress } from './unlocks';

const bac = ticketDef('bac');
const bacUnlock = bac.unlock!;
const bacRequiredMoney = bacUnlock.licenseCost + bac.price;

/** A player who meets every requirement for Vé Bạc. */
function readyForBac(): GameState {
  const state = createInitialState(1);
  return {
    ...state,
    money: bacRequiredMoney,
    totalEarned: bacUnlock.totalEarned,
    stats: { ...state.stats, dong: { scratched: bacUnlock.mission.scratched, wins: 90, jackpots: 0, bigWins: bacUnlock.mission.bigWins } },
  };
}

describe('unlock data', () => {
  it('only the first ticket is free to play', () => {
    expect(TICKETS.map((def) => def.unlock === null)).toEqual([true, false, false, false, false, false]);
  });

  it('each ticket is unlocked through the one before it', () => {
    for (let i = 1; i < TICKETS.length; i++) {
      const previous = TICKETS[i - 1];
      const unlock = TICKETS[i]?.unlock;
      expect(unlock?.mission.ticket).toBe(previous?.id);
      expect(unlock?.mission.scratched).toBeGreaterThan(0);
      expect(unlock?.mission.bigWins).toBeGreaterThan(0);
      expect(unlock?.licenseCost).toBeGreaterThan(0);
      expect(unlock?.totalEarned).toBeGreaterThan(previous?.unlock?.totalEarned ?? 0);
    }
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
      bigWinsDone: false,
      affordable: false,
      requiredMoney: bacRequiredMoney,
      canBuyLicense: false,
    });
  });

  it.each([
    ['revenue', (s: GameState) => ({ ...s, totalEarned: bacUnlock.totalEarned - 1 })],
    ['tickets scratched', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, scratched: bacUnlock.mission.scratched - 1 } } })],
    ['big wins', (s: GameState) => ({ ...s, stats: { ...s.stats, dong: { ...s.stats.dong, bigWins: bacUnlock.mission.bigWins - 1 } } })],
    ['license and first ticket money', (s: GameState) => ({ ...s, money: bacRequiredMoney - 1 })],
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

  it('missions count big wins of the right ticket', () => {
    const state = { ...readyForBac(), money: 1e6, totalEarned: 1e6, licenseElapsedMs: 20 * 60_000 };
    const mission = ticketDef('vang').unlock!.mission;
    expect(mission.ticket).toBe('bac');
    expect(unlockProgress(state, 'vang').bigWinsDone).toBe(false);
    const withBacBigWins = { ...state, stats: { ...state.stats, bac: { ...state.stats.bac, scratched: mission.scratched, bigWins: mission.bigWins } } };
    expect(unlockProgress(withBacBigWins, 'vang').canBuyLicense).toBe(true);
  });

  it('can recover a broke starter run without skipping the Bạc mission', () => {
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
    expect(state.money).toBeGreaterThanOrEqual(ticketDef('dong').price);
    expect(unlockProgress(state, 'bac').canBuyLicense).toBe(false);
    expect(buyLicense(state, 'bac')).toBe(state);
  });

  it('still requires more scratches than 40 minutes at four tickets per minute without upgrades', () => {
    const ready = readyForBac();
    const state = { ...ready, stats: { ...ready.stats, dong: { ...ready.stats.dong, scratched: 40 * 4 } } };
    expect(unlockProgress(state, 'bac')).toMatchObject({
      revenueDone: true, bigWinsDone: true, affordable: true, scratchedDone: false, canBuyLicense: false,
    });
  });
});
