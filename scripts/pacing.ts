import { BALANCE } from '../src/data/balance';
import { TICKETS, type TicketId } from '../src/data/tickets';
import { TOOLS, type ToolId } from '../src/data/tools';
import { buyTool, repairPrice, repairTool, toolRadius, toolUpgradePrice, upgradeTool } from '../src/game/tools';
import { buyTicket, claimPromo, collectTicket, isBroke, isTicketAvailable, returnFake, revealTicket, updatePromo } from '../src/game/economy';
import { advanceKioskTime } from '../src/game/kioskTime';
import { createInitialState } from '../src/game/state';
import { buyLicense, unlockProgress } from '../src/game/unlocks';
import { automationAction, automationPrice, loadRobot, type AutomationAction } from '../src/game/automation';
import { canPrestige, prestige as performPrestige } from '../src/game/prestige';

export const CYCLE_SECONDS = 4;
export const PACING_SEEDS = 384;
export interface PacingRun {
  intervals: Partial<Record<TicketId, number>>;
  firstRobot: number;
  autoBuy: number;
  away: number;
}

const emptyRun = (): PacingRun => ({ intervals: {}, firstRobot: Infinity, autoBuy: Infinity, away: Infinity });

export function simulatePacing(seed: number, horizonSeconds: number, cycleSeconds = CYCLE_SECONDS, robots = false) {
  let state = createInitialState(seed);
  let elapsed = 0;
  let previousUnlock = 0;
  let next = 1;
  const runs: PacingRun[] = [emptyRun()];
  const prestigeTimes: number[] = [];
  let runStart = 0;
  let prestige = Infinity;
  let firstUpgrade = Infinity;
  let firstRobot = Infinity;
  let autoBuy = Infinity;
  let away = Infinity;
  const toolPurchases: Partial<Record<ToolId, number>> = { coin: 0 };

  while (elapsed <= horizonSeconds) {
    const cycleStart = elapsed;
    if (canPrestige(state)) {
      prestigeTimes.push(elapsed);
      prestige = Math.min(prestige, elapsed);
      state = performPrestige(state);
      runStart = elapsed;
      previousUnlock = elapsed;
      next = 1;
      runs.push(emptyRun());
    }
    const run = runs[state.prestige.tier]!;
    const tickets = TICKETS.filter(def => isTicketAvailable(state, def.id));
    const candidate = tickets[next];
    if (candidate?.unlock) {
      const progress = unlockProgress(state, candidate.id);
      if (!progress.timeDone && progress.revenueDone && progress.scratchedDone && progress.bigWinsDone && progress.affordable) {
        const waitMs = candidate.unlock.minimumPlayMs! - state.licenseElapsedMs;
        const countedMs = Math.min(waitMs, cycleSeconds * 1000, (horizonSeconds - elapsed) * 1000);
        if (countedMs <= 0) break;
        state = advanceKioskTime(state, countedMs);
        elapsed += countedMs / 1000;
        continue;
      }
    }
    if (candidate && unlockProgress(state, candidate.id).canBuyLicense) {
      run.intervals[candidate.id] = elapsed - previousUnlock;
      previousUnlock = elapsed;
      state = buyLicense(state, candidate.id);
      next++;
    }
    // Keep ticket money in reserve and spend at most 15% of the purse per improvement.
    const reserve = tickets[next - 1]!.price;
    if (robots) {
      const actions: AutomationAction[] = state.automation.robots.length ? ['autoBuy', 'away', 'speed', 'capacity', 'robot', 'cap'] : ['robot'];
      const action = actions.filter(action => automationPrice(state, action) <= state.money * .15 && state.money - automationPrice(state, action) >= reserve)
        .sort((a, b) => automationPrice(state, a) - automationPrice(state, b))[0];
      if (action) state = automationAction(state, action, 0, elapsed * 1000);
      if (state.automation.robots.length) firstRobot = Math.min(firstRobot, elapsed);
      if (state.automation.autoBuy) autoBuy = Math.min(autoBuy, elapsed);
      if (state.automation.away) away = Math.min(away, elapsed);
      if (state.automation.robots.length) run.firstRobot = Math.min(run.firstRobot, elapsed - runStart);
      if (state.automation.autoBuy) run.autoBuy = Math.min(run.autoBuy, elapsed - runStart);
      if (state.automation.away) run.away = Math.min(run.away, elapsed - runStart);
      for (let i = 0; i < state.automation.robots.length; i++) {
        const robot = state.automation.robots[i]!;
        if ((robot.charging || robot.charge <= 0) && state.money >= reserve + automationPrice(state, 'recharge', i)) state = automationAction(state, 'recharge', i);
        state = loadRobot(state, i);
      }
    }
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
        toolPurchases[improvement.id] ??= elapsed;
      }
    }
    if (isBroke(state)) {
      state = claimPromo(updatePromo(state, 0), BALANCE.promoIntervalMs);
      elapsed += BALANCE.promoIntervalMs / 1000;
    } else {
      for (let i = next - 1; i >= 0; i--) {
        const def = tickets[i];
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
    state = advanceKioskTime(state, (elapsed - cycleStart) * 1000);
  }
  return { intervals: runs[0]!.intervals, runs, prestige, prestigeTimes, firstUpgrade, toolPurchases, firstRobot, autoBuy, away,
    runEarned: state.prestige.runEarned, totalEarned: state.totalEarned };
}

export function percentile(samples: readonly number[], p: number): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * p) - 1] ?? Infinity;
}
