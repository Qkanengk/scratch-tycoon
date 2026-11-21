import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKETS, type TicketId } from '../data/tickets';
import { advancePlayTime, buyTicket, claimPromo, collectTicket, rentAmount, returnFake, revealTicket, startScratch, timeToNextRent, uncoverCell, updatePromo } from './economy';
import { createInitialState, type GameState } from './state';
import { buyTool, repairPrice, repairTool, toolRadius } from './tools';
import { deserialize, recordScratch, serialize } from './save';
import { layoutTicket } from '../render/layout';
import { createMask, encodeMask, scratchSegment } from './scratch';

function rich(seed = 1): GameState {
  return { ...createInitialState(seed), money: 1e9, licenses: TICKETS.map(t => t.id) };
}

describe('drains', () => {
  it('taxes only profit and preserves gross/tax/net through a save', () => {
    for (const id of TICKETS.map(t => t.id)) {
      for (let seed = 1; seed < 100; seed++) {
        const state = buyTicket(rich(seed), id);
        const ticket = state.ticket!;
        const def = TICKETS.find(t => t.id === id)!;
        expect(ticket.tax).toBe(Math.floor(Math.max(0, ticket.gross - def.price) * BALANCE.taxRates[id]));
        expect(ticket.net).toBe(ticket.gross - ticket.tax);
        expect(deserialize(serialize(state))).toEqual(state);
        expect(collectTicket(revealTicket(state)).money).toBe(state.money + ticket.net);
      }
    }
  });

  it('charges rent only for supplied play time, carries debt, and withholds net winnings', () => {
    let state = { ...createInitialState(5), money: 2 };
    expect(advancePlayTime(state, 0)).toBe(state);
    expect(advancePlayTime(state, NaN)).toBe(state);
    expect(timeToNextRent(state)).toBe(BALANCE.rentIntervalMs);
    state = advancePlayTime(state, BALANCE.rentIntervalMs * 2 + 100);
    expect(state.money).toBe(0);
    expect(state.rentDebt).toBe(8);
    expect(timeToNextRent(state)).toBe(BALANCE.rentIntervalMs - 100);
    expect(deserialize(serialize(state), 1e12)).toEqual(state);
    state = claimPromo(updatePromo(state, 0), BALANCE.promoIntervalMs);
    expect(state.ticket?.free).toBe(true);
    const net = state.ticket!.net;
    const collected = collectTicket(revealTicket(state));
    expect(collected.money).toBe(Math.max(0, net - 8));
    expect(collected.rentDebt).toBe(Math.max(0, 8 - net));
    expect(rentAmount(rich())).toBe(BALANCE.rentAmounts.rong);
  });

  it('wears once per scratch, stays usable, repairs proportionally, and protects the coin', () => {
    const initial = buyTicket(buyTool(rich(), 'key'), 'dong');
    const radius = toolRadius(initial);
    const scratched = startScratch(initial);
    expect(startScratch(scratched)).toBe(scratched);
    expect(scratched.durability.key).toBe(1 - BALANCE.ticketWear);
    const worn = { ...scratched, durability: { ...scratched.durability, key: 0 } };
    expect(toolRadius(worn)).toBeCloseTo(radius * .6);
    expect(repairPrice(worn, 'key')).toBe(30);
    expect(repairTool(worn, 'key').durability.key).toBe(1);
    expect(repairTool({ ...worn, money: 0 }, 'key').durability.key).toBe(0);
    expect(startScratch(buyTicket(rich(), 'dong')).durability.coin).toBe(1);
  });

  it('returns only untouched bought fakes and never creates fake promos', () => {
    let fake: GameState | undefined;
    for (let seed = 1; seed < 1000; seed++) {
      const state = buyTicket(rich(seed), 'vang');
      if (state.ticket!.fakeTell) { fake = state; break; }
    }
    expect(fake).toBeDefined();
    expect(fake!.ticket!.gross).toBe(0);
    expect(returnFake(fake!).money).toBe(fake!.money + 950);
    expect(returnFake(startScratch(fake!)).ticket).not.toBeNull();
    expect(collectTicket(revealTicket(fake!)).money).toBe(fake!.money);
    const empty = createInitialState(1);
    expect(returnFake(empty)).toBe(empty);
    for (let seed = 1; seed < 100; seed++) {
      const promo = claimPromo(updatePromo({ ...rich(seed), money: 0, rentDebt: 1e6 }, 0), BALANCE.promoIntervalMs);
      expect(promo.ticket?.fakeTell).toBeNull();
    }
  });

  it.each(['ngoc', 'rong'] as TicketId[])('hits bombs once on %s without changing the prize', id => {
    let state: GameState | undefined;
    for (let seed = 1; seed < 100; seed++) {
      const candidate = buyTicket(buyTool(rich(seed), 'key'), id);
      if (candidate.ticket!.cells.some(c => c.type === 'bomb')) { state = candidate; break; }
    }
    expect(state).toBeDefined();
    const index = state!.ticket!.cells.findIndex(c => c.type === 'bomb');
    const hit = uncoverCell(state!, index);
    expect(hit.durability.key).toBeCloseTo(1 - BALANCE.ticketWear - BALANCE.bombWear);
    expect(uncoverCell(hit, index)).toBe(hit);
    expect(hit.ticket?.prize).toBe(state!.ticket?.prize);
    expect(deserialize(serialize(hit))).toEqual(hit);
    const layout = layoutTicket(TICKETS.find(t => t.id === id)!.rules);
    const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
    const cell = layout.cells[index]!;
    scratchSegment(mask, { x: cell.x, y: cell.y }, { x: cell.x + cell.w, y: cell.y + cell.h }, cell.w / 2);
    const recorded = recordScratch(state!, state!.ticket!, encodeMask(mask));
    expect(recorded.ticket?.hitBombs).toContain(index);
    expect(recorded.durability.key).toBeLessThanOrEqual(1 - BALANCE.bombWear);
    expect(uncoverCell(createInitialState(1), index).ticket).toBeNull();
  });
});
