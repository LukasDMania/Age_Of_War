import { UNIT_WALK_SPEED } from '@config/constants';
import { flipOriginX } from '@utils/spriteOrigin';
import Phaser from 'phaser';
import { LANE_Y } from '@config/constants';
import { unitArtKey, type UnitArt } from '@config/unitArt.config';
import { unitArtFor } from '@entities/unitArt';
import type { UnitAttack, UnitDefinition } from '@entities/unitDefinitions';
import type { ModifiableStat, Side } from '@state/types';
import { textureKeyFor } from '@utils/PlaceholderArt';
import { ensureRigArt } from '@utils/RigArt';
import { HEADLESS_SIM } from '@utils/runtimeFlags';

/** Unit state machine: idle -> walking -> attacking -> dead. */
export enum UnitState {
  Idle = 'idle',
  Walking = 'walking',
  Attacking = 'attacking',
  Dead = 'dead',
}

/**
 * A stat modifier. Effective stat = base x product of matching modifiers.
 * Added and removed only through `systems/statusOps.ts`; `StatusSystem`
 * expires timed ones. `expiresAt` is simulation time in ms.
 */
export interface StatModifier {
  id: string;
  source: string;
  stat: ModifiableStat;
  mult: number;
  expiresAt?: number;
}

const BAR_HEIGHT = 4;
const SHIELD_COLOR = 0x8fe0ff;
const BAR_GAP_ABOVE_HEAD = 8;
const MIN_BAR_WIDTH = 24;
/** How long a unit flashes white after taking damage (real time, visual only). */
const HIT_FLASH_MS = 70;
/** Real ms the walk animation keeps playing after the unit stops moving. */
const WALK_ANIM_HOLD_MS = 220;

/**
 * The one unit class. What a unit does comes from its `UnitDefinition`; this
 * class holds the definition, current HP, state and modifiers, plus a sprite
 * and a small HP bar. Rules (targeting, damage, movement) live in systems.
 *
 * The sprite is either the generated placeholder or, for units listed in
 * `UNIT_ART`, an animated sheet (walk while walking, the attack animation on
 * each attack, a standing frame otherwise). Either way the unit's footprint
 * (`bodyWidth` x `bodyHeight`, used for blocking, reach and hits) is the
 * placeholder's size, so art never changes the rules.
 *
 * Units are pooled: `init` readies one for a new life and `deactivate` puts
 * it away. Use `UnitFactory` rather than constructing directly.
 */
export class Unit extends Phaser.GameObjects.Sprite {
  side: Side = 'player';
  definition!: UnitDefinition;
  instanceId = -1;
  hp = 0;
  unitState: UnitState = UnitState.Dead;
  /** Sim time (ms) at which the next attack is allowed. */
  attackReadyAt = 0;
  /** Sim time at which the `secondaryAttack` (a Mech's other arm) may fire again. */
  secondaryReadyAt = 0;
  /** Utility units: sim time of the next effect use, and of the next aura pulse. */
  utilityReadyAt = 0;
  auraPulseAt = 0;
  /**
   * Sim time until which this unit can't get another heal / shield from a
   * utility unit (Phase 15: effects from several utility units don't stack).
   */
  healLockUntil = 0;
  /** Sim time at which a started attack lands (0 = none pending; see `UnitAttack.windupMs`). */
  strikeAt = 0;
  /** Sim time at which a started area throw (utility `aoe`) is released; 0 = none pending. */
  utilityReleaseAt = 0;
  /** Scene time the unit last walked, so the walk loop doesn't flicker on 1-frame stops. */
  private walkedAt = -Infinity;
  shieldLockUntil = 0;
  /** Side credited with the kill once HP reaches 0 (set by `markDead`). */
  killerSide: Side | null = null;
  /** The killer's turret slot when a turret scored the kill (-1: not a turret). */
  killerTurret = -1;
  /** Attacks and shots made (Conquest traits: first strike, every nth shot pierces). */
  attacksMade = 0;
  shotsFired = 0;
  /**
   * Absorb pool: damage takes this down before HP (Phase 7). Granted through
   * `statusOps.grantShield`, spent in `damageOps`.
   */
  shield = 0;
  readonly modifiers: StatModifier[] = [];
  /** Veterancy (prototype): kills credited to this unit and its rank (0 = recruit). */
  kills = 0;
  rank = 0;
  /**
   * Money units with the rework on (EconomySystem): how far their income has
   * grown, 0..1, shown as a gold bar under the HP bar; -1 hides it.
   */
  incomeRamp = -1;
  /** Footprint on the lane: the placeholder's size, whatever art is shown. */
  bodyWidth = 0;
  bodyHeight = 0;

