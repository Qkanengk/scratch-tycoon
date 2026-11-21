import { BALANCE } from '../data/balance';
import { initialToolLevels, type ToolId } from '../data/tools';
import { TICKET_IDS, type TicketId } from '../data/tickets';

/** Prizes inside cells are in units of the ticket's price. */
export type Cell =
  | { type: 'symbol'; symbol: number; win: boolean }
  | { type: 'winning'; number: number }
  | { type: 'number'; number: number; prize: number; win: boolean }
  | { type: 'multiplier'; value: number; win: boolean }
  | { type: 'dragon'; prize: number; win: boolean }
  | { type: 'bomb' }
  | { type: 'blank' };

export interface Ticket {
  serial: number;
  type: TicketId;
  cells: Cell[];
  /** Index into the ticket type's prize table, decided at purchase. */
  tier: number;
  /** Money this ticket pays when collected. */
  prize: number;
  free: boolean;
  revealed: boolean;
  scratch?: string;
}

export interface TicketStats {
  scratched: number;
  wins: number;
  jackpots: number;
  bigWins: number;
}

export const SAVE_VERSION = 3;

export interface GameState {
  version: typeof SAVE_VERSION;
  money: number;
  ownedTools: ToolId[];
  toolLevels: Record<ToolId, number>;
  equippedTool: ToolId;
  /** Lifetime prize money collected. */
  totalEarned: number;
  rngState: number;
  nextSerial: number;
  /** The ticket on the table. */
  ticket: Ticket | null;
  licenses: TicketId[];
  stats: Record<TicketId, TicketStats>;
  /** Last ticket type bought, offered again on the empty table. */
  selected: TicketId;
  /** When the next free ticket can be claimed (ms since epoch); null while the player is not broke. */
  promoReadyAt: number | null;
}

export function emptyStats(): Record<TicketId, TicketStats> {
  const stats = {} as Record<TicketId, TicketStats>;
  for (const id of TICKET_IDS) stats[id] = { scratched: 0, wins: 0, jackpots: 0, bigWins: 0 };
  return stats;
}

export function createInitialState(seed: number): GameState {
  return {
    version: SAVE_VERSION,
    money: BALANCE.startingMoney,
    ownedTools: ['coin'],
    toolLevels: initialToolLevels(),
    equippedTool: 'coin',
    totalEarned: 0,
    rngState: seed >>> 0,
    nextSerial: 1,
    ticket: null,
    licenses: [],
    stats: emptyStats(),
    selected: TICKET_IDS[0] as TicketId,
    promoReadyAt: null,
  };
}
