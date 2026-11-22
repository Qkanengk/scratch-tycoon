import * as THREE from 'three';
import { TICKETS, type TicketDef, type TicketId } from '../data/tickets';
import { formatCompact } from '../game/format';
import type { GameState } from '../game/state';
import { unlockProgress } from '../game/unlocks';
import { t } from '../i18n';
import { canvasTexture, rasterize } from './assets';
import { palette } from './palette';
import { inkCard } from './shapes';
import { kioskProp } from './kioskModels';
import { ticketMetrics, ticketSample } from './ticketFace';
import { restockCountdown } from '../game/stock';

const CARD_W = 0.38;
const SPACING = 0.5;
const STAND_H = 0.17;
const TAG_W = 0.44;
const TAG_H = 0.20;
const LEAN = -0.2;
const FONT = '"Baloo 2", system-ui, sans-serif';

interface Slot {
  def: TicketDef;
  group: THREE.Group;
  front: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  lock: THREE.Mesh;
  tag: HTMLCanvasElement;
  tagTexture: THREE.CanvasTexture;
  drawn: string;
  height: number;
}

function drawTag(canvas: HTMLCanvasElement, def: TicketDef, unlocked: boolean, affordable: boolean, stock: string): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(5, 5, w - 10, h - 10, 22);
  ctx.fillStyle = unlocked ? palette.cream : '#e3d3b3';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.font = `800 ${h * 0.27}px ${FONT}`;
  ctx.fillText(t(`ticket.${def.id}.name`), w / 2, h * 0.23);
  ctx.font = `800 ${h * 0.24}px ${FONT}`;
  ctx.fillStyle = !unlocked ? '#8a5a2b' : affordable ? '#1f8a4c' : palette.red;
  ctx.fillText(unlocked ? `${formatCompact(def.price)} xu` : t('rack.locked'), w / 2, h * 0.52);
  if (unlocked) ctx.fillText(stock, w / 2, h * 0.80);
}

/** The ticket rack at the back of the desk: one card per ticket type, clicked to buy. */
export class Rack {
  readonly group = new THREE.Group();
  private readonly slots = new Map<TicketId, Slot>();
  private readonly stands = new THREE.Group();
  private rows: TicketId[][] = [];
  private tall: boolean | null = null;
  private prestige = false;

  constructor() {
    this.group.add(this.stands);
    const lockTexture = canvasTexture(rasterize('stickers/lock.png', 256));
    for (const def of TICKETS) {
      const height = ticketMetrics(def.id).height * CARD_W;
      const card = inkCard(CARD_W, height, canvasTexture(ticketSample(def.id, 384)));
      card.position.y = height / 2;
      const front = card.getObjectByName('front') as Slot['front'];
      const lock = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshBasicMaterial({ map: lockTexture, transparent: true }));
      lock.position.set(0, height / 2, 0.02);
      const lean = new THREE.Group();
      lean.add(card, lock);
      lean.rotation.x = LEAN;
      lean.position.y = STAND_H;
      const tag = document.createElement('canvas');
      tag.width = 352;
      tag.height = 160;
      const tagTexture = canvasTexture(tag);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(TAG_W, TAG_H), new THREE.MeshBasicMaterial({ map: tagTexture, transparent: true }));
      plate.position.set(0, STAND_H / 2, 0.171);
      const group = new THREE.Group();
      group.add(lean, plate);
      for (const part of [front, lock, plate]) part.userData.action = { kind: 'ticket', id: def.id };
      this.group.add(group);
      this.slots.set(def.id, { def, group, front, lock, tag, tagTexture, drawn: '', height });
    }
    this.layout(false);
  }

  /** One row of five in a wide window; three in front and two on a step behind in a tall one. */
  layout(tall: boolean): void {
    if (this.tall === tall) return;
    this.tall = tall;
    const ids = TICKETS.filter(def => !def.minimumPrestige || this.prestige).map((def) => def.id);
    for (const slot of this.slots.values()) slot.group.visible = ids.includes(slot.def.id);
    this.rows = tall ? [ids.slice(0, 3), ids.slice(3)] : [ids];
    this.stands.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of [mesh.material].flat()) material.dispose();
    });
    this.stands.clear();
    this.rows.forEach((row, r) => {
      const y = r * 0.62;
      const z = -r * 0.34;
      if (!row.length) return;
      const stand = kioskProp('counter', [row.length * SPACING + 0.08, STAND_H + y, 0.32]);
      stand.position.set(0, 0, z);
      this.stands.add(stand);
      row.forEach((id, i) => {
        this.slots.get(id)?.group.position.set((i - (row.length - 1) / 2) * SPACING, y, z);
      });
    });
  }

  update(state: GameState): void {
    if (this.prestige !== (state.prestige.tier >= 1)) {
      this.prestige = state.prestige.tier >= 1;
      const tall = this.tall ?? false;
      this.tall = null;
      this.layout(tall);
    }
    for (const slot of this.slots.values()) {
      const unlocked = unlockProgress(state, slot.def.id).unlocked;
      const affordable = state.money >= slot.def.price;
      const entry = state.stock[slot.def.id];
      const stock = entry.remaining > 0 ? t('stock.remaining', { count: entry.remaining }) : t('stock.empty', { time: restockCountdown(entry.remainingMs) });
      const key = `${unlocked}:${affordable}:${stock}`;
      if (slot.drawn === key) continue;
      slot.drawn = key;
      drawTag(slot.tag, slot.def, unlocked, affordable, stock);
      slot.tagTexture.needsUpdate = true;
      slot.lock.visible = !unlocked;
      slot.front.material.color.set(unlocked ? 0xffffff : 0xb8b2ac);
    }
  }

  /** Nudges the card under the pointer forward. */
  hover(id: TicketId | null): void {
    for (const slot of this.slots.values()) slot.group.scale.setScalar(slot.def.id === id ? 1.06 : 1);
  }

  /** Where a ticket of this type leaves the rack, in world space. */
  anchor(id: TicketId): THREE.Vector3 {
    const slot = this.slots.get(id);
    if (!slot) return new THREE.Vector3();
    return slot.group.localToWorld(new THREE.Vector3(0, STAND_H + slot.height / 2, 0.05));
  }

  /** Corner points the camera has to keep in view. */
  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    const points: THREE.Vector3[] = [];
    for (const slot of this.slots.values()) {
      if (!slot.group.visible) continue;
      for (const [x, y] of [[-SPACING / 2, 0], [SPACING / 2, 0], [-SPACING / 2, STAND_H + slot.height], [SPACING / 2, STAND_H + slot.height]] as const) {
        points.push(slot.group.localToWorld(new THREE.Vector3(x, y, 0.17)));
      }
    }
    return points;
  }
}
