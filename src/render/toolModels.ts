import * as THREE from 'three';
import type { ToolId } from '../data/tools';
import { kioskProp } from './kioskModels';

const TOOLS = {
  coin: { rotation: [0, 0, 0], preview: 0xffcc42 },
  key: { rotation: [Math.PI / 2, 0, Math.PI], preview: 0xffc851 },
  card: { rotation: [0, 0, 0], preview: 0x57cdeb },
  scraper: { rotation: [Math.PI / 2, Math.PI / 2, 0], preview: 0xff806a },
  machine: { rotation: [0, 0, Math.PI], preview: 0x82d99d },
  laser: { rotation: [0, 0, Math.PI / 2], preview: 0xc09aef },
} as const;

/** Models face +z, with the scratching tip at the origin and handles pointing up. */
export function buildToolModel(id: ToolId, level = 0, silhouette = false, durability = 1): THREE.Group {
  const tool = new THREE.Group();
  tool.name = `tool-${id}`;
  const model = kioskProp(id, .8, TOOLS[id].rotation);
  if (id === 'coin') model.position.y = -.4;
  if (id === 'machine') {
    const roller = model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('Lathe.1'));
    if (roller instanceof THREE.Mesh) {
      const pivot = new THREE.Group();
      const centre = new THREE.Box3().setFromObject(roller).getCenter(new THREE.Vector3());
      const parent = roller.parent!;
      parent.updateWorldMatrix(true, false);
      pivot.position.copy(parent.worldToLocal(centre));
      pivot.name = 'scratch-roller';
      parent.add(pivot);
      pivot.attach(roller);
    }
  }
  styleTool(model, silhouette ? TOOLS[id].preview : undefined, durability, level);
  tool.add(model);
  tool.scale.setScalar(1 + level * .012);
  return tool;
}

function styleTool(model: THREE.Object3D, previewColor: number | undefined, durability: number, level: number): void {
  const preview = previewColor === undefined ? undefined : new THREE.Color(previewColor);
  const wear = new THREE.Color(0x756553);
  const polish = new THREE.Color(0xffca55);
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of [node.material].flat()) {
      if (!(material instanceof THREE.MeshToonMaterial)) continue;
      if (preview) {
        material.color.lerp(preview, .8);
        material.map = null;
      } else material.color.lerp(polish, Math.min(level, 10) * .025).lerp(wear, (1 - durability) * .72);
    }
  });
}

export function animateToolModel(root: THREE.Object3D, dt: number, scratching: boolean): void {
  const roller = root.getObjectByName('scratch-roller');
  if (roller && scratching) roller.rotation.x = (roller.rotation.x + dt * 22) % (Math.PI * 2);
}

export function disposeToolObject(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    node.geometry.dispose();
    for (const material of [node.material].flat()) material.dispose();
  });
  skeletons.forEach(skeleton => skeleton.dispose());
  root.removeFromParent();
}
