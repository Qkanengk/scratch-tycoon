import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../data/balance';
import { TICKET_IDS } from '../data/tickets';
import { buyTicket, revealTicket } from './economy';
import { deserialize, loadStoredSave, migrate, SAVE_BACKUP_KEY, SAVE_KEY, serialize, updateStoredSave } from './save';
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
      stats: { ...base.stats, bac: { scratched: 250, wins: 100, jackpots: 2 } },
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
    expect(state?.stats.dong).toEqual({ scratched: 12, wins: 0, jackpots: 0 });
    expect(state?.stats.rong).toEqual({ scratched: 0, wins: 0, jackpots: 0 });
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

  it.each(TICKET_IDS)('refunds a damaged paid, unrevealed %s ticket exactly once', (id) => {
    const rich = { ...createInitialState(9), money: 1e9, licenses: TICKET_IDS.slice(1) };
    const bought = buyTicket(rich, id);
    const repaired = migrate({ ...bought, ticket: { ...bought.ticket, cells: [{}] } });
    expect(repaired?.ticket).toBeNull();
    expect(repaired?.money).toBe(rich.money);
    expect(repaired?.totalEarned).toBe(0);
    expect(deserialize(serialize(repaired!))).toEqual(repaired);
  });

  it.each([
    { free: true, revealed: false },
    { free: false, revealed: true },
    { free: true, revealed: true },
    { free: false, revealed: false, type: 'unknown' },
  ])('does not refund a damaged free, revealed or unknown ticket: %j', (fields) => {
    const bought = buyTicket(createInitialState(4), 'dong');
    const repaired = migrate({ ...bought, ticket: { ...bought.ticket, cells: [], ...fields } });
    expect(repaired?.ticket).toBeNull();
    expect(repaired?.money).toBe(bought.money);
  });

  it('does not refund valid or absent tickets', () => {
    const initial = createInitialState(4);
    expect(migrate(initial)?.money).toBe(initial.money);
    const bought = buyTicket(initial, 'dong');
    expect(migrate(bought)).toEqual(bought);
  });

  it.each([1e20, Infinity, -Infinity, NaN])('caps an invalid promo deadline (%s) at one interval', (promoReadyAt) => {
    expect(migrate({ ...createInitialState(1), money: 0, promoReadyAt }, 1000)?.promoReadyAt)
      .toBe(1000 + BALANCE.promoIntervalMs);
  });

  it.each([null, 500, 1000, 1500])('preserves an absent, expired or normal promo deadline (%s)', (promoReadyAt) => {
    expect(migrate({ ...createInitialState(1), promoReadyAt }, 1000)?.promoReadyAt).toBe(promoReadyAt);
  });

  it('caps a JSON numeric overflow on deserialize', () => {
    const text = serialize({ ...createInitialState(1), promoReadyAt: 123 });
    expect(deserialize(text.replace('"promoReadyAt":123', '"promoReadyAt":1e400'), 1000)?.promoReadyAt)
      .toBe(1000 + BALANCE.promoIntervalMs);
  });
});

describe('stored saves', () => {
  const fresh = () => createInitialState(123);
  const memory = (text: string | null = null) => {
    const values = new Map<string, string>(text === null ? [] : [[SAVE_KEY, text]]);
    return {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    };
  };

  it.each(['garbage', '{broken', JSON.stringify({ ...fresh(), version: 2 })])('backs up unreadable text verbatim: %s', (text) => {
    const storage = memory(text);
    const loaded = loadStoredSave(storage, fresh);
    expect(loaded).toMatchObject({ state: fresh(), recovered: true, writable: true });
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(text);
    expect(storage.getItem(SAVE_KEY)).toBe(text);
    updateStoredSave(storage, loaded, fresh, (state) => state, 1000);
    expect(storage.getItem(SAVE_KEY)).toBe(serialize(fresh()));
    storage.setItem.mockClear();
    expect(loadStoredSave(storage, fresh).recovered).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_BACKUP_KEY)).toBe(text);
  });

  it('does not back up empty storage or a readable save', () => {
    for (const text of [null, serialize(fresh())]) {
      const storage = memory(text);
      expect(loadStoredSave(storage, fresh)).toMatchObject({ state: fresh(), recovered: false, writable: true });
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('leaves the original untouched if its backup cannot be written', () => {
    const storage = memory('garbage');
    storage.setItem.mockImplementation(() => { throw new Error('full'); });
    const loaded = loadStoredSave(storage, fresh);
    expect(loaded).toMatchObject({ recovered: false, writable: false });
    updateStoredSave(storage, loaded, fresh, (state) => state, 1000);
    expect(storage.getItem(SAVE_KEY)).toBe('garbage');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('plays in memory when storage cannot be read or written', () => {
    const storage = memory();
    storage.getItem.mockImplementation(() => { throw new Error('unavailable'); });
    const loaded = loadStoredSave(storage, fresh);
    const next = updateStoredSave(storage, loaded, fresh, (state) => buyTicket(state, 'dong'), 1000);
    expect(next.state.money).toBe(90);
    expect(next.writable).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('reconciles a stale tab before applying an action, without echoing adopted state', () => {
    const storage = memory(serialize(fresh()));
    const stale = loadStoredSave(storage, fresh);
    const advanced = { ...fresh(), money: 9500, licenses: ['bac' as const] };
    storage.setItem(SAVE_KEY, serialize(advanced));
    storage.setItem.mockClear();
    const adopted = updateStoredSave(storage, stale, fresh, (state) => state, 1000);
    expect(adopted.state).toEqual(advanced);
    expect(storage.setItem).not.toHaveBeenCalled();
    const bought = updateStoredSave(storage, stale, fresh, (state) => buyTicket(state, 'bac'), 1000);
    expect(bought.state.money).toBe(9400);
    expect(bought.state.licenses).toEqual(['bac']);
    expect(deserialize(storage.getItem(SAVE_KEY)!)).toEqual(bought.state);
  });

  it('cannot duplicate a ticket bought by another tab even before the storage event arrives', () => {
    const storage = memory(serialize(fresh()));
    const stale = loadStoredSave(storage, fresh);
    const other = updateStoredSave(storage, stale, fresh, (state) => buyTicket(state, 'dong'), 1000);
    storage.setItem.mockClear();
    const next = updateStoredSave(storage, stale, fresh, (state) => buyTicket(state, 'dong'), 1000);
    expect(next.state).toEqual(other.state);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps storage read-only when no cross-tab lock is available', () => {
    const storage = memory(serialize(fresh()));
    const next = updateStoredSave(storage, loadStoredSave(storage, fresh), fresh,
      (state) => buyTicket(state, 'dong'), 1000, false);
    expect(next.state.money).toBe(90);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
