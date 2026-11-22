import * as THREE from 'three';
import { batteryCapacity, robotInterval, type AutomationAction } from '../game/automation';
import { formatCompact } from '../game/format';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { Paper } from './paper';
import { canvasTexture, image, patternPath } from './assets';
import { drawFace, ticketMetrics } from './ticketFace';
import { disposeToolObject } from './toolModels';
import { kioskAnimation, kioskProp } from './kioskModels';
import { robotOfferLabel } from './robotOffers';
import { awaySummaryText } from '../ui/awaySummary';
function payoutText() {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 160;
  const texture = canvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(.75, .19, 1);
  sprite.renderOrder = 12;
  sprite.visible = false;
  return { canvas, texture, sprite };
}

const OFFERS = ['robot', 'speed', 'capacity', 'autoBuy', 'away', 'cap'] as const satisfies readonly AutomationAction[];

export class RobotStation {
  readonly group = new THREE.Group();
  private readonly board = new THREE.Group();
  private readonly charger = new THREE.Group();
  private readonly motor = new THREE.Group();
  private readonly hiring = new THREE.Group();
  private readonly header = new Paper(1.24, .19);
  private readonly receipt = new Paper(.9, .28);
  private readonly awayReceipt = new Paper(1.8, 1.05);
  private readonly offers = OFFERS.map(action => {
    const paper = new Paper(action === 'robot' ? .66 : .83, .25);
    paper.group.traverse(n => { n.userData.action = { kind: 'automation', action }; });
    return { action, paper };
  });
  private readonly slots = Array.from({ length: 3 }, (_, i) => {
    const group = new THREE.Group();
    const modelId = (['robot', 'robot2', 'robot3'] as const)[i]!;
    const model = kioskProp(modelId, i === 0 ? .83 : .67);
    const mixer = new THREE.AnimationMixer(model);
    const idle = kioskAnimation(modelId, /idle$/i);
    const work = kioskAnimation(modelId, /(?:punch|attack)$/i);
    const idleAction = idle && mixer.clipAction(idle);
    const workAction = work && mixer.clipAction(work);
    const tray = kioskProp('noticeboard', [.67, .045, .52]);
    tray.position.set(0, 0, .43);
    group.add(model, tray);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 384;
    const texture = canvasTexture(canvas);
    const ticket = new THREE.Mesh(new THREE.PlaneGeometry(.35, .42), new THREE.MeshBasicMaterial({ map: texture }));
    ticket.rotation.x = -Math.PI / 2;
    ticket.position.set(0, .061, .43);
    group.add(ticket);
    group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    const status = new Paper(.64, .19);
    status.group.rotation.x = -Math.PI / 3;
    status.group.position.set(0, .06, .84);
    status.group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    const payout = payoutText();
    group.add(status.group, payout.sprite);
    return { group, model, mixer, idleAction, workAction, activeAction: undefined as THREE.AnimationAction | undefined,
      ticket, canvas, texture, status, payout, payoutTime: 0, serial: 0, net: 0, key: '', progress: 0, working: false };
  });
  private key = '';
  private portraitOffers = false;

  constructor() {
    this.group.name = 'robot-station';
    this.group.position.set(1.12, 0, .35);
    const board = kioskProp('noticeboard', [1.38, 1.14, .087], [Math.PI / 2, 0, 0]);
    this.board.add(board);
    this.header.group.position.set(0, 1.04, .085);
    this.header.draw([{ text: t('robot.title'), size: 83 }]);
    this.board.add(this.header.group);
    for (const [i, action] of (['autoBuy', 'away', 'cap'] as const).entries()) {
      const paper = this.offers.find(o => o.action === action)!.paper;
      paper.group.position.set(i === 1 ? .14 : -.12, .77 - i * .28, .10);
      paper.group.rotation.z = i === 1 ? -.035 : .025;
      this.board.add(paper.group);
    }
    this.charger.add(kioskProp('battery', .43));
    this.mountTag('capacity', this.charger, new THREE.Vector3(0, .075, .39));
    this.motor.add(kioskProp('power', .39));
    this.mountTag('speed', this.motor, new THREE.Vector3(0, .065, .43));
    this.hiring.add(kioskProp('register', .40));
    this.mountTag('robot', this.hiring, new THREE.Vector3(0, .065, .37));
    this.receipt.group.rotation.x = -Math.PI / 2;
    this.awayReceipt.group.rotation.x = -Math.PI / 3;
    this.awayReceipt.group.traverse(n => { n.userData.action = { kind: 'automation', action: 'dismissAway' }; });
    this.group.add(this.awayReceipt.group);
    this.group.add(this.board, this.charger, this.motor, this.hiring, this.receipt.group, ...this.slots.map(s => s.group));
    this.group.traverse(n => { if (!n.userData.action) n.userData.action = { kind: 'robots' }; });
    this.layout(false);
  }

