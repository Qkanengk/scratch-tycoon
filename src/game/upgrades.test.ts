import { describe, expect, it } from 'vitest';
import { BULK_LOTS, UPGRADES, type UpgradeId } from '../data/upgrades';
import { BALANCE, INCIDENTS } from '../data/balance';
import { TICKETS, ticketDef } from '../data/tickets';
import { prestigeThreshold } from '../data/prestige';
import { buyUpgrade, currentRound, deskSlots, heldCount, holdCapacity, luckPercent, maxBulkLot, setBulkLot, upgradePrice } from './upgrades';
import { createInitialState, type GameState, type Ticket } from './state';
import { buyTicket, canBuyTicket, claimPromo, collectTicket, returnTicket, revealTicket, updatePromo } from './economy';
import { advanceAutomation, automationAction, loadRobot, robotInterval, settleAway } from './automation';
import { acceptContract, contractOffer } from './contracts';
import { deserialize, migrate, recordReveal, serialize } from './save';
import { prestige } from './prestige';
import { generateCells, luckTierWeight } from './tickets';
import { Rng } from './rng';
import { tickIncidents } from './incidents';

const fresh = (): GameState => ({ ...createInitialState(4), money: 1e15 });
const bulkState = (): GameState => ({ ...fresh(), upgrades: { luck: 0, desk: 2, bulk: 1 }, bulkLot: 5 });

function winning(serial: number, type: Ticket['type'] = 'dong'): Ticket {
  const ticket = buyTicket(fresh(), 'dong').ticket!;
  return { ...ticket, serial, type, tier: 3, gross: 50, prize: 50, tax: 2, net: 48, fakeTell: null };
}

describe('upgrade purchases', () => {
  it.each(Object.keys(UPGRADES) as UpgradeId[])('prices and caps %s without mutating state', id => {
    let state = fresh();
    for (let level = 0; level < UPGRADES[id].maxLevel; level++) {
      const before = serialize(state);
      const price = Math.ceil(UPGRADES[id].base * UPGRADES[id].growth ** level);
      expect(upgradePrice(state, id)).toBe(price);
      expect(buyUpgrade({ ...state, money: price - 1 }, id).upgrades[id]).toBe(level);
      const next = buyUpgrade(state, id);
      expect(next.money).toBe(state.money - price);
      expect(next.upgrades[id]).toBe(level + 1);
      expect(serialize(state)).toBe(before);
      state = next;
    }
    expect(upgradePrice(state, id)).toBe(Infinity);
    expect(buyUpgrade(state, id)).toBe(state);
    expect(buyUpgrade({ ...fresh(), money: 0 }, id).upgrades[id]).toBe(0);
  });

  it('defaults to the largest unlocked lot and accepts only unlocked lot sizes', () => {
    let state = fresh();
    expect([deskSlots(state), maxBulkLot(state), holdCapacity(state)]).toEqual([1, 1, 1]);
    for (let level = 1; level <= 3; level++) {
      state = buyUpgrade(state, 'bulk');
      expect(state.bulkLot).toBe(BULK_LOTS[level]);
    }
    expect(setBulkLot(state, 5).bulkLot).toBe(5);
    expect(setBulkLot(state, 2)).toBe(state);
    expect(setBulkLot(fresh(), 5).bulkLot).toBe(1);
    expect(holdCapacity({ ...state, upgrades: { ...state.upgrades, desk: 7 } })).toBe(50);
    expect(holdCapacity({ ...fresh(), upgrades: { luck: 0, desk: 7, bulk: 0 } })).toBe(8);
  });
});

