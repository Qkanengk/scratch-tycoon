import type { TicketId } from './tickets';

export const STOCK = {
  dong: { capacity: 200, restockMs: 60_000, rushFee: 300 },
  bac: { capacity: 200, restockMs: 120_000, rushFee: 3_000 },
  vang: { capacity: 200, restockMs: 240_000, rushFee: 30_000 },
  ngoc: { capacity: 200, restockMs: 360_000, rushFee: 360_000 },
  rong: { capacity: 200, restockMs: 480_000, rushFee: 2_700_000 },
  vutru: { capacity: 200, restockMs: 600_000, rushFee: 60_000_000 },
} as const;

export const BALANCE = {
  startingMoney: 100,
  taxRates: { dong: 0, bac: 0.04, vang: 0.09, ngoc: 0.14, rong: 0.20, vutru: 0.25 },
  rentIntervalMs: 180_000,
  rentAmounts: { dong: 5, bac: 35, vang: 250, ngoc: 2_000, rong: 15_000, vutru: 200_000 },
  fakeChances: { dong: 0, bac: 0, vang: 0.05, ngoc: 0.06, rong: 0.08, vutru: 0.10 },
  fakeReturnFee: 0.05,
  ticketWear: 0.012,
  bombWear: 0.22,
  minimumRadiusFactor: 0.6,
  repairPriceFraction: 0.15,
  ngocBombChance: 0.3,
  /** Share of each prize cell the coin must scratch before that patch peels clean. */
  scratchThreshold: 0.5,
  /** Radius of the starting tool (the coin), as a fraction of the ticket's width. */
  brushRadius: 0.05,
  /** The promotional ticket before the player buys any licenses. */
  promoTicket: 'dong' as TicketId,
  promoIntervalMs: 20_000,
} as const;

export const INCIDENTS = {
  intervalMs: [240_000, 480_000],
  warningMs: 10_000,
  durationMs: { inspection: 12_000, powerCut: 60_000, theft: 12_000, badLuck: 120_000, defectiveStock: 30_000 },
  fineFraction: 0.15,
  theftFraction: 0.20,
  theftCapTickets: 4,
  badLuckPrizeWeight: 0.5,
  defectivePrizeWeight: 0.85,
  defectiveReturnFee: 0.20,
} as const;
