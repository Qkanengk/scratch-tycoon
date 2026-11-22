import * as THREE from 'three';
import { PRESTIGE, prestigeThreshold } from '../data/prestige';
import { formatCompact } from '../game/format';
import { canPrestige } from '../game/prestige';
import type { GameState } from '../game/state';
import { t, type MessageKey } from '../i18n';
import { canvasTexture } from './assets';
import { palette } from './palette';
import { inkBox, inkCard } from './shapes';
import { toonify, toonRamp } from './toon';

const FONT = '"Baloo 2", system-ui, sans-serif';
const RED = 0x941f29;
const GOLD = 0xf7b500;

export function altarLines(state: GameState, armed: boolean): string[] {
  const tier = state.prestige.tier;
  if (armed && canPrestige(state)) return [t('altar.confirmTitle'), t('altar.confirmMoney'), t('altar.confirmTools'), t('altar.confirmLicenses'), t('altar.confirmAgain')];
  const active = t('altar.active', { percent: tier * 20, count: tier });
  if (tier >= PRESTIGE.maxTier) return [t('prestige.max'), t('altar.complete'), active, t('altar.keepPlaying')];
  return [t(`prestige.tier.${tier + 1}` as MessageKey),
    `${formatCompact(state.prestige.runEarned)} / ${formatCompact(prestigeThreshold(tier + 1))} xu`,
    t('altar.nextBonus', { percent: (tier + 1) * 20 }),
    t(`altar.curse.${tier + 1}` as MessageKey), active,
    t(canPrestige(state) ? 'altar.light' : state.licenses.includes('rong') ? 'altar.earnMore' : 'altar.needLicense')];
}

/** A wall-mounted lacquer shrine, made from the same outlined geometry as the kiosk. */
export class Altar {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture = canvasTexture(this.canvas);
  private readonly lamp = new THREE.MeshToonMaterial({ color: 0x701d2b, gradientMap: toonRamp() });
  private readonly embers = new THREE.MeshBasicMaterial({ color: 0x49352d });
  private readonly ingots: THREE.Group[] = [];
  private drawn = '';
  eligible = false;

