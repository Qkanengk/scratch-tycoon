export const UPGRADES = {
  luck: { base: 600, growth: 1.22, maxLevel: 50 },
  desk: { base: 40_000, growth: 2.5, maxLevel: 7 },
  bulk: { base: 30_000, growth: 2.5, maxLevel: 3 },
} as const;

export type UpgradeId = keyof typeof UPGRADES;
export const BULK_LOTS = [1, 5, 10, 50] as const;
export type BulkLot = typeof BULK_LOTS[number];
