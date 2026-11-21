import { ticketDef, TICKETS, type TicketDef, type TicketId } from '../data/tickets';
import { formatCompact } from '../game/format';
import type { Rect, ScratchMask } from '../game/scratch';
import type { Cell, Ticket } from '../game/state';
import { t } from '../i18n';
import { image, rasterize } from './assets';
import { layoutTicket, type TicketLayout } from './layout';
import { palette } from './palette';

/** A ticket's printed side, in units of the ticket's width. */
export interface TicketMetrics {
  height: number;
  /** The scratch area. Layout units inside it are `window.w` ticket units each. */
  window: Rect;
  layout: TicketLayout;
}

const MARGIN = 0.055;
const HEADER = 0.2;
const FOOTER = 0.125;
const FONT = '"Baloo 2", system-ui, sans-serif';

export function ticketMetrics(id: TicketId): TicketMetrics {
  const layout = layoutTicket(ticketDef(id).rules);
  const w = 1 - 2 * MARGIN;
  const window = { x: MARGIN, y: MARGIN + HEADER, w, h: layout.height * w };
  return { height: window.y + window.h + FOOTER + MARGIN, window, layout };
}

/** Every character a ticket face can print, so the font is loaded before the first ticket is painted. */
export function faceText(): string {
  const words = TICKETS.flatMap((def) => [t(`ticket.${def.id}.name`), t(`ticket.${def.id}.short`)]);
  const labels = (['winning', 'yours', 'multiplier'] as const).map((key) => t(`ticket.label.${key}`).toUpperCase());
  return [...words, ...labels, t('ticket.topPrize'), t('ticket.blank'), t('ticket.free'), t('ticket.serial', { serial: '' }), '0123456789 ×·?,KTrỷxu'].join('');
}

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function plate(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasPattern, line: number): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
}

function text(ctx: Ctx, value: string, x: number, y: number, size: number, color: string = palette.ink, weight = 800): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function sticker(ctx: Ctx, name: string, x: number, y: number, size: number): void {
  ctx.drawImage(image(`stickers/${name}.png`), x - size / 2, y - size / 2, size, size);
}

function pattern(ctx: Ctx, name: string, tile: number): CanvasPattern {
  return ctx.createPattern(rasterize(`patterns/${name}.svg`, Math.round(tile)), 'repeat')!;
}

function isWinningCell(cell: Cell, cells: readonly Cell[]): boolean {
  if (cell.type === 'winning') {
    return cells.some((other) => other.type === 'number' && other.win && other.number === cell.number);
  }
  return 'win' in cell && cell.win;
}

