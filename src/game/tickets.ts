import type { PrizeTier, TicketDef, TicketRules } from '../data/tickets';
import type { Rng } from './rng';
import type { Cell } from './state';
import { BALANCE } from '../data/balance';

type MatchRules = Extract<TicketRules, { kind: 'match' }>;
type LuckyRules = Extract<TicketRules, { kind: 'lucky' }>;
type DragonRules = Extract<TicketRules, { kind: 'dragon' }>;

export function expectedReturn(prizes: readonly PrizeTier[]): number {
  const total = prizes.reduce((sum, tier) => sum + tier.weight, 0);
  return prizes.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) / total;
}

export function jackpotTier(def: TicketDef): number {
  return def.prizes.length - 1;
}

export function rollTier(prizes: readonly PrizeTier[], rng: Rng, prizeWeight = 1): number {
  const weight = (tier: PrizeTier) => tier.weight * (tier.multiplier > 0 ? prizeWeight : 1);
  const total = prizes.reduce((sum, tier) => sum + weight(tier), 0);
  let roll = rng.next() * total;
  for (let i = 0; i < prizes.length; i++) {
    roll -= weight(prizes[i] as PrizeTier);
    if (roll < 0) return i;
  }
  return 0;
}

export function cellCount(rules: TicketRules): number {
  switch (rules.kind) {
    case 'match':
      return rules.cells;
    case 'lucky':
      return rules.winning + rules.numbers + (rules.multipliers ? 1 : 0);
    case 'dragon':
      return rules.size * rules.size;
  }
}

function winningMultipliers(def: TicketDef): number[] {
  return def.prizes.filter((tier) => tier.multiplier > 0).map((tier) => tier.multiplier);
}

function matchCells(rules: MatchRules, tier: number, rng: Rng): Cell[] {
  const counts = rules.symbols.map(() => 0);
  const picked: number[] = [];
  const winner = tier - 1;
  if (tier > 0) {
    for (let i = 0; i < rules.need; i++) picked.push(winner);
    counts[winner] = rules.need;
  }
  // Fill the rest without ever completing another set.
  while (picked.length < rules.cells) {
    const symbol = rng.int(rules.symbols.length);
    if ((counts[symbol] as number) >= rules.need - 1) continue;
    counts[symbol] = (counts[symbol] as number) + 1;
    picked.push(symbol);
  }
  rng.shuffle(picked);
  return picked.map((symbol) => ({ type: 'symbol', symbol, win: tier > 0 && symbol === winner }));
}

function luckyCells(def: TicketDef, rules: LuckyRules, tier: number, rng: Rng): Cell[] {
  const multiplier = (def.prizes[tier] as PrizeTier).multiplier;
  const pool = rng.shuffle(Array.from({ length: rules.maxNumber }, (_, i) => i + 1));
  const winning = pool.slice(0, rules.winning);
  const others = pool.slice(rules.winning, rules.winning + rules.numbers);

  let factor = 1;
  if (rules.multipliers) {
    const options = rules.multipliers.filter((m) => multiplier === 0 || multiplier % m === 0);
    factor = rng.pick(options);
  }
  const base = multiplier / factor;
  // Sometimes pay the same total through two matching numbers.
  const parts = base === 0 ? [] : base % 2 === 0 && rng.next() < 0.3 ? [base / 2, base / 2] : [base];

  const decoys = winningMultipliers(def);
  const numbers: Cell[] = others.map((number) => ({
    type: 'number',
    number,
    prize: rng.pick(decoys),
    win: false,
  }));
  const slots = rng.shuffle(numbers.map((_, i) => i));
  const matched = rng.shuffle([...winning]);
  parts.forEach((prize, i) => {
    numbers[slots[i] as number] = { type: 'number', number: matched[i] as number, prize, win: true };
  });

  const cells: Cell[] = [...winning.map((number): Cell => ({ type: 'winning', number })), ...numbers];
  if (rules.multipliers) {
    cells.push({ type: 'multiplier', value: factor, win: multiplier > 0 && factor > 1 });
  }
  return cells;
}

function dragonCells(def: TicketDef, rules: DragonRules, tier: number, rng: Rng): Cell[] {
  const total = rules.size * rules.size;
  const multiplier = (def.prizes[tier] as PrizeTier).multiplier;
  const win = multiplier > 0;
  let dragons = rules.dragons;
  let bombs = 0;
  let prize = multiplier;
  if (!win) {
    prize = rng.pick(winningMultipliers(def));
    if (rng.next() < 0.2) {
      // Near miss: all the dragons, spoiled by a bomb.
      bombs = 1 + rng.int(2);
    } else {
      dragons = rng.int(rules.dragons);
      bombs = rng.int(4);
    }
  }
  const cells: Cell[] = [];
  for (let i = 0; i < dragons; i++) cells.push({ type: 'dragon', prize, win });
  for (let i = 0; i < bombs; i++) cells.push({ type: 'bomb' });
  while (cells.length < total) cells.push({ type: 'blank' });
  return rng.shuffle(cells);
}

/** Decides the outcome first, then lays out cells that show exactly that outcome. */
export function generateCells(def: TicketDef, rng: Rng, prizeWeight = 1): { tier: number; cells: Cell[] } {
  const tier = rollTier(def.prizes, rng, prizeWeight);
  const rules = def.rules;
  switch (rules.kind) {
    case 'match':
      return { tier, cells: matchCells(rules, tier, rng) };
    case 'lucky': {
      const cells = luckyCells(def, rules, tier, rng);
      if (def.id === 'ngoc' && rng.next() < BALANCE.ngocBombChance) {
        const index = cells.findIndex(cell => cell.type === 'number' && !cell.win);
        if (index >= 0) cells[index] = { type: 'bomb' };
      }
      return { tier, cells };
    }
    case 'dragon':
      return { tier, cells: dragonCells(def, rules, tier, rng) };
  }
}

/** Reads the prize multiplier off the cells by the ticket's printed rules, independently of the generator. */
export function evaluateCells(def: TicketDef, cells: readonly Cell[]): number {
  const rules = def.rules;
  switch (rules.kind) {
    case 'match': {
      const counts = new Map<number, number>();
      for (const cell of cells) {
        if (cell.type === 'symbol') counts.set(cell.symbol, (counts.get(cell.symbol) ?? 0) + 1);
      }
      for (const [symbol, count] of counts) {
        if (count >= rules.need) return def.prizes[symbol + 1]?.multiplier ?? 0;
      }
      return 0;
    }
    case 'lucky': {
      const winning = new Set<number>();
      for (const cell of cells) if (cell.type === 'winning') winning.add(cell.number);
      let sum = 0;
      let factor = 1;
      for (const cell of cells) {
        if (cell.type === 'number' && winning.has(cell.number)) sum += cell.prize;
        if (cell.type === 'multiplier') factor = cell.value;
      }
      return sum * factor;
    }
    case 'dragon': {
      const dragons = cells.filter((cell) => cell.type === 'dragon');
      const bombs = cells.filter((cell) => cell.type === 'bomb').length;
      const first = dragons[0];
      if (dragons.length < rules.dragons || bombs > 0 || first?.type !== 'dragon') return 0;
      return first.prize;
    }
  }
}
