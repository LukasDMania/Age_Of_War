import { getAge } from '@config/ages.config';
import { buildingUpgradeCost } from '@config/buildings.config';
import { SIEGE, type ConquestEffect } from '@config/conquest.config';
import { getTurretDefinition, slotUnlockCost } from '@entities/turretDefinitions';
import { getUnitDefinition } from '@entities/unitDefinitions';
import type { Base } from '@entities/Base';
import type { UnitFactory } from '@entities/UnitFactory';
import { addGold, addXp } from '@state/economyOps';
import type { MatchState } from '@state/GameState';
import { SIDES, type Side } from '@state/types';
import { buildingRejection, researchPrice, researchRejection } from '@systems/BuildingSystem';
import { dealBaseDamage } from '@systems/damageOps';
import { setSideModifier } from '@systems/statusOps';
import { emit, Events } from '@utils/EventBus';

/** The product of a battle's `ai-income` effects (for AiIncomeSystem). */
export function conquestAiIncomeMult(effects: readonly ConquestEffect[]): number {
  return effects.reduce((mult, e) => (e.kind === 'ai-income' ? mult * e.mult : mult), 1);
}

const sidesOf = (side: Side | 'both'): readonly Side[] => (side === 'both' ? SIDES : [side]);

/** Each side's product of a battle's `kill-gold` effects (for EconomySystem). */
export function conquestKillGoldMult(effects: readonly ConquestEffect[]): Record<Side, number> {
  const mult: Record<Side, number> = { player: 1, enemy: 1 };
  for (const e of effects) {
    if (e.kind !== 'kill-gold') continue;
    for (const side of sidesOf(e.side)) mult[side] *= e.mult;
  }
  return mult;
}

/**
 * Sets up a Conquest battle (prototype, feature `conquest`): the node's
 * mutators, the run's relics and the ascension level, applied once on the
 * first tick of the match through the normal rules. Starting ages and
 * starting buildings, research and turrets are granted as exactly the gold
 * they cost (source `conquest`) followed by the usual `*-requested` event,
 * so the owning systems still validate and build them; stat changes are
 * side modifiers. `ai-income` effects are read by GameScene for
 * AiIncomeSystem (`conquestAiIncomeMult`), `kill-gold` effects for
 * EconomySystem (`conquestKillGoldMult`).
 *
 * Free units (`units`) are granted their price and bought through
 * `buy-unit-requested`, so they queue and train like any purchase (the
 * queue holds five; more are dropped by SpawnSystem).
 *
 * Siege (`SIEGE`): from minute five, a side-wide damage modifier on both
 * sides that grows every minute (announced with `siege-changed`); from
 * minute eight, siege guns hit both bases (through `damageOps`).
 *
 * Listens for nothing. Emits: `siege-changed`, `age-up-requested`, `buy-unit-requested`,
 * `upgrade-building-requested`, `research-requested`, `buy-slot-requested`,
 * `buy-turret-requested`, `upgrade-turret-requested`; `gold-changed` /
 * `xp-changed` through economyOps.
 */
export class ConquestSystem {
  private readonly state: MatchState;
  private readonly units: UnitFactory;
  private readonly effects: readonly ConquestEffect[];
  private readonly bases: Record<Side, Base>;
  private applied = false;
  /** Minutes of siege applied so far, and when the siege guns fire next. */
  private siegeMinutes = 0;
  private nextVolleyAt: number = SIEGE.wallsFromMs;

  constructor(state: MatchState, units: UnitFactory, bases: Record<Side, Base>, effects: readonly ConquestEffect[]) {
    this.state = state;
    this.units = units;
    this.bases = bases;
    this.effects = effects;
  }

  update(nowMs = 0): void {
    if (this.state.phase !== 'playing') return;
    this.updateSiege(nowMs);
    if (this.applied) return;
    this.applied = true;
    const order: ConquestEffect['kind'][] = ['start-age', 'building', 'research', 'turrets', 'unit-stat', 'units', 'gold', 'xp'];
    for (const kind of order) {
      this.effects.forEach((effect, index) => {
        if (effect.kind === kind) this.apply(effect, index);
      });
    }
  }

  destroy(): void {
    // Nothing to release: the effects live in the match state.
  }

  /** Siege: every full minute past `SIEGE.startMs`, all units hit harder; later the walls take fire. */
  private updateSiege(nowMs: number): void {
    if (nowMs >= this.nextVolleyAt) {
      this.nextVolleyAt += SIEGE.wallsEveryMs;
      const minutes = (nowMs - SIEGE.wallsFromMs) / 60_000;
      const perMinute = SIEGE.wallsFirst + SIEGE.wallsGrowth * Math.floor(minutes);
      for (const side of SIDES) {
        const base = this.bases[side];
        dealBaseDamage(base, (base.maxHp * perMinute * SIEGE.wallsEveryMs) / 60_000);
      }
    }
    const minutes = nowMs < SIEGE.startMs ? 0 : Math.floor((nowMs - SIEGE.startMs) / 60_000) + 1;
    if (minutes <= this.siegeMinutes) return;
    this.siegeMinutes = minutes;
    const mult = Math.min(SIEGE.maxMult, 1 + SIEGE.perMinute * minutes);
    for (const side of SIDES) {
      setSideModifier(this.state, this.units.activeUnits, side, { id: 'conquest-siege', source: 'conquest', stat: 'damage', mult });
    }
    emit(Events.SiegeChanged, { mult });
  }

