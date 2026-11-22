import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createInitialState } from '../game/state';
import { buyUpgrade } from '../game/upgrades';
import { UpgradeStation } from './upgradeStation';

vi.mock('./kioskModels', () => ({ kioskProp: () => new THREE.Group() }));
vi.mock('./assets', async original => ({ ...await original<typeof import('./assets')>(), image: () => ({}) }));

describe('physical upgrade offers', () => {
  const print = vi.fn();
  beforeEach(() => {
    print.mockClear();
    const context = new Proxy({}, { get: (_, key) => key === 'fillText' ? print : vi.fn() });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('prints three priced, levelled offers with raycast actions and distinct positions', () => {
    const station = new UpgradeStation();
    const state = createInitialState(1);
    station.update(state);
    const text = print.mock.calls.map(call => call[0]).join(' ');
    expect(text).toContain('May mắn · Cấp 0/50');
    expect(text).toContain('Bàn rộng · Cấp 0/7');
    expect(text).toContain('Mua sỉ · Cấp 0/3');
    expect(text).toContain('Nâng cấp · 600 xu');
    const actions: string[] = [];
    station.group.traverse(node => { if (node.userData.action) actions.push(node.userData.action.id); });
    expect(new Set(actions)).toEqual(new Set(['luck', 'desk', 'bulk']));
    expect(station.anchor('luck').y).toBeGreaterThan(station.anchor('desk').y);
    expect(station.anchor('bulk').y).toBeGreaterThan(.175);
    expect(station.points()).toHaveLength(4);
    station.dispose();
  });

  it('keeps prices when unaffordable and shows the next level or a capped offer', () => {
    const station = new UpgradeStation();
    const state = { ...createInitialState(1), money: 1000 };
    station.update(buyUpgrade(state, 'luck'));
    expect(print.mock.calls.map(call => call[0]).join(' ')).toContain('May mắn · Cấp 1/50');
    station.update({ ...state, upgrades: { luck: 50, desk: 7, bulk: 3 } });
    expect(print.mock.calls.map(call => call[0]).filter(text => text === 'Đã tối đa')).toHaveLength(3);
    station.dispose();
  });
});
