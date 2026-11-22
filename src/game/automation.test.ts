import { describe, expect, it } from 'vitest';
import { AUTOMATION as A } from '../data/automation';
import { TICKET_IDS } from '../data/tickets';
import { advanceAutomation, automationAction, automationPrice, awayCapMs, batteryCapacity, loadRobot, robotInterval, settleAway, ticketCharge } from './automation';
import { buyTicket } from './economy';
import { deserialize, migrate, serialize } from './save';
import { createInitialState } from './state';
import { unlockProgress } from './unlocks';

const rich = (seed = 1) => ({ ...createInitialState(seed), money: 1e8, licenses: [...TICKET_IDS] });
const hired = (seed = 1) => automationAction(rich(seed), 'robot');

describe('robot work', () => {
  it('loads a paid independent tray without touching the hand ticket', () => {
    const hand = buyTicket(hired(), 'dong');
    const loaded = loadRobot(hand, 0);
    expect(loaded.ticket).toEqual(hand.ticket);
    expect(loaded.automation.robots[0]?.tray?.serial).not.toBe(hand.ticket?.serial);
    expect(loaded.money).toBe(hand.money - 10);
    expect(hand.automation.robots[0]?.tray).toBeNull();
  });

  it('finishes on cadence, pays tax and updates missions without wearing the hand tool', () => {
    let seed = 1;
    while (!loadRobot({ ...hired(seed), selected: 'vang' }, 0).automation.robots[0]!.tray!.tax) seed++;
    const s = { ...hired(seed), selected: 'vang' as const, equippedTool: 'key' as const, ownedTools: ['coin', 'key'] as const };
    const loaded = loadRobot({ ...s, ownedTools: [...s.ownedTools] }, 0);
    const tray = loaded.automation.robots[0]!.tray!;
    expect(tray.tax).toBeGreaterThan(0);
    const before = loaded.money;
    const half = advanceAutomation(loaded, 2000);
    expect(half.automation.robots[0]?.progressMs).toBe(2000);
    expect(half.stats.vang.scratched).toBe(0);
    const done = advanceAutomation(half, 2000);
    expect(done.money).toBe(before + tray.net);
    expect(done.totalEarned).toBe(tray.net);
    expect(done.stats.vang.scratched).toBe(1);
    expect(done.automation.robots[0]?.tray).toBeNull();
    expect(done.durability.key).toBe(1);
    expect(loaded.automation.robots[0]?.progressMs).toBe(0);
  });

  it('does not load twice, buy locked tickets, or spend money it lacks', () => {
    const loaded = loadRobot(hired(), 0);
    expect(loadRobot(loaded, 0)).toBe(loaded);
    const broke = { ...hired(), money: 0 };
    expect(loadRobot(broke, 0)).toBe(broke);
    const locked = { ...hired(), licenses: [], selected: 'rong' as const };
    expect(loadRobot(locked, 0)).toBe(locked);
    expect(loadRobot(loaded, 8)).toBe(loaded);
  });

  it('waits with an empty tray until loaded, then auto-buys only after purchasing the circuit', () => {
    const idle = hired();
    expect(advanceAutomation(idle, 8000).money).toBe(idle.money);
    const auto = automationAction(idle, 'autoBuy');
    const done = advanceAutomation(auto, 8000);
    expect(done.stats.dong.scratched).toBe(2);
    expect(done.automation.report.tickets).toBe(2);
    expect(idle.automation.autoBuy).toBe(false);
  });

  it('shares payouts between robots on one timeline and matches fine away ticks', () => {
    let s = hired();
    for (let seed = 1; seed < 1000; seed++) {
      const candidate = loadRobot(automationAction(automationAction(hired(seed), 'robot'), 'autoBuy'), 1);
      const next = loadRobot(candidate, 0);
      if (candidate.automation.robots[1]!.tray!.net >= 20 && next.automation.robots[0]!.tray!.net === 0) {
        s = { ...candidate, money: 10 };
        break;
      }
    }
    expect(s.automation.robots).toHaveLength(2);
    s.automation.robots[1]!.progressMs = 1000;
    const done = advanceAutomation(s, 60_000, true);
    let reference = s;
    for (let elapsed = 0; elapsed < 60_000; elapsed += 10) reference = advanceAutomation(reference, 10, true);
    expect(done.automation.robots[0]!.charge).toBeLessThan(39);
    expect(done.money).toBe(reference.money);
    expect(done.rngState).toBe(reference.rngState);
    expect(done.nextSerial).toBe(reference.nextSerial);
    expect(done.automation.report).toEqual(reference.automation.report);
    expect(done.stats).toEqual(reference.stats);
    done.automation.robots.forEach((r, i) => {
      const expected = reference.automation.robots[i]!;
      expect(r.tray).toEqual(expected.tray);
      expect(r.progressMs).toBeCloseTo(expected.progressMs, 6);
      expect(r.charge).toBeCloseTo(expected.charge, 8);
    });
    expect(s.automation.robots[0]!.charge).toBe(40);
  });

  it('shares active time across battery stops, free charging and simultaneous completions', () => {
    const s = automationAction(automationAction(hired(4), 'robot'), 'autoBuy');
    s.automation.robots[0]!.charge = .25;
    s.automation.robots[1]!.charge = .5;
    const elapsed = 130_000;
    const done = advanceAutomation(s, elapsed);
    let reference = s;
    for (let time = 0; time < elapsed; time += 25) reference = advanceAutomation(reference, 25);
    expect(done.money).toBe(reference.money);
    expect(done.automation.report).toEqual(reference.automation.report);
    expect(done.stats).toEqual(reference.stats);
    expect(done.rngState).toBe(reference.rngState);
    done.automation.robots.forEach((r, i) => {
      const expected = reference.automation.robots[i]!;
      expect(r.tray).toEqual(expected.tray);
      expect(r.charging).toBe(expected.charging);
      expect(r.progressMs).toBeCloseTo(expected.progressMs, 5);
      expect(r.charge).toBeCloseTo(expected.charge, 8);
    });
  });

  it('loses fake tickets without spotting or refunding them', () => {
    let s = hired();
    for (let seed = 1; seed < 500; seed++) {
      const candidate = loadRobot({ ...hired(seed), selected: 'vang' }, 0);
      if (candidate.automation.robots[0]?.tray?.fakeTell) { s = candidate; break; }
    }
    expect(s.automation.robots[0]?.tray?.fakeTell).toBeTruthy();
    const done = advanceAutomation(s, 4000);
    expect(done.money).toBe(s.money);
    expect(done.totalEarned).toBe(0);
    expect(done.stats.vang.wins).toBe(0);
    expect(done.stats.vang.scratched).toBe(1);
  });

  it('never wears any player tool, including the coin, on normal or bomb tickets', () => {
    for (const away of [false, true]) {
      for (const equippedTool of ['coin', 'key'] as const) {
        const s = loadRobot({ ...hired(), equippedTool, ownedTools: ['coin', 'key'],
          durability: { coin: .4, key: .5, card: .6, scraper: .7, machine: .8, laser: .9 } }, 0);
        s.automation.robots[0]!.tray!.cells[0] = { type: 'bomb' };
        const done = advanceAutomation(s, 4000, away);
        expect(done.automation.report.tickets).toBe(1);
        expect(done.durability).toEqual(s.durability);
        expect(done.equippedTool).toBe(equippedTool);
      }
    }
  });

  it('drains extra charge for bombs and stops mid-ticket when flat', () => {
    const s = loadRobot(hired(), 0);
    const robot = s.automation.robots[0]!;
    robot.tray!.cells[0] = { type: 'bomb' };
    robot.charge = .5;
    const done = advanceAutomation(s, 4000, true);
    expect(done.automation.robots[0]?.charge).toBe(0);
    expect(done.automation.robots[0]?.tray).not.toBeNull();
    expect(done.automation.robots[0]?.progressMs).toBeCloseTo(4000 * .5 / ticketCharge(robot.tray!));
    expect(done.stats.dong.scratched).toBe(0);
  });

  it('recharges for money or slowly for free only in active play', () => {
    const s = hired(); s.automation.robots[0]!.charge = 0;
    const price = automationPrice(s, 'recharge');
    const paid = automationAction(s, 'recharge');
    expect(paid.money).toBe(s.money - price);
    expect(paid.automation.robots[0]?.charge).toBe(batteryCapacity(s));
    const half = advanceAutomation(s, A.freeChargeMs / 2);
    expect(half.automation.robots[0]?.charge).toBeCloseTo(batteryCapacity(s) / 2);
    expect(half.automation.robots[0]?.charging).toBe(true);
    const full = advanceAutomation(half, A.freeChargeMs / 2);
    expect(full.automation.robots[0]?.charging).toBe(false);
    expect(full.money).toBe(s.money);
    expect(advanceAutomation(s, A.freeChargeMs, true).automation.robots[0]?.charge).toBe(0);
    expect(automationAction({ ...s, money: 0 }, 'recharge').automation.robots[0]?.charge).toBe(0);
  });

  it('pauses all work and loading while rent is owed', () => {
    const s = { ...loadRobot(hired(), 0), rentDebt: 100 };
    expect(advanceAutomation(s, 100000)).toBe(s);
    const idle = { ...hired(), rentDebt: 100 };
    expect(loadRobot(idle, 0)).toBe(idle);
    expect(advanceAutomation({ ...s, rentDebt: 0 }, 4000).stats.dong.scratched).toBe(1);
  });

  it('caps robots and upgrades, preserves progress fraction and validates prerequisites', () => {
    let s = loadRobot(hired(), 0);
    s = advanceAutomation(s, 1000);
    s = automationAction(s, 'speed');
    expect(s.automation.robots[0]!.progressMs / robotInterval(s)).toBeCloseTo(.25);
    for (let i = 0; i < 20; i++) {
      s = automationAction(automationAction(automationAction(s, 'robot'), 'speed'), 'capacity');
    }
    expect(s.automation.robots).toHaveLength(3);
    expect(s.automation.speed).toBe(A.maxSpeed);
    expect(s.automation.capacity).toBe(A.maxCapacity);
    expect(automationAction(s, 'away')).toBe(s);
    expect(automationAction(s, 'robot')).toBe(s);
    const poor = { ...createInitialState(1), money: 0 };
    expect(automationAction(poor, 'robot')).toBe(poor);
  });

  it.each([NaN, Infinity, -1, 0])('ignores invalid/empty active elapsed %s', elapsed => {
    const s = loadRobot(hired(), 0);
    expect(advanceAutomation(s, elapsed)).toBe(s);
  });
});

