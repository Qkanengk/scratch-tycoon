import { describe, expect, it } from 'vitest';
import { STOCK } from '../data/balance';
import { TICKETS } from '../data/tickets';
import { prestigeThreshold } from '../data/prestige';
import { advanceAutomation, automationAction, loadRobot, settleAway } from './automation';
import { buyTicket, canBuyTicket, claimPromo, updatePromo } from './economy';
import { advanceKioskTime } from './kioskTime';
import { prestige } from './prestige';
import { deserialize, migrate, serialize } from './save';
import { createInitialState, SAVE_VERSION } from './state';
import { advanceStock, consumeStock, initialStock, restockCountdown, rushRestock } from './stock';

const lastTicket = () => ({ ...createInitialState(4), money: 1e8,
  stock: { ...initialStock(), dong: { remaining: 1, remainingMs: 0 } } });
const soldOut = () => consumeStock(lastTicket(), 'dong');

describe('limited stock', () => {
  it.each(TICKETS)('$id sells out in 8–15 minutes at four seconds per ticket and rush costs 20–40 tickets', def => {
    const stock = STOCK[def.id];
    expect(stock.capacity * 4 / 60).toBeGreaterThanOrEqual(8);
    expect(stock.capacity * 4 / 60).toBeLessThanOrEqual(15);
    expect(stock.rushFee / def.price).toBeGreaterThanOrEqual(20);
    expect(stock.rushFee / def.price).toBeLessThanOrEqual(40);
    let state = { ...createInitialState(4), money: 1e12, licenses: TICKETS.map(ticket => ticket.id), prestige: { tier: 1, runEarned: 0 } };
    for (let i = 0; i < stock.capacity; i++) {
      state = buyTicket(state, def.id);
      expect(state.ticket?.type).toBe(def.id);
      state = advanceStock({ ...state, ticket: null }, 4000);
    }
    expect(state.stock[def.id]).toEqual({ remaining: 0, remainingMs: stock.restockMs - 4000 });
    expect(canBuyTicket(state, def.id)).toBe(false);
    expect(advanceStock(state, stock.restockMs - 4000).stock[def.id].remaining).toBe(stock.capacity);
  });

  it('consumes paid tickets and starts the timer only on sellout', () => {
    const first = buyTicket(createInitialState(4), 'dong');
    expect(first.stock.dong).toEqual({ remaining: STOCK.dong.capacity - 1, remainingMs: 0 });
    const bought = buyTicket(lastTicket(), 'dong');
    expect(bought.stock.dong).toEqual({ remaining: 0, remainingMs: STOCK.dong.restockMs });
    const emptyDesk = { ...bought, ticket: null };
    expect(canBuyTicket(emptyDesk, 'dong')).toBe(false);
    expect(buyTicket(emptyDesk, 'dong')).toBe(emptyDesk);
    expect(consumeStock(emptyDesk, 'dong')).toBe(emptyDesk);
  });

  it('refills at the deadline through kiosk time, including without robots', () => {
    const half = advanceKioskTime(soldOut(), 30_000);
    expect(half.stock.dong).toEqual({ remaining: 0, remainingMs: 30_000 });
    expect(advanceKioskTime(half, 30_000).stock.dong).toEqual(initialStock().dong);
    expect(advanceStock(half, NaN)).toBe(half);
    expect(restockCountdown(60_001)).toBe('1:01');
  });

  it('charges only affordable rush orders on empty stock', () => {
    const state = soldOut();
    const rushed = rushRestock(state, 'dong');
    expect(rushed.money).toBe(state.money - STOCK.dong.rushFee);
    expect(rushed.stock.dong).toEqual(initialStock().dong);
    expect(rushRestock(rushed, 'dong')).toBe(rushed);
    const poor = { ...state, money: STOCK.dong.rushFee - 1 };
    expect(rushRestock(poor, 'dong')).toBe(poor);
  });

  it.each([false, true])('robots idle then resume at restock (away=%s)', away => {
    let state = automationAction(soldOut(), 'robot');
    state = { ...state, automation: { ...state.automation, autoBuy: true } };
    expect(loadRobot(state, 0)).toBe(state);
    const waiting = advanceAutomation(state, 59_000, away);
    expect(waiting.automation.robots[0]?.tray).toBeNull();
    expect(waiting.automation.robots[0]?.charge).toBe(state.automation.robots[0]?.charge);
    const done = advanceAutomation(waiting, 5_000, away);
    expect(done.automation.report.tickets).toBe(1);
    expect(done.stock.dong.remaining).toBe(STOCK.dong.capacity - 1);
    expect(advanceAutomation(state, 64_000, away)).toEqual(done);
    if (away) {
      const prepared = { ...state, automation: { ...state.automation, away: true, lastSeenAt: 1000 } };
      expect(settleAway(prepared, 65_000).stock).toEqual(done.stock);
    }
  });

  it('promo is independent of stock and prestige resets stock', () => {
    const state = soldOut();
    const free = claimPromo(updatePromo({ ...state, money: 0 }, 0), 20_000);
    expect(free.ticket?.free).toBe(true);
    expect(free.stock).toEqual(state.stock);
    expect(prestige({ ...state, licenses: ['rong'], prestige: { tier: 0, runEarned: prestigeThreshold(1) } }).stock).toEqual(initialStock());
  });
});

describe('stock saves', () => {
  it('round-trips counts and running timers', () => {
    const state = advanceStock(soldOut(), 1234);
    expect(deserialize(serialize(state))?.stock).toEqual(state.stock);
  });
  it('migrates v7 to full stock without timers', () => {
    const state = migrate({ ...soldOut(), version: 7 });
    expect(state?.version).toBe(SAVE_VERSION);
    expect(state?.stock).toEqual(initialStock());
  });
  it('validates missing, malformed, excessive and negative entries', () => {
    const state = migrate({ ...soldOut(), stock: {
      dong: { remaining: -1, remainingMs: Infinity }, bac: { remaining: 0, remainingMs: -1 },
      vang: { remaining: 1e9, remainingMs: 12 }, ngoc: { remaining: 2.9 }, rong: null,
    } })!;
    expect(state.stock.dong).toEqual(initialStock().dong);
    expect(state.stock.bac).toEqual({ remaining: 0, remainingMs: STOCK.bac.restockMs });
    expect(state.stock.vang).toEqual(initialStock().vang);
    expect(state.stock.ngoc).toEqual({ remaining: 2, remainingMs: 0 });
    expect(state.stock.rong).toEqual(initialStock().rong);
    expect(state.stock.vutru).toEqual(initialStock().vutru);
  });
});
