import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buyTicket, collectTicket, revealTicket } from '../game/economy';
import { createInitialState, type GameState } from '../game/state';
import { ContractNotice, IncidentNotice, PromptChip, promptFor } from './Hud';
import { prestigeScenario } from './debugPrestige';
import { STOCK } from '../data/balance';
import { acceptContract, contractOffer } from '../game/contracts';
import { automationAction } from '../game/automation';

const fresh = (): GameState => createInitialState(1);

describe('prepaid robot loading prompt', () => {
  it('enables loading at zero money only when a queued ticket is outside the open round', () => {
    const hired = automationAction({ ...fresh(), money: 1e8 }, 'robot');
    const held = buyTicket({ ...hired, upgrades: { luck: 0, desk: 2, bulk: 1 }, bulkLot: 5 }, 'dong');
    const state = { ...held, money: 0 };
    expect(promptFor(state, 0, 'robots', 0).button).toMatchObject({ command: 'robot', disabled: false });
    expect(promptFor(state, 0, 'robots', 0).button?.label).toContain('0 xu');
    for (const deskQueue of [[], state.deskQueue.slice(0, 2)]) {
      expect(promptFor({ ...state, deskQueue }, 0, 'robots', 0).button?.disabled).toBe(true);
    }
  });
});

describe('upgrade and bulk prompt chips', () => {
  it.each([0, 10, 100])('previews bulk buying after collecting a revealed round with %s xu left', money => {
    const held = revealTicket(buyTicket({ ...createInitialState(4), money: 1000, upgrades: { luck: 0, desk: 2, bulk: 1 }, bulkLot: 5 }, 'dong'));
    const state = { ...held, money };
    const collected = collectTicket(state);
    const bought = buyTicket(collected, state.selected);
    const count = collected.nextSerial < bought.nextSerial ? bought.nextSerial - collected.nextSerial : state.bulkLot;
    const prompt = promptFor(state, 0, 'shop', 0);
    expect(prompt.button?.label).toBe(`Mua Vé Đồng ×${count} · ${count * 10} xu`);
    expect(prompt.button?.disabled).toBe(false);
    expect(bought.money).toBe(collected.money - count * 10);
    expect(state.money).toBe(money);
    expect(state.ticket?.revealed).toBe(true);
  });
  it('keeps keyboard hints separate from touch labels', () => {
    const state = { ...fresh(), upgrades: { luck: 0, desk: 0, bulk: 1 }, bulkLot: 5 as const };
    const upgrade = promptFor(state, 0, 'upgrades', 0, false, false, 'desk');
    expect(upgrade.message).not.toContain('Space');
    expect(upgrade.keyHint).toBe('Space: Bàn rộng.');
    expect(renderToStaticMarkup(PromptChip({ prompt: upgrade, onCommand: vi.fn() }))).toContain('class="keyboard-hint"');
    const lot = promptFor(state, 0, 'shop', 0);
    expect(lot.secondary).toMatchObject({ label: 'Đổi lô · ×5', shortcut: 'B' });
    expect(renderToStaticMarkup(PromptChip({ prompt: lot, onCommand: vi.fn() }))).toContain('<kbd>B</kbd>');
  });
  it('offers an upgrade with price and effect and disables unaffordable or maxed offers', () => {
    const state = { ...fresh(), money: 1000 };
    expect(promptFor(state, 0, 'upgrades', 0).button).toMatchObject({ command: 'upgrade', disabled: false });
    expect(promptFor(fresh(), 0, 'upgrades', 0).button?.disabled).toBe(true);
    expect(promptFor({ ...state, upgrades: { luck: 50, desk: 0, bulk: 0 } }, 0, 'upgrades', 0).button).toMatchObject({ label: 'Đã tối đa', disabled: true });
  });
  it('keeps lot selection available at a busy rack and disables buying a full hold', () => {
    const state = buyTicket({ ...fresh(), money: 1000, upgrades: { luck: 0, desk: 0, bulk: 1 }, bulkLot: 1 }, 'dong');
    const prompt = promptFor(state, 0, 'shop', 0);
    expect(prompt.secondary?.command).toBe('lot');
    expect(prompt.button).toMatchObject({ command: 'buy', disabled: false });
    expect(promptFor({ ...state, deskQueue: Array(4).fill(state.ticket) }, 0, 'shop', 0).button?.disabled).toBe(true);
    expect(promptFor(state, 0, 'desk', 0).secondary).toBeUndefined();
    expect(promptFor(fresh(), 0, 'shop', 0).secondary).toBeUndefined();
  });
});

