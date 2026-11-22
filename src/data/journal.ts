export const ACHIEVEMENTS = {
  scratched: [100, 1_000, 3_000, 7_500, 15_000, 30_000, 60_000, 100_000],
  wins: [100, 500, 1_500, 3_000, 6_000, 12_000, 25_000],
  bigWins: [10, 100, 300, 750, 1_500, 3_000, 5_000],
  jackpots: [1, 10, 25, 75, 150],
  streak: [5, 8, 11, 13, 15],
  sets: [1, 2, 3, 4, 5, 6],
  prestige: [1, 5],
} as const;

export const ACHIEVEMENT_BONUS_PERCENT = 1;
export const COLLECTION_BONUS_PERCENT = 3;
export const COLLECTION_STAMPS = [
  { id: 'rare', tier: 3, bit: 1 },
  { id: 'big', tier: 4, bit: 2 },
  { id: 'jackpot', tier: 5, bit: 4 },
] as const;
export const ALL_STAMPS = COLLECTION_STAMPS.reduce((mask, stamp) => mask | stamp.bit, 0);

export const GOLDEN_HOUR = {
  firstDelayMs: [180_000, 300_000],
  repeatDelayMs: [960_000, 1_440_000],
  durationMs: 30_000,
  multiplier: 2,
} as const;
