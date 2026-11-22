import { TICKETS } from '../data/tickets';
import { ASSETS, PARTICLES, PATTERNS, particlePath, patternPath } from '../render/assets';
import { ticketSample } from '../render/ticketFace';
import { palette } from '../render/palette';

/** The 2D half of the asset board: stickers, ticket papers, particles, icons, sounds and the brand mark. */

const STICKERS = [
  'cherries', 'lemon', 'bell', 'jewel', 'crown', 'gourd', 'crab', 'fish-a', 'chicken-a', 'stag', 'star',
  'dragon-evolved', 'bomb', 'coin-gold', 'coins', 'star-coin', 'gold-bag', 'gold-ingots', 'chest', 'lock',
  'ticket-machine', 'cash-register', 'prize-wheel', 'gambling-machine', 'gacha-machine', 'spaceship',
];
const ICONS = [
  'pause', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'locked', 'unlocked', 'shopping-cart', 'trophy', 'medal-1', 'star', 'target', 'wrench', 'gear', 'save', 'import',
  'export', 'trashcan', 'audio-on', 'audio-off', 'music-on', 'music-off', 'checkmark', 'cross', 'plus', 'minus',
  'question', 'information', 'warning', 'home', 'fast-forward',
];
const SOUNDS = [
  'scratch-1', 'scratch-2', 'scratch-3', 'scratch-4', 'scratch-5', 'ticket-buy', 'ticket-deal', 'ticket-collect',
  'reveal', 'coin-1', 'coin-2', 'coin-3', 'coins-many', 'win-small', 'win-big', 'win-jackpot', 'lose', 'unlock',
  'promo', 'ui-click', 'ui-select', 'ui-error',
];

const ink = palette.ink;
const frame = `border:3px solid ${ink};border-radius:16px;box-shadow:0 5px 0 ${ink}`;

function el(tag: string, css: string, html = ''): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  node.innerHTML = html;
  return node;
}

function section(root: HTMLElement, title: string, note: string): HTMLElement {
  root.appendChild(el('h2', 'margin:34px 18px 0;font-size:26px;line-height:1.1', title));
  root.appendChild(el('p', 'margin:2px 18px 0;font-size:14px;opacity:.7', note));
  const grid = el('div', 'display:flex;flex-wrap:wrap;gap:14px;padding:14px 18px 0;align-items:flex-start');
  root.appendChild(grid);
  return grid;
}

function tile(label: string, inner: string, size: number, background: string = palette.card): HTMLElement {
  return el(
    'div',
    `width:${size}px;${frame};background:${background};text-align:center;font-size:12px;line-height:1.1;padding:8px 4px 6px;box-sizing:border-box`,
    `${inner}<div style="margin-top:4px;font-weight:700">${label}</div>`,
  );
}

export function buildBoard(root: HTMLElement): void {
  const tickets = section(root, 'Vé mẫu', 'Giấy vé, ô cào, biểu tượng và lớp phủ bạc ghép lại như trong game.');
  for (const { id } of TICKETS) {
    const sample = ticketSample(id, 300);
    sample.style.cssText = `${frame};height:auto;max-width:100%`;
    tickets.appendChild(sample);
  }

  const stickers = section(root, 'Sticker', 'Hình từ các gói tài nguyên và ảnh dựng lại từ các mô hình CC0.');
  for (const name of STICKERS) {
    stickers.appendChild(tile(name, `<img src="${ASSETS}/stickers/${name}.png" width="96" height="96" alt="">`, 120));
  }

  const patterns = section(root, 'Giấy vé, lớp phủ, mặt bàn', 'Hoa văn và bề mặt từ Kenney và OzMaister.');
  for (const name of PATTERNS) {
    patterns.appendChild(
      tile(name, `<div style="height:150px;border:3px solid ${ink};border-radius:10px;background:url(${ASSETS}/${patternPath(name)}) 0 0/120px"></div>`, 250),
    );
  }

  const particles = section(root, 'Hiệu ứng', 'Mảnh bạc khi cào, sao và xu khi thắng, pháo giấy khi trúng lớn.');
  for (const name of PARTICLES) {
    particles.appendChild(tile(name, `<img src="${ASSETS}/${particlePath(name)}" width="64" height="64" alt="">`, 104, palette.wood));
  }

  const icons = section(root, 'Icon giao diện', 'Icon trắng, tô màu bằng CSS khi dùng.');
  for (const name of ICONS) {
    icons.appendChild(tile(name, `<img src="${ASSETS}/icons/${name}.png" width="48" height="48" alt="">`, 104, palette.blue));
  }

  const sounds = section(root, 'Âm thanh', 'Bấm để nghe.');
  for (const name of SOUNDS) {
    const button = el(
      'button',
      `${frame};background:${palette.gold};font:700 15px 'Baloo 2',sans-serif;color:${ink};padding:6px 14px;cursor:pointer`,
      name,
    );
    button.addEventListener('click', () => void new Audio(`${ASSETS}/audio/${name}.mp3`).play());
    sounds.appendChild(button);
  }

  const brand = section(root, 'Biểu trưng', 'Đồng xu từ Kenney.');
  brand.appendChild(tile('coin', `<img src="${ASSETS}/brand/coin.png" width="96" height="96" alt="">`, 120));
  root.appendChild(el('p', 'margin:18px', `<a href="${ASSETS}/credits/credits.html" target="_blank" rel="noreferrer">Nguồn tài nguyên</a>`));
  root.appendChild(el('div', 'height:40px'));
}
