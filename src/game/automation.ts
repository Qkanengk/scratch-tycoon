import { AUTOMATION as A } from '../data/automation';
import { PRESTIGE } from '../data/prestige';
import { buyTicket, collectTicket, revealTicket } from './economy';
import type { GameState, Ticket } from './state';
import { ticketDef } from '../data/tickets';
import { advanceStock } from './stock';
import { advanceContracts, contractBoundary } from './contracts';

export interface Robot {
  charge: number;
  charging: boolean;
  tray: Ticket | null;
  progressMs: number;
}

export interface Automation {
  robots: Robot[];
  speed: number;
  capacity: number;
  autoBuy: boolean;
  away: boolean;
  capLevel: number;
  lastSeenAt: number;
  report: { tickets: number; net: number };
  awaySummary: AwaySummary | null;
}

export interface AwaySummary {
  countedMs: number;
  tickets: number;
  credited: number;
  limits: ('battery' | 'cap' | 'money')[];
}

export type AutomationAction = 'robot' | 'speed' | 'capacity' | 'autoBuy' | 'away' | 'cap' | 'load' | 'recharge' | 'dismissAway';

export function initialAutomation(): Automation {
  return { robots: [], speed: 0, capacity: 0, autoBuy: false, away: false, capLevel: 0, lastSeenAt: 0, report: { tickets: 0, net: 0 }, awaySummary: null };
}

export const batteryCapacity = (s: GameState) => A.baseCapacity * A.capacityGrowth ** s.automation.capacity;
export const robotInterval = (s: GameState) => A.ticketMs * A.speedFactor ** s.automation.speed;
export const awayCapMs = (s: GameState) => (A.capHours + s.automation.capLevel * 2) * 3_600_000;
export const ticketCharge = (t: Ticket, tier = 0) => (1 + t.cells.filter(c => c.type === 'bomb').length * A.bombDrain) * (tier >= 5 ? PRESTIGE.batteryMultiplier : 1);

export function robotContext(s: GameState, index = 0): 'robot' | 'recharge' | 'load' {
  const r = s.automation.robots[index];
  return !r ? 'robot' : r.charging || r.charge <= 0 ? 'recharge' : 'load';
}

export function automationPrice(s: GameState, action: AutomationAction, index = 0): number {
  const a = s.automation;
  if (action === 'robot') return A.robotPrices[a.robots.length] ?? Infinity;
  if (action === 'speed') return a.speed < A.maxSpeed ? Math.ceil(A.speedPrice * A.priceGrowth ** a.speed) : Infinity;
  if (action === 'capacity') return a.capacity < A.maxCapacity ? Math.ceil(A.capacityPrice * A.priceGrowth ** a.capacity) : Infinity;
  if (action === 'autoBuy') return a.autoBuy ? Infinity : A.autoBuyPrice;
  if (action === 'away') return a.autoBuy && !a.away ? A.awayPrice : Infinity;
  if (action === 'cap') return a.away && a.capLevel < A.maxCapLevel ? Math.ceil(A.capPrice * A.priceGrowth ** a.capLevel) : Infinity;
  if (action === 'recharge') return Math.ceil(Math.max(0, batteryCapacity(s) - (a.robots[index]?.charge ?? 0)) * A.rechargePerUnit);
  return ticketDef(s.selected).price;
}

export function loadRobot(s: GameState, index: number, away = false): GameState {
  const robot = s.automation.robots[index];
  if (!robot || robot.tray || robot.charging || robot.charge <= 0 || s.rentDebt > 0) return s;
  const bought = buyTicket({ ...s, ticket: null }, s.selected, away ? 'away' : 'robot');
  if (!bought.ticket) return s;
  const robots = [...s.automation.robots];
  robots[index] = { ...robot, tray: bought.ticket, progressMs: 0 };
  return { ...bought, ticket: s.ticket, automation: { ...s.automation, robots } };
}

export function automationAction(s: GameState, action: AutomationAction, index = 0, now = 0): GameState {
  if (action === 'dismissAway') return { ...s, automation: { ...s.automation, awaySummary: null } };
  if (action === 'load') return loadRobot(s, index);
  const price = automationPrice(s, action, index);
  if (!Number.isFinite(price) || s.money < price || (action !== 'robot' && !s.automation.robots.length)) return s;
  const a = { ...s.automation, robots: s.automation.robots.map(r => ({ ...r })) };
  if (action === 'robot') a.robots.push({ charge: batteryCapacity(s), charging: false, tray: null, progressMs: 0 });
  else if (action === 'speed') {
    a.speed++;
    a.robots.forEach(r => { r.progressMs *= A.speedFactor; });
  }
  else if (action === 'capacity') a.capacity++;
  else if (action === 'autoBuy') a.autoBuy = true;
  else if (action === 'away') { a.away = true; a.lastSeenAt = now; }
  else if (action === 'cap') a.capLevel++;
  else {
    const robot = a.robots[index];
    if (!robot || robot.charge >= batteryCapacity(s)) return s;
    robot.charge = batteryCapacity(s);
    robot.charging = false;
  }
  return { ...s, money: s.money - price, automation: a };
}

