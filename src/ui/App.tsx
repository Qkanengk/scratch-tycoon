import { useEffect, useRef, useState } from 'react';
import { isMuted, play, setMuted } from '../audio/sfx';
import { ticketDef, TICKET_IDS, TICKETS, type TicketId } from '../data/tickets';
import { ACHIEVEMENT_BONUS_PERCENT, ALL_STAMPS, COLLECTION_BONUS_PERCENT } from '../data/journal';
import { applyToolIntent, repairPrice, repairTool, type ToolIntent } from '../game/tools';
import { shelfOffer } from '../render/toolShelf';
import { buyTicket, canBuyTicket, claimPromo, collectTicket, isUnlocked, returnTicket, selectTicket, startScratch, uncoverCell } from '../game/economy';
import { rushRestock } from '../game/stock';
import { advanceKioskTime } from '../game/kioskTime';
import { buyLicense, unlockProgress } from '../game/unlocks';
import { recordReveal, recordScratch } from '../game/save';
import { ticketContentKey } from '../game/scratch';
import { t } from '../i18n';
import type { Stage, StageCallbacks, View } from '../render/Stage';
import { ContractNotice, GoldenNotice, IncidentNotice, LookButton, PromptChip, promptFor, type Command } from './Hud';
import { acceptContract, declineContract } from '../game/contracts';
import { Icon, Sticker } from './Icon';
import { money } from './money';
import { SavePanel } from './SavePanel';
import { StageView } from './StageView';
import { useGame } from './useGame';
import { automationAction, robotContext, type AutomationAction } from '../game/automation';
import { prestige } from '../game/prestige';
import { blockRepeatedOffering, offerIncense } from './altarRitual';
import { achievementCount } from '../game/journal';
import { Journal } from './Journal';
import { BULK_LOTS, type UpgradeId } from '../data/upgrades';
import { buyUpgrade, setBulkLot, upgradePrice } from '../game/upgrades';

