import { describe, expect, it } from 'vitest';
import { CONTRACTS } from '../data/balance';
import { prestigeThreshold } from '../data/prestige';
import { TICKET_IDS } from '../data/tickets';
import { advanceAutomation, automationAction, loadRobot, settleAway } from './automation';
import { acceptContract, advanceContracts, canAcceptContract, contractOffer, declineContract, initialContracts, type ContractKind } from './contracts';
import { buyTicket, collectTicket, revealTicket } from './economy';
import { advanceKioskTime } from './kioskTime';
import { prestige } from './prestige';
import { deserialize, migrate, serialize } from './save';
import { createInitialState, SAVE_VERSION, type GameState } from './state';

function offered(kind: ContractKind = 'scratch'): GameState {
  const state = createInitialState(4);
  return { ...state, money: 1e8, contracts: { ...state.contracts, offered: contractOffer(kind, 'dong') } };
}
function active(kind: ContractKind = 'scratch'): GameState { return acceptContract(offered(kind)); }
function collect(state: GameState, options: { gross?: number; fake?: boolean; free?: boolean; type?: 'dong' | 'bac'; away?: boolean } = {}): GameState {
  const bought = revealTicket(buyTicket(state, 'dong'));
  const ticket = { ...bought.ticket!, type: options.type ?? 'dong', gross: options.gross ?? 0, net: options.gross ?? 0,
    fakeTell: options.fake ? 'missing-seal' as const : null, free: options.free ?? false };
  return collectTicket({ ...bought, ticket }, options.away);
}

