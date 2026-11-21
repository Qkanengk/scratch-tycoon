import { BALANCE } from '../src/data/balance';
import { TICKETS, type TicketId } from '../src/data/tickets';
import { TOOLS, type ToolId } from '../src/data/tools';
import { buyTool, repairPrice, repairTool, toolRadius, toolUpgradePrice, upgradeTool } from '../src/game/tools';
import { advancePlayTime, buyTicket, claimPromo, collectTicket, isBroke, returnFake, revealTicket, updatePromo } from '../src/game/economy';
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
  let firstUpgrade = Infinity;
  const toolPurchases: Partial<Record<ToolId, number>> = { coin: 0 };

  while (elapsed <= horizonSeconds) {
    const cycleStart = elapsed;
    const candidate = TICKETS[next];
    if (candidate && unlockProgress(state, candidate.id).canBuyLicense) {
      intervals[candidate.id] = elapsed - previousUnlock;
      previousUnlock = elapsed;
      state = buyLicense(state, candidate.id);
      next++;
    }
    if (state.totalEarned >= PRESTIGE_EARNINGS) prestige = Math.min(prestige, elapsed);
    if (!candidate && Number.isFinite(prestige)) break;
    // Keep ticket money in reserve and spend at most 15% of the purse per improvement.
    const reserve = TICKETS[next - 1]!.price;
    if (state.durability[state.equippedTool] < 0.4 && state.money >= reserve + repairPrice(state, state.equippedTool)) {
      state = repairTool(state, state.equippedTool);
    }
    const improvements = TOOLS.flatMap(tool => {
      const owned = state.ownedTools.includes(tool.id);
      const cost = owned ? toolUpgradePrice(state, tool.id) : tool.price;
      const radius = tool.baseRadius + tool.radiusGrowth * (owned ? state.toolLevels[tool.id] + 1 : 0);
      return radius > toolRadius(state) && (!owned || state.toolLevels[tool.id] < tool.maxLevel)
        ? [{ id: tool.id, owned, cost }] : [];
    }).sort((a, b) => a.cost - b.cost);
    const improvement = improvements[0];
    if (improvement && improvement.cost <= state.money * 0.15 && state.money - improvement.cost >= reserve) {
      if (improvement.owned) {
        state = upgradeTool(state, improvement.id);
        firstUpgrade = Math.min(firstUpgrade, elapsed);
      } else {
        state = buyTool(state, improvement.id);
        toolPurchases[improvement.id] = elapsed;
      }
    }
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
    // Serial parity models a player noticing half the visible counterfeit tells.
    if (state.ticket?.fakeTell && state.ticket.serial % 2 === 0) state = returnFake(state);
    state = collectTicket(revealTicket(state));
    // A coin takes 4 s: 1.5 s buying/collecting plus 2.5 s scratching.
    // Only scratching speeds up, inversely with radius; overhead stays fixed.
    elapsed += 1.5 + (cycleSeconds - 1.5) * BALANCE.brushRadius / toolRadius(state);
    state = advancePlayTime(state, (elapsed - cycleStart) * 1000);
  }
  return { intervals, prestige, firstUpgrade, toolPurchases };
}

export function percentile(samples: readonly number[], p: number): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1] ?? Infinity;
}
