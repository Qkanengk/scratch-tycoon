import * as THREE from 'three';
import { automationPrice, batteryCapacity, robotInterval, type AutomationAction } from '../game/automation';
import { formatCompact } from '../game/format';
import type { GameState } from '../game/state';
import { t } from '../i18n';
import { Paper } from './paper';
import { inkBox } from './shapes';
import { canvasTexture } from './assets';
import { drawFace, ticketMetrics } from './ticketFace';
import { disposeToolObject } from './toolModels';
import { toonify } from './toon';

const OFFERS: AutomationAction[] = ['robot', 'speed', 'capacity', 'autoBuy', 'away', 'cap'];

export class RobotStation {
  readonly group = new THREE.Group();
  private readonly header = new Paper(2.05, .24);
  private readonly receipt = new Paper(2.05, .24);
  private readonly offers = OFFERS.map((action, i) => {
    const paper = new Paper(.98, .30);
    paper.group.position.set(i % 2 ? .53 : -.53, 1.17 - Math.floor(i / 2) * .35, .12);
    paper.group.traverse(n => { n.userData.action = { kind: 'automation', action }; });
    return { action, paper };
  });
  private readonly slots = Array.from({ length: 3 }, (_, i) => {
    const group = new THREE.Group();
    group.position.set((i - 1) * .69, 2, .13);
    const body = inkBox(.32, .27, .23, [0x36a7a1, 0xe47b3a, 0x7996ce][i]!);
    const head = inkBox(.39, .20, .25, 0xffd35e);
    head.position.y = .31;
    const visor = inkBox(.31, .095, .02, 0x243e46, .004);
    visor.position.set(0, .36, .135);
    group.add(body, head, visor);
    for (const x of [-.075, .075]) {
      const eye = inkBox(.045, .04, .012, 0xfff1cc, .002);
      eye.position.set(x, .39, .153);
      group.add(eye);
      const foot = inkBox(.12, .055, .21, 0x394e5b, .005);
      foot.position.set(x, -.055, .025);
      group.add(foot);
    }
    const antenna = inkBox(.025, .11, .025, 0x394e5b, .003);
    antenna.position.set(0, .51, 0);
    const light = inkBox(.07, .055, .06, 0x62c46c, .004);
    light.position.set(0, .61, 0);
    group.add(antenna, light);
    const arm = new THREE.Group();
    arm.position.set(.14, .12, .03);
    const bar = inkBox(.065, .065, .32, 0x536b77, .005);
    bar.position.set(0, -.06, .13);
    bar.rotation.x = .35;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .025, 12), new THREE.MeshStandardMaterial({ color: 0xffcc43 }));
    toonify(coin, { outline: .004 });
    coin.position.set(0, -.14, .30);
    arm.add(bar, coin);
    group.add(arm);
    const tray = inkBox(.59, .035, .40, 0x385e63, .008);
    tray.position.set(0, -.065, .29);
    group.add(tray);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 384;
    const texture = canvasTexture(canvas);
    const ticket = new THREE.Mesh(new THREE.PlaneGeometry(.29, .34), new THREE.MeshBasicMaterial({ map: texture }));
    ticket.rotation.x = -Math.PI / 2;
    ticket.position.set(0, -.026, .30);
    group.add(ticket);
    const gaugeBack = inkBox(.31, .042, .02, 0x243e46, .003);
    gaugeBack.position.set(0, .09, .13);
    const gauge = inkBox(.29, .027, .025, 0x67c46a, .002);
    gauge.position.set(0, .097, .15);
    group.add(gaugeBack, gauge);
    group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    const status = new Paper(.63, .20);
    status.group.position.set((i - 1) * .69, 1.75, .58);
    status.group.traverse(n => { n.userData.action = { kind: 'automation', action: 'context', index: i }; });
    return { group, arm, light, gauge, ticket, canvas, texture, status, key: '', progress: 0, working: false };
  });
  private key = '';
  private floatingTime = 0;
  private readonly floating = new Paper(.8, .20);
  private lastTickets = 0;

  constructor() {
    this.group.name = 'robot-station';
    this.group.position.set(1.45, 0, .35);
    this.group.scale.setScalar(.55);
    const back = inkBox(2.22, 3.05, .08, 0x995a30);
    const inset = inkBox(2.08, 2.90, .03, 0x397b82, .008);
    inset.position.set(0, .07, .065);
    const ledge = inkBox(2.2, .07, .72, 0xe3ad65);
    ledge.position.set(0, 1.90, .25);
    this.header.group.position.set(0, 2.85, .13);
    this.header.draw([{ text: t('robot.title'), size: 80 }]);
    this.receipt.group.position.set(0, .12, .13);
    this.floating.group.position.set(0, 2.55, .5);
    this.floating.group.visible = false;
    this.group.add(back, inset, ledge, this.header.group, this.receipt.group, this.floating.group,
      ...this.offers.map(o => o.paper.group), ...this.slots.flatMap(s => [s.group, s.status.group]));
    this.group.traverse(n => { if (!n.userData.action) n.userData.action = { kind: 'robots' }; });
  }

  update(state: GameState): void {
    const a = state.automation;
    const key = JSON.stringify([a, state.money, state.rentDebt, state.selected]);
    if (key === this.key) return;
    this.key = key;
    for (const { action, paper } of this.offers) {
      const price = automationPrice(state, action);
      const level = action === 'speed' ? a.speed : action === 'capacity' ? a.capacity : action === 'cap' ? 2 + a.capLevel * 2 : a.robots.length;
      paper.draw([{ text: t(`robot.${action}`, { level }), size: 70 },
        { text: Number.isFinite(price) ? t('robot.price', { cost: formatCompact(price) }) : t('robot.done'), size: 68, color: state.money < price ? '#9e382b' : '#34704d' }]);
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
      slot.light.traverse(n => { if (n instanceof THREE.Mesh && n.material instanceof THREE.MeshStandardMaterial) n.material.color.setHex(color); });
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
    if (a.report.tickets > this.lastTickets) {
      this.floatingTime = 1.6;
      this.floating.draw([{ text: t('robot.payout', { cost: formatCompact(a.report.net - (this.lastTickets ? this.lastNet : 0)) }), size: 70 }]);
    }
    this.lastTickets = a.report.tickets;
    this.lastNet = a.report.net;
  }

  private lastNet = 0;

  tick(dt: number, time: number): void {
    this.slots.forEach(s => {
      s.arm.rotation.y = s.working ? -.45 + Math.sin(time * .012) * .45 : -.4;
      s.arm.rotation.x = s.working ? Math.sin(time * .024) * .015 : -.8;
    });
    this.floatingTime = Math.max(0, this.floatingTime - dt);
    this.floating.group.visible = this.floatingTime > 0;
    this.floating.group.position.y = 2.55 + (1.6 - this.floatingTime) * .12;
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, false);
    return [-1.16, 1.16].flatMap(x => [0, 3.07].map(y => this.group.localToWorld(new THREE.Vector3(x, y, .65))));
  }

  dispose(): void {
    this.header.dispose(); this.receipt.dispose(); this.floating.dispose();
    this.offers.forEach(o => o.paper.dispose());
    this.slots.forEach(s => { s.status.dispose(); s.texture.dispose(); });
    disposeToolObject(this.group);
  }
}
