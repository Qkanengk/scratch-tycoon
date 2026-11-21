import { useEffect, useRef, type RefObject } from 'react';
import { t } from '../i18n';
import type { GameState } from '../game/state';
import { Stage, type StageCallbacks } from '../render/Stage';

interface Props {
  state: GameState;
  /** Always the latest handlers; the stage calls through this so it is built only once. */
  handlers: RefObject<StageCallbacks>;
  stage: RefObject<Stage | null>;
}

/** The three.js kiosk. React owns the game state; the stage draws it and reports what the player does. */
export function StageView({ state, handlers, stage }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const created = new Stage(host.current, {
      onRevealed: (ticket) => handlers.current.onRevealed(ticket),
      onProgress: (done) => handlers.current.onProgress(done),
      onScratch: (ticket, scratch) => handlers.current.onScratch(ticket, scratch),
      onTicket: (id) => handlers.current.onTicket(id),
      onCollect: () => handlers.current.onCollect(),
      onBoard: () => handlers.current.onBoard(),
      onView: (view) => handlers.current.onView(view),
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

  return <div className="stage" ref={host} role="img" aria-label={t('table.title')} />;
}
