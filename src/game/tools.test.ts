import { describe, expect, it } from 'vitest';
import { BALANCE } from '../data/balance';
import { TOOLS, toolDef } from '../data/tools';
import { createInitialState } from './state';
import { buyTool, equipTool, toolRadius, toolUpgradePrice, upgradeTool } from './tools';

describe('scratching tools', () => {
  it('starts with only the level-zero coin and the original brush radius', () => {
    const state = createInitialState(1);
    expect(state.ownedTools).toEqual(['coin']);
    expect(state.equippedTool).toBe('coin');
    expect(Object.values(state.toolLevels)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(toolRadius(state)).toBe(BALANCE.brushRadius);
  });

  it.each(TOOLS.slice(1))('buys and auto-equips $id without changing the previous state', (tool) => {
    const state = { ...createInitialState(1), money: tool.price };
    const bought = buyTool(state, tool.id);
    expect(bought.money).toBe(0);
    expect(bought.ownedTools).toEqual(['coin', tool.id]);
    expect(bought.equippedTool).toBe(tool.id);
    expect(toolRadius(bought)).toBe(tool.baseRadius);
    expect(state.ownedTools).toEqual(['coin']);
    expect(buyTool(bought, tool.id)).toBe(bought);
  });

  it('does not buy unaffordable tools or upgrade/equip unowned tools', () => {
    const state = { ...createInitialState(1), money: 0 };
    expect(buyTool(state, 'key')).toBe(state);
    expect(upgradeTool(state, 'coin')).toBe(state);
    expect(equipTool(state, 'key')).toBe(state);
    const rich = { ...state, money: 1e9 };
    expect(upgradeTool(rich, 'laser')).toBe(rich);
  });

  it.each(TOOLS)('upgrades $id with the exponential cost curve up to its cap', (tool) => {
    let state = buyTool({ ...createInitialState(1), money: 1e9 }, tool.id);
    for (let level = 0; level < tool.maxLevel; level++) {
      const before = state;
      const price = Math.ceil(tool.upgradeBase * 1.22 ** level);
      expect(toolUpgradePrice(state, tool.id)).toBe(price);
      state = upgradeTool(state, tool.id);
      expect(state.money).toBe(before.money - price);
      expect(state.toolLevels[tool.id]).toBe(level + 1);
      expect(before.toolLevels[tool.id]).toBe(level);
      expect(toolRadius(state)).toBe(tool.baseRadius + tool.radiusGrowth * (level + 1));
    }
    expect(upgradeTool(state, tool.id)).toBe(state);
  });

  it('can equip any owned tool, preserving levels and purse', () => {
    const state = upgradeTool(buyTool({ ...createInitialState(1), money: 1000 }, 'key'), 'coin');
    const equipped = equipTool(state, 'coin');
    expect(equipped.money).toBe(state.money);
    expect(equipped.toolLevels).toBe(state.toolLevels);
    expect(toolRadius(equipped)).toBe(toolDef('coin').baseRadius + toolDef('coin').radiusGrowth);
    expect(equipTool(equipped, 'coin')).toBe(equipped);
  });

  it('makes each new tool wider than the previous tool at maximum level', () => {
    TOOLS.slice(1).forEach((tool, i) => {
      const previous = TOOLS[i]!;
      expect(tool.baseRadius).toBeGreaterThan(previous.baseRadius + previous.radiusGrowth * previous.maxLevel);
    });
  });
});
