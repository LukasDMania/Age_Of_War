import Phaser from 'phaser';
import {
  CAMERA_THUMP,
  EXPLODING_UNITS,
  PROJECTILE_IMPACT,
  PROJECTILE_SPIN,
  PROJECTILE_TRAIL,
  SCORCH_MS,
  TRAIL_INTERVAL_MS,
  type TrailStyle,
} from '@config/effects.config';
import { BASE_X, LANE_Y } from '@config/constants';
import type { FxTextureId } from '@/art/fxDraw';
import { CameraThump } from '@entities/CameraThump';
import type { Projectile } from '@entities/Projectile';
import { laneDir, type Side } from '@state/types';
import { Events, on, type EventPayloads, type UtilityKind } from '@utils/EventBus';
import { FX_SUPERSAMPLE } from '@utils/FxArt';
import { ObjectPool } from '@utils/ObjectPool';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/** Particle textures are supersampled; scales in configs are multiplied by this. */
const INV = 1 / FX_SUPERSAMPLE;
/** The HUD's side: its kills pop coins, its base thumps the screen. */
const HUD_SIDE: Side = 'player';

const FIRE_TINTS = [0xffe07a, 0xffb040, 0xf27a2c, 0xe0502c];
const METAL_SPARK = [0xfff2b0, 0xffd35a, 0xffffff];
const CYAN = [0x9ff8ff, 0x5ff5e0, 0xffffff];
const PURPLE = [0xd9b8ff, 0xb070ff, 0xffffff];

/**
 * Particle feedback (2026-09-26): projectile trails and spin, impacts styled
 * per projectile (dust and rock chunks, splinters, fire, oil, sparks,
 * explosions with scorch marks, laser, rail and plasma bursts), melee blows,
 * exploding machines, coins popping from the player's kills, utility
 * particles, and the graceful camera thump for heavy blows, big blasts and
 * base hits (see `CameraThump`, `CAMERA_THUMP`).
 *
 * Purely visual and event driven, like `HitEffects`. Particles and tweens
 * run on real time. `muted` skips everything (bulk simulation steps in dev
 * tooling and AI training).
 *
 * Listens for: `projectile-impact`, `unit-struck`, `turret-fired`,
 * `unit-died`, `utility-pulse`, `base-damaged`, `base-destroyed`,
 * `age-changed`.
 */
