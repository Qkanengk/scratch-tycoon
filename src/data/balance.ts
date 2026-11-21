import type { TicketId } from './tickets';

export const BALANCE = {
  startingMoney: 100,
  /** Share of each prize cell the coin must scratch before that patch peels clean. */
  scratchThreshold: 0.5,
  /** Radius of the starting tool (the coin), as a fraction of the ticket's width. */
  brushRadius: 0.05,
  /** The promotional ticket before the player buys any licenses. */
  promoTicket: 'dong' as TicketId,
  promoIntervalMs: 20_000,
} as const;
