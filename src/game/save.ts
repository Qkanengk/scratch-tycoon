import { BALANCE } from '../data/balance';
import { TICKET_IDS, ticketDef, type TicketId, type TicketRules } from '../data/tickets';
import { layoutTicket } from '../render/layout';
import { revealTicket } from './economy';
import { createMask, encodeMask, restoreMask, scratchProgress, ticketContentKey } from './scratch';
import { createInitialState, emptyStats, SAVE_VERSION, type GameState, type Ticket } from './state';
import { cellCount } from './tickets';

export const SAVE_KEY = 'scratch-tycoon-save';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}-backup`;

type RawSave = Record<string, unknown>;

/**
 * One entry per old version: turns a save of that version into the next one.
 * Add an entry (and a test) whenever the shape of GameState changes.
 */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {};

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function amount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isTicketId(value: unknown): value is TicketId {
  return typeof value === 'string' && (TICKET_IDS as readonly string[]).includes(value);
}

/** Whether a saved cell has every field the renderer and the rules read, for a ticket with these rules. */
function isCell(cell: unknown, rules: TicketRules): boolean {
  if (!isRecord(cell)) return false;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const flag = (value: unknown) => typeof value === 'boolean';
  switch (cell.type) {
    case 'symbol':
      return rules.kind === 'match' && Number.isInteger(cell.symbol) && rules.symbols[cell.symbol as number] !== undefined && flag(cell.win);
    case 'winning':
      return rules.kind === 'lucky' && number(cell.number);
    case 'number':
      return rules.kind === 'lucky' && number(cell.number) && number(cell.prize) && flag(cell.win);
    case 'multiplier':
      return rules.kind === 'lucky' && number(cell.value) && flag(cell.win);
    case 'dragon':
      return rules.kind === 'dragon' && number(cell.prize) && flag(cell.win);
    case 'bomb':
    case 'blank':
      return rules.kind === 'dragon';
    default:
      return false;
  }
}

function readTicket(value: unknown): Ticket | null {
  if (!isRecord(value) || !isTicketId(value.type) || !Array.isArray(value.cells)) return null;
  const def = ticketDef(value.type);
  const tier = amount(value.tier, -1);
  if (value.cells.length !== cellCount(def.rules) || !def.prizes[tier]) return null;
  if (!value.cells.every((cell) => isCell(cell, def.rules))) return null;
  const layout = layoutTicket(def.rules);
  const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
  const scratch = value.revealed !== true && restoreMask(mask, value.scratch)
    && scratchProgress(mask) < 1 ? encodeMask(mask) : undefined;
  return {
    serial: amount(value.serial, 0),
    type: value.type,
    cells: value.cells as Ticket['cells'],
    tier,
    prize: (def.prizes[tier]?.multiplier ?? 0) * def.price,
    free: value.free === true,
    revealed: value.revealed === true,
    ...(scratch === undefined ? {} : { scratch }),
  };
}

export function migrate(raw: unknown, now = Date.now()): GameState | null {
  if (!isRecord(raw) || typeof raw.version !== 'number') return null;
  let save = raw;
  let version = raw.version;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    save = step(save);
    version += 1;
  }
  // Saves from a newer build cannot be read.
  if (version !== SAVE_VERSION) return null;

  const base = createInitialState(0);
  const stats = emptyStats();
  if (isRecord(save.stats)) {
    for (const id of TICKET_IDS) {
      const entry = save.stats[id];
      if (!isRecord(entry)) continue;
      stats[id] = {
        scratched: amount(entry.scratched, 0),
        wins: amount(entry.wins, 0),
        jackpots: amount(entry.jackpots, 0),
      };
    }
  }
  const ticket = readTicket(save.ticket);
  const damaged = save.ticket;
  // Only explicitly paid, unrevealed tickets qualify; never pay an unverified prize.
  const refund = ticket === null && isRecord(damaged) && isTicketId(damaged.type)
    && damaged.free === false && damaged.revealed === false ? ticketDef(damaged.type).price : 0;
  const latestPromo = now + BALANCE.promoIntervalMs;
  const promoReadyAt = typeof save.promoReadyAt === 'number'
    ? Number.isFinite(save.promoReadyAt) ? Math.min(save.promoReadyAt, latestPromo) : latestPromo
    : null;
  return {
    version: SAVE_VERSION,
    money: amount(save.money, base.money) + refund,
    totalEarned: amount(save.totalEarned, 0),
    rngState: amount(save.rngState, 0) >>> 0,
    nextSerial: amount(save.nextSerial, 1),
    ticket,
    licenses: Array.isArray(save.licenses) ? TICKET_IDS.filter((id) => (save.licenses as unknown[]).includes(id)) : [],
    stats,
    selected: isTicketId(save.selected) ? save.selected : base.selected,
    promoReadyAt,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string, now = Date.now()): GameState | null {
  try {
    return migrate(JSON.parse(text), now);
  } catch {
    return null;
  }
}

export interface LoadedSave {
  state: GameState;
  text: string | null;
  recovered: boolean;
  writable: boolean;
}

export function loadStoredSave(storage: Pick<Storage, 'getItem' | 'setItem'>, fresh: () => GameState, now = Date.now()): LoadedSave {
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
    const saved = text === null ? null : deserialize(text, now);
    if (saved) return { state: saved, text, recovered: false, writable: true };
    if (text !== null) storage.setItem(SAVE_BACKUP_KEY, text);
    return { state: fresh(), text, recovered: text !== null, writable: true };
  } catch {
    // If the backup cannot be kept, leave the original save untouched.
    return { state: fresh(), text, recovered: false, writable: false };
  }
}

/** Call under the save's cross-tab lock when available. */
export function updateStoredSave(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  previous: LoadedSave,
  fresh: () => GameState,
  transition: (state: GameState) => GameState,
  now: number,
): LoadedSave {
  let current = previous;
  try {
    if (storage.getItem(SAVE_KEY) !== current.text) current = loadStoredSave(storage, fresh, now);
  } catch {
    current = { ...current, writable: false };
  }
  const state = transition(current.state);
  const text = serialize(state);
  if (current.writable && text !== current.text) {
    try {
      storage.setItem(SAVE_KEY, text);
      return { ...current, state, text };
    } catch {
      // Keep playing in memory if storage is unavailable.
    }
  }
  return { ...current, state };
}

export function recordScratch(state: GameState, ticket: Ticket, scratch: string): GameState {
  const current = state.ticket;
  if (!current || current.revealed || ticketContentKey(current) !== ticketContentKey(ticket)) return state;
  const layout = layoutTicket(ticketDef(current.type).rules);
  const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
  if (!restoreMask(mask, scratch)) return state;
  if (current.scratch) restoreMask(mask, current.scratch);
  const merged = encodeMask(mask);
  if (merged === current.scratch) return state;
  const next = { ...state, ticket: { ...current, scratch: merged } };
  return scratchProgress(mask) === 1 ? revealTicket(next) : next;
}
