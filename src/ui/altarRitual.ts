import { canPrestige } from '../game/prestige';
import type { GameState } from '../game/state';

export const INCENSE_CONFIRM_MS = 6_000;

export function blockRepeatedOffering(event: Pick<KeyboardEvent, 'key' | 'repeat' | 'preventDefault'>): boolean {
  if (!event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return false;
  event.preventDefault();
  return true;
}

export function offerIncense(state: GameState, armedUntil: number, now: number) {
  if (!canPrestige(state)) return { armedUntil: 0, confirm: false };
  if (armedUntil > now) return { armedUntil: 0, confirm: true };
  return { armedUntil: now + INCENSE_CONFIRM_MS, confirm: false };
}
