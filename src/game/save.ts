import { BIG_WIN_MULTIPLIER, TICKET_IDS, ticketDef, type TicketId, type TicketRules } from '../data/tickets';
import { createInitialState, emptyStats, SAVE_VERSION, type GameState, type Ticket } from './state';
import { cellCount, jackpotTier } from './tickets';

export const SAVE_KEY = 'scratch-tycoon-save';

type RawSave = Record<string, unknown>;

/**
 * One entry per old version: turns a save of that version into the next one.
 * Add an entry (and a test) whenever the shape of GameState changes.
 */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {
  1: (save) => {
    if (!isRecord(save.stats)) return { ...save, version: 2 };
    const stats = { ...save.stats };
    const ticket = readTicket(save.ticket);
    let revealedBigWin: TicketId | undefined;
    if (ticket?.revealed) {
      const def = ticketDef(ticket.type);
      if (ticket.tier !== jackpotTier(def) && ticket.prize >= def.price * BIG_WIN_MULTIPLIER) revealedBigWin = ticket.type;
    }
    for (const id of TICKET_IDS) {
      const entry = stats[id];
      if (isRecord(entry)) stats[id] = { ...entry, bigWins: amount(entry.jackpots, 0) + (id === revealedBigWin ? 1 : 0) };
    }
    return { ...save, version: 2, stats };
  },
};

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
  return {
    serial: amount(value.serial, 0),
    type: value.type,
    cells: value.cells as Ticket['cells'],
    tier,
    prize: (def.prizes[tier]?.multiplier ?? 0) * def.price,
    free: value.free === true,
    revealed: value.revealed === true,
  };
}

export function migrate(raw: unknown): GameState | null {
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
        bigWins: amount(entry.bigWins, 0),
      };
    }
  }
  return {
    version: SAVE_VERSION,
    money: amount(save.money, base.money),
    totalEarned: amount(save.totalEarned, 0),
    rngState: amount(save.rngState, 0) >>> 0,
    nextSerial: amount(save.nextSerial, 1),
    ticket: readTicket(save.ticket),
    licenses: Array.isArray(save.licenses) ? TICKET_IDS.filter((id) => (save.licenses as unknown[]).includes(id)) : [],
    stats,
    selected: isTicketId(save.selected) ? save.selected : base.selected,
    promoReadyAt: typeof save.promoReadyAt === 'number' ? save.promoReadyAt : null,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): GameState | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
