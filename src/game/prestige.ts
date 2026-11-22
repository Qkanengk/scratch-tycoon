import { PRESTIGE, prestigeThreshold } from '../data/prestige';
import { createInitialState, type GameState } from './state';

export function canPrestige(state: GameState): boolean {
  return state.prestige.tier < PRESTIGE.maxTier && state.licenses.includes('rong')
    && state.prestige.runEarned >= prestigeThreshold(state.prestige.tier + 1);
}

export function prestige(state: GameState): GameState {
  if (!canPrestige(state)) return state;
  return {
    ...createInitialState(state.rngState),
    prestige: { tier: state.prestige.tier + 1, runEarned: 0 },
    totalEarned: state.totalEarned,
    rngState: state.rngState,
    nextSerial: state.nextSerial,
    journal: { ...state.journal, currentStreak: 0 },
  };
}
