import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TOOLS } from '../data/tools';
import { KIOSK_MODELS, kioskAnimation, kioskProp, preloadKioskModels } from './kioskModels';
import { animateToolModel, buildToolModel, disposeToolObject } from './toolModels';
import { positionShelfTool } from './toolShelf';
import { posedBounds } from './toon';

vi.mock('./assets', async importOriginal => ({
  ...await importOriginal<typeof import('./assets')>(),
  loadGltf: (file: string) => {
    const url = new URL(`../../public/assets/models/${file}`, import.meta.url);
    const bytes = Uint8Array.from(readFileSync(url));
    const manager = new THREE.LoadingManager().setURLModifier(path => path.startsWith('file:') ?
      `data:image/png;base64,${readFileSync(new URL(path)).toString('base64')}` : path);
    return new GLTFLoader(manager).parseAsync(bytes.buffer, new URL('./', url).href);
  },
}));

beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1 }));
  await preloadKioskModels();
});

afterAll(() => vi.unstubAllGlobals());

const surface = (root: THREE.Object3D): THREE.MeshToonMaterial =>
  root.getObjectsByProperty('isMesh', true)
    .map(node => [node instanceof THREE.Mesh ? node.material : null].flat()[0])
    .find((mat): mat is THREE.MeshToonMaterial => mat instanceof THREE.MeshToonMaterial)!;

describe('sourced kiosk models', () => {
  it.each(Object.keys(KIOSK_MODELS) as (keyof typeof KIOSK_MODELS)[])('loads, sits flat and toon-shades %s', id => {
    const prop = kioskProp(id, .8);
    const box = posedBounds(prop);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(Math.max(...box.getSize(new THREE.Vector3()).toArray())).toBeCloseTo(.8, 1);
    expect(surface(prop)).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(prop.getObjectByName('outline')).toBeDefined();
    disposeToolObject(prop);
  });

  it('loads the sourced idle and work clips', () => {
    for (const id of ['robot', 'robot2'] as const) {
      expect(kioskAnimation(id, /idle$/i)?.duration).toBeGreaterThan(0);
      expect(kioskAnimation(id, /(?:attack|punch)$/i)?.duration).toBeGreaterThan(0);
    }
  });
});

describe('sourced tool models', () => {
  it('faces the broad side of the extended scraper forward with the blade pointing down', () => {
    const tool = buildToolModel('scraper', 0, true);
    const bounds = posedBounds(tool);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(size.y).toBeGreaterThan(.7);
    expect(size.x).toBeGreaterThan(size.z);
    expect(surface(tool).map).not.toBeNull();
    disposeToolObject(tool);
  });

  it.each(['card', 'scraper', 'machine', 'laser'] as const)('gives the %s a larger face without overlapping its label', id => {
    const tool = buildToolModel(id, 0, true);
    const previous = buildToolModel(id, 0, true);
    previous.rotation.y = -.12;
    previous.scale.multiplyScalar(.34);
    const oldSize = posedBounds(previous).getSize(new THREE.Vector3());
    positionShelfTool(tool, id);
    const bounds = posedBounds(tool);
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x * size.y).toBeGreaterThan(oldSize.x * oldSize.y * 1.2);
    expect(bounds.min.y).toBeGreaterThan(-.17);
    expect(bounds.max.y).toBeLessThan(.16);
    expect(size.x).toBeLessThan(.73);
    [tool, previous].forEach(disposeToolObject);
  });

  it('tints damage and upgrades per instance and gives locked previews distinct colors', () => {
    const fresh = buildToolModel('key');
    const worn = buildToolModel('key', 0, false, .2);
    const locked = buildToolModel('key', 0, true, .2);
    const upgraded = buildToolModel('key', 5);
    expect(surface(worn).color.getHex()).not.toBe(surface(fresh).color.getHex());
    expect(surface(upgraded).color.getHex()).not.toBe(surface(fresh).color.getHex());
    const lockedCard = buildToolModel('card', 0, true);
    expect(surface(locked).color.getHex()).not.toBe(surface(fresh).color.getHex());
    expect(surface(locked).color.getHex()).not.toBe(surface(lockedCard).color.getHex());
    expect(surface(lockedCard).map).toBeNull();
    expect(upgraded.scale.x).toBeGreaterThan(fresh.scale.x);
    [fresh, worn, locked, lockedCard, upgraded].forEach(disposeToolObject);
  });

  it('spins the sourced paint roller only while scratching', () => {
    const machine = buildToolModel('machine');
    const roller = machine.getObjectByName('scratch-roller')!;
    expect(roller.children).toHaveLength(1);
    expect((roller.children[0] as THREE.Mesh).geometry.hasAttribute('normal')).toBe(true);
    animateToolModel(machine, .1, false);
    expect(roller.rotation.x).toBe(0);
    animateToolModel(machine, .1, true);
    expect(roller.rotation.x).toBeCloseTo(2.2);
    animateToolModel(machine, .1, false);
    expect(roller.rotation.x).toBeCloseTo(2.2);
    disposeToolObject(machine);
  });

  it('uses distinct geometry for all six silhouettes', () => {
    const signatures = TOOLS.map(({ id }) => {
      const tool = buildToolModel(id, 0, true);
      const signature: number[] = [];
      tool.traverse(node => {
        if (node instanceof THREE.Mesh && node.name !== 'outline') signature.push(node.geometry.getAttribute('position').count);
      });
      disposeToolObject(tool);
      expect(signature.length).toBeGreaterThan(0);
      return signature.join(',');
    });
    expect(new Set(signatures).size).toBe(6);
  });
});
