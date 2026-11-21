import { useCallback, useEffect, useState } from 'react';
import { updatePromo } from '../game/economy';
import { deserialize, SAVE_KEY, serialize } from '../game/save';
import { createInitialState, type GameState } from '../game/state';

function newGame(): GameState {
  return createInitialState((Math.random() * 2 ** 32) >>> 0);
}

function loadGame(): GameState {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    const saved = text === null ? null : deserialize(text);
    if (saved) return saved;
  } catch {
    // Storage can be unavailable (private mode); play without a save.
  }
  return newGame();
}

export interface Game {
  state: GameState;
  /** Current time in ms, refreshed while a countdown is running. */
  now: number;
  /** Applies a pure transition that takes the current time as its last argument. */
  apply: (transition: (state: GameState, now: number) => GameState) => void;
  reset: () => void;
  replace: (state: GameState) => void;
}

export function useGame(): Game {
  const [state, setState] = useState(loadGame);
  const [now, setNow] = useState(() => Date.now());

  const apply = useCallback<Game['apply']>((transition) => {
    const time = Date.now();
    setNow(time);
    setState((current) => updatePromo(transition(current, time), time));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(state));
    } catch {
      // Ignore a full or unavailable storage; the game keeps running in memory.
    }
  }, [state]);

  const waiting = state.promoReadyAt !== null;
  useEffect(() => {
    // Starts the free-ticket countdown for a save that was loaded broke.
    apply((current) => current);
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [waiting, apply]);

  const reset = useCallback(() => setState(newGame()), []);
  const replace = useCallback((next: GameState) => setState(next), []);

  return { state, now, apply, reset, replace };
}
