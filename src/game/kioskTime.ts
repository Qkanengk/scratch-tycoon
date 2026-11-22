import { advanceAutomation } from './automation';
import { advancePlayTime } from './economy';
import { incidentActive, tickIncidents } from './incidents';
import type { GameState } from './state';
import { advanceStock } from './stock';
import { advanceContracts, contractBoundary } from './contracts';
import { tickGoldenHour } from './goldenHour';

export function advanceKioskTime(state: GameState, elapsedMs: number): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  let left = elapsedMs;
  while (left > 0) {
    const { current, nextInMs } = state.incidents;
    const step = Math.min(left, nextInMs, current?.remainingMs ?? Infinity, contractBoundary(state), state.goldenHour.remainingMs);
    state = advancePlayTime(state, step);
    if (!incidentActive(state, 'powerCut')) state = advanceAutomation(state, step, false, true);
    else state = advanceContracts(advanceStock(state, step), step);
    state = tickIncidents(state, step);
    state = { ...state, goldenHour: tickGoldenHour(state.goldenHour, step) };
    left -= step;
  }
  return state;
}
