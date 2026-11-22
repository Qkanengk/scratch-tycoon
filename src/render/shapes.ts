import * as THREE from 'three';
import { INK } from './toon';

export function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** A flat shape lying on the desk; its texture coordinates are world units, so patterns tile at a fixed size. */
export function flat(shape: THREE.Shape, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8).rotateX(-Math.PI / 2), material);
  mesh.position.y = y;
  return mesh;
}

/** An upright card: a picture with an ink border behind it, facing +z, centred on its own origin. */
export function inkCard(w: number, h: number, map: THREE.Texture, border = 0.014): THREE.Group {
  const group = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * border, h + 2 * border), new THREE.MeshBasicMaterial({ color: INK }));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
  front.position.z = 0.002;
  front.name = 'front';
  group.add(back, front);
  return group;
}