describe('luck distribution', () => {
  it.each(TICKETS)('increases $id RTP monotonically, favoring higher winning tiers, capped at 50%', def => {
    let previous = 0;
    for (let luck = 0; luck <= 50; luck++) {
      const weights = def.prizes.map((tier, index) => luckTierWeight(tier, index, def.prizes.length, luck));
      const total = weights.reduce((a, b) => a + b, 0);
      const rtp = weights.reduce((sum, weight, index) => sum + weight * def.prizes[index]!.multiplier, 0) / total;
      expect(rtp).toBeGreaterThan(previous);
      expect(rtp).toBeLessThanOrEqual(def.baseReturn * 1.5 + 1e-10);
      expect(weights[0]).toBe(def.prizes[0]!.weight);
      previous = rtp;
    }
    def.prizes.forEach((tier, index) => {
      expect(luckTierWeight(tier, index, def.prizes.length, 1000)).toBe(luckTierWeight(tier, index, def.prizes.length, 50));
      expect(luckTierWeight(tier, index, def.prizes.length, -1)).toBe(tier.weight);
    });
    const last = def.prizes.length - 1;
    expect(luckTierWeight(def.prizes[last]!, last, def.prizes.length, 50) / def.prizes[last]!.weight)
      .toBeGreaterThan(luckTierWeight(def.prizes[1]!, 1, def.prizes.length, 50) / def.prizes[1]!.weight);
  });

  it.each(['desk', 'robot', 'away', 'free'] as const)('passes luck independently of incident weight for %s placements', source => {
    let changed = false;
    for (let seed = 1; seed <= 100; seed++) {
      const base: GameState = { ...fresh(), rngState: seed, upgrades: { luck: 50, desk: 0, bulk: 0 },
        incidents: { ...fresh().incidents, current: { kind: 'badLuck', phase: 'active', remainingMs: 1000, cost: 0 } } };
      const weight = source === 'free' || source === 'away' ? 1 : INCIDENTS.badLuckPrizeWeight;
      const expected = generateCells(ticketDef('dong'), new Rng(seed), weight, 25);
      const state = source === 'free' ? claimPromo({ ...base, money: 0, promoReadyAt: 0 }, 1) : buyTicket(base, 'dong', source);
      expect(state.ticket?.tier).toBe(expected.tier);
      expect(state.ticket?.cells).toEqual(expected.cells);
      changed ||= expected.tier !== generateCells(ticketDef('dong'), new Rng(seed), weight).tier;
    }
    expect(changed).toBe(true);
    expect(luckPercent({ ...fresh(), upgrades: { luck: 100, desk: 0, bulk: 0 } })).toBe(50);
  });
});

describe('bulk hold', () => {
  it('draws every ticket independently at purchase, charging and consuming stock per ticket', () => {
    const state = bulkState();
    const bought = buyTicket(state, 'dong');
    expect(heldCount(bought)).toBe(5);
    expect(bought.money).toBe(state.money - 50);
    expect(bought.stock.dong.remaining).toBe(state.stock.dong.remaining - 5);
    let singles: GameState = { ...state, bulkLot: 1 };
    for (let i = 0; i < 5; i++) singles = buyTicket(singles, 'dong');
    expect([bought.ticket, ...bought.deskQueue]).toEqual([singles.ticket, ...singles.deskQueue]);
    expect(bought.rngState).toBe(singles.rngState);
    expect(buyTicket(bought, 'dong')).toBe(bought);
    expect(bought.nextSerial).toBe(state.nextSerial + 5);
  });

  it.each(['money', 'stock', 'space'] as const)('limits quantity by %s, allows buying while scratching', limit => {
    let state = bulkState();
    if (limit === 'money') state = { ...state, money: 29 };
    if (limit === 'stock') state = { ...state, stock: { ...state.stock, dong: { remaining: 2, remainingMs: 0 } } };
    if (limit === 'space') state = { ...state, ticket: winning(100), deskQueue: [winning(101), winning(102)] };
    const bought = buyTicket(state, 'dong');
    expect(heldCount(bought) - heldCount(state)).toBe(2);
    if (state.ticket) expect(bought.ticket).toBe(state.ticket);
    if (limit === 'stock') expect(bought.stock.dong.remainingMs).toBeGreaterThan(0);
  });

  it('rejects empty stock, insufficient funds, locked tickets and a full hold', () => {
    const state = bulkState();
    for (const invalid of [{ ...state, money: 9 }, { ...state, stock: { ...state.stock, dong: { remaining: 0, remainingMs: 1 } } }, buyTicket(state, 'dong')]) {
      expect(canBuyTicket(invalid, 'dong')).toBe(false);
      expect(buyTicket(invalid, 'dong')).toBe(invalid);
    }
    expect(buyTicket(state, 'bac')).toBe(state);
    expect(currentRound(state)).toEqual([]);
    expect(collectTicket(state)).toBe(state);
    expect(revealTicket(state)).toBe(state);
  });

  it('holds fifty tickets at maximum bulk and reveals at most eight per round', () => {
    const state = { ...fresh(), upgrades: { luck: 0, desk: 7, bulk: 3 }, bulkLot: 50 as const };
    const bought = buyTicket(state, 'dong');
    expect(heldCount(bought)).toBe(50);
    expect(currentRound(bought)).toHaveLength(8);
    const revealed = revealTicket(bought);
    expect(revealed.stats.dong.scratched).toBe(8);
    expect(heldCount(collectTicket(revealed))).toBe(42);
  });

  it('consumes defective stock only on the first paid desk placement in a lot', () => {
    const state = bulkState();
    const bought = buyTicket({ ...state, incidents: { ...state.incidents, current: { kind: 'defectiveStock', phase: 'active', remainingMs: 1000, cost: 0 } } }, 'dong');
    expect(bought.ticket?.defective).toBe(true);
    expect(bought.deskQueue.every(ticket => !ticket.defective)).toBe(true);
    expect(bought.incidents.current).toBeNull();
  });
});

