export const PRESTIGE = {
  maxTier: 5,
  firstThreshold: 37_000_000,
  thresholdGrowth: 64,
  bonusPerTier: 0.20,
  taxSurcharge: 0.05,
  rentMultiplier: 1.5,
  fakeSurcharge: 0.04,
  wearMultiplier: 1.5,
  batteryMultiplier: 1.5,
} as const;

export function prestigeThreshold(nextTier: number): number {
  return Number.isInteger(nextTier) && nextTier >= 1 && nextTier <= PRESTIGE.maxTier
    ? PRESTIGE.firstThreshold * PRESTIGE.thresholdGrowth ** (nextTier - 1) : Infinity;
}
