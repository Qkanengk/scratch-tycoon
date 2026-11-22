import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { PRESTIGE, prestigeThreshold } from '../data/prestige';
import { ticketDef } from '../data/tickets';
import { advanceAutomation, automationAction, initialAutomation, loadRobot, ticketCharge } from './automation';
import { advancePlayTime, buyTicket, claimPromo, collectTicket, isUnlocked, rentAmount, revealTicket, updatePromo } from './economy';
import { canPrestige, prestige } from './prestige';
import { deserialize, migrate, serialize } from './save';
import { createInitialState, SAVE_VERSION, type GameState } from './state';
import { wearTool } from './tools';
import { buyLicense, unlockProgress } from './unlocks';

const atTier = (tier: number, seed = 4): GameState => ({
  ...createInitialState(seed), prestige: { tier, runEarned: 0 }, money: 1e10,
});

function eligible(): GameState {
  const state = atTier(0);
  return { ...state, licenses: ['rong'], totalEarned: prestigeThreshold(1), prestige: { tier: 0, runEarned: prestigeThreshold(1) } };
}

describe('prestige transition', () => {
  it.each([
    ['earnings', (s: GameState) => ({ ...s, prestige: { tier: 0, runEarned: prestigeThreshold(1) - 1 } })],
    ['licence', (s: GameState) => ({ ...s, licenses: [] })],
    ['maximum tier', (s: GameState) => ({ ...s, prestige: { tier: 5, runEarned: 1e15 } })],
  ])('refuses when missing %s', (_name, change) => {
    const state = change(eligible());
    expect(canPrestige(state)).toBe(false);
    expect(prestige(state)).toBe(state);
  });

  it('resets the entire run, discards the desk without refund, and preserves only permanent progress and RNG identity', () => {
    const ready = eligible();
    const state: GameState = {
      ...ready, money: 9999, nextSerial: 100, rngState: 123,
      ticket: buyTicket(atTier(0), 'dong').ticket,
      ownedTools: ['coin', 'laser'], equippedTool: 'laser',
      toolLevels: { ...ready.toolLevels, laser: 8 }, durability: { ...ready.durability, laser: .2 },
      automation: { ...initialAutomation(), robots: [{ charge: 1, charging: true, tray: null, progressMs: 0 }],
        speed: 8, capacity: 8, autoBuy: true, away: true, capLevel: 5, lastSeenAt: 123, report: { tickets: 9, net: 99 } },
      stats: { ...ready.stats, rong: { scratched: 99, wins: 30, jackpots: 1, bigWins: 4 } },
      selected: 'rong', promoReadyAt: 999, rentElapsedMs: 123, rentDebt: 999, licenseElapsedMs: 100_000,
    };
    const before = serialize(state);
    expect(prestige(state)).toEqual({ ...createInitialState(123), nextSerial: 100,
      totalEarned: state.totalEarned, prestige: { tier: 1, runEarned: 0 } });
    expect(serialize(state)).toBe(before);
  });

  it('accepts an empty desk and each successive threshold exactly once', () => {
    for (let tier = 0; tier < PRESTIGE.maxTier; tier++) {
      const state = { ...atTier(tier), licenses: ['rong'] as GameState['licenses'],
        prestige: { tier, runEarned: prestigeThreshold(tier + 1) } };
      const next = prestige(state);
      expect(next.prestige).toEqual({ tier: tier + 1, runEarned: 0 });
      expect(prestige(next)).toBe(next);
    }
    expect(prestigeThreshold(0)).toBe(Infinity);
    expect(prestigeThreshold(6)).toBe(Infinity);
  });

  it('cannot reuse lifetime earnings for the next prestige', () => {
    const state = { ...eligible(), totalEarned: 1e15, prestige: { tier: 1, runEarned: prestigeThreshold(2) - 1 } };
    expect(canPrestige(state)).toBe(false);
    expect(prestige(state)).toBe(state);
  });
});

