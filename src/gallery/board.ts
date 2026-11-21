import { palette } from '../render/palette';

/** The 2D half of the asset board: stickers, ticket papers, particles, icons, sounds and the brand mark. */

const ASSETS = './assets';

const STICKERS = [
  'cherries', 'lemon', 'bell', 'jewel', 'crown', 'gourd', 'crab', 'fish-a', 'chicken-a', 'stag', 'star',
  'dragon-evolved', 'bomb', 'coin-gold', 'coins', 'star-coin', 'gold-bag', 'gold-ingots', 'chest', 'lock',
  'ticket-machine', 'cash-register', 'prize-wheel', 'gambling-machine', 'gacha-machine',
];
const PARTICLES = [
  'star', 'sparkle', 'coin', 'ring', 'foil-flake-a', 'foil-flake-b', 'foil-curl', 'smoke-puff',
  'confetti-red', 'confetti-blue', 'confetti-green', 'confetti-yellow',
];
const ICONS = [
  'locked', 'unlocked', 'shopping-cart', 'trophy', 'medal-1', 'star', 'target', 'wrench', 'gear', 'save', 'import',
  'export', 'trashcan', 'audio-on', 'audio-off', 'music-on', 'music-off', 'checkmark', 'cross', 'plus', 'minus',
  'question', 'information', 'warning', 'home', 'fast-forward',
];
const SOUNDS = [
  'scratch-1', 'scratch-2', 'scratch-3', 'scratch-4', 'scratch-5', 'ticket-buy', 'ticket-deal', 'ticket-collect',
  'reveal', 'coin-1', 'coin-2', 'coin-3', 'coins-many', 'win-small', 'win-big', 'win-jackpot', 'lose', 'unlock',
  'promo', 'ui-click', 'ui-select', 'ui-error',
];

interface Mock {
  id: keyof typeof palette.ticket;
  name: string;
  cols: number;
  cells: string[];
  /** How many cells (from the end) are still under foil in the mock-up. */
  covered: number;
}

/** One mock ticket per tier: paper, window, symbols and foil put together as the game will draw them. */
const MOCKS: Mock[] = [
  { id: 'dong', name: 'Vé Đồng', cols: 3, cells: ['cherries', 'cherries', 'bell'], covered: 1 },
  { id: 'bac', name: 'Vé Bạc', cols: 3, cells: ['gourd', 'crab', 'fish-a', 'chicken-a', 'stag', 'crab'], covered: 2 },
  { id: 'vang', name: 'Vé Vàng', cols: 4, cells: ['07', '21', '15', '07', '33', '48', '02', '19'], covered: 3 },
  { id: 'ngoc', name: 'Vé Ngọc', cols: 4, cells: ['jewel', '12', '40', 'star', '27', '05', '31', 'x5'], covered: 3 },
  { id: 'rong', name: 'Vé Rồng', cols: 4, cells: ['dragon-evolved', 'bomb', 'dragon-evolved', 'coins', 'bomb', 'dragon-evolved', 'coins', 'bomb'], covered: 4 },
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

function mockTicket(mock: Mock): HTMLElement {
  const cells = mock.cells
    .map((cell, index) => {
      const covered = index >= mock.cells.length - mock.covered;
      const face = /^[a-z]/.test(cell) && cell !== 'x5'
        ? `<img src="${ASSETS}/stickers/${cell}.png" style="width:78%;height:78%;object-fit:contain" alt="">`
        : `<span style="font-size:30px;font-weight:800">${cell}</span>`;
      const foil = covered
        ? `<div style="position:absolute;inset:-3px;border:3px solid ${ink};border-radius:12px;background:url(${ASSETS}/patterns/foil.svg) 0 0/90px"></div>`
        : '';
      return `<div style="position:relative;aspect-ratio:1;border:3px solid ${ink};border-radius:12px;background:${palette.cream};display:flex;align-items:center;justify-content:center">${face}${foil}</div>`;
    })
    .join('');
  return el(
    'div',
    `width:300px;${frame};border-width:4px;background:url(${ASSETS}/patterns/paper-${mock.id}.svg) 0 0/120px;padding:12px;box-sizing:border-box`,
    `<div style="background:${palette.cream};border:3px solid ${ink};border-radius:12px;padding:2px 12px;font-size:26px;font-weight:800;display:inline-block">${mock.name}</div>
     <div style="margin-top:10px;background:${palette.paper};border:3px solid ${ink};border-radius:14px;padding:10px;display:grid;grid-template-columns:repeat(${mock.cols},1fr);gap:8px">${cells}</div>`,
  );
}

export function buildBoard(root: HTMLElement): void {
  const tickets = section(root, 'Vé mẫu', 'Giấy vé, ô cào, biểu tượng và lớp phủ bạc ghép lại như trong game.');
  for (const mock of MOCKS) tickets.appendChild(mockTicket(mock));

  const stickers = section(root, 'Sticker', 'Ảnh chụp các mô hình ở trên qua shader toon, dùng trên mặt vé và trong cửa hàng.');
  for (const name of STICKERS) {
    stickers.appendChild(tile(name, `<img src="${ASSETS}/stickers/${name}.png" width="96" height="96" alt="">`, 120));
  }

  const patterns = section(root, 'Giấy vé, lớp phủ, mặt bàn', 'Hoa văn tự vẽ, lặp liền mạch.');
  for (const name of ['paper-dong', 'paper-bac', 'paper-vang', 'paper-ngoc', 'paper-rong', 'foil', 'table-wood', 'mat-felt']) {
    patterns.appendChild(
      tile(name, `<div style="height:150px;border:3px solid ${ink};border-radius:10px;background:url(${ASSETS}/patterns/${name}.svg) 0 0/120px"></div>`, 250),
    );
  }

  const particles = section(root, 'Hiệu ứng', 'Mảnh bạc khi cào, sao và xu khi thắng, pháo giấy khi trúng lớn.');
  for (const name of PARTICLES) {
    particles.appendChild(tile(name, `<img src="${ASSETS}/particles/${name}.svg" width="64" height="64" alt="">`, 104, palette.wood));
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

  const brand = section(root, 'Biểu trưng', 'Vé đang cào dở và đồng xu, không có chữ để dùng được ở mọi cỡ.');
  brand.appendChild(tile('logo-mark', `<img src="${ASSETS}/brand/logo-mark.svg" width="160" height="160" alt="">`, 190));
  brand.appendChild(tile('favicon', `<img src="${ASSETS}/brand/favicon.svg" width="160" height="160" alt="">`, 190));
  root.appendChild(el('div', 'height:40px'));
}
