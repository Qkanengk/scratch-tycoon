import { BALANCE } from '../data/balance';
import { initialStock, type Stock } from './stock';
import { initialToolLevels, type ToolId } from '../data/tools';
import { TICKET_IDS, type TicketId } from '../data/tickets';
import { initialAutomation, type Automation } from './automation';
import { initialIncidents, type IncidentState } from './incidents';

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
  /** Gross prize, retained for the printed ticket and existing scene. */
  prize: number;
  gross: number;
  tax: number;
  net: number;
  fakeTell: 'missing-seal' | 'misprinted-serial' | null;
  defective?: true;
  scratchStarted: boolean;
  hitBombs: number[];
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

export const SAVE_VERSION = 8;

export interface GameState {
  stock: Stock;
  /** Active-play prizes in this run, after tax and the permanent bonus, before rent withholding. */
  prestige: { tier: number; runEarned: number };
  /** Active play since the last purchased licence. */
  licenseElapsedMs: number;
  automation: Automation;
  incidents: IncidentState;
  version: typeof SAVE_VERSION;
  money: number;
  durability: Record<ToolId, number>;
  rentElapsedMs: number;
  rentDebt: number;
  ownedTools: ToolId[];
  toolLevels: Record<ToolId, number>;
  equippedTool: ToolId;
  /** Lifetime after-tax prizes, before rent debt withholding. */
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
    stock: initialStock(),
    prestige: { tier: 0, runEarned: 0 },
    licenseElapsedMs: 0,
    automation: initialAutomation(),
    incidents: initialIncidents(seed),
    money: BALANCE.startingMoney,
    durability: { coin: 1, key: 1, card: 1, scraper: 1, machine: 1, laser: 1 },
    rentElapsedMs: 0,
    rentDebt: 0,
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
