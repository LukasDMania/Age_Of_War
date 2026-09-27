/**
 * The one shared event bus. Systems, UI and AI talk through it rather than
 * holding references to each other.
 *
 * - `*-requested` events come from the UI or AI; the owning system validates
 *   and acts.
 * - Everything else is a notification anyone may listen to.
 *
 * The catalog in docs/IMPLEMENTATION_PLAN.md (Appendix A) mirrors the
 * `Events` map and `EventPayloads` below. Adding an event means adding a row
 * there, an entry in `Events`, and an entry in `EventPayloads`.
 */
import Phaser from 'phaser';
import type { MechDesign } from '@config/mech.config';
import type { BuildingId, PerkChoice, ResearchId } from '@config/buildings.config';
import type { MatchPhase, ModifiableStat, QueuedUnit, Side } from '@state/types';

export const Events = {
  // Requests
  BuyUnitRequested: 'buy-unit-requested',
  BuildMechRequested: 'build-mech-requested',
  BuySlotRequested: 'buy-slot-requested',
  BuyTurretRequested: 'buy-turret-requested',
  UpgradeTurretRequested: 'upgrade-turret-requested',
  SellTurretRequested: 'sell-turret-requested',
  AgeUpRequested: 'age-up-requested',
  SpecialRequested: 'special-requested',
  PauseRequested: 'pause-requested',
  ResumeRequested: 'resume-requested',
  RestartRequested: 'restart-requested',
  QuitToMenuRequested: 'quit-to-menu-requested',
  /** Conquest prototype: leave a battle (retreating if it isn't over) for the campaign screen. */
  ConquestContinueRequested: 'conquest-continue-requested',
  UpgradeBuildingRequested: 'upgrade-building-requested',
  ResearchRequested: 'research-requested',
  ChoosePerkRequested: 'choose-perk-requested',
  GameSpeedRequested: 'game-speed-requested',
  CameraFocusRequested: 'camera-focus-requested',
  BackgroundCycleRequested: 'background-cycle-requested',
  // Notifications
  GoldChanged: 'gold-changed',
  XpChanged: 'xp-changed',
  UnitSpawned: 'unit-spawned',
  UnitQueueChanged: 'unit-queue-changed',
  MechChanged: 'mech-changed',
  UnitDied: 'unit-died',
  UnitDamaged: 'unit-damaged',
  AreaHit: 'area-hit',
  EconomyChanged: 'economy-changed',
  UnitHealed: 'unit-healed',
  UtilityPulse: 'utility-pulse',
  BaseDamaged: 'base-damaged',
  BaseDestroyed: 'base-destroyed',
  TurretBuilt: 'turret-built',
  TurretUpgraded: 'turret-upgraded',
  TurretSold: 'turret-sold',
  SlotUnlocked: 'slot-unlocked',
  AgeChanged: 'age-changed',
  SpecialFired: 'special-fired',
  SpecialCooldownChanged: 'special-cooldown-changed',
  ModifierApplied: 'modifier-applied',
  ModifierRemoved: 'modifier-removed',
  MatchStateChanged: 'match-state-changed',
  BuildingUpgraded: 'building-upgraded',
  ResearchCompleted: 'research-completed',
  BuildingPerkChosen: 'building-perk-chosen',
  GameSpeedChanged: 'game-speed-changed',
  BackgroundChanged: 'background-changed',
  KeybindingsChanged: 'keybindings-changed',
  ProjectileImpact: 'projectile-impact',
  ShotBounced: 'shot-bounced',
  UnitStruck: 'unit-struck',
  TurretFired: 'turret-fired',
  UnitPromoted: 'unit-promoted',
  DoctrineOffered: 'doctrine-offered',
  ChooseDoctrineRequested: 'choose-doctrine-requested',
  DoctrineChosen: 'doctrine-chosen',
  WarCryRequested: 'war-cry-requested',
  WarCryUsed: 'war-cry-used',
  WarCryCooldownChanged: 'war-cry-cooldown-changed',
  /** Conquest (prototype): the siege rule raised every unit's damage. */
  SiegeChanged: 'siege-changed',
} as const;

/** The utility effect kinds (see `UtilityEffect` in unitDefinitions). */
export type UtilityKind = 'heal' | 'aoe' | 'slow' | 'buff' | 'shield';

/** Why gold moved. Lets the HUD and tests tell income from spending. */
export type GoldSource =
  | 'kill'
  | 'mine'
  /** Market building: surplus XP sold for gold (prototype). */
  | 'market'
  | 'ai-income'
  | 'economy-unit'
  | 'purchase'
  | 'refund'
  /** Conquest prototype: a battle's starting grants (paid straight back into the requested purchase). */
  | 'conquest'
  | 'cheat';

