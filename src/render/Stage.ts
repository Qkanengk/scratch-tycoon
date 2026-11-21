import * as THREE from 'three';
import { play, playScratch } from '../audio/sfx';
import { BALANCE } from '../data/balance';
import { ticketDef, type TicketId } from '../data/tickets';
import { coverage, createMask, scratchSegment, type ScratchMask } from '../game/scratch';
import type { GameState, Ticket } from '../game/state';
import { jackpotTier } from '../game/tickets';
import { allText } from '../i18n';
import { canvasTexture, loadFonts, loadModel, patternTexture, preloadImages, type ParticleName } from './assets';
import { LicenseBoard } from './board';
import { Particles } from './particles';
import { Rack } from './rack';
import { buildRoom } from './room';
import { flat, roundedRect } from './shapes';
import { drawFace, drawFoil, eraseFoil, ticketMetrics, type TicketMetrics } from './ticketFace';
import { fitToSize, INK, toonify } from './toon';

/** Where the player is looking: down at the scratch mat, up at the ticket rack, or at the licence board. */
export type View = 'desk' | 'shop' | 'board';

export interface StageCallbacks {
  /** The player scratched enough of the ticket on the mat. */
  onRevealed(): void;
  /** Scratch progress toward the reveal, 0 to 1. */
  onProgress(done: number): void;
  /** The player picked a ticket type on the rack. */
  onTicket(id: TicketId): void;
  /** The player picked up the scratched ticket. */
  onCollect(): void;
  /** The player pressed the licence board while reading it. */
  onBoard(): void;
  onView(view: View): void;
}

type Action = { kind: 'ticket'; id: TicketId } | { kind: 'board' } | { kind: 'collect' };

const FACE_PX = 1024;
const FOIL_PX = 768;
const THICKNESS = 0.03;
const CORNER = 0.05;
const OUTLINE = 0.014;
const MAT_MARGIN = 0.13;
const FACE_Y = THICKNESS + 0.001;
const RACK_Z = -1.2;
const FLAKES: ParticleName[] = ['foil-flake-a', 'foil-flake-b', 'foil-curl'];
const CONFETTI: ParticleName[] = ['confetti-red', 'confetti-blue', 'confetti-green', 'confetti-yellow'];

/** The direction from what is looked at back to the eye, for a downward pitch and a sideways yaw. */
function gaze(pitchDeg: number, yaw = 0): THREE.Vector3 {
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

interface Pose {
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical axis. */
  turn: number;
  /** 0 lies flat on the desk; a quarter turn stands the ticket up facing the player. */
  tilt: number;
  scale: number;
}

const REST: Pose = { x: 0, y: 0, z: 0, turn: 0, tilt: 0, scale: 1 };
/** Where a collected ticket goes: into the till on the left. */
const TILL: Pose = { x: -1.1, y: 0.35, z: -0.3, turn: 0.8, tilt: 0.6, scale: 0.25 };

interface Tween {
  elapsed: number;
  duration: number;
  step(k: number): void;
  done?: () => void;
}

const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);

/**
 * The first-person lottery kiosk. It draws the game state it is given and reports what the player
 * does with the things on the desk; it never decides an outcome itself.
 */
