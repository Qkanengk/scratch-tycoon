import { CONTRACTS } from '../data/balance';
import { TICKETS, ticketDef, type TicketId } from '../data/tickets';
import { Rng } from './rng';
import type { GameState, Ticket } from './state';

export type ContractKind = keyof typeof CONTRACTS.goals;
export const CONTRACT_KINDS = Object.keys(CONTRACTS.goals) as ContractKind[];
export interface Contract {
  kind: ContractKind;
  ticket: TicketId;
  target: number;
  durationMs: number;
  deposit: number;
  reward: number;
}
export interface ActiveContract extends Contract {
  progress: number;
  remainingMs: number;
}
export interface ContractState {
  rngState: number;
  nextInMs: number;
  offered: Contract | null;
  active: ActiveContract | null;
  resolved: number;
  result: { success: boolean; amount: number } | null;
}

function cooldown(rng: Rng): number {
  return CONTRACTS.cooldownMs[0] + rng.int(CONTRACTS.cooldownMs[1] - CONTRACTS.cooldownMs[0] + 1);
}

export function initialContracts(seed: number): ContractState {
  const rng = new Rng(seed ^ 0x736a21cf);
  const nextInMs = cooldown(rng);
  return { rngState: rng.state, nextInMs, offered: null, active: null, resolved: 0, result: null };
}

export function contractOffer(kind: ContractKind, ticket: TicketId): Contract {
  const price = ticketDef(ticket).price;
  const goal = CONTRACTS.goals[kind];
  return { kind, ticket, target: goal.target * (kind === 'earn' ? price : 1), durationMs: goal.durationMs,
    deposit: price * CONTRACTS.depositTickets, reward: price * CONTRACTS.rewardTickets };
}

export function canAcceptContract(state: GameState): boolean {
  const offer = state.contracts.offered;
  return !!offer && !state.contracts.active && state.money >= offer.deposit + ticketDef(offer.ticket).price;
}

export function acceptContract(state: GameState): GameState {
  if (!canAcceptContract(state)) return state;
  const offer = state.contracts.offered!;
  return { ...state, money: state.money - offer.deposit, contracts: { ...state.contracts, offered: null,
    active: { ...offer, progress: 0, remainingMs: offer.durationMs } } };
}

function resolve(state: GameState, result: ContractState['result']): GameState {
  const rng = new Rng(state.contracts.rngState);
  const nextInMs = cooldown(rng);
  return { ...state, contracts: { ...state.contracts, offered: null, active: null, nextInMs,
    rngState: rng.state, resolved: state.contracts.resolved + 1, result } };
}

export function declineContract(state: GameState): GameState {
  return state.contracts.offered ? resolve(state, null) : state;
}

export function contractBoundary(state: GameState): number {
  return state.contracts.active?.remainingMs ?? (state.contracts.offered ? Infinity : state.contracts.nextInMs);
}

export function advanceContracts(state: GameState, elapsedMs: number): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  const c = state.contracts;
  if (c.active) {
    if (elapsedMs >= c.active.remainingMs) {
      const failed = resolve(state, { success: false, amount: c.active.deposit });
      return advanceContracts(failed, elapsedMs - c.active.remainingMs);
    }
    return { ...state, contracts: { ...c, active: { ...c.active, remainingMs: c.active.remainingMs - elapsedMs } } };
  }
  if (c.offered) return state;
  if (elapsedMs < c.nextInMs) return { ...state, contracts: { ...c, nextInMs: c.nextInMs - elapsedMs } };
  const rng = new Rng(c.rngState);
  const highest = TICKETS.filter(def => state.prestige.tier >= (def.minimumPrestige ?? 0) && (!def.unlock || state.licenses.includes(def.id))).at(-1)!;
  const offered = contractOffer(rng.pick(CONTRACT_KINDS), highest.id);
  return { ...state, contracts: { ...c, rngState: rng.state, nextInMs: CONTRACTS.cooldownMs[0], offered } };
}

export function progressContract(state: GameState, ticket: Ticket, away: boolean): GameState {
  const active = state.contracts.active;
  if (!active || away || active.remainingMs <= 0 || (ticket.free && active.kind !== 'scratch')) return state;
  const delta = active.kind === 'scratch' ? Number(ticket.type === active.ticket)
    : active.kind === 'wins' ? Number(ticket.type === active.ticket && !ticket.fakeTell && ticket.gross >= ticketDef(ticket.type).price * CONTRACTS.winMultiplier)
    : ticket.net;
  if (delta <= 0) return state;
  const progress = Math.min(active.target, active.progress + delta);
  if (progress < active.target) return { ...state, contracts: { ...state.contracts, active: { ...active, progress } } };
  return resolve({ ...state, money: state.money + active.deposit + active.reward }, { success: true, amount: active.reward });
}
