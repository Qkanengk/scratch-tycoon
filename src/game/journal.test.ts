import { describe, expect, it } from 'vitest';
import { ALL_STAMPS, COLLECTION_BONUS_PERCENT, GOLDEN_HOUR } from '../data/journal';
import { prestigeThreshold } from '../data/prestige';
import { ticketDef, type TicketId } from '../data/tickets';
import { advanceAutomation, automationAction, loadRobot } from './automation';
import { buyTicket, collectTicket, revealTicket } from './economy';
import { ACHIEVEMENT_TOTAL, achievementCount, journalBonusPercent } from './journal';
import { advanceKioskTime } from './kioskTime';
import { prestige } from './prestige';
import { deserialize, migrate, serialize } from './save';
import { createInitialState, type GameState } from './state';

function onDesk(state: GameState, tier: number, id: TicketId = 'dong', fake = false): GameState {
  const bought = buyTicket(state, id);
  const def = ticketDef(id);
  const gross = fake ? 0 : def.prizes[tier]!.multiplier * def.price;
  return { ...bought, ticket: { ...bought.ticket!, tier, gross, prize: gross, tax: 0, net: gross,
    fakeTell: fake ? 'missing-seal' : null } };
}

describe('kiosk journal', () => {
  it('unlocks achievements once, keeps the best streak, and breaks a streak on a loss or counterfeit', () => {
    let state = createInitialState(4);
    expect(ACHIEVEMENT_TOTAL).toBe(40);
    for (let i = 0; i < 5; i++) state = collectTicket(revealTicket(onDesk(state, 1)));
    expect(achievementCount(state.journal, 0)).toBe(1);
    state = collectTicket(revealTicket(onDesk(state, 0)));
    expect(state.journal).toMatchObject({ currentStreak: 0, streak: 5 });
    state = collectTicket(revealTicket(onDesk(state, 1)));
    const revealed = revealTicket(onDesk(state, 5, 'dong', true));
    expect(revealed.journal).toMatchObject({ currentStreak: 0, streak: 5, scratched: 8, wins: 6, jackpots: 0 });
    expect(revealed.journal.stamps.dong).toBe(0);
    expect(revealTicket(revealed)).toBe(revealed);
  });

  it('collects distinct real prize stamps, pays future tickets, and scopes the set bonus by type', () => {
    let state = { ...createInitialState(4), licenses: ['bac'] as TicketId[] };
    for (const tier of [3, 4, 4, 5]) state = collectTicket(revealTicket(onDesk(state, tier)));
    expect(state.journal.stamps).toMatchObject({ dong: ALL_STAMPS, bac: 0 });
    expect(achievementCount(state.journal, 0)).toBe(2);
    expect(journalBonusPercent(state.journal, 0, 'dong')).toBe(2 + COLLECTION_BONUS_PERCENT);
    expect(journalBonusPercent(state.journal, 0, 'bac')).toBe(2);
    const next = revealTicket(onDesk(state, 5));
    expect(next.ticket!.net).toBe(200 * (102 + COLLECTION_BONUS_PERCENT) / 100);
    expect(deserialize(serialize(next))).toEqual(next);
    const collected = collectTicket(next);
    expect(collected.journal).toBe(next.journal);
    expect(collectTicket(collected)).toBe(collected);
  });

  it('migrates historical achievements without guessing stamps or streaks', () => {
    const old = createInitialState(10);
    old.stats.dong = { scratched: 88, wins: 60, bigWins: 9, jackpots: 2 };
    old.stats.bac = { scratched: 12, wins: 5, bigWins: 1, jackpots: 0 };
    const state = migrate({ ...old, version: 9 })!;
    expect(state.journal).toMatchObject({ scratched: 100, wins: 65, bigWins: 10, jackpots: 2, streak: 0, currentStreak: 0 });
    expect(Object.values(state.journal.stamps)).toEqual(Array(6).fill(0));
    expect(achievementCount(state.journal, 0)).toBe(3);
    expect(state.goldenHour).toEqual(old.goldenHour);
  });

  it('keeps lifetime rewards through prestige but clears the current streak and restarts the event clock', () => {
    const first = collectTicket(revealTicket(onDesk(createInitialState(4), 5)));
    const ready = { ...first, goldenHour: { ...first.goldenHour, active: true, remainingMs: 20_000 },
      licenses: ['rong'] as TicketId[], prestige: { tier: 0, runEarned: prestigeThreshold(1) } };
    const next = prestige(ready);
    expect(next.journal).toEqual({ ...ready.journal, currentStreak: 0 });
    expect(next.stats.dong.scratched).toBe(0);
    expect(achievementCount(next.journal, next.prestige.tier)).toBe(2);
    expect(next.goldenHour.active).toBe(false);
    expect(next.goldenHour.remainingMs).toBeGreaterThanOrEqual(GOLDEN_HOUR.firstDelayMs[0]);
  });
});

