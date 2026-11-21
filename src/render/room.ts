import * as THREE from 'three';
import { t } from '../i18n';
import { canvasTexture, image, loadModel, patternTexture } from './assets';
import { palette } from './palette';
import { flat, inkBox, inkCard, roundedRect } from './shapes';
import { fitToSize, toonify } from './toon';

export const WALL_Z = -1.95;
const FONT = '"Baloo 2", system-ui, sans-serif';

function wallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f7a8c';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#37879a';
  ctx.fillRect(0, 0, 128, 256);
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 1);
  return texture;
}

function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette.red;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.drawImage(image('stickers/star-coin.png'), 28, 38, 180, 180);
  ctx.drawImage(image('stickers/star-coin.png'), 816, 38, 180, 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 118px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = palette.ink;
  ctx.strokeText(t('room.sign'), 512, 138);
  ctx.fillStyle = palette.gold;
  ctx.fillText(t('room.sign'), 512, 138);
  return canvasTexture(canvas);
}

/** The lottery kiosk around the player: desk, back wall, shop sign and a shelf of prizes. */
export function buildRoom(): THREE.Group {
  const room = new THREE.Group();
  const desk = flat(roundedRect(12, 6, 0.1), new THREE.MeshBasicMaterial({ map: patternTexture('table-wood', 1.5) }), 0);
  desk.position.z = -0.6;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshBasicMaterial({ map: wallTexture() }));
  wall.position.set(0, 2.5, WALL_Z);
  const skirting = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), new THREE.MeshBasicMaterial({ color: 0x1f5564 }));
  skirting.position.set(0, 0.25, WALL_Z + 0.004);
  const rail = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.035), new THREE.MeshBasicMaterial({ color: palette.ink }));
  rail.position.set(0, 0.5, WALL_Z + 0.006);
  const sign = inkCard(2.2, 0.55, signTexture(), 0.03);
  sign.name = 'shop-sign';
  sign.position.set(0, 1.8, WALL_Z + 0.03);
  // The prize shelf is its own group so a tall window can lift it out of the rack's way.
  const shelf = new THREE.Group();
  shelf.name = 'shelf';
  const plank = inkBox(4.6, 0.07, 0.42, 0x9c5a2a);
  plank.position.set(0, 0.95, WALL_Z + 0.21);
  shelf.add(plank);
  room.add(desk, wall, skirting, rail, sign, shelf);

  const stand = async (file: string, size: number, x: number, y: number, z: number, turn: number, parent: THREE.Group = room) => {
    const model = fitToSize(await loadModel(file), size);
    model.name = file.split('/').pop()!.replace('.glb', '');
    toonify(model, { outline: 0.011 });
    model.position.set(x, y, z);
    model.rotation.y = turn;
    if (window.innerWidth > 700) layoutCounterProp(model, true);
    parent.add(model);
  };
  const shelfY = 1.02;
  const shelfZ = WALL_Z + 0.22;
  // A missing model only costs decoration, so the desk stays playable without it.
  void Promise.allSettled([
    stand('kenney-mini-arcade/prize-wheel.glb', 0.5, -1.75, shelfY, shelfZ, 0.2, shelf),
    stand('kenney-mini-shop/gacha-machine.glb', 0.46, -0.95, shelfY, shelfZ, 0.15, shelf),
    stand('kenney-platformer-kit/chest.glb', 0.36, 0.95, shelfY, shelfZ, -0.2, shelf),
    stand('kenney-mini-arcade/gambling-machine.glb', 0.5, 1.75, shelfY, shelfZ, -0.2, shelf),
    stand('quaternius/gold-ingots.glb', 0.3, 0.3, shelfY, shelfZ, 0.3, shelf),
    stand('quaternius/star-coin.glb', 0.26, -0.3, shelfY, shelfZ, 0, shelf),
    stand('kenney-mini-arcade/cash-register.glb', 0.5, -1.15, 0, -0.3, 0.6),
    stand('kenney-mini-arcade/ticket-machine.glb', 0.6, -1.8, 0, -1.05, 0.45),
    stand('quaternius/gold-bag.glb', 0.26, -0.95, 0, 0.35, 0.3),
    stand('quaternius/coins.glb', 0.22, 0.95, 0, 0.4, -0.2),
  ]);
  return room;
}

export function layoutCounterProp(model: THREE.Object3D, desktop: boolean): void {
  const poses: Record<string, readonly [number, number, number, number, number, number]> = {
    'cash-register': [-0.77, -0.16, 0.5, -1.15, -0.3, 1],
    'gold-bag': [-0.76, 0.42, 0.7, -0.95, 0.35, 1],
    coins: [0.76, 0.36, 0.7, 0.95, 0.4, 1],
    'ticket-machine': [-1.45, -1.18, 0.7, -1.8, -1.05, 1],
  };
  const pose = poses[model.name];
  if (!pose) return;
  model.position.x = pose[desktop ? 0 : 3];
  model.position.z = pose[desktop ? 1 : 4];
  model.scale.setScalar(pose[desktop ? 2 : 5]);
}