/** One unit waiting in (or being trained by) a side's training queue. */
export type QueuedUnitInfo = QueuedUnit;

export interface EventPayloads {
  [Events.BuyUnitRequested]: { side: Side; unitId: string };
  /** The Mech workshop: build this design (in the side's current age). */
  [Events.BuildMechRequested]: { side: Side; design: MechDesign };
  [Events.BuySlotRequested]: { side: Side };
  [Events.BuyTurretRequested]: {
    side: Side;
    slotIndex: number;
    turretId: string;
  };
  [Events.UpgradeTurretRequested]: { side: Side; slotIndex: number };
  [Events.SellTurretRequested]: { side: Side; slotIndex: number };
  [Events.AgeUpRequested]: { side: Side };
  [Events.PauseRequested]: Record<string, never>;
  [Events.ResumeRequested]: Record<string, never>;
  [Events.RestartRequested]: Record<string, never>;
  [Events.QuitToMenuRequested]: Record<string, never>;
  [Events.ConquestContinueRequested]: Record<string, never>;
  [Events.SpecialRequested]: { side: Side };
  /** Build (level 0 -> 1) or upgrade a building by one level. */
  [Events.UpgradeBuildingRequested]: { side: Side; buildingId: BuildingId };
  [Events.ResearchRequested]: { side: Side; researchId: ResearchId };
  /** Pick one of a building's two perks for a pending milestone (prototype). */
  [Events.ChoosePerkRequested]: { side: Side; buildingId: BuildingId; choice: PerkChoice };
  /** Playtest speed: 1, 2, 3, 4 or 8. */
  [Events.GameSpeedRequested]: { multiplier: number };
  [Events.CameraFocusRequested]: { target: 'lane' | 'buildings' };
  /** Playtest: show the next background option. */
  [Events.BackgroundCycleRequested]: Record<string, never>;

