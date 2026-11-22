import { useEffect, useRef, useState } from 'react';
import { isMuted, play, setMuted } from '../audio/sfx';
import { ticketDef, TICKETS, type TicketId } from '../data/tickets';
import { applyToolIntent, repairPrice, repairTool, type ToolIntent } from '../game/tools';
import { shelfOffer } from '../render/toolShelf';
import { advancePlayTime, buyTicket, canBuyTicket, claimPromo, collectTicket, isUnlocked, returnFake, selectTicket, startScratch, uncoverCell } from '../game/economy';
import { buyLicense, unlockProgress } from '../game/unlocks';
import { recordReveal, recordScratch } from '../game/save';
import { ticketContentKey } from '../game/scratch';
import { t } from '../i18n';
import type { Stage, StageCallbacks, View } from '../render/Stage';
import { LookButton, PromptChip, promptFor, type Command } from './Hud';
import { Icon, Sticker } from './Icon';
import { money } from './money';
import { SavePanel } from './SavePanel';
import { StageView } from './StageView';
import { useGame } from './useGame';
import { advanceAutomation, automationAction, robotContext, type AutomationAction } from '../game/automation';

export function App() {
  const game = useGame();
  const { state, now, apply } = game;
  const stage = useRef<Stage | null>(null);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<View>('shop');
  const [muted, setMutedState] = useState(isMuted);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(() => game.saveFailed ? t('save.failed') : game.recovered ? t('save.recovered') : null);
  const previousSaveFailed = useRef(game.saveFailed);

  useEffect(() => {
    if (game.saveFailed && !previousSaveFailed.current) setToast(t('save.failed'));
    else if (!game.saveFailed && previousSaveFailed.current) setToast((current) => current === t('save.failed') ? null : current);
    previousSaveFailed.current = game.saveFailed;
  }, [game.saveFailed]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const refuse = (message: string) => {
    play('ui-error');
    setToast(message);
  };

  const collect = () => {
    play(state.ticket && state.ticket.prize > 0 ? 'coin-2' : 'ui-click');
    apply(collectTicket);
  };

  const buy = (id: TicketId) => {
    const name = t(`ticket.${id}.name`);
    if (state.ticket && !state.ticket.revealed) {
      refuse(t('hud.tableBusy'));
      stage.current?.look('desk');
    } else if (!isUnlocked(state, id)) {
      refuse(t('hud.lockedTicket', { name }));
      stage.current?.look('board');
    } else if (!canBuyTicket(collectTicket(state), id)) {
      refuse(t('table.notEnough', { name }));
    } else {
      play('ticket-buy');
      // A scratched ticket still on the mat is cashed in on the way.
      apply((s) => buyTicket(selectTicket(collectTicket(s), id), id));
    }
  };

  const license = () => {
    const next = TICKETS.filter(def => !def.minimumPrestige).find((def) => !unlockProgress(state, def.id).unlocked);
    if (!next) return;
    if (!unlockProgress(state, next.id).canBuyLicense) {
      play('ui-error');
      return;
    }
    play('unlock');
    apply((s) => selectTicket(buyLicense(s, next.id), next.id));
    setToast(t('shop.unlockedToast', { name: t(`ticket.${next.id}.name`) }));
    stage.current?.look('shop');
  };

  const run = (command: Command) => {
    if (command === 'awayReceipt') stage.current?.look('robots');
    else if (command === 'robot') automate('context', 0);
    else if (command === 'buy') buy(state.selected);
    else if (command === 'collect') collect();
    else if (command === 'license') license();
    else {
      play('promo');
      apply(claimPromo);
    }
  };

  const automate = (action: AutomationAction | 'context', index: number) => {
    play('ui-click');
    apply((current, time) => automationAction(current, action === 'context' ? robotContext(current, index) : action, index, time));
  };

  const tool = (intent: ToolIntent) => {
    const { id } = intent;
    const offer = shelfOffer(state, id);
    if (offer.kind === 'max') return;
    if (!offer.affordable) {
      play('ui-error');
      stage.current?.refuseTool(id);
      return;
    }
    play(offer.kind === 'upgrade' ? 'unlock' : offer.kind === 'buy' ? 'coin-2' : 'ui-select');
    apply(current => applyToolIntent(current, intent));
  };

  const handlers = useRef<StageCallbacks>(null as unknown as StageCallbacks);
  const prompt = promptFor(state, now, view, progress);
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    handlers.current = {
      onAutomation: automate,
      onPlayTime: elapsed => apply((current, time) => {
        const next = advanceAutomation(advancePlayTime(current, elapsed), elapsed);
        return { ...next, automation: { ...next.automation, lastSeenAt: time } };
      }),
      onReturn: () => { play('ticket-collect'); apply(returnFake); },
      onRepair: id => {
        if (state.money < repairPrice(state, id)) { play('ui-error'); stage.current?.refuseTool(id); return; }
        stage.current?.repairedTool(id);
        play('unlock');
        apply(current => repairTool(current, id));
      },
      onStartScratch: ticket => apply(current => current.ticket && ticketContentKey(current.ticket) === ticketContentKey(ticket) ? startScratch(current) : current),
      onBomb: (ticket, index) => apply(current => current.ticket && ticketContentKey(current.ticket) === ticketContentKey(ticket) ? uncoverCell(current, index) : current),
      onRevealed: (ticket) => apply((current) => recordReveal(current, ticket)),
      onProgress: (done) => setProgress(done),
      onScratch: (ticket, scratch) => apply((current) => recordScratch(current, ticket, scratch)),
      onTicket: buy,
      onCollect: collect,
      onBoard: license,
      onTool: tool,
      onView: (next) => setView(next),
    };
    keys.current = (event) => {
      if (event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') setPaused((open) => !open);
      if (paused) return;
      if (key === ' ' || key === 'enter') {
        // A focused button keeps its own Space and Enter.
        if (event.target instanceof Element && event.target.closest('button, a, input, select')) return;
        event.preventDefault();
        if (prompt.button && !prompt.button.disabled) run(prompt.button.command);
      } else if (key === 'arrowup' || key === 'w') stage.current?.nod('up');
      else if (key === 'arrowdown' || key === 's') stage.current?.nod('down');
      else if (key === 'arrowright' || key === 'd') stage.current?.look(view === 'tools' ? 'shop' : view === 'board' ? 'robots' : view === 'robots' ? 'shop' : 'board');
      else if (key === 'arrowleft' || key === 'a') stage.current?.look(view === 'robots' ? 'board' : view === 'board' ? 'shop' : 'tools');
    };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleSound = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) play('ui-click');
  };

  const selected = ticketDef(state.selected);
  return (
    <div className="app" data-view={view}>
      <StageView state={state} handlers={handlers} stage={stage} paused={paused} />

      <dl className="purse">
        <Sticker name="coin-gold" />
        <dt>{t('wallet.money')}</dt>
        <dd data-testid="money">{money(state.money)}</dd>
        <dt className="purse-total">{t('wallet.totalEarned')}</dt>
        <dd className="purse-total">
          {t('wallet.totalEarned')} <span data-testid="total-earned">{money(state.totalEarned)}</span>
        </dd>
      </dl>

      <div className="corner">
        <button className="btn btn-round" onClick={toggleSound} aria-label={t(muted ? 'app.soundOn' : 'app.soundOff')} title={t(muted ? 'app.soundOn' : 'app.soundOff')} aria-pressed={muted}>
          <Icon name={muted ? 'audio-off' : 'audio-on'} />
        </button>
        <button className="btn btn-round" data-testid="open-save" onClick={() => setPaused(true)} aria-label={t('hud.pause')} title={t('hud.pause')}>
          <Icon name="pause" />
        </button>
      </div>

      {toast && (
        <p className="toast" role="status" data-testid="toast">
          {toast}
        </p>
      )}

      {view === 'desk' && <LookButton direction="up" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'desk' && <LookButton direction="right" testid="look-robots" label={t('robot.title')} onClick={() => stage.current?.look('robots')} />}
      {view === 'shop' && <LookButton direction="right" testid="look-board" label={t('look.board')} onClick={() => stage.current?.look('board')} />}
      {view === 'shop' && <LookButton direction="left" testid="look-tools" label={t('look.tools')} onClick={() => stage.current?.look('tools')} />}
      {view === 'tools' && <LookButton direction="right" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'board' && <LookButton direction="left" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'board' && <LookButton direction="right" testid="look-robots" label={t('robot.title')} onClick={() => stage.current?.look('robots')} />}
      {view === 'robots' && <LookButton direction="left" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'shop' && <LookButton direction="down" testid="look-desk" label={t('look.desk')} onClick={() => stage.current?.look('desk')} />}

      <PromptChip prompt={prompt} onCommand={run} />
      <span hidden data-testid="selected">
        {selected.id}
      </span>

      {paused && <SavePanel game={game} onClose={() => setPaused(false)} />}
    </div>
  );
}
