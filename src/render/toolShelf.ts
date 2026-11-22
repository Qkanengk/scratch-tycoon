import * as THREE from 'three';
import { TOOLS, toolDef, type ToolId } from '../data/tools';
import { formatMoney } from '../game/format';
import type { GameState } from '../game/state';
import { repairPrice, toolIntent, toolUpgradePrice } from '../game/tools';
import { t } from '../i18n';
import { canvasTexture, image } from './assets';
import { palette } from './palette';
import { inkCard } from './shapes';
import { buildToolModel, disposeToolObject } from './toolModels';
import { kioskProp } from './kioskModels';
import { isFiniteBox, posedBounds } from './toon';

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

const SHELF_TILT: Partial<Record<ToolId, number>> = {
  card: 0,
  scraper: -Math.PI * .4,
  machine: Math.PI * .20,
  laser: 0,
};

export function positionShelfTool(model: THREE.Group, id: ToolId): void {
  model.rotation.y = id === 'laser' ? Math.PI * .42 : -.12;
  const tilt = SHELF_TILT[id];
  if (tilt === undefined) {
    model.scale.multiplyScalar(.34);
    model.position.y = id === 'coin' ? .035 : -.1;
    return;
  }
  model.rotation.z = tilt;
  const bounds = posedBounds(model);
  if (!isFiniteBox(bounds)) return;
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  // Fit the broad face between this label and the label on the row above.
  const fit = Math.min(.62 / size.x, .29 / size.y, .24 / size.z);
  model.scale.multiplyScalar(fit);
  model.position.set(0, -.005, .045).addScaledVector(centre, -fit);
}

export class ToolShelf {
  readonly group = new THREE.Group();
  private readonly slots = new Map<ToolId, { group: THREE.Group; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; model: THREE.Group; repair: THREE.Mesh; key: string }>();
  private readonly headerTexture: THREE.CanvasTexture;
  private repaired: ToolId | null = null;
  private repairedTime = 0;
  private failed: ToolId | null = null;
  private failureTime = 0;

  constructor() {
    this.group.name = 'tool-shelf';
    const shelf = kioskProp('shelf', [WIDTH, HEIGHT, .34], undefined, 0xf4af5b);
    shelf.position.z = -.16;
    this.group.add(shelf);
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
    this.headerTexture = canvasTexture(header);
    const sign = inkCard(1.57, 0.23, this.headerTexture);
    sign.position.set(0, 2.13, 0.07);
    sign.traverse(node => { node.userData.action = { kind: 'tools' }; });
    this.group.add(sign);
    for (const [i, tool] of TOOLS.entries()) {
      const slot = new THREE.Group();
      slot.position.copy(shelfSlot(i));
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 280;
      const texture = canvasTexture(canvas);
      const tag = inkCard(0.73, 0.32, texture, 0.008);
      tag.position.set(0, -0.33, 0.08);
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.77, 0.62), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.set(0, -0.08, 0.25);
      hit.userData.action = { kind: 'tool', id: tool.id };
      const repair = new THREE.Mesh(new THREE.PlaneGeometry(.72, .09), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      repair.position.set(0, -.445, .28);
      repair.userData.action = { kind: 'repair', id: tool.id };
      repair.visible = false;
      const model = new THREE.Group();
      slot.add(tag, hit, model, repair);
      this.group.add(slot);
      this.slots.set(tool.id, { group: slot, canvas, texture, model, repair, key: '' });
    }
  }

  update(state: GameState): void {
    for (const tool of TOOLS) {
      const slot = this.slots.get(tool.id)!;
      const offer = shelfOffer(state, tool.id);
      const level = state.toolLevels[tool.id];
      const failed = this.failed === tool.id;
      const durability = state.durability[tool.id];
      const key = JSON.stringify([offer, level, failed, durability, this.repaired === tool.id]);
      if (key === slot.key) continue;
      slot.key = key;
      slot.group.traverse(node => {
        if (node.userData.action?.kind === 'tool') node.userData.action = { kind: 'tool', intent: toolIntent(state, tool.id) };
      });
      for (const child of [...slot.model.children]) disposeToolObject(child);
      const model = buildToolModel(tool.id, level, !offer.owned, durability);
      positionShelfTool(model, tool.id);
      slot.model.add(model);
      const ctx = slot.canvas.getContext('2d')!;
      ctx.fillStyle = failed ? palette.red : offer.equipped ? palette.gold : palette.paper;
      ctx.fillRect(0, 0, 640, 280);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = palette.ink;
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(t(tool.name), 320, 42, 605);
      ctx.font = `700 48px ${FONT}`;
      ctx.fillText(offer.owned ? `${t('drain.durability', { value: Math.round(durability * 100) })} · Cấp ${level}` : t('tools.locked'), 320, 101, 610);
      ctx.font = `800 50px ${FONT}`;
      ctx.fillStyle = !offer.affordable && !failed ? '#9e382b' : palette.ink;
      const cost = `${formatMoney(offer.kind === 'equip' ? toolUpgradePrice(state, tool.id) : offer.price)} xu`;
      const label = offer.kind === 'equip' && level === tool.maxLevel ? t('tools.equipMax') : t(`tools.${offer.kind}`, { cost });
      ctx.fillText(failed ? t('tools.notEnough') : label, 320, 167, 610);
      slot.repair.visible = offer.owned && durability < 1;
      if (offer.owned) {
        ctx.fillStyle = '#d9c496';
        ctx.fillRect(0, 202, 640, 78);
        ctx.fillStyle = '#6b583e';
        ctx.fillRect(14, 208, 65, 65);
        ctx.drawImage(image('icons/wrench.png'), 18, 211, 57, 57);
        ctx.fillStyle = state.money < repairPrice(state, tool.id) ? '#9e382b' : '#2b1b17';
        ctx.font = `800 50px ${FONT}`;
        const repairLabel = tool.id === 'coin' ? t('drain.noWear') : t(this.repaired === tool.id ? 'drain.repaired' : 'drain.repair', { cost: formatMoney(repairPrice(state, tool.id)) });
        ctx.fillText(repairLabel, 355, 242, 530);
      }
      slot.texture.needsUpdate = true;
    }
  }

  refuse(id: ToolId): void {
    this.failed = id;
    this.failureTime = 0.65;
  }

  tick(dt: number, state: GameState): void {
    if (this.repaired) {
      this.repairedTime -= dt;
      if (this.repairedTime <= 0) { this.repaired = null; this.update(state); }
    }
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

  repairAnchor(id: ToolId): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.slots.get(id)!.group.localToWorld(new THREE.Vector3(0, -.445, .28));
  }

  repairedTool(id: ToolId): void { this.repaired = id; this.repairedTime = 1.8; }

  dispose(): void {
    this.headerTexture.dispose();
    this.slots.forEach(slot => slot.texture.dispose());
    disposeToolObject(this.group);
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [-1, 1].flatMap(x => [0, HEIGHT].map(y => this.group.localToWorld(new THREE.Vector3(x * WIDTH / 2, y, 0.3))));
  }
}
