import * as THREE from 'three';
import type { ToolId } from '../data/tools';
import { INK, toonify } from './toon';

/** Models face +z, with the scratching tip at the origin and handles pointing up. */
export function buildToolModel(id: ToolId, level = 0, silhouette = false, durability = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = `tool-${id}`;
  const gold = 0xf7b500;
  const steel = 0xaeb4c2;
  const red = 0xef4b3f;
  const blue = 0x3d8bfd;
  const add = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z = 0) => {
    const tint = new THREE.Color(color).lerp(new THREE.Color(0x756553), (1 - durability) * .72);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: silhouette ? INK : tint }));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z = 0) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const disc = (r: number, d: number, color: number, x: number, y: number, z = 0) => {
    const mesh = add(new THREE.CylinderGeometry(r, r, d, 24), color, x, y, z);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  if (id === 'coin') {
    disc(0.4, 0.1, gold, 0, 0);
    disc(0.31, 0.025, 0xffd23f, 0, 0, 0.065);
    box(0.11, 0.35, 0.025, gold, 0, 0, 0.09);
    box(0.28, 0.07, 0.025, gold, 0, 0.12, 0.09);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const ridge = box(0.035, 0.06, 0.02, gold, Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0.06);
      ridge.rotation.z = -a;
    }
  } else if (id === 'key') {
    const bow = add(new THREE.TorusGeometry(0.22, 0.085, 8, 24), gold, 0, 0.66);
    bow.name = 'key-bow';
    box(0.15, 0.65, 0.1, gold, 0, 0.2);
    box(0.33, 0.12, 0.1, gold, 0.09, -0.07);
    box(0.26, 0.12, 0.1, gold, 0.055, 0.13);
  } else if (id === 'card') {
    box(0.88, 0.58, 0.06, blue, 0, 0.27);
    box(0.87, 0.12, 0.012, INK, 0, 0.39, 0.04);
    box(0.18, 0.13, 0.02, gold, -0.23, 0.18, 0.05);
    box(0.34, 0.035, 0.02, 0xfff3d6, 0.16, 0.12, 0.05);
    box(0.2, 0.035, 0.02, 0xfff3d6, 0.09, 0.2, 0.05);
  } else if (id === 'scraper') {
    box(0.85, 0.19, 0.06, steel, 0, 0);
    box(0.85, 0.045, 0.025, 0xfff3d6, 0, -0.09, 0.04);
    box(0.18, 0.32, 0.1, steel, 0, 0.23);
    box(0.27, 0.53, 0.17, red, 0, 0.59);
    for (let i = 0; i < 3; i++) box(0.29, 0.04, 0.18, INK, 0, 0.47 + i * 0.11);
    disc(0.05, 0.025, steel, 0, 0.75, 0.1);
  } else if (id === 'machine') {
    const roller = new THREE.Group();
    roller.name = 'scratch-roller';
    const rubber = add(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 16).rotateZ(Math.PI / 2), INK, 0, 0);
    roller.add(rubber);
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      const rib = box(0.78, 0.035, 0.055, 0x59626c, 0, Math.cos(angle) * 0.17, Math.sin(angle) * 0.17);
      rib.rotation.x = angle;
      roller.add(rib);
    }
    group.add(roller);
    for (const x of [-0.44, 0.44]) {
      box(0.08, 0.3, 0.14, steel, x, 0.12);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16).rotateZ(Math.PI / 2), gold, x, 0);
    }
    box(0.64, 0.3, 0.3, 0xe58a45, 0, 0.32);
    box(0.68, 0.065, 0.34, steel, 0, 0.19);
    for (const x of [-0.22, 0.22]) box(0.09, 0.34, 0.16, INK, x, 0.62);
    box(0.53, 0.12, 0.2, INK, 0, 0.83);
    for (const x of [-0.12, 0, 0.12]) box(0.025, 0.13, 0.21, 0x59626c, x, 0.83);
    box(0.1, 0.08, 0.19, red, 0.2, 0.73, 0.025);
    for (const y of [0.29, 0.37]) box(0.24, 0.025, 0.025, INK, -0.12, y, 0.17);
    disc(0.055, 0.03, blue, 0.2, 0.33, 0.17);
  } else {
    const barrel = add(new THREE.CylinderGeometry(0.13, 0.17, 0.7, 12), blue, 0, 0.56);
    barrel.name = 'laser-barrel';
    const nozzle = add(new THREE.ConeGeometry(0.17, 0.27, 12), steel, 0, 0.11);
    nozzle.rotation.z = Math.PI;
    disc(0.07, 0.07, red, 0, -0.06, 0.02);
    box(0.1, 0.16, 0.08, red, 0, 0.6, 0.14);
    box(0.055, 0.32, 0.1, gold, 0.17, 0.7);
    for (const y of [0.3, 0.38]) box(0.31, 0.035, 0.27, INK, 0, y);
  }
  if (level > 0) {
    const trim = id === 'machine'
      ? box(0.56, 0.035 + level * 0.003, 0.22, gold, 0, 0.89)
      : add(new THREE.TorusGeometry(0.13, 0.025 + level * 0.002, 6, 20), gold, 0, id === 'coin' ? 0 : 0.6, 0.14);
    trim.name = 'upgrade-trim';
  }
  group.scale.setScalar(1 + level * 0.012);
  if (!silhouette && durability < .85 && id !== 'coin') {
    for (let i = 0; i < Math.ceil((1 - durability) * 7); i++) {
      const scuff = box(.13, .018, .025, 0x544334, (i % 3 - 1) * .09, .12 + i * .07, .18);
      scuff.rotation.z = -.4;
      scuff.name = 'wear-scuff';
    }
  }
  toonify(group, { outline: 0.014 });
  return group;
}

export function animateToolModel(root: THREE.Object3D, dt: number, scratching: boolean): void {
  const roller = root.getObjectByName('scratch-roller');
  if (roller && scratching) roller.rotation.x = (roller.rotation.x + dt * 22) % (Math.PI * 2);
}

export function disposeToolObject(root: THREE.Object3D): void {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
  });
  root.removeFromParent();
}
