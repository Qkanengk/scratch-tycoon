import { advanceAutomation } from './automation';
import { advancePlayTime } from './economy';
import { tickIncidents } from './incidents';
import type { GameState } from './state';

export function advanceKioskTime(state: GameState, elapsedMs: number): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  let left = elapsedMs;
  while (left > 0) {
    const { current, nextInMs } = state.incidents;
    const step = Math.min(left, nextInMs, current?.remainingMs ?? Infinity);
    state = advancePlayTime(state, step);
    if (current?.kind !== 'powerCut') state = advanceAutomation(state, step);
    state = tickIncidents(state, step);
    left -= step;
  }
  return state;
}
