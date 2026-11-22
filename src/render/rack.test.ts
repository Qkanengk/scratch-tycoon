import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../game/state';
import { Rack } from './rack';

vi.mock('./assets', async importOriginal => ({ ...await importOriginal<typeof import('./assets')>(), rasterize: () => ({}) }));
vi.mock('./ticketFace', async importOriginal => ({
  ...await importOriginal<typeof import('./ticketFace')>(),
  ticketSample: () => document.createElement('canvas'),
}));

describe('prestige rack slot', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => vi.fn() });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('omits Vũ Trụ and its framing points until the first prestige', () => {
    const rack = new Rack();
    const state = createInitialState(1);
    rack.update(state);
    const sixth = rack.group.children.at(-1)!;
    expect(sixth.visible).toBe(false);
    expect(rack.points()).toHaveLength(20);
    state.prestige.tier = 1;
    rack.update(state);
    expect(sixth.visible).toBe(true);
    expect(rack.points()).toHaveLength(24);
    rack.layout(true);
    expect(sixth.position.y).toBe(.62);
    state.prestige.tier = 0;
    rack.update(state);
    expect(sixth.visible).toBe(false);
    expect(rack.points()).toHaveLength(20);
  });
});
