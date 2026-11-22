import { BALANCE, INCIDENTS } from '../data/balance';
import { PRESTIGE } from '../data/prestige';
import { BIG_WIN_MULTIPLIER, TICKETS, ticketDef, type TicketDef, type TicketId } from '../data/tickets';
import { Rng } from './rng';
import { incidentActive } from './incidents';
import type { GameState, Ticket } from './state';
import { generateCells, jackpotTier } from './tickets';
import { wearTool } from './tools';
import { consumeStock } from './stock';
import { progressContract } from './contracts';
import { GOLDEN_HOUR } from '../data/journal';
import { journalBonusPercent, recordTicketInJournal } from './journal';
import { currentRound, heldCount, holdCapacity, luckPercent } from './upgrades';

export function isUnlocked(state: GameState, id: TicketId): boolean {
  return isTicketAvailable(state, id) && (ticketDef(id).unlock === null || state.licenses.includes(id));
}

export function isTicketAvailable(state: GameState, id: TicketId): boolean {
  return state.prestige.tier >= (ticketDef(id).minimumPrestige ?? 0);
}

export function canBuyTicket(state: GameState, id: TicketId): boolean {
  return heldCount(state) < holdCapacity(state) && state.stock[id].remaining > 0 && isUnlocked(state, id) && state.money >= ticketDef(id).price;
}

type PurchaseSource = 'desk' | 'robot' | 'away';

function placeTicket(state: GameState, def: TicketDef, free: boolean, source: PurchaseSource = 'desk'): GameState {
  if (heldCount(state) >= holdCapacity(state)) return state;
  const rng = new Rng(state.rngState);
  const defective = !free && source === 'desk' && incidentActive(state, 'defectiveStock');
  const unlucky = !free && source !== 'away' && incidentActive(state, 'badLuck');
  const luck = luckPercent(state) * (incidentActive(state, 'badLuck') ? 0.5 : 1);
  const { tier, cells } = generateCells(def, rng, unlucky ? INCIDENTS.badLuckPrizeWeight : defective ? INCIDENTS.defectivePrizeWeight : 1, luck);
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
    ...(defective ? { defective: true } : {}),
    scratchStarted: false,
    hitBombs: [],
    free,
    revealed: false,
  };
  const incidents = defective ? { ...state.incidents, current: null } : state.incidents;
  return { ...state, rngState: rng.state, nextSerial: state.nextSerial + 1,
    ticket: state.ticket ?? ticket, deskQueue: state.ticket ? [...state.deskQueue, ticket] : state.deskQueue, incidents };
}

/** Picks the ticket type the empty table offers next. */
export function selectTicket(state: GameState, id: TicketId): GameState {
  if (!isUnlocked(state, id) || state.selected === id) return state;
  return { ...state, selected: id };
}

export function buyTicket(state: GameState, id: TicketId, source: PurchaseSource = 'desk'): GameState {
  if (!canBuyTicket(state, id)) return state;
  const def = ticketDef(id);
  const quantity = Math.min(source === 'desk' ? state.bulkLot : 1, holdCapacity(state) - heldCount(state), state.stock[id].remaining, Math.floor(state.money / def.price));
  for (let i = 0; i < quantity; i++) {
    state = placeTicket({ ...consumeStock(state, id), money: state.money - def.price, selected: id }, def, false, source);
  }
  return state;
}

/** Marks the ticket on the table as fully scratched and counts it toward missions. */
export function revealTicket(state: GameState, away = false): GameState {
  if (!state.ticket || state.ticket.revealed) return state;
  const round = currentRound(state);
  const remaining = state.deskQueue.slice(round.length - 1);
  const revealed: Ticket[] = [];
  const equippedTool = state.equippedTool;
  for (const ticket of round) {
    state = revealSingleTicket({ ...state, ticket, deskQueue: [], equippedTool: revealed.length ? 'coin' : equippedTool }, away);
    revealed.push(state.ticket!);
  }
  return { ...state, equippedTool, ticket: revealed[0]!, deskQueue: [...revealed.slice(1), ...remaining] };
}

function revealSingleTicket(state: GameState, away = false): GameState {
  if (!state.ticket || state.ticket.revealed) return state;
  state = startScratch(state);
  for (let i = 0; i < state.ticket!.cells.length; i++) state = uncoverCell(state, i);
  const ticket = state.ticket;
  if (ticket === null || ticket.revealed) return state;
  const previous = state.stats[ticket.type];
  const def = ticketDef(ticket.type);
  const payoutPercent = ticket.net > 0
    ? (100 + journalBonusPercent(state.journal, state.prestige.tier, ticket.type))
      * (!away && state.goldenHour.active ? GOLDEN_HOUR.multiplier : 1)
    : 100;
  return {
    ...state,
    ticket: { ...ticket, revealed: true, ...(payoutPercent > 100 ? { payoutPercent } : {}), net: applyPayoutPercent(ticket.net, payoutPercent) },
    journal: away ? state.journal : recordTicketInJournal(state.journal, ticket),
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

export function applyPayoutPercent(net: number, percent: number): number {
  return Math.floor(net * percent / 100);
}

/** Pays out a scratched ticket and clears the table. */
export function collectTicket(state: GameState, away = false): GameState {
  if (!state.ticket?.revealed) return state;
  const round = currentRound(state);
  const remaining = state.deskQueue.slice(round.length - 1);
  for (const ticket of round) state = collectSingleTicket({ ...state, ticket, deskQueue: [] }, away);
  return { ...state, ticket: remaining[0] ?? null, deskQueue: remaining.slice(1) };
}

function collectSingleTicket(state: GameState, away = false): GameState {
  const ticket = state.ticket;
  if (ticket === null || !ticket.revealed) return state;
  const withheld = Math.min(state.rentDebt, ticket.net);
  const recentBigWin = !away && ticket.gross >= ticketDef(ticket.type).price * BIG_WIN_MULTIPLIER;
  return progressContract({
    ...state,
    money: state.money + ticket.net - withheld,
    rentDebt: state.rentDebt - withheld,
    totalEarned: state.totalEarned + ticket.net,
    prestige: { ...state.prestige, runEarned: state.prestige.runEarned + ticket.net },
    incidents: recentBigWin ? { ...state.incidents, recentBigWin: true } : state.incidents,
    ticket: null,
  }, ticket, away);
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

export function ticketRefund(ticket: Ticket | null): number {
  if (!ticket || ticket.free || ticket.scratchStarted || ticket.revealed || (!ticket.fakeTell && !ticket.defective)) return 0;
  return Math.floor(ticketDef(ticket.type).price * (1 - (ticket.defective ? INCIDENTS.defectiveReturnFee : BALANCE.fakeReturnFee)));
}

export function returnTicket(state: GameState): GameState {
  const ticket = state.ticket;
  const refund = ticketRefund(ticket);
  if (!refund) return state;
  return { ...state, money: state.money + refund, ticket: state.deskQueue[0] ?? null, deskQueue: state.deskQueue.slice(1) };
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
  if (!promoEligible(state)) return state.promoReadyAt === null ? state : { ...state, promoReadyAt: null };
  if (state.promoReadyAt !== null) return state;
  return { ...state, promoReadyAt: now + BALANCE.promoIntervalMs };
}

export function canClaimPromo(state: GameState, now: number): boolean {
  return promoEligible(state) && state.promoReadyAt !== null && now >= state.promoReadyAt;
}

export function promoEligible(state: GameState): boolean {
  return state.money < cheapestPrice() && heldCount(state) < holdCapacity(state);
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