  private mountTag(action: AutomationAction, parent: THREE.Group, position: THREE.Vector3): void {
    const paper = this.offers.find(o => o.action === action)!.paper;
    paper.group.position.copy(position);
    paper.group.rotation.x = -Math.PI / 3;
    parent.add(paper.group);
  }

  layout(phone: boolean, focused = false): void {
    this.portraitOffers = phone && focused;
    const column = this.portraitOffers ? 1.35 : .95;
    this.group.position.x = phone ? 2.05 : 1.12;
    this.group.position.z = phone ? this.portraitOffers ? -.40 : -1.70 : .35;
    this.slots.forEach((s, i) => s.group.position.set(phone ? 0 : i * .84, 0, phone ? i * 1.50 : 0));
    this.board.position.set(phone ? column : 2.80, phone ? .35 : 0, phone ? -.10 : -.48);
    this.board.rotation.x = this.portraitOffers ? -Math.PI / 4 : 0;
    this.board.scale.set(this.portraitOffers ? 1.4 : 1, this.portraitOffers ? 1.35 : 1, 1);
    this.charger.position.set(phone ? column : 2.66, 0, phone ? 2.70 : 1.04);
    this.motor.position.set(phone ? column : 1.40, 0, phone ? 1.50 : focused ? 1.90 : 1.25);
    this.hiring.position.set(phone ? column : .10, 0, phone ? .30 : focused ? 1.90 : 1.25);
    for (const { action, paper } of this.offers) {
      if (action !== 'robot' && action !== 'speed' && action !== 'capacity') continue;
      paper.group.scale.set(this.portraitOffers ? 1.4 : 1, this.portraitOffers ? 1.5 : 1, 1);
      paper.group.position.y = this.portraitOffers ? .11 : action === 'capacity' ? .075 : .065;
    }
    this.receipt.group.position.set(phone ? 1.25 : 2.64, .015, phone ? 3.65 : 1.91);
    this.awayReceipt.group.position.set(phone ? .45 : 1.25, .32, phone ? 3.25 : 1.45);
  }

