import { toolDef, type ToolId } from '../data/tools';
import { BALANCE } from '../data/balance';
import type { GameState } from './state';

export type ToolIntent = { id: ToolId; kind: 'buy' | 'equip' | 'upgrade'; level: number };

export function toolIntent(state: GameState, id: ToolId): ToolIntent | null {
  const level = state.toolLevels[id];
  const kind = !state.ownedTools.includes(id) ? 'buy' : state.equippedTool !== id ? 'equip' : level < toolDef(id).maxLevel ? 'upgrade' : null;
  return kind ? { id, kind, level } : null;
}

export function applyToolIntent(state: GameState, intent: ToolIntent): GameState {
  const current = toolIntent(state, intent.id);
  if (!current || current.kind !== intent.kind || current.level !== intent.level) return state;
  return intent.kind === 'buy' ? buyTool(state, intent.id) : intent.kind === 'equip' ? equipTool(state, intent.id) : upgradeTool(state, intent.id);
}

export function toolRadius(state: GameState): number {
  const def = toolDef(state.equippedTool);
  return (def.baseRadius + def.radiusGrowth * state.toolLevels[def.id])
    * (BALANCE.minimumRadiusFactor + (1 - BALANCE.minimumRadiusFactor) * state.durability[def.id]);
}

export function wearTool(state: GameState, wear: number): GameState {
  const id = state.equippedTool;
  if (id === 'coin' || !Number.isFinite(wear) || wear <= 0) return state;
  return { ...state, durability: { ...state.durability, [id]: Math.max(0, state.durability[id] - wear) } };
}

export function repairPrice(state: GameState, id: ToolId): number {
  const price = toolDef(id).price * BALANCE.repairPriceFraction * (1 - state.durability[id]);
  return Math.ceil(Math.round(price * 1e9) / 1e9);
}

export function repairTool(state: GameState, id: ToolId): GameState {
  const price = repairPrice(state, id);
  if (!state.ownedTools.includes(id) || state.money < price || state.durability[id] === 1) return state;
  return { ...state, money: state.money - price, durability: { ...state.durability, [id]: 1 } };
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
