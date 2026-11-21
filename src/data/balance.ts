import type { TicketId } from './tickets';

export const BALANCE = {
  startingMoney: 100,
  /** Share of the prize cells' area that has to be scratched before a ticket counts as done. */
  scratchThreshold: 0.6,
  /** Radius of the starting tool (the coin), as a fraction of the ticket's width. */
  brushRadius: 0.05,
  /** The promotional ticket before the player buys any licenses. */
  promoTicket: 'dong' as TicketId,
  promoIntervalMs: 20_000,
} as const;
