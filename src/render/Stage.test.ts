import { describe, expect, it, vi } from 'vitest';
import type { ToolIntent } from '../game/tools';
import { Stage } from './Stage';
import { PlayClock } from './playClock';

describe('stage shelf interactions', () => {
  it('looks at the altar on the first tap and offers incense only from its view', () => {
    const callbacks = { onAltar: vi.fn() };
    const stage = Object.assign(Object.create(Stage.prototype), { view: 'shop', callbacks, look: vi.fn() });
    stage.press({ kind: 'altar' });
    expect(stage.look).toHaveBeenCalledExactlyOnceWith('altar');
    expect(callbacks.onAltar).not.toHaveBeenCalled();
    stage.view = 'altar';
    stage.press({ kind: 'altar', offer: true });
    expect(callbacks.onAltar).toHaveBeenCalledOnce();
  });
  it('includes the altar in both sideways routes and returns to shop on a nod down', () => {
    const stage = Object.assign(Object.create(Stage.prototype), { view: 'shop', look: vi.fn() });
    expect(stage.sideView('left')).toBe('altar');
    stage.view = 'altar';
    expect(stage.sideView('left')).toBe('tools');
    expect(stage.sideView('right')).toBe('shop');
    stage.nod('down');
    expect(stage.look).toHaveBeenCalledExactlyOnceWith('shop');
  });
  it('never scratches a return-tag press and returns only when released on the tag', () => {
    const press = vi.fn();
    const pick = vi.fn().mockReturnValue({ kind: 'return' });
    const stage = Object.assign(Object.create(Stage.prototype), { returnPress: true, mask: {}, busy: false, view: 'desk', settled: true, pick, press });
    expect(stage.canScratch()).toBe(false);
    stage.releaseReturn({ clientX: 102, clientY: 100 });
    expect(press).toHaveBeenCalledExactlyOnceWith({ kind: 'return' });
    pick.mockReturnValue(null);
    stage.releaseReturn({ clientX: 200, clientY: 100 });
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('counts rent only while this window owns focus', () => {
    const document = { hidden: false, hasFocus: () => true };
    vi.stubGlobal('document', document);
    const onPlayTime = vi.fn();
    const stage = Object.assign(Object.create(Stage.prototype), { playClock: new PlayClock(), paused: false, callbacks: { onPlayTime } });
    stage.clock(0);
    document.hasFocus = () => false;
    stage.clock(350);
    stage.clock(9350);
    expect(onPlayTime).toHaveBeenCalledExactlyOnceWith(350);
    document.hasFocus = () => true;
    stage.clock(10000);
    stage.clock(11000);
    expect(onPlayTime.mock.calls).toEqual([[350], [1000]]);
    vi.unstubAllGlobals();
  });
  it('stops an ongoing scratch while paused or hidden', () => {
    const stage = Object.assign(Object.create(Stage.prototype), { mask: {}, busy: false, view: 'desk', settled: true, paused: true });
    expect(stage.canScratch()).toBe(false);
    vi.stubGlobal('document', { hidden: true });
    stage.paused = false;
    expect(stage.canScratch()).toBe(false);
    vi.stubGlobal('document', { hidden: false });
    expect(stage.canScratch()).toBe(true);
    vi.unstubAllGlobals();
  });
  it('dispatches repair and counterfeit return actions without navigating', () => {
    const stage = Object.create(Stage.prototype) as unknown as {
      callbacks: { onRepair: ReturnType<typeof vi.fn>; onReturn: ReturnType<typeof vi.fn> };
      saveScratch: ReturnType<typeof vi.fn>;
      press(action: { kind: 'repair'; id: 'key' } | { kind: 'return' }): void;
    };
    stage.callbacks = { onRepair: vi.fn(), onReturn: vi.fn() };
    stage.saveScratch = vi.fn();
    stage.press({ kind: 'repair', id: 'key' });
    expect(stage.callbacks.onRepair).toHaveBeenCalledExactlyOnceWith('key');
    stage.press({ kind: 'return' });
    expect(stage.callbacks.onReturn).toHaveBeenCalledOnce();
    expect(stage.saveScratch).toHaveBeenCalledOnce();
  });
  it.each([null, ...(['buy', 'equip', 'upgrade'] as const).map(kind => ({ id: 'coin' as const, kind, level: 0 }))])('never navigates when pressing a shelf tool with intent %j', intent => {
    const stage = Object.create(Stage.prototype) as {
      view: string;
      callbacks: { onTool: ReturnType<typeof vi.fn>; onBoard: ReturnType<typeof vi.fn> };
      look: ReturnType<typeof vi.fn>;
      press(action: { kind: 'tool'; intent: ToolIntent | null }): void;
    };
    stage.view = 'tools';
    stage.callbacks = { onTool: vi.fn(), onBoard: vi.fn() };
    stage.look = vi.fn();
    stage.press({ kind: 'tool', intent });
    expect(stage.look).not.toHaveBeenCalled();
    expect(stage.callbacks.onBoard).not.toHaveBeenCalled();
    expect(stage.view).toBe('tools');
    if (intent) expect(stage.callbacks.onTool).toHaveBeenCalledExactlyOnceWith(intent);
    else expect(stage.callbacks.onTool).not.toHaveBeenCalled();
  });
});