  private grant(side: Side, gold: number): void {
    if (gold > 0) addGold(this.state, side, gold, 'conquest');
  }

  private apply(effect: ConquestEffect, index: number): void {
    switch (effect.kind) {
      case 'start-age':
        for (const side of SIDES) this.ageUpTo(side, effect.age);
        return;
      case 'gold':
        for (const side of sidesOf(effect.side)) {
          this.grant(side, Math.round(effect.amount * getAge(this.state[side].age).scale));
        }
        return;
      case 'xp':
        for (const side of sidesOf(effect.side)) addXp(this.state, side, effect.amount);
        return;
      case 'building':
        for (const side of sidesOf(effect.side)) {
          for (let i = 0; i < effect.levels; i++) {
            const me = this.state[side];
            const rejection = buildingRejection(me, effect.buildingId);
            const cost = buildingUpgradeCost(effect.buildingId, me.buildings[effect.buildingId]);
            if ((rejection !== null && rejection !== 'gold') || cost === null) break;
            this.grant(side, cost);
            emit(Events.UpgradeBuildingRequested, { side, buildingId: effect.buildingId });
          }
        }
        return;
      case 'research':
        for (const side of sidesOf(effect.side)) {
          for (let i = 0; i < effect.tiers; i++) {
            const me = this.state[side];
            const rejection = researchRejection(me, effect.researchId);
            const cost = researchPrice(me, effect.researchId);
            if ((rejection !== null && rejection !== 'gold') || cost === null) break;
            this.grant(side, cost);
            emit(Events.ResearchRequested, { side, researchId: effect.researchId });
          }
        }
        return;
      case 'turrets':
        for (const side of sidesOf(effect.side)) {
          for (let i = 0; i < effect.count; i++) this.addTurret(side, effect.turretKind, effect.level);
        }
        return;
      case 'unit-stat':
        for (const side of sidesOf(effect.side)) {
          setSideModifier(this.state, this.units.activeUnits, side, {
            id: `conquest-${index}`,
            source: 'conquest',
            stat: effect.stat,
            mult: effect.mult,
            ...(effect.slots ? { onlySlots: effect.slots } : {}),
          });
        }
        return;
      case 'units':
        for (const side of sidesOf(effect.side)) {
          const unitId = getAge(this.state[side].age).unitIds[effect.slot - 1];
          if (!unitId) continue;
          const cost = getUnitDefinition(unitId).cost;
          for (let i = 0; i < effect.count; i++) {
            this.grant(side, cost);
            emit(Events.BuyUnitRequested, { side, unitId });
          }
        }
        return;
      case 'ai-income':
        // Read by GameScene when it builds AiIncomeSystem.
        return;
      case 'kill-gold':
        // Read by GameScene when it builds EconomySystem.
        return;
    }
  }

  private ageUpTo(side: Side, age: number): void {
    const me = this.state[side];
    while (me.age < age) {
      const cost = getAge(me.age).xpToNext;
      if (cost === null) return;
      if (me.xp < cost) addXp(this.state, side, cost - me.xp);
      const before = me.age;
      emit(Events.AgeUpRequested, { side });
      if (me.age === before) return;
    }
  }

  /** A turret of the side's age and `kind` in the first empty slot (unlocking one if needed), upgraded `level` times. */
  private addTurret(side: Side, kind: 'rapid' | 'heavy' | 'area', level: number): void {
    const me = this.state[side];
    let slotIndex = me.turrets.findIndex((t, i) => t === null && i < me.unlockedSlots);
    if (slotIndex < 0) {
      const cost = slotUnlockCost(me.unlockedSlots);
      if (cost === undefined || me.unlockedSlots >= me.turrets.length) return;
      this.grant(side, cost);
      emit(Events.BuySlotRequested, { side });
      slotIndex = me.unlockedSlots - 1;
      if (me.turrets[slotIndex] !== null) return;
    }
    const turretId = getAge(me.age).turretIds.find((id) => getTurretDefinition(id).kind === kind);
    if (!turretId) return;
    const definition = getTurretDefinition(turretId);
    this.grant(side, definition.cost);
    emit(Events.BuyTurretRequested, { side, slotIndex, turretId });
    for (let i = 0; i < level; i++) {
      const next = definition.upgrades[i];
      if (!next || me.turrets[slotIndex]?.level !== i) return;
      this.grant(side, next.cost);
      emit(Events.UpgradeTurretRequested, { side, slotIndex });
    }
  }
}
