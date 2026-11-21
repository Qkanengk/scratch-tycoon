import * as THREE from 'three';
import { canvasTexture, PARTICLES, rasterize, type ParticleName } from './assets';

interface Particle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  spin: number;
  size: number;
  age: number;
  life: number;
  gravity: number;
}

export interface Burst {
  name: ParticleName;
  count: number;
  /** Launch speed range, world units per second. */
  speed: [number, number];
  /** How far sideways the launch direction may lean from straight up (0 to 1). */
  spread: number;
  size: [number, number];
  life: [number, number];
  gravity?: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Flat sticker particles (foil flakes, coins, stars, confetti) that always face the camera. */
export class Particles {
  readonly group = new THREE.Group();
  private readonly textures = new Map<ParticleName, THREE.Texture>();
  private readonly live: Particle[] = [];
  private readonly pool: THREE.Sprite[] = [];

  constructor(private readonly limit = 220) {
    for (const name of PARTICLES) this.textures.set(name, canvasTexture(rasterize(`particles/${name}.svg`, 128)));
  }

  emit(origin: THREE.Vector3, burst: Burst): void {
    for (let i = 0; i < burst.count && this.live.length < this.limit; i++) {
      const sprite = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.material.map = this.textures.get(burst.name) ?? null;
      sprite.material.opacity = 1;
      sprite.material.rotation = rand(0, Math.PI * 2);
      sprite.position.copy(origin);
      const angle = rand(0, Math.PI * 2);
      const lean = rand(0, burst.spread);
      const speed = rand(...burst.speed);
      const velocity = new THREE.Vector3(Math.cos(angle) * lean, 1, Math.sin(angle) * lean).normalize().multiplyScalar(speed);
      const size = rand(...burst.size);
      sprite.scale.setScalar(size);
      this.group.add(sprite);
      this.live.push({ sprite, velocity, spin: rand(-6, 6), size, age: 0, life: rand(...burst.life), gravity: burst.gravity ?? 3.2 });
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i] as Particle;
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.sprite);
        this.pool.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      // Flakes come to rest on the table instead of falling through it.
      if (p.sprite.position.y < 0.03) {
        p.sprite.position.y = 0.03;
        p.velocity.set(0, 0, 0);
        p.spin = 0;
      }
      p.sprite.material.rotation += p.spin * dt;
      const left = 1 - p.age / p.life;
      p.sprite.material.opacity = Math.min(1, left * 4);
      p.sprite.scale.setScalar(p.size * Math.min(1, p.age * 14 + 0.3));
    }
  }

  dispose(): void {
    for (const texture of this.textures.values()) texture.dispose();
    for (const sprite of [...this.pool, ...this.live.map((p) => p.sprite)]) sprite.material.dispose();
  }
}
