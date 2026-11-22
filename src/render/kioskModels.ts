import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from './assets';
import { isFiniteBox, posedBounds, toonify } from './toon';

export const KIOSK_MODELS = {
  coin: 'kenney-platformer-kit/coin-gold.glb',
  key: 'kiosk/key.glb',
  card: 'kiosk/card.glb',
  scraper: 'kiosk/scraper.glb',
  machine: 'kiosk/machine.glb',
  laser: 'kiosk/laser-model.glb',
  shelf: 'kiosk/shelf.glb',
  stand: 'kiosk/shelf-wide.glb',
  noticeboard: 'kiosk/wooden-board.glb',
  counter: 'kiosk/counter.glb',
  robot: 'kiosk/robot.glb',
  robot2: 'kiosk/robot-2.glb',
  robot3: 'kiosk/robot-3.glb',
  battery: 'kiosk/battery.glb',
  power: 'kiosk/power.glb',
  register: 'kenney-mini-arcade/cash-register.glb',
  altar: 'kiosk/shrine.glb',
  candle: 'kiosk/candle.glb',
  lantern: 'kiosk/lantern.glb',
  ingots: 'quaternius/gold-ingots.glb',
  fruit: 'kenney-food-kit/lemon.glb',
} as const;

export type KioskModel = keyof typeof KIOSK_MODELS;
type Triple = readonly [number, number, number];

const models = new Map<KioskModel, Awaited<ReturnType<typeof loadGltf>>>();
let ready: Promise<void> | undefined;

export function preloadKioskModels(): Promise<void> {
  ready ??= Promise.allSettled(Object.entries(KIOSK_MODELS).map(async ([id, path]) => {
    models.set(id as KioskModel, await loadGltf(path));
  })).then(() => undefined);
  return ready;
}

/** Orient before measuring, then put the model's bottom centre at the mount point. */
export function fitProp(root: THREE.Object3D, size: number | Triple, rotation: Triple = [0, 0, 0]): THREE.Group {
  const rotated = new THREE.Group();
  rotated.rotation.set(...rotation);
  rotated.add(root);
  const box = posedBounds(rotated);
  const result = new THREE.Group();
  if (!isFiniteBox(box)) return result;
  const extent = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const mount = new THREE.Group();
  rotated.position.set(-centre.x, -box.min.y, -centre.z);
  if (typeof size === 'number') mount.scale.setScalar(size / Math.max(extent.x, extent.y, extent.z, 1e-6));
  else mount.scale.set(...size.map((value, i) => value / Math.max(extent.getComponent(i), 1e-6)) as [number, number, number]);
  mount.add(rotated);
  result.add(mount);
  return result;
}

export function kioskProp(id: KioskModel, size: number | Triple, rotation?: Triple, tint?: number): THREE.Group {
  const entry = models.get(id);
  if (!entry) return new THREE.Group();
  const root = clone(entry.scene);
  root.traverse(node => {
    if (node instanceof THREE.Mesh) node.geometry = node.geometry.clone();
  });
  const result = fitProp(root, size, rotation);
  toonify(result, { outline: .006 });
  if (tint !== undefined) {
    const color = new THREE.Color(tint);
    result.traverse(node => {
      if (node instanceof THREE.Mesh) for (const material of [node.material].flat()) {
        if (material instanceof THREE.MeshToonMaterial) material.color.lerp(color, .8);
      }
    });
  }
  return result;
}

export function kioskAnimation(id: KioskModel, name: RegExp): THREE.AnimationClip | undefined {
  return models.get(id)?.animations.find(clip => name.test(clip.name));
}
