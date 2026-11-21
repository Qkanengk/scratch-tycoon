// Bakes every model in the manifest into a transparent toon sticker (public/assets/stickers/<name>.png)
// by photographing the asset board in headless Chrome. The game draws these on ticket faces and in the shop.
// Run: npm run dev -- --port 5199 & node scripts/assets/bake-stickers.mjs [http://localhost:5199]
// Needs google-chrome and Python 3 with Pillow (for trimming).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5199';
const CELL = 512;
const out = new URL('../../public/assets/stickers/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(new URL('../../public/assets/models/manifest.json', import.meta.url)));
mkdirSync(out, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(
  'google-chrome',
  ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'bake-'))}`, 'about:blank'],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let id = 0;
const pending = new Map();
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  pending.get(data.id)?.(data);
  pending.delete(data.id);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

const cols = 4;
const width = cols * (CELL + 14) + 36;
const height = Math.ceil(manifest.length / cols) * (CELL + 44) + 36;
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await send('Page.enable');
await send('Page.navigate', { url: `${base}/gallery.html?spin=0&bg=none&still=1&cell=${CELL}` });
for (let i = 0; i < 200; i++) {
  if (await evaluate(`document.body && document.body.dataset.ready === '1'`)) break;
  await sleep(300);
}
// Grow the viewport to the whole page so every tile is inside the WebGL canvas.
const pageHeight = await evaluate('document.documentElement.scrollHeight');
await send('Emulation.setDeviceMetricsOverride', { width, height: pageHeight, deviceScaleFactor: 1, mobile: false });
await sleep(3000);
const rects = await evaluate(
  `[...document.querySelectorAll('#gallery > div')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, x: r.left, y: r.top, w: r.width }; })`,
);
for (const rect of rects) {
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x + 3, y: rect.y + 3, width: rect.w - 6, height: rect.w - 6, scale: 1 },
  });
  const file = join(out, `${rect.id.split('/')[1]}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
}
ws.close();
chrome.kill();

// Trim the empty margin and pad to a 256 px square so every sticker fills its cell the same way.
execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image
for path in glob.glob(sys.argv[1] + '*.png'):
    im = Image.open(path).convert('RGBA')
    box = im.getbbox()
    if not box: sys.exit('empty sticker: ' + path)
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(path, optimize=True)
`, out], { stdio: 'inherit' });
console.log(`baked ${rects.length} stickers into ${out}`);
process.exit(0);