export class ImpactEffects {
  /** Set while the simulation runs in bulk without rendering. */
  muted = false;
  readonly thump = new CameraThump();
  private readonly scene: Phaser.Scene;
  private readonly cleanups: (() => void)[];
  private readonly em: Record<string, Emitter> = {};
  private readonly flashes: ObjectPool<Phaser.GameObjects.Image>;
  private readonly scorches: ObjectPool<Phaser.GameObjects.Image>;
  private readonly trailAt = new WeakMap<Projectile, number>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const make = (name: string, key: FxTextureId, depth: number, config: EmitterConfig): void => {
      const e = scene.add.particles(0, 0, key, { ...config, emitting: false });
      e.setDepth(depth);
      this.em[name] = e;
    };
    make('dust', 'fx-puff', 1.05, {
      speed: { min: 15, max: 70 }, angle: { min: 200, max: 340 }, gravityY: -12,
      scale: { start: 0.45 * INV, end: 1.25 * INV }, alpha: { start: 0.65, end: 0 },
      lifespan: { min: 450, max: 800 }, tint: [0xc8b89a, 0xb0a080, 0xd8ccb0], maxParticles: 160,
    });
    make('smoke', 'fx-puff', 3.4, {
      speed: { min: 8, max: 40 }, angle: { min: 235, max: 305 }, gravityY: -35,
      scale: { start: 0.55 * INV, end: 1.8 * INV }, alpha: { start: 0.55, end: 0 },
      lifespan: { min: 800, max: 1300 }, tint: [0x5a5550, 0x6e6860, 0x48443f], maxParticles: 160,
    });
    make('fire', 'fx-soft', 3.5, {
      speed: { min: 20, max: 130 }, angle: { min: 180, max: 360 }, gravityY: -60,
      scale: { start: 0.75 * INV, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 220, max: 480 }, tint: FIRE_TINTS, blendMode: 'ADD', maxParticles: 220,
    });
    make('sparks', 'fx-spark', 3.6, {
      speed: { min: 70, max: 230 }, angle: { min: 190, max: 350 }, gravityY: 420,
      scale: { start: 0.5 * INV, end: 0 }, alpha: { start: 1, end: 0.2 },
      lifespan: { min: 180, max: 420 }, tint: METAL_SPARK, blendMode: 'ADD', maxParticles: 200,
    });
    make('cyan', 'fx-spark', 3.6, {
      speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 }, gravityY: 60,
      scale: { start: 0.55 * INV, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 180, max: 380 }, tint: CYAN, blendMode: 'ADD', maxParticles: 160,
    });
    make('purple', 'fx-soft', 3.5, {
      speed: { min: 30, max: 120 }, angle: { min: 0, max: 360 },
      scale: { start: 0.5 * INV, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: { min: 250, max: 500 }, tint: PURPLE, blendMode: 'ADD', maxParticles: 160,
    });
    make('chunks', 'fx-chunk', 3.3, {
      speed: { min: 60, max: 170 }, angle: { min: 205, max: 335 }, gravityY: 560,
      scale: { min: 0.7 * INV, max: 1.25 * INV }, rotate: { start: 0, end: 540 },
      alpha: { start: 1, end: 0.6 }, lifespan: { min: 500, max: 800 },
      tint: [0x9a948c, 0x7a746c, 0xb0a898], maxParticles: 160,
    });
    make('splinters', 'fx-splinter', 3.3, {
      speed: { min: 40, max: 140 }, angle: { min: 200, max: 340 }, gravityY: 520,
      scale: { min: 0.7 * INV, max: 1.1 * INV }, rotate: { start: 0, end: 720 },
      alpha: { start: 1, end: 0.5 }, lifespan: { min: 350, max: 600 }, maxParticles: 120,
    });
    make('drops', 'fx-drop', 3.3, {
      speed: { min: 40, max: 150 }, angle: { min: 200, max: 340 }, gravityY: 600,
      scale: { min: 0.7 * INV, max: 1.2 * INV }, alpha: { start: 1, end: 0.6 },
      lifespan: { min: 400, max: 650 }, tint: [0x2b2418, 0x3a2e1c, 0x1a140c], maxParticles: 120,
    });
    make('steam', 'fx-puff', 3.4, {
      speed: { min: 10, max: 40 }, angle: { min: 245, max: 295 }, gravityY: -40,
      scale: { start: 0.4 * INV, end: 1.2 * INV }, alpha: { start: 0.45, end: 0 },
      lifespan: { min: 600, max: 900 }, tint: 0xf0f0f0, maxParticles: 120,
    });
    make('coins', 'fx-coin', 3.8, {
      speed: { min: 70, max: 130 }, angle: { min: 240, max: 300 }, gravityY: 380,
      scale: { start: 1 * INV, end: 0.8 * INV }, rotate: { start: 0, end: 360 },
      alpha: { start: 1, end: 0 }, lifespan: { min: 650, max: 850 }, maxParticles: 80,
    });
    make('plus', 'fx-plus', 3.8, {
      speedY: { min: -45, max: -25 }, speedX: { min: -8, max: 8 },
      scale: { start: 1 * INV, end: 0.6 * INV }, alpha: { start: 1, end: 0 },
      lifespan: { min: 700, max: 1000 }, tint: [0x8fe08f, 0x6fcf6f, 0xc8ffc8], maxParticles: 80,
    });
    make('gold', 'fx-spark', 3.8, {
      speedY: { min: -60, max: -25 }, speedX: { min: -10, max: 10 },
      scale: { start: 0.55 * INV, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 600, max: 900 }, tint: [0xffe07a, 0xf2c744, 0xffffff], blendMode: 'ADD', maxParticles: 100,
    });
    make('mist', 'fx-soft', 3.2, {
      speed: { min: 5, max: 20 }, angle: { min: 0, max: 360 }, gravityY: -8,
      scale: { start: 0.6 * INV, end: 1.3 * INV }, alpha: { start: 0.35, end: 0 },
      lifespan: { min: 800, max: 1200 }, tint: [0xb070ff, 0x8a50d8], blendMode: 'ADD', maxParticles: 100,
    });
    // Trails.
    make('trail-smoke', 'fx-puff', 2.9, {
      speed: { min: 0, max: 8 }, scale: { start: 0.25 * INV, end: 0.7 * INV },
      alpha: { start: 0.45, end: 0 }, lifespan: 500, tint: 0x8a857c, maxParticles: 200,
    });
    make('trail-fire', 'fx-soft', 2.95, {
      speed: { min: 0, max: 12 }, scale: { start: 0.55 * INV, end: 0 }, gravityY: -30,
      alpha: { start: 0.9, end: 0 }, lifespan: 260, tint: FIRE_TINTS, blendMode: 'ADD', maxParticles: 220,
    });
    make('trail-spark', 'fx-spark', 2.95, {
      speed: { min: 10, max: 40 }, angle: { min: 0, max: 360 }, gravityY: 120,
      scale: { start: 0.35 * INV, end: 0 }, alpha: { start: 1, end: 0 }, lifespan: 250,
      tint: METAL_SPARK, blendMode: 'ADD', maxParticles: 120,
    });
    make('trail-cyan', 'fx-soft', 2.95, {
      speed: 0, scale: { start: 0.35 * INV, end: 0 }, alpha: { start: 0.8, end: 0 }, lifespan: 180,
      tint: CYAN, blendMode: 'ADD', maxParticles: 200,
    });
    make('trail-purple', 'fx-soft', 2.95, {
      speed: { min: 0, max: 10 }, scale: { start: 0.45 * INV, end: 0 }, alpha: { start: 0.85, end: 0 }, lifespan: 260,
      tint: PURPLE, blendMode: 'ADD', maxParticles: 200,
    });
    make('trail-steam', 'fx-puff', 2.9, {
      speed: { min: 0, max: 8 }, gravityY: -20, scale: { start: 0.2 * INV, end: 0.55 * INV },
      alpha: { start: 0.35, end: 0 }, lifespan: 420, tint: 0xeeeeee, maxParticles: 120,
    });

    this.flashes = new ObjectPool({
      create: () => scene.add.image(0, 0, 'fx-soft').setDepth(3.7).setBlendMode(Phaser.BlendModes.ADD),
      onRelease: (img) => img.setActive(false).setVisible(false),
      onDestroy: (img) => img.destroy(),
      prewarm: 10,
    });
    this.scorches = new ObjectPool({
      create: () => scene.add.image(0, 0, 'fx-scorch').setDepth(0.3),
      onRelease: (img) => img.setActive(false).setVisible(false),
      onDestroy: (img) => img.destroy(),
      prewarm: 8,
    });

    this.cleanups = [
      on(Events.ProjectileImpact, (p) => this.onImpact(p)),
      on(Events.UnitStruck, (p) => this.onStruck(p)),
      on(Events.TurretFired, ({ turretId, x, y }) => this.onTurretFired(turretId, x, y)),
      on(Events.UnitDied, ({ side, unitId, x, killerSide }) => this.onDied(side, unitId, x, killerSide)),
      on(Events.UtilityPulse, ({ kind, x, radius }) => this.onPulse(kind, x, radius)),
      on(Events.BaseDamaged, ({ side }) => this.onBaseHit(side)),
      on(Events.BaseDestroyed, ({ side }) => this.onBaseDestroyed(side)),
      on(Events.AgeChanged, ({ side }) => {
        if (side === HUD_SIDE && !this.muted) this.burst('gold', 24, BASE_X[side], LANE_Y - 90, 60, 50);
      }),
    ];
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    for (const e of Object.values(this.em)) e.destroy();
    this.flashes.destroy();
    this.scorches.destroy();
    this.thump.clear();
  }

  /**
   * Once per rendered frame: trails behind projectiles in flight and spin of
   * round ones. `deltaMs` is real time.
   */
  updateTrails(projectiles: ReadonlySet<Projectile>, now: number, deltaMs: number): void {
    if (this.muted) return;
    for (const p of projectiles) {
      const spin = PROJECTILE_SPIN[p.key];
      if (spin) p.rotation += ((p.dirX < 0 ? -spin : spin) * deltaMs) / 1000;
      const style = PROJECTILE_TRAIL[p.key];
      if (!style) continue;
      const last = this.trailAt.get(p) ?? -Infinity;
      if (now - last < TRAIL_INTERVAL_MS) continue;
      this.trailAt.set(p, now);
      this.trail(style, p.x - p.dirX * 4, p.y - p.dirY * 4);
    }
  }

  private trail(style: TrailStyle, x: number, y: number): void {
    const name = {
      smoke: 'trail-smoke',
      fire: 'trail-fire',
      spark: 'trail-spark',
      laser: 'trail-cyan',
      rail: 'trail-cyan',
      plasma: 'trail-purple',
      steam: 'trail-steam',
    }[style];
    this.em[name]?.emitParticleAt(x, y, style === 'fire' ? 2 : 1);
  }

  /* ---- Building blocks ---------------------------------------------------- */

  /** Emits `count` particles scattered over a box around (x, y). */
  private burst(name: string, count: number, x: number, y: number, spreadX = 0, spreadY = 0): void {
    const e = this.em[name];
    if (!e || count <= 0) return;
    if (spreadX === 0 && spreadY === 0) {
      e.explode(count, x, y);
      return;
    }
    for (let i = 0; i < count; i++) {
      e.explode(1, x + Phaser.Math.FloatBetween(-spreadX, spreadX), y + Phaser.Math.FloatBetween(-spreadY, spreadY));
    }
  }

  /** A bright additive flash that grows and fades. */
  private flash(x: number, y: number, radius: number, tint: number, ms = 180, key: FxTextureId = 'fx-soft'): void {
    const img = this.flashes.acquire();
    const size = (radius * 2) / (32 * FX_SUPERSAMPLE) * FX_SUPERSAMPLE;
    img
      .setTexture(key)
      .setPosition(x, y)
      .setTint(tint)
      .setScale((size * 0.6) / FX_SUPERSAMPLE)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: img,
      scale: (size * 1.4) / FX_SUPERSAMPLE,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => this.flashes.release(img),
    });
  }

  /** An expanding shockwave ring lying on the lane. */
  private ring(x: number, radius: number, tint: number, ms = 320): void {
    const img = this.flashes.acquire();
    const base = (radius * 2) / 64;
    img
      .setTexture('fx-ring')
      .setPosition(x, LANE_Y - 2)
      .setTint(tint)
      .setScale((base * 0.3) / FX_SUPERSAMPLE, (base * 0.3 * 0.3) / FX_SUPERSAMPLE)
      .setAlpha(0.8)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: img,
      scaleX: base / FX_SUPERSAMPLE,
      scaleY: (base * 0.3) / FX_SUPERSAMPLE,
      alpha: 0,
      duration: ms,
      ease: 'Cubic.easeOut',
      onComplete: () => this.flashes.release(img),
    });
  }

  /** A dark burn mark on the ground that fades out. */
  private scorch(x: number, width: number): void {
    const img = this.scorches.acquire();
    img
      .setPosition(x, LANE_Y + 2)
      .setScale(width / 64 / FX_SUPERSAMPLE * 1, (width / 64 / FX_SUPERSAMPLE) * 0.9)
      .setAlpha(0.9)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      delay: SCORCH_MS * 0.5,
      duration: SCORCH_MS * 0.5,
      onComplete: () => this.scorches.release(img),
    });
  }

  private explosion(x: number, y: number, radius: number, heavy = false): void {
    const r = Math.max(16, radius);
    this.flash(x, y, r * 1.4, 0xfff0b0, 200);
    this.burst('fire', Math.round(8 + r / 5), x, y, r * 0.3, r * 0.2);
    this.burst('smoke', Math.round(3 + r / 14), x, y - 6, r * 0.3, 4);
    this.burst('chunks', Math.round(4 + r / 12), x, Math.min(y, LANE_Y - 2), r * 0.2, 0);
    this.burst('sparks', 6, x, y);
    if (y >= LANE_Y - 30) {
      this.ring(x, r, 0xffc070);
      this.scorch(x, r * 1.6);
    }
    if (heavy || radius >= CAMERA_THUMP.bigBlastRadius) this.thumpAt(CAMERA_THUMP.bigBlast, x);
  }

  /** A thump for something at world x, only when it is on screen. */
  private thumpAt(config: typeof CAMERA_THUMP.heavyStrike, x: number, scale = 1): void {
    const view = this.scene.cameras.main.worldView;
    if (x < view.x - 40 || x > view.right + 40) return;
    this.thump.add(config, this.scene.time.now, scale);
  }

  /* ---- Event handlers ------------------------------------------------------- */

  private onImpact({ key, x, y, radius, target }: EventPayloads[typeof Events.ProjectileImpact]): void {
    if (this.muted) return;
    const gy = target === 'ground' ? LANE_Y - 1 : y;
    switch (PROJECTILE_IMPACT[key] ?? 'dust') {
      case 'dust':
        this.burst('dust', key === 'proj-boulder' ? 5 : 2, x, gy);
        this.burst('chunks', key === 'proj-boulder' ? 7 : 3, x, gy);
        break;
      case 'splinter':
        this.burst('splinters', key === 'proj-ballista' ? 7 : 4, x, gy);
        if (target === 'ground') this.burst('dust', 1, x, gy);
        break;
      case 'fire':
        this.flash(x, gy, Math.max(24, radius), 0xffa040, 220);
        this.burst('fire', 16, x, gy, radius * 0.35, 6);
        this.burst('smoke', 4, x, gy - 6, radius * 0.3, 4);
        this.burst('sparks', 6, x, gy);
        if (radius > 0) this.scorch(x, radius * 1.6);
        break;
      case 'oil':
        this.burst('drops', 14, x, gy);
        this.burst('steam', 6, x, gy - 4, radius * 0.4, 4);
        if (radius > 0) this.scorch(x, radius * 1.2);
        break;
      case 'bullet':
        this.burst('sparks', 3, x, gy);
        if (target === 'ground') this.burst('dust', 1, x, gy);
        break;
      case 'cannon':
        this.flash(x, gy, 20, 0xffe0a0, 140);
        this.burst('dust', 4, x, gy);
        this.burst('chunks', 6, x, gy);
        this.burst('smoke', 2, x, gy - 4);
        break;
      case 'explosion':
        this.explosion(x, gy, radius);
        break;
      case 'meteor':
        this.explosion(x, gy, Math.max(radius, 30), true);
        this.burst('fire', 10, x, gy - 8, 10, 6);
        break;
      case 'laser':
        this.flash(x, gy, 14, 0x9ff8ff, 120);
        this.burst('cyan', 5, x, gy);
        break;
      case 'rail':
        this.flash(x, gy, 26, 0xe8f8ff, 180);
        this.burst('cyan', 12, x, gy);
        this.ring(x, 24, 0x9fd8ff, 240);
        break;
      case 'plasma':
        this.flash(x, gy, Math.max(20, radius), 0xb070ff, 220);
        this.burst('purple', 14, x, gy, radius * 0.25, 4);
        this.burst('cyan', 3, x, gy);
        if (radius > 0) {
          this.ring(x, radius, 0xb070ff);
          this.scorch(x, radius * 1.3);
        }
        break;
      case 'orbital':
        this.flash(x, gy, Math.max(40, radius * 1.4), 0xffffff, 260);
        this.burst('cyan', 18, x, gy);
        this.burst('smoke', 6, x, gy - 6, radius * 0.4, 4);
        this.ring(x, Math.max(radius, 40), 0xaef8ff, 380);
        this.scorch(x, radius * 1.8);
        this.thumpAt(CAMERA_THUMP.bigBlast, x);
        break;
    }
  }

  private onStruck({ unitId, slot, frontX, x, ranged, side }: EventPayloads[typeof Events.UnitStruck]): void {
    if (this.muted) return;
    const age = unitId.split('-')[0];
    if (ranged) {
      // Heavy guns (tank, mech) rock the ground a little when they fire.
      if (slot === 3) this.thumpAt(CAMERA_THUMP.heavyStrike, x, 0.6);
      return;
    }
    const hitX = frontX + laneDir(side) * 4;
    const hitY = LANE_Y - (slot === 3 ? 28 : 24);
    if (age === 'stone') this.burst('dust', 1, hitX, hitY + 10);
    else if (age === 'future') this.burst('cyan', 5, hitX, hitY);
    else this.burst('sparks', 4, hitX, hitY);
    if (slot === 3) {
      // Heavy blow: dust kicked up along the ground and a graceful thump.
      this.burst('dust', 6, hitX, LANE_Y - 2, 14, 0);
      this.ring(hitX, 26, 0xd8c8a8, 300);
      this.thumpAt(CAMERA_THUMP.heavyStrike, hitX);
    }
  }

  private onTurretFired(turretId: string, x: number, y: number): void {
    if (this.muted) return;
    const age = turretId.split('-')[0];
    if (age === 'renaissance' || age === 'modern') this.burst('smoke', 1, x, y);
  }

  private onDied(side: Side, unitId: string, x: number, killerSide: Side): void {
    if (this.muted) return;
    if (EXPLODING_UNITS.has(unitId)) this.explosion(x, LANE_Y - 22, 32, unitId === 'modern-tank' || unitId === 'future-mech');
    else this.burst('dust', 3, x, LANE_Y - 3, 10, 0);
    if (killerSide === HUD_SIDE && side !== HUD_SIDE) this.burst('coins', 4, x, LANE_Y - 36, 6, 4);
  }

  private onPulse(kind: UtilityKind, x: number, radius: number): void {
    if (this.muted) return;
    const spread = Math.min(radius, 90);
    switch (kind) {
      case 'heal':
        this.burst('plus', 7, x, LANE_Y - 36, spread, 16);
        break;
      case 'shield':
        this.flash(x, LANE_Y - 30, 34, 0x8fe0ff, 360, 'fx-hex');
        this.burst('cyan', 8, x, LANE_Y - 30, spread * 0.5, 14);
        break;
      case 'slow':
        this.burst('mist', 8, x, LANE_Y - 20, spread, 10);
        break;
      case 'buff':
        this.burst('gold', 8, x, LANE_Y - 30, spread * 0.6, 14);
        break;
      case 'aoe':
        break;
    }
  }

  private onBaseHit(side: Side): void {
    if (this.muted) return;
    const x = BASE_X[side] + laneDir(side) * 52;
    const y = LANE_Y - Phaser.Math.Between(20, 150);
    this.burst('chunks', 2, x, y);
    this.burst('dust', 1, x, y);
    if (side === HUD_SIDE) this.thump.add(CAMERA_THUMP.baseHit, this.scene.time.now);
  }

  private onBaseDestroyed(side: Side): void {
    this.thump.add(CAMERA_THUMP.baseDestroyed, this.scene.time.now);
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 140, () =>
        this.explosion(BASE_X[side] + Phaser.Math.Between(-45, 45), LANE_Y - Phaser.Math.Between(10, 150), 40),
      );
    }
  }
}