describe('round payout prompt', () => {
  it('shows the combined round payout even when only a follower wins', () => {
    const state = revealTicket(buyTicket(fresh(), 'dong'));
    const active = { ...state.ticket!, prize: 0, gross: 0, net: 0, tier: 0 };
    const follower = { ...state.ticket!, serial: 2, prize: 50, gross: 50, net: 50, tier: 3 };
    const prompt = promptFor({ ...state, upgrades: { luck: 0, desk: 1, bulk: 0 }, ticket: active, deskQueue: [follower] }, 0, 'desk', 1);
    expect(prompt.tone).toBe('win');
    expect(prompt.button?.command).toBe('collect');
    expect(prompt.button?.label).toContain('50');
  });
});

describe('contract HUD', () => {
  it('shows goal, duration, deposit, reward and decline only for the selected board note', () => {
    const base = fresh();
    const state = { ...base, contracts: { ...base.contracts, offered: contractOffer('wins', 'dong') } };
    const prompt = promptFor(state, 0, 'board', 0, false, true);
    expect(prompt.message).toContain('×10');
    expect(prompt.message).toContain('10:00');
    expect(prompt.message).toContain('Cọc 10 xu');
    expect(prompt.message).toContain('Thưởng 30 xu');
    expect(prompt.button).toMatchObject({ command: 'acceptContract', disabled: false });
    expect(prompt.secondary?.command).toBe('declineContract');
    expect(promptFor({ ...state, money: 19 }, 0, 'board', 0, false, true).button?.disabled).toBe(true);
    expect(promptFor(state, 0, 'desk', 0, false, true).button?.command).not.toBe('acceptContract');
    expect(promptFor(state, 0, 'board', 0).button?.command).toBe('license');
  });
  it('renders only a compact progress strip while active', () => {
    const base = fresh();
    expect(ContractNotice({ state: base })).toBeNull();
    const state = acceptContract({ ...base, contracts: { ...base.contracts, offered: contractOffer('wins', 'dong') } });
    state.contracts.active!.progress = 2;
    const markup = renderToStaticMarkup(ContractNotice({ state }));
    expect(markup).toContain('2/3');
    expect(markup).toContain('10:00');
    expect(markup).toContain('role="timer"');
    expect(markup).not.toContain('<button');
  });
});

describe('stock prompt', () => {
  it('offers rush restock with a countdown and checks its fee', () => {
    const state = { ...fresh(), money: STOCK.dong.rushFee };
    state.stock.dong = { remaining: 0, remainingMs: 61_000 };
    const prompt = promptFor(state, 0, 'desk', 0);
    expect(prompt.message).toContain('1:01');
    expect(prompt.message).toContain('hết hàng');
    expect(prompt.button).toMatchObject({ command: 'restock', disabled: false });
    expect(prompt.button?.label).toContain('Nhập gấp');
    expect(promptFor({ ...state, money: STOCK.dong.rushFee - 1 }, 0, 'desk', 0).button?.disabled).toBe(true);
    expect(promptFor({ ...state, money: 0 }, 0, 'desk', 0).button?.command).toBe('promo');
    expect(promptFor(fresh(), 0, 'desk', 0).button?.command).toBe('buy');
  });
});

describe('IncidentNotice', () => {
  it.each([
    ['inspection', 'Thanh tra'], ['powerCut', 'Mất điện'], ['theft', 'Trộm'],
    ['badLuck', 'Vận xui'], ['defectiveStock', 'Hàng lỗi'],
  ] as const)('shows the Vietnamese name for %s', (kind, name) => {
    const text = renderToStaticMarkup(IncidentNotice({ incident: { kind, phase: 'active', cost: 0, remainingMs: 1100 } }));
    expect(text).toContain(name);
    expect(text).toContain('role="status"');
    if (kind === 'badLuck' || kind === 'powerCut' || kind === 'defectiveStock') expect(text).toContain('role="timer">2 giây');
    else expect(text).toContain('Không mất xu');
  });

  it('shows the paid amount rather than a countdown for a fee', () => {
    const text = renderToStaticMarkup(IncidentNotice({ incident: { kind: 'inspection', phase: 'active', cost: 10, remainingMs: 1100 } }));
    expect(text).toContain('−10 xu');
    expect(text).not.toContain('role="timer"');
  });

  it('shows a warning countdown before applying the incident', () => {
    const text = renderToStaticMarkup(IncidentNotice({ incident: { kind: 'inspection', phase: 'warning', cost: 0, remainingMs: 10_000 } }));
    expect(text).toContain('Sắp có: Thanh tra');
    expect(text).toContain('Dọn vé giả');
    expect(text).toContain('role="timer">10 giây');
  });
});

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

  it('formats the defective ticket refund with a single currency unit', () => {
    const state = buyTicket(fresh(), 'dong');
    const prompt = promptFor({ ...state, ticket: { ...state.ticket!, defective: true } }, 0, 'desk', 0);
    expect(prompt.button).toEqual({ label: 'Trả tại quầy · nhận 8 xu', command: 'return' });
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
