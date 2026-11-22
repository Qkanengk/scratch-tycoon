import { describe, expect, it, vi } from 'vitest';
import { buyTicket, revealTicket } from '../game/economy';
import { createInitialState, type GameState } from '../game/state';
import { PromptChip, promptFor } from './Hud';
import { prestigeScenario } from './debugPrestige';

const fresh = (): GameState => createInitialState(1);

describe('PromptChip keyboard activation', () => {
  it.each(['Enter', ' '])('prevents native %j repeat clicks on the incense button', key => {
    for (const armed of [false, true]) {
      const prompt = promptFor(prestigeScenario('eligible'), 0, 'altar', 0, armed);
      const button = PromptChip({ prompt, onCommand: vi.fn() }).props.children.at(-1);
      expect(button.type).toBe('button');
      const event = { key, repeat: true, preventDefault: vi.fn() };
      button.props.onKeyDown(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      event.preventDefault.mockClear();
      button.props.onKeyDown({ ...event, repeat: false });
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });
  it('preserves keyboard repeat on other HUD actions', () => {
    const button = PromptChip({ prompt: promptFor(fresh(), 0, 'shop', 0), onCommand: vi.fn() }).props.children.at(-1);
    const event = { key: 'Enter', repeat: true, preventDefault: vi.fn() };
    button.props.onKeyDown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('promptFor', () => {
  it('offers two-step incense confirmation, blocks ineligible runs and handles tier V', () => {
    expect(promptFor(fresh(), 0, 'altar', 0).button).toMatchObject({ command: 'incense', disabled: true });
    const state = prestigeScenario('eligible');
    expect(promptFor(state, 0, 'altar', 0).button).toMatchObject({ command: 'incense', disabled: false });
    expect(promptFor(state, 0, 'altar', 0, true).message).toContain('6 giây');
    expect(promptFor(prestigeScenario('complete'), 0, 'altar', 0).button).toBeUndefined();
  });
  it('offers Vũ Trụ after prestige and shows the remaining active-play countdown', () => {
    const state = prestigeScenario('board');
    const prompt = promptFor(state, 0, 'board', 0);
    expect(prompt.message).toContain('0:40');
    expect(prompt.button?.disabled).toBe(true);
    expect(promptFor({ ...state, licenseElapsedMs: 20 * 60_000 }, 0, 'board', 0).button?.disabled).toBe(false);
  });
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
