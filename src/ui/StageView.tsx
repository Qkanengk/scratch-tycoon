import { useEffect, useRef, type RefObject } from 'react';
import { t } from '../i18n';
import type { GameState } from '../game/state';
import { Stage, type StageCallbacks } from '../render/Stage';

interface Props {
  state: GameState;
  paused: boolean;
  /** Always the latest handlers; the stage calls through this so it is built only once. */
  handlers: RefObject<StageCallbacks>;
  stage: RefObject<Stage | null>;
}

/** The three.js kiosk. React owns the game state; the stage draws it and reports what the player does. */
export function StageView({ state, handlers, stage, paused }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const created = new Stage(host.current, {
      onUpgrade: id => handlers.current.onUpgrade(id),
      onLot: () => handlers.current.onLot(),
      onAltar: () => handlers.current.onAltar(),
      onAutomation: (action, index) => handlers.current.onAutomation(action, index),
      onRevealed: (ticket) => handlers.current.onRevealed(ticket),
      onProgress: (done) => handlers.current.onProgress(done),
      onScratch: (ticket, scratch) => handlers.current.onScratch(ticket, scratch),
      onTicket: (id) => handlers.current.onTicket(id),
      onCollect: () => handlers.current.onCollect(),
      onBoard: () => handlers.current.onBoard(),
      onContract: () => handlers.current.onContract(),
      onJournal: () => handlers.current.onJournal(),
      onTool: (id) => handlers.current.onTool(id),
      onView: (view) => handlers.current.onView(view),
      onPlayTime: elapsed => handlers.current.onPlayTime(elapsed),
      onReturn: () => handlers.current.onReturn(),
      onRepair: id => handlers.current.onRepair(id),
      onStartScratch: ticket => handlers.current.onStartScratch(ticket),
      onBomb: (ticket, index) => handlers.current.onBomb(ticket, index),
    });
    stage.current = created;
    return () => {
      created.dispose();
      stage.current = null;
    };
  }, [handlers, stage]);

  useEffect(() => {
    stage.current?.update(state);
  }, [state, stage]);

  useEffect(() => { stage.current?.setPaused(paused); }, [paused, stage]);

  return <div className="stage" ref={host} role="img" aria-label={t('table.title')} />;
}
