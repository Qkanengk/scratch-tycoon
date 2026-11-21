export type TicketId = 'dong' | 'bac' | 'vang' | 'ngoc' | 'rong';

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
  /** Lifetime prize money needed. */
  totalEarned: number;
  licenseCost: number;
  mission: { ticket: TicketId; scratched: number; jackpots: number };
}

export interface TicketDef {
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

const MISSION_SCRATCHED = 200;
const MISSION_JACKPOTS = 1;
/** A license costs this many tickets of the type played before it. */
const LICENSE_PRICE_FACTOR = 50;

function unlock(previous: TicketId, previousPrice: number, totalEarned: number): TicketUnlock {
  return {
    totalEarned,
    licenseCost: previousPrice * LICENSE_PRICE_FACTOR,
    mission: { ticket: previous, scratched: MISSION_SCRATCHED, jackpots: MISSION_JACKPOTS },
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
    unlock: unlock('dong', 10, 5_000),
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
    unlock: unlock('bac', 100, 150_000),
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
    unlock: unlock('vang', 1_000, 5_000_000),
  },
  {
    id: 'rong',
    price: 150_000,
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
    unlock: unlock('ngoc', 12_000, 200_000_000),
  },
];

export const TICKET_IDS: readonly TicketId[] = TICKETS.map((def) => def.id);

export function ticketDef(id: TicketId): TicketDef {
  const def = TICKETS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown ticket type: ${id}`);
  return def;
}