export class Stage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 40);
  private readonly ticket = new THREE.Group();
  private readonly mat = new THREE.Group();
  private readonly tool = new THREE.Group();
  private readonly inkMaterial = new THREE.MeshBasicMaterial({ color: INK });
  private readonly faceCanvas = document.createElement('canvas');
  private readonly foilCanvas = document.createElement('canvas');
  private readonly faceTexture = canvasTexture(this.faceCanvas);
  private readonly foilTexture = canvasTexture(this.foilCanvas);
  private readonly foilMaterial = new THREE.MeshBasicMaterial({ map: this.foilTexture, transparent: true, depthWrite: false });
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FACE_Y);
  private readonly observer: ResizeObserver;
  private readonly tweens: Tween[] = [];
  // Created once the images and the font have loaded.
  private particles!: Particles;
  private room!: THREE.Group;
  private rack!: Rack;
  private board!: LicenseBoard;
  private feltMaterial!: THREE.Material;

  private metrics: TicketMetrics = ticketMetrics('dong');
  private builtFor: TicketId | null = null;
  private pose: Pose = { ...REST };
  private mask: ScratchMask | null = null;
  private state: GameState | null = null;
  private shown: { serial: number; type: TicketId; revealed: boolean } | null = null;
  private first = true;
  private ready = false;
  private disposed = false;
  private busy = false;
  private frame = 0;
  private ticks = 0;
  private last = 0;
  private foilDirty = false;

  private view: View = 'shop';
  private readonly eye = new THREE.Vector3(0, 1.2, 1.8);
  private readonly focus = new THREE.Vector3(0, 0.4, RACK_Z);
  private readonly eyeGoal = new THREE.Vector3();
  private readonly focusGoal = new THREE.Vector3();
  private readonly sway = new THREE.Vector2();
  private readonly swayGoal = new THREE.Vector2();
  private settled = false;

  private pressed = false;
  private scratching = false;
  private hovering = false;
  private down: { x: number; y: number } | null = null;
  private stroke: { x: number; y: number } | null = null;
  private readonly pointer = new THREE.Vector3();

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: StageCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    canvas.className = 'stage-canvas';
    canvas.dataset.state = 'loading';
    host.appendChild(canvas);

    this.scene.background = new THREE.Color(0x2f7a8c);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9b38c, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);

    void this.load();
  }

  private async load(): Promise<void> {
    await Promise.all([preloadImages(), loadFonts(allText())]);
    if (this.disposed) return;
    this.particles = new Particles();
    this.room = buildRoom();
    this.rack = new Rack();
    this.rack.group.position.set(0, 0, RACK_Z);
    this.board = new LicenseBoard();
    this.feltMaterial = new THREE.MeshBasicMaterial({ map: patternTexture('mat-felt', 0.5) });
    this.ticket.visible = false;
    this.tool.visible = false;
    this.scene.add(this.room, this.mat, this.rack.group, this.board.group, this.ticket, this.tool, this.particles.group);
    this.build('dong');

    this.ready = true;
    this.resize();
    this.sync();
    this.aim();
    this.eye.copy(this.eyeGoal);
    this.focus.copy(this.focusGoal);
    this.frame = requestAnimationFrame(this.tick);
    document.body.dataset.ready = '1';

    try {
      const coin = fitToSize(await loadModel('kenney-platformer-kit/coin-gold.glb'), 0.2);
      toonify(coin, { outline: 0.011 });
      this.tool.add(coin);
    } catch {
      // Without the coin model the pointer itself does the scratching.
    }
  }

  /** Draws the given game state: the ticket on the mat, the rack's price tags and the licence board. */
  update(state: GameState): void {
    this.state = state;
    if (this.ready) this.sync();
  }

  look(view: View): void {
    if (this.view === view) return;
    this.view = view;
    if (!this.ready) return;
    this.aim();
    this.callbacks.onView(view);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    if (this.ready) this.particles.dispose();
    this.faceTexture.dispose();
    this.foilTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // --- ticket -----------------------------------------------------------------------------------

  private sync(): void {
    const state = this.state;
    if (!state) return;
    this.rack.update(state);
    this.board.update(state);
    const ticket = state.ticket;
    const before = this.shown;
    if (this.first) {
      this.first = false;
      if (ticket) {
        this.show(ticket);
        this.applyPose(REST);
      }
      this.view = ticket ? 'desk' : 'shop';
      this.callbacks.onView(this.view);
      this.setState(ticket);
      return;
    }
    if (before && ticket && before.serial === ticket.serial && before.type === ticket.type) {
      if (ticket.revealed && !before.revealed) this.reveal(ticket);
      else if (!ticket.revealed && before.revealed) {
        // An imported save can put the same ticket back under its foil.
        this.show(ticket);
        this.setState(ticket);
      }
      return;
    }
    if (!before && !ticket) return;
    const deal = () => {
      if (!ticket) {
        this.ticket.visible = false;
        this.setState(null);
        return;
      }
      this.show(ticket);
      play('ticket-deal');
      this.look('desk');
      this.move(this.rackPose(ticket.type), REST, 0.5, easeInOut, () => this.setState(ticket));
    };
    this.shown = null;
    this.mask = null;
    if (before) {
      play('ticket-collect');
      this.move(this.pose, TILL, 0.3, easeOut, deal);
    } else {
      deal();
    }
  }

  private setState(ticket: Ticket | null): void {
    this.renderer.domElement.dataset.state = !ticket ? 'empty' : ticket.revealed ? 'revealed' : 'live';
  }

  /** The pose of a ticket as it hangs on the rack, where a bought ticket starts its flight to the mat. */
  private rackPose(id: TicketId): Pose {
    const at = this.rack.anchor(id);
    return { x: at.x, y: at.y, z: at.z, turn: 0, tilt: Math.PI / 2 - 0.2, scale: 0.38 };
  }

  private show(ticket: Ticket): void {
    this.build(ticket.type);
    drawFace(this.faceCanvas, ticket.type, ticket, ticket.revealed);
    drawFoil(this.foilCanvas, ticket.type);
    this.faceTexture.needsUpdate = true;
    this.foilTexture.needsUpdate = true;
    this.foilMaterial.opacity = 1;
    this.foilMaterial.visible = !ticket.revealed;
    this.mask = ticket.revealed ? null : createMask(this.metrics.layout.cells, this.metrics.layout.height);
    this.shown = { serial: ticket.serial, type: ticket.type, revealed: ticket.revealed };
    this.ticket.visible = true;
    this.stroke = null;
    this.callbacks.onProgress(0);
  }

  /** Rebuilds the ticket and its mat when the ticket type (and so its height) changes. */
  private build(id: TicketId): void {
    if (this.builtFor === id) return;
    this.builtFor = id;
    for (const group of [this.ticket, this.mat]) {
      for (const child of [...group.children]) {
        group.remove(child);
        (child as THREE.Mesh).geometry.dispose();
      }
    }
    const m = (this.metrics = ticketMetrics(id));
    // The felt mat is cut to the ticket it holds.
    const matW = 1 + 2 * MAT_MARGIN;
    const matH = m.height + 2 * MAT_MARGIN;
    this.mat.add(flat(roundedRect(matW + 0.06, matH + 0.06, 0.13), this.inkMaterial, 0.002), flat(roundedRect(matW, matH, 0.1), this.feltMaterial, 0.004));

    this.faceCanvas.width = FACE_PX;
    this.faceCanvas.height = Math.round(FACE_PX * m.height);
    this.foilCanvas.width = FOIL_PX;
    this.foilCanvas.height = Math.round(FOIL_PX * m.layout.height);
    // Canvas sizes changed, so the GPU copies have to be reallocated.
    this.faceTexture.dispose();
    this.foilTexture.dispose();

    const edge = roundedRect(1 + 2 * OUTLINE, m.height + 2 * OUTLINE, CORNER + OUTLINE);
    const shadow = flat(edge, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }), 0.006);
    shadow.position.set(0.035, 0.006, 0.05);
    shadow.name = 'shadow';
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(edge, { depth: THICKNESS, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2), this.inkMaterial);
    const faceGeometry = new THREE.ShapeGeometry(roundedRect(1, m.height, CORNER), 8);
    const uv = faceGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) / m.height + 0.5);
    const face = new THREE.Mesh(faceGeometry.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.faceTexture }));
    face.position.y = FACE_Y;
    face.userData.action = { kind: 'collect' } satisfies Action;
    const foil = new THREE.Mesh(new THREE.PlaneGeometry(m.window.w, m.window.h).rotateX(-Math.PI / 2), this.foilMaterial);
    foil.position.set(m.window.x + m.window.w / 2 - 0.5, FACE_Y + 0.002, m.window.y + m.window.h / 2 - m.height / 2);
    foil.renderOrder = 2;
    this.ticket.add(shadow, slab, face, foil);
    if (this.ready) this.aim();
  }

  private reveal(ticket: Ticket): void {
    if (!this.shown) return;
    this.shown.revealed = true;
    this.mask = null;
    this.scratching = false;
    this.setState(ticket);
    drawFace(this.faceCanvas, ticket.type, ticket, true);
    this.faceTexture.needsUpdate = true;
    this.tweens.push({
      elapsed: 0,
      duration: 0.35,
      step: (k) => (this.foilMaterial.opacity = 1 - k),
      done: () => (this.foilMaterial.visible = false),
    });
    this.celebrate(ticket);
  }

  private celebrate(ticket: Ticket): void {
    const def = ticketDef(ticket.type);
    const origin = new THREE.Vector3(0, 0.12, 0);
    const burst = (name: ParticleName, count: number, fast = 1) =>
      this.particles.emit(origin, { name, count, speed: [1.4 * fast, 2.6 * fast], spread: 0.75, size: [0.07, 0.13], life: [0.8, 1.3] });
    if (ticket.prize === 0) {
      burst('smoke-puff', 3, 0.5);
      play('lose', 0.45);
      return;
    }
    const jackpot = ticket.tier === jackpotTier(def);
    const big = jackpot || ticket.tier >= def.prizes.length - 3;
    burst('coin', jackpot ? 26 : big ? 16 : 8);
    burst('star', jackpot ? 12 : big ? 8 : 4);
    if (big) burst('sparkle', 8, 1.2);
    if (jackpot) for (const name of CONFETTI) burst(name, 10, 1.3);
    play(jackpot ? 'win-jackpot' : big ? 'win-big' : 'win-small');
    play(big ? 'coins-many' : 'coin-1', 0.5);
    // A little hop for the winner.
    this.tweens.push({ elapsed: 0, duration: 0.4, step: (k) => this.applyPose({ ...REST, y: Math.sin(k * Math.PI) * 0.12, turn: Math.sin(k * Math.PI * 2) * 0.04 }) });
  }

  private applyPose(pose: Pose): void {
    this.pose = pose;
    this.ticket.position.set(pose.x, pose.y, pose.z);
    this.ticket.rotation.set(pose.tilt, pose.turn, 0);
    this.ticket.scale.setScalar(pose.scale);
    const shadow = this.ticket.getObjectByName('shadow');
    if (shadow) {
      shadow.visible = pose.tilt < 0.1;
      shadow.position.y = 0.006 - pose.y / pose.scale;
    }
  }

  private move(from: Pose, to: Pose, duration: number, ease: (k: number) => number, done?: () => void): void {
    this.busy = true;
    const start = { ...from };
    this.applyPose(start);
    this.tweens.push({
      elapsed: 0,
      duration,
      step: (k) => {
        const e = ease(k);
        const mix = (a: number, b: number) => a + (b - a) * e;
        // The flight arcs up over the desk.
        const arc = Math.sin(k * Math.PI) * 0.25;
        this.applyPose({
          x: mix(start.x, to.x),
          y: mix(start.y, to.y) + arc,
          z: mix(start.z, to.z),
          turn: mix(start.turn, to.turn),
          tilt: mix(start.tilt, to.tilt),
          scale: mix(start.scale, to.scale),
        });
      },
      done: () => {
        this.busy = false;
        done?.();
      },
    });
  }

  // --- input ------------------------------------------------------------------------------------

  private ndc(event: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Finds where the pointer touches the ticket's surface, in world units. */
  private locate(event: PointerEvent): boolean {
    this.raycaster.setFromCamera(this.ndc(event), this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, this.pointer) !== null;
  }

  /** The thing under the pointer that can be pressed, if any. */
  private pick(event: PointerEvent): Action | null {
    this.raycaster.setFromCamera(this.ndc(event), this.camera);
    for (const hit of this.raycaster.intersectObjects([this.rack.group, this.board.group, this.ticket], true)) {
      let visible = true;
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) visible &&= node.visible;
      if (!visible) continue;
      const action = hit.object.userData.action as Action | undefined;
      if (!action) continue;
      if (action.kind === 'collect' && !(this.shown?.revealed && !this.busy)) continue;
      return action;
    }
    return null;
  }

  private canScratch(): boolean {
    return this.mask !== null && !this.busy && this.view === 'desk' && this.settled;
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (!this.ready) return;
    event.preventDefault();
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.pressed = true;
    this.down = { x: event.clientX, y: event.clientY };
    if (this.canScratch() && this.locate(event)) {
      this.scratching = true;
      this.hovering = true;
      this.stroke = null;
      this.scratchTo(event.timeStamp);
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.ready) return;
    const ndc = this.ndc(event);
    if (event.pointerType === 'mouse') this.swayGoal.copy(ndc);
    if (this.locate(event)) this.hovering = true;
    if (this.scratching) {
      if (this.canScratch()) this.scratchTo(event.timeStamp);
      return;
    }
    if (event.pointerType !== 'mouse' || this.pressed) return;
    const action = this.pick(event);
    this.rack.hover(action?.kind === 'ticket' ? action.id : null);
    this.renderer.domElement.dataset.hot = action ? '1' : '0';
  };

  private readonly onUp = (event: PointerEvent): void => {
    const down = this.down;
    const wasScratching = this.scratching;
    this.pressed = false;
    this.scratching = false;
    this.stroke = null;
    this.down = null;
    if (event.pointerType !== 'mouse') this.hovering = false;
    if (!down || wasScratching || !this.ready) return;
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) < 10) {
      const action = this.pick(event);
      if (action) this.press(action);
    } else if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
      // Dragging the scene down looks up, like turning your head.
      this.nod(dy > 0 ? 'up' : 'down');
    }
  };

  private readonly onCancel = (): void => {
    this.pressed = false;
    this.scratching = false;
    this.stroke = null;
    this.down = null;
  };

  private readonly onLeave = (): void => {
    if (!this.pressed) this.hovering = false;
    this.swayGoal.set(0, 0);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (Math.abs(event.deltaY) > 4) this.nod(event.deltaY < 0 ? 'up' : 'down');
  };

  /** Looks one step up (desk to rack) or down (board or rack back to the desk). */
  nod(direction: 'up' | 'down'): void {
    if (direction === 'up') this.look('shop');
    else this.look(this.view === 'board' ? 'shop' : 'desk');
  }

  private press(action: Action): void {
    if (action.kind === 'ticket') this.callbacks.onTicket(action.id);
    else if (action.kind === 'collect') this.callbacks.onCollect();
    else if (this.view === 'board') this.callbacks.onBoard();
    else this.look('board');
  }

  private scratchTo(now: number): void {
    const mask = this.mask;
    if (!mask) return;
    const m = this.metrics;
    const x = (this.pointer.x + 0.5 - m.window.x) / m.window.w;
    const y = (this.pointer.z + m.height / 2 - m.window.y) / m.window.w;
    const from = this.stroke ?? { x, y };
    this.stroke = { x, y };
    const radius = BALANCE.brushRadius / m.window.w;
    const before = mask.scratched;
    scratchSegment(mask, from.x, from.y, x, y, radius);
    eraseFoil(this.foilCanvas, from.x, from.y, x, y, radius);
    this.foilDirty = true;
    const removed = mask.scratched - before;
    if (removed === 0) return;
    playScratch(now);
    this.particles.emit(new THREE.Vector3(this.pointer.x, FACE_Y + 0.02, this.pointer.z), {
      name: FLAKES[Math.floor(Math.random() * FLAKES.length)] as ParticleName,
      count: Math.min(3, Math.ceil(removed / 8)),
      speed: [0.5, 1.3],
      spread: 1,
      size: [0.035, 0.07],
      life: [0.5, 0.9],
    });
    const done = coverage(mask) / BALANCE.scratchThreshold;
    this.callbacks.onProgress(Math.min(1, done));
    if (done >= 1) {
      this.mask = null;
      play('reveal', 0.5);
      this.callbacks.onRevealed();
    }
  }

  // --- camera -----------------------------------------------------------------------------------

  /** The closest eye position along `direction` from `target` that keeps every point on screen. */
  private frameUp(target: THREE.Vector3, direction: THREE.Vector3, points: THREE.Vector3[]): THREE.Vector3 {
    const height = Math.max(1, this.host.clientHeight);
    // The HUD covers a strip at the top and the bottom of the picture.
    const top = 1 - (2 * 70) / height;
    const bottom = -1 + (2 * 120) / height;
    const probe = this.camera.clone();
    let near = 0.4;
    let far = 30;
    for (let i = 0; i < 26; i++) {
      const mid = (near + far) / 2;
      probe.position.copy(target).addScaledVector(direction, mid);
      probe.lookAt(target);
      probe.updateMatrixWorld();
      const fits = points.every((point) => {
        const p = point.clone().project(probe);
        return Math.abs(p.x) <= 0.96 && p.y <= top && p.y >= bottom;
      });
      if (fits) far = mid;
      else near = mid;
    }
    return target.clone().addScaledVector(direction, far);
  }

  /** Sets where the eye should go for the current view. */
  private aim(): void {
    const tall = this.camera.aspect < 0.8;
    let target: THREE.Vector3;
    let direction: THREE.Vector3;
    let points: THREE.Vector3[];
    // Looking at the rack, the eye rests a little above it so the shop behind shows.
    let lift = 0;
    if (this.view === 'desk') {
      const margin = tall ? 0.03 : MAT_MARGIN;
      const halfW = 0.5 + margin;
      const halfH = this.metrics.height / 2 + margin;
      target = new THREE.Vector3(0, 0, 0);
      direction = gaze(tall ? 60 : 50);
      points = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * halfW, FACE_Y, sz * halfH)));
    } else if (this.view === 'shop') {
      points = this.rack.points();
      if (!tall) points.push(...this.board.points());
      const box = new THREE.Box3().setFromPoints(points);
      target = box.getCenter(new THREE.Vector3());
      direction = gaze(13);
      lift = 0.34;
    } else {
      points = this.board.points();
      target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      direction = gaze(10, this.board.group.rotation.y * 0.6);
    }
    this.eyeGoal.copy(this.frameUp(target, direction, points));
    this.eyeGoal.y += lift;
    this.focusGoal.copy(target);
    this.focusGoal.y += lift;
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.ready) return;
    const tall = this.camera.aspect < 0.8;
    this.rack.layout(tall);
    const shelf = this.room.getObjectByName('shelf');
    if (shelf) shelf.position.y = tall ? 3 : 0;
    this.board.group.position.set(tall ? 1.22 : 1.75, 0, RACK_Z - 0.05);
    this.board.group.rotation.y = tall ? -0.3 : -0.38;
    this.aim();
  }

  /** Screen positions of everything a play-through script needs to touch. */
  private publish(): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const screen = (point: THREE.Vector3) => {
      const p = point.clone().project(this.camera);
      return [Math.round(rect.left + ((p.x + 1) / 2) * rect.width), Math.round(rect.top + ((1 - p.y) / 2) * rect.height)] as const;
    };
    const m = this.metrics;
    const onTicket = (lx: number, ly: number) => screen(new THREE.Vector3(m.window.x + lx * m.window.w - 0.5, FACE_Y, m.window.y + ly * m.window.w - m.height / 2));
    canvas.dataset.cells = JSON.stringify(m.layout.cells.map((cell) => [...onTicket(cell.x, cell.y), ...onTicket(cell.x + cell.w, cell.y + cell.h)]));
    const rack: Record<string, readonly [number, number]> = {};
    for (const id of ['dong', 'bac', 'vang', 'ngoc', 'rong'] as const) rack[id] = screen(this.rack.anchor(id));
    canvas.dataset.rack = JSON.stringify(rack);
    canvas.dataset.board = JSON.stringify(screen(new THREE.Box3().setFromPoints(this.board.points()).getCenter(new THREE.Vector3())));
    canvas.dataset.ticket = JSON.stringify(screen(new THREE.Vector3(0, FACE_Y, 0)));
    canvas.dataset.view = this.view;
    canvas.dataset.busy = this.busy || !this.settled ? '1' : '0';
  }

  private readonly tick = (time: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i] as Tween;
      tween.elapsed += dt;
      const k = Math.min(1, tween.elapsed / tween.duration);
      tween.step(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tween.done?.();
      }
    }

    // The head turns toward what the player looks at, and leans a little after the mouse.
    const ease = Math.min(1, dt * 7);
    this.eye.lerp(this.eyeGoal, ease);
    this.focus.lerp(this.focusGoal, ease);
    this.settled = this.eye.distanceTo(this.eyeGoal) < 0.004 && this.focus.distanceTo(this.focusGoal) < 0.004;
    if (this.settled) {
      this.eye.copy(this.eyeGoal);
      this.focus.copy(this.focusGoal);
    }
    const lean = this.view === 'desk' || this.pressed ? 0 : 1;
    this.sway.lerp(new THREE.Vector2(this.swayGoal.x * lean, this.swayGoal.y * lean), Math.min(1, dt * 5));
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.focus.x + this.sway.x * 0.12, this.focus.y + this.sway.y * 0.07, this.focus.z);
    this.camera.updateMatrixWorld();

    if (this.foilDirty) {
      this.foilTexture.needsUpdate = true;
      this.foilDirty = false;
    }

    // The coin follows the pointer and rocks while it rubs.
    this.tool.visible = this.hovering && this.canScratch();
    const canvas = this.renderer.domElement;
    canvas.style.cursor = this.tool.visible ? 'none' : canvas.dataset.hot === '1' ? 'pointer' : 'default';
    if (this.tool.visible) {
      const lift = this.scratching ? 0.004 : 0.07;
      this.tool.position.set(this.pointer.x, FACE_Y + lift, this.pointer.z);
      this.tool.rotation.set(-0.5, 0, this.scratching ? Math.sin(time / 28) * 0.35 : -0.25);
    }

    this.particles.update(dt);
    if (this.ticks++ % 10 === 0) this.publish();
    this.renderer.render(this.scene, this.camera);
  };
}
