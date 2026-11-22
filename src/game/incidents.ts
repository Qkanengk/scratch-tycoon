import { INCIDENTS } from '../data/balance';
import { TICKETS, ticketDef } from '../data/tickets';
import { Rng } from './rng';
import type { GameState } from './state';

export type IncidentKind = keyof typeof INCIDENTS.durationMs;
export const INCIDENT_KINDS = Object.keys(INCIDENTS.durationMs) as IncidentKind[];

export interface Incident {
  kind: IncidentKind;
  remainingMs: number;
  cost: number;
}

export interface IncidentState {
  rngState: number;
  nextInMs: number;
  current: Incident | null;
}

function delay(rng: Rng, [min, max]: readonly [number, number]): number {
  return min + rng.int(max - min + 1);
}

export function initialIncidents(seed: number): IncidentState {
  const rng = new Rng(seed ^ 0x4f1bbcdc);
  const nextInMs = delay(rng, INCIDENTS.firstDelayMs);
  return { rngState: rng.state, nextInMs, current: null };
}

/** Advance at most to the next incident boundary; the caller settles play through that boundary first. */
export function tickIncidents(state: GameState, elapsedMs: number): GameState {
  const { current, nextInMs, rngState } = state.incidents;
  const left = nextInMs - elapsedMs;
  if (left > 0) {
    const remainingMs = (current?.remainingMs ?? 0) - elapsedMs;
    return { ...state, incidents: { rngState, nextInMs: left, current: current && remainingMs > 0 ? { ...current, remainingMs } : null } };
  }

  const rng = new Rng(rngState);
  const kind = rng.pick(INCIDENT_KINDS);
  const ticketPrice = Math.max(ticketDef('dong').price, ...TICKETS.filter(def => state.licenses.includes(def.id)).map(def => def.price));
  const cap = ticketPrice * INCIDENTS.ticketPriceCap[kind];
  const requested = kind === 'theft' ? Math.min(cap, state.money * INCIDENTS.theftFraction) : cap;
  // Don't take a player's last affordable ticket or put them into debt.
  const cost = Math.floor(Math.min(requested, Math.max(0, state.money - ticketPrice)));
  const nextDelay = delay(rng, INCIDENTS.nextDelayMs);
  return { ...state, money: state.money - cost, incidents: {
    rngState: rng.state,
    nextInMs: nextDelay,
    current: { kind, remainingMs: INCIDENTS.durationMs[kind], cost },
  } };
}
