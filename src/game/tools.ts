import { toolDef, type ToolId } from '../data/tools';
import type { GameState } from './state';

export function toolRadius(state: GameState): number {
  const def = toolDef(state.equippedTool);
  return def.baseRadius + def.radiusGrowth * state.toolLevels[def.id];
}

export function toolUpgradePrice(state: GameState, id: ToolId): number {
  return Math.ceil(toolDef(id).upgradeBase * 1.22 ** state.toolLevels[id]);
}

export function buyTool(state: GameState, id: ToolId): GameState {
  const def = toolDef(id);
  if (state.ownedTools.includes(id) || state.money < def.price) return state;
  return { ...state, money: state.money - def.price, ownedTools: [...state.ownedTools, id], equippedTool: id };
}

export function upgradeTool(state: GameState, id: ToolId): GameState {
  const price = toolUpgradePrice(state, id);
  if (!state.ownedTools.includes(id) || state.toolLevels[id] >= toolDef(id).maxLevel || state.money < price) return state;
  return { ...state, money: state.money - price, toolLevels: { ...state.toolLevels, [id]: state.toolLevels[id] + 1 } };
}

export function equipTool(state: GameState, id: ToolId): GameState {
  return !state.ownedTools.includes(id) || state.equippedTool === id ? state : { ...state, equippedTool: id };
}