  [Events.GoldChanged]: {
    side: Side;
    gold: number;
    delta: number;
    source: GoldSource;
  };
  /** `xpToNext` is null in the final age. */
  [Events.XpChanged]: { side: Side; xp: number; xpToNext: number | null };
  [Events.UnitSpawned]: { side: Side; unitId: string; instanceId: number };
  [Events.UnitQueueChanged]: { side: Side; queue: readonly QueuedUnitInfo[] };
  /** A side's Mech: building (every frame while it builds), spawned, or fallen. */
  [Events.MechChanged]: { side: Side; alive: boolean; build: { unitId: string; remainingMs: number; totalMs: number } | null };
  /** `side` is the side of the unit that died; `killerSide` scored it. */
  [Events.UnitDied]: {
    side: Side;
    unitId: string;
    instanceId: number;
    killerSide: Side;
    x: number;
    /** Set when a turret scored the kill: its slot. */
    killerTurret?: number;
  };
  /**
   * A unit lost HP. `amount` is the HP lost; `absorbed` is what a shield
   * soaked up first (Phase 7). `x` and `topY` place feedback over the unit.
   */
  [Events.UnitDamaged]: {
    side: Side;
    instanceId: number;
    amount: number;
    absorbed: number;
    x: number;
    topY: number;
  };
  /**
   * A side's money units changed (one spawned or died): its income from them
   * and the penalty they put on its other units (1 = none).
   */
  [Events.EconomyChanged]: {
    side: Side;
    economyUnits: number;
    incomePerSec: number;
    damageMult: number;
    speedMult: number;
  };
  /** A unit regained HP (utility heal). `amount` is the HP actually restored. */
  [Events.UnitHealed]: { side: Side; instanceId: number; amount: number; x: number; topY: number };
  /**
   * A utility unit used its effect (or its aura ticked): for feedback only.
   * `side` owns the utility unit; `radius` is how far the effect reaches.
   */
  [Events.UtilityPulse]: { side: Side; kind: UtilityKind; x: number; radius: number };
  /** Splash damage landed: `side` dealt it, centered on `x` along the lane. */
  [Events.AreaHit]: { side: Side; x: number; radius: number };
  [Events.BaseDamaged]: {
    side: Side;
    hp: number;
    maxHp: number;
    amount: number;
  };
  [Events.BaseDestroyed]: { side: Side };
  [Events.TurretBuilt]: { side: Side; slotIndex: number; turretId: string };
  [Events.TurretUpgraded]: { side: Side; slotIndex: number; level: number };
  [Events.TurretSold]: { side: Side; slotIndex: number; refund: number };
  [Events.SlotUnlocked]: { side: Side; slotIndex: number };
  [Events.AgeChanged]: { side: Side; age: number };
  [Events.SpecialFired]: { side: Side; age: number };
  [Events.SpecialCooldownChanged]: {
    side: Side;
    remainingMs: number;
    totalMs: number;
  };
  [Events.ModifierApplied]: {
    instanceId: number;
    modifierId: string;
    stat: ModifiableStat;
    mult: number;
  };
  [Events.ModifierRemoved]: { instanceId: number; modifierId: string };
  [Events.MatchStateChanged]: { from: MatchPhase; to: MatchPhase };
  [Events.BuildingUpgraded]: { side: Side; buildingId: BuildingId; level: number };
  [Events.ResearchCompleted]: { side: Side; researchId: ResearchId; tier: number };
  /** A building perk was picked; `picks` is how many that building has now. */
  [Events.BuildingPerkChosen]: { side: Side; buildingId: BuildingId; choice: PerkChoice; picks: number };
  [Events.GameSpeedChanged]: { multiplier: number };
  [Events.BackgroundChanged]: { id: string; name: string };
  /** The Controls screen closed after keys or armies changed (UI redraws its key labels). */
  [Events.KeybindingsChanged]: Record<string, never>;
  /**
   * A projectile landed (feedback only): what it hit, where, its key (for the
   * look) and its splash radius. `side` fired it.
   */
  [Events.ProjectileImpact]: {
    side: Side;
    key: string;
    x: number;
    y: number;
    radius: number;
    target: 'unit' | 'base' | 'ground';
  };
  /** A shot ricocheted from one unit to another (feedback; Conquest's Ricochet). `side` fired it. */
  [Events.ShotBounced]: { side: Side; fromX: number; fromY: number; toX: number; toY: number };
  /**
   * A unit's attack happened (feedback only): a melee blow landed or a shot
   * left. `frontX` is the unit's leading edge; `slot` 3 is a heavy.
   */
  [Events.UnitStruck]: {
    side: Side;
    instanceId: number;
    unitId: string;
    slot: number;
    x: number;
    frontX: number;
    ranged: boolean;
  };
  /** A turret fired (feedback only); (`x`, `y`) is its muzzle. */
  [Events.TurretFired]: { side: Side; slotIndex: number; turretId: string; x: number; y: number };
  /** Veterancy (prototype): a unit ranked up. */
  [Events.UnitPromoted]: { side: Side; instanceId: number; rank: number; x: number; topY: number };
  /** Age doctrines (prototype): a side may pick one of these doctrine ids. */
  [Events.DoctrineOffered]: { side: Side; age: number; options: readonly string[] };
  [Events.ChooseDoctrineRequested]: { side: Side; doctrineId: string };
  [Events.DoctrineChosen]: { side: Side; doctrineId: string };
  /** War Cry (prototype): request, use, and its cooldown (like the special's). */
  [Events.WarCryRequested]: { side: Side };
  /** `positions` are the x of every unit it rallied (for the effect). */
  [Events.WarCryUsed]: { side: Side; durationMs: number; positions: readonly number[] };
  [Events.WarCryCooldownChanged]: { side: Side; remainingMs: number; totalMs: number };
  /** `mult` is the damage multiplier every unit now has (1 = none yet). */
  [Events.SiegeChanged]: { mult: number };
}

export type EventName = keyof EventPayloads;

/** The underlying emitter. Prefer the typed helpers below. */
export const eventBus = new Phaser.Events.EventEmitter();

export function emit<K extends EventName>(
  event: K,
  payload: EventPayloads[K],
): void {
  eventBus.emit(event, payload);
}

/** Subscribes and returns an unsubscribe function. */
export function on<K extends EventName>(
  event: K,
  listener: (payload: EventPayloads[K]) => void,
  context?: unknown,
): () => void {
  eventBus.on(event, listener, context);
  return () => {
    eventBus.off(event, listener, context);
  };
}

export function once<K extends EventName>(
  event: K,
  listener: (payload: EventPayloads[K]) => void,
  context?: unknown,
): () => void {
  eventBus.once(event, listener, context);
  return () => {
    eventBus.off(event, listener, context, true);
  };
}

export function off<K extends EventName>(
  event: K,
  listener: (payload: EventPayloads[K]) => void,
  context?: unknown,
): void {
  eventBus.off(event, listener, context);
}

/** Drops every listener. Call when tearing a match down for a restart. */
export function clearAllListeners(): void {
  eventBus.removeAllListeners();
}