  /** Animated art for this unit, if it has any. */
  private art: UnitArt | null = null;
  /** Tint kept on the sprite (enemy copies of shared art); null for none. */
  private baseTint: number | null = null;

  /** Scene time at which the hit flash ends; 0 when not flashing. */
  private flashUntil = 0;

  private readonly hpBar: Phaser.GameObjects.Graphics;
  private hpBarDirty = true;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, LANE_Y, '__DEFAULT');
    this.setOrigin(0.5, 1).setDepth(1);
    scene.add.existing(this);
    this.hpBar = scene.add.graphics().setDepth(2);
    this.deactivate();
  }

  /** Readies a pooled unit for a new life at lane position `x`. */
  init(definition: UnitDefinition, side: Side, instanceId: number, x: number): void {
    this.definition = definition;
    this.side = side;
    this.instanceId = instanceId;
    this.modifiers.length = 0;
    this.shield = 0;
    const placeholder = this.scene.textures.getFrame(textureKeyFor(definition.spriteKey, side));
    this.bodyWidth = placeholder.width;
    this.bodyHeight = placeholder.height;
    // Headless runs (AI training) draw nothing: skip the art sheets.
    this.art = HEADLESS_SIM ? null : (unitArtFor(definition.id) ?? null);
    this.anims.stop();
    if (this.art) {
      ensureRigArt(this.scene, definition.id, side);
      this.setTexture(unitArtKey(definition.id, 'walk', side), this.art.standFrame);
      this.setScale(this.art.scale).setOrigin(flipOriginX(this.art.originX ?? 0.5, side === 'enemy'), this.art.footY);
      this.baseTint = side === 'enemy' ? (this.art.enemyTint ?? null) : null;
    } else {
      this.setTexture(textureKeyFor(definition.spriteKey, side));
      this.setScale(1).setOrigin(0.5, 1);
      this.baseTint = null;
    }
    this.setFlipX(side === 'enemy');
    // Support units are drawn behind combat units, which may walk through them.
    this.setDepth(definition.role === 'combat' ? 1 : 0.9);
    this.setPosition(x, LANE_Y);
    this.hp = this.getStat('maxHp');
    this.attackReadyAt = 0;
    this.secondaryReadyAt = 0;
    this.utilityReadyAt = 0;
    this.auraPulseAt = 0;
    this.healLockUntil = 0;
    this.strikeAt = 0;
    this.utilityReleaseAt = 0;
    this.walkedAt = -Infinity;
    this.shieldLockUntil = 0;
    this.killerSide = null;
    this.killerTurret = -1;
    this.attacksMade = 0;
    this.shotsFired = 0;
    this.kills = 0;
    this.rank = 0;
    this.incomeRamp = -1;
    this.flashUntil = 0;
    this.restoreTint();
    this.unitState = UnitState.Idle;
    this.hpBarDirty = true;
    this.setActive(true).setVisible(true);
    this.syncBar();
  }

  /** Puts the unit back "in the pool": invisible and inert. */
  deactivate(): void {
    this.anims.stop();
    this.unitState = UnitState.Dead;
    this.setActive(false).setVisible(false);
    this.hpBar.setVisible(false);
  }

  /** The single accessor for stats that modifiers can change. */
  getStat(stat: ModifiableStat): number {
    return this.baseStat(stat) * this.statMultiplier(stat);
  }

  /**
   * The product of the unit's modifiers for a stat (1 = unmodified). For
   * values that don't come from the definition's base stats, like a utility
   * unit's area damage.
   */
  statMultiplier(stat: ModifiableStat): number {
    let mult = 1;
    for (const modifier of this.modifiers) {
      if (modifier.stat === stat) mult *= modifier.mult;
    }
    return mult;
  }

  /** Heals up to max HP; returns the HP actually restored. */
  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.getStat('maxHp'), this.hp + amount);
    if (this.hp !== before) this.hpBarDirty = true;
    return this.hp - before;
  }

  get attack(): UnitAttack | undefined {
    return this.definition.attack;
  }

  get halfWidth(): number {
    return this.bodyWidth / 2;
  }

  get isAlive(): boolean {
    return this.unitState !== UnitState.Dead;
  }

  /** Money and utility units (no attack). Since 2026-09-26 they walk and block like everyone else. */
  get isSupport(): boolean {
    return this.definition.role !== 'combat';
  }

  /** Y of the top of the sprite (units stand on the lane with origin at the feet). */
  get topY(): number {
    return this.y - this.bodyHeight;
  }

  /** Y of the middle of the body: where projectiles aim. */
  get centerY(): number {
    return this.y - this.bodyHeight / 2;
  }

  /** Visual only: plays the attack animation, if the unit has art. */
  playAttack(): void {
    if (this.art?.attack) this.play(unitArtKey(this.definition.id, 'attack', this.side));
  }

  /**
   * Lowers HP (never below 0) and returns the new value. Bookkeeping plus a
   * short white flash; the rules for who deals damage live in the systems.
   */
  takeDamage(amount: number): number {
    this.hp = Math.max(0, this.hp - amount);
    this.hpBarDirty = true;
    if (amount > 0) {
      this.flashUntil = this.scene.time.now + HIT_FLASH_MS;
      this.setTintFill(0xffffff);
    }
    return this.hp;
  }

  /**
   * Marks the unit dead and remembers who scored the kill. It stays in the
   * active set (ignored by everyone) until `CasualtySystem` reports and
   * releases it at the end of the frame.
   */
  markDead(killerSide: Side, killerTurret = -1): void {
    this.unitState = UnitState.Dead;
    this.killerSide = killerSide;
    this.killerTurret = killerTurret;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.flashUntil !== 0 && time >= this.flashUntil) {
      this.flashUntil = 0;
      this.restoreTint();
    }
    if (this.active) {
      this.syncPose();
      this.syncBar();
    }
  }

  override destroy(fromScene?: boolean): void {
    this.hpBar.destroy(fromScene);
    super.destroy(fromScene);
  }

  private restoreTint(): void {
    if (this.baseTint === null) this.clearTint();
    else this.setTint(this.baseTint);
  }

  /**
   * Art units: loop the walk while walking, let a running attack finish,
   * otherwise hold the standing frame.
   */
  private syncPose(): void {
    const art = this.art;
    if (!art) return;
    const attackKey = unitArtKey(this.definition.id, 'attack', this.side);
    if (this.anims.isPlaying && this.anims.currentAnim?.key === attackKey) return;
    const now = this.scene.time.now;
    if (this.unitState === UnitState.Walking) this.walkedAt = now;
    // Keep the walk loop through brief stops (a unit following another at
    // the same speed stops and starts every few frames), instead of
    // snapping to the standing frame and back: that looked jittery.
    if (now - this.walkedAt < WALK_ANIM_HOLD_MS) {
      this.play(unitArtKey(this.definition.id, 'walk', this.side), true);
    } else if (this.anims.isPlaying || this.texture.key !== unitArtKey(this.definition.id, 'walk', this.side)) {
      this.anims.stop();
      this.setTexture(unitArtKey(this.definition.id, 'walk', this.side), art.standFrame);
    }
  }

  private baseStat(stat: ModifiableStat): number {
    switch (stat) {
      case 'damage':
        return this.definition.attack?.damage ?? 0;
      case 'speed':
        // One walking speed for everyone (owner, 2026-09-26); `definition.speed` is unused for now.
        return UNIT_WALK_SPEED;
      case 'attackCooldown':
        return this.definition.attack?.cooldownMs ?? 0;
      case 'maxHp':
        return this.definition.hp;
      case 'shield':
        return 1;
      case 'range':
        return this.definition.attack?.range ?? 0;
      case 'damageTaken':
        return this.definition.armor ?? 1;
      case 'shotDamageTaken':
        return 1;
    }
  }

  /** Call after changing HP, max HP or the shield outside `takeDamage`. */
  markBarDirty(): void {
    this.hpBarDirty = true;
  }

  /** Money units (rework): their income growth, 0..1; redraws the bar when it visibly changes. */
  setIncomeRamp(ramp: number): void {
    if (Math.abs(ramp - this.incomeRamp) < 0.02 && !(ramp >= 1 && this.incomeRamp < 1)) return;
    this.incomeRamp = ramp;
    this.hpBarDirty = true;
  }

  /**
   * Keeps the HP bar over the unit. It shows once the unit is hurt or has a
   * shield; the shield is a thin cyan bar just above the HP bar, scaled
   * against max HP. Money units (rework) always show it, with a gold income
   * bar underneath.
   */
  private syncBar(): void {
    const maxHp = this.getStat('maxHp');
    const hurt = this.hp < maxHp;
    const shielded = this.shield > 0;
    const ranked = this.rank > 0;
    const earning = this.incomeRamp >= 0;
    this.hpBar.setVisible(this.active && (hurt || shielded || ranked || earning));
    if (!hurt && !shielded && !ranked && !earning) return;

    const width = Math.max(MIN_BAR_WIDTH, this.bodyWidth);
    this.hpBar.setPosition(this.x, this.topY - BAR_GAP_ABOVE_HEAD);
    if (!this.hpBarDirty) return;

    const ratio = Phaser.Math.Clamp(this.hp / maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.65);
    this.hpBar.fillRect(-width / 2, 0, width, BAR_HEIGHT);
    this.hpBar.fillStyle(ratio > 0.5 ? 0x6fcf6f : ratio > 0.25 ? 0xf2c744 : 0xe0554a, 1);
    this.hpBar.fillRect(-width / 2, 0, width * ratio, BAR_HEIGHT);
    if (ranked) {
      // Veteran chevrons (prototype) above the bar, one per rank.
      for (let i = 0; i < this.rank; i++) {
        const cx = -((this.rank - 1) * 7) / 2 + i * 7;
        this.hpBar.fillStyle(0x000000, 0.7).fillTriangle(cx - 4, -5, cx, -10, cx + 4, -5);
        this.hpBar.fillStyle(0xf2c744, 1).fillTriangle(cx - 3, -5.5, cx, -9, cx + 3, -5.5);
      }
    }
    if (earning) {
      // Income growth: a thin gold bar under the HP bar, bright when full.
      this.hpBar.fillStyle(0x000000, 0.65);
      this.hpBar.fillRect(-width / 2, BAR_HEIGHT, width, 3);
      this.hpBar.fillStyle(this.incomeRamp >= 1 ? 0xffe27a : 0xc9a13a, 1);
      this.hpBar.fillRect(-width / 2, BAR_HEIGHT, width * this.incomeRamp, 3);
    }
    if (shielded) {
      const shieldRatio = Phaser.Math.Clamp(this.shield / maxHp, 0, 1);
      this.hpBar.fillStyle(0x000000, 0.65);
      this.hpBar.fillRect(-width / 2, -BAR_HEIGHT + 1, width, BAR_HEIGHT - 1);
      this.hpBar.fillStyle(SHIELD_COLOR, 1);
      this.hpBar.fillRect(-width / 2, -BAR_HEIGHT + 1, width * shieldRatio, BAR_HEIGHT - 1);
    }
    this.hpBarDirty = false;
  }
}
