export type TicketId = 'dong' | 'bac' | 'vang' | 'ngoc' | 'rong' | 'vutru';

/** `weight` is in basis points; a ticket's weights add up to 10,000. */
export interface PrizeTier {
  multiplier: number;
  weight: number;
}

export type TicketRules =
  /**
   * `need` equal symbols among `cells` win; `symbols[i]` pays `prizes[i + 1]`.
   * Symbols are sticker ids: public/assets/stickers/<id>.png.
   */
  | { kind: 'match'; cells: number; need: number; symbols: readonly string[] }
  /**
   * Your numbers that equal a winning number pay the prize printed under them.
   * With `multipliers`, one extra cell multiplies the ticket's total.
   */
  | {
      kind: 'lucky';
      winning: number;
      numbers: number;
      maxNumber: number;
      multipliers: readonly number[] | null;
    }
  /** `dragons` dragons and no bomb on a `size` x `size` grid win the prize the dragons carry. */
  | { kind: 'dragon'; size: number; dragons: number };

export interface TicketUnlock {
  /** Active play since the previous licence, in addition to the mission requirements. */
  minimumPlayMs?: number;
  /** Cash retained after paying the licence; defaults to one ticket's price. */
  ticketReserve?: number;
  /** Lifetime prize money needed. */
  totalEarned: number;
  licenseCost: number;
  mission: { ticket: TicketId; scratched: number; bigWins: number };
}

export interface TicketDef {
  minimumPrestige?: number;
  id: TicketId;
  price: number;
  /** Expected prize per unit of price; the prize table must add up to this. */
  baseReturn: number;
  /** Sorted from the miss (multiplier 0) up to the jackpot. */
  prizes: readonly PrizeTier[];
  rules: TicketRules;
  /** null: available from the start. */
  unlock: TicketUnlock | null;
}

export const BIG_WIN_MULTIPLIER = 5;

function unlock(previous: TicketId, totalEarned: number, licenseCost: number, scratched: number, bigWins: number): TicketUnlock {
  return {
    totalEarned,
    licenseCost,
    mission: { ticket: previous, scratched, bigWins },
  };
}

export const TICKETS: readonly TicketDef[] = [
  {
    id: 'dong',
    price: 10,
    baseReturn: 1.08,
    prizes: [
      { multiplier: 0, weight: 5080 },
      { multiplier: 1, weight: 2800 },
      { multiplier: 2, weight: 1350 },
      { multiplier: 5, weight: 560 },
      { multiplier: 10, weight: 170 },
      { multiplier: 20, weight: 40 },
    ],
    rules: { kind: 'match', cells: 3, need: 3, symbols: ['cherries', 'lemon', 'bell', 'jewel', 'crown'] },
    unlock: null,
  },
  {
    id: 'bac',
    price: 100,
    baseReturn: 1.04,
    prizes: [
      { multiplier: 0, weight: 5710 },
      { multiplier: 1, weight: 2500 },
      { multiplier: 2, weight: 1200 },
      { multiplier: 5, weight: 440 },
      { multiplier: 15, weight: 120 },
      { multiplier: 50, weight: 30 },
    ],
    rules: { kind: 'match', cells: 6, need: 3, symbols: ['gourd', 'crab', 'fish-a', 'chicken-a', 'stag'] },
    unlock: unlock('dong', 4_000, 100, 450, 23),
  },
  {
    id: 'vang',
    price: 1_000,
    baseReturn: 1.0,
    prizes: [
      { multiplier: 0, weight: 6100 },
      { multiplier: 1, weight: 2400 },
      { multiplier: 2, weight: 1000 },
      { multiplier: 5, weight: 400 },
      { multiplier: 20, weight: 80 },
      { multiplier: 100, weight: 20 },
    ],
    rules: { kind: 'lucky', winning: 3, numbers: 9, maxNumber: 40, multipliers: null },
    unlock: { ...unlock('bac', 22_000, 100, 215, 8), minimumPlayMs: 20 * 60_000 },
  },
  {
    id: 'ngoc',
    price: 12_000,
    baseReturn: 0.96,
    prizes: [
      { multiplier: 0, weight: 6740 },
      { multiplier: 1, weight: 2000 },
      { multiplier: 2, weight: 900 },
      { multiplier: 6, weight: 300 },
      { multiplier: 30, weight: 50 },
      { multiplier: 250, weight: 10 },
    ],
    rules: { kind: 'lucky', winning: 3, numbers: 8, maxNumber: 40, multipliers: [1, 2, 3, 5] },
    unlock: { ...unlock('vang', 90_000, 100, 80, 3), minimumPlayMs: 20 * 60_000 },
  },
  {
    id: 'rong',
    price: 90_000,
    baseReturn: 0.92,
    prizes: [
      { multiplier: 0, weight: 7185 },
      { multiplier: 1, weight: 1800 },
      { multiplier: 2, weight: 800 },
      { multiplier: 10, weight: 180 },
      { multiplier: 50, weight: 30 },
      { multiplier: 500, weight: 5 },
    ],
    rules: { kind: 'dragon', size: 4, dragons: 3 },
    unlock: { ...unlock('ngoc', 200_000, 2_500, 25, 1), minimumPlayMs: 20 * 60_000 },
  },
  {
    id: 'vutru',
    minimumPrestige: 1,
    price: 2_000_000,
    baseReturn: 0.88,
    prizes: [
      { multiplier: 0, weight: 7679 },
      { multiplier: 1, weight: 1500 },
      { multiplier: 2, weight: 650 },
      { multiplier: 10, weight: 150 },
      { multiplier: 100, weight: 20 },
      { multiplier: 2500, weight: 1 },
    ],
    rules: { kind: 'lucky', winning: 3, numbers: 9, maxNumber: 50, multipliers: [1, 2, 5, 10] },
    unlock: { ...unlock('rong', 500_000, 10_000, 25, 1), minimumPlayMs: 20 * 60_000, ticketReserve: 0 },
  },
];

export const TICKET_IDS: readonly TicketId[] = TICKETS.map((def) => def.id);

export function ticketDef(id: TicketId): TicketDef {
  const def = TICKETS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown ticket type: ${id}`);
  return def;
}