describe('permanent payouts and cumulative curses', () => {
  it.each([0, 1, 2, 3, 4, 5])('applies tax and permanent net bonus at tier %s, including rent withholding', tier => {
    const state = buyTicket(atTier(tier), 'dong');
    const ticket = state.ticket!;
    expect(ticket.gross).toBe(50);
    expect(ticket.tax).toBe(tier >= 1 ? 2 : 0);
    expect(ticket.net).toBe(Math.floor((ticket.gross - ticket.tax) * (1 + tier * PRESTIGE.bonusPerTier)));
    const revealed = revealTicket(state);
    const net = Math.floor(ticket.net * (100 + Number(tier >= 1) + Number(tier >= 5)) / 100);
    const collected = collectTicket({ ...revealed, rentDebt: 10 });
    expect(collected.money).toBe(state.money + net - 10);
    expect(collected.totalEarned).toBe(net);
    expect(collected.prestige.runEarned).toBe(net);
    expect(collectTicket(collected)).toBe(collected);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(rentAmount(atTier(tier))).toBe(tier >= 2 ? 8 : 5);
  });

  it('never awards a bonus on a losing ticket and does not double-count a collected promo', () => {
    const broke = { ...atTier(5), money: 0 };
    const promo = claimPromo(updatePromo(broke, 0), BALANCE.promoIntervalMs);
    const revealed = revealTicket(promo);
    const collected = collectTicket(revealed);
    expect(collected.prestige.runEarned).toBe(revealed.ticket!.net);
    expect(collected.totalEarned).toBe(revealed.ticket!.net);
    const loss = { ...buyTicket(atTier(5), 'dong'), ticket: { ...promo.ticket!, gross: 0, prize: 0, tax: 0, net: 0 } };
    expect(collectTicket(revealTicket(loss)).prestige.runEarned).toBe(0);
  });

  it.each(['dong', 'bac'] as const)('adds counterfeit risk to %s from tier III, but never to promos', id => {
    let fakes = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const base = { ...atTier(2, seed), licenses: ['bac'] as GameState['licenses'] };
      expect(buyTicket(base, id).ticket!.fakeTell).toBeNull();
      const cursed = buyTicket({ ...base, prestige: { tier: 3, runEarned: 0 } }, id);
      if (cursed.ticket!.fakeTell) {
        fakes++;
        expect(cursed.ticket!.net).toBe(0);
      }
      const broke = { ...atTier(5, seed), money: 0 };
      expect(claimPromo(updatePromo(broke, 0), BALANCE.promoIntervalMs).ticket!.fakeTell).toBeNull();
    }
    expect(fakes).toBeGreaterThan(0);
    expect(fakes).toBeLessThan(50);
  });

  it('scales ticket and bomb wear from tier IV, without wearing the coin', () => {
    for (const tier of [3, 4, 5]) {
      const state = { ...atTier(tier), equippedTool: 'key' as const };
      expect(wearTool(state, .2).durability.key).toBeCloseTo(tier >= 4 ? .7 : .8);
      expect(wearTool(atTier(tier), .2).durability.coin).toBe(1);
    }
  });

  it('scales actual robot battery consumption from tier V and credits active run earnings', () => {
    for (const tier of [4, 5]) {
      const loaded = loadRobot(automationAction(atTier(tier), 'robot'), 0);
      const robot = loaded.automation.robots[0]!;
      const done = advanceAutomation(loaded, 4000);
      expect(robot.charge - done.automation.robots[0]!.charge).toBeCloseTo(ticketCharge(robot.tray!, tier));
      const net = revealTicket({ ...loaded, ticket: robot.tray }).ticket!.net;
      expect(done.prestige.runEarned).toBe(net);
      expect(done.totalEarned).toBe(net);
      const away = advanceAutomation(loaded, 4000, true);
      expect(away.prestige).toEqual(loaded.prestige);
      expect(away.totalEarned).toBe(loaded.totalEarned);
    }
  });
});

