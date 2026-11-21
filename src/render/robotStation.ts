import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { batteryCapacity, robotInterval, type AutomationAction } from '../game/automation';
import { formatCompact } from '../game/format';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { Paper } from './paper';
import { inkBox } from './shapes';
import { canvasTexture } from './assets';
import { drawFace, ticketMetrics } from './ticketFace';
import { disposeToolObject } from './toolModels';
import { INK, toonify } from './toon';
import { robotOfferLabel } from './robotOffers';

function rounded(w: number, h: number, d: number, color: number, radius = .06): THREE.Mesh {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), new THREE.MeshStandardMaterial({ color }));
  toonify(mesh, { outline: .008 });
  return mesh;
}

function ball(radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshStandardMaterial({ color }));
  toonify(mesh, { outline: .005 });
  return mesh;
}

function link(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const delta = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 10), new THREE.MeshStandardMaterial({ color }));
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  toonify(mesh, { outline: .005 });
  return mesh;
}

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

const OFFERS: AutomationAction[] = ['robot', 'speed', 'capacity', 'autoBuy', 'away', 'cap'];

export class RobotStation {
  readonly group = new THREE.Group();
  private readonly board = new THREE.Group();
  private readonly charger = new THREE.Group();
  private readonly motor = new THREE.Group();
  private readonly hiring = new THREE.Group();
  private readonly header = new Paper(1.24, .19);
  private readonly receipt = new Paper(.9, .28);
  private readonly offers = OFFERS.map(action => {
    const paper = new Paper(action === 'robot' ? .66 : .83, .25);
    paper.group.traverse(n => { n.userData.action = { kind: 'automation', action }; });
    return { action, paper };
  });
  private readonly slots = Array.from({ length: 3 }, (_, i) => {
    const group = new THREE.Group();
    const shell = [0x40a99c, 0xe9a04b, 0x779dc3][i]!;
    const body = rounded(.43, .36, .34, shell, .09);
    body.position.y = .27;
    const belly = rounded(.29, .19, .04, 0xffe0a1, .035);
    belly.position.set(0, .25, .185);
    const head = rounded(.55, .34, .36, 0xffd16b, .11);
    head.position.set(0, .62, .02);
    const visor = rounded(.42, .18, .045, 0x244c51, .055);
    visor.position.set(0, .64, .207);
    group.add(body, belly, head, visor);
    for (const x of [-.10, .10]) {
      const eye = ball(.035, 0xfff4c8);
      eye.scale.set(.85, 1.2, .35);
      eye.position.set(x, .65, .238);
      const cheek = ball(.034, 0xea8c64);
      cheek.scale.set(1, .5, .25);
      cheek.position.set(x * 1.65, .57, .213);
      const foot = rounded(.18, .09, .28, shell, .04);
      foot.position.set(x, .045, .045);
      group.add(eye, cheek, foot);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(.055, .009, 5, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffe0a1 }));
    smile.rotation.z = Math.PI;
    smile.position.set(0, .62, .239);
    group.add(smile);
    const antenna = link(new THREE.Vector3(0, .78, 0), new THREE.Vector3(.02, .88, 0), .015, 0x425e63);
    const light = ball(.046, 0x62c46c);
    light.position.set(.02, .89, 0);
    group.add(antenna, light);
    const arm = new THREE.Group();
    arm.position.set(.24, .35, .06);
    const elbow = new THREE.Vector3(.10, -.08, .14);
    const wrist = new THREE.Vector3(-.05, -.25, .38);
    arm.add(link(new THREE.Vector3(), elbow, .047, shell), link(elbow, wrist, .035, 0xffd16b));
    for (const point of [new THREE.Vector3(), elbow, wrist]) {
      const joint = ball(.061, 0xffe0a1); joint.position.copy(point); arm.add(joint);
    }
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .024, 16), new THREE.MeshStandardMaterial({ color: 0xffcc43 }));
    toonify(coin, { outline: .005 });
    coin.position.copy(wrist).add(new THREE.Vector3(-.025, -.055, .035));
    arm.add(coin);
    group.add(arm, link(new THREE.Vector3(-.24, .34, 0), new THREE.Vector3(-.25, .16, .14), .045, shell));
    const tray = rounded(.67, .045, .52, 0x397c78, .035);
    tray.position.set(0, .024, .43);
    const liner = rounded(.57, .012, .44, 0xffda91, .025);
    liner.position.set(0, .051, .43);
    group.add(tray, liner);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 384;
    const texture = canvasTexture(canvas);
    const ticket = new THREE.Mesh(new THREE.PlaneGeometry(.35, .42), new THREE.MeshBasicMaterial({ map: texture }));
    ticket.rotation.x = -Math.PI / 2;
    ticket.position.set(0, .061, .43);
    group.add(ticket);
    const gaugeBack = rounded(.29, .055, .025, 0x244c51, .012);
    gaugeBack.position.set(0, .25, .216);
    const gauge = rounded(.25, .03, .025, 0x67c46a, .008);
    gauge.position.set(0, .25, .235);
    group.add(gaugeBack, gauge);
    group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    const status = new Paper(.64, .19);
    status.group.rotation.x = -Math.PI / 3;
    status.group.position.set(0, .06, .84);
    status.group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    const payout = payoutText();
    group.add(status.group, payout.sprite);
    return { group, arm, light, gauge, ticket, canvas, texture, status, payout, payoutTime: 0, serial: 0, net: 0, key: '', progress: 0, working: false };
  });
  private key = '';

  constructor() {
    this.group.name = 'robot-station';
    this.group.position.set(1.12, 0, .35);
    const back = inkBox(1.38, 1.14, .07, 0x995a30);
    const cork = inkBox(1.26, 1.02, .025, 0xc69158, .006);
    cork.position.set(0, .06, .045);
    this.board.add(back, cork);
    for (let x = -.55; x <= .56; x += .16) for (let y = .13; y < 1; y += .13) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(.012, 8), new THREE.MeshBasicMaterial({ color: 0x785333 }));
      hole.position.set(x, y, .066); this.board.add(hole);
    }
    this.header.group.position.set(0, 1.04, .085);
    this.header.draw([{ text: t('robot.title'), size: 83 }]);
    this.board.add(this.header.group);
    const feet = inkBox(1.48, .055, .38, 0x995a30);
    feet.position.z = .04;
    this.board.add(feet);
    for (const [i, action] of (['autoBuy', 'away', 'cap'] as const).entries()) {
      const paper = this.offers.find(o => o.action === action)!.paper;
      const x = i === 1 ? .14 : -.12;
      paper.group.position.set(x, .77 - i * .28, .10);
      paper.group.rotation.z = i === 1 ? -.035 : .025;
      this.board.add(link(new THREE.Vector3(x, .92 - i * .28, .09), new THREE.Vector3(x, .99 - i * .28, .09), .012, INK), paper.group);
    }
    const dock = rounded(.83, .10, .49, 0x3d777c, .045);
    dock.position.y = .055;
    const battery = rounded(.34, .21, .20, 0x83ae68, .035);
    battery.rotation.z = -.13;
    battery.position.set(-.12, .17, 0);
    const terminal = rounded(.13, .035, .12, 0xffd16b, .01);
    terminal.position.set(-.12, .29, 0);
    const plug = rounded(.13, .09, .18, 0xffd16b, .02);
    plug.position.set(.26, .14, .03);
    const cable = new THREE.Mesh(new THREE.TorusGeometry(.17, .017, 5, 16, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: INK }));
    cable.rotation.x = -Math.PI / 2;
    cable.position.set(.20, .12, -.03);
    this.charger.add(dock, battery, terminal, plug, cable);
    this.mountTag('capacity', this.charger, new THREE.Vector3(0, .075, .39));
    const motor = rounded(.37, .24, .27, 0xd89b50, .04);
    motor.position.y = .14;
    const gear = new THREE.Mesh(new THREE.TorusGeometry(.095, .03, 6, 10), new THREE.MeshStandardMaterial({ color: 0xffd16b }));
    toonify(gear, { outline: .005 });
    gear.position.set(0, .16, .155);
    this.motor.add(motor, gear);
    this.mountTag('speed', this.motor, new THREE.Vector3(0, .065, .43));
    const tin = rounded(.36, .20, .26, 0xd36943, .035);
    tin.position.y = .11;
    const coinSlot = rounded(.19, .018, .03, INK, .006);
    coinSlot.position.set(0, .218, 0);
    this.hiring.add(tin, coinSlot);
    this.mountTag('robot', this.hiring, new THREE.Vector3(0, .065, .37));
    this.receipt.group.rotation.x = -Math.PI / 2;
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

  layout(phone: boolean): void {
    this.group.position.x = phone ? 2.05 : 1.12;
    this.group.position.z = phone ? -1.70 : .35;
    this.slots.forEach((s, i) => s.group.position.set(phone ? 0 : i * .84, 0, phone ? i * 1.30 : 0));
    this.board.position.set(phone ? .95 : 2.80, phone ? .35 : 0, phone ? -.10 : -.48);
    this.charger.position.set(phone ? .95 : 2.66, 0, phone ? 2.70 : 1.04);
    this.motor.position.set(phone ? .95 : 1.40, 0, phone ? 1.50 : 1.25);
    this.hiring.position.set(phone ? .95 : .10, 0, phone ? .30 : 1.25);
    this.receipt.group.position.set(phone ? .45 : 2.64, .015, phone ? 3.90 : 1.91);
  }

  update(state: GameState): void {
    const a = state.automation;
    const key = JSON.stringify([a, state.money, state.rentDebt, state.selected]);
    if (key === this.key) return;
    this.key = key;
    for (const { action, paper } of this.offers) {
      const level = action === 'speed' ? a.speed : action === 'capacity' ? a.capacity : action === 'cap' ? 2 + a.capLevel * 2 : a.robots.length;
      paper.draw([{ text: t(`robot.${action}`, { level }), size: 68 }, { text: robotOfferLabel(state, action), size: 65, color: '#75432c' }]);
    }
    this.slots.forEach((slot, i) => {
      const r = a.robots[i];
      slot.group.visible = !!r;
      slot.status.draw([{ text: !r ? t('robot.empty') : state.rentDebt ? t('robot.debt') : r.charging || r.charge <= 0 ? t('robot.flat') : r.tray ? t('robot.working') : t('robot.idle'), size: 68 },
        { text: r ? t('robot.battery', { value: Math.round(r.charge / batteryCapacity(state) * 100) }) : t('robot.tapBuy'), size: 65 }]);
      slot.working = !!r?.tray && r.charge > 0 && !r.charging && !state.rentDebt;
      slot.progress = r ? r.progressMs / robotInterval(state) : 0;
      slot.ticket.visible = !!r?.tray;
      slot.gauge.scale.x = Math.max(.001, r ? r.charge / batteryCapacity(state) : 0);
      const color = state.rentDebt ? 0xe2a342 : !r || r.charging || r.charge <= 0 ? 0xc34e42 : r.tray ? 0x62c46c : 0x7bbac9;
      slot.light.traverse(n => { if (n instanceof THREE.Mesh && n.material instanceof THREE.MeshToonMaterial) n.material.color.setHex(color); });
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
        ctx.fillStyle = '#a5aebf';
        for (const cell of m.layout.cells) {
          const start = Math.max(cell.y, slot.progress * m.layout.height);
          if (start >= cell.y + cell.h) continue;
          ctx.fillRect((m.window.x + cell.x * m.window.w) * 256, (m.window.y + start * m.window.w) * 256,
            cell.w * m.window.w * 256, (cell.y + cell.h - start) * m.window.w * 256);
        }
        slot.texture.needsUpdate = true;
      }
    });
    this.receipt.draw([{ text: t('robot.report', { tickets: a.report.tickets, net: formatCompact(a.report.net) }), size: 64 },
      { text: t('robot.selected', { name: t(`ticket.${state.selected}.name`) }), size: 62 }]);
  }

  tick(dt: number, time: number): void {
    this.slots.forEach((s, i) => {
      s.arm.rotation.y = s.working ? -.35 + Math.sin(time * .012 + i * 1.7) * .42 : -.7;
      s.arm.rotation.x = s.working ? Math.sin(time * .024) * .018 : -.7;
      s.payoutTime = Math.max(0, s.payoutTime - dt);
      s.payout.sprite.visible = s.payoutTime > 0;
      s.payout.sprite.position.y = 1 + (1.25 - s.payoutTime) * .18;
    });
  }

  deskPoints(): THREE.Vector3[] {
    return [.76, 4.70].flatMap(x => [-.20, 1.40].flatMap(z => [0, 1.20].map(y => new THREE.Vector3(x, y, z))));
  }

  offerAnchors(): Record<string, THREE.Vector3> {
    return Object.fromEntries(this.offers.map(({ action, paper }) => [action, paper.group.getWorldPosition(new THREE.Vector3())]));
  }

  robotAnchors(): THREE.Vector3[] {
    return this.slots.map(slot => slot.group.localToWorld(new THREE.Vector3(0, .3, .15)));
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(this.group);
    return [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => new THREE.Vector3(x < 0 ? box.min.x : box.max.x, y < 0 ? box.min.y : box.max.y, z < 0 ? box.min.z : box.max.z))));
  }

  dispose(): void {
    this.header.dispose(); this.receipt.dispose();
    this.offers.forEach(o => o.paper.dispose());
    this.slots.forEach(s => { s.status.dispose(); s.texture.dispose(); s.payout.texture.dispose(); });
    disposeToolObject(this.group);
  }
}