describe('wide desk rounds', () => {
  it('opens only consecutive same-type followers, then promotes the queue after collection', () => {
    const state = { ...bulkState(), ticket: winning(1), deskQueue: [winning(2), winning(3, 'bac'), winning(4)] };
    expect(currentRound(state).map(ticket => ticket.serial)).toEqual([1, 2]);
    const revealed = revealTicket(state);
    expect(revealed.deskQueue.map(ticket => ticket.revealed)).toEqual([true, false, false]);
    expect(revealTicket(revealed)).toBe(revealed);
    const collected = collectTicket(revealed);
    expect(collected.ticket?.serial).toBe(3);
    expect(collected.deskQueue.map(ticket => ticket.serial)).toEqual([4]);
    expect(collectTicket(collected)).toBe(collected);
  });

  it('matches sequential per-ticket accounting, including contracts, journal, golden hour, debt and fake followers', () => {
    let state = bulkState();
    state = acceptContract({ ...state, contracts: { ...state.contracts, offered: { ...contractOffer('scratch', 'dong'), target: 3 } } });
    state = { ...state, ticket: winning(1), deskQueue: [winning(2), { ...winning(3), gross: 0, prize: 0, tax: 0, net: 0, fakeTell: 'missing-seal' }],
      rentDebt: 70, equippedTool: 'key', ownedTools: ['coin', 'key'], goldenHour: { ...state.goldenHour, active: true } };
    const round = currentRound(state);
    let sequential = { ...state, ticket: null, deskQueue: [] } as GameState;
    round.forEach((ticket, index) => {
      sequential = collectTicket(revealTicket({ ...sequential, ticket, equippedTool: index ? 'coin' : 'key' }));
    });
    sequential = { ...sequential, equippedTool: 'key' };
    const revealed = recordReveal(state, state.ticket!);
    expect(revealed.stats.dong.scratched).toBe(3);
    expect(revealed.deskQueue[1]!.net).toBe(0);
    const collected = collectTicket(revealed);
    expect(collected).toEqual(sequential);
    expect(collected.contracts.result?.success).toBe(true);
    expect(collected.rentDebt).toBe(0);
    expect(recordReveal(collected, state.ticket!)).toBe(collected);
  });

  it('reveals follower bombs with the coin, matching robot wear rather than wearing the player tool', () => {
    const state = { ...bulkState(), equippedTool: 'key' as const, ticket: winning(1),
      deskQueue: [{ ...winning(2), cells: [{ type: 'bomb' as const }] }] };
    const single = revealTicket({ ...state, deskQueue: [] });
    const revealed = revealTicket(state);
    expect(revealed.durability).toEqual(single.durability);
    expect(revealed.equippedTool).toBe('key');
    expect(revealed.deskQueue[0]!.hitBombs).toEqual([0]);
    expect(revealed.deskQueue[0]!.scratchStarted).toBe(true);
  });

  it('returns only the active ticket and promotes the next ticket without revealing it', () => {
    const state = { ...bulkState(), ticket: { ...winning(1), defective: true as const }, deskQueue: [winning(2)] };
    const next = returnTicket(state);
    expect(next.ticket?.serial).toBe(2);
    expect(next.ticket?.revealed).toBe(false);
    expect(next.money).toBeGreaterThan(state.money);
    expect(returnTicket(next)).toBe(next);
  });

  it('does not include newly purchased tickets in an already revealed round', () => {
    const state = revealTicket({ ...bulkState(), ticket: winning(1), deskQueue: [] });
    const bought = buyTicket(state, 'dong');
    expect(currentRound(bought).length).toBe(1);
    expect(collectTicket(bought).ticket?.revealed).toBe(false);
  });
});

