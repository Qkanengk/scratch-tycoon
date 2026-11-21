import { ticketDef, TICKETS } from '../data/tickets';
import { canBuyTicket, canClaimPromo, isBroke, promoTicketDef } from '../game/economy';
import type { GameState } from '../game/state';
import { jackpotTier } from '../game/tickets';
import { unlockProgress } from '../game/unlocks';
import { t } from '../i18n';
import type { View } from '../render/Stage';
import { money } from './money';

export type Command = 'buy' | 'collect' | 'promo' | 'license';

interface Prompt {
  tone: 'idle' | 'win' | 'jackpot' | 'lose';
  message: string;
  button?: { label: string; command: Command; disabled?: boolean };
  progress?: number;
}

/** What the game asks of the player right now, given what is on the desk and where they are looking. */
export function promptFor(state: GameState, now: number, view: View, progress: number): Prompt {
  const ticket = state.ticket;
  if (view === 'tools') return { tone: 'idle', message: t('tools.hint') };
  if (view === 'board') {
    const next = TICKETS.find((def) => !unlockProgress(state, def.id).unlocked);
    if (!next?.unlock) return { tone: 'idle', message: t('board.allDone') };
    return {
      tone: 'idle',
      message: t('board.for', { name: t(`ticket.${next.id}.name`) }),
      button: { label: t('shop.buyLicense', { cost: money(next.unlock.licenseCost) }), command: 'license', disabled: !unlockProgress(state, next.id).canBuyLicense },
    };
  }
  if (ticket?.revealed) {
    const amount = money(ticket.net);
    if (ticket.prize === 0) return { tone: 'lose', message: t('table.lose'), button: { label: t('table.discard'), command: 'collect' } };
    const jackpot = ticket.tier === jackpotTier(ticketDef(ticket.type));
    return { tone: jackpot ? 'jackpot' : 'win', message: t(jackpot ? 'table.jackpot' : 'table.win', { amount }), button: { label: t('table.collect', { amount }), command: 'collect' } };
  }
  if (ticket) {
    return { tone: 'idle', message: progress > 0 ? t('table.progress', { percent: Math.floor(progress * 100) }) : t('table.hint'), progress };
  }
  if (isBroke(state)) {
    const ready = canClaimPromo(state, now);
    const seconds = Math.max(1, Math.ceil(((state.promoReadyAt ?? now) - now) / 1000));
    return {
      tone: 'idle',
      message: ready ? t('table.promoReady', { name: t(`ticket.${promoTicketDef(state).id}.name`) }) : t('table.promoWait', { seconds }),
      button: { label: t('table.promoClaim'), command: 'promo', disabled: !ready },
    };
  }
  const def = ticketDef(state.selected);
  const name = t(`ticket.${def.id}.name`);
  const affordable = canBuyTicket(state, def.id);
  return {
    tone: 'idle',
    message: affordable ? t('hud.pick') : t('table.notEnough', { name }),
    button: { label: t('table.buy', { name, price: money(def.price) }), command: 'buy', disabled: !affordable },
  };
}

export function PromptChip({ prompt, onCommand }: { prompt: Prompt; onCommand: (command: Command) => void }) {
  const button = prompt.button;
  return (
    <div className={`prompt prompt-${prompt.tone}`}>
      <p className="prompt-message" role="status" data-testid="status">
        {prompt.message}
      </p>
      {prompt.progress !== undefined && (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.round(prompt.progress * 100)}%` }} />
        </div>
      )}
      {button && (
        <button className="btn btn-primary" data-testid="action" disabled={button.disabled} onClick={() => onCommand(button.command)}>
          {button.label}
          <kbd>Space</kbd>
        </button>
      )}
    </div>
  );
}

const ARROWS = { up: 'M5 15 L12 8 L19 15', down: 'M5 9 L12 16 L19 9', left: 'M15 5 L8 12 L15 19', right: 'M9 5 L16 12 L9 19' };

export function LookButton({ direction, label, testid, onClick }: { direction: keyof typeof ARROWS; label: string; testid: string; onClick: () => void }) {
  return (
    <button className={`look look-${direction}`} data-testid={testid} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={ARROWS[direction]} />
      </svg>
      {label}
    </button>
  );
}
