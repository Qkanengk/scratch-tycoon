import { useCallback, useEffect, useRef, useState } from 'react';
import { updatePromo } from '../game/economy';
import { loadStoredSave, SAVE_KEY, updateStoredSave } from '../game/save';
import { createInitialState, type GameState } from '../game/state';

function newGame(): GameState {
  return createInitialState((Math.random() * 2 ** 32) >>> 0);
}

function loadGame() {
  try {
    return loadStoredSave(localStorage, newGame);
  } catch {
    return { state: newGame(), text: null, recovered: false, writable: false };
  }
}

export interface Game {
  state: GameState;
  recovered: boolean;
  /** Current time in ms, refreshed while a countdown is running. */
  now: number;
  /** Applies a pure transition that takes the current time as its last argument. */
  apply: (transition: (state: GameState, now: number) => GameState) => void;
  reset: () => void;
  replace: (state: GameState) => void;
}

export function useGame(): Game {
  const [loaded] = useState(loadGame);
  const [state, setState] = useState(loaded.state);
  const current = useRef(loaded);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback<Game['apply']>((transition) => {
    const commit = (locked: boolean) => {
      const time = Date.now();
      try {
        current.current = updateStoredSave(localStorage, current.current, newGame,
          (value) => updatePromo(transition(value, time), time), time, locked);
      } catch {
        current.current = { ...current.current, state: updatePromo(transition(current.current.state, time), time), writable: false };
      }
      setNow(time);
      setState(current.current.state);
    };
    // Include actions queued before a storage event in the cross-tab transaction.
    if (navigator.locks) void navigator.locks.request(SAVE_KEY, () => commit(true)).catch(() => commit(false));
    else commit(false); // Without locking, keep storage read-only rather than risk progress.
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== SAVE_KEY) return;
      // A queued event may be superseded; adoption reads the latest value and never writes it back.
      const next = loadGame();
      current.current = next;
      setNow(Date.now());
      setState(next.state);
    };
    window.addEventListener('storage', onStorage);
    apply((value) => value);
    return () => window.removeEventListener('storage', onStorage);
  }, [apply]);

  const waiting = state.promoReadyAt !== null;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [waiting]);

  const reset = useCallback(() => apply(() => newGame()), [apply]);
  const replace = useCallback((next: GameState) => apply(() => next), [apply]);

  return { state, recovered: loaded.recovered, now, apply, reset, replace };
}
