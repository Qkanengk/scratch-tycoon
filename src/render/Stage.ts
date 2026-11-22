import * as THREE from 'three';
import { play, playScratch, stopScratch } from '../audio/sfx';
import { BALANCE } from '../data/balance';
import { ticketDef, TICKETS, type TicketId } from '../data/tickets';
import { TOOLS, type ToolId } from '../data/tools';
import { createMask, encodeMask, restoreMask, scratchProgress, scratchSegment, ticketContentKey, type Point, type ScratchMask } from '../game/scratch';
import type { GameState, Ticket } from '../game/state';
import { toolRadius, type ToolIntent } from '../game/tools';
import { jackpotTier } from '../game/tickets';
import { allText, t } from '../i18n';
import { canvasTexture, loadFonts, patternTexture, preloadImages, type ParticleName } from './assets';
import { LicenseBoard } from './board';
import { Particles } from './particles';
import { Rack } from './rack';
import { buildRoom, desktopLayout, layoutCounterProp, WALL_Z } from './room';
import { flat, roundedRect } from './shapes';
import { drawFace, drawFoil, eraseFoil, peelFoil, restoreFoil, ticketMetrics, type TicketMetrics } from './ticketFace';
import { animateToolModel, buildToolModel, disposeToolObject } from './toolModels';
import { preloadKioskModels } from './kioskModels';
import { ToolShelf } from './toolShelf';
import { INK } from './toon';
import { Paper, receiptLines, rentLines } from './paper';
import { PlayClock } from './playClock';
import { formatCompact } from '../game/format';
import { RobotStation } from './robotStation';
import type { AutomationAction } from '../game/automation';
import { Altar } from './altar';

/** Where the player is looking: down at the scratch mat, up at the ticket rack, or at the licence board. */
export type View = 'desk' | 'shop' | 'board' | 'tools' | 'robots' | 'altar';

export interface StageCallbacks {
  onAltar(): void;
  onAutomation(action: AutomationAction | 'context', index: number): void;
  /** The player scratched enough of the ticket on the mat. */
  onRevealed(ticket: Ticket): void;
  /** Scratch progress toward the reveal, 0 to 1. */
  onProgress(done: number): void;
  onScratch(ticket: Ticket, scratch: string): void;
  /** The player picked a ticket type on the rack. */
  onTicket(id: TicketId): void;
  /** The player picked up the scratched ticket. */
  onCollect(): void;
  /** The player pressed the licence board while reading it. */
  onBoard(): void;
  onTool(intent: ToolIntent): void;
  onView(view: View): void;
  onPlayTime(elapsedMs: number): void;
  onReturn(): void;
  onRepair(id: ToolId): void;
  onStartScratch(ticket: Ticket): void;
  onBomb(ticket: Ticket, index: number): void;
}

