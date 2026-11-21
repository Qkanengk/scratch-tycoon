import { describe, expect, it } from 'vitest';
import { buyTicket, revealTicket } from '../game/economy';
import { createInitialState, type GameState } from '../game/state';
import { promptFor } from './Hud';

const fresh = (): GameState => createInitialState(1);

describe('promptFor', () => {
  it('offers the net payout rather than the gross prize', () => {
    const state = revealTicket(buyTicket(fresh(), 'dong'));
    state.ticket = { ...state.ticket!, prize: 24000, gross: 24000, tax: 1680, net: 22320 };
    const prompt = promptFor(state, 0, 'desk', 1);
    expect(prompt.button?.label).toBe('Nhận 22.320 xu');
    expect(prompt.message).toContain('22.320');
  });
  it('keeps shelf hints contextual even with a ticket on the desk', () => {
    const prompt = promptFor(revealTicket(buyTicket(fresh(), 'dong')), 0, 'tools', 1);
    expect(prompt.button).toBeUndefined();
    expect(prompt.message).toContain('nâng cấp');
  });
  it('offers the selected ticket on an empty desk', () => {
    const prompt = promptFor(fresh(), 0, 'shop', 0);
    expect(prompt.button).toMatchObject({ command: 'buy', disabled: false });
  });

  it('shows scratch progress and no button while a ticket is being scratched', () => {
    const prompt = promptFor(buyTicket(fresh(), 'dong'), 0, 'desk', 0.5);
    expect(prompt.button).toBeUndefined();
    expect(prompt.progress).toBe(0.5);
  });

  it('offers to collect a scratched ticket', () => {
    const prompt = promptFor(revealTicket(buyTicket(fresh(), 'dong')), 0, 'desk', 1);
    expect(prompt.button?.command).toBe('collect');
  });

  it('offers the free ticket only once its countdown has run out', () => {
    const broke: GameState = { ...fresh(), money: 0, promoReadyAt: 1000 };
    expect(promptFor(broke, 500, 'desk', 0).button).toMatchObject({ command: 'promo', disabled: true });
    expect(promptFor(broke, 1000, 'desk', 0).button).toMatchObject({ command: 'promo', disabled: false });
    expect(promptFor({ ...broke, licenses: ['bac'] }, 1000, 'desk', 0).message).toContain('Vé Bạc');
  });

  it('offers the next licence at the board and disables it until the requirements are met', () => {
    expect(promptFor(fresh(), 0, 'board', 0).button).toMatchObject({ command: 'license', disabled: true });
    const state = fresh();
    const ready: GameState = {
      ...state,
      money: 200,
      totalEarned: 4_000,
      stats: { ...state.stats, dong: { scratched: 500, wins: 90, jackpots: 1, bigWins: 25 } },
    };
    expect(promptFor(ready, 0, 'board', 0).button).toMatchObject({ command: 'license', disabled: false });
    expect(promptFor({ ...ready, money: 199 }, 0, 'board', 0).button).toMatchObject({ command: 'license', disabled: true });
  });

  it('has nothing to sell at the board once every ticket is unlocked', () => {
    const all: GameState = { ...fresh(), licenses: ['bac', 'vang', 'ngoc', 'rong'] };
    expect(promptFor(all, 0, 'board', 0).button).toBeUndefined();
  });
});
