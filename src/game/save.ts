import { BALANCE } from '../data/balance';
import { AUTOMATION } from '../data/automation';
import { PRESTIGE } from '../data/prestige';
import { batteryCapacity, initialAutomation, robotInterval, type Automation, type Robot } from './automation';
import { initialToolLevels, TOOLS, type ToolId } from '../data/tools';
import { BIG_WIN_MULTIPLIER, TICKET_IDS, ticketDef, type TicketId, type TicketRules } from '../data/tickets';
import { layoutTicket } from '../render/layout';
import { revealTicket, startScratch, uncoverCell } from './economy';
import { createMask, encodeMask, restoreMask, scratchProgress, ticketContentKey } from './scratch';
import { createInitialState, emptyStats, SAVE_VERSION, type GameState, type Ticket } from './state';
import { cellCount, jackpotTier } from './tickets';

export const SAVE_KEY = 'scratch-tycoon-save';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}-backup`;

type RawSave = Record<string, unknown>;

/**
 * One entry per old version: turns a save of that version into the next one.
 * Add an entry (and a test) whenever the shape of GameState changes.
 */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {
  5: save => ({ ...save, version: 6, prestige: { tier: 0, runEarned: amount(save.totalEarned, 0) }, licenseElapsedMs: 0 }),
  4: save => ({ ...save, version: 5, automation: initialAutomation() }),
  3: (save) => ({ ...save, version: 4, durability: createInitialState(0).durability, rentElapsedMs: 0, rentDebt: 0,
    ticket: isRecord(save.ticket) ? { ...save.ticket, gross: save.ticket.prize, tax: 0 } : save.ticket }),
  2: (save) => ({ ...save, version: 3, ownedTools: ['coin'], toolLevels: initialToolLevels(), equippedTool: 'coin' }),
  1: (save) => {
    if (!isRecord(save.stats)) return { ...save, version: 2 };
    const stats = { ...save.stats };
    const ticket = readTicket(save.ticket);
    let revealedBigWin: TicketId | undefined;
    if (ticket?.revealed) {
      const def = ticketDef(ticket.type);
      if (ticket.tier !== jackpotTier(def) && ticket.prize >= def.price * BIG_WIN_MULTIPLIER) revealedBigWin = ticket.type;
    }
    for (const id of TICKET_IDS) {
      const entry = stats[id];
      if (isRecord(entry)) stats[id] = { ...entry, bigWins: amount(entry.jackpots, 0) + (id === revealedBigWin ? 1 : 0) };
    }
    return { ...save, version: 2, stats };
  },
};

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function amount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isTicketId(value: unknown): value is TicketId {
  return typeof value === 'string' && (TICKET_IDS as readonly string[]).includes(value);
}

/** Whether a saved cell has every field the renderer and the rules read, for a ticket with these rules. */
function isCell(cell: unknown, rules: TicketRules): boolean {
  if (!isRecord(cell)) return false;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const flag = (value: unknown) => typeof value === 'boolean';
  switch (cell.type) {
    case 'symbol':
      return rules.kind === 'match' && Number.isInteger(cell.symbol) && rules.symbols[cell.symbol as number] !== undefined && flag(cell.win);
    case 'winning':
      return rules.kind === 'lucky' && number(cell.number);
    case 'number':
      return rules.kind === 'lucky' && number(cell.number) && number(cell.prize) && flag(cell.win);
    case 'multiplier':
      return rules.kind === 'lucky' && number(cell.value) && flag(cell.win);
    case 'dragon':
      return rules.kind === 'dragon' && number(cell.prize) && flag(cell.win);
    case 'bomb':
      return rules.kind === 'dragon' || rules.kind === 'lucky';
    case 'blank':
      return rules.kind === 'dragon';
    default:
      return false;
  }
}

function readTicket(value: unknown, prestigeTier = 0): Ticket | null {
  if (!isRecord(value) || !isTicketId(value.type) || !Array.isArray(value.cells)) return null;
  const def = ticketDef(value.type);
  if (prestigeTier < (def.minimumPrestige ?? 0)) return null;
  const tier = amount(value.tier, -1);
  if (value.cells.length !== cellCount(def.rules) || !def.prizes[tier]) return null;
  if (!value.cells.every((cell) => isCell(cell, def.rules))) return null;
  const layout = layoutTicket(def.rules);
  const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
  const scratch = value.revealed !== true && restoreMask(mask, value.scratch)
    && scratchProgress(mask) < 1 ? encodeMask(mask) : undefined;
  const fakeTell = value.free !== true && (value.fakeTell === 'missing-seal' || value.fakeTell === 'misprinted-serial') ? value.fakeTell : null;
  const gross = fakeTell ? 0 : amount(value.gross, amount(value.prize, (def.prizes[tier]?.multiplier ?? 0) * def.price));
  const tax = Math.min(gross, amount(value.tax, Math.floor(Math.max(0, gross - def.price)
    * (BALANCE.taxRates[def.id] + (prestigeTier >= 1 ? PRESTIGE.taxSurcharge : 0)))));
  return {
    serial: amount(value.serial, 0),
    type: value.type,
    cells: value.cells as Ticket['cells'],
    tier,
    prize: gross,
    gross, tax, net: Math.floor((gross - tax) * (1 + prestigeTier * PRESTIGE.bonusPerTier)),
    fakeTell,
    scratchStarted: value.scratchStarted === true || value.revealed === true || (scratch !== undefined && scratchProgress(mask) > 0),
    hitBombs: Array.isArray(value.hitBombs) ? [...new Set(value.hitBombs.filter((i): i is number => Number.isInteger(i) && value.cells instanceof Array && (value.cells[i] as { type?: string })?.type === 'bomb'))] : [],
    free: value.free === true,
    revealed: value.revealed === true,
    ...(scratch === undefined ? {} : { scratch }),
  };
}

function readAutomation(value: unknown, prestigeTier: number): Automation {
  const base = initialAutomation();
  if (!isRecord(value)) return base;
  const level = (v: unknown, max: number) => Number.isInteger(v) && typeof v === 'number' && v >= 0 && v <= max ? v : 0;
  const a: Automation = { ...base, speed: level(value.speed, AUTOMATION.maxSpeed), capacity: level(value.capacity, AUTOMATION.maxCapacity),
    autoBuy: value.autoBuy === true, away: value.autoBuy === true && value.away === true,
    capLevel: value.away === true && value.autoBuy === true ? level(value.capLevel, AUTOMATION.maxCapLevel) : 0,
    lastSeenAt: amount(value.lastSeenAt, 0) };
  const shell = { automation: a } as GameState;
  a.robots = Array.isArray(value.robots) ? value.robots.slice(0, 3).filter(isRecord).map((r): Robot => {
    const tray = readTicket(r.tray, prestigeTier);
    return { charge: Math.min(batteryCapacity(shell), amount(r.charge, 0)), charging: r.charging === true,
      tray: tray && !tray.revealed && !tray.free ? tray : null,
      progressMs: tray && !tray.revealed ? Math.min(robotInterval(shell) - 1e-6, amount(r.progressMs, 0)) : 0 };
  }) : [];
  if (isRecord(value.report)) a.report = { tickets: Math.floor(amount(value.report.tickets, 0)), net: amount(value.report.net, 0) };
  if (isRecord(value.awaySummary) && amount(value.awaySummary.tickets, 0) > 0 && typeof value.awaySummary.credited === 'number' && Number.isFinite(value.awaySummary.credited)) {
    const summary = value.awaySummary;
    a.awaySummary = { countedMs: Math.min(12 * 3600_000, amount(summary.countedMs, 0)), tickets: Math.floor(amount(summary.tickets, 0)),
      credited: Math.trunc(summary.credited as number), limits: Array.isArray(summary.limits) ? [...new Set(summary.limits.filter((limit): limit is 'battery' | 'cap' | 'money' => limit === 'battery' || limit === 'cap' || limit === 'money'))] : [] };
  }
  return a;
}

export function migrate(raw: unknown, now = Date.now()): GameState | null {
  if (!isRecord(raw) || typeof raw.version !== 'number') return null;
  let save = raw;
  let version = raw.version;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    save = step(save);
    version += 1;
  }
  // Saves from a newer build cannot be read.
  if (version !== SAVE_VERSION) return null;

  const base = createInitialState(0);
  const rawPrestige = isRecord(save.prestige) ? save.prestige : {};
  const tier = Math.min(PRESTIGE.maxTier, Math.floor(amount(rawPrestige.tier, 0)));
  const totalEarned = amount(save.totalEarned, 0);
  const prestige = { tier, runEarned: Math.min(totalEarned, amount(rawPrestige.runEarned, 0)) };
  const available = (id: TicketId) => tier >= (ticketDef(id).minimumPrestige ?? 0);
  const ownedTools: ToolId[] = TOOLS.filter(tool => tool.id === 'coin'
    || (Array.isArray(save.ownedTools) && save.ownedTools.includes(tool.id))).map(tool => tool.id);
  const toolLevels = initialToolLevels();
  for (const tool of TOOLS) {
    const level = isRecord(save.toolLevels) ? save.toolLevels[tool.id] : undefined;
    if (ownedTools.includes(tool.id) && typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= tool.maxLevel) {
      toolLevels[tool.id] = level;
    }
  }
  const equippedTool = ownedTools.find(id => id === save.equippedTool) ?? 'coin';
  const durability = { ...base.durability };
  for (const tool of TOOLS) durability[tool.id] = tool.id === 'coin' ? 1 : Math.min(1, amount(isRecord(save.durability) ? save.durability[tool.id] : undefined, 1));
  const stats = emptyStats();
  if (isRecord(save.stats)) {
    for (const id of TICKET_IDS) {
      const entry = save.stats[id];
      if (!isRecord(entry)) continue;
      stats[id] = {
        scratched: amount(entry.scratched, 0),
        wins: amount(entry.wins, 0),
        jackpots: amount(entry.jackpots, 0),
        bigWins: amount(entry.bigWins, 0),
      };
    }
  }
  const ticket = readTicket(save.ticket, tier);
  const damaged = save.ticket;
  // Only explicitly paid, unrevealed tickets qualify; never pay an unverified prize.
  const refund = ticket === null && isRecord(damaged) && isTicketId(damaged.type)
    && available(damaged.type) && damaged.free === false && damaged.revealed === false ? ticketDef(damaged.type).price : 0;
  const latestPromo = now + BALANCE.promoIntervalMs;
  const promoReadyAt = typeof save.promoReadyAt === 'number'
    ? Number.isFinite(save.promoReadyAt) ? Math.min(save.promoReadyAt, latestPromo) : latestPromo
    : null;
  return {
    version: SAVE_VERSION,
    prestige,
    licenseElapsedMs: amount(save.licenseElapsedMs, 0),
    automation: readAutomation(save.automation, tier),
    money: amount(save.money, base.money) + refund,
    durability,
    rentElapsedMs: amount(save.rentElapsedMs, 0) % BALANCE.rentIntervalMs,
    rentDebt: amount(save.rentDebt, 0),
    ownedTools,
    toolLevels,
    equippedTool,
    totalEarned,
    rngState: amount(save.rngState, 0) >>> 0,
    nextSerial: amount(save.nextSerial, 1),
    ticket,
    licenses: Array.isArray(save.licenses) ? TICKET_IDS.filter((id) => available(id) && (save.licenses as unknown[]).includes(id)) : [],
    stats,
    selected: isTicketId(save.selected) && available(save.selected) ? save.selected : base.selected,
    promoReadyAt,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string, now = Date.now()): GameState | null {
  try {
    return migrate(JSON.parse(text), now);
  } catch {
    return null;
  }
}

export interface LoadedSave {
  state: GameState;
  text: string | null;
  recovered: boolean;
  writable: boolean;
  saveFailed: boolean;
}

export function loadStoredSave(storage: Pick<Storage, 'getItem' | 'setItem'>, fresh: () => GameState, now = Date.now()): LoadedSave {
  let text: string | null = null;
  try {
    text = storage.getItem(SAVE_KEY);
    const saved = text === null ? null : deserialize(text, now);
    if (saved) return { state: saved, text, recovered: false, writable: true, saveFailed: false };
    if (text !== null) storage.setItem(SAVE_BACKUP_KEY, text);
    return { state: fresh(), text, recovered: text !== null, writable: true, saveFailed: false };
  } catch {
    // If the backup cannot be kept, leave the original save untouched.
    return { state: fresh(), text, recovered: false, writable: false, saveFailed: true };
  }
}

/** Call under the save's cross-tab lock when available. */
export function updateStoredSave(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  previous: LoadedSave,
  fresh: () => GameState,
  transition: (state: GameState) => GameState,
  now: number,
): LoadedSave {
  let current = previous;
  try {
    if (storage.getItem(SAVE_KEY) !== current.text) current = loadStoredSave(storage, fresh, now);
  } catch {
    current = { ...current, writable: false, saveFailed: true };
  }
  const state = transition(current.state);
  const text = serialize(state);
  if (current.writable && text !== current.text) {
    try {
      storage.setItem(SAVE_KEY, text);
      return { ...current, state, text, saveFailed: false };
    } catch {
      // Keep playing in memory if storage is unavailable.
      return { ...current, state, saveFailed: true };
    }
  }
  return { ...current, state };
}

export function recordReveal(state: GameState, ticket: Ticket): GameState {
  const current = state.ticket;
  if (!current || current.revealed || ticketContentKey(current) !== ticketContentKey(ticket)) return state;
  return revealTicket(state);
}

export function recordScratch(state: GameState, ticket: Ticket, scratch: string): GameState {
  const current = state.ticket;
  if (!current || current.revealed || ticketContentKey(current) !== ticketContentKey(ticket)) return state;
  const layout = layoutTicket(ticketDef(current.type).rules);
  const mask = createMask(layout.cells, layout.height, BALANCE.scratchThreshold);
  if (!restoreMask(mask, scratch)) return state;
  if (current.scratch) restoreMask(mask, current.scratch);
  const merged = encodeMask(mask);
  if (merged === current.scratch) return state;
  let next = scratchProgress(mask) > 0 ? startScratch(state) : state;
  for (let i = 0; i < mask.cells.length; i++) {
    const cell = mask.cells[i]!;
    if (cell.scratched >= cell.target) next = uncoverCell(next, i);
  }
  next = { ...next, ticket: { ...next.ticket!, scratch: merged } };
  return scratchProgress(mask) === 1 ? recordReveal(next, ticket) : next;
}
