import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createInitialState } from '../game/state';
import { buyTicket, revealTicket } from '../game/economy';
import { DeskRound } from './deskRound';
import { roundLayout } from './roundLayout';
import { ticketMetrics } from './ticketFace';

vi.mock('./assets', async original => ({ ...await original<typeof import('./assets')>(), image: () => ({}) }));

vi.mock('./ticketFace', async original => ({ ...await original<typeof import('./ticketFace')>(),
  ticketSample: () => document.createElement('canvas'), drawFace: vi.fn(),
}));

describe('round and queued ticket presentation', () => {
  beforeEach(() => {
    const context = new Proxy({}, { get: () => vi.fn() });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds nothing for an empty or a single-ticket desk', () => {
    const display = new DeskRound();
    const state = createInitialState(1);
    display.update(state);
    expect(display.followers.children).toHaveLength(0);
    expect(display.pile.children).toHaveLength(0);
    display.update(buyTicket(state, 'dong'));
    expect(display.followers.children).toHaveLength(0);
    expect(display.pile.children).toHaveLength(0);
    display.dispose();
  });

  it('keeps the tiles and pile attached across reveal, limits the tiles to the round and clears them', () => {
    const display = new DeskRound();
    const scene = new THREE.Scene();
    scene.add(display.followers, display.pile);
    const state = buyTicket({ ...createInitialState(4), money: 1000, upgrades: { luck: 0, desk: 2, bulk: 1 }, bulkLot: 5 }, 'dong');
    const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture(), transparent: true });
    display.update(state, material);
    const layout = roundLayout(3, ticketMetrics('dong').height, .61, false);
    display.layout(layout);
    expect(display.followers.children).toHaveLength(3);
    expect(display.pile.children).toHaveLength(5);
    const previous = display.followers.children[0];
    expect(previous?.position.x).toBe(layout.tiles[1]!.x);
    expect(previous?.position.z).toBe(layout.tiles[1]!.z);
    const foil = previous?.children[2] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    expect(foil.material.map).toBe(material.map);
    expect(foil.material).not.toBe(material);
    expect(foil.renderOrder).toBe(2);
    display.update(state);
    expect(display.followers.children[0]).toBe(previous);
    display.update(revealTicket(state));
    expect(display.followers.children[0]?.children).toHaveLength(2);
    expect(display.followers.parent).toBe(scene);
    expect(display.pile.parent).toBe(scene);
    expect(display.followers.children).toHaveLength(3);
    display.update(createInitialState(4));
    expect(display.followers.children).toHaveLength(0);
    expect(display.pile.children).toHaveLength(0);
    display.dispose();
  });
});
