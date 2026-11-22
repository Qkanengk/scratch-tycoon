import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { ToolIntent } from '../game/tools';
import { Stage } from './Stage';
import { PlayClock } from './playClock';

describe('desk framing', () => {
  const stageAt = (width: number, height: number) => Object.assign(Object.create(Stage.prototype), {
    host: { clientWidth: width, clientHeight: height },
    camera: new THREE.PerspectiveCamera(50, width / height),
    renderer: { domElement: { dataset: {} } },
    view: 'desk',
    robots: {
      group: new THREE.Group(), layout: vi.fn(),
      deskPoints: vi.fn(() => [new THREE.Vector3(100, 100, 100)]),
      points: vi.fn(() => [new THREE.Vector3(1, 0, 0), new THREE.Vector3(5, 2, 3)]),
    },
    room: new THREE.Group(),
    metrics: { height: 1.4 },
    touchLayout: () => width < 900,
    touchTop: 70, touchBottom: 120,
    frameUp: vi.fn(() => new THREE.Vector3()),
    eyeGoal: new THREE.Vector3(), focusGoal: new THREE.Vector3(),
  });

  it.each([[1280, 800], [1280, 960], [1024, 768], [390, 844], [844, 390]])('keeps the pre-robot ticket bounds at %i×%i', (width, height) => {
    const stage = stageAt(width, height);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(.3, .4, .2));
    prop.name = 'cash-register';
    prop.position.set(-.8, .2, -.2);
    stage.room.add(prop);
    stage.aim();
    const [target, , points] = stage.frameUp.mock.calls[0];
    expect(target).toEqual(new THREE.Vector3());
    expect(points).toHaveLength(width >= 900 ? 12 : 4);
    expect(points.every((point: THREE.Vector3) => point.x < 1)).toBe(true);
    expect(stage.robots.deskPoints).not.toHaveBeenCalled();
    expect(stage.robots.group.visible).toBe(false);
  });

  it('frames the ticket without optional counter props and restores the unchanged robot bounds', () => {
    const stage = stageAt(1280, 800);
    stage.aim();
    expect(stage.frameUp.mock.calls[0][2]).toHaveLength(4);
    stage.view = 'robots';
    stage.aim();
    expect(stage.robots.group.visible).toBe(true);
    expect(stage.robots.layout).toHaveBeenLastCalledWith(false, true);
    expect(stage.frameUp.mock.calls[1][2]).toEqual(stage.robots.points.mock.results[0].value);
    expect(stage.focusGoal).toEqual(new THREE.Vector3(3, .55, 1.5));
  });

  it('keeps the phone desk safe area independent of the robot glance button', () => {
    const stage = stageAt(390, 844);
    const element = (top: number, bottom: number, right = false) => ({
      matches: () => right,
      getBoundingClientRect: () => ({ top, bottom }),
    });
    stage.ready = true;
    stage.aim = vi.fn();
    stage.host.parentElement = {
      style: { getPropertyValue: () => '', setProperty: vi.fn() },
      querySelector: (selector: string) => selector === '.prompt' ? { getBoundingClientRect: () => ({ top: 768, height: 70 }) } : null,
      querySelectorAll: () => [element(20, 60), element(72, 116), element(714, 758, true)],
    };
    stage.measureHud();
    expect(stage.touchTop).toBe(122);
    expect(stage.touchBottom).toBe(82);
    stage.view = 'robots';
    stage.measureHud();
    expect(stage.touchBottom).toBe(136);
  });

  it('frames the phone shop and robot station below the notice without shifting the scratch desk', () => {
    const stage = stageAt(390, 844);
    let notice: { bottom: number } | null = { bottom: 133 };
    stage.ready = true;
    stage.aim = vi.fn();
    stage.host.parentElement = {
      style: { getPropertyValue: () => '', setProperty: vi.fn() },
      querySelector: (selector: string) => selector === '.prompt'
        ? { getBoundingClientRect: () => ({ top: 768, height: 70 }) }
        : notice && { getBoundingClientRect: () => notice },
      querySelectorAll: () => [{ matches: () => false, getBoundingClientRect: () => ({ top: 12, bottom: 64 }) }],
    };
    for (const view of ['shop', 'robots']) {
      stage.view = view;
      stage.measureHud();
      expect(stage.touchTop).toBe(139);
    }
    stage.view = 'desk';
    stage.measureHud();
    expect(stage.touchTop).toBe(70);
    stage.view = 'shop';
    notice = null;
    stage.measureHud();
    expect(stage.touchTop).toBe(70);
  });
});

describe('stage shelf interactions', () => {
  it('reserves incident and contract notices above the desktop upgrade station', () => {
    const app = {
      style: { getPropertyValue: () => '', setProperty: vi.fn() },
      querySelector: (selector: string) => ({ getBoundingClientRect: () => selector === '.kiosk-notices' ? { bottom: 150 } : { top: 720, height: 65 } }),
      querySelectorAll: () => [],
    };
    const stage = Object.assign(Object.create(Stage.prototype), {
      ready: true, view: 'upgrades', touchLayout: () => false, aim: vi.fn(),
      host: { clientHeight: 800, parentElement: app },
    });
    stage.measureHud();
    expect(stage.touchTop).toBe(156);
    expect(stage.aim).toHaveBeenCalledOnce();
  });
  it('enters the upgrade view before a purchase and dispatches upgrade and lot controls', () => {
    const callbacks = { onUpgrade: vi.fn(), onLot: vi.fn() };
    const stage = Object.assign(Object.create(Stage.prototype), { view: 'shop', callbacks, look: vi.fn() });
    stage.press({ kind: 'upgrades' });
    expect(stage.look).toHaveBeenCalledExactlyOnceWith('upgrades');
    expect(callbacks.onUpgrade).not.toHaveBeenCalled();
    stage.view = 'upgrades';
    stage.press({ kind: 'upgrade', id: 'desk' });
    stage.press({ kind: 'lot' });
    expect(callbacks.onUpgrade).toHaveBeenCalledExactlyOnceWith('desk');
    expect(callbacks.onLot).toHaveBeenCalledOnce();
    expect(stage.sideView('right')).toBe('tools');
    stage.nod('down');
    expect(stage.look).toHaveBeenLastCalledWith('shop');
  });
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
