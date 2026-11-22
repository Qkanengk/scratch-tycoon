import { ticketDef, type TicketId } from '../data/tickets';
import type { GameState } from './state';
import { isTicketAvailable } from './economy';

export interface UnlockProgress {
  available: boolean;
  timeDone: boolean;
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
  const available = isTicketAvailable(state, id);
  const { price, unlock } = ticketDef(id);
  if (unlock === null || (available && state.licenses.includes(id))) {
    return {
      available,
      timeDone: true,
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
  const timeDone = state.licenseElapsedMs >= (unlock.minimumPlayMs ?? 0);
  const revenueDone = state.totalEarned >= unlock.totalEarned;
  const scratchedDone = stats.scratched >= unlock.mission.scratched;
  const bigWinsDone = stats.bigWins >= unlock.mission.bigWins;
  const requiredMoney = unlock.licenseCost + (unlock.ticketReserve ?? price);
  const affordable = state.money >= requiredMoney;
  return {
    available,
    timeDone,
    unlocked: false,
    revenueDone,
    scratchedDone,
    bigWinsDone,
    affordable,
    requiredMoney,
    canBuyLicense: available && timeDone && revenueDone && scratchedDone && bigWinsDone && affordable,
  };
}

export function buyLicense(state: GameState, id: TicketId): GameState {
  const unlock = ticketDef(id).unlock;
  if (unlock === null || !unlockProgress(state, id).canBuyLicense) return state;
  return {
    ...state,
    money: state.money - unlock.licenseCost,
    licenses: [...state.licenses, id],
    licenseElapsedMs: 0,
  };
}
