import type { TicketId } from './tickets';

export const BALANCE = {
  startingMoney: 100,
  taxRates: { dong: 0, bac: 0.04, vang: 0.09, ngoc: 0.14, rong: 0.20 },
  rentIntervalMs: 180_000,
  rentAmounts: { dong: 5, bac: 35, vang: 250, ngoc: 2_000, rong: 15_000 },
  fakeChances: { dong: 0, bac: 0, vang: 0.05, ngoc: 0.06, rong: 0.08 },
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
