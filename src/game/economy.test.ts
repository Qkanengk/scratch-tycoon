import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { ticketDef } from '../data/tickets';
import {
  buyTicket,
  canBuyTicket,
  canClaimPromo,
  claimPromo,
  collectTicket,
  isBroke,
  revealTicket,
  updatePromo,
} from './economy';
import { createInitialState, type GameState } from './state';
import { advanceStock } from './stock';
import { STOCK } from '../data/balance';

function play(state: GameState): GameState {
  return collectTicket(revealTicket(buyTicket(state, 'dong')));
}

describe('buying and collecting', () => {
  it('starts with money and an empty table', () => {
    const state = createInitialState(1);
    expect(state.money).toBe(BALANCE.startingMoney);
    expect(state.ticket).toBeNull();
  });

  it('takes the price and puts a covered ticket on the table', () => {
    const state = buyTicket(createInitialState(1), 'dong');
    expect(state.money).toBe(BALANCE.startingMoney - 10);
    expect(state.ticket?.revealed).toBe(false);
    expect(state.ticket?.serial).toBe(1);
    expect(state.nextSerial).toBe(2);
  });

  it('does not buy while a ticket is on the table, without money, or without a license', () => {
    const busy = buyTicket(createInitialState(1), 'dong');
    expect(buyTicket(busy, 'dong')).toBe(busy);
    const poor = { ...createInitialState(1), money: 9 };
    expect(canBuyTicket(poor, 'dong')).toBe(false);
    expect(buyTicket(poor, 'dong')).toBe(poor);
    const rich = { ...createInitialState(1), money: 1_000_000 };
    expect(buyTicket(rich, 'bac')).toBe(rich);
  });

  it('pays nothing until the ticket is scratched', () => {
    const bought = buyTicket(createInitialState(1), 'dong');
    expect(collectTicket(bought)).toBe(bought);
  });

  it('reveals the gross prize decided at purchase and pays the final net prize', () => {
    let state = createInitialState(5);
    for (let i = 0; i < 300; i++) {
      state = advanceStock(state, STOCK.dong.restockMs);
      const bought = buyTicket(state, 'dong');
      const prize = bought.ticket?.prize ?? 0;
      const revealed = revealTicket(bought);
      expect(revealed.ticket?.prize ?? 0).toBe(prize);
      const net = revealed.ticket?.net ?? 0;
      const collected = collectTicket(revealed);
      expect(collected.money).toBe(bought.money + net);
      expect(collected.totalEarned).toBe(state.totalEarned + net);
      expect(collected.ticket).toBeNull();
      state = { ...collected, money: 100 };
    }
    expect(state.stats.dong.scratched).toBe(300);
    expect(state.stats.dong.wins).toBeGreaterThan(100);
  });

  it('counts a scratched ticket once', () => {
    const revealed = revealTicket(buyTicket(createInitialState(1), 'dong'));
    expect(revealTicket(revealed)).toBe(revealed);
    expect(revealed.stats.dong.scratched).toBe(1);
  });

  it.each([[2, 0], [5, 1], [20, 1]])('credits a big win for qualifying ×%i prizes', (multiplier, expected) => {
    const state = buyTicket(createInitialState(1), 'dong');
    const def = ticketDef('dong');
    const ticket = { ...state.ticket!, tier: def.prizes.findIndex(prize => prize.multiplier === multiplier), prize: multiplier * def.price };
    const revealed = revealTicket({ ...state, ticket });
    expect(revealed.stats.dong.bigWins).toBe(expected);
    expect(revealTicket(revealed).stats.dong.bigWins).toBe(expected);
  });

  it('gives the same tickets for the same seed', () => {
    const a = play(play(createInitialState(77)));
    const b = play(play(createInitialState(77)));
    expect(a).toEqual(b);
  });
});

describe('promo ticket', () => {
  const broke = { ...createInitialState(1), money: 3 };

  it('is only for a player who cannot buy the cheapest ticket', () => {
    expect(isBroke(createInitialState(1))).toBe(false);
    expect(isBroke(broke)).toBe(true);
    expect(updatePromo(createInitialState(1), 1000).promoReadyAt).toBeNull();
  });

  it('becomes claimable after the interval', () => {
    const waiting = updatePromo(broke, 1000);
    expect(waiting.promoReadyAt).toBe(1000 + BALANCE.promoIntervalMs);
    expect(waiting.promoReadyAt).toBe(21_000);
    expect(updatePromo(waiting, 5000)).toBe(waiting);
    expect(canClaimPromo(waiting, 1000 + BALANCE.promoIntervalMs - 1)).toBe(false);
    expect(claimPromo(waiting, 2000)).toBe(waiting);

    const claimed = claimPromo(waiting, 1000 + BALANCE.promoIntervalMs);
    expect(claimed.ticket?.free).toBe(true);
    expect(claimed.ticket?.type).toBe(BALANCE.promoTicket);
    expect(claimed.money).toBe(3);
    expect(claimed.promoReadyAt).toBeNull();
  });

  it('restarts the wait after a free ticket that leaves the player broke', () => {
    const claimed = claimPromo(updatePromo(broke, 0), BALANCE.promoIntervalMs);
    const after = collectTicket(revealTicket(claimed));
    const next = updatePromo(after, 50_000);
    expect(next.promoReadyAt).toBe(isBroke(after) ? 50_000 + BALANCE.promoIntervalMs : null);
  });

  it('offers the highest unlocked ticket when broke, not the last played or most expensive locked one', () => {
    const licensed = { ...broke, licenses: ['vang', 'bac'] as GameState['licenses'] };
    const ready = updatePromo(licensed, 0);
    const claimed = claimPromo(ready, BALANCE.promoIntervalMs);
    expect(claimed.ticket).toMatchObject({ type: 'vang', free: true });
    expect(claimed.money).toBe(licensed.money);
    expect(claimPromo({ ...ready, money: 10 }, BALANCE.promoIntervalMs).ticket).toBeNull();
    expect(claimPromo(claimed, BALANCE.promoIntervalMs)).toBe(claimed);
  });

  it('cancels the wait once the player has money again', () => {
    const waiting = updatePromo(broke, 0);
    expect(updatePromo({ ...waiting, money: 10 }, 10).promoReadyAt).toBeNull();
  });
});