describe('queue integrations', () => {
  it.each([false, true])('loads robots from outside the open round without buying (away=%s)', away => {
    const state = automationAction(buyTicket(bulkState(), 'dong'), 'robot');
    const next = loadRobot(state, 0, away);
    expect(next.automation.robots[0]!.tray).toBe(state.deskQueue[2]);
    expect(next.money).toBe(state.money);
    expect(next.stock).toBe(state.stock);
    expect(next.rngState).toBe(state.rngState);
    expect(next.ticket).toBe(state.ticket);
    expect(currentRound(next)).toEqual(currentRound(state));
    expect(next.deskQueue.length).toBe(3);
    expect(loadRobot(next, 0)).toBe(next);
  });

  it('buys a single fresh ticket if all queued tickets belong to the open round', () => {
    const state = automationAction({ ...bulkState(), ticket: winning(100), deskQueue: [winning(101), winning(102)] }, 'robot');
    const next = loadRobot(state, 0);
    expect(next.automation.robots[0]!.tray?.serial).toBe(state.nextSerial);
    expect(next.money).toBe(state.money - 10);
    expect(next.deskQueue).toEqual(state.deskQueue);
  });

  it('autoBuy and away consume queued tickets without losing or revealing the open round', () => {
    let state = automationAction(buyTicket(bulkState(), 'dong'), 'robot');
    state = { ...state, automation: { ...state.automation, autoBuy: true, away: true, lastSeenAt: 1000 } };
    const active = advanceAutomation(state, robotInterval(state));
    const away = settleAway(state, 1000 + robotInterval(state));
    for (const next of [active, away]) {
      expect(next.ticket).toEqual(state.ticket);
      expect(next.deskQueue.slice(0, 2)).toEqual(state.deskQueue.slice(0, 2));
      expect(next.automation.report.tickets).toBe(1);
      expect(next.nextSerial).toBe(state.nextSerial);
    }
    expect(away.stats).toEqual(state.stats);
    expect(away.journal).toEqual(state.journal);
  });

  it('keeps contract cash deposit/reward accounting working with a busy desk', () => {
    const state = buyTicket(bulkState(), 'dong');
    const offer = { ...contractOffer('scratch', 'dong'), target: 3 };
    const active = acceptContract({ ...state, contracts: { ...state.contracts, offered: offer } });
    expect(active.ticket).toBe(state.ticket);
    expect(active.deskQueue).toBe(state.deskQueue);
    expect(active.money).toBe(state.money - offer.deposit);
    const revealed = revealTicket(active);
    const net = currentRound(revealed).reduce((sum, ticket) => sum + ticket.net, 0);
    const collected = collectTicket(revealed);
    expect(collected.money).toBe(active.money + net + offer.deposit + offer.reward);
  });

  it('queues an eligible promo on a busy desk and refuses when the hold is full', () => {
    const state = updatePromo({ ...bulkState(), money: 0, ticket: winning(100) }, 0);
    expect(state.promoReadyAt).toBe(BALANCE.promoIntervalMs);
    const next = claimPromo(state, BALANCE.promoIntervalMs);
    expect(next.ticket).toBe(state.ticket);
    expect(next.deskQueue[0]!.free).toBe(true);
    expect(next.money).toBe(0);
    const full = { ...state, deskQueue: Array.from({ length: 4 }, (_, i) => winning(i + 101)) };
    expect(claimPromo(full, BALANCE.promoIntervalMs)).toBe(full);
  });

  it('inspection sees fake tickets in the queue; theft leaves every held ticket intact', () => {
    const state = { ...bulkState(), money: 1000, ticket: winning(1), deskQueue: [{ ...winning(2), fakeTell: 'missing-seal' as const }] };
    for (const kind of ['inspection', 'theft'] as const) {
      const next = tickIncidents({ ...state, incidents: { ...state.incidents, nextInMs: 100, current: { kind, phase: 'warning', remainingMs: 1, cost: 0 } } }, 1);
      expect(next.money).toBeLessThan(state.money);
      expect(next.ticket).toBe(state.ticket);
      expect(next.deskQueue).toBe(state.deskQueue);
    }
  });
});