export function advanceAutomation(state: GameState, elapsedMs: number, away = false, kioskTime = false): GameState {
  const advance = (s: GameState, ms: number) => kioskTime && !away ? advanceContracts(advanceStock(s, ms), ms) : advanceStock(s, ms);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return state;
  if (state.rentDebt > 0 || !state.automation.robots.length) return advance(state, elapsedMs);
  let s = { ...state, automation: { ...state.automation, robots: state.automation.robots.map(r => ({ ...r })) } };
  let left = elapsedMs;
  while (left > 0 && s.rentDebt <= 0) {
    const capacity = batteryCapacity(s);
    const interval = robotInterval(s);
    for (let index = 0; index < s.automation.robots.length; index++) {
      const robot = s.automation.robots[index]!;
      if (!away && robot.charge <= 1e-9) robot.charging = true;
      if (!away && robot.charging && robot.charge >= capacity - 1e-9) {
        robot.charge = capacity;
        robot.charging = false;
      }
      if (!robot.tray && s.automation.autoBuy) s = loadRobot(s, index, away) as typeof s;
    }
    const duration = (robot: Robot) => {
      if (robot.charging) return away ? Infinity : (capacity - robot.charge) / capacity * A.freeChargeMs;
      if (!robot.tray || robot.charge <= 1e-9) return Infinity;
      return Math.min(interval - robot.progressMs, robot.charge * interval / ticketCharge(robot.tray, s.prestige.tier));
    };
    const restock = Math.min(...Object.values(s.stock).filter(entry => entry.remaining === 0).map(entry => entry.remainingMs));
    const next = Math.min(restock, kioskTime && !away ? contractBoundary(s) : Infinity, ...s.automation.robots.map(duration));
    if (!Number.isFinite(next)) { s = advance(s, left) as typeof s; left = 0; break; }
    const step = Math.min(left, next);
    for (const robot of s.automation.robots) {
      if (robot.charging) {
        if (!away) {
          robot.charge = Math.min(capacity, robot.charge + step / A.freeChargeMs * capacity);
          if (robot.charge >= capacity - 1e-9) { robot.charge = capacity; robot.charging = false; }
        }
      } else if (robot.tray && robot.charge > 1e-9) {
        robot.progressMs += step;
        robot.charge = Math.max(0, robot.charge - step * ticketCharge(robot.tray, s.prestige.tier) / interval);
        if (robot.charge <= 1e-9) robot.charge = 0;
      }
    }
    left -= step;
    s = advance(s, step) as typeof s;
    for (const robot of s.automation.robots) {
      const ticket = robot.tray;
      if (!ticket) continue;
      if (robot.progressMs >= interval - 1e-7) {
        const result = collectTicket(revealTicket({ ...s, ticket, equippedTool: 'coin' }), away);
        const net = result.money - s.money;
        s = { ...result, ticket: state.ticket, equippedTool: state.equippedTool,
          stats: away ? state.stats : result.stats, totalEarned: away ? state.totalEarned : result.totalEarned,
          prestige: away ? state.prestige : result.prestige,
          automation: { ...s.automation, report: { tickets: s.automation.report.tickets + 1, net: s.automation.report.net + net } } } as typeof s;
        robot.tray = null;
        robot.progressMs = 0;
      }
    }
  }
  return advance(s, left);
}

export function settleAway(s: GameState, now: number, minimumMs = 0): GameState {
  if (!Number.isFinite(now) || now <= 0) return s;
  const elapsed = now - s.automation.lastSeenAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) return s;
  const ready = s.automation.away && s.automation.autoBuy && s.automation.lastSeenAt > 0 && Number.isFinite(elapsed) && elapsed >= minimumMs && elapsed > 0;
  const prepared = { ...s, automation: { ...s.automation, lastSeenAt: now, report: { tickets: 0, net: 0 } } };
  if (!ready) return prepared;
  const countedMs = Math.min(elapsed, awayCapMs(s));
  const result = advanceAutomation(prepared, countedMs, true);
  const credited = result.money - s.money;
  if (result.automation.report.tickets === 0) return result;
  const limits: AwaySummary['limits'] = [];
  if (result.automation.robots.some(r => r.charging || r.charge <= 1e-9)) limits.push('battery');
  if (elapsed >= awayCapMs(s)) limits.push('cap');
  if (result.automation.robots.some(r => !r.tray && !r.charging && r.charge > 1e-9) && result.money < ticketDef(result.selected).price) limits.push('money');
  return { ...result, automation: { ...result.automation, awaySummary: { countedMs, tickets: result.automation.report.tickets, credited, limits } } };
}
