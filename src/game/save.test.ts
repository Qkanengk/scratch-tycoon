import { describe, expect, it } from 'vitest';
import { TICKET_IDS } from '../data/tickets';
import { buyTicket, collectTicket, revealTicket } from './economy';
import { deserialize, migrate, serialize } from './save';
import { createInitialState, SAVE_VERSION } from './state';

describe('save', () => {
  it('round-trips a game with a ticket on the table', () => {
    const state = revealTicket(buyTicket(createInitialState(123), 'dong'));
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('round-trips progress', () => {
    const base = createInitialState(9);
    const state = {
      ...base,
      money: 123_456,
      totalEarned: 9_999_999,
      licenses: ['bac' as const, 'vang' as const],
      selected: 'vang' as const,
      stats: { ...base.stats, bac: { scratched: 250, wins: 100, jackpots: 2, bigWins: 16 } },
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('rejects text that is not a save', () => {
    expect(deserialize('')).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('[]')).toBeNull();
    expect(deserialize('{"money":5}')).toBeNull();
  });

  it('rejects a save from a newer version', () => {
    expect(migrate({ ...createInitialState(1), version: SAVE_VERSION + 1 })).toBeNull();
  });

  it('repairs damaged fields instead of crashing', () => {
    const state = migrate({
      version: SAVE_VERSION,
      money: -50,
      totalEarned: 'lots',
      licenses: ['bac', 'nope'],
      selected: 'nope',
      ticket: { type: 'dong', cells: [] },
      stats: { dong: { scratched: 12 } },
    });
    expect(state).toMatchObject({
      money: 100,
      totalEarned: 0,
      licenses: ['bac'],
      selected: 'dong',
      ticket: null,
    });
    expect(state?.stats.dong).toEqual({ scratched: 12, wins: 0, jackpots: 0, bigWins: 0 });
    expect(state?.stats.rong).toEqual({ scratched: 0, wins: 0, jackpots: 0, bigWins: 0 });
  });

  it('credits known jackpots from saves that did not track big wins', () => {
    const state = migrate({
      version: 1,
      stats: { dong: { scratched: 250, wins: 100, jackpots: 2 } },
    });
    expect(state?.version).toBe(SAVE_VERSION);
    expect(state?.stats.dong).toEqual({ scratched: 250, wins: 100, jackpots: 2, bigWins: 2 });
  });

  it.each([
    { seed: 4, prize: 50, revealed: true, migratedWins: 1 },
    { seed: 43, prize: 200, revealed: true, migratedWins: 1 },
    { seed: 4, prize: 50, revealed: false, migratedWins: 0 },
  ])('credits an in-flight v1 prize of $prize xu once (revealed=$revealed)', ({ seed, prize, revealed, migratedWins }) => {
    const bought = buyTicket(createInitialState(seed), 'dong');
    expect(bought.ticket?.prize).toBe(prize);
    const state = revealed ? revealTicket(bought) : bought;
    const { scratched, wins, jackpots } = state.stats.dong;
    const saved = deserialize(JSON.stringify({
      ...state, version: 1, stats: { dong: { scratched, wins, jackpots } },
    }))!;
    expect(saved.stats.dong.bigWins).toBe(migratedWins);

    const collected = collectTicket(revealTicket(saved));
    expect(collected.totalEarned).toBe(prize);
    expect(collected.stats.dong.bigWins).toBe(1);
  });

  it.each(TICKET_IDS)('keeps a %s ticket through a save', (id) => {
    const rich = { ...createInitialState(9), money: 1e9, licenses: TICKET_IDS.slice(1) };
    const bought = buyTicket(rich, id);
    expect(bought.ticket).not.toBeNull();
    expect(deserialize(serialize(bought))?.ticket).toEqual(bought.ticket);
  });

  it('drops a ticket whose cells lack what the renderer reads', () => {
    const bought = buyTicket(createInitialState(4), 'dong');
    const damaged = JSON.parse(serialize(bought)) as { ticket: { cells: Record<string, unknown>[] } };
    delete damaged.ticket.cells[0]?.symbol;
    expect(migrate(damaged)?.ticket).toBeNull();

    const outOfRange = JSON.parse(serialize(bought)) as { ticket: { cells: Record<string, unknown>[] } };
    (outOfRange.ticket.cells[0] as Record<string, unknown>).symbol = 99;
    expect(migrate(outOfRange)?.ticket).toBeNull();

    const wrongKind = JSON.parse(serialize(bought)) as { ticket: { cells: Record<string, unknown>[] } };
    wrongKind.ticket.cells[0] = { type: 'bomb' };
    expect(migrate(wrongKind)?.ticket).toBeNull();
  });

  it('takes the prize from the prize table, not from the save text', () => {
    const bought = buyTicket(createInitialState(4), 'dong');
    const forged = JSON.parse(serialize(bought)) as { ticket: { prize: number } };
    forged.ticket.prize = 1e9;
    expect(migrate(forged)?.ticket?.prize).toBe(bought.ticket?.prize);
  });
});
