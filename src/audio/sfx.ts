import { ASSETS } from '../render/assets';

export type Sound =
  | 'scratch-1' | 'scratch-2' | 'scratch-3' | 'scratch-4' | 'scratch-5'
  | 'ticket-buy' | 'ticket-deal' | 'ticket-collect' | 'reveal'
  | 'coin-1' | 'coin-2' | 'coin-3' | 'coins-many'
  | 'win-small' | 'win-big' | 'win-jackpot' | 'lose' | 'unlock' | 'promo'
  | 'ui-click' | 'ui-select' | 'ui-error';

const MUTE_KEY = 'scratch-tycoon-muted';
const players = new Map<Sound, HTMLAudioElement[]>();
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  // No storage: sound stays on for this visit.
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // The choice only lasts for this visit.
  }
}

/** Plays a sound effect. Browsers only allow this after the player has touched the page, which every caller follows. */
export function play(sound: Sound, volume = 0.6): void {
  if (muted || typeof Audio === 'undefined') return;
  let pool = players.get(sound);
  if (!pool) players.set(sound, (pool = []));
  let audio = pool.find((candidate) => candidate.paused || candidate.ended);
  if (!audio) {
    if (pool.length >= 4) return;
    audio = new Audio(`${ASSETS}/audio/${sound}.mp3`);
    pool.push(audio);
  }
  audio.volume = volume;
  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}

let lastScratch = 0;

/** One of the scratch samples, at most every 90 ms, so a long stroke sounds like rubbing rather than one loop. */
export function playScratch(now: number): void {
  if (now - lastScratch < 90) return;
  lastScratch = now;
  play(`scratch-${1 + Math.floor(Math.random() * 5)}` as Sound, 0.35);
}
