import { TICKETS } from '../data/tickets';
import { prestigeThreshold } from '../data/prestige';
import { buyTicket } from '../game/economy';
import { SAVE_KEY, serialize } from '../game/save';
import { createInitialState, type GameState } from '../game/state';

export function prestigeScenario(scene: string): GameState {
  const state = createInitialState(2026);
  if (scene === 'start') return state;
  state.money = 8_000_000;
  state.totalEarned = prestigeThreshold(1);
  state.prestige.runEarned = prestigeThreshold(1);
  state.licenses = ['bac', 'vang', 'ngoc', 'rong'];
  state.selected = 'rong';
  state.ownedTools = ['coin', 'key', 'card', 'scraper', 'machine', 'laser'];
  state.equippedTool = 'laser';
  state.toolLevels.laser = 4;
  state.automation.robots = [{ charge: 40, charging: false, tray: null, progressMs: 0 }];
  if (scene === 'board' || scene === 'ticket' || scene === 'complete') {
    state.prestige = { tier: scene === 'complete' ? 5 : 1, runEarned: 0 };
    state.stats.rong = { scratched: 25, wins: 8, jackpots: 0, bigWins: 1 };
    state.licenseElapsedMs = 19 * 60_000 + 20_000;
  }
  if (scene === 'ticket') {
    state.licenses.push('vutru');
    state.selected = 'vutru';
    return buyTicket(state, 'vutru');
  }
  if (scene === 'complete') state.licenses = TICKETS.filter(def => def.unlock).map(def => def.id);
  return state;
}

function isolatedDebugStorage() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== 'prestige') return null;
  const values = new Map<string, string>([[SAVE_KEY, serialize(prestigeScenario(params.get('scene') ?? 'eligible'))]]);
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

export const debugPrestigeStorage = isolatedDebugStorage();