describe('golden hour', () => {
  const imminent = () => {
    const state = createInitialState(4);
    return { ...state, goldenHour: { ...state.goldenHour, remainingMs: 1000 } };
  };

  it('pauses across reloads and advances on deterministic 30-second active-play boundaries', () => {
    const state = imminent();
    const start = advanceKioskTime(state, 1000);
    expect(start.goldenHour).toMatchObject({ active: true, remainingMs: 30_000 });
    const saved = deserialize(serialize(advanceKioskTime(start, 27_000)), Date.now() + 3_600_000)!;
    expect(saved.goldenHour).toMatchObject({ active: true, remainingMs: 3000 });
    const end = advanceKioskTime(saved, 3000);
    expect(end.goldenHour).toEqual(advanceKioskTime(state, 31_000).goldenHour);
    expect(end.goldenHour.active).toBe(false);
    expect(end.goldenHour.remainingMs).toBeGreaterThanOrEqual(GOLDEN_HOUR.repeatDelayMs[0]);
  });

  it('locks the doubled payout at reveal, even if collected after the event has ended', () => {
    const covered = onDesk(imminent(), 5);
    const normal = revealTicket(covered);
    const start = advanceKioskTime(covered, 1000);
    const golden = revealTicket(start);
    expect(golden.ticket).toMatchObject({ gross: normal.ticket!.gross, tax: normal.ticket!.tax,
      net: normal.ticket!.net * 2, payoutPercent: 200 });
    const loaded = deserialize(serialize(advanceKioskTime(golden, 30_000)))!;
    expect(loaded.ticket).toEqual(golden.ticket);
    expect(collectTicket(loaded).money - loaded.money).toBe(golden.ticket!.net);
    expect(collectTicket(advanceKioskTime(normal, 1000)).money - normal.money).toBe(normal.ticket!.net);
  });

  it('counts and doubles active robot wins but never applies the event or journals offline tickets', () => {
    const state = automationAction({ ...imminent(), money: 1e8 }, 'robot');
    const loaded = loadRobot(state, 0);
    const prize = loaded.automation.robots[0]!.tray!.net;
    expect(prize).toBeGreaterThan(0);
    const active = advanceKioskTime(loaded, 4000);
    expect(active.automation.report).toEqual({ net: prize * 2, tickets: 1 });
    expect(active.journal.wins).toBe(1);
    const start = advanceKioskTime(loaded, 1000);
    const away = advanceAutomation(start, 3000, true);
    expect(away.automation.report).toEqual({ net: prize, tickets: 1 });
    expect(away.journal).toBe(start.journal);
    expect(away.goldenHour).toBe(start.goldenHour);
  });

  it('rejects non-finite, out-of-range, and forged payout metadata on covered tickets', () => {
    const state = onDesk(imminent(), 5);
    expect(migrate({ ...state, ticket: { ...state.ticket, payoutPercent: 200 } })?.ticket).toEqual(state.ticket);
    const won = revealTicket(state);
    const broken = migrate({ ...won,
      journal: { ...won.journal, stamps: { dong: 9, bac: -1, vang: 1.5 } },
      goldenHour: { ...won.goldenHour, active: true, remainingMs: 0 },
      ticket: { ...won.ticket, payoutPercent: 1e6 } })!;
    expect(broken.journal.stamps.dong).toBe(0);
    expect(broken.goldenHour.remainingMs).toBeGreaterThan(0);
    expect(broken.ticket?.net).toBe(won.ticket!.net);
  });
});