describe('upgrade persistence', () => {
  it('migrates v10 with defaults and preserves its active ticket', () => {
    const state = buyTicket(fresh(), 'dong');
    const next = migrate({ ...state, version: 10, upgrades: undefined, bulkLot: undefined, deskQueue: undefined });
    expect(next).toEqual({ ...state, version: 11 });
  });

  it('round trips a drawn queue, upgrade levels, chosen lot, and a revealed round without paying twice', () => {
    const state = buyTicket(bulkState(), 'dong');
    expect(deserialize(serialize(state))).toEqual(state);
    const revealed = revealTicket(state);
    expect(deserialize(serialize(revealed))).toEqual(revealed);
    expect(collectTicket(deserialize(serialize(revealed))!)).toEqual(collectTicket(revealed));
    expect(deserialize(serialize(setBulkLot(state, 1)))?.bulkLot).toBe(1);
  });

  it('validates upgrade levels/lots and refunds only malformed paid unrevealed queued tickets', () => {
    const state = buyTicket(bulkState(), 'dong');
    const damaged = { ...state.deskQueue[0], cells: [] };
    const next = migrate({ ...state, upgrades: { luck: 51, desk: -1, bulk: 1.5 }, bulkLot: 50,
      deskQueue: [damaged, { ...damaged, free: true }, { ...damaged, revealed: true }, null] });
    expect(next?.upgrades).toEqual({ luck: 0, desk: 0, bulk: 0 });
    expect(next?.bulkLot).toBe(1);
    expect(next?.deskQueue).toEqual([]);
    expect(next?.money).toBe(state.money + 10);
  });

  it('promotes a valid queued ticket when the active ticket is damaged', () => {
    const state = buyTicket(bulkState(), 'dong');
    const next = migrate({ ...state, ticket: { ...state.ticket, cells: [] } });
    expect(next?.ticket).toEqual(state.deskQueue[0]);
    expect(next?.deskQueue.length).toBe(3);
    expect(next?.money).toBe(state.money + 10);
  });

  it('prestige resets upgrades, chosen lot and the entire hold', () => {
    const state = buyTicket(bulkState(), 'dong');
    const next = prestige({ ...state, licenses: ['rong'], prestige: { tier: 0, runEarned: prestigeThreshold(1) }, totalEarned: prestigeThreshold(1) });
    expect(next.upgrades).toEqual(createInitialState(1).upgrades);
    expect(next.bulkLot).toBe(1);
    expect(next.ticket).toBeNull();
    expect(next.deskQueue).toEqual([]);
    expect(next.totalEarned).toBe(prestigeThreshold(1));
    expect(next.nextSerial).toBe(state.nextSerial);
  });
});
