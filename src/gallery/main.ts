import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import '@fontsource/baloo-2/vietnamese-700.css';
import '@fontsource/baloo-2/latin-700.css';
import { buildBoard } from './board';
import { fitToSize, isFiniteBox, posedBounds, toonify, unskin } from '../render/toon';

/**
 * Asset board: every model in the manifest, restyled with the game's toon shader, on a turntable.
 * Dev-only page (open /gallery.html with `npm run dev`); it is not part of the game build.
 */
interface Entry {
  id: string;
  file: string;
  author: string;
  /** Turntable angle (radians) the model is shown at when it is baked into a sticker. */
  yaw?: number;
}

const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const cell = Number(params.get('cell') ?? 190);
const spin = params.get('spin') !== '0';
const transparent = params.get('bg') === 'none';
const still = params.get('still') === '1';

const host = document.getElementById('gallery')!;
document.body.style.cssText = `margin:0;background:${transparent ? 'transparent' : '#fff3d6'};font-family:'Baloo 2',sans-serif;color:#2b1b17`;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none';
document.body.appendChild(canvas);
host.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,${cell}px);gap:14px;padding:18px;justify-content:center`;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setScissorTest(true);

const tiles: { el: HTMLElement; scene: THREE.Scene; model: THREE.Object3D; mixer?: THREE.AnimationMixer }[] = [];
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
camera.position.set(0, 1.25, 3.1);
camera.lookAt(0, 0.45, 0);

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9b38c, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  return scene;
}

async function load(): Promise<void> {
  const manifest: Entry[] = await (await fetch('./assets/models/manifest.json')).json();
  const loader = new GLTFLoader();
  for (const entry of manifest) {
    if (only && !only.includes(entry.id)) continue;
    const el = document.createElement('div');
    el.style.cssText = `height:${cell + 30}px;border:3px solid ${transparent ? 'transparent' : '#2b1b17'};border-radius:16px;background:${transparent ? 'transparent' : '#ffe7a8'};box-shadow:${transparent ? 'none' : '0 5px 0 #2b1b17'};display:flex;flex-direction:column;justify-content:flex-end;text-align:center;font-size:14px;line-height:1.1;padding-bottom:6px;box-sizing:border-box`;
    el.innerHTML = transparent ? '' : `<b>${entry.id.split('/')[1]}</b><span style="opacity:.6;font-size:11px">${entry.author}</span>`;
    el.dataset.id = entry.id;
    host.appendChild(el);
    const gltf = await loader.loadAsync(`./assets/${entry.file}`);
    let mixer: THREE.AnimationMixer | undefined;
    const idle = gltf.animations.find((clip) => /flying_idle|idle$|swim/i.test(clip.name)) ?? gltf.animations[0];
    if (idle) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(idle).play();
      mixer.update(0.3);
      // Some clips in the source packs carry broken keyframes; show those models in their rest pose.
      if (!isFiniteBox(posedBounds(gltf.scene))) {
        mixer.stopAllAction();
        mixer = undefined;
        unskin(gltf.scene);
      }
    }
    const model = fitToSize(gltf.scene, 1);
    toonify(model, { outline: 0.022 });
    const scene = makeScene();
    scene.add(model);
    model.rotation.y = entry.yaw ?? -0.5;
    tiles.push({ el, scene, model, mixer });
  }
  if (!transparent && !only) {
    const board = document.createElement('div');
    host.after(board);
    buildBoard(board);
    await Promise.all([...board.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
  }
  document.body.dataset.ready = '1';
}

const clock = new THREE.Clock();
function frame(): void {
  const dt = clock.getDelta();
  const w = innerWidth;
  const h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
  }
  renderer.setScissor(0, 0, w, h);
  renderer.setViewport(0, 0, w, h);
  renderer.clear();
  for (const tile of tiles) {
    const r = tile.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > h) continue;
    if (spin) tile.model.rotation.y += dt * 0.7;
    if (!still) tile.mixer?.update(dt);
    const size = r.width - 6;
    const top = r.top + 3;
    renderer.setViewport(r.left + 3, h - top - size, size, size);
    renderer.setScissor(r.left + 3, h - top - size, size, size);
    renderer.render(tile.scene, camera);
  }
  requestAnimationFrame(frame);
}

void load();
frame();
