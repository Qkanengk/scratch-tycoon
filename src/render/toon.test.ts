import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { fitToSize, posedBounds } from './toon';

describe('fitToSize', () => {
  it('centres a translated, pre-scaled root on the origin and rests it on y = 0', () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1));
    root.position.set(5, -3, 7);
    root.scale.setScalar(0.5);

    const holder = fitToSize(root, 1);
    const box = posedBounds(holder);
    const centre = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());

    expect(Math.max(dims.x, dims.y, dims.z)).toBeCloseTo(1);
    expect(centre.x).toBeCloseTo(0);
    expect(centre.z).toBeCloseTo(0);
    expect(box.min.y).toBeCloseTo(0);
  });
});
