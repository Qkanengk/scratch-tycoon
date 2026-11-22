import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TICKETS } from '../data/tickets';
import thanTai from './than-tai.svg?raw';

/** Everything under public/assets, addressed relative to the page so the build works under any base path. */
export const ASSETS = `${import.meta.env.BASE_URL}assets`;

export const PARTICLES = [
  'star', 'sparkle', 'coin', 'ring', 'foil-flake-a', 'foil-flake-b', 'foil-curl', 'smoke-puff',
  'confetti-red', 'confetti-blue', 'confetti-green', 'confetti-yellow',
] as const;
export type ParticleName = (typeof PARTICLES)[number];

export const PATTERNS = [
  'foil', 'table-wood', 'mat-felt', 'wall', 'paper', ...TICKETS.map((def) => `paper-${def.id}`),
];
const ORIGINAL_PAPERS = new Set(['paper-dong', 'paper-bac', 'paper-vang', 'paper-ngoc', 'paper-rong']);
export const patternPath = (name: string): string => `patterns/${name}.${ORIGINAL_PAPERS.has(name) ? 'svg' : 'png'}`;
export function particlePath(name: ParticleName): string {
  if (name.startsWith('confetti-')) return 'particles/confetti.png';
  if (name === 'coin') return 'brand/coin.png';
  return `particles/${name}.png`;
}
const STICKERS = [
  ...TICKETS.flatMap((def) => (def.rules.kind === 'match' ? def.rules.symbols : [])),
  'dragon-evolved', 'bomb', 'lock', 'spaceship', 'jewel',
];

export const ALTAR_ART = 'than-tai.svg';
const altarColors: Record<string, string> = {
  '#ff0000': '#ef4b3f', '#ff00ff': '#ffd5a5', '#800080': '#d63a48',
  '#008000': '#49a984', '#808000': '#efb935', '#000000': '#342024',
};

const images = new Map<string, HTMLImageElement>();

function loadImage(path: string, src = `${ASSETS}/${path}`): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      images.set(path, img);
      resolve();
    };
    img.onerror = () => reject(new Error(`Cannot load ${path}`));
    img.src = src;
  });
}

let imagesReady: Promise<void> | null = null;

/** Loads every image the table draws from; `image()` is synchronous afterwards. */
export function preloadImages(): Promise<void> {
  imagesReady ??= Promise.all([
    ...PATTERNS.map((name) => loadImage(patternPath(name))),
    ...[...new Set(PARTICLES.map(particlePath))].map((path) => loadImage(path)),
    ...[...new Set(STICKERS)].map((name) => loadImage(`stickers/${name}.png`)),
    loadImage('icons/wrench.png'),
    loadImage('icons/target.png'),
    loadImage(ALTAR_ART, `data:image/svg+xml,${encodeURIComponent(
      thanTai.replace(/#[0-9a-f]{6}\b/g, hex => altarColors[hex] ?? hex),
    )}`),
  ]).then(() => undefined);
  return imagesReady;
}

export function image(path: string): HTMLImageElement {
  const img = images.get(path);
  if (!img) throw new Error(`Image was not preloaded: ${path}`);
  return img;
}

/** Resize a sourced image before using it in a pattern or GPU texture. */
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
  const texture = canvasTexture(rasterize(patternPath(name), size));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / tile, 1 / tile);
  return texture;
}

const loader = new GLTFLoader();

export function loadGltf(file: string) {
  return loader.loadAsync(`${ASSETS}/models/${file}`);
}

export async function loadModel(file: string): Promise<THREE.Object3D> {
  return (await loadGltf(file)).scene;
}

/** Waits for the display font so text painted on canvases does not fall back to a system face. */
export async function loadFonts(sample: string): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(
    ['700', '800'].map((weight) => document.fonts.load(`${weight} 32px "Baloo 2"`, sample).catch(() => undefined)),
  );
}