describe('contract lifecycle', () => {
  it('offers deterministically after 3–5 minutes and scales to the highest unlocked type', () => {
    const state = createInitialState(4);
    expect(state.contracts.nextInMs).toBeGreaterThanOrEqual(180_000);
    expect(state.contracts.nextInMs).toBeLessThanOrEqual(300_000);
    const ready = advanceKioskTime(state, state.contracts.nextInMs);
    expect(ready.contracts.offered?.ticket).toBe('dong');
    expect(ready.rngState).toBe(state.rngState);
    expect(advanceKioskTime(state, state.contracts.nextInMs)).toEqual(ready);
    const rich = { ...state, prestige: { tier: 1, runEarned: 0 }, licenses: [...TICKET_IDS] };
    const high = advanceContracts(rich, state.contracts.nextInMs);
    expect(high.contracts.offered?.ticket).toBe('vutru');
    expect(high.contracts.offered?.deposit).toBe(2_000_000 * CONTRACTS.depositTickets);
    expect(advanceContracts(high, 1e8).contracts.offered).toEqual(high.contracts.offered);
  });

  it('requires deposit plus one-ticket reserve and escrows exactly once', () => {
    const state = offered();
    const poor = { ...state, money: state.contracts.offered!.deposit + 9 };
    expect(canAcceptContract(poor)).toBe(false);
    expect(acceptContract(poor)).toBe(poor);
    const accepted = acceptContract({ ...poor, money: poor.money + 1 });
    expect(accepted.money).toBe(10);
    expect(accepted.contracts.offered).toBeNull();
    expect(accepted.contracts.active?.progress).toBe(0);
    expect(acceptContract(accepted)).toBe(accepted);
    expect(acceptContract(createInitialState(4)).contracts.active).toBeNull();
  });

  it('declines for free and waits a fresh cooldown before the next offer', () => {
    const state = offered();
    const declined = declineContract(state);
    expect(declined.money).toBe(state.money);
    expect(declined.contracts.offered).toBeNull();
    const waiting = advanceContracts(declined, declined.contracts.nextInMs - 1);
    expect(waiting.contracts.offered).toBeNull();
    expect(advanceContracts(waiting, 1).contracts.offered).not.toBeNull();
    expect(declineContract(active()).contracts.active).not.toBeNull();
  });

  it('counts collected scratches of the requested type, including free promos, not reveals or other types', () => {
    const state = active();
    expect(revealTicket(buyTicket(state, 'dong')).contracts.active?.progress).toBe(0);
    expect(collect(state, { free: true }).contracts.active?.progress).toBe(1);
    expect(collect(state, { type: 'bac' }).contracts.active?.progress).toBe(0);
    expect(collect(state, { away: true }).contracts.active?.progress).toBe(0);
  });

  it('requires real paid ×10 wins and excludes fake/free/wrong-type tickets', () => {
    const state = active('wins');
    expect(collect(state, { gross: 99 }).contracts.active?.progress).toBe(0);
    expect(collect(state, { gross: 100 }).contracts.active?.progress).toBe(1);
    for (const option of [{ fake: true }, { free: true }, { type: 'bac' as const }, { away: true }]) {
      expect(collect(state, { gross: 100, ...option }).contracts.active?.progress).toBe(0);
    }
  });

  it('counts paid after-tax earnings, never promo or away income', () => {
    const state = active('earn');
    expect(collect(state, { gross: 123 }).contracts.active?.progress).toBe(123);
    expect(collect(state, { gross: 123, free: true }).contracts.active?.progress).toBe(0);
    expect(collect(state, { gross: 123, away: true }).contracts.active?.progress).toBe(0);
  });

  it('returns deposit plus a larger reward once on success, without boosting prestige earnings', () => {
    let state = active();
    state = { ...state, contracts: { ...state.contracts, active: { ...state.contracts.active!, progress: state.contracts.active!.target - 1 } } };
    const bought = revealTicket(buyTicket(state, 'dong'));
    const before = bought.money;
    const goal = bought.contracts.active!;
    const done = collectTicket(bought);
    expect(done.money).toBe(before + bought.ticket!.net + goal.deposit + goal.reward);
    expect(goal.reward).toBeGreaterThan(goal.deposit);
    expect(done.prestige.runEarned).toBe(bought.ticket!.net);
    expect(done.contracts.active).toBeNull();
    expect(done.contracts.result).toEqual({ success: true, amount: goal.reward });
    expect(collectTicket(done)).toBe(done);
    expect(advanceContracts(done, done.contracts.nextInMs).contracts.offered).not.toBeNull();
  });

  it('forfeits escrow at the deadline, including a robot finishing exactly at that boundary', () => {
    const state = active();
    const failed = advanceContracts(state, state.contracts.active!.durationMs);
    expect(failed.money).toBe(state.money);
    expect(failed.contracts.active).toBeNull();
    expect(failed.contracts.result).toEqual({ success: false, amount: state.contracts.active!.deposit });
    let robot = loadRobot(automationAction(state, 'robot'), 0);
    robot = { ...robot, contracts: { ...robot.contracts, active: { ...robot.contracts.active!, remainingMs: 4000, progress: 79 } } };
    expect(advanceKioskTime(robot, 4000).contracts.result?.success).toBe(false);
  });

  it('counts robot collections while processing their actual active-time deadlines', () => {
    const state = loadRobot(automationAction(active(), 'robot'), 0);
    const done = advanceKioskTime(state, 4000);
    expect(done.contracts.active?.progress).toBe(1);
    expect(done.contracts.active?.remainingMs).toBe(CONTRACTS.goals.scratch.durationMs - 4000);
    const split = advanceKioskTime(advanceKioskTime(state, 2000), 2000);
    expect(split).toEqual(done);
  });

  it('keeps robot prize reports and revenue separate from contract payouts, like desk collections', () => {
    let state = loadRobot(automationAction(active(), 'robot'), 0);
    state = { ...state, contracts: { ...state.contracts, active: { ...state.contracts.active!, progress: 79 } } };
    const revealed = revealTicket({ ...state, ticket: state.automation.robots[0]!.tray });
    const ticket = revealed.ticket!;
    const desk = collectTicket(revealed);
    const done = advanceKioskTime(state, 4000);
    expect(done.contracts.result?.success).toBe(true);
    expect(done.money).toBe(desk.money);
    expect(done.totalEarned).toBe(state.totalEarned + ticket.net);
    expect(done.totalEarned).toBe(desk.totalEarned);
    expect(done.prestige.runEarned).toBe(state.prestige.runEarned + ticket.net);
    expect(done.prestige).toEqual(desk.prestige);
    expect(done.stats).toEqual(desk.stats);
    expect(done.automation.report.net).toBe(state.automation.report.net + ticket.net);
  });

  it('pauses deadlines and progress during away simulation, and clears contracts on prestige', () => {
    let state = automationAction(automationAction(automationAction(active(), 'robot'), 'autoBuy'), 'away', 0, 1000);
    state = loadRobot(state, 0);
    expect(settleAway(state, 601_000).contracts).toEqual(state.contracts);
    expect(advanceAutomation(state, 60_000, true).contracts).toEqual(state.contracts);
    const offeredState = offered();
    expect(settleAway(offeredState, 601_000).contracts).toEqual(offeredState.contracts);
    const reset = prestige({ ...state, licenses: ['rong'], prestige: { tier: 0, runEarned: prestigeThreshold(1) } });
    expect(reset.contracts).toEqual(initialContracts(state.rngState));
    expect(advanceContracts(state, NaN)).toBe(state);
  });
});

describe('contract saves', () => {
  it.each(['offer', 'active', 'result'])('round-trips %s state', phase => {
    const state = phase === 'offer' ? offered() : phase === 'active' ? collect(active()) : advanceContracts(active(), 1e6);
    expect(deserialize(serialize(state))?.contracts).toEqual(state.contracts);
  });
  it('migrates v8 with fresh contracts and preserves the rest of the save', () => {
    const state = createInitialState(9);
    const loaded = migrate({ ...state, version: 8, contracts: undefined })!;
    expect(loaded).toEqual(state);
    expect(loaded.version).toBe(SAVE_VERSION);
  });
  it('sanitizes invalid contracts and never trusts saved payouts or targets', () => {
    const state = active();
    const loaded = migrate({ ...state, contracts: { ...state.contracts, nextInMs: -10,
      offered: contractOffer('earn', 'vutru'),
      active: { ...state.contracts.active, deposit: 1e99, reward: 1e99, target: 1, progress: Infinity, remainingMs: -3 } } })!;
    expect(loaded.contracts.offered).toBeNull();
    expect(loaded.contracts.active).toEqual(state.contracts.active);
    expect(migrate({ ...state, contracts: { active: { kind: 'oops', ticket: 'dong' } } })?.contracts.active).toBeNull();
    expect(migrate({ ...state, contracts: null })?.contracts).toEqual(initialContracts(state.rngState));
  });
});