describe('away receipts', () => {
  const prepared = () => {
    let s = automationAction({ ...hired(2), selected: 'vang' as const }, 'autoBuy');
    s = automationAction(s, 'away', 0, 1000);
    return s;
  };

  it('records the exact wallet delta after purchases and tax, not the prize total', () => {
    const s = prepared();
    const done = settleAway(s, 1000 + 3600_000);
    expect(done.money).toBeGreaterThan(s.money);
    expect(done.automation.awaySummary).toEqual({ countedMs: 3600_000, tickets: done.automation.report.tickets,
      credited: done.money - s.money, limits: ['battery'] });
    expect(done.automation.awaySummary!.credited).toBeLessThan(done.automation.report.net);
    expect(deserialize(serialize(done))?.automation.awaySummary).toEqual(done.automation.awaySummary);
    const active = advanceAutomation(done, 1000);
    expect(active.automation.awaySummary).toEqual(done.automation.awaySummary);
    expect(settleAway(active, active.automation.lastSeenAt).automation.awaySummary).toEqual(done.automation.awaySummary);
    expect(automationAction(active, 'dismissAway').automation.awaySummary).toBeNull();
  });

  it('reports capped time and each resource limit, or the end of the absence', () => {
    const capped = settleAway(prepared(), 1000 + 12 * 3600_000).automation.awaySummary!;
    expect(capped.countedMs).toBe(2 * 3600_000);
    expect(capped.limits).toEqual(['battery', 'cap']);
    const s = loadRobot(prepared(), 0);
    s.automation.robots[0]!.progressMs = 3999;
    s.automation.robots[0]!.tray = { ...s.automation.robots[0]!.tray!, net: 5, gross: 5, prize: 5 };
    s.money = 0;
    expect(settleAway(s, 1002).automation.awaySummary).toEqual({ countedMs: 2, tickets: 1, credited: 5, limits: ['money'] });
    expect(settleAway({ ...s, money: 10000 }, 1001).automation.awaySummary?.limits).toEqual([]);
  });

  it('shows exact negative and zero away results and preserves them in saves', () => {
    let s = automationAction(automationAction(automationAction(hired(0), 'capacity'), 'autoBuy'), 'away', 0, 1000);
    s.automation.robots[0]!.charge = batteryCapacity(s);
    const done = settleAway(s, 1000 + 4 * 3600_000);
    expect(done.automation.report).toEqual({ tickets: 68, net: 650 });
    expect(done.money - s.money).toBe(-30);
    expect(done.automation.awaySummary).toMatchObject({ tickets: 68, credited: -30 });
    expect(deserialize(serialize(done))?.automation.awaySummary).toEqual(done.automation.awaySummary);
    s = loadRobot(prepared(), 0);
    s.automation.robots[0]!.tray = { ...s.automation.robots[0]!.tray!, net: 0, prize: 0, gross: 0 };
    const zero = settleAway(s, 1000 + 4000);
    expect(zero.money - s.money).toBe(0);
    expect(zero.automation.awaySummary?.credited).toBe(0);
    expect(deserialize(serialize(zero))?.automation.awaySummary).toEqual(zero.automation.awaySummary);
  });

  it('does not create receipts without completed tickets or for invalid elapsed time', () => {
    const s = prepared();
    s.automation.robots[0]!.charge = 0;
    expect(settleAway(s, 3600_000).automation.awaySummary).toBeNull();
    expect(settleAway(s, NaN).automation.awaySummary).toBeNull();
    expect(settleAway(s, 999).automation.awaySummary).toBeNull();
    expect(settleAway({ ...s, money: 0 }, 3600_000).automation.awaySummary).toBeNull();
    const malformed = migrate({ ...s, automation: { ...s.automation, awaySummary: { credited: -1, countedMs: Infinity } } });
    expect(malformed?.automation.awaySummary).toBeNull();
  });
});

