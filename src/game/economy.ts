import { BALANCE } from '../data/balance';
import { BIG_WIN_MULTIPLIER, TICKETS, ticketDef, type TicketDef, type TicketId } from '../data/tickets';
import { Rng } from './rng';
import type { GameState, Ticket } from './state';
import { generateCells, jackpotTier } from './tickets';

export function isUnlocked(state: GameState, id: TicketId): boolean {
  return ticketDef(id).unlock === null || state.licenses.includes(id);
}

export function canBuyTicket(state: GameState, id: TicketId): boolean {
  return state.ticket === null && isUnlocked(state, id) && state.money >= ticketDef(id).price;
}

function placeTicket(state: GameState, def: TicketDef, free: boolean): GameState {
  const rng = new Rng(state.rngState);
  const { tier, cells } = generateCells(def, rng);
  const ticket: Ticket = {
    serial: state.nextSerial,
    type: def.id,
    cells,
    tier,
    prize: (def.prizes[tier]?.multiplier ?? 0) * def.price,
    free,
    revealed: false,
  };
  return { ...state, rngState: rng.state, nextSerial: state.nextSerial + 1, ticket };
}

/** Picks the ticket type the empty table offers next. */
export function selectTicket(state: GameState, id: TicketId): GameState {
  if (!isUnlocked(state, id) || state.selected === id) return state;
  return { ...state, selected: id };
}

export function buyTicket(state: GameState, id: TicketId): GameState {
  if (!canBuyTicket(state, id)) return state;
  const def = ticketDef(id);
  return placeTicket({ ...state, money: state.money - def.price, selected: id }, def, false);
}

/** Marks the ticket on the table as fully scratched and counts it toward missions. */
export function revealTicket(state: GameState): GameState {
  const ticket = state.ticket;
  if (ticket === null || ticket.revealed) return state;
  const previous = state.stats[ticket.type];
  const def = ticketDef(ticket.type);
  return {
    ...state,
    ticket: { ...ticket, revealed: true },
    stats: {
      ...state.stats,
      [ticket.type]: {
        scratched: previous.scratched + 1,
        wins: previous.wins + (ticket.prize > 0 ? 1 : 0),
        jackpots: previous.jackpots + (ticket.tier === jackpotTier(def) ? 1 : 0),
        bigWins: previous.bigWins + ((def.prizes[ticket.tier]?.multiplier ?? 0) >= BIG_WIN_MULTIPLIER ? 1 : 0),
      },
    },
  };
}

/** Pays out a scratched ticket and clears the table. */
export function collectTicket(state: GameState): GameState {
  const ticket = state.ticket;
  if (ticket === null || !ticket.revealed) return state;
  return {
    ...state,
    money: state.money + ticket.prize,
    totalEarned: state.totalEarned + ticket.prize,
    ticket: null,
  };
}

function cheapestPrice(): number {
  return Math.min(...TICKETS.map((def) => def.price));
}

/** Broke: nothing on the table and not enough money for the cheapest ticket. */
export function isBroke(state: GameState): boolean {
  return state.ticket === null && state.money < cheapestPrice();
}

/** Starts or cancels the free-ticket countdown. Returns the same object when nothing changes. */
export function updatePromo(state: GameState, now: number): GameState {
  if (!isBroke(state)) return state.promoReadyAt === null ? state : { ...state, promoReadyAt: null };
  if (state.promoReadyAt !== null) return state;
  return { ...state, promoReadyAt: now + BALANCE.promoIntervalMs };
}

export function canClaimPromo(state: GameState, now: number): boolean {
  return isBroke(state) && state.promoReadyAt !== null && now >= state.promoReadyAt;
}

export function promoTicketDef(state: GameState): TicketDef {
  return TICKETS.reduce(
    (best, def) => def.price > best.price && isUnlocked(state, def.id) ? def : best,
    ticketDef(BALANCE.promoTicket),
  );
}

export function claimPromo(state: GameState, now: number): GameState {
  if (!canClaimPromo(state, now)) return state;
  return placeTicket({ ...state, promoReadyAt: null }, promoTicketDef(state), true);
}
