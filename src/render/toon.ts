import * as THREE from 'three';

export const INK = 0x2b1b17;

let ramp: THREE.DataTexture | null = null;

/** Three hard light bands: this is what gives the flat cel look instead of a smooth falloff. */
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

interface ColorSource {
  color?: THREE.Color;
  map?: THREE.Texture | null;
}

function toToon(source: THREE.Material): THREE.MeshToonMaterial {
  const { color, map } = source as ColorSource;
  const toon = new THREE.MeshToonMaterial({ gradientMap: toonRamp(), map: map ?? null });
  if (color) {
    toon.color.copy(color);
    // The source packs are tuned for PBR lighting and read muddy under flat bands, so lift them.
    const hsl = { h: 0, s: 0, l: 0 };
    toon.color.getHSL(hsl);
    if (!map) toon.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.15), Math.min(0.92, hsl.l * 1.35 + 0.04));
  }
  toon.name = source.name;
  return toon;
}

/** Copy of the geometry whose normals are averaged per position, so the outline hull has no gaps at hard edges. */
function smoothNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geometry.clone();
  const pos = out.getAttribute('position');
  const src = geometry.getAttribute('normal');
  if (!src) {
    out.computeVertexNormals();
    return out;
  }
  const sums = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    keys.push(key);
    n.fromBufferAttribute(src, i);
    const sum = sums.get(key);
    if (sum) sum.add(n);
    else sums.set(key, n.clone());
  }
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    n.copy(sums.get(keys[i] ?? '') ?? n.set(0, 1, 0)).normalize();
    normals.set([n.x, n.y, n.z], i * 3);
  }
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return out;
}

function outlineMaterial(width: { value: number }): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = width;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;')
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position) + normalize(normal) * outlineWidth;',
      );
  };
  return material;
}

export interface ToonOptions {
  /** Outline thickness in world units; 0 turns the outline off. */
  outline?: number;
}

/**
 * Restyle a loaded model in place: every mesh gets a cel-shaded material and an ink outline
 * (an inside-out, slightly inflated copy of itself drawn behind it).
 */
export function toonify(root: THREE.Object3D, { outline = 0.02 }: ToonOptions = {}): void {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  const scale = new THREE.Vector3();
  for (const mesh of meshes) {
    if (!mesh.geometry.hasAttribute('normal')) mesh.geometry.computeVertexNormals();
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(mesh.material);
    if (outline <= 0) continue;
    mesh.getWorldScale(scale);
    const width = { value: outline / Math.max(scale.x, scale.y, scale.z) };
    const geometry = smoothNormals(mesh.geometry);
    geometry.clearGroups();
    let hull: THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      const copy = new THREE.SkinnedMesh(geometry, outlineMaterial(width));
      copy.bind(skinned.skeleton, skinned.bindMatrix);
      hull = copy;
    } else {
      hull = new THREE.Mesh(geometry, outlineMaterial(width));
    }
    hull.name = 'outline';
    hull.frustumCulled = false;
    mesh.add(hull);
  }
}

/** Bounds of a model in its current pose; empty-safe for rigs whose pose is broken. */
export function posedBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, false);
  root.updateMatrixWorld(true);
  // Skinned models only report their posed size once the bone matrices are current.
  root.traverse((node) => (node as THREE.SkinnedMesh).skeleton?.update());
  return new THREE.Box3().setFromObject(root, true);
}

export function isFiniteBox(box: THREE.Box3): boolean {
  return [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite);
}

/** Swap every skinned mesh for a static one in its bind pose (for rigs whose skeleton data is broken). */
export function unskin(root: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(node as THREE.SkinnedMesh);
  });
  for (const mesh of skinned) {
    const still = new THREE.Mesh(mesh.geometry, mesh.material);
    still.name = mesh.name;
    still.position.copy(mesh.position);
    still.quaternion.copy(mesh.quaternion);
    still.scale.copy(mesh.scale);
    mesh.parent?.add(still);
    mesh.removeFromParent();
  }
}

/** Scale and recentre a model so its largest side is `size` and it sits on y = 0. */
export function fitToSize(root: THREE.Object3D, size = 1): THREE.Group {
  const holder = new THREE.Group();
  holder.add(root);
  const box = posedBounds(root);
  const dims = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const s = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
  root.scale.multiplyScalar(s);
  root.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z)).multiplyScalar(s);
  return holder;
}
