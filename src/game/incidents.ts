import { INCIDENTS } from '../data/balance';
import { TICKETS, ticketDef } from '../data/tickets';
import { Rng } from './rng';
import type { GameState } from './state';

export type IncidentKind = keyof typeof INCIDENTS.durationMs;
export const INCIDENT_KINDS = Object.keys(INCIDENTS.durationMs) as IncidentKind[];

export interface Incident {
  kind: IncidentKind;
  phase: 'warning' | 'active';
  remainingMs: number;
  cost: number;
}

export interface IncidentState {
  rngState: number;
  nextInMs: number;
  recentBigWin: boolean;
  current: Incident | null;
}

function delay(rng: Rng): number {
  const [min, max] = INCIDENTS.intervalMs;
  return min + rng.int(max - min + 1);
}

export function initialIncidents(seed: number): IncidentState {
  const rng = new Rng(seed ^ 0x4f1bbcdc);
  const nextInMs = delay(rng) - INCIDENTS.warningMs;
  return { rngState: rng.state, nextInMs, recentBigWin: false, current: null };
}

export function incidentActive(s: GameState, kind: IncidentKind): boolean {
  const incident = s.incidents.current;
  return incident?.kind === kind && incident.phase === 'active';
}

function resolveIncident(state: GameState, kind: IncidentKind): GameState {
  const fraction = kind === 'theft' ? INCIDENTS.theftFraction
    : kind === 'inspection' && state.ticket?.fakeTell ? INCIDENTS.fineFraction : 0;
  const reserve = Math.max(ticketDef('dong').price, ...TICKETS.filter(def => state.licenses.includes(def.id)).map(def => def.price));
  const cap = kind === 'theft' ? reserve * INCIDENTS.theftCapTickets : Infinity;
  const cost = Math.floor(Math.min(state.money * fraction, cap, Math.max(0, state.money - reserve)));
  return { ...state, money: state.money - cost, incidents: { ...state.incidents,
    current: { kind, phase: 'active', remainingMs: INCIDENTS.durationMs[kind], cost },
  } };
}

/** Advance at most to the next incident boundary; the caller settles play through that boundary first. */
export function tickIncidents(state: GameState, elapsedMs: number): GameState {
  const { current, nextInMs, rngState } = state.incidents;
  const left = nextInMs - elapsedMs;
  if (left > 0) {
    const remainingMs = (current?.remainingMs ?? 0) - elapsedMs;
    const next = { ...state, incidents: { ...state.incidents, nextInMs: left, current: current && remainingMs > 0 ? { ...current, remainingMs } : null } };
    return current?.phase === 'warning' && remainingMs <= 0 ? resolveIncident(next, current.kind) : next;
  }

  const rng = new Rng(rngState);
  const choices = state.incidents.recentBigWin ? INCIDENT_KINDS : INCIDENT_KINDS.filter(kind => kind !== 'badLuck');
  const kind = rng.pick(choices);
  const nextDelay = delay(rng);
  return { ...state, incidents: {
    rngState: rng.state,
    nextInMs: nextDelay,
    recentBigWin: false,
    current: { kind, phase: 'warning', remainingMs: INCIDENTS.warningMs, cost: 0 },
  } };
}
