import { BALANCE } from '../src/data/balance';
import { TICKETS, type TicketId } from '../src/data/tickets';
import { buyTicket, claimPromo, collectTicket, isBroke, revealTicket, updatePromo } from '../src/game/economy';
import { createInitialState } from '../src/game/state';
import { buyLicense, unlockProgress } from '../src/game/unlocks';

export const CYCLE_SECONDS = 4;
const PRESTIGE_EARNINGS = 10_000_000_000;

export function simulatePacing(seed: number, horizonSeconds: number, cycleSeconds = CYCLE_SECONDS) {
  let state = createInitialState(seed);
  let elapsed = 0;
  let previousUnlock = 0;
  let next = 1;
  const intervals: Partial<Record<TicketId, number>> = {};
  let prestige = Infinity;

  while (elapsed <= horizonSeconds) {
    const candidate = TICKETS[next];
    if (candidate && unlockProgress(state, candidate.id).canBuyLicense) {
      intervals[candidate.id] = elapsed - previousUnlock;
      previousUnlock = elapsed;
      state = buyLicense(state, candidate.id);
      next++;
    }
    if (state.totalEarned >= PRESTIGE_EARNINGS) prestige = Math.min(prestige, elapsed);
    if (!candidate && Number.isFinite(prestige)) break;
    if (isBroke(state)) {
      state = claimPromo(updatePromo(state, 0), BALANCE.promoIntervalMs);
      elapsed += BALANCE.promoIntervalMs / 1000;
    } else {
      for (let i = next - 1; i >= 0; i--) {
        const def = TICKETS[i];
        if (def && state.money >= def.price) {
          state = buyTicket(state, def.id);
          break;
        }
      }
    }
    state = collectTicket(revealTicket(state));
    elapsed += cycleSeconds;
  }
  return { intervals, prestige };
}

export function percentile(samples: readonly number[], p: number): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1] ?? Infinity;
}