  update(state: GameState): void {
    const a = state.automation;
    const key = JSON.stringify([a, state.money, state.rentDebt, state.selected, this.portraitOffers]);
    if (key === this.key) return;
    this.key = key;
    for (const { action, paper } of this.offers) {
      const level = action === 'speed' ? a.speed : action === 'capacity' ? a.capacity : action === 'cap' ? 2 + a.capLevel * 2 : a.robots.length;
      paper.draw([{ text: t(`robot.${action}`, { level }), size: this.portraitOffers ? 110 : 68 },
        { text: robotOfferLabel(state, action), size: this.portraitOffers ? 100 : 65, color: '#75432c' }]);
    }
    this.slots.forEach((slot, i) => {
      const r = a.robots[i];
      slot.group.visible = !!r;
      slot.status.draw([{ text: !r ? t('robot.empty') : state.rentDebt ? t('robot.debt') : r.charging || r.charge <= 0 ? t('robot.flat') : r.tray ? t('robot.working') : t('robot.idle'), size: 68 },
        { text: r ? t('robot.battery', { value: Math.round(r.charge / batteryCapacity(state) * 100) }) : t('robot.tapBuy'), size: 65 }]);
      slot.working = !!r?.tray && r.charge > 0 && !r.charging && !state.rentDebt;
      slot.progress = r ? r.progressMs / robotInterval(state) : 0;
      slot.ticket.visible = !!r?.tray;
      if (slot.serial && slot.serial !== r?.tray?.serial && slot.net > 0 && a.report.tickets > 0) {
        const ctx = slot.payout.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 640, 160);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 100px "Baloo 2", system-ui, sans-serif';
        ctx.lineWidth = 12; ctx.strokeStyle = '#2b1b17'; ctx.fillStyle = '#ffdf6c';
        const label = t('robot.payout', { cost: formatCompact(slot.net) });
        ctx.strokeText(label, 320, 80); ctx.fillText(label, 320, 80);
        slot.payout.texture.needsUpdate = true;
        slot.payoutTime = 1.25;
      }
      slot.serial = r?.tray?.serial ?? 0;
      slot.net = r?.tray?.net ?? 0;
      const ticketKey = `${r?.tray?.serial}:${Math.floor(slot.progress * 24)}`;
      if (r?.tray && ticketKey !== slot.key) {
        slot.key = ticketKey;
        const m = ticketMetrics(r.tray.type);
        slot.canvas.height = Math.round(256 * m.height);
        drawFace(slot.canvas, r.tray.type, r.tray, true);
        const ctx = slot.canvas.getContext('2d')!;
        ctx.fillStyle = ctx.createPattern(image(patternPath('foil')), 'repeat')!;
        for (const cell of m.layout.cells) {
          const start = Math.max(cell.y, slot.progress * m.layout.height);
          if (start >= cell.y + cell.h) continue;
          ctx.fillRect((m.window.x + cell.x * m.window.w) * 256, (m.window.y + start * m.window.w) * 256,
            cell.w * m.window.w * 256, (cell.y + cell.h - start) * m.window.w * 256);
        }
        slot.texture.needsUpdate = true;
      }
    });
    this.receipt.draw([{ text: t('robot.report', { tickets: a.report.tickets, net: formatCompact(a.report.net) }), size: 57 },
      { text: t('robot.reportCosts'), size: 55 },
      { text: t('robot.selected', { name: t(`ticket.${state.selected}.name`) }), size: 62 }]);
    this.awayReceipt.group.visible = !!a.awaySummary;
    if (a.awaySummary) {
      const text = awaySummaryText(a.awaySummary);
      this.awayReceipt.draw([{ text: t('robot.awayTitle'), size: 66 }, { text: text.time }, { text: text.tickets },
        { text: text.credited, size: 63, color: '#34704d' }, { text: text.limits, size: 57 }, { text: t('robot.awayDismiss'), size: 54 }]);
    }
  }

  tick(dt: number, time: number): void {
    this.slots.forEach((s, i) => {
      if (!s.group.visible) return;
      const action = s.working ? s.workAction ?? s.idleAction : s.idleAction;
      if (action !== s.activeAction) {
        s.activeAction?.stop();
        action?.reset().play();
        s.activeAction = action;
      }
      s.mixer.update(dt);
      s.model.rotation.y = s.working ? Math.sin(time * .012 + i * 1.7) * .13 : 0;
      s.payoutTime = Math.max(0, s.payoutTime - dt);
      s.payout.sprite.visible = s.payoutTime > 0;
      s.payout.sprite.position.y = 1 + (1.25 - s.payoutTime) * .18;
    });
  }

  deskPoints(): THREE.Vector3[] {
    return [.76, 4.70].flatMap(x => [-.20, 1.40].flatMap(z => [0, 1.20].map(y => new THREE.Vector3(x, y, z))));
  }

  offerAnchors(): Record<string, THREE.Vector3> {
    return Object.fromEntries([...this.offers.map(({ action, paper }) => [action, paper.group.getWorldPosition(new THREE.Vector3())]), ['dismissAway', this.awayReceipt.group.getWorldPosition(new THREE.Vector3())]]);
  }

  robotAnchors(): THREE.Vector3[] {
    return this.slots.map(slot => slot.group.localToWorld(new THREE.Vector3(0, .3, .15)));
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    const points: THREE.Vector3[] = [];
    this.group.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox!;
      if (box.isEmpty()) return;
      points.push(...[-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => new THREE.Vector3(
        x < 0 ? box.min.x : box.max.x,
        y < 0 ? box.min.y : box.max.y,
        z < 0 ? box.min.z : box.max.z,
      ).applyMatrix4(object.matrixWorld)))));
    });
    return points;
  }

  dispose(): void {
    this.header.dispose(); this.receipt.dispose(); this.awayReceipt.dispose();
    this.offers.forEach(o => o.paper.dispose());
    this.slots.forEach(s => {
      s.mixer.stopAllAction();
      s.mixer.uncacheRoot(s.model);
      s.status.dispose(); s.texture.dispose(); s.payout.texture.dispose(); s.payout.sprite.material.dispose();
    });
    disposeToolObject(this.group);
  }
}
