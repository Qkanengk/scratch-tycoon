import { ticketDef, type TicketId } from '../data/tickets';
import type { GameState } from './state';

export interface UnlockProgress {
  unlocked: boolean;
  revenueDone: boolean;
  scratchedDone: boolean;
  bigWinsDone: boolean;
  affordable: boolean;
  requiredMoney: number;
  /** Every requirement is met and the license can be paid for. */
  canBuyLicense: boolean;
}

export function unlockProgress(state: GameState, id: TicketId): UnlockProgress {
  const { price, unlock } = ticketDef(id);
  if (unlock === null || state.licenses.includes(id)) {
    return {
      unlocked: true,
      revenueDone: true,
      scratchedDone: true,
      bigWinsDone: true,
      affordable: true,
      requiredMoney: 0,
      canBuyLicense: false,
    };
  }
  const stats = state.stats[unlock.mission.ticket];
  const revenueDone = state.totalEarned >= unlock.totalEarned;
  const scratchedDone = stats.scratched >= unlock.mission.scratched;
  const bigWinsDone = stats.bigWins >= unlock.mission.bigWins;
  const requiredMoney = unlock.licenseCost + price;
  const affordable = state.money >= requiredMoney;
  return {
    unlocked: false,
    revenueDone,
    scratchedDone,
    bigWinsDone,
    affordable,
    requiredMoney,
    canBuyLicense: revenueDone && scratchedDone && bigWinsDone && affordable,
  };
}

export function buyLicense(state: GameState, id: TicketId): GameState {
  const unlock = ticketDef(id).unlock;
  if (unlock === null || !unlockProgress(state, id).canBuyLicense) return state;
  return {
    ...state,
    money: state.money - unlock.licenseCost,
    licenses: [...state.licenses, id],
  };
}