export function App() {
  const game = useGame();
  const { state, now, apply } = game;
  const stage = useRef<Stage | null>(null);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<View>('shop');
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId>('luck');
  const [contractSelected, setContractSelected] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const earned = achievementCount(state.journal, state.prestige.tier);
  const previousAwards = useRef({ earned, stamps: state.journal.stamps, contracts: state.contracts.resolved, tier: state.prestige.tier });
  useEffect(() => {
    const before = previousAwards.current;
    const messages: string[] = [];
    if (state.prestige.tier > before.tier) messages.push(t('altar.toast'));
    if (state.contracts.resolved !== before.contracts && state.contracts.result) {
      const result = state.contracts.result;
      messages.push(t(result.success ? 'contract.success' : 'contract.failure', { amount: money(result.amount) }));
    }
    if (earned > before.earned) messages.push(t('journal.newAchievement', { bonus: (earned - before.earned) * ACHIEVEMENT_BONUS_PERCENT }));
    for (const id of TICKET_IDS) {
      const mask = state.journal.stamps[id];
      if ((mask & ~before.stamps[id]) === 0) continue;
      const name = t(`ticket.${id}.name`);
      messages.push(mask === ALL_STAMPS ? t('journal.newSet', { name, bonus: COLLECTION_BONUS_PERCENT }) : t('journal.newStamp', { name }));
    }
    if (messages.length > 0) setToast(messages.join(' · '));
    previousAwards.current = { earned, stamps: state.journal.stamps, contracts: state.contracts.resolved, tier: state.prestige.tier };
  }, [earned, state.journal.stamps, state.contracts.resolved, state.contracts.result, state.prestige.tier]);
  const [armedUntil, setArmedUntil] = useState(0);
  const incenseDeadline = useRef(0);
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

  const disarmAltar = () => {
    incenseDeadline.current = 0;
    setArmedUntil(0);
    stage.current?.setAltarArmed(false);
  };

  useEffect(() => {
    if (!armedUntil) return;
    const timer = setTimeout(disarmAltar, Math.max(0, armedUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [armedUntil]);

  const incense = () => {
    const result = offerIncense(state, incenseDeadline.current, Date.now());
    incenseDeadline.current = result.armedUntil;
    setArmedUntil(result.armedUntil);
    stage.current?.setAltarArmed(result.armedUntil > 0);
    if (result.confirm) {
      apply(current => prestige(current));
    } else play(result.armedUntil ? 'ui-select' : 'ui-error');
  };

  const collect = () => {
    play(state.ticket && state.ticket.prize > 0 ? 'coin-2' : 'ui-click');
    apply(current => collectTicket(current));
  };

  const buy = (id: TicketId) => {
    const name = t(`ticket.${id}.name`);
    if (state.ticket && !state.ticket.revealed && !canBuyTicket(state, id)) {
      refuse(t('hud.tableBusy'));
      stage.current?.look('desk');
    } else if (!isUnlocked(state, id)) {
      refuse(t('hud.lockedTicket', { name }));
      stage.current?.look('board');
    } else if (state.stock[id].remaining === 0) {
      apply(s => selectTicket(collectTicket(s), id));
      stage.current?.look('desk');
    } else if (!canBuyTicket(collectTicket(state), id)) {
      refuse(t('table.notEnough', { name }));
    } else {
      play('ticket-buy');
      // A scratched ticket still on the mat is cashed in on the way.
      apply((s) => buyTicket(selectTicket(collectTicket(s), id), id));
    }
  };

  const license = () => {
    const next = TICKETS.find((def) => { const progress = unlockProgress(state, def.id); return progress.available && !progress.unlocked; });
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
    if (command === 'upgrade') upgrade(selectedUpgrade);
    else if (command === 'lot') cycleLot();
    else if (command === 'incense') incense();
    else if (command === 'journal') setJournalOpen(true);
    else if (command === 'acceptContract' || command === 'declineContract') {
      apply(command === 'acceptContract' ? acceptContract : declineContract);
      setContractSelected(false);
    }
    else if (command === 'restock') apply(s => rushRestock(s, s.selected));
    else if (command === 'awayReceipt') stage.current?.look('robots');
    else if (command === 'robot') automate('context', 0);
    else if (command === 'buy') buy(state.selected);
    else if (command === 'collect') collect();
    else if (command === 'return') { play('ticket-collect'); apply(returnTicket); }
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
  const cycleLot = () => apply(current => {
    const lots = BULK_LOTS.slice(0, current.upgrades.bulk + 1);
    return setBulkLot(current, lots[(lots.indexOf(current.bulkLot) + 1) % lots.length]!);
  });
  const upgrade = (id: UpgradeId) => {
    setSelectedUpgrade(id);
    if (state.money < upgradePrice(state, id)) { play('ui-error'); return; }
    play('unlock');
    apply(current => buyUpgrade(current, id));
  };
  const prompt = promptFor(state, now, view, progress, armedUntil > now, contractSelected, selectedUpgrade);
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    handlers.current = {
      onUpgrade: upgrade,
      onLot: cycleLot,
      onAltar: incense,
      onAutomation: automate,
      onPlayTime: elapsed => apply((current, time) => {
        const next = advanceKioskTime(current, elapsed);
        return { ...next, automation: { ...next.automation, lastSeenAt: time } };
      }),
      onReturn: () => run('return'),
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
      onBoard: () => { setContractSelected(false); license(); },
      onContract: () => setContractSelected(true),
      onJournal: () => setJournalOpen(true),
      onTool: tool,
      onView: (next) => { if (next !== 'altar') disarmAltar(); if (next !== 'board') setContractSelected(false); setView(next); },
    };
    keys.current = (event) => {
      if (journalOpen) return;
      if (event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') setPaused((open) => !open);
      if (paused) return;
      if (key === ' ' || key === 'enter') {
        if (view === 'altar' && blockRepeatedOffering(event)) return;
        // A focused button keeps its own Space and Enter.
        if (event.target instanceof Element && event.target.closest('button, a, input, select')) return;
        event.preventDefault();
        if (prompt.button && !prompt.button.disabled) run(prompt.button.command);
      } else if (key === 'b' && view === 'shop') cycleLot();
      else if (key === 'arrowup' || key === 'w') stage.current?.nod('up');
      else if (key === 'arrowdown' || key === 's') stage.current?.nod('down');
      else if (key === 'arrowright' || key === 'd') { const next = stage.current?.sideView('right'); if (next) stage.current?.look(next); }
      else if (key === 'arrowleft' || key === 'a') { const next = stage.current?.sideView('left'); if (next) stage.current?.look(next); }
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
      <StageView state={state} handlers={handlers} stage={stage} paused={paused || journalOpen} />

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

      <div className="kiosk-notices">
        <GoldenNotice event={state.goldenHour} />
        <IncidentNotice incident={state.incidents.current} />
        <ContractNotice state={state} />
      </div>

      {toast && (
        <p className="toast" role="status" data-testid="toast">
          {toast}
        </p>
      )}

      {view === 'desk' && <LookButton direction="up" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'desk' && <LookButton direction="right" testid="look-robots" label={t('robot.title')} onClick={() => stage.current?.look('robots')} />}
      {view === 'shop' && <LookButton direction="right" testid="look-board" label={t('look.board')} onClick={() => stage.current?.look('board')} />}
      {view === 'shop' && <LookButton direction="left" testid="look-altar" label={t('altar.nav')} onClick={() => stage.current?.look('altar')} />}
      {view === 'altar' && <LookButton direction="left" testid="look-tools" label={t('look.tools')} onClick={() => stage.current?.look('tools')} />}
      {view === 'altar' && <LookButton direction="right" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'tools' && <LookButton direction="right" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'tools' && <LookButton direction="left" testid="look-upgrades" label={t('upgrade.nav')} onClick={() => stage.current?.look('upgrades')} />}
      {view === 'upgrades' && <LookButton direction="right" testid="look-tools" label={t('look.tools')} onClick={() => stage.current?.look('tools')} />}
      {view === 'board' && <LookButton direction="left" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'board' && <LookButton direction="right" testid="look-robots" label={t('robot.title')} onClick={() => stage.current?.look('robots')} />}
      {view === 'robots' && <LookButton direction="left" testid="look-shop" label={t('look.shop')} onClick={() => stage.current?.look('shop')} />}
      {view === 'shop' && <LookButton direction="down" testid="look-desk" label={t('look.desk')} onClick={() => stage.current?.look('desk')} />}

      <PromptChip prompt={prompt} onCommand={run} />
      <span hidden data-testid="selected">
        {selected.id}
      </span>

      {paused && <SavePanel game={game} onClose={() => setPaused(false)} />}
      {journalOpen && <Journal state={state} onClose={() => setJournalOpen(false)} />}
    </div>
  );
}
