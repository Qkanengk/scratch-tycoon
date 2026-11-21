import type { MessageKey } from '../i18n';
import { BALANCE } from './balance';

export type ToolId = 'coin' | 'key' | 'card' | 'scraper' | 'machine' | 'laser';

export interface ToolDef {
  id: ToolId;
  name: MessageKey;
  price: number;
  baseRadius: number;
  radiusGrowth: number;
  maxLevel: number;
  upgradeBase: number;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'coin', name: 'tool.coin.name', price: 0, baseRadius: BALANCE.brushRadius, radiusGrowth: 0.003, maxLevel: 10, upgradeBase: 19 },
  { id: 'key', name: 'tool.key.name', price: 200, baseRadius: 0.085, radiusGrowth: 0.004, maxLevel: 10, upgradeBase: 60 },
  { id: 'card', name: 'tool.card.name', price: 2_000, baseRadius: 0.13, radiusGrowth: 0.005, maxLevel: 10, upgradeBase: 300 },
  { id: 'scraper', name: 'tool.scraper.name', price: 20_000, baseRadius: 0.19, radiusGrowth: 0.006, maxLevel: 10, upgradeBase: 2_000 },
  { id: 'machine', name: 'tool.machine.name', price: 200_000, baseRadius: 0.26, radiusGrowth: 0.008, maxLevel: 10, upgradeBase: 15_000 },
  { id: 'laser', name: 'tool.laser.name', price: 2_000_000, baseRadius: 0.35, radiusGrowth: 0.01, maxLevel: 10, upgradeBase: 100_000 },
];

export const TOOL_IDS: readonly ToolId[] = TOOLS.map(tool => tool.id);

export function toolDef(id: ToolId): ToolDef {
  const def = TOOLS.find(tool => tool.id === id);
  if (!def) throw new Error(`Unknown tool: ${id}`);
  return def;
}

export function initialToolLevels(): Record<ToolId, number> {
  return { coin: 0, key: 0, card: 0, scraper: 0, machine: 0, laser: 0 };
}
