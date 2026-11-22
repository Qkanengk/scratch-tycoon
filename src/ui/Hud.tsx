import type { Incident } from '../game/incidents';
import { ticketDef, TICKETS } from '../data/tickets';
import { canBuyTicket, canClaimPromo, isBroke, promoTicketDef, ticketRefund } from '../game/economy';
import { formatMoney } from '../game/format';
import type { GameState } from '../game/state';
import { jackpotTier } from '../game/tickets';
import { unlockProgress } from '../game/unlocks';
import { t } from '../i18n';
import type { View } from '../render/Stage';
import { money } from './money';
import { automationPrice, robotContext } from '../game/automation';
import { awaySummaryText } from './awaySummary';
import { canPrestige } from '../game/prestige';
import { PRESTIGE } from '../data/prestige';
import { licenseWait } from '../render/board';
import { blockRepeatedOffering } from './altarRitual';
import { Icon } from './Icon';
import { STOCK } from '../data/balance';
import { restockCountdown } from '../game/stock';

export type Command = 'restock' | 'buy' | 'collect' | 'return' | 'promo' | 'license' | 'robot' | 'awayReceipt' | 'incense';

interface Prompt {
  tone: 'idle' | 'win' | 'jackpot' | 'lose';
  message: string;
  button?: { label: string; command: Command; disabled?: boolean };
  progress?: number;
  wrap?: boolean;
}

/** What the game asks of the player right now, given what is on the desk and where they are looking. */
export function promptFor(state: GameState, now: number, view: View, progress: number, armed = false): Prompt {
  const ticket = state.ticket;
  if (view === 'altar') {
    if (state.prestige.tier >= PRESTIGE.maxTier) return { tone: 'win', message: t('prestige.max') };
    const eligible = canPrestige(state);
    return { tone: eligible ? 'win' : 'idle', wrap: true,
      message: t(eligible ? armed ? 'altar.confirmPrompt' : 'altar.light' : 'altar.hint'),
      button: { label: t(armed && eligible ? 'altar.confirmButton' : 'altar.offer'), command: 'incense', disabled: !eligible } };
  }
  if (state.automation.awaySummary) return { tone: 'win', wrap: true, message: awaySummaryText(state.automation.awaySummary).prompt,
    button: view === 'robots' ? undefined : { label: t('robot.awayView'), command: 'awayReceipt' } };
  if (view === 'robots') {
    const action = robotContext(state);
    const busy = !!state.automation.robots[0]?.tray && action !== 'recharge';
    return { tone: 'idle', wrap: true, message: state.rentDebt ? t('robot.debtHint') : t('robot.hint', { tickets: state.automation.report.tickets, net: money(state.automation.report.net) }),
      button: busy || state.rentDebt > 0 ? undefined : { label: `${t(`robot.${action}`, { level: state.automation.robots.length })} · ${money(automationPrice(state, action))}`, command: 'robot', disabled: state.money < automationPrice(state, action) } };
  }
  if (view === 'tools') return { tone: 'idle', message: t('tools.hint') };
  if (view === 'board') {
    const next = TICKETS.find((def) => { const progress = unlockProgress(state, def.id); return progress.available && !progress.unlocked; });
    if (!next?.unlock) return { tone: 'idle', message: t('board.allDone') };
    return {
      tone: 'idle',
      message: licenseWait(state, next.id) ?? t('board.for', { name: t(`ticket.${next.id}.name`) }),
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
    const refund = ticket.defective ? ticketRefund(ticket) : 0;
    if (refund > 0) return { tone: 'idle', wrap: true, message: t('incident.defectiveStock.ticket'),
      button: { label: t('drain.return', { cost: formatMoney(refund) }), command: 'return' } };
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
  if (state.stock[def.id].remaining === 0) return {
    tone: 'idle', wrap: true,
    message: t('stock.wait', { name, time: restockCountdown(state.stock[def.id].remainingMs) }),
    button: { label: t('stock.rush', { fee: money(STOCK[def.id].rushFee) }), command: 'restock', disabled: state.money < STOCK[def.id].rushFee },
  };
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
    <div className={`prompt prompt-${prompt.tone}${prompt.wrap ? ' prompt-wrap' : ''}`}>
      <p className="prompt-message" role="status" data-testid="status">
        {prompt.message}
      </p>
      {prompt.progress !== undefined && (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.round(prompt.progress * 100)}%` }} />
        </div>
      )}
      {button && (
        <button className="btn btn-primary" data-testid="action" disabled={button.disabled} onKeyDown={event => { if (button.command === 'incense') blockRepeatedOffering(event); }} onClick={() => onCommand(button.command)}>
          {button.label}
          <kbd>Space</kbd>
        </button>
      )}
    </div>
  );
}

export function IncidentNotice({ incident }: { incident: Incident | null }) {
  const warning = incident?.phase === 'warning';
  const timed = warning || incident?.kind === 'powerCut' || incident?.kind === 'badLuck' || incident?.kind === 'defectiveStock';
  return (
    <div className="incident-notice" data-incident={incident?.kind} data-phase={incident?.phase}>
      <p role="status">
        {incident && <>
          <strong>
            {t(warning ? 'incident.warning' : 'incident.title', { name: t(`incident.${incident.kind}`) })}
            {incident.cost > 0 && <> · {t('incident.loss', { cost: money(incident.cost) })}</>}
            {!timed && incident.cost === 0 && <> · {t('incident.noLoss')}</>}
          </strong>
          <span>{t(`incident.${incident.kind}.${warning ? 'warning' : 'detail'}`)}</span>
        </>}
      </p>
      {timed && <span className="incident-time" role="timer">{t('incident.seconds', { seconds: Math.ceil(incident.remainingMs / 1000) })}</span>}
    </div>
  );
}

export function LookButton({ direction, label, testid, onClick }: { direction: 'up' | 'down' | 'left' | 'right'; label: string; testid: string; onClick: () => void }) {
  return (
    <button className={`look look-${direction}`} data-testid={testid} onClick={onClick}>
      <Icon name={`arrow-${direction}`} />
      {label}
    </button>
  );
}
