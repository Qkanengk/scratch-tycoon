import { STOCK } from '../data/balance';
import { TICKET_IDS, type TicketId } from '../data/tickets';
import type { GameState } from './state';

export type Stock = Record<TicketId, { remaining: number; remainingMs: number }>;

export function initialStock(): Stock {
  return Object.fromEntries(TICKET_IDS.map(id => [id, { remaining: STOCK[id].capacity, remainingMs: 0 }])) as Stock;
}

export function consumeStock(state: GameState, id: TicketId): GameState {
  const remaining = state.stock[id].remaining - 1;
  if (remaining < 0) return state;
  return { ...state, stock: { ...state.stock, [id]: { remaining, remainingMs: remaining === 0 ? STOCK[id].restockMs : 0 } } };
}

export function advanceStock(state: GameState, elapsedMs: number): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  if (!Object.values(state.stock).some(entry => entry.remaining === 0)) return state;
  const stock = { ...state.stock };
  for (const id of TICKET_IDS) {
    const entry = stock[id];
    if (entry.remaining > 0) continue;
    const remainingMs = Math.max(0, entry.remainingMs - elapsedMs);
    stock[id] = { remaining: remainingMs === 0 ? STOCK[id].capacity : 0, remainingMs };
  }
  return { ...state, stock };
}

export function rushRestock(state: GameState, id: TicketId): GameState {
  if (state.stock[id].remaining > 0 || state.money < STOCK[id].rushFee) return state;
  return { ...state, money: state.money - STOCK[id].rushFee,
    stock: { ...state.stock, [id]: { remaining: STOCK[id].capacity, remainingMs: 0 } } };
}

export function restockCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
