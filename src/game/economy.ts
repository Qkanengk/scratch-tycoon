import { BALANCE, INCIDENTS } from '../data/balance';
import { PRESTIGE } from '../data/prestige';
import { BIG_WIN_MULTIPLIER, TICKETS, ticketDef, type TicketDef, type TicketId } from '../data/tickets';
import { Rng } from './rng';
import type { GameState, Ticket } from './state';
import { generateCells, jackpotTier } from './tickets';
import { wearTool } from './tools';

export function isUnlocked(state: GameState, id: TicketId): boolean {
  return isTicketAvailable(state, id) && (ticketDef(id).unlock === null || state.licenses.includes(id));
}

export function isTicketAvailable(state: GameState, id: TicketId): boolean {
  return state.prestige.tier >= (ticketDef(id).minimumPrestige ?? 0);
}

export function canBuyTicket(state: GameState, id: TicketId): boolean {
  return state.ticket === null && isUnlocked(state, id) && state.money >= ticketDef(id).price;
}

function placeTicket(state: GameState, def: TicketDef, free: boolean, away = false): GameState {
  const rng = new Rng(state.rngState);
  const extraMiss = !free && !away && state.incidents.current?.kind === 'badLuck' ? INCIDENTS.extraMissChance : 0;
  const { tier, cells } = generateCells(def, rng, extraMiss);
  const fakeChance = BALANCE.fakeChances[def.id] + (state.prestige.tier >= 3 ? PRESTIGE.fakeSurcharge : 0);
  const fake = !free && fakeChance > 0 && rng.next() < fakeChance;
  const gross = fake ? 0 : (def.prizes[tier]?.multiplier ?? 0) * def.price;
  const tax = Math.floor(Math.max(0, gross - def.price) * (BALANCE.taxRates[def.id] + (state.prestige.tier >= 1 ? PRESTIGE.taxSurcharge : 0)));
  const net = Math.floor((gross - tax) * (1 + state.prestige.tier * PRESTIGE.bonusPerTier));
  const ticket: Ticket = {
    serial: state.nextSerial,
    type: def.id,
    cells,
    tier,
    prize: gross,
    gross, tax, net,
    fakeTell: fake ? rng.pick(['missing-seal', 'misprinted-serial'] as const) : null,
    scratchStarted: false,
    hitBombs: [],
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

export function buyTicket(state: GameState, id: TicketId, away = false): GameState {
  if (!canBuyTicket(state, id)) return state;
  const def = ticketDef(id);
  return placeTicket({ ...state, money: state.money - def.price, selected: id }, def, false, away);
}

/** Marks the ticket on the table as fully scratched and counts it toward missions. */
export function revealTicket(state: GameState): GameState {
  if (!state.ticket || state.ticket.revealed) return state;
  state = startScratch(state);
  for (let i = 0; i < state.ticket!.cells.length; i++) state = uncoverCell(state, i);
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
        jackpots: previous.jackpots + (!ticket.fakeTell && ticket.tier === jackpotTier(def) ? 1 : 0),
        bigWins: previous.bigWins + (!ticket.fakeTell && (def.prizes[ticket.tier]?.multiplier ?? 0) >= BIG_WIN_MULTIPLIER ? 1 : 0),
      },
    },
  };
}

/** Pays out a scratched ticket and clears the table. */
export function collectTicket(state: GameState): GameState {
  const ticket = state.ticket;
  if (ticket === null || !ticket.revealed) return state;
  const withheld = Math.min(state.rentDebt, ticket.net);
  return {
    ...state,
    money: state.money + ticket.net - withheld,
    rentDebt: state.rentDebt - withheld,
    totalEarned: state.totalEarned + ticket.net,
    prestige: { ...state.prestige, runEarned: state.prestige.runEarned + ticket.net },
    ticket: null,
  };
}

export function startScratch(state: GameState): GameState {
  if (!state.ticket || state.ticket.revealed || state.ticket.scratchStarted) return state;
  return { ...wearTool(state, BALANCE.ticketWear), ticket: { ...state.ticket, scratchStarted: true } };
}

export function uncoverCell(state: GameState, index: number): GameState {
  const ticket = state.ticket;
  if (!ticket || ticket.revealed || ticket.cells[index]?.type !== 'bomb' || ticket.hitBombs.includes(index)) return state;
  state = startScratch(state);
  return { ...wearTool(state, BALANCE.bombWear), ticket: { ...state.ticket!, hitBombs: [...ticket.hitBombs, index] } };
}

export function returnFake(state: GameState): GameState {
  const ticket = state.ticket;
  if (!ticket?.fakeTell || ticket.free || ticket.scratchStarted || ticket.revealed) return state;
  const refund = Math.floor(ticketDef(ticket.type).price * (1 - BALANCE.fakeReturnFee));
  return { ...state, money: state.money + refund, ticket: null };
}

export function rentAmount(state: GameState): number {
  const base = TICKETS.reduce((amount, def) => isUnlocked(state, def.id) ? BALANCE.rentAmounts[def.id] : amount, BALANCE.rentAmounts.dong as number);
  return Math.ceil(base * (state.prestige.tier >= 2 ? PRESTIGE.rentMultiplier : 1));
}

export function timeToNextRent(state: GameState): number {
  return BALANCE.rentIntervalMs - state.rentElapsedMs;
}

/** The caller supplies only elapsed active play time, never wall-clock timestamps. */
export function advancePlayTime(state: GameState, elapsedMs: number): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  const elapsed = state.rentElapsedMs + elapsedMs;
  const due = Math.floor(elapsed / BALANCE.rentIntervalMs) * rentAmount(state);
  const paid = Math.min(state.money, due);
  return { ...state, licenseElapsedMs: state.licenseElapsedMs + elapsedMs, rentElapsedMs: elapsed % BALANCE.rentIntervalMs, money: state.money - paid, rentDebt: state.rentDebt + due - paid };
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
