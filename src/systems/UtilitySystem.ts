import { UTILITY_AURA_PULSE_MS, UTILITY_AURA_TICK_MS, UTILITY_BUFF_LINGER_MS } from '@config/constants';
import type { ProjectileFactory } from '@entities/ProjectileFactory';
import type { Unit } from '@entities/Unit';
import type { UnitFactory } from '@entities/UnitFactory';
import type { UtilityEffect } from '@entities/unitDefinitions';
import { shotLine } from '@systems/shotLine';
import { applyModifier, grantShield } from '@systems/statusOps';
import { emit, Events } from '@utils/EventBus';

/** Modifier ids. One id per effect, so two alchemists don't stack their slow. */
const SLOW_SPEED_ID = 'utility-slow-speed';
const SLOW_ATTACK_ID = 'utility-slow-attack';
const BUFF_DAMAGE_ID = 'utility-buff-damage';

/** Edge distance along the lane between a point and a unit's body. */
function distanceTo(x: number, unit: Unit): number {
  return Math.max(0, Math.abs(unit.x - x) - unit.halfWidth);
}

/**
 * Utility units (slot 5, Phase 10): one system for the five effect kinds,
 * chosen by the unit definition's `utility` block (see `UtilityEffect`).
 *
 * - heal, shield: pulse every `intervalMs` on friendly units in the radius
 *   (the utility unit itself included).
 * - aoe: every `intervalMs`, if an enemy unit is within range, a level shot
 *   through the normal projectile pipeline, with splash. Its damage follows
 *   the utility unit's damage modifiers (money-unit penalty, buffs).
 * - slow, buff: auras refreshed every `UTILITY_AURA_TICK_MS` as timed
 *   modifiers through `statusOps`, so they fade on their own once a unit is
 *   out of reach (slow after `durationMs`, buff after `UTILITY_BUFF_LINGER_MS`).
 *   A slow cuts movement speed and attack rate by the same factor. Auras of
 *   the same kind don't stack: they share one modifier id.
 *
 * Timers are simulation time on the unit (`utilityReadyAt`, `auraPulseAt`).
 *
 * Emits: `unit-healed`, `utility-pulse` (feedback); `modifier-applied` /
 * `-removed` through statusOps; damage events through the projectile.
 */
export class UtilitySystem {
  private readonly units: UnitFactory;
  private readonly projectiles: ProjectileFactory;

  constructor(units: UnitFactory, projectiles: ProjectileFactory) {
    this.units = units;
    this.projectiles = projectiles;
  }

  /** `nowMs` is the simulation clock. */
  update(nowMs: number): void {
    for (const unit of this.units.activeUnits) {
      const effect = unit.definition.utility;
      if (!effect || !unit.isAlive) continue;
      if (effect.kind === 'aoe' && unit.utilityReleaseAt > 0) {
        if (nowMs >= unit.utilityReleaseAt) {
          unit.utilityReleaseAt = 0;
          this.throwArea(unit, effect);
        }
        continue;
      }
      if (nowMs < unit.utilityReadyAt) continue;
      this.use(unit, effect, nowMs);
    }
  }

