import { GOLDEN_HOUR } from '../data/journal';
import { Rng } from './rng';

export interface GoldenHour {
  rngState: number;
  active: boolean;
  remainingMs: number;
}

function delay(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng.int(max - min + 1);
}

export function initialGoldenHour(seed: number): GoldenHour {
  const rng = new Rng(seed ^ 0x2f7a0d9b);
  const remainingMs = delay(rng, GOLDEN_HOUR.firstDelayMs);
  return { rngState: rng.state, active: false, remainingMs };
}

/** Called with at most the time to the current boundary. */
export function tickGoldenHour(event: GoldenHour, elapsedMs: number): GoldenHour {
  const remainingMs = event.remainingMs - elapsedMs;
  if (remainingMs > 0) return { ...event, remainingMs };
  if (!event.active) return { ...event, active: true, remainingMs: GOLDEN_HOUR.durationMs };
  const rng = new Rng(event.rngState);
  const next = delay(rng, GOLDEN_HOUR.repeatDelayMs);
  return { rngState: rng.state, active: false, remainingMs: next };
}
