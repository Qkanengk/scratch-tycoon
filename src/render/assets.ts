import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TICKETS } from '../data/tickets';

/** Everything under public/assets, addressed relative to the page so the build works under any base path. */
export const ASSETS = `${import.meta.env.BASE_URL}assets`;

export const PARTICLES = [
  'star', 'sparkle', 'coin', 'ring', 'foil-flake-a', 'foil-flake-b', 'foil-curl', 'smoke-puff',
  'confetti-red', 'confetti-blue', 'confetti-green', 'confetti-yellow',
] as const;
export type ParticleName = (typeof PARTICLES)[number];

const PATTERNS = ['foil', 'table-wood', 'mat-felt', ...TICKETS.filter(def => !def.minimumPrestige).map((def) => `paper-${def.id}`)];
const STICKERS = [
  ...TICKETS.flatMap((def) => (def.rules.kind === 'match' ? def.rules.symbols : [])),
  'dragon-evolved', 'bomb', 'lock', 'star-coin',
];

const images = new Map<string, HTMLImageElement>();

function loadImage(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      images.set(path, img);
      resolve();
    };
    img.onerror = () => reject(new Error(`Cannot load ${path}`));
    img.src = `${ASSETS}/${path}`;
  });
}

let imagesReady: Promise<void> | null = null;

/** Loads every image the table draws from; `image()` is synchronous afterwards. */
export function preloadImages(): Promise<void> {
  imagesReady ??= Promise.all([
    ...PATTERNS.map((name) => loadImage(`patterns/${name}.svg`)),
    ...PARTICLES.map((name) => loadImage(`particles/${name}.svg`)),
    ...STICKERS.map((name) => loadImage(`stickers/${name}.png`)),
    loadImage('icons/wrench.png'),
  ]).then(() => undefined);
  return imagesReady;
}

export function image(path: string): HTMLImageElement {
  const img = images.get(path);
  if (!img) throw new Error(`Image was not preloaded: ${path}`);
  return img;
}

/** An image drawn once onto a square canvas, for canvas patterns and GPU textures (SVGs have no pixel size of their own). */
export function rasterize(path: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(image(path), 0, 0, size, size);
  return canvas;
}

export function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A seamless pattern as a repeating texture; `tile` is the pattern's size in world units. */
export function patternTexture(name: string, tile: number, size = 512): THREE.CanvasTexture {
  const texture = canvasTexture(rasterize(`patterns/${name}.svg`, size));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tile, 1 / tile);
  return texture;
}

const loader = new GLTFLoader();

export async function loadModel(file: string): Promise<THREE.Object3D> {
  return (await loader.loadAsync(`${ASSETS}/models/${file}`)).scene;
}

/** Waits for the display font so text painted on canvases does not fall back to a system face. */
export async function loadFonts(sample: string): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(
    ['700', '800'].map((weight) => document.fonts.load(`${weight} 32px "Baloo 2"`, sample).catch(() => undefined)),
  );
}