describe('away work and saves', () => {
  function awayState() {
    let s = automationAction(automationAction(hired(), 'autoBuy'), 'away', 0, 1000);
    for (let i = 0; i < 8; i++) s = automationAction(automationAction(s, 'speed'), 'capacity');
    s = automationAction(automationAction(s, 'robot'), 'robot');
    for (let i = 0; i < 5; i++) s = automationAction(s, 'cap');
    for (let i = 0; i < 3; i++) s = automationAction(s, 'recharge', i);
    return s;
  }

  it('simulates deterministically, caps at twelve hours, and cannot cross an unmet licence gate', () => {
    const s = { ...awayState(), licenses: [] };
    s.totalEarned = 3999;
    s.stats.dong = { scratched: 449, bigWins: 22, wins: 100, jackpots: 0 };
    expect(unlockProgress(s, 'bac').canBuyLicense).toBe(false);
    const done = settleAway(s, 1000 + 12 * 3600_000);
    expect(done.automation.report.tickets).toBeGreaterThan(0);
    expect(done.money).not.toBe(s.money);
    expect(done.stats).toEqual(s.stats);
    expect(done.totalEarned).toBe(s.totalEarned);
    expect(done.rentElapsedMs).toBe(s.rentElapsedMs);
    expect(done.rentDebt).toBe(s.rentDebt);
    expect(unlockProgress(done, 'bac').canBuyLicense).toBe(false);
    expect(settleAway(s, 1000 + 12 * 3600_000)).toEqual(done);
    expect(settleAway(s, 1000 + 24 * 3600_000).money).toBe(done.money);
    expect(awayCapMs(s)).toBe(12 * 3600_000);
    expect(settleAway(done, done.automation.lastSeenAt).money).toBe(done.money);
  });

  it('limits away work by money and battery, and requires the unlock', () => {
    const s = awayState();
    const flat = { ...s, automation: { ...s.automation, robots: s.automation.robots.map(r => ({ ...r, charge: 0 })) } };
    expect(settleAway(flat, 3600_000).automation.report.tickets).toBe(0);
    expect(settleAway({ ...s, money: 0 }, 3600_000).automation.report.tickets).toBe(0);
    expect(settleAway(hired(), 3600_000).automation.report.tickets).toBe(0);
    expect(settleAway(s, 59000, 60000).automation.report.tickets).toBe(0);
    expect(settleAway(s, -10).money).toBe(s.money);
    expect(settleAway(s, 500)).toBe(s);
    expect(settleAway(s, NaN)).toBe(s);
  });

  it('round-trips robots, partial trays, battery, unlocks and timestamp in v5', () => {
    const s = advanceAutomation(loadRobot(awayState(), 0), 500);
    expect(deserialize(serialize(s))).toEqual(s);
    const old = { ...rich(), version: 4, automation: undefined };
    expect(migrate(old)?.automation).toEqual(createInitialState(1).automation);
    expect(migrate(old)?.version).toBe(5);
  });

  it('sanitizes malformed levels, battery, trays, unlocks and timestamps', () => {
    const s = migrate({ ...rich(), automation: { speed: 999, capacity: -1, autoBuy: false, away: true, capLevel: 5,
      lastSeenAt: Infinity, robots: [{ charge: Infinity, progressMs: -1, tray: { broken: true } }, null] } })!;
    expect(s.automation.speed).toBe(0);
    expect(s.automation.capacity).toBe(0);
    expect(s.automation.away).toBe(false);
    expect(s.automation.capLevel).toBe(0);
    expect(s.automation.lastSeenAt).toBe(0);
    expect(s.automation.robots).toEqual([{ charge: 0, charging: false, tray: null, progressMs: 0 }]);
  });
});
