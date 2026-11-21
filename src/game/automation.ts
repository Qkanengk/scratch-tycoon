import { AUTOMATION as A } from '../data/automation';
import { buyTicket, collectTicket, revealTicket } from './economy';
import type { GameState, Ticket } from './state';
import { ticketDef } from '../data/tickets';

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
export const ticketCharge = (t: Ticket) => 1 + t.cells.filter(c => c.type === 'bomb').length * A.bombDrain;

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

export function loadRobot(s: GameState, index: number): GameState {
  const robot = s.automation.robots[index];
  if (!robot || robot.tray || robot.charging || robot.charge <= 0 || s.rentDebt > 0) return s;
  const bought = buyTicket({ ...s, ticket: null }, s.selected);
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

export function advanceAutomation(state: GameState, elapsedMs: number, away = false): GameState {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || state.rentDebt > 0 || !state.automation.robots.length) return state;
  let s = { ...state, automation: { ...state.automation, robots: state.automation.robots.map(r => ({ ...r })) } };
  for (let index = 0; index < s.automation.robots.length; index++) {
    let left = elapsedMs;
    while (left > 0) {
      let robot = s.automation.robots[index]!;
      if (robot.charging || robot.charge <= 1e-9) {
        if (away) break;
        robot.charging = true;
        const duration = (batteryCapacity(s) - robot.charge) / batteryCapacity(s) * A.freeChargeMs;
        const step = Math.min(left, duration);
        robot.charge = Math.min(batteryCapacity(s), robot.charge + step / A.freeChargeMs * batteryCapacity(s));
        left -= step;
        if (step < duration) break;
        robot.charging = false;
      }
      if (!robot.tray && s.automation.autoBuy) {
        s = loadRobot(s, index) as typeof s;
        robot = s.automation.robots[index]!;
      }
      const ticket = robot.tray;
      if (!ticket) break;
      const interval = robotInterval(s);
      const drainRate = ticketCharge(ticket) / interval;
      const step = Math.min(left, interval - robot.progressMs, robot.charge / drainRate);
      robot.progressMs += step;
      robot.charge = Math.max(0, robot.charge - step * drainRate);
      left -= step;
      if (robot.progressMs >= interval - 1e-7) {
        const result = collectTicket(revealTicket({ ...s, ticket, equippedTool: 'coin' }));
        const net = result.money - s.money;
        s = { ...result, ticket: state.ticket, equippedTool: state.equippedTool,
          stats: away ? state.stats : result.stats, totalEarned: away ? state.totalEarned : result.totalEarned,
          automation: { ...s.automation, report: { tickets: s.automation.report.tickets + 1, net: s.automation.report.net + net } } } as typeof s;
        robot.tray = null;
        robot.progressMs = 0;
      }
      if (s.rentDebt > 0) break;
    }
  }
  return s;
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
  if (credited <= 0) return result;
  const limits: AwaySummary['limits'] = [];
  if (result.automation.robots.some(r => r.charging || r.charge <= 1e-9)) limits.push('battery');
  if (elapsed >= awayCapMs(s)) limits.push('cap');
  if (result.automation.robots.some(r => !r.tray && !r.charging && r.charge > 1e-9) && result.money < ticketDef(result.selected).price) limits.push('money');
  return { ...result, automation: { ...result.automation, awaySummary: { countedMs, tickets: result.automation.report.tickets, credited, limits } } };
}
