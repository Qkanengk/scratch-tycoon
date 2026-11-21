import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../data/tools';
import { animateToolModel, buildToolModel, disposeToolObject } from './toolModels';

describe('handmade tool models', () => {
  it('dulls and scuffs worn tools without changing locked silhouettes', () => {
    const fresh = buildToolModel('key');
    const worn = buildToolModel('key', 0, false, .2);
    const locked = buildToolModel('key', 0, true, .2);
    const color = (model: THREE.Group) => ((model.getObjectByName('key-bow') as THREE.Mesh).material as THREE.MeshToonMaterial).color.getHex();
    expect(color(worn)).not.toBe(color(fresh));
    expect(worn.getObjectsByProperty('name', 'wear-scuff').length).toBeGreaterThan(0);
    expect(fresh.getObjectByName('wear-scuff')).toBeUndefined();
    expect(locked.getObjectByName('wear-scuff')).toBeUndefined();
    [fresh, worn, locked].forEach(disposeToolObject);
  });
  it('spins the exposed rubber roller only while scratching', () => {
    const machine = buildToolModel('machine');
    const roller = machine.getObjectByName('scratch-roller')!;
    expect(roller.children).toHaveLength(11);
    animateToolModel(machine, 0.1, false);
    expect(roller.rotation.x).toBe(0);
    animateToolModel(machine, 0.1, true);
    expect(roller.rotation.x).toBeCloseTo(2.2);
    animateToolModel(machine, 0.1, false);
    expect(roller.rotation.x).toBeCloseTo(2.2);
    const coin = buildToolModel('coin');
    expect(() => animateToolModel(coin, 0.1, true)).not.toThrow();
    disposeToolObject(machine);
    disposeToolObject(coin);
  });
  it.each(TOOLS)('builds a finite, phone-readable toon $id with upgrade trim', ({ id }) => {
    const model = buildToolModel(id);
    const box = new THREE.Box3().setFromObject(model);
    expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true);
    expect(box.getSize(new THREE.Vector3()).length()).toBeGreaterThan(0.6);
    model.traverse(node => {
      if (node instanceof THREE.Mesh && node.name !== 'outline') expect(node.material).toBeInstanceOf(THREE.MeshToonMaterial);
    });
    expect(model.getObjectByName('upgrade-trim')).toBeUndefined();
    const upgraded = buildToolModel(id, 5);
    expect(upgraded.getObjectByName('upgrade-trim')).toBeDefined();
    expect(upgraded.scale.x).toBeGreaterThan(model.scale.x);
    disposeToolObject(model);
    disposeToolObject(upgraded);
  });

  it('uses distinct geometry for all six silhouettes', () => {
    const signatures = TOOLS.map(({ id }) => {
      const model = buildToolModel(id, 0, true);
      const geometry: string[] = [];
      model.traverse(node => {
        if (node instanceof THREE.Mesh && node.name !== 'outline') geometry.push(`${node.geometry.type}:${node.geometry.getAttribute('position').count}`);
      });
      disposeToolObject(model);
      return geometry.join(',');
    });
    expect(new Set(signatures).size).toBe(6);
  });
});