  private use(unit: Unit, effect: UtilityEffect, nowMs: number): void {
    switch (effect.kind) {
      case 'heal': {
        unit.utilityReadyAt = nowMs + effect.intervalMs;
        for (const ally of this.alliesWithin(unit, effect.radius)) {
          // Several healers don't stack: one heal per ally per heal interval.
          if (nowMs < ally.healLockUntil) continue;
          ally.healLockUntil = nowMs + effect.intervalMs;
          const restored = ally.heal(effect.amount);
          if (restored > 0) {
            emit(Events.UnitHealed, { side: ally.side, instanceId: ally.instanceId, amount: restored, x: ally.x, topY: ally.topY });
          }
        }
        this.pulse(unit, 'heal', effect.radius);
        this.gesture(unit); // visual: the shaman raises its staff
        return;
      }
      case 'shield': {
        unit.utilityReadyAt = nowMs + effect.intervalMs;
        for (const ally of this.alliesWithin(unit, effect.radius)) {
          // Several shielders don't stack: one refresh per ally per interval,
          // and a shield never grows past one drone's worth.
          if (nowMs < ally.shieldLockUntil) continue;
          ally.shieldLockUntil = nowMs + effect.intervalMs;
          grantShield(ally, effect.absorb, effect.absorb * ally.getStat('shield'));
        }
        this.pulse(unit, 'shield', effect.radius);
        this.gesture(unit);
        return;
      }
      case 'aoe': {
        if (!this.enemyWithin(unit, effect.range)) {
          // Check again soon rather than every frame.
          unit.utilityReadyAt = nowMs + UTILITY_AURA_TICK_MS;
          return;
        }
        unit.utilityReadyAt = nowMs + effect.intervalMs;
        unit.playAttack();
        // Released on the throw frame of the animation (like attack windups).
        if (effect.windupMs && effect.windupMs > 0) unit.utilityReleaseAt = nowMs + effect.windupMs;
        else this.throwArea(unit, effect);
        return;
      }
      case 'slow': {
        unit.utilityReadyAt = nowMs + UTILITY_AURA_TICK_MS;
        const expiresAt = nowMs + effect.durationMs;
        for (const enemy of this.enemiesWithin(unit, effect.range)) {
          applyModifier(enemy, { id: SLOW_SPEED_ID, source: 'utility', stat: 'speed', mult: effect.mult, expiresAt, hostile: true });
          applyModifier(enemy, { id: SLOW_ATTACK_ID, source: 'utility', stat: 'attackCooldown', mult: 1 / effect.mult, expiresAt, hostile: true });
        }
        this.auraPulse(unit, 'slow', effect.range, nowMs);
        return;
      }
      case 'buff': {
        unit.utilityReadyAt = nowMs + UTILITY_AURA_TICK_MS;
        const expiresAt = nowMs + UTILITY_BUFF_LINGER_MS;
        for (const ally of this.alliesWithin(unit, effect.radius)) {
          if (ally === unit) continue;
          applyModifier(ally, { id: BUFF_DAMAGE_ID, source: 'utility', stat: 'damage', mult: effect.damageMult, expiresAt });
        }
        this.auraPulse(unit, 'buff', effect.radius, nowMs);
        return;
      }
    }
  }

  /** The `aoe` effect's level shot with splash. */
  private throwArea(unit: Unit, effect: Extract<UtilityEffect, { kind: 'aoe' }>): void {
    const line = shotLine(this.units.activeUnits, null, unit, effect.muzzle, effect.range);
    const damage = effect.damage * unit.statMultiplier('damage');
    this.projectiles.launch(effect.projectileKey, unit.side, line.x0, line.y0, damage, effect.radius).aimAt(line.x1, line.y1, true);
  }

  private *alliesWithin(unit: Unit, radius: number): Generator<Unit> {
    for (const other of this.units.activeUnits) {
      if (other.side === unit.side && other.isAlive && distanceTo(unit.x, other) <= radius) yield other;
    }
  }

  private *enemiesWithin(unit: Unit, range: number): Generator<Unit> {
    for (const other of this.units.activeUnits) {
      if (other.side !== unit.side && other.isAlive && distanceTo(unit.x, other) - unit.halfWidth <= range) yield other;
    }
  }

  private enemyWithin(unit: Unit, range: number): boolean {
    for (const _enemy of this.enemiesWithin(unit, range)) return true;
    return false;
  }

  private pulse(unit: Unit, kind: 'heal' | 'shield' | 'slow' | 'buff', radius: number): void {
    emit(Events.UtilityPulse, { side: unit.side, kind, x: unit.x, radius });
  }

  /** Auras tick often; only show a pulse every `UTILITY_AURA_PULSE_MS`. */
  private auraPulse(unit: Unit, kind: 'slow' | 'buff', radius: number, nowMs: number): void {
    if (nowMs < unit.auraPulseAt) return;
    unit.auraPulseAt = nowMs + UTILITY_AURA_PULSE_MS;
    this.pulse(unit, kind, radius);
    this.gesture(unit); // visual: the alchemist lifts its flask, the officer gives orders
  }

  /**
   * A utility unit acts out its effect with its attack animation. A combat
   * unit with an aura (the Mech's head) doesn't: its attack animation is
   * its weapons'.
   */
  private gesture(unit: Unit): void {
    if (unit.definition.role === 'utility') unit.playAttack();
  }
}
