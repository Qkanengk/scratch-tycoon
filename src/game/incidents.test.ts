import { describe, expect, it } from 'vitest';
import { INCIDENTS } from '../data/balance';
import { ticketDef } from '../data/tickets';
import { advanceAutomation, loadRobot } from './automation';
import { buyTicket, claimPromo, collectTicket, returnTicket, revealTicket, startScratch } from './economy';
import { INCIDENT_KINDS, initialIncidents, type IncidentKind } from './incidents';
import { advanceKioskTime } from './kioskTime';
import { Rng } from './rng';
import { migrate, serialize } from './save';
import { createInitialState } from './state';
import { evaluateCells } from './tickets';

function due(kind: IncidentKind, money = 100, nextInMs = 1, recentBigWin = true) {
  const state = createInitialState(1);
  const rngState = Array.from({ length: 100 }, (_, seed) => seed)
    .find(seed => new Rng(seed).pick(INCIDENT_KINDS) === kind)!;
  return { ...state, money, incidents: { rngState, nextInMs, recentBigWin, current: null } };
}

const resolve = (state: ReturnType<typeof createInitialState>) =>
  advanceKioskTime(state, state.incidents.nextInMs + INCIDENTS.warningMs);

describe('kiosk incidents', () => {
  it.each([
    ['inspection', 0], ['powerCut', 0], ['theft', 20], ['badLuck', 0], ['defectiveStock', 0],
  ] as const)('rolls %s on the foreground clock with a bounded cost', (kind, cost) => {
    const state = due(kind);
    const warned = advanceKioskTime(state, 1);
    expect(warned.incidents.current).toEqual({ kind, phase: 'warning', cost: 0, remainingMs: INCIDENTS.warningMs });
    expect(warned.money).toBe(100);
    const next = advanceKioskTime(warned, INCIDENTS.warningMs);
    expect(next.incidents.current).toEqual({ kind, phase: 'active', cost, remainingMs: INCIDENTS.durationMs[kind] });
    expect(next.money).toBe(100 - cost);
    expect(next.rngState).toBe(state.rngState);
    expect(warned.incidents.nextInMs).toBeGreaterThanOrEqual(INCIDENTS.intervalMs[0]);
    expect(warned.incidents.nextInMs).toBeLessThanOrEqual(INCIDENTS.intervalMs[1]);
    const expired = advanceKioskTime(next, INCIDENTS.durationMs[kind]);
    expect(expired.incidents.current).toBeNull();
    expect(expired.money).toBe(next.money);
  });

  it('reserves the highest unlocked ticket and never creates debt', () => {
    const state = { ...due('theft', 12_050), licenses: ['ngoc' as const] };
    const next = resolve(state);
    expect(next.incidents.current?.cost).toBe(50);
    expect(next.money).toBe(ticketDef('ngoc').price);
    expect(next.rentDebt).toBe(0);
    expect(resolve(due('theft', 3)).money).toBe(3);
  });

  it('draws the next incident independently of its scheduled delay, including after reload', () => {
    const state = due('theft', 100);
    const rng = new Rng(state.incidents.rngState);
    rng.pick(INCIDENT_KINDS);
    const [min, max] = INCIDENTS.intervalMs;
    const delay = min + rng.int(max - min + 1);
    const savedRng = rng.state;
    const nextKind = rng.pick(INCIDENT_KINDS.filter(kind => kind !== 'badLuck'));

    const warning = advanceKioskTime(state, 1);
    expect(warning.incidents.nextInMs).toBe(delay);
    const loaded = migrate(JSON.parse(serialize(warning)))!;
    expect(loaded.incidents.rngState).toBe(savedRng);
    expect(advanceKioskTime(loaded, delay).incidents.current?.kind).toBe(nextKind);
  });

  it('only fines a fake on the desk and gives the player time to return it', () => {
    const state = due('inspection', 1000);
    const ticket = buyTicket(state, 'dong').ticket!;
    const warned = advanceKioskTime({ ...state, ticket: { ...ticket, fakeTell: 'missing-seal' } }, 1);
    expect(advanceKioskTime(warned, INCIDENTS.warningMs).money).toBe(850);
    const returned = returnTicket(warned);
    expect(advanceKioskTime(returned, INCIDENTS.warningMs).money).toBe(returned.money);
  });

  it('pauses a loaded robot exactly for the outage and leaves the desk usable', () => {
    const state = due('powerCut', 100, 500);
    state.automation.robots.push({ charge: 5, charging: false, tray: null, progressMs: 0 });
    const loaded = loadRobot(state, 0);
    const warned = advanceKioskTime(loaded, 1000);
    expect(warned.automation.robots[0]?.progressMs).toBe(1000);
    const blocked = advanceKioskTime(warned, warned.incidents.current!.remainingMs);
    expect(blocked.automation.robots[0]?.tray).toBeNull();
    const during = loadRobot(blocked, 0);
    expect(buyTicket(blocked, 'dong').ticket).not.toBeNull();
    expect(advanceKioskTime(during, 10_000).automation.robots[0]).toEqual(during.automation.robots[0]);
    const resumed = advanceKioskTime(during, INCIDENTS.durationMs.powerCut);
    expect(advanceKioskTime(resumed, 500).automation.robots[0]?.progressMs).toBe(500);
    expect(resumed.incidents.current).toBeNull();
    expect(resumed.licenseElapsedMs).toBe(70_500);
  });

  it('changes odds only when buying new non-promo tickets at the kiosk', () => {
    const waiting = due('badLuck', 100, 1, false);
    expect(resolve(waiting).incidents.current?.kind).not.toBe('badLuck');
    const win = Array.from({ length: 100 }, (_, rngState) => buyTicket({ ...waiting, rngState }, 'dong'))
      .find(s => (s.ticket?.gross ?? 0) >= 50)!;
    const active = resolve(collectTicket(revealTicket(win)));
    expect(active.incidents.current?.kind).toBe('badLuck');
    const def = ticketDef('dong');
    const state = Array.from({ length: 1000 }, (_, rngState) => ({ ...active, rngState }))
      .find(s => buyTicket(s, 'dong').ticket?.tier === 0 && (buyTicket(s, 'dong', 'away').ticket?.tier ?? 0) > 0)!;
    expect(state).toBeDefined();
    const withBadLuck = buyTicket(state, 'dong').ticket!;
    expect(evaluateCells(def, withBadLuck.cells)).toBe(0);
    const placedBefore = buyTicket(due('badLuck'), 'dong');
    expect(resolve(placedBefore).ticket).toBe(placedBefore.ticket);
    const promo = { ...state, money: 0, promoReadyAt: 0 };
    const normal = { ...promo, incidents: { ...promo.incidents, current: null } };
    expect(claimPromo(promo, 1).ticket).toEqual(claimPromo(normal, 1).ticket);
    state.automation = { ...state.automation, autoBuy: true, robots: [{ charge: 5, charging: false, tray: null, progressMs: 0 }] };
    const away = advanceAutomation(state, 1, true);
    expect(away.automation.robots[0]?.tray).toEqual(buyTicket(state, 'dong', 'away').ticket);
    expect(away.incidents).toBe(state.incidents);
  });

  it('marks one new paid desk ticket as defective and refunds 80% before scratch only', () => {
    const active = resolve(due('defectiveStock'));
    const purchased = buyTicket(active, 'dong');
    const reloaded = migrate(JSON.parse(serialize(purchased)))!;
    expect(reloaded.ticket?.defective).toBe(true);
    expect(reloaded.incidents.current).toBeNull();
    expect(returnTicket(reloaded).money).toBe(98);
    expect(returnTicket(startScratch(reloaded)).ticket).not.toBeNull();
    expect(buyTicket(returnTicket(reloaded), 'dong').ticket?.defective).toBeUndefined();
  });

  it('preserves the clock and already-applied charge across reload, and migrates v6', () => {
    const warning = advanceKioskTime(due('theft'), 2000);
    expect(migrate(JSON.parse(serialize(warning)))?.incidents).toEqual(warning.incidents);
    const raw = resolve(due('theft'));
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
