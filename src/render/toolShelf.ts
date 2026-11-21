import * as THREE from 'three';
import { TOOLS, toolDef, type ToolId } from '../data/tools';
import { formatMoney } from '../game/format';
import type { GameState } from '../game/state';
import { toolIntent, toolUpgradePrice } from '../game/tools';
import { t } from '../i18n';
import { canvasTexture } from './assets';
import { palette } from './palette';
import { inkBox, inkCard } from './shapes';
import { buildToolModel, disposeToolObject } from './toolModels';

const FONT = '"Baloo 2", system-ui, sans-serif';
const WIDTH = 1.75;
const HEIGHT = 2.3;

export function shelfOffer(state: GameState, id: ToolId) {
  const owned = state.ownedTools.includes(id);
  const equipped = state.equippedTool === id;
  const maxed = state.toolLevels[id] >= toolDef(id).maxLevel;
  const kind: 'buy' | 'equip' | 'max' | 'upgrade' = !owned ? 'buy' : !equipped ? 'equip' : maxed ? 'max' : 'upgrade';
  const price = kind === 'buy' ? toolDef(id).price : kind === 'upgrade' ? toolUpgradePrice(state, id) : 0;
  return { kind, price, affordable: state.money >= price, owned, equipped };
}

export function shelfSlot(index: number): THREE.Vector3 {
  return new THREE.Vector3(index % 2 ? 0.43 : -0.43, 1.78 - Math.floor(index / 2) * 0.65, 0.14);
}

export class ToolShelf {
  readonly group = new THREE.Group();
  private readonly slots = new Map<ToolId, { group: THREE.Group; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; model: THREE.Group; key: string }>();
  private failed: ToolId | null = null;
  private failureTime = 0;

  constructor() {
    this.group.name = 'tool-shelf';
    const back = inkBox(WIDTH, HEIGHT, 0.09, 0x995a30);
    back.position.z = -0.06;
    const cork = inkBox(WIDTH - 0.12, HEIGHT - 0.13, 0.025, 0xc98a4b);
    cork.position.set(0, 0.065, 0);
    this.group.add(back, cork);
    const holes = new THREE.Group();
    const geo = new THREE.CircleGeometry(0.012, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x80532e });
    for (let x = -0.74; x <= 0.75; x += 0.12) for (let y = 0.16; y < 2.2; y += 0.12) {
      const hole = new THREE.Mesh(geo, mat);
      hole.position.set(x, y, 0.028);
      holes.add(hole);
    }
    this.group.add(holes);
    const header = document.createElement('canvas');
    header.width = 1024;
    header.height = 150;
    const ctx = header.getContext('2d')!;
    ctx.fillStyle = palette.red;
    ctx.fillRect(0, 0, 1024, 150);
    ctx.fillStyle = palette.cream;
    ctx.font = `800 78px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('tools.title'), 512, 82);
    const sign = inkCard(1.57, 0.23, canvasTexture(header));
    sign.position.set(0, 2.13, 0.07);
    sign.traverse(node => { node.userData.action = { kind: 'tools' }; });
    this.group.add(sign);
    for (const [i, tool] of TOOLS.entries()) {
      const slot = new THREE.Group();
      slot.position.copy(shelfSlot(i));
      const ledge = inkBox(0.73, 0.035, 0.23, 0x8b4c28, 0.006);
      ledge.position.set(0, -0.16, -0.04);
      const hook = inkBox(0.025, 0.11, 0.13, 0xaeb4c2, 0.004);
      hook.position.set(0, 0.17, -0.06);
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 222;
      const texture = canvasTexture(canvas);
      const tag = inkCard(0.73, 0.25, texture, 0.008);
      tag.position.set(0, -0.31, 0.08);
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.77, 0.62), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(0, -0.08, 0.25);
      hit.userData.action = { kind: 'tool', id: tool.id };
      const model = new THREE.Group();
      slot.add(ledge, hook, tag, hit, model);
      this.group.add(slot);
      this.slots.set(tool.id, { group: slot, canvas, texture, model, key: '' });
    }
  }

  update(state: GameState): void {
    for (const tool of TOOLS) {
      const slot = this.slots.get(tool.id)!;
      const offer = shelfOffer(state, tool.id);
      const level = state.toolLevels[tool.id];
      const failed = this.failed === tool.id;
      const key = JSON.stringify([offer, level, failed]);
      if (key === slot.key) continue;
      slot.key = key;
      slot.group.traverse(node => {
        if (node.userData.action?.kind === 'tool') node.userData.action = { kind: 'tool', intent: toolIntent(state, tool.id) };
      });
      for (const child of [...slot.model.children]) disposeToolObject(child);
      const model = buildToolModel(tool.id, level, !offer.owned);
      model.scale.multiplyScalar(0.34);
      model.position.y = tool.id === 'coin' ? 0.035 : -0.1;
      model.rotation.y = -0.12;
      slot.model.add(model);
      if (offer.owned) for (let i = 0; i < tool.maxLevel; i++) {
        const pip = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), new THREE.MeshBasicMaterial({ color: i < level ? palette.gold : '#80532e' }));
        pip.position.set(-0.25 + i * 0.055, -0.13, 0.22);
        slot.model.add(pip);
      }
      const ctx = slot.canvas.getContext('2d')!;
      ctx.fillStyle = failed ? palette.red : offer.equipped ? palette.gold : palette.paper;
      ctx.fillRect(0, 0, 640, 222);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.ink;
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(t(tool.name), 320, 42, 605);
      ctx.font = `700 37px ${FONT}`;
      ctx.fillText(offer.owned ? t(offer.equipped ? 'tools.equipped' : 'tools.owned', { level }) : t('tools.locked'), 320, 101, 610);
      ctx.font = `800 44px ${FONT}`;
      ctx.fillStyle = !offer.affordable && !failed ? '#9e382b' : palette.ink;
      const cost = `${formatMoney(offer.kind === 'equip' ? toolUpgradePrice(state, tool.id) : offer.price)} xu`;
      const label = offer.kind === 'equip' && level === tool.maxLevel ? t('tools.equipMax') : t(`tools.${offer.kind}`, { cost });
      ctx.fillText(failed ? t('tools.notEnough') : label, 320, 167, 610);
      slot.texture.needsUpdate = true;
    }
  }

  refuse(id: ToolId): void {
    this.failed = id;
    this.failureTime = 0.65;
  }

  tick(dt: number, state: GameState): void {
    if (!this.failed) return;
    this.failureTime = Math.max(0, this.failureTime - dt);
    const slot = this.slots.get(this.failed)!;
    slot.group.rotation.z = Math.sin(this.failureTime * 55) * this.failureTime * 0.06;
    if (!this.failureTime) {
      slot.group.rotation.z = 0;
      this.failed = null;
    }
    this.update(state);
  }

  anchor(id: ToolId): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.slots.get(id)!.group.localToWorld(new THREE.Vector3(0, -0.08, 0.25));
  }

  dispose(): void {
    this.group.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if ('map' in material) (material.map as THREE.Texture | null)?.dispose();
      }
    });
    disposeToolObject(this.group);
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [-1, 1].flatMap(x => [0, HEIGHT].map(y => this.group.localToWorld(new THREE.Vector3(x * WIDTH / 2, y, 0.3))));
  }
}
