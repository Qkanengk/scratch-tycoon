import { BULK_LOTS, UPGRADES, type BulkLot, type UpgradeId } from '../data/upgrades';
import type { GameState, Ticket } from './state';

export const deskSlots = (state: GameState) => 1 + state.upgrades.desk;
export const maxBulkLot = (state: GameState): BulkLot => BULK_LOTS[state.upgrades.bulk] ?? 1;
export const holdCapacity = (state: GameState) => Math.max(deskSlots(state), maxBulkLot(state));
export const heldCount = (state: GameState) => Number(state.ticket !== null) + state.deskQueue.length;
export const luckPercent = (state: GameState) => Math.min(50, Math.max(0, state.upgrades.luck));

export function currentRound(state: GameState): Ticket[] {
  if (!state.ticket) return [];
  const round = [state.ticket];
  for (const ticket of state.deskQueue) {
    if (round.length >= deskSlots(state) || ticket.type !== state.ticket.type || ticket.revealed !== state.ticket.revealed) break;
    round.push(ticket);
  }
  return round;
}

export function upgradePrice(state: GameState, id: UpgradeId): number {
  const def = UPGRADES[id];
  return state.upgrades[id] >= def.maxLevel ? Infinity : Math.ceil(def.base * def.growth ** state.upgrades[id]);
}

export function buyUpgrade(state: GameState, id: UpgradeId): GameState {
  const price = upgradePrice(state, id);
  if (!Number.isFinite(price) || state.money < price) return state;
  const next = { ...state, money: state.money - price, upgrades: { ...state.upgrades, [id]: state.upgrades[id] + 1 } };
  return id === 'bulk' ? { ...next, bulkLot: maxBulkLot(next) } : next;
}

export function setBulkLot(state: GameState, lot: number): GameState {
  return BULK_LOTS.includes(lot as BulkLot) && lot <= maxBulkLot(state) && lot !== state.bulkLot
    ? { ...state, bulkLot: lot as BulkLot } : state;
}
