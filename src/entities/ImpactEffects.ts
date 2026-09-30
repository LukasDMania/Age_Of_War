import Phaser from 'phaser';
import {
  CAMERA_THUMP,
  EXPLODING_UNITS,
  MUZZLE_STYLE,
  PROJECTILE_IMPACT,
  PROJECTILE_SPIN,
  PROJECTILE_STREAK,
  PROJECTILE_TRAIL,
  SCORCH_MS,
  SLASH_TINTS,
  SPECIAL_SKY_FLASH,
  TRAIL_INTERVAL_MS,
  type StreakStyle,
  type TrailStyle,
} from '@config/effects.config';
import { BASE_X, GAME_HEIGHT, GAME_WIDTH, LANE_Y } from '@config/constants';
import { FX_SIZE } from '@/art/fxDraw';
import { findUnitDefinition } from '@entities/unitDefinitions';
import { activeBuildingIds, buildingStage, buildingX } from '@config/buildings.config';
import type { FxTextureId } from '@/art/fxDraw';
import { CameraThump } from '@entities/CameraThump';
import type { Projectile } from '@entities/Projectile';
import { laneDir, type Side } from '@state/types';
import { Events, on, type EventPayloads, type UtilityKind } from '@utils/EventBus';
import { FX_SUPERSAMPLE } from '@utils/FxArt';
import { ObjectPool } from '@utils/ObjectPool';
import { HEADLESS_SIM } from '@utils/runtimeFlags';

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
 * Effects rehaul (2026-09-28, owner: "make the visuals look more
 * impressive"): every projectile draws a motion streak and, for fire and
 * energy, a glow (`PROJECTILE_STREAK`, redrawn each frame on two Graphics);
 * units' shots flash at the weapon's muzzle (`MUZZLE_STYLE`); melee blows
 * slash (an arc in the age's tint) and sparkle; hits on units sparkle;
 * explosions layer a flare, a fireball, embers and a rising smoke column;
 * heavies fall with a dust ring; a special flashes the sky; ricochets streak;
 * the player's age-up flares over the base.
 *
 * Listens for: `projectile-impact`, `unit-struck`, `turret-fired`,
 * `unit-died`, `utility-pulse`, `base-damaged`, `base-destroyed`,
 * `age-changed`, `building-upgraded`, `special-fired`, `shot-bounced`,
 * `weapon-fx` and `mech-ability-used` (Mech weapons, parts and modules).
 */
export class ImpactEffects {
  /** Set while the simulation runs in bulk without rendering. */
  muted = HEADLESS_SIM;
  readonly thump = new CameraThump();
  private readonly scene: Phaser.Scene;
  private readonly cleanups: (() => void)[];
  private readonly em: Record<string, Emitter> = {};
  private readonly flashes: ObjectPool<Phaser.GameObjects.Image>;
  private readonly scorches: ObjectPool<Phaser.GameObjects.Image>;
  private readonly trailAt = new WeakMap<Projectile, number>();
  /** Projectile streaks, redrawn each frame (normal blending keeps their color on bright skies). */
  private readonly streaks: Phaser.GameObjects.Graphics;
  /** Soft glows riding on fire and energy projectiles. */
  private readonly glows: ObjectPool<Phaser.GameObjects.Image>;
  private readonly glowOf = new Map<Projectile, Phaser.GameObjects.Image>();
  /** The sky flash of a special (screen space). */
  private readonly sky: Phaser.GameObjects.Rectangle;
  /** Lines that flash and fade (lightning, cables, beams). */
  private readonly bolts: ObjectPool<Phaser.GameObjects.Graphics>;

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

    // Muzzle sparks, forward along the lane (one emitter per direction).
    const muzzle = (angle: { min: number; max: number }): EmitterConfig => ({
      speed: { min: 80, max: 230 }, angle, gravityY: 200,
      scale: { start: 0.38 * INV, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 110, max: 260 }, tint: METAL_SPARK, blendMode: 'ADD', maxParticles: 160,
    });
    make('muzzle-r', 'fx-spark', 3.6, muzzle({ min: -28, max: 28 }));
    make('muzzle-l', 'fx-spark', 3.6, muzzle({ min: 152, max: 208 }));
    make('embers', 'fx-spark', 3.55, {
      speed: { min: 30, max: 150 }, angle: { min: 195, max: 345 }, gravityY: 70,
      scale: { start: 0.36 * INV, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: { min: 700, max: 1300 }, tint: FIRE_TINTS, blendMode: 'ADD', maxParticles: 220,
    });
    make('smoke-big', 'fx-puff', 3.35, {
      speed: { min: 6, max: 30 }, angle: { min: 250, max: 290 }, gravityY: -30,
      scale: { start: 0.9 * INV, end: 2.7 * INV }, alpha: { start: 0.5, end: 0 },
      lifespan: { min: 1300, max: 2000 }, tint: [0x4a4642, 0x5e5852, 0x3c3935], maxParticles: 90,
    });

    this.streaks = scene.add.graphics().setDepth(2.9);
    this.glows = new ObjectPool({
      create: () => scene.add.image(0, 0, 'fx-soft').setDepth(2.95),
      onRelease: (img) => img.setActive(false).setVisible(false),
      onDestroy: (img) => img.destroy(),
      prewarm: 12,
    });
    this.sky = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(4.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setVisible(false);

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

    this.bolts = new ObjectPool({
      create: () => scene.add.graphics().setDepth(3.65),
      onRelease: (g) => g.clear().setActive(false).setVisible(false).setAlpha(1),
      onDestroy: (g) => g.destroy(),
      prewarm: 4,
    });

    this.cleanups = [
      on(Events.WeaponFx, (p) => this.onWeaponFx(p)),
      on(Events.MechAbilityUsed, (p) => this.onMechAbility(p)),
      on(Events.MechEvolved, ({ x, topY }) => {
        if (this.muted) return;
        // The transformation: a flare, sparks up the body, gold and two rings.
        const mid = (topY + LANE_Y) / 2;
        this.pop('fx-flare', x, mid, 150, 0xfff0b0, 520, { grow: 1.4 });
        this.burst('sparks', 18, x, mid, 30, 50);
        this.burst('gold', 16, x, topY + 10, 30, 20);
        this.ring(x, 70, 0xf2c744, 480);
        this.scene.time.delayedCall(180, () => {
          if (!this.muted) this.ring(x, 110, 0xfff0b0, 600);
        });
      }),
      on(Events.ProjectileImpact, (p) => this.onImpact(p)),
      on(Events.UnitStruck, (p) => this.onStruck(p)),
      on(Events.TurretFired, ({ turretId, x, y }) => this.onTurretFired(turretId, x, y)),
      on(Events.UnitDied, ({ side, unitId, x, killerSide }) => this.onDied(side, unitId, x, killerSide)),
      on(Events.UtilityPulse, ({ kind, x, radius }) => this.onPulse(kind, x, radius)),
      on(Events.BaseDamaged, ({ side }) => this.onBaseHit(side)),
      on(Events.BaseDestroyed, ({ side }) => this.onBaseDestroyed(side)),
      on(Events.BuildingUpgraded, ({ side, buildingId, level }) => {
        if (this.muted) return;
        const index = activeBuildingIds().indexOf(buildingId);
        if (index < 0) return;
        const x = buildingX(side, BASE_X[side], index);
        const newStage = level === 1 || buildingStage(level) !== buildingStage(level - 1);
        // Every level: a puff and a few sparkles; a new stage: a proper celebration.
        this.burst('dust', newStage ? 10 : 4, x, LANE_Y - 4, 50, 0);
        this.burst('gold', newStage ? 26 : 8, x, LANE_Y - 60, 50, 30);
        if (newStage) {
          this.flash(x, LANE_Y - 55, 70, 0xfff0b0, 320);
          this.ring(x, 70, 0xf2c744, 420);
        }
      }),
      // Prototypes: veterancy promotions and the War Cry.
      on(Events.UnitPromoted, ({ x, topY }) => {
        if (this.muted) return;
        this.burst('gold', 12, x, topY + 6, 10, 6);
        this.flash(x, topY + 10, 22, 0xfff0b0, 240);
      }),
      on(Events.WarCryUsed, ({ positions }) => {
        if (this.muted) return;
        for (const x of positions) {
          this.burst('fire', 4, x, LANE_Y - 30, 8, 10);
          this.burst('gold', 3, x, LANE_Y - 40, 8, 8);
        }
        const front = positions.length ? positions[positions.length - 1]! : 0;
        this.ring(front, 90, 0xff8a3a, 420);
      }),
      on(Events.AgeChanged, ({ side, age }) => {
        if (side !== HUD_SIDE || this.muted) return;
        // A new age: gold bursting over the base, a flare, two rings and a light sky wash.
        const x = BASE_X[side];
        this.burst('gold', 30, x, LANE_Y - 90, 60, 50);
        this.pop('fx-flare', x, LANE_Y - 90, 150, 0xfff0b0, 520, { grow: 1.5 });
        this.ring(x, 90, 0xf2c744, 520);
        this.scene.time.delayedCall(160, () => {
          if (!this.muted) this.ring(x, 150, 0xfff0b0, 700);
        });
        this.skyFlash(age, 0.6);
      }),
      on(Events.SpecialFired, ({ age }) => this.skyFlash(age)),
      on(Events.ShotBounced, ({ fromX, fromY, toX, toY }) => this.bounceStreak(fromX, fromY, toX, toY)),
    ];
  }

  /** Dev: slow motion for the particles (tweens are the scene's). */
  setTimeScale(scale: number): void {
    for (const e of Object.values(this.em)) e.timeScale = scale;
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    for (const e of Object.values(this.em)) e.destroy();
    this.streaks.destroy();
    this.glows.destroy();
    this.glowOf.clear();
    this.sky.destroy();
    this.flashes.destroy();
    this.scorches.destroy();
    this.bolts.destroy();
    this.thump.clear();
  }

  /**
   * Once per rendered frame: trails behind projectiles in flight and spin of
   * round ones. `deltaMs` is real time.
   */
  updateTrails(projectiles: ReadonlySet<Projectile>, now: number, deltaMs: number): void {
    if (this.muted) return;
    this.streaks.clear();
    // Glows of projectiles that are gone go back to the pool.
    for (const [p, img] of this.glowOf) {
      if (!projectiles.has(p) || !p.active) {
        this.glows.release(img);
        this.glowOf.delete(p);
      }
    }
    for (const p of projectiles) {
      const streak = PROJECTILE_STREAK[p.key];
      if (streak) this.drawStreak(p, streak);
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

  /**
   * A projectile's streak: three segments from the tail (thin, faint) to the
   * head (full width), never longer than the shot has flown; and a glow on
   * the head for fire and energy.
   */
  private drawStreak(p: Projectile, st: StreakStyle): void {
    const g = this.streaks;
    const flown = (p.flight.speed * p.ageMs) / 1000;
    const len = Math.min(st.length, flown);
    if (len > 2) {
      const steps = [
        [1, 0.66, 0.35, 0.2],
        [0.66, 0.33, 0.7, 0.5],
        [0.33, 0, 1, 1],
      ] as const;
      for (const [from, to, w, a] of steps) {
        g.lineStyle(st.width * w, st.color, st.alpha * a);
        g.lineBetween(p.x - p.dirX * len * from, p.y - p.dirY * len * from, p.x - p.dirX * len * to, p.y - p.dirY * len * to);
      }
    }
    if (st.glow) {
      let img = this.glowOf.get(p);
      if (!img) {
        img = this.glows.acquire();
        this.glowOf.set(p, img);
      }
      const { color, radius, alpha } = st.glow;
      // Normal blending: the soft sprite keeps its color on bright skies too.
      img
        .setPosition(p.x, p.y)
        .setTint(color)
        .setScale((radius * 2) / FX_SIZE['fx-soft'][0] / FX_SUPERSAMPLE)
        .setAlpha(alpha)
        .setActive(true)
        .setVisible(true);
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
      .setBlendMode(Phaser.BlendModes.ADD)
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

  /**
   * A textured flash (flare, star, slash, streak) of `size` px across that
   * pops in, grows by `grow` and fades over `ms`. Additive.
   */
  private pop(
    key: 'fx-flare' | 'fx-star' | 'fx-slash' | 'fx-soft' | 'fx-streak' | 'fx-puff',
    x: number,
    y: number,
    size: number,
    tint: number,
    ms: number,
    opts: { rotation?: number; flipX?: boolean; grow?: number; alpha?: number; scaleY?: number; color?: boolean } = {},
  ): void {
    const img = this.flashes.acquire();
    const scale = size / FX_SIZE[key][0] / FX_SUPERSAMPLE;
    // White-hot flashes add light; colored ones blend normally, or a bright sky washes them to white.
    img
      .setBlendMode(opts.color ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setTexture(key)
      .setPosition(x, y)
      .setTint(tint)
      .setRotation(opts.rotation ?? 0)
      .setFlipX(opts.flipX ?? false)
      .setScale(scale * 0.7, scale * 0.7 * (opts.scaleY ?? 1))
      .setAlpha(opts.alpha ?? 1)
      .setActive(true)
      .setVisible(true);
    const grow = opts.grow ?? 1.25;
    this.scene.tweens.add({
      targets: img,
      scaleX: scale * grow,
      scaleY: scale * grow * (opts.scaleY ?? 1),
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => {
        img.setRotation(0).setFlipX(false);
        this.flashes.release(img);
      },
    });
  }

  /** A special's sky flash: the whole view washes with the age's color and fades. */
  private skyFlash(age: number, strength = 1): void {
    if (this.muted) return;
    const look = SPECIAL_SKY_FLASH[Math.max(0, Math.min(SPECIAL_SKY_FLASH.length - 1, age))]!;
    this.scene.tweens.killTweensOf(this.sky);
    this.sky.setFillStyle(look.color).setAlpha(look.alpha * strength).setVisible(true);
    this.scene.tweens.add({ targets: this.sky, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => this.sky.setVisible(false) });
  }

  /** A ricochet: a bright streak from one unit to the next and a sparkle where it lands. */
  private bounceStreak(fromX: number, fromY: number, toX: number, toY: number): void {
    if (this.muted) return;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);
    this.pop('fx-streak', fromX + dx / 2, fromY + dy / 2, dist, 0xffe890, 170, { rotation: Math.atan2(dy, dx), grow: 1.05, scaleY: 1.2 });
    this.pop('fx-star', toX, toY, 16, 0xfff0b0, 140);
    this.burst('sparks', 3, toX, toY);
  }

  /** Draws a line (straight or jagged) through x, y pairs that fades over `ms`. */
  private bolt(points: readonly number[], color: number, width: number, ms: number, jag = 0): void {
    if (points.length < 4) return;
    const g = this.bolts.acquire().setActive(true).setVisible(true).setAlpha(1);
    const path = (w: number, c: number, a: number): void => {
      g.lineStyle(w, c, a);
      g.beginPath();
      g.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) {
        const x0 = points[i - 2]!;
        const y0 = points[i - 1]!;
        const x1 = points[i]!;
        const y1 = points[i + 1]!;
        if (jag > 0) {
          for (let k = 1; k < 4; k++) {
            const t = k / 4;
            g.lineTo(x0 + (x1 - x0) * t + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * t + (Math.random() - 0.5) * jag);
          }
        }
        g.lineTo(x1, y1);
      }
      g.strokePath();
    };
    path(width * 2.4, color, 0.35);
    path(width, 0xffffff, 0.95);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Quad.easeIn', onComplete: () => this.bolts.release(g) });
  }

  /** Mech weapons and parts (`weapon-fx`). */
  private onWeaponFx({ kind, x, y, points, radius }: EventPayloads[typeof Events.WeaponFx]): void {
    if (this.muted) return;
    switch (kind) {
      case 'flame': {
        const [x0, y0, x1, y1] = points ?? [x, y, x, y];
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          const px = x0! + (x1! - x0!) * t;
          const py = y0! + (y1! - y0!) * t;
          this.pop('fx-puff', px, py, 14 + t * 26, i < 2 ? 0xffd060 : 0xff7a2a, 260 + t * 160, { grow: 1.5, alpha: 0.85, color: true, rotation: Math.random() * 6 });
        }
        this.burst('fire', 6, x1!, y1!, 16, 8);
        return;
      }
      case 'chain':
        this.bolt(points ?? [], 0x9fe8ff, 2, 220, 12);
        for (let i = 2; i < (points?.length ?? 0); i += 2) {
          this.pop('fx-star', points![i]!, points![i + 1]!, 22, 0xbff4ff, 180);
          this.burst('cyan', 3, points![i]!, points![i + 1]!);
        }
        return;
      case 'pull':
        this.bolt(points ?? [], 0x5d636b, 1.4, 260);
        this.burst('dust', 3, points?.[2] ?? x, LANE_Y - 2, 8, 0);
        return;
      case 'knockback':
        this.burst('dust', 5, points?.[2] ?? x, LANE_Y - 2, 12, 0);
        this.pop('fx-streak', ((points?.[0] ?? x) + (points?.[2] ?? x)) / 2, y, Math.abs((points?.[2] ?? x) - (points?.[0] ?? x)) + 10, 0xfff0c0, 160);
        return;
      case 'leap':
        this.burst('dust', 10, x, LANE_Y - 2, 20, 0);
        this.burst('fire', 8, x, LANE_Y - 10, 10, 4);
        return;
      case 'land':
        this.ring(x, radius ?? 50, 0xffc070, 380);
        this.burst('dust', 14, x, LANE_Y - 2, (radius ?? 50) * 0.6, 0);
        this.burst('chunks', 6, x, LANE_Y - 4, 10, 0);
        this.thumpAt(CAMERA_THUMP.heavyStrike, x, 0.8);
        return;
      case 'drone':
        this.burst('sparks', 4, x, y, 4, 4);
        return;
      case 'troops':
        this.burst('dust', 10, x, LANE_Y - 4, 24, 0);
        this.pop('fx-flare', x, y, 50, 0xfff0b0, 240);
        return;
      case 'stun':
        for (let i = 0; i + 1 < (points?.length ?? 0); i += 2) {
          this.pop('fx-star', points![i]!, points![i + 1]! - 20, 26, 0x9fe8ff, 400);
          this.burst('cyan', 4, points![i]!, points![i + 1]! - 20, 8, 8);
        }
        return;
    }
  }

  /** A Mech module fired (`mech-ability-used`). */
  private onMechAbility({ kind, x, radius, toX }: EventPayloads[typeof Events.MechAbilityUsed]): void {
    if (this.muted) return;
    switch (kind) {
      case 'smoke':
        this.burst('smoke-big', 10, x, LANE_Y - 30, radius * 0.5, 16);
        this.burst('smoke', 12, x, LANE_Y - 20, radius * 0.6, 10);
        return;
      case 'overdrive':
        this.burst('sparks', 12, x, LANE_Y - 60, 20, 30);
        this.pop('fx-flare', x, LANE_Y - 60, 90, 0xffd060, 300);
        return;
      case 'overload':
        this.explosion(x, LANE_Y - 30, radius, true);
        this.ring(x, radius * 1.2, 0x9fe8ff, 500);
        return;
      case 'dome':
        this.ring(x, radius, 0x8fe0ff, 600);
        this.pop('fx-soft', x, LANE_Y - 50, radius * 1.8, 0x8fe0ff, 700, { grow: 1.1, alpha: 0.6, scaleY: 0.8 });
        return;
      case 'emp':
        this.ring(x, radius, 0x9fe8ff, 500);
        this.ring(x, radius * 0.6, 0xffffff, 350);
        this.burst('cyan', 20, x, LANE_Y - 40, radius * 0.4, 20);
        return;
      case 'orbital': {
        const at = toX ?? x;
        this.bolt([at, -40, at, LANE_Y - 10], 0xff6a5a, 7, 420);
        this.scene.time.delayedCall(90, () => {
          if (!this.muted) this.explosion(at, LANE_Y - 20, radius, true);
        });
        return;
      }
      case 'leap':
        return;
    }
  }

  /** An expanding shockwave ring lying on the lane. */
  private ring(x: number, radius: number, tint: number, ms = 320): void {
    const img = this.flashes.acquire();
    const base = (radius * 2) / 64;
    img
      .setBlendMode(Phaser.BlendModes.ADD)
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
    // A white-hot flare, then an orange fireball swelling out of it.
    this.pop('fx-flare', x, y, r * 2.6, 0xfff0c0, 220);
    // Cartoon fireball: opaque puffs keep their color on any sky.
    this.pop('fx-puff', x, y - r * 0.25, r * 2.2, 0xff7a2a, 460, { grow: 1.6, alpha: 0.95, color: true, rotation: Math.random() * 6 });
    this.pop('fx-puff', x, y - r * 0.15, r * 1.3, 0xffd060, 300, { grow: 1.5, color: true, rotation: Math.random() * 6 });
    this.burst('fire', Math.round(10 + r / 4), x, y, r * 0.3, r * 0.2);
    this.burst('smoke', Math.round(3 + r / 14), x, y - 6, r * 0.3, 4);
    this.burst('chunks', Math.round(4 + r / 12), x, Math.min(y, LANE_Y - 2), r * 0.2, 0);
    this.burst('sparks', 8, x, y);
    this.burst('embers', Math.round(6 + r / 5), x, y, r * 0.3, r * 0.2);
    // A smoke column rising where it hit.
    this.scene.time.delayedCall(140, () => {
      if (!this.muted) this.burst('smoke-big', Math.round(2 + r / 12), x, y - 8, r * 0.25, 6);
    });
    if (y >= LANE_Y - 30) {
      this.ring(x, r, 0xffc070);
      if (heavy) this.ring(x, r * 1.7, 0xffe0b0, 520);
      this.scorch(x, r * 1.6);
    }
    // Only specials and exploding machines thump: turret splashes never do
    // (the owner turned off shaking from mortar fire, playtest round 4).
    if (heavy) this.thumpAt(CAMERA_THUMP.bigBlast, x);
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
    const style = PROJECTILE_IMPACT[key] ?? 'dust';
    // Every hit on a unit sparkles, in the shot's light.
    if (target === 'unit') {
      const tint =
        style === 'bullet' ? 0xffe07a : style === 'laser' || style === 'rail' ? 0x9ff8ff : style === 'plasma' ? 0xd9b8ff : style === 'fire' ? 0xffa040 : 0xffffff;
      this.pop('fx-star', x, gy, style === 'dust' || style === 'splinter' ? 12 : 16, tint, 110, { rotation: Math.random() * 0.8, color: tint !== 0xffffff });
    }
    switch (style) {
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
        this.burst('sparks', 4, x, gy);
        if (target === 'ground') this.burst('dust', 2, x, gy);
        break;
      case 'cannon':
        this.pop('fx-flare', x, gy, 34, 0xffe0a0, 150);
        this.burst('dust', 5, x, gy);
        this.burst('chunks', 7, x, gy);
        this.burst('smoke', 3, x, gy - 4);
        this.burst('embers', 4, x, gy);
        if (target === 'ground') this.ring(x, 20, 0xd8c8a8, 260);
        break;
      case 'explosion':
        // The airstrike special's bombs thump; mortars, grenades and shells don't.
        this.explosion(x, gy, radius, key === 'proj-bomb');
        break;
      case 'meteor':
        this.explosion(x, gy, Math.max(radius, 30), true);
        this.burst('fire', 10, x, gy - 8, 10, 6);
        break;
      case 'laser':
        this.pop('fx-flare', x, gy, 26, 0x7ff0ff, 130, { color: true });
        this.burst('cyan', 7, x, gy);
        break;
      case 'rail':
        this.flash(x, gy, 26, 0xe8f8ff, 180);
        this.burst('cyan', 12, x, gy);
        this.ring(x, 24, 0x9fd8ff, 240);
        break;
      case 'plasma':
        this.pop('fx-soft', x, gy, Math.max(40, radius * 2), 0xb070ff, 260, { grow: 1.5, alpha: 0.85, color: true });
        this.pop('fx-flare', x, gy, Math.max(24, radius * 1.2), 0xffffff, 160);
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

  private onStruck(p: EventPayloads[typeof Events.UnitStruck]): void {
    if (this.muted) return;
    const { unitId, slot, frontX, x, ranged, side } = p;
    const ageIndex = findUnitDefinition(unitId)?.age ?? 0;
    const dir = laneDir(side);
    if (ranged) {
      if (p.muzzleX !== undefined && p.muzzleY !== undefined) this.muzzleFlash(p.muzzleX, p.muzzleY, dir, p.projectileKey ?? '');
      // Heavy guns (tank, mech) rock the ground a little when they fire.
      if (slot === 3) this.thumpAt(CAMERA_THUMP.heavyStrike, x, 0.6);
      return;
    }
    const hitX = frontX + dir * 4;
    const hitY = LANE_Y - (slot === 3 ? 28 : 24);
    // The blow: a slash arc in the age's tint and a sparkle where it lands.
    const heavy = slot === 3;
    this.pop('fx-slash', hitX + dir * 2, hitY - 4, heavy ? 54 : 36, SLASH_TINTS[ageIndex] ?? 0xffffff, heavy ? 200 : 160, {
      flipX: dir < 0,
      rotation: (Math.random() - 0.5) * 0.9,
      grow: 1.35,
      alpha: 0.95,
      color: true,
    });
    this.pop('fx-star', hitX + dir * 6, hitY, heavy ? 22 : 14, 0xffffff, 120, { rotation: Math.random() });
    if (ageIndex === 0) this.burst('dust', 2, hitX, hitY + 10);
    else if (ageIndex === 4) this.burst('cyan', 6, hitX, hitY);
    else this.burst('sparks', 5, hitX, hitY);
    if (slot === 3) {
      // Heavy blow: dust kicked up along the ground and a graceful thump.
      this.burst('dust', 6, hitX, LANE_Y - 2, 14, 0);
      this.ring(hitX, 26, 0xd8c8a8, 300);
      this.thumpAt(CAMERA_THUMP.heavyStrike, hitX);
    }
  }

  /** A unit's shot leaving the weapon: a flash and a puff styled by the projectile. */
  private muzzleFlash(x: number, y: number, dir: 1 | -1, key: string): void {
    const sparks = dir > 0 ? 'muzzle-r' : 'muzzle-l';
    const fx = x + dir * 3;
    switch (MUZZLE_STYLE[key]) {
      case 'gun':
        this.pop('fx-flare', fx, y, 26, 0xffe0a0, 100, { grow: 1.1 });
        this.burst(sparks, 3, fx, y);
        this.burst('smoke', 1, fx + dir * 4, y - 2);
        break;
      case 'cannon':
        this.pop('fx-flare', fx, y, 44, 0xffd080, 140, { grow: 1.15 });
        this.pop('fx-puff', fx + dir * 6, y, 20, 0xffb050, 160, { color: true });
        this.burst(sparks, 6, fx, y);
        this.burst('smoke', 3, fx + dir * 6, y - 2, 4, 2);
        this.ring(x, 22, 0xd8c8a8, 280);
        break;
      case 'fire':
        this.pop('fx-flare', fx, y, 22, 0xffa040, 110, { color: true });
        this.burst('fire', 4, fx, y);
        break;
      case 'laser':
        this.pop('fx-flare', fx, y, 26, 0x7ff0ff, 100, { color: true });
        this.burst('cyan', 3, fx, y);
        break;
      case 'plasma':
        this.pop('fx-flare', fx, y, 38, 0xb070ff, 150, { color: true });
        this.burst('purple', 5, fx, y);
        break;
      case 'bow':
        this.pop('fx-star', fx, y, 9, 0xffffff, 80, { alpha: 0.7 });
        break;
      case 'sling':
        this.burst('dust', 1, x, y);
        break;
      default:
        break;
    }
  }

  private onTurretFired(turretId: string, x: number, y: number): void {
    if (this.muted) return;
    const age = turretId.split('-')[0];
    if (age === 'renaissance' || age === 'modern') {
      this.burst('smoke', 1, x, y);
      this.burst('sparks', 2, x, y);
    } else if (age === 'future') {
      this.burst('cyan', 2, x, y);
    }
  }

  private onDied(side: Side, unitId: string, x: number, killerSide: Side): void {
    if (this.muted) return;
    const definition = findUnitDefinition(unitId);
    const big = definition?.slot === 3;
    if (EXPLODING_UNITS.has(unitId) || unitId.startsWith('mech:')) {
      this.explosion(x, LANE_Y - 22, big ? 40 : 32, unitId === 'modern-tank' || unitId === 'future-mech' || unitId.startsWith('mech:'));
    } else {
      // A fall: dust kicked up and a dust ring on the ground; heavies throw up more.
      this.burst('dust', big ? 12 : 5, x, LANE_Y - 3, big ? 26 : 12, 0);
      this.ring(x, big ? 36 : 18, 0xd8c8a8, big ? 420 : 300);
      if (big) this.burst('chunks', 4, x, LANE_Y - 4, 16, 0);
    }
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
    this.pop('fx-star', x, y, 14, 0xfff0d0, 110, { rotation: Math.random() });
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
