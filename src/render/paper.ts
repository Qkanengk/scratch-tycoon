import * as THREE from 'three';
import { rentAmount, timeToNextRent } from '../game/economy';
import { formatCompact } from '../game/format';
import type { GameState, Ticket } from '../game/state';
import { t } from '../i18n';
import { canvasTexture, image, patternPath } from './assets';
import { inkCard } from './shapes';
import { disposeToolObject } from './toolModels';

const FONT = '"Baloo 2", system-ui, sans-serif';

export class Paper {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  readonly group: THREE.Group;

  constructor(width: number, height: number) {
    this.canvas.width = 1000;
    this.canvas.height = Math.round(1000 * height / width);
    this.texture = canvasTexture(this.canvas);
    this.group = inkCard(width, height, this.texture, .008);
  }

  draw(lines: { text: string; color?: string; size?: number }[]): void {
    const ctx = this.canvas.getContext('2d')!;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#fff1cc';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = .24;
    ctx.drawImage(image(patternPath('paper')), 0, 0, width, height);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color ?? '#2b1b17';
      ctx.font = `800 ${line.size ?? 61}px ${FONT}`;
      ctx.fillText(line.text, width / 2, height * (i + .65) / lines.length, width - 55);
    });
    this.texture.needsUpdate = true;
  }

  dispose(): void { this.texture.dispose(); disposeToolObject(this.group); }
}

export function rentLines(state: GameState, paid: boolean) {
  const seconds = Math.ceil(timeToNextRent(state) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return [
    { text: t('drain.rent'), size: 67 },
    { text: `${formatCompact(rentAmount(state))} xu  ·  ${time}`, size: 81 },
    { text: state.rentDebt ? t('drain.debt', { cost: formatCompact(state.rentDebt) }) : t(paid ? 'drain.paid' : 'drain.activeTime'), color: state.rentDebt ? '#bb3026' : '#34704d', size: 56 },
  ];
}

export function receiptLines(ticket: Ticket, debt: number) {
  const exact = (amount: number) => Math.floor(amount).toLocaleString('vi-VN');
  const withheld = Math.min(debt, ticket.net);
  return [
    { text: t(ticket.fakeTell ? 'drain.fake' : 'drain.receipt'), color: ticket.fakeTell ? '#bb3026' : '#2b1b17', size: 73 },
    { text: t('drain.gross', { cost: exact(ticket.gross) }) },
    { text: t('drain.tax', { cost: exact(ticket.tax) }), color: '#bb3026' },
    { text: t('drain.net', { cost: exact(ticket.net) }), size: 70 },
    { text: withheld ? t('drain.withheld', { cost: exact(withheld) }) : t('drain.collect'), color: '#736047', size: 55 },
    ...(withheld ? [{ text: t('drain.wallet', { cost: exact(ticket.net - withheld) }), size: 70 }] : []),
  ];
}
