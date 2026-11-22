import * as THREE from 'three';
import { PRESTIGE, prestigeThreshold } from '../data/prestige';
import { formatCompact } from '../game/format';
import { canPrestige } from '../game/prestige';
import type { GameState } from '../game/state';
import { t, type MessageKey } from '../i18n';
import { ALTAR_ART, canvasTexture, image } from './assets';
import { palette } from './palette';
import { inkCard } from './shapes';
import { kioskProp } from './kioskModels';
import { disposeToolObject } from './toolModels';

const FONT = '"Baloo 2", system-ui, sans-serif';

export function altarLines(state: GameState, armed: boolean): string[] {
  const tier = state.prestige.tier;
  if (armed && canPrestige(state)) return [t('altar.confirmTitle'), t('altar.confirmMoney'), t('altar.confirmTools'), t('altar.confirmLicenses'), t('altar.confirmJournal'), t('altar.confirmAgain')];
  const active = t('altar.active', { percent: tier * 20, count: tier });
  if (tier >= PRESTIGE.maxTier) return [t('prestige.max'), t('altar.complete'), active, t('altar.keepPlaying')];
  return [t(`prestige.tier.${tier + 1}` as MessageKey),
    `${formatCompact(state.prestige.runEarned)} / ${formatCompact(prestigeThreshold(tier + 1))} xu`,
    t('altar.nextBonus', { percent: (tier + 1) * 20 }),
    t(`altar.curse.${tier + 1}` as MessageKey), active,
    t(canPrestige(state) ? 'altar.light' : state.licenses.includes('rong') ? 'altar.earnMore' : 'altar.needLicense')];
}

function framedIcon(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 440; canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffe4a0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image(ALTAR_ART), 34, 54, 372, 372);
  return canvasTexture(canvas);
}

/** A wall-mounted shrine with a framed icon and sourced offerings. */
export class Altar {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture = canvasTexture(this.canvas);
  private readonly imageTexture = framedIcon();
  private readonly lanternMaterials = new Set<THREE.MeshToonMaterial>();
  private readonly ingots: THREE.Group[] = [];
  private drawn = '';
  eligible = false;

  constructor() {
    this.group.name = 'than-tai-altar';
    const shelf = kioskProp('altar', [1.55, .24, .52]);
    shelf.traverse(node => {
      if (node instanceof THREE.Mesh) for (const material of [node.material].flat()) {
        if (material instanceof THREE.MeshToonMaterial) {
          material.map = null;
          material.color.setHex(0xf64843);
        }
      }
    });
    shelf.position.set(0, -.11, .09);
    const print = inkCard(.49, .53, this.imageTexture);
    print.position.set(0, .41, .04);
    const candles = kioskProp('candle', .29);
    candles.position.set(-.44, .13, .22);
    const fruit = kioskProp('fruit', .18);
    fruit.position.set(.33, .13, .24);
    const lantern = kioskProp('lantern', .31);
    lantern.position.set(.59, .13, .16);
    lantern.traverse(node => {
      if (node instanceof THREE.Mesh) for (const material of [node.material].flat()) {
        if (material instanceof THREE.MeshToonMaterial) this.lanternMaterials.add(material);
      }
    });
    this.group.add(shelf, print, candles, fruit, lantern);
    for (let i = 0; i < 5; i++) {
      const ingot = kioskProp('ingots', .10);
      ingot.position.set((i - 2) * .13, .13, .28);
      this.group.add(ingot);
      this.ingots.push(ingot);
    }
    this.canvas.width = 1200; this.canvas.height = 560;
    const tablet = inkCard(1.32, .616, this.texture, .014);
    tablet.position.set(0, 1.01, -.047); this.group.add(tablet);
    this.group.traverse(node => { if ((node as THREE.Mesh).isMesh) node.userData.action = { kind: 'altar' }; });
    candles.traverse(node => { node.userData.action = { kind: 'altar', offer: true }; });
    tablet.getObjectByName('front')!.userData.action = { kind: 'altar', offer: true };
  }

  update(state: GameState, armed: boolean): void {
    this.eligible = canPrestige(state);
    for (const material of this.lanternMaterials) {
      material.emissive.setHex(this.eligible ? 0xff6b21 : 0x000000);
      material.emissiveIntensity = .35;
    }
    this.ingots.forEach((ingot, i) => { ingot.visible = i < state.prestige.tier; });
    const lines = altarLines(state, armed);
    const share = Math.min(1, state.prestige.runEarned / prestigeThreshold(state.prestige.tier + 1));
    const key = JSON.stringify([lines, Math.floor(share * 300), this.eligible]);
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = palette.card; ctx.fillRect(0, 0, 1200, 560);
    ctx.strokeStyle = palette.red; ctx.lineWidth = 8; ctx.strokeRect(14, 14, 1172, 532);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 || i === 2 ? '#9f252e' : palette.ink;
      ctx.font = `${i === 0 ? 800 : 700} ${i === 0 ? 77 : i === 4 ? 42 : 48}px ${FONT}`;
      const y = [68, 160, 290, 356, 422, 492][i]!;
      ctx.fillText(line, 600, y, 1110);
    });
    if (!armed && state.prestige.tier < PRESTIGE.maxTier) {
      ctx.fillStyle = '#d3a37b'; ctx.fillRect(65, 212, 1070, 16);
      ctx.fillStyle = this.eligible ? palette.gold : palette.green; ctx.fillRect(65, 212, 1070 * share, 16);
    }
    this.texture.needsUpdate = true;
  }

  smokePoint(): THREE.Vector3 { return this.group.localToWorld(new THREE.Vector3(-.44, .42, .22)); }
  anchor(): THREE.Vector3 { return this.group.localToWorld(new THREE.Vector3(0, 1.01, .02)); }
  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [-.88, .88].flatMap(x => [-.28, 1.48].flatMap(y => [-.13, .43].map(z => this.group.localToWorld(new THREE.Vector3(x, y, z)))));
  }
  dispose(): void {
    this.texture.dispose();
    this.imageTexture.dispose();
    disposeToolObject(this.group);
  }
}
