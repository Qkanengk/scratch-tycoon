import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../data/balance';
import { ticketDef, TICKET_IDS } from '../data/tickets';
import { layoutTicket } from '../render/layout';
import { buyTicket, collectTicket, revealTicket } from './economy';
import { deserialize, loadStoredSave, migrate, recordReveal, recordScratch, SAVE_BACKUP_KEY, SAVE_KEY, serialize, updateStoredSave } from './save';
import { createMask, encodeMask, restoreMask, scratchProgress, scratchSegment } from './scratch';
import { createInitialState, SAVE_VERSION } from './state';
import { buyTool, upgradeTool } from './tools';

describe('save', () => {
  it.each([3, 4])('preserves the purchased value of a winning Rồng ticket from v%s', version => {
    const rich = { ...createInitialState(9), money: 1e9, licenses: TICKET_IDS.slice(1) };
    const bought = buyTicket(rich, 'rong');
    const gross = ticketDef('rong').prizes[1]!.multiplier * 150_000;
    const tax = version === 3 ? 0 : Math.floor((gross - 150_000) * .2);
    const legacy = { ...bought, version, ticket: { ...bought.ticket!, tier: 1, fakeTell: null, prize: gross,
      gross: version === 3 ? undefined : gross, tax: version === 3 ? undefined : tax, net: undefined } };
    const loaded = migrate(legacy)!;
    expect(loaded.ticket).toMatchObject({ gross, prize: gross, tax, net: gross - tax });
    expect(deserialize(serialize(loaded))?.ticket).toEqual(loaded.ticket);
    expect(collectTicket(revealTicket(loaded)).money).toBe(loaded.money + gross - tax);
  });
  it.each([1, 2, 3])('migrates v%s with full durability, fresh rent clock and no debt', version => {
    const old = { ...createInitialState(9), version, durability: undefined, rentElapsedMs: undefined, rentDebt: undefined };
    const state = migrate(old)!;
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.durability).toEqual(createInitialState(9).durability);
    expect(state.rentElapsedMs).toBe(0);
    expect(state.rentDebt).toBe(0);
  });

  it('sanitizes malformed durability and rent fields', () => {
    const state = migrate({ ...createInitialState(9), durability: { coin: 0, key: -1, card: 2, laser: 'bad' }, rentDebt: -1, rentElapsedMs: Infinity })!;
    expect(state.durability.coin).toBe(1);
    expect(state.durability.key).toBe(1);
    expect(state.durability.card).toBe(1);
    expect(state.durability.laser).toBe(1);
    expect(state.rentDebt).toBe(0);
    expect(state.rentElapsedMs).toBe(0);
  });
  it('migrates v2 saves to a level-zero coin without losing progress', () => {
    const state = createInitialState(9);
    expect(migrate({ ...state, version: 2, ownedTools: undefined, toolLevels: undefined, equippedTool: undefined })).toEqual(state);
  });

  it('round-trips owned tools, upgrades and the equipped tool', () => {
    const state = upgradeTool(buyTool({ ...createInitialState(9), money: 1000 }, 'key'), 'key');
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it.each([undefined, null, [], 'bad', 42])('defaults malformed tool collections (%s)', (value) => {
    const base = createInitialState(9);
    expect(migrate({ ...base, ownedTools: value, toolLevels: value, equippedTool: 'laser' })).toEqual(base);
  });

  it.each([-1, 1.5, 11, Infinity, NaN, '2', null])('defaults invalid tool levels (%s)', (level) => {
    const state = buyTool({ ...createInitialState(9), money: 1000 }, 'key');
    expect(migrate({ ...state, toolLevels: { coin: level, key: level, laser: 5 } })).toEqual(state);
  });

  it('filters unknown and duplicate tools, always owns coin, and defaults unowned equipment', () => {
    const state = migrate({ ...createInitialState(9), ownedTools: ['key', 'key', 'bad'], equippedTool: 'laser' });
    expect(state?.ownedTools).toEqual(['coin', 'key']);
    expect(state?.equippedTool).toBe('coin');
  });

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

  it.each(['garbage', '{broken', JSON.stringify({ ...fresh(), version: SAVE_VERSION + 1 })])('backs up unreadable text verbatim: %s', (text) => {
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
    expect(loaded).toMatchObject({ recovered: false, writable: false, saveFailed: true });
    updateStoredSave(storage, loaded, fresh, (state) => state, 1000);
    expect(storage.getItem(SAVE_KEY)).toBe('garbage');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(updateStoredSave(storage, loaded, fresh, (state) => buyTicket(state, 'dong'), 1000).saveFailed).toBe(true);
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

  it.each(['serial', 'content'] as const)('ignores queued completion and mask saves after another tab replaces ticket %s', (field) => {
    const state = buyTicket(fresh(), 'dong');
    const ticket = state.ticket!;
    const replacement = {
      ...state,
      ticket: field === 'serial' ? { ...ticket, serial: ticket.serial + 1 } : {
        ...ticket,
        cells: ticket.cells.map(() => ({ type: 'symbol' as const, symbol: 4, win: true })),
        tier: 5,
        prize: ticketDef('dong').price * ticketDef('dong').prizes[5]!.multiplier,
        gross: ticketDef('dong').price * ticketDef('dong').prizes[5]!.multiplier,
        net: ticketDef('dong').price * ticketDef('dong').prizes[5]!.multiplier,
      },
    };
    const storage = memory(serialize(state));
    const stale = loadStoredSave(storage, fresh);
    storage.setItem(SAVE_KEY, serialize(replacement));
    storage.setItem.mockClear();
    const layout = layoutTicket(ticketDef('dong').rules);
    const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
    scratchSegment(mask, { x: 0, y: 0 }, { x: 1, y: 1 }, 1);
    for (const transition of [
      (current: typeof state) => recordReveal(current, ticket),
      (current: typeof state) => recordScratch(current, ticket, encodeMask(mask)),
    ]) {
      const next = updateStoredSave(storage, stale, fresh, transition, 1000);
      expect(next.state).toEqual(replacement);
      expect(next.state.ticket?.revealed).toBe(false);
      expect(next.state.ticket?.scratch).toBeUndefined();
      expect(next.state.stats).toEqual(state.stats);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('continues in memory if writing the updated save fails', () => {
    const storage = memory(serialize(fresh()));
    storage.setItem.mockImplementation(() => { throw new Error('full'); });
    const next = updateStoredSave(storage, loadStoredSave(storage, fresh), fresh,
      (state) => buyTicket(state, 'dong'), 1000);
    expect(next.state.money).toBe(90);
    expect(next.saveFailed).toBe(true);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem(SAVE_KEY)).toBe(serialize(fresh()));
  });

  it('reports a failed initial write and clears the failure after a later successful commit', () => {
    const storage = memory();
    const loaded = loadStoredSave(storage, fresh);
    expect(loaded.saveFailed).toBe(false);
    storage.setItem.mockImplementationOnce(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const failed = updateStoredSave(storage, loaded, fresh, (state) => state, 1000);
    expect(failed.saveFailed).toBe(true);
    expect(failed.state).toEqual(fresh());
    expect(failed.writable).toBe(true);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const saved = updateStoredSave(storage, failed, fresh, (state) => buyTicket(state, 'dong'), 1000);
    expect(saved.saveFailed).toBe(false);
    expect(saved.state.money).toBe(90);
    expect(deserialize(storage.getItem(SAVE_KEY)!)).toEqual(saved.state);
  });

  it.each(['QuotaExceededError', 'SecurityError'])('retains unsaved progress and retries after %s', (name) => {
    const storage = memory(serialize(fresh()));
    const loaded = loadStoredSave(storage, fresh);
    storage.setItem.mockImplementationOnce(() => { throw new DOMException('blocked', name); });
    const failed = updateStoredSave(storage, loaded, fresh, (state) => buyTicket(state, 'dong'), 1000);
    expect(failed.saveFailed).toBe(true);
    expect(failed.state.money).toBe(90);
    expect(failed.state.ticket).not.toBeNull();
    const saved = updateStoredSave(storage, failed, fresh, (state) => state, 1000);
    expect(saved.saveFailed).toBe(false);
    expect(saved.state).toBe(failed.state);
    expect(deserialize(storage.getItem(SAVE_KEY)!)).toEqual(failed.state);
  });
});

describe('saved scratching', () => {
  const bought = () => buyTicket(createInitialState(4), 'dong');
  const maskFor = (id = 'dong' as (typeof TICKET_IDS)[number]) => {
    const layout = layoutTicket(ticketDef(id).rules);
    return createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
  };

  it('reveals only the scratched ticket once and ignores absent tickets', () => {
    const state = bought();
    const revealed = recordReveal(state, state.ticket!);
    expect(revealed).toEqual(revealTicket(state));
    expect(revealed.stats.dong.scratched).toBe(1);
    expect(recordReveal(revealed, state.ticket!)).toBe(revealed);
    const empty = { ...state, ticket: null };
    expect(recordReveal(empty, state.ticket!)).toBe(empty);
  });

  it.each(TICKET_IDS)('round-trips optional scratch progress for %s without a version change', (id) => {
    const state = buyTicket({ ...createInitialState(4), money: 1e9, licenses: TICKET_IDS.slice(1) }, id);
    const mask = maskFor(id);
    scratchSegment(mask, { x: 0.1, y: 0.1 }, { x: 0.25, y: 0.1 }, 0.04);
    const saved = recordScratch(state, state.ticket!, encodeMask(mask));
    expect(deserialize(serialize(saved))).toEqual(saved);
    expect(saved.version).toBe(SAVE_VERSION);
  });

  it.each([undefined, null, '', 'garbage', 'A'.repeat(10000), 123])('ignores a malformed mask (%s) without dropping or refunding the ticket', (scratch) => {
    const state = bought();
    expect(migrate({ ...state, ticket: { ...state.ticket, scratch } })).toEqual(state);
  });

  it('ignores a mask that would already require a reveal', () => {
    const state = bought();
    const mask = maskFor();
    scratchSegment(mask, { x: 0, y: 0.2 }, { x: 1, y: 0.2 }, 1);
    expect(migrate({ ...state, ticket: { ...state.ticket, scratch: encodeMask(mask) } })).toEqual(state);
  });

  it('records a partial stroke, merges other tabs\' areas, and does not re-save identical progress', () => {
    const state = bought();
    const first = maskFor(), second = maskFor();
    scratchSegment(first, { x: 0.1, y: 0.1 }, { x: 0.25, y: 0.1 }, 0.04);
    scratchSegment(second, { x: 0.7, y: 0.1 }, { x: 0.85, y: 0.1 }, 0.04);
    const saved = recordScratch(state, state.ticket!, encodeMask(first));
    const merged = recordScratch(saved, state.ticket!, encodeMask(second));
    const restored = maskFor();
    expect(restoreMask(restored, merged.ticket?.scratch)).toBe(true);
    expect(restored.removed.reduce((sum, bit) => sum + bit, 0)).toBe(first.removed.reduce((sum, bit) => sum + bit, 0) + second.removed.reduce((sum, bit) => sum + bit, 0));
    expect(scratchProgress(restored)).toBeGreaterThan(scratchProgress(first));
    expect(recordScratch(merged, state.ticket!, encodeMask(second))).toBe(merged);
  });

  it('ignores stale strokes for a replaced, changed, revealed or absent ticket and malformed masks', () => {
    const state = bought();
    const scratch = encodeMask(maskFor());
    for (const current of [
      { ...state, ticket: null },
      revealTicket(state),
      { ...state, ticket: { ...state.ticket!, serial: 99 } },
      { ...state, ticket: { ...state.ticket!, cells: [] } },
    ]) expect(recordScratch(current, state.ticket!, scratch)).toBe(current);
    expect(recordScratch(state, state.ticket!, 'bad')).toBe(state);
    expect(buyTicket({ ...state, ticket: null }, 'dong').ticket?.scratch).toBeUndefined();
  });

  it('uses the existing reveal transition if merged progress reaches the normal threshold', () => {
    const state = bought();
    const mask = maskFor();
    scratchSegment(mask, { x: 0, y: 0.2 }, { x: 1, y: 0.2 }, 1);
    const revealed = recordScratch(state, state.ticket!, encodeMask(mask));
    expect(revealed.ticket?.revealed).toBe(true);
    expect(revealed.stats.dong.scratched).toBe(1);
    expect(recordScratch(revealed, state.ticket!, encodeMask(mask))).toBe(revealed);
  });
});