type Action = { kind: 'altar'; offer?: boolean } | { kind: 'robots' } | { kind: 'automation'; action: AutomationAction | 'context'; index?: number } | { kind: 'ticket'; id: TicketId } | { kind: 'board' } | { kind: 'collect' } | { kind: 'tools' } | { kind: 'tool'; intent: ToolIntent | null } | { kind: 'return' } | { kind: 'repair'; id: ToolId };

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
  private fovGoal = 50;
  private readonly ticket = new THREE.Group();
  private readonly mat = new THREE.Group();
  private robots!: RobotStation;
  private readonly tool = new THREE.Group();
  private toolLift = 0.045;
  private toolLean = 0;
  private lastFlakes = -Infinity;
  private readonly inkMaterial = new THREE.MeshBasicMaterial({ color: INK });
  private readonly faceCanvas = document.createElement('canvas');
  private readonly foilCanvas = document.createElement('canvas');
  private readonly faceTexture = canvasTexture(this.faceCanvas);
  private readonly foilTexture = canvasTexture(this.foilCanvas);
  private readonly foilMaterial = new THREE.MeshBasicMaterial({ map: this.foilTexture, transparent: true, depthWrite: false });
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FACE_Y);
  private readonly observer: ResizeObserver;
  private readonly hudObserver: ResizeObserver;
  private readonly hudChanges: MutationObserver;
  private hudFrame = 0;
  private readonly tweens: Tween[] = [];
  // Created once the images and the font have loaded.
  private particles!: Particles;
  private room!: THREE.Group;
  private rack!: Rack;
  private board!: LicenseBoard;
  private altar!: Altar;
  private altarArmed = false;
  private incenseTime = 0;
  private toolShelf!: ToolShelf;
  private handKey = '';
  private feltMaterial!: THREE.Material;
  private rent!: Paper;
  private receipt!: Paper;
  private returnTag!: Paper;
  private readonly playClock = new PlayClock();
  private paused = false;
  private rentStamp = 0;
  private receiptTime = 0;
  private collectionDebt = 0;
  private rentKey = '';
  private returnKey = '';
  private readonly bombHits = new Set<number>();

  private metrics: TicketMetrics = ticketMetrics('dong');
  private builtFor: TicketId | null = null;
  private pose: Pose = { ...REST };
  private mask: ScratchMask | null = null;
  private state: GameState | null = null;
  private shown: Ticket | null = null;
  private readonly pendingScratch = new Set<string>();
  private lastScratchSave = 0;
  private lastScratchSent: string | undefined;
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
  private readonly swayTarget = new THREE.Vector2();
  private settled = false;

  private pressed = false;
  private returnPress = false;
  private scratching = false;
  /** Whether the current press has rubbed the ticket; such a press is never read as a click or a look. */
  private stroked = false;
  private hovering = false;
  private down: Point | null = null;
  private stroke: Point | null = null;
  private activePointer: number | null = null;
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointer = new THREE.Vector3();
  private hudBounds = '';
  private touchTop = 70;
  private touchBottom = 120;

  private touchLayout(): boolean {
    return !desktopLayout(this.host.clientWidth, this.host.clientHeight);
  }

  private measureHud(): void {
    if (!this.ready || !this.touchLayout()) return;
    const app = this.host.parentElement;
    const prompt = app?.querySelector('.prompt')?.getBoundingClientRect();
    if (!app || !prompt) return;
    const promptHeight = `${prompt.height}px`;
    if (app.style.getPropertyValue('--prompt-height') !== promptHeight) {
      app.style.setProperty('--prompt-height', promptHeight);
    }
    const height = this.host.clientHeight;
    let top = 0;
    let bottom = height - prompt.top;
    for (const element of app.querySelectorAll('.purse, .corner, .look')) {
      if (this.view === 'desk' && element.matches('.look-right')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.top < height / 3) top = Math.max(top, rect.bottom);
      else bottom = Math.max(bottom, height - rect.top);
    }
    const bounds = `${top}:${bottom}:${this.view}:${height}`;
    if (bounds === this.hudBounds) return;
    this.hudBounds = bounds;
    this.touchTop = top + 6;
    this.touchBottom = bottom + 6;
    this.aim();
  }

  private queueHudMeasurement(): void {
    if (this.disposed || this.hudFrame) return;
    this.hudFrame = requestAnimationFrame(() => {
      this.hudFrame = 0;
      this.measureHud();
    });
  }

  private observeHud(): void {
    this.hudObserver.disconnect();
    for (const element of this.host.parentElement?.querySelectorAll('.prompt, .purse, .corner, .look') ?? []) {
      this.hudObserver.observe(element);
    }
    this.queueHudMeasurement();
  }

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
    canvas.addEventListener('lostpointercapture', this.onCancel);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.hudObserver = new ResizeObserver(() => this.queueHudMeasurement());
    this.hudChanges = new MutationObserver(() => this.observeHud());
    if (host.parentElement) this.hudChanges.observe(host.parentElement, { childList: true });
    this.observeHud();
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('focus', this.visibilityChanged);
    window.addEventListener('blur', this.visibilityChanged);

    void this.load();
  }

  private async load(): Promise<void> {
    await Promise.all([preloadImages(), preloadKioskModels(), loadFonts(allText())]);
    if (this.disposed) return;
    this.particles = new Particles();
    this.room = buildRoom();
    this.robots = new RobotStation();
    this.scene.add(this.robots.group);
    this.rack = new Rack();
    this.rack.group.position.set(0, 0, RACK_Z);
    this.board = new LicenseBoard();
    this.altar = new Altar();
    this.scene.add(this.altar.group);
    this.toolShelf = new ToolShelf();
    this.toolShelf.group.position.set(-2.8, 0, -1.5);
    this.toolShelf.group.rotation.y = 0.18;
    this.rent = new Paper(1.35, .47);
    this.rent.group.rotation.z = -.025;
    this.receipt = new Paper(.9, .76);
    this.receipt.group.rotation.x = -Math.PI / 2;
    this.receipt.group.position.set(0, .085, .025);
    this.receipt.group.rotation.z = -.045;
    this.receipt.group.visible = false;
    this.receipt.group.traverse(node => { node.userData.action = { kind: 'collect' }; });
    this.returnTag = new Paper(.88, .115);
    this.returnTag.group.rotation.x = -Math.PI / 2;
    this.returnTag.group.visible = false;
    this.returnTag.group.traverse(node => { node.userData.action = { kind: 'return' }; });
    this.feltMaterial = new THREE.MeshBasicMaterial({ map: patternTexture('mat-felt', 0.5), color: 0x86d9bf });
    this.ticket.visible = false;
    this.tool.visible = false;
    this.scene.add(this.room, this.mat, this.rack.group, this.board.group, this.toolShelf.group, this.ticket, this.tool, this.particles.group);
    this.scene.add(this.rent.group, this.receipt.group, this.returnTag.group);
    this.build('dong');

    this.ready = true;
    this.resize();
    this.sync();
    this.aim();
    this.eye.copy(this.eyeGoal);
    this.focus.copy(this.focusGoal);
    this.frame = requestAnimationFrame(this.tick);
    document.body.dataset.ready = '1';

  }

  refuseTool(id: ToolId): void {
    if (this.ready && this.state) {
      this.toolShelf.refuse(id);
      this.toolShelf.update(this.state);
    }
  }

  /** Draws the given game state: the ticket on the mat, the rack's price tags and the licence board. */
  update(state: GameState): void {
    const changedLife = this.state && state.prestige.tier > this.state.prestige.tier;
    const availabilityChanged = this.state && (state.prestige.tier > 0) !== (this.state.prestige.tier > 0);
    if (changedLife && this.ready) {
      this.altarArmed = false;
      this.particles.emit(this.altar.smokePoint(), { name: 'smoke-puff', count: 14, speed: [.15, .4], spread: .6, size: [.1, .22], life: [1.6, 2.8], gravity: -.05 });
      this.particles.emit(this.altar.anchor(), { name: 'coin', count: 24, speed: [.4, .9], spread: .8, size: [.06, .1], life: [1.5, 2.8], gravity: .5 });
      play('unlock');
      this.receipt.group.visible = false;
      this.collectionDebt = 0;
      this.ticket.visible = false;
      this.shown = null;
      this.mask = null;
      this.pendingScratch.clear();
      this.tweens.length = 0;
      this.tweens.push({ elapsed: 0, duration: 2.4, step: () => undefined, done: () => { if (this.view === 'altar') this.look('shop'); } });
    }
    if (!changedLife && this.state?.ticket && !state.ticket) this.collectionDebt = this.state.rentDebt;
    if (!changedLife && this.state && state.rentElapsedMs < this.state.rentElapsedMs) {
      this.rentStamp = 2.8;
      if (this.ready) {
        this.particles.emit(this.rent.group.position.clone(), { name: 'coin', count: 5, speed: [.2, .45], spread: .8, size: [.07, .1], life: [.5, .8] });
        play('coin-1', .35);
      }
    }
    this.state = state;
    if (this.ready) this.sync();
    if ((changedLife || availabilityChanged) && this.ready) this.resize();
  }

  setPaused(paused: boolean): void { this.paused = paused; this.clock(performance.now()); }

  setAltarArmed(armed: boolean): void {
    this.altarArmed = armed;
    if (this.ready && this.state) this.altar.update(this.state, armed);
  }

  repairedTool(id: ToolId): void { this.toolShelf.repairedTool(id); }

  private clock(now: number): void {
    const elapsed = this.playClock.update(now, !this.paused && !document.hidden && document.hasFocus());
    if (elapsed) this.callbacks.onPlayTime(elapsed);
  }

  private readonly visibilityChanged = (): void => { this.clock(performance.now()); };

  look(view: View): void {
    if (this.view === view) return;
    this.saveScratch();
    this.view = view;
    if (view !== 'altar') this.setAltarArmed(false);
    this.stroke = null;
    if (!this.ready) return;
    this.aim();
    this.callbacks.onView(view);
    this.queueHudMeasurement();
  }

  dispose(): void {
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('focus', this.visibilityChanged);
    window.removeEventListener('blur', this.visibilityChanged);
    this.playClock.update(performance.now(), false);
    stopScratch();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.hudFrame);
    this.observer.disconnect();
    this.hudObserver.disconnect();
    this.hudChanges.disconnect();
    if (this.ready) {
      this.particles.dispose();
      this.toolShelf.dispose();
      disposeToolObject(this.tool);
      this.rent.dispose(); this.receipt.dispose(); this.returnTag.dispose();
      this.robots.dispose();
      this.altar.dispose();
    }
    this.faceTexture.dispose();
    this.foilTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // --- ticket -----------------------------------------------------------------------------------

  private sync(): void {
    const state = this.state;
    if (!state) return;
    this.toolShelf.update(state);
    this.robots.update(state);
    this.altar.update(state, this.altarArmed);
    const key = JSON.stringify(rentLines(state, this.rentStamp > 0));
    if (key !== this.rentKey) { this.rentKey = key; this.rent.draw(rentLines(state, this.rentStamp > 0)); }
    const ticketForReturn = state.ticket;
    this.returnTag.group.visible = !!ticketForReturn?.fakeTell && !ticketForReturn.scratchStarted && !ticketForReturn.revealed;
    this.returnTag.group.position.set(0, .052, this.metrics.height / 2 + .105);
    if (this.returnTag.group.visible && this.returnKey !== String(ticketForReturn!.serial)) {
      this.returnKey = String(ticketForReturn!.serial);
      this.returnTag.draw([{ text: t('drain.return', { cost: formatCompact(Math.floor(ticketDef(ticketForReturn!.type).price * (1 - BALANCE.fakeReturnFee))) }), size: 55 }]);
    }
    const handKey = `${state.equippedTool}:${state.toolLevels[state.equippedTool]}:${state.durability[state.equippedTool]}`;
    if (this.handKey !== handKey) {
      this.handKey = handKey;
      for (const child of [...this.tool.children]) disposeToolObject(child);
      const model = buildToolModel(state.equippedTool, state.toolLevels[state.equippedTool], false, state.durability[state.equippedTool]);
      model.rotation.x = -Math.PI / 2;
      if (state.equippedTool === 'coin') model.scale.setScalar(toolRadius(state) / 0.4);
      else model.scale.multiplyScalar(0.22);
      this.tool.add(model);
      const footprint = new THREE.Mesh(new THREE.RingGeometry(toolRadius(state) * 0.94, toolRadius(state), 48), new THREE.MeshBasicMaterial({ color: state.equippedTool === 'laser' ? 0xef4b3f : 0xffd23f, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      footprint.rotation.x = -Math.PI / 2;
      footprint.name = 'scratch-footprint';
      this.tool.add(footprint);
    }
    this.rack.update(state);
    this.board.update(state, this.view === 'board' && this.touchLayout() && this.camera.aspect > 1);
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
      if (ticketContentKey(before) !== ticketContentKey(ticket)) {
        this.show(ticket);
        this.setState(ticket);
      } else if (ticket.revealed && !before.revealed) this.reveal(ticket);
      else if (ticket.revealed !== before.revealed || ticket.scratch !== before.scratch) {
        if (!ticket.revealed && ticket.scratch && this.pendingScratch.delete(ticket.scratch)) {
          before.scratch = ticket.scratch;
        } else {
          this.show(ticket);
          this.setState(ticket);
        }
      }
      return;
    }
    if (!before && !ticket) return;
    const deal = () => {
      if (!ticket) {
        this.ticket.visible = false;
        this.callbacks.onProgress(0);
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
    this.pendingScratch.clear();
    if (before) {
      if (before.revealed) {
        this.receipt.draw(receiptLines(before, this.collectionDebt));
        this.receipt.group.visible = true;
        this.receiptTime = 5;
      }
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
    this.receipt.group.visible = false;
    this.receiptTime = 0;
    this.bombHits.clear();
    for (const index of ticket.hitBombs) this.bombHits.add(index);
    this.build(ticket.type);
    drawFace(this.faceCanvas, ticket.type, ticket, ticket.revealed);
    drawFoil(this.foilCanvas, ticket.type);
    this.faceTexture.needsUpdate = true;
    this.foilTexture.needsUpdate = true;
    this.foilMaterial.visible = !ticket.revealed;
    const { cells, height } = this.metrics.layout;
    this.mask = ticket.revealed ? null : createMask(cells, height, BALANCE.scratchThreshold);
    if (this.mask && restoreMask(this.mask, ticket.scratch)) restoreFoil(this.foilCanvas, this.mask, cells);
    this.shown = { ...ticket };
    this.pendingScratch.clear();
    this.lastScratchSent = ticket.scratch;
    this.lastScratchSave = performance.now();
    this.ticket.visible = true;
    this.returnTag.group.position.z = this.metrics.height / 2 + .105;
    this.stroke = null;
    this.callbacks.onProgress(this.mask ? scratchProgress(this.mask) : 0);
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
    this.shown = { ...ticket };
    this.pendingScratch.clear();
    this.mask = null;
    this.scratching = false;
    stopScratch();
    this.foilMaterial.visible = false;
    this.setState(ticket);
    drawFace(this.faceCanvas, ticket.type, ticket, true);
    this.faceTexture.needsUpdate = true;
    this.celebrate(ticket);
  }

  private celebrate(ticket: Ticket): void {
    const def = ticketDef(ticket.type);
    const origin = new THREE.Vector3(0, 0.12, 0);
    const burst = (name: ParticleName, count: number, fast = 1) =>
      this.particles.emit(origin, { name, count, speed: [1.4 * fast, 2.6 * fast], spread: 0.75, size: [0.07, 0.13], life: [0.8, 1.3] });
    if (ticket.prize === 0) {
      this.particles.emit(origin, { name: 'smoke-puff', count: 2, speed: [0.4, 0.65], spread: 0.5, size: [0.08, 0.12], life: [0.45, 0.65] });
      play('lose', 0.62);
      return;
    }
    const jackpot = ticket.tier === jackpotTier(def);
    const big = jackpot || ticket.tier >= def.prizes.length - 3;
    burst('coin', jackpot ? 26 : big ? 16 : 8);
    burst('star', jackpot ? 12 : big ? 8 : 4);
    if (big) burst('sparkle', 8, 1.2);
    if (jackpot) for (const name of CONFETTI) burst(name, 10, 1.3);
    play(jackpot ? 'win-jackpot' : big ? 'win-big' : 'win-small');
    const shown = this.shown;
    this.tweens.push({
      elapsed: 0,
      duration: 0.4,
      step: (k) => {
        if (this.shown === shown && !this.busy) {
          this.applyPose({ ...REST, y: Math.sin(k * Math.PI) * 0.12, turn: Math.sin(k * Math.PI * 2) * 0.04 });
        }
      },
    });
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
  private locate(): boolean {
    if (!this.hovering) return false;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, this.pointer) !== null;
  }

  private trackPointer(event: PointerEvent): void {
    this.pointerNdc.copy(this.ndc(event));
    this.hovering = Math.abs(this.pointerNdc.x) <= 1 && Math.abs(this.pointerNdc.y) <= 1;
  }

  private foilPoint(): Point {
    const { height, window } = this.metrics;
    return {
      x: (this.pointer.x + 0.5 - window.x) / window.w,
      y: (this.pointer.z + height / 2 - window.y) / window.w,
    };
  }

  /** The thing under the pointer that can be pressed, if any. */
  private pick(event: PointerEvent): Action | null {
    this.raycaster.setFromCamera(this.ndc(event), this.camera);
    for (const hit of this.raycaster.intersectObjects([this.altar.group, this.rack.group, this.board.group, this.toolShelf.group, this.robots.group, this.ticket, this.returnTag.group, this.receipt.group], true)) {
      let visible = true;
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) visible &&= node.visible;
      if (!visible) continue;
      const action = hit.object.userData.action as Action | undefined;
      if (!action) continue;
      if (action.kind === 'tool' && this.view !== 'tools') return { kind: 'tools' };
      if (action.kind === 'automation' && this.view !== 'robots') return { kind: 'robots' };
      if (action.kind === 'collect' && !(this.shown?.revealed && !this.busy)) continue;
      return action;
    }
    return null;
  }

  private canScratch(): boolean {
    return !this.returnPress && !this.paused && !document.hidden && this.mask !== null && !this.busy && this.view === 'desk' && this.settled;
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (!this.ready || this.paused || this.activePointer !== null || event.button !== 0) return;
    event.preventDefault();
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.activePointer = event.pointerId;
    this.pressed = true;
    this.stroked = false;
    this.down = { x: event.clientX, y: event.clientY };
    this.trackPointer(event);
    this.returnPress = this.pick(event)?.kind === 'return';
    if (this.returnPress) return;
    if (this.canScratch() && this.locate()) {
      this.scratching = true;
      this.stroked = true;
      this.stroke = null;
      this.scratchTo(event.timeStamp);
    }
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.ready || (this.activePointer !== null && this.activePointer !== event.pointerId)) return;
    this.trackPointer(event);
    if (event.pointerType === 'mouse') this.swayGoal.copy(this.pointerNdc);
    // A press that began while the ticket was still landing turns into a stroke once it can.
    if (this.pressed && !this.scratching && this.canScratch()) {
      this.scratching = true;
      this.stroked = true;
      this.stroke = null;
    }
    if (this.scratching) {
      if (this.canScratch() && this.locate()) this.scratchTo(event.timeStamp);
      else this.stroke = null;
      return;
    }
    if (event.pointerType !== 'mouse' || this.pressed) return;
    const action = this.pick(event);
    this.rack.hover(action?.kind === 'ticket' ? action.id : null);
    this.renderer.domElement.dataset.hot = action ? '1' : '0';
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (this.activePointer !== event.pointerId) return;
    this.activePointer = null;
    this.saveScratch();
    const down = this.down;
    // The reveal ends the stroke before the pointer lifts, so ask what the whole press did.
    const wasScratching = this.stroked;
    const wasReturn = this.returnPress;
    this.returnPress = false;
    this.pressed = false;
    this.scratching = false;
    this.stroke = null;
    this.down = null;
    if (event.pointerType !== 'mouse') this.hovering = false;
    if (!down || wasScratching || !this.ready) return;
    if (wasReturn) { this.releaseReturn(event); return; }
    const dx = event.clientX - down.x;
    const dy = event.clientY - down.y;
    if (Math.hypot(dx, dy) < 10) {
      const action = this.pick(event);
      if (action) this.press(action);
    } else if ((this.mask === null || this.view !== 'desk') && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      this.look(this.sideView(dx > 0 ? 'left' : 'right'));
    } else if ((this.mask === null || this.view !== 'desk') && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) {
      // With foil still on the mat a drag is an attempt to scratch, not a look.
      // Dragging the scene down looks up, like turning your head.
      this.nod(dy > 0 ? 'up' : 'down');
    }
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (this.activePointer !== event.pointerId) return;
    this.activePointer = null;
    this.returnPress = false;
    this.saveScratch();
    this.pressed = false;
    this.scratching = false;
    this.stroke = null;
    this.down = null;
    this.hovering = false;
  };

  private releaseReturn(event: PointerEvent): void {
    if (this.pick(event)?.kind === 'return') this.press({ kind: 'return' });
  }

  private readonly onLeave = (): void => {
    if (!this.pressed) this.hovering = false;
    this.swayGoal.set(0, 0);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.pressed && Math.abs(event.deltaY) > 4) this.nod(event.deltaY < 0 ? 'up' : 'down');
  };

  /** Looks one step up (desk to rack) or down (board or rack back to the desk). */
  nod(direction: 'up' | 'down'): void {
    if (direction === 'up') this.look('shop');
    else this.look(this.view === 'board' || this.view === 'tools' || this.view === 'robots' || this.view === 'altar' ? 'shop' : 'desk');
  }

  sideView(direction: 'left' | 'right'): View {
    const views: View[] = ['tools', 'altar', 'shop', 'board', 'robots'];
    const index = Math.max(0, views.indexOf(this.view));
    return views[(index + (direction === 'right' ? 1 : views.length - 1)) % views.length]!;
  }

  private press(action: Action): void {
    if (action.kind === 'altar') {
      if (this.view === 'altar' && action.offer) this.callbacks.onAltar();
      else this.look('altar');
    }
    else if (action.kind === 'robots') this.look('robots');
    else if (action.kind === 'automation') this.callbacks.onAutomation(action.action, action.index ?? 0);
    else if (action.kind === 'return') { this.saveScratch(); this.callbacks.onReturn(); }
    else if (action.kind === 'repair') this.callbacks.onRepair(action.id);
    else if (action.kind === 'ticket') this.callbacks.onTicket(action.id);
    else if (action.kind === 'tools') this.look('tools');
    else if (action.kind === 'tool') {
      if (action.intent) this.callbacks.onTool(action.intent);
    }
    else if (action.kind === 'collect') this.callbacks.onCollect();
    else if (this.view === 'board') this.callbacks.onBoard();
    else this.look('board');
  }

  private scratchTo(now: number): void {
    const mask = this.mask;
    if (!mask || !this.state) return;
    const m = this.metrics;
    const to = this.foilPoint();
    const from = this.stroke ?? to;
    this.stroke = to;
    const radius = toolRadius(this.state) / m.window.w;
    this.toolLean = THREE.MathUtils.clamp((to.x - from.x) * 6, -0.18, 0.18);
    const { cleared, contact } = scratchSegment(mask, from, to, radius);
    if (!contact) return;
    if (this.shown && !this.shown.scratchStarted) {
      this.shown.scratchStarted = true;
      this.returnTag.group.visible = false;
      this.callbacks.onStartScratch(this.shown);
    }
    eraseFoil(this.foilCanvas, from.x, from.y, to.x, to.y, radius);
    for (const index of cleared) peelFoil(this.foilCanvas, m.layout.cells[index]!);
    for (const index of cleared) {
      if (this.shown?.cells[index]?.type !== 'bomb' || this.bombHits.has(index)) continue;
      this.bombHits.add(index);
      const cell = m.layout.cells[index]!;
      const origin = new THREE.Vector3(m.window.x + (cell.x + cell.w / 2) * m.window.w - .5, FACE_Y + .04, m.window.y + (cell.y + cell.h / 2) * m.window.w - m.height / 2);
      this.particles.emit(origin, { name: 'smoke-puff', count: 9, speed: [.35, .8], spread: .9, size: [.09, .18], life: [.65, 1.1] });
      this.particles.emit(origin, { name: 'sparkle', count: 5, speed: [.5, 1], spread: 1, size: [.05, .1], life: [.25, .5] });
      play('ui-error', .8);
      this.callbacks.onBomb(this.shown!, index);
    }
    this.foilDirty = true;
    if (cleared.length || now - this.lastFlakes >= 45) {
      this.lastFlakes = now;
      this.particles.emit(new THREE.Vector3(m.window.x + contact.x * m.window.w - 0.5, FACE_Y + 0.02, m.window.y + contact.y * m.window.w - m.height / 2), {
        name: FLAKES[Math.floor(Math.random() * FLAKES.length)] as ParticleName,
        count: cleared.length ? 5 : 2,
        speed: [0.45, 1],
        spread: 1,
        size: [0.035, 0.065],
        life: [0.35, 0.6],
      });
    }
    const done = scratchProgress(mask);
    this.callbacks.onProgress(done);
    if (done === 1) {
      this.mask = null;
      if (this.shown) this.callbacks.onRevealed(this.shown);
    } else {
      playScratch();
      if (now - this.lastScratchSave >= 500) this.saveScratch();
    }
  }

  private updateTool(dt: number): void {
    let overFoil = false;
    if (this.canScratch() && this.locate()) {
      const { x, y } = this.foilPoint();
      const pad = (this.state ? toolRadius(this.state) : BALANCE.brushRadius) / this.metrics.window.w;
      overFoil = x >= -pad && x <= 1 + pad && y >= -pad && y <= this.metrics.layout.height + pad;
    }
    this.tool.visible = overFoil && this.tool.children.length > 0;
    const canvas = this.renderer.domElement;
    canvas.style.cursor = this.tool.visible ? 'none' : overFoil ? 'crosshair' : canvas.dataset.hot === '1' ? 'pointer' : 'default';
    this.toolLean = THREE.MathUtils.damp(this.toolLean, 0, 14, dt);
    this.toolLift = THREE.MathUtils.damp(this.toolLift, this.scratching ? 0.012 : 0.045, 38, dt);
    if (this.tool.visible) {
      animateToolModel(this.tool, dt, this.scratching && this.canScratch());
      this.tool.position.set(this.pointer.x, FACE_Y + this.toolLift, this.pointer.z);
      this.tool.rotation.set(0, this.toolLean, 0);
    }
  }

  private saveScratch(): void {
    if (!this.mask || !this.shown || scratchProgress(this.mask) === 0) return;
    const scratch = encodeMask(this.mask);
    if (scratch === this.lastScratchSent) return;
    this.lastScratchSent = scratch;
    this.lastScratchSave = performance.now();
    this.pendingScratch.add(scratch);
    this.callbacks.onScratch(this.shown, scratch);
  }

  // --- camera -----------------------------------------------------------------------------------

  /** The closest eye position along `direction` from `target` that keeps every point on screen. */
  private frameUp(target: THREE.Vector3, direction: THREE.Vector3, points: THREE.Vector3[]): THREE.Vector3 {
    const height = Math.max(1, this.host.clientHeight);
    // The HUD covers a strip at the top and the bottom of the picture.
    const top = 1 - (2 * (this.touchLayout() ? this.touchTop : 70)) / height;
    const bottom = -1 + (2 * (this.touchLayout() ? this.touchBottom : 120)) / height;
    const probe = this.camera.clone();
    probe.fov = this.fovGoal;
    probe.updateProjectionMatrix();
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
    this.settled = false;
    this.renderer.domElement.dataset.busy = '1';
    const tall = this.camera.aspect < 0.8;
    const desktop = desktopLayout(this.host.clientWidth, this.host.clientHeight);
    this.robots.group.visible = this.view !== 'desk';
    this.robots.layout(this.view === 'robots' ? tall : !desktop, this.view === 'robots');
    const counterExtension = this.room.getObjectByName('countertop-extension');
    if (counterExtension) counterExtension.visible = this.view === 'robots';
    this.fovGoal = desktop && this.view === 'shop' ? this.camera.aspect < 1.5 ? 85 : 65 : 50;
    const touch = this.touchLayout();
    if (this.state) this.board.update(this.state, this.view === 'board' && touch && this.camera.aspect > 1);
    if (touch) {
      const width = this.host.clientWidth;
      const height = this.host.clientHeight;
      const center = (this.touchTop + height - this.touchBottom) / 2;
      this.camera.setViewOffset(width, height, 0, height / 2 - center, width, height);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    let target: THREE.Vector3;
    let direction: THREE.Vector3;
    let points: THREE.Vector3[];
    // Looking at the rack, the eye rests a little above it so the shop behind shows.
    let lift = 0;
    if (this.view === 'desk') {
      const margin = .19;
      const halfW = 0.5 + margin;
      const halfH = this.metrics.height / 2 + margin;
      target = new THREE.Vector3(0, 0, 0);
      direction = gaze(desktop ? 72 : touch && !tall ? 85 : tall ? 60 : 50);
      points = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3(sx * halfW, FACE_Y, sz * halfH)));
      if (desktop) {
        for (const name of ['cash-register', 'gold-bag', 'coins']) {
          const prop = this.room.getObjectByName(name);
          if (!prop) continue;
          const box = new THREE.Box3().setFromObject(prop);
          points.push(...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => new THREE.Vector3(
            sx < 0 ? box.min.x : box.max.x,
            sy < 0 ? box.min.y : box.max.y,
            sz < 0 ? box.min.z : box.max.z,
          )))));
        }
      }
    } else if (this.view === 'shop') {
      points = this.rack.points();
      points.push(...this.altar.points());
      this.rent.group.updateWorldMatrix(true, false);
      points.push(...[-1, 1].flatMap(x => [-1, 1].map(y => this.rent.group.localToWorld(new THREE.Vector3(x * .69, y * .25, .03)))));
      const sign = touch && tall ? this.room.getObjectByName('shop-sign') : null;
      if (sign) {
        const box = new THREE.Box3().setFromObject(sign);
        points.push(...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => new THREE.Vector3(
          sx < 0 ? box.min.x : box.max.x,
          sy < 0 ? box.min.y : box.max.y,
          box.max.z,
        ))));
      }
      if (!tall && !touch) points.push(...this.board.points());
      if (desktop) {
        points.push(...[-1.5, 1.5].flatMap((x) => [0.68, 1.6].map((y) => new THREE.Vector3(x, y, -1.7))));
      }
      const box = new THREE.Box3().setFromPoints(points);
      target = box.getCenter(new THREE.Vector3());
      direction = gaze(13);
      lift = desktop ? this.camera.aspect < 1.5 ? 0.2 : 0.03 : touch ? 0 : 0.34;
    } else if (this.view === 'robots') {
      points = this.robots.points();
      target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      if (!tall) target.y -= .45;
      direction = gaze(tall ? 70 : this.camera.aspect > 2 ? 15 : 25);
    } else if (this.view === 'tools') {
      points = this.toolShelf.points();
      target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      direction = gaze(6, this.toolShelf.group.rotation.y);
    } else if (this.view === 'altar') {
      points = this.altar.points();
      target = new THREE.Box3().setFromPoints(points).getCenter(new THREE.Vector3());
      direction = gaze(desktop ? 4 : 2);
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
    const desktop = desktopLayout(width, height);
    this.altar.group.position.set(tall ? 0 : -1.1, tall ? 2.65 : 1.98, WALL_Z + .15);
    this.altar.group.scale.setScalar(.8);
    this.robots.layout(!desktop);
    this.rack.layout(tall);
    const shelf = this.room.getObjectByName('shelf');
    if (shelf) {
      shelf.position.y = desktop ? 0.2 : tall ? 4.5 : 0;
      shelf.position.z = desktop ? WALL_Z * 0.38 : 0;
      shelf.scale.setScalar(desktop ? 0.62 : 1);
    }
    const sign = this.room.getObjectByName('shop-sign');
    if (sign) {
      sign.position.y = desktop ? 1.5 : tall ? 2.25 : 1.8;
      sign.scale.setScalar(desktop ? 0.85 : 1);
    }
    this.rent.group.position.set(desktop ? 1.65 : 0, desktop ? 1.43 : tall ? 1.72 : 1.45, desktop ? RACK_Z - .05 : RACK_Z - .45);
    this.rent.group.scale.setScalar(desktop ? .85 : tall ? 1.05 : .85);
    this.room.children.forEach((prop) => layoutCounterProp(prop, desktop));
    this.board.group.scale.setScalar(desktop ? 0.86 : 1);
    const boardX = desktop ? 1.8 : tall ? 1.22 : 1.75;
    this.board.group.position.set(boardX + (this.state?.prestige.tier && !tall ? .35 : 0), 0, RACK_Z - 0.05);
    this.board.group.rotation.y = tall ? -0.3 : -0.38;
    this.aim();
    this.queueHudMeasurement();
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
    for (const def of TICKETS.filter(def => (def.minimumPrestige ?? 0) <= (this.state?.prestige.tier ?? 0))) rack[def.id] = screen(this.rack.anchor(def.id));
    canvas.dataset.rack = JSON.stringify(rack);
    canvas.dataset.board = JSON.stringify(screen(new THREE.Box3().setFromPoints(this.board.points()).getCenter(new THREE.Vector3())));
    canvas.dataset.altar = JSON.stringify(screen(this.altar.anchor()));
    canvas.dataset.altarArmed = this.altarArmed ? '1' : '0';
    canvas.dataset.tools = JSON.stringify(Object.fromEntries(TOOLS.map(tool => [tool.id, screen(this.toolShelf.anchor(tool.id))])));
    canvas.dataset.equippedTool = this.state?.equippedTool ?? 'coin';
    canvas.dataset.repairs = JSON.stringify(Object.fromEntries(TOOLS.map(tool => [tool.id, screen(this.toolShelf.repairAnchor(tool.id))])));
    canvas.dataset.rent = JSON.stringify(screen(this.rent.group.position));
    canvas.dataset.return = JSON.stringify(screen(this.returnTag.group.position));
    canvas.dataset.receipt = this.receipt.group.visible ? '1' : '0';
    canvas.dataset.radius = String(this.state ? toolRadius(this.state) : 0);
    canvas.dataset.toolLevel = String(this.state?.toolLevels[this.state.equippedTool] ?? 0);
    canvas.dataset.ticket = JSON.stringify(screen(new THREE.Vector3(0, FACE_Y, 0)));
    canvas.dataset.view = this.view;
    canvas.dataset.robots = JSON.stringify(screen(this.robots.group.localToWorld(new THREE.Vector3(0, 1.9, .4))));
    canvas.dataset.robotOffers = JSON.stringify(Object.fromEntries(Object.entries(this.robots.offerAnchors()).map(([action, point]) => [action, screen(point)])));
    canvas.dataset.robotSlots = JSON.stringify(this.robots.robotAnchors().map(screen));
    canvas.dataset.busy = this.busy || !this.settled ? '1' : '0';
  }

  private readonly tick = (time: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (time - this.last) / 1000 || 0);
    this.last = time;
    if (this.ready) this.clock(time);
    if (this.paused || document.hidden) return;
    this.robots?.tick(dt, time);
    if (this.altar?.eligible) {
      this.incenseTime -= dt;
      if (this.incenseTime <= 0) {
        this.incenseTime = .65;
        this.particles.emit(this.altar.smokePoint(), { name: 'smoke-puff', count: 1, speed: [.08, .14], spread: .2, size: [.055, .095], life: [1.4, 2.1], gravity: -.02 });
      }
    }
    if (this.rentStamp > 0) { this.rentStamp = Math.max(0, this.rentStamp - dt); if (!this.rentStamp && this.state) this.sync(); }
    if (this.receiptTime > 0) { this.receiptTime -= dt; if (this.receiptTime <= 0) this.receipt.group.visible = false; }

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
    if (Math.abs(this.camera.fov - this.fovGoal) > 0.001) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.fovGoal, ease);
      this.camera.updateProjectionMatrix();
    }
    this.settled = this.eye.distanceTo(this.eyeGoal) < 0.004 && this.focus.distanceTo(this.focusGoal) < 0.004 && Math.abs(this.camera.fov - this.fovGoal) < 0.02;
    if (this.settled) {
      this.eye.copy(this.eyeGoal);
      this.focus.copy(this.focusGoal);
    }
    const lean = this.view === 'desk' || this.pressed ? 0 : 1;
    this.sway.lerp(this.swayTarget.set(this.swayGoal.x * lean, this.swayGoal.y * lean), Math.min(1, dt * 5));
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.focus.x + this.sway.x * 0.12, this.focus.y + this.sway.y * 0.07, this.focus.z);
    this.camera.updateMatrixWorld();

    if (this.foilDirty) {
      this.foilTexture.needsUpdate = true;
      this.foilDirty = false;
    }

    this.updateTool(dt);
    if (this.state) this.toolShelf.tick(dt, this.state);

    this.particles.update(dt);
    if (this.ticks++ % 10 === 0) this.publish();
    this.renderer.render(this.scene, this.camera);
  };
}
