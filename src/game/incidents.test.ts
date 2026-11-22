import { describe, expect, it } from 'vitest';
import { INCIDENTS } from '../data/balance';
import { ticketDef } from '../data/tickets';
import { advanceAutomation, loadRobot } from './automation';
import { buyTicket, claimPromo } from './economy';
import { INCIDENT_KINDS, initialIncidents, type IncidentKind } from './incidents';
import { advanceKioskTime } from './kioskTime';
import { Rng } from './rng';
import { migrate, serialize } from './save';
import { createInitialState } from './state';
import { evaluateCells } from './tickets';

function due(kind: IncidentKind, money = 100, nextInMs = 1) {
  const state = createInitialState(1);
  const rngState = Array.from({ length: 100 }, (_, seed) => seed)
    .find(seed => new Rng(seed).pick(INCIDENT_KINDS) === kind)!;
  return { ...state, money, incidents: { rngState, nextInMs, current: null } };
}

describe('kiosk incidents', () => {
  it.each([
    ['inspection', 10], ['powerCut', 5], ['theft', 5], ['badLuck', 0], ['defectiveStock', 7],
  ] as const)('rolls %s on the foreground clock with a bounded cost', (kind, cost) => {
    const state = due(kind);
    const next = advanceKioskTime(state, 1);
    expect(next.incidents.current).toEqual({ kind, cost, remainingMs: INCIDENTS.durationMs[kind] });
    expect(next.money).toBe(100 - cost);
    expect(next.rngState).toBe(state.rngState);
    expect(next.incidents.nextInMs).toBeGreaterThanOrEqual(INCIDENTS.nextDelayMs[0]);
    expect(next.incidents.nextInMs).toBeLessThanOrEqual(INCIDENTS.nextDelayMs[1]);
    const expired = advanceKioskTime(next, INCIDENTS.durationMs[kind]);
    expect(expired.incidents.current).toBeNull();
    expect(expired.money).toBe(next.money);
  });

  it('reserves the highest unlocked ticket and never creates debt', () => {
    const state = { ...due('theft', 12_050), licenses: ['ngoc' as const] };
    const next = advanceKioskTime(state, 1);
    expect(next.incidents.current?.cost).toBe(50);
    expect(next.money).toBe(ticketDef('ngoc').price);
    expect(next.rentDebt).toBe(0);
    expect(advanceKioskTime(due('inspection', 3), 1).money).toBe(3);
  });

  it('pauses a loaded robot exactly for the outage and leaves the desk usable', () => {
    const state = due('powerCut', 100, 500);
    state.automation.robots.push({ charge: 5, charging: false, tray: null, progressMs: 0 });
    const loaded = loadRobot(state, 0);
    const blocked = advanceKioskTime(loaded, 1000);
    expect(blocked.automation.robots[0]?.progressMs).toBe(500);
    expect(buyTicket(blocked, 'dong').ticket).not.toBeNull();
    const resumed = advanceKioskTime(blocked, INCIDENTS.durationMs.powerCut);
    expect(resumed.automation.robots[0]?.progressMs).toBe(1000);
    expect(resumed.incidents.current).toBeNull();
    expect(resumed.licenseElapsedMs).toBe(19_000);
  });

  it('changes odds only when buying new non-promo tickets at the kiosk', () => {
    const active = advanceKioskTime(due('badLuck'), 1);
    const def = ticketDef('dong');
    const state = Array.from({ length: 1000 }, (_, rngState) => ({ ...active, rngState }))
      .find(s => buyTicket(s, 'dong').ticket?.tier === 0 && (buyTicket(s, 'dong', true).ticket?.tier ?? 0) > 0)!;
    expect(state).toBeDefined();
    const withBadLuck = buyTicket(state, 'dong').ticket!;
    expect(evaluateCells(def, withBadLuck.cells)).toBe(0);
    const placedBefore = buyTicket(due('badLuck'), 'dong');
    expect(advanceKioskTime(placedBefore, 1).ticket).toBe(placedBefore.ticket);
    const promo = { ...state, money: 0, promoReadyAt: 0 };
    const normal = { ...promo, incidents: { ...promo.incidents, current: null } };
    expect(claimPromo(promo, 1).ticket).toEqual(claimPromo(normal, 1).ticket);
    state.automation = { ...state.automation, autoBuy: true, robots: [{ charge: 5, charging: false, tray: null, progressMs: 0 }] };
    const away = advanceAutomation(state, 1, true);
    expect(away.automation.robots[0]?.tray).toEqual(buyTicket(state, 'dong', true).ticket);
    expect(away.incidents).toBe(state.incidents);
  });

  it('preserves the clock and already-applied charge across reload, and migrates v6', () => {
    const raw = advanceKioskTime(due('inspection'), 2000);
    const loaded = migrate(JSON.parse(serialize(raw)), 1_000_000)!;
    expect(loaded.incidents).toEqual(raw.incidents);
    expect(loaded.money).toBe(raw.money);
    expect(advanceKioskTime(loaded, 1)).toEqual(advanceKioskTime(raw, 1));
    expect(migrate({ ...raw, version: 6, incidents: undefined })?.incidents).toEqual(initialIncidents(raw.rngState));
  });

  it('sanitizes malformed incident data without losing the save', () => {
    const raw = due('theft', 87);
    const loaded = migrate({ ...raw, incidents: { rngState: -1, nextInMs: Infinity, current: { kind: 'unknown', remainingMs: 1 } } });
    expect(loaded?.incidents).toEqual(initialIncidents(raw.rngState));
    expect(loaded?.money).toBe(87);
  });
});