describe('Vũ Trụ and licence time floors', () => {
  it('hides the sixth licence until prestige, even with forged ownership or all missions complete', () => {
    const def = ticketDef('vutru');
    const ready = { ...atTier(0), licenses: ['rong', 'vutru'] as GameState['licenses'], totalEarned: 1e12,
      licenseElapsedMs: 1e9, stats: { ...atTier(0).stats, rong: { scratched: 10000, bigWins: 1000, wins: 1000, jackpots: 1 } } };
    expect(unlockProgress(ready, def.id)).toMatchObject({ available: false, unlocked: false, canBuyLicense: false });
    expect(isUnlocked(ready, def.id)).toBe(false);
    expect(buyTicket(ready, def.id)).toBe(ready);
    const eligible = { ...ready, licenses: ['rong'] as GameState['licenses'], prestige: { tier: 1, runEarned: 0 } };
    const licensed = buyLicense(eligible, def.id);
    expect(licensed.money).toBe(eligible.money - def.unlock!.licenseCost);
    expect(licensed.licenseElapsedMs).toBe(0);
    expect(buyTicket(licensed, def.id).ticket?.type).toBe('vutru');
  });

  it.each(['vang', 'ngoc', 'rong', 'vutru'] as const)('requires the active-time minimum for %s, in addition to the missions', id => {
    const def = ticketDef(id);
    const mission = def.unlock!.mission;
    const state = { ...atTier(1), totalEarned: 1e12,
      stats: { ...atTier(1).stats, [mission.ticket]: { scratched: mission.scratched, bigWins: mission.bigWins, wins: 0, jackpots: 0 } } };
    expect(unlockProgress(state, id).timeDone).toBe(false);
    expect(buyLicense(state, id)).toBe(state);
    const minimumMs = def.unlock!.minimumPlayMs!;
    expect(minimumMs).toBeGreaterThanOrEqual(20 * 60_000);
    expect(unlockProgress(advancePlayTime(state, minimumMs - 1), id).timeDone).toBe(false);
    const ready = advancePlayTime(state, minimumMs);
    expect(unlockProgress(ready, id).canBuyLicense).toBe(true);
    expect(buyLicense(ready, id).licenseElapsedMs).toBe(0);
  });
});

describe('prestige save', () => {
  it('migrates v5 as an unprestiged current run, retaining lifetime prizes', () => {
    const loaded = migrate({ ...createInitialState(1), version: 5, totalEarned: 12345, prestige: undefined, licenseElapsedMs: undefined })!;
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.prestige).toEqual({ tier: 0, runEarned: 12345 });
    expect(loaded.totalEarned).toBe(12345);
    expect(loaded.licenseElapsedMs).toBe(0);
  });

  it.each([undefined, null, [], 'bad'])('defaults malformed prestige %s', prestige => {
    expect(migrate({ ...createInitialState(1), prestige })!.prestige).toEqual({ tier: 0, runEarned: 0 });
  });

  it.each([-1, Infinity, NaN, '5'])('defaults invalid amounts %s', value => {
    const loaded = migrate({ ...createInitialState(1), prestige: { tier: value, runEarned: value }, licenseElapsedMs: value })!;
    expect(loaded.prestige).toEqual({ tier: 0, runEarned: 0 });
    expect(loaded.licenseElapsedMs).toBe(0);
  });

  it('bounds integer tiers and run earnings, and filters unavailable Vũ Trụ state', () => {
    expect(migrate({ ...createInitialState(1), totalEarned: 100, prestige: { tier: 99.9, runEarned: 999 } })!.prestige)
      .toEqual({ tier: 5, runEarned: 100 });
    const state = buyTicket({ ...atTier(1), licenses: ['vutru'] }, 'vutru');
    expect(deserialize(serialize(state))).toEqual(state);
    const loaded = migrate({ ...state, prestige: { tier: 0, runEarned: 0 } })!;
    expect(loaded.licenses).not.toContain('vutru');
    expect(loaded.selected).toBe('dong');
    expect(loaded.ticket).toBeNull();
    expect(loaded.money).toBe(state.money);
  });

  it('round-trips a robot tray with its permanent payout bonus and current run progress', () => {
    const state = loadRobot(automationAction({ ...atTier(3), totalEarned: 999,
      prestige: { tier: 3, runEarned: 123 } }, 'robot'), 0);
    expect(deserialize(serialize(state))).toEqual(state);
    const blocked = migrate({ ...state, automation: { ...state.automation,
      robots: [{ ...state.automation.robots[0], tray: buyTicket({ ...atTier(1), licenses: ['vutru'] }, 'vutru').ticket }] },
      prestige: { tier: 0, runEarned: 0 } })!;
    expect(blocked.automation.robots[0]!.tray).toBeNull();
  });
});