  constructor() {
    this.group.name = 'than-tai-altar';
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
      const part = inkBox(w, h, d, color, .006);
      part.position.set(x, y, z); this.group.add(part); return part;
    };
    box(1.55, .09, .55, RED, 0, 0, .13);
    box(1.6, .025, .58, GOLD, 0, .09, .13);
    box(1.4, 1.25, .065, RED, 0, .1, -.1);
    for (const x of [-.71, .71]) {
      box(.06, 1.28, .08, GOLD, x, .09, -.055);
      box(.09, .28, .38, RED, x * .85, -.28, -.03);
    }
    box(1.64, .07, .3, RED, 0, 1.36, -.015);
    box(1.7, .025, .33, GOLD, 0, 1.43, -.015);
    const figure = new THREE.Group();
    const ellipsoid = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color }));
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); figure.add(mesh); return mesh;
    };
    // Seated robe, smiling face, mandarin hat and the gold ingot held in both hands.
    ellipsoid(0, .28, .07, .22, .23, .16, RED);
    ellipsoid(0, .48, .12, .14, .14, .12, 0xffd096);
    ellipsoid(0, .6, .09, .17, .07, .14, RED);
    ellipsoid(0, .64, .1, .055, .055, .055, GOLD);
    for (const x of [-.18, .18]) ellipsoid(x, .6, .07, .09, .035, .04, GOLD);
    for (const x of [-.045, .045]) {
      ellipsoid(x, .49, .232, .012, .009, .008, 0x2b1b17);
      ellipsoid(x * 1.6, .456, .22, .025, .016, .008, 0xe77c68);
      ellipsoid(x * 3.4, .29, .19, .06, .055, .055, 0xffd096);
    }
    ellipsoid(0, .402, .228, .065, .07, .025, 0xfdf0d1);
    ellipsoid(0, .32, .23, .12, .045, .07, GOLD);
    ellipsoid(0, .44, .244, .03, .009, .008, 0x942c2e);
    toonify(figure, { outline: .004 }); this.group.add(figure);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.085, .065, .105, 16), new THREE.MeshToonMaterial({ color: 0xdef0ec, gradientMap: toonRamp() }));
    pot.position.set(-.37, .165, .26); this.group.add(pot);
    pot.name = 'incense-offering';
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.085, .012, 6, 20), new THREE.MeshToonMaterial({ color: 0x296e8e, gradientMap: toonRamp() }));
    rim.rotation.x = Math.PI / 2; rim.position.set(-.37, .22, .26); this.group.add(rim);
    for (let i = -1; i <= 1; i++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .3, 6), new THREE.MeshToonMaterial({ color: 0xa83b2d, gradientMap: toonRamp() }));
      stick.position.set(-.37 + i * .035, .35 + (i === 0 ? .035 : 0), .26); stick.rotation.z = -i * .1;
      this.group.add(stick);
      stick.name = 'incense-offering';
      const ember = new THREE.Mesh(new THREE.SphereGeometry(.01, 6, 4), this.embers);
      ember.position.set(-.37 + i * .05, .5 + (i === 0 ? .035 : 0), .26); this.group.add(ember);
    }
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(.15, .115, .035, 20), new THREE.MeshToonMaterial({ color: 0xfdf0d1, gradientMap: toonRamp() }));
    plate.position.set(.39, .14, .24); this.group.add(plate);
    for (const [x, y, z] of [[.32, .2, .24], [.45, .2, .23], [.39, .29, .24]]) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), new THREE.MeshToonMaterial({ color: 0xf5a52b, gradientMap: toonRamp() }));
      fruit.position.set(x!, y!, z!); this.group.add(fruit);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.022, 6, 4), new THREE.MeshToonMaterial({ color: 0x3b894d, gradientMap: toonRamp() }));
      leaf.position.set(x! + .015, y! + .063, z!); leaf.scale.set(1.5, .3, 1); this.group.add(leaf);
    }
    box(.15, .05, .15, GOLD, .61, .1, .11);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 8), this.lamp);
    lamp.scale.y = 1.4; lamp.position.set(.61, .25, .11); this.group.add(lamp);
    box(.07, .025, .07, GOLD, .61, .35, .11);
    for (let i = 0; i < 5; i++) {
      const ingot = inkBox(.09, .035, .075, GOLD, .003);
      ingot.position.set((i - 2) * .13, .112, .36); this.group.add(ingot); this.ingots.push(ingot);
    }
    this.canvas.width = 1200; this.canvas.height = 560;
    const tablet = inkCard(1.32, .616, this.texture, .014);
    tablet.position.set(0, 1.01, -.047); this.group.add(tablet);
    this.group.traverse(node => { if ((node as THREE.Mesh).isMesh) node.userData.action = { kind: 'altar' }; });
    for (const part of [pot, tablet.getObjectByName('front')!]) part.userData.action = { kind: 'altar', offer: true };
    this.group.traverse(node => { if (node.name === 'incense-offering') node.userData.action = { kind: 'altar', offer: true }; });
  }

  update(state: GameState, armed: boolean): void {
    this.eligible = canPrestige(state);
    this.lamp.color.set(this.eligible ? 0xff4b32 : 0x701d2b);
    this.lamp.emissive.set(this.eligible ? 0xff3216 : 0x000000);
    this.lamp.emissiveIntensity = .55;
    this.embers.color.set(this.eligible ? 0xffb048 : 0x49352d);
    this.ingots.forEach((ingot, i) => { ingot.visible = i < state.prestige.tier; });
    const lines = altarLines(state, armed);
    const share = Math.min(1, state.prestige.runEarned / prestigeThreshold(state.prestige.tier + 1));
    const key = JSON.stringify([lines, Math.floor(share * 300), this.eligible]);
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#61222b'; ctx.fillRect(0, 0, 1200, 560);
    ctx.strokeStyle = palette.gold; ctx.lineWidth = 6; ctx.strokeRect(14, 14, 1172, 532);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 || i === 2 ? palette.gold : palette.cream;
      ctx.font = `${i === 0 ? 800 : 700} ${i === 0 ? 77 : i === 4 ? 42 : 48}px ${FONT}`;
      const y = [68, 160, 290, 356, 422, 492][i]!;
      ctx.fillText(line, 600, y, 1110);
    });
    if (!armed && state.prestige.tier < PRESTIGE.maxTier) {
      ctx.fillStyle = '#341c24'; ctx.fillRect(65, 212, 1070, 16);
      ctx.fillStyle = this.eligible ? palette.gold : palette.green; ctx.fillRect(65, 212, 1070 * share, 16);
    }
    this.texture.needsUpdate = true;
  }

  smokePoint(): THREE.Vector3 { return this.group.localToWorld(new THREE.Vector3(-.37, .55, .26)); }
  anchor(): THREE.Vector3 { return this.group.localToWorld(new THREE.Vector3(0, 1.01, .02)); }
  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [-.88, .88].flatMap(x => [-.28, 1.48].flatMap(y => [-.13, .43].map(z => this.group.localToWorld(new THREE.Vector3(x, y, z)))));
  }
  dispose(): void {
    this.texture.dispose();
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
    this.group.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const material of [node.material].flat()) materials.add(material); } });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  }
}
