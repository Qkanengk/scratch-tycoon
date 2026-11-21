import * as THREE from 'three';
import { TICKETS, type TicketId } from '../data/tickets';
import { formatMoney } from '../game/format';
import type { GameState } from '../game/state';
import { unlockProgress } from '../game/unlocks';
import { t } from '../i18n';
import { canvasTexture, image, rasterize } from './assets';
import { palette } from './palette';
import { inkBox, inkCard } from './shapes';

const W = 0.72;
const H = 0.9;
const PX = 720;
const FONT = '"Baloo 2", system-ui, sans-serif';
const money = (value: number) => `${formatMoney(value)} xu`;

interface Row {
  label: string;
  done: boolean;
  share: number;
}

/** The licence board beside the rack: what the next ticket type still needs, drawn on a clipboard. */
export class LicenseBoard {
  readonly group = new THREE.Group();
  /** The ticket type the board is about, or null once everything is unlocked. */
  next: TicketId | null = null;
  private readonly canvas = document.createElement('canvas');
  private readonly texture = canvasTexture(this.canvas);
  private drawn = '';

  constructor() {
    this.canvas.width = PX;
    this.canvas.height = Math.round((PX * H) / W);
    const card = inkCard(W, H, this.texture, 0.02);
    card.position.y = H / 2 + 0.05;
    (card.getObjectByName('front') as THREE.Mesh).userData.action = { kind: 'board' };
    const lean = new THREE.Group();
    lean.add(card);
    lean.rotation.x = -0.22;
    lean.position.z = 0.1;
    const foot = inkBox(W * 0.8, 0.06, 0.3, 0x9c5a2a);
    this.group.add(foot, lean);
  }

  update(state: GameState): void {
    const def = TICKETS.find((ticket) => !unlockProgress(state, ticket.id).unlocked);
    this.next = def?.id ?? null;
    const unlock = def?.unlock;
    if (!def || !unlock) {
      this.draw('done', t('board.title'), [], t('board.allDone'), false, null);
      return;
    }
    const progress = unlockProgress(state, def.id);
    const stats = state.stats[unlock.mission.ticket];
    const previous = t(`ticket.${unlock.mission.ticket}.name`);
    const scratched = Math.min(stats.scratched, unlock.mission.scratched);
    const jackpots = Math.min(stats.jackpots, unlock.mission.jackpots);
    const rows: Row[] = [
      {
        label: t('shop.req.revenue', { current: money(Math.min(state.totalEarned, unlock.totalEarned)), target: money(unlock.totalEarned) }),
        done: progress.revenueDone,
        share: state.totalEarned / unlock.totalEarned,
      },
      {
        label: t('shop.req.scratched', { current: scratched, target: unlock.mission.scratched, name: previous }),
        done: progress.scratchedDone,
        share: scratched / unlock.mission.scratched,
      },
      {
        label: t('shop.req.jackpot', { current: jackpots, target: unlock.mission.jackpots, name: previous }),
        done: progress.jackpotDone,
        share: jackpots / unlock.mission.jackpots,
      },
      { label: t('shop.req.license', { cost: money(unlock.licenseCost) }), done: progress.affordable, share: state.money / unlock.licenseCost },
    ];
    const key = JSON.stringify([def.id, rows, progress.canBuyLicense]);
    this.draw(key, t('board.for', { name: t(`ticket.${def.id}.name`) }), rows, t('shop.buyLicense', { cost: money(unlock.licenseCost) }), progress.canBuyLicense, def.id);
  }

  private draw(key: string, title: string, rows: Row[], footer: string, ready: boolean, id: TicketId | null): void {
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, w, h);
    // Header band in the paper of the ticket the licence is for.
    ctx.fillStyle = id ? ctx.createPattern(rasterize(`patterns/paper-${id}.svg`, 180), 'repeat')! : palette.gold;
    ctx.fillRect(0, 0, w, 170);
    ctx.fillStyle = palette.ink;
    ctx.fillRect(0, 170, w, 9);
    const plate = (x: number, y: number, pw: number, ph: number, fill: string, r = 26) => {
      ctx.beginPath();
      ctx.roundRect(x, y, pw, ph, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = palette.ink;
      ctx.stroke();
    };
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    plate(40, 34, w - 80, 102, palette.cream);
    ctx.fillStyle = palette.ink;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(title, w / 2, 90);

    const top = 220;
    const step = (h - top - 190) / Math.max(rows.length, 1);
    rows.forEach((row, i) => {
      const y = top + i * step;
      plate(44, y + 6, 64, 64, row.done ? palette.green : '#ffffff', 16);
      if (row.done) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(58, y + 40);
        ctx.lineTo(72, y + 54);
        ctx.lineTo(95, y + 24);
        ctx.stroke();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.ink;
      ctx.font = `700 37px ${FONT}`;
      ctx.fillText(row.label, 128, y + 26, w - 170);
      plate(128, y + 54, w - 172, 24, '#ffffff', 12);
      const share = Math.max(0, Math.min(1, row.share));
      if (share > 0) {
        ctx.beginPath();
        ctx.roundRect(132, y + 58, Math.max(16, (w - 180) * share), 16, 8);
        ctx.fillStyle = palette.green;
        ctx.fill();
      }
    });
    if (rows.length === 0) ctx.drawImage(image('stickers/star-coin.png'), w / 2 - 150, h / 2 - 190, 300, 300);

    plate(44, h - 150, w - 88, 104, ready ? palette.gold : '#e3d3b3');
    ctx.textAlign = 'center';
    ctx.fillStyle = ready || rows.length === 0 ? palette.ink : '#8a7560';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(footer, w / 2, h - 95, w - 120);
    this.texture.needsUpdate = true;
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [[-W / 2, 0], [W / 2, 0], [-W / 2, H + 0.1], [W / 2, H + 0.1]].map(([x, y]) => this.group.localToWorld(new THREE.Vector3(x, y, 0.1)));
  }
}