function drawCell(ctx: Ctx, def: TicketDef, cell: Cell, r: Rect, lit: boolean): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const base = cell.type === 'winning' ? palette.card : palette.cream;
  plate(ctx, r.x, r.y, r.w, r.h, r.h * 0.16, lit ? '#ffffff' : base, 6);
  if (lit) {
    // A winning cell gets a green ring inside its ink line.
    const inset = 8;
    roundRect(ctx, r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, r.h * 0.16 - inset * 0.6);
    ctx.lineWidth = 10;
    ctx.strokeStyle = palette.green;
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const prize = (units: number) => formatCompact(units * def.price);
  switch (cell.type) {
    case 'symbol': {
      const rules = def.rules;
      const name = rules.kind === 'match' ? rules.symbols[cell.symbol] : undefined;
      if (name) sticker(ctx, name, cx, cy, Math.min(r.w, r.h) * 0.8);
      break;
    }
    case 'winning':
      text(ctx, String(cell.number).padStart(2, '0'), cx, cy + r.h * 0.04, r.h * 0.62, palette.red);
      break;
    case 'number':
      text(ctx, String(cell.number).padStart(2, '0'), cx, cy - r.h * 0.13, r.h * 0.5);
      text(ctx, prize(cell.prize), cx, cy + r.h * 0.28, r.h * 0.25, lit ? palette.ink : '#8a5a2b', 700);
      break;
    case 'multiplier':
      text(ctx, `×${cell.value}`, cx, cy + r.h * 0.05, r.h * 0.72, palette.red);
      break;
    case 'dragon':
      sticker(ctx, 'dragon-evolved', cx, cy - r.h * 0.1, r.h * 0.68);
      text(ctx, prize(cell.prize), cx, cy + r.h * 0.34, r.h * 0.22, lit ? palette.ink : '#8a5a2b', 700);
      break;
    case 'bomb':
      sticker(ctx, 'bomb', cx, cy, r.h * 0.74);
      break;
    case 'blank':
      ctx.fillStyle = '#ead9b0';
      ctx.beginPath();
      ctx.arc(cx, cy, r.h * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/**
 * Paints the printed side of a ticket. Without a ticket it paints the blank of that type
 * (what the empty table offers); `lit` marks the winning cells once the ticket is scratched.
 */
export function drawFace(canvas: HTMLCanvasElement, id: TicketId, ticket: Ticket | null, lit: boolean): void {
  const def = ticketDef(id);
  const m = ticketMetrics(id);
  const S = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = pattern(ctx, `paper-${id}`, S * 0.26);
  ctx.fillRect(0, 0, S, canvas.height);

  // Header: name plate on the left, top prize on the right.
  const name = t(`ticket.${id}.name`);
  const top = MARGIN * S;
  const plateH = (HEADER - 0.045) * S;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `800 ${plateH * 0.62}px ${FONT}`;
  const nameW = ctx.measureText(name).width + plateH * 0.7;
  plate(ctx, MARGIN * S, top, nameW, plateH, plateH * 0.3, palette.cream, 7);
  text(ctx, name, MARGIN * S + nameW / 2, top + plateH * 0.55, plateH * 0.62);

  const jackpot = (def.prizes[def.prizes.length - 1]?.multiplier ?? 0) * def.price;
  const prizeW = S * (1 - 2 * MARGIN) - nameW - S * 0.03;
  const prizeX = S * (1 - MARGIN) - prizeW;
  plate(ctx, prizeX, top, prizeW, plateH, plateH * 0.3, palette.gold, 7);
  text(ctx, t('ticket.topPrize'), prizeX + prizeW / 2, top + plateH * 0.3, plateH * 0.25, palette.ink, 700);
  text(ctx, `${formatCompact(jackpot)} xu`, prizeX + prizeW / 2, top + plateH * 0.68, plateH * 0.42);

  // Scratch window.
  const w = m.window;
  plate(ctx, w.x * S, w.y * S, w.w * S, w.h * S, S * 0.035, palette.paper, 7);
  const unit = w.w * S;
  const place = (r: Rect): Rect => ({ x: w.x * S + r.x * unit, y: w.y * S + r.y * unit, w: r.w * unit, h: r.h * unit });
  for (const label of m.layout.labels) {
    const r = place({ x: 0, y: label.y, w: 1, h: label.h });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    text(ctx, t(`ticket.label.${label.key}`).toUpperCase(), r.x + r.w / 2, r.y + r.h * 0.55, r.h * 0.62, '#8a5a2b');
  }
  m.layout.cells.forEach((rect, i) => {
    const cell = ticket?.cells[i];
    const r = place(rect);
    if (cell) drawCell(ctx, def, cell, r, lit && isWinningCell(cell, ticket.cells));
    else plate(ctx, r.x, r.y, r.w, r.h, r.h * 0.16, palette.cream, 6);
  });

  // Footer: the rule in one line, then serial and price.
  const footY = (w.y + w.h) * S;
  const footH = FOOTER * S;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const band = footH * 0.86;
  plate(ctx, MARGIN * S, footY + footH * 0.16, S * (1 - 2 * MARGIN), band, band * 0.3, palette.cream, 6);
  text(ctx, t(`ticket.${id}.short`), S / 2, footY + footH * 0.16 + band * 0.34, band * 0.33);
  const serial = ticket ? t('ticket.serial', { serial: String(ticket.serial).padStart(6, '0') }) : t('ticket.blank');
  const price = ticket?.free ? t('ticket.free') : `${formatCompact(def.price)} xu`;
  text(ctx, `${serial}  ·  ${price}`, S / 2, footY + footH * 0.16 + band * 0.72, band * 0.26, '#8a5a2b', 700);
}

/** Paints one foil patch per cell on a canvas that covers the scratch window; scratching erases it. */
export function drawFoil(canvas: HTMLCanvasElement, id: TicketId): void {
  const m = ticketMetrics(id);
  const unit = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const foil = pattern(ctx, 'foil', unit * 0.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of m.layout.cells) {
    const grow = 0.006;
    const x = (r.x - grow) * unit;
    const y = (r.y - grow) * unit;
    const w = (r.w + 2 * grow) * unit;
    const h = (r.h + 2 * grow) * unit;
    plate(ctx, x, y, w, h, r.h * unit * 0.16, foil, 6);
    text(ctx, '?', x + w / 2, y + h * 0.56, h * 0.6, '#8d94a6');
  }
}

/** Rubs the foil off along a stroke given in layout units. */
export function eraseFoil(canvas: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number, radius: number): void {
  const unit = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineWidth = radius * 2 * unit;
  ctx.beginPath();
  ctx.moveTo(x0 * unit, y0 * unit);
  ctx.lineTo(x1 * unit + 0.01, y1 * unit + 0.01);
  ctx.stroke();
}

export function restoreFoil(canvas: HTMLCanvasElement, mask: ScratchMask): void {
  const ctx = canvas.getContext('2d')!;
  const size = canvas.width / mask.cols;
  for (let i = 0; i < mask.points.length; i++) {
    if (mask.points[i] === 2) ctx.clearRect((i % mask.cols) * size, Math.floor(i / mask.cols) * size, size, size);
  }
}
