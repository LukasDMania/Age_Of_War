import Phaser from 'phaser';
import { AGE_COUNT, getAge, isFinalAge } from '@config/ages.config';
import { BACKGROUND_STORAGE_KEY, BACKGROUNDS, type BackgroundDef } from '@config/backgrounds.config';
import { activeBuildingIds, buildingX, perksPending, scrollMargin, type BuildingId } from '@config/buildings.config';
import {
  AI_DIFFICULTIES,
  DEFAULT_AI_DIFFICULTY,
  withoutOpening,
  type AiDifficulty,
  type AiDifficultyName,
} from '@config/ai.config';
import { DEFAULT_AI_PROFILE, findAiProfile, type AiGenome } from '@config/aiGenome.config';
import {
  BASE_X,
  baseMaxHp,
  DEBUG_CHEATS,
  GAME_HEIGHT,
  GAME_OVER_DELAY_MS,
  GAME_SPEEDS,
  GAME_WIDTH,
  LANE_COLOR,
  LANE_Y,
  MAX_FRAME_DELTA_MS,
  SIM_STEP_MS,
  SCENE_KEYS,
} from '@config/constants';
import { Backdrop } from '@entities/Backdrop';
import { Base } from '@entities/Base';
import { Building } from '@entities/Building';
import { MechScaffold } from '@entities/MechScaffold';
import { HitEffects } from '@entities/HitEffects';
import { ImpactEffects } from '@entities/ImpactEffects';
import { ProjectileFactory } from '@entities/ProjectileFactory';
import { UnitFactory } from '@entities/UnitFactory';
import { AgeProgressionSystem } from '@systems/AgeProgressionSystem';
import { AIController } from '@systems/AIController';
import { UtilityAI } from '@systems/UtilityAI';
import { feature } from '@config/features.config';
import { DoctrineAi, DoctrineSystem } from '@systems/experimental/DoctrineSystem';
import { VeterancySystem } from '@systems/experimental/VeterancySystem';
import { WarCryAi, WarCrySystem } from '@systems/experimental/WarCrySystem';
import { ConquestSystem, conquestAiIncomeMult, conquestKillGoldMult } from '@systems/experimental/ConquestSystem';
import type { ConquestEffect } from '@config/conquest.config';
import { finishBattle } from '@state/conquestState';
import { AiIncomeSystem } from '@systems/AiIncomeSystem';
import { BuildingSystem } from '@systems/BuildingSystem';
import { CasualtySystem } from '@systems/CasualtySystem';
import { CombatSystem } from '@systems/CombatSystem';
import { dealBaseDamage, dealUnitDamage } from '@systems/damageOps';
import { EconomySystem } from '@systems/EconomySystem';
import { LaneSystem } from '@systems/LaneSystem';
import { MatchLogger } from '@systems/MatchLogger';
import { MatchSystem } from '@systems/MatchSystem';
import { ProjectileSystem } from '@systems/ProjectileSystem';
import { MechSystem } from '@systems/MechSystem';
import { SpawnSystem } from '@systems/SpawnSystem';
import { SpecialSystem } from '@systems/SpecialSystem';
import { StatsSystem } from '@systems/StatsSystem';
import { StatusSystem } from '@systems/StatusSystem';
import {
  applyModifier,
  clearSideModifier,
  grantShield,
  removeModifier,
  setSideModifier,
} from '@systems/statusOps';
import { TurretSystem } from '@systems/TurretSystem';
import { UtilitySystem } from '@systems/UtilitySystem';
import { addGold, addXp } from '@state/economyOps';
import { createGameState, type MatchState } from '@state/GameState';
import { otherSide, SIDES, type Side } from '@state/types';
import type { HudSceneData } from '@ui/HUDScene';
import type { OverlaySceneData } from '@ui/OverlayScene';
import { KeyboardControls } from '@ui/keymap';
import {
  installDebugHandle,
  removeDebugHandle,
  type DebugSnapshot,
} from '@utils/debug';
import { emit, eventBus, Events, on } from '@utils/EventBus';
import { ensureRigArt, ensureRigArtForAge, releaseMechArt, releaseRigArtOutside, rigArtBytes } from '@utils/RigArt';
import { HEADLESS_SIM } from '@utils/runtimeFlags';
import { AccountTracker } from '@systems/AccountTracker';
import { MechDuelAI } from '@systems/MechDuelAI';
import { hashMatch } from '@systems/stateHash';
import { LockstepSystem } from '@systems/LockstepSystem';
import type { MatchSetup, TurnRecord } from '@net/protocol';
import type { Transport } from '@net/transport';
import { setMatchFeatures } from '@config/features.config';
import { MAX_CATCH_UP_MS } from '@config/multiplayer.config';
import { isMechUnitId, mechDefinition } from '@entities/mechDesign';
import type { MechDesign } from '@config/mech.config';
import { loadAccount, lockedPartKeys, saveAccount } from '@state/accountProgress';

/** Options for starting (or restarting) a match. */
export interface GameSceneData {
  /**
   * Who plays the enemy: an AI difficulty, or 'off' for nobody (tests and
   * sandbox play). Defaults to `DEFAULT_AI_DIFFICULTY`.
   */
  ai?: AiDifficultyName | 'off';
  /**
   * Seed for the match's randomness (`MatchState.seed`); random when left
   * out. Lockstep multiplayer and replays pass the same seed to both runs.
   */
  seed?: number;
  /** Dev and tuning only: an AI also plays the player's side (AI vs AI). */
  playerAi?: AiDifficultyName;
  /**
   * Tuning: false plays the player-side AI without the AI's own income, on a
   * human's economy (Mine, kills). Conquest balance runs need this: with the
   * income on, the player side gets money no human gets.
   */
  playerAiIncome?: boolean;
  /** Enemy AI profile (strategy) by id, see `AI_PROFILES`; default 'classic'. */
  profile?: string;
  /** Player-side AI profile for AI vs AI. */
  playerProfile?: string;
  /** Training: explicit genomes for the utility brain (override the profiles). */
  genome?: AiGenome;
  playerGenome?: AiGenome;
  /**
   * Conquest prototype: this match is a campaign battle with these effects
   * (see ConquestSystem); the result goes back to the campaign.
   */
  conquest?: {
    effects: ConquestEffect[];
    label: string;
    /** The chapter's age: both sides are locked to it (no age-ups past it). */
    maxAge?: number;
  };
  /**
   * Mech vs Mech (Mech expansion): only these two Mechs fight, in this age.
   * No AI, no buying; the side whose Mech falls loses (its base falls with it).
   */
  duel?: { player: MechDesign; enemy: MechDesign; age: number };
  /**
   * Lockstep multiplayer (Phase 22): the shared setup (its seed, switches,
   * Mech locks and duel win over the fields above), the side this browser
   * plays and the link to the other player; or, with `localSide` null and
   * `replay`, a replay of a match's command log. Nobody plays the enemy
   * unless `ai` asks for it (loopback checks).
   */
  lockstep?: {
    setup: MatchSetup;
    localSide: Side | null;
    transport: Transport | null;
    replay?: readonly TurnRecord[];
  };
}

/** Anything that plays a side by emitting requests. */
interface AiBrain {
  update(nowMs: number): void;
  lastDecision?: string;
}

/** Real ms after an age change before the next age's unit art is drawn ahead of time. */
const RIG_ART_PREDRAW_DELAY_MS = 2000;

/** Camera scroll speed with the arrow / A-D keys, px per real second. */
const CAMERA_KEY_SCROLL = 900;
const CAMERA_PAN_MS = 450;

/**
 * The match scene. It builds a fresh `MatchState`, the bases, the factories
 * and the systems, launches the HUD scene on top, then runs the systems in a
 * fixed order each frame (see `tick`).
 */
export class GameScene extends Phaser.Scene {
  private state!: MatchState;
  private bases!: Record<Side, Base>;
  private units!: UnitFactory;
  private projectiles!: ProjectileFactory;
  private effects!: HitEffects;
  private impacts!: ImpactEffects;
  private match!: MatchSystem;
  private combat!: CombatSystem;
  private projectileSystem!: ProjectileSystem;
  private casualties!: CasualtySystem;
  private lane!: LaneSystem;
  private economy!: EconomySystem;
  private spawn!: SpawnSystem;
  private mech!: MechSystem;
  private turrets!: TurretSystem;
  private special!: SpecialSystem;
  private status!: StatusSystem;
  private ages!: AgeProgressionSystem;
  private utility!: UtilitySystem;
  private stats!: StatsSystem;
  private account: AccountTracker | null = null;
  private buildingSystem!: BuildingSystem;
  private buildingViews!: Record<Side, Partial<Record<BuildingId, Building>>>;
  /** A Mech being put together in front of each base. */
  private scaffolds!: Record<Side, MechScaffold>;
  /** Pause, speed, background, camera and dev keys (the keymap's `always` actions). */
  private keys: KeyboardControls | null = null;
  private ai: AiBrain | null = null;
  private playerAi: AiBrain | null = null;
  /**
   * Prototype systems (features.config), each on only with its flag: built
   * here, ticked after the core systems, torn down with the match.
   */
  private experiments: { update?(nowMs: number): void; destroy(): void }[] = [];
  /**
   * A Conquest battle's setup and siege (prototype). Ticked before the AIs,
   * so the battle's age and starting gold are in place before the AI's
   * first purchase (it used to buy a Stone-age unit on the first tick).
   */
  private conquest: ConquestSystem | null = null;
  /** The AI's own income, one per AI-played side (Phase 15). */
  private aiIncome: AiIncomeSystem[] = [];
  /** Dev builds, human player only: records the match to playtest-logs/. */
  private logger: MatchLogger | null = null;
  /** Lockstep multiplayer (or a replay); null in a normal match. */
  private lockstep: LockstepSystem | null = null;
  private ground!: Phaser.GameObjects.Graphics;
  private laneLine!: Phaser.GameObjects.Graphics;
  private backdrop!: Backdrop;
  /** Playtest background choice (index into BACKGROUNDS). */
  private backgroundIndex = 0;

  private aiSetting: AiDifficultyName | 'off' = DEFAULT_AI_DIFFICULTY;
  private playerAiSetting: AiDifficultyName | null = null;
  private sceneData: GameSceneData = {};
  private debugModifierCount = 0;
  private simSpeed = 1;
  /** Frame time not yet spent on a whole tick (see `stepSim`). */
  private simCarryMs = 0;
  private cleanups: (() => void)[] = [];

  constructor() {
    super({ key: SCENE_KEYS.game });
  }

  /** Runs before `create` on every start and restart: reset per-match fields. */
  init(data: GameSceneData = {}): void {
    this.sceneData = data;
    this.aiSetting = data.ai ?? (data.lockstep ? 'off' : DEFAULT_AI_DIFFICULTY);
    this.playerAiSetting = data.playerAi ?? null;
    this.simSpeed = 1;
    this.simCarryMs = 0;
    this.cleanups = [];
  }

  create(): void {
    const net = this.sceneData.lockstep;
    // Both browsers play with the host's switches.
    setMatchFeatures(net?.setup.features ?? null);
    this.state = createGameState(net?.setup.seed ?? this.sceneData.seed);
    const duel = net ? net.setup.duel : this.sceneData.duel;
    if (duel) {
      this.aiSetting = 'off';
      for (const side of SIDES) {
        const me = this.state[side];
        me.age = duel.age;
        me.maxAge = duel.age;
        me.baseHp = baseMaxHp(duel.age);
        me.gold = 0;
      }
    }
    const maxAge = this.sceneData.conquest?.maxAge;
    if (maxAge !== undefined) {
      this.state.player.maxAge = maxAge;
      this.state.enemy.maxAge = maxAge;
    }
    this.drawBackground();

    this.bases = {
      player: new Base(this, 'player', this.state.player, BASE_X.player),
      enemy: new Base(this, 'enemy', this.state.enemy, BASE_X.enemy),
    };
    this.units = new UnitFactory(this);
    this.projectiles = new ProjectileFactory(this);
    this.effects = new HitEffects(this);
    this.impacts = new ImpactEffects(this);
    this.match = new MatchSystem(this.state);
    this.combat = new CombatSystem(this.state, this.units, this.bases, this.projectiles);
    this.projectileSystem = new ProjectileSystem(this.state, this.projectiles, this.units, this.bases);
    this.casualties = new CasualtySystem(this.units);
    this.lane = new LaneSystem(this.units, this.bases);
    this.economy = new EconomySystem(this.state, this.units, conquestKillGoldMult(this.sceneData.conquest?.effects ?? []));
    this.spawn = new SpawnSystem(this.state, this.units, (unitId, side) =>
      this.lane.isSpawnPointClear(side, this.units.spriteWidth(unitId, side)),
    );
    this.mech = new MechSystem(
      this.state,
      this.units,
      (unitId, side) => this.lane.isSpawnPointClear(side, this.units.spriteWidth(unitId, side)),
      {
        bases: this.bases,
        projectiles: this.projectiles,
        stunTurrets: (side, x, range, untilMs) => this.turrets.stunNear(side, x, range, untilMs),
      },
    );
    this.turrets = new TurretSystem(this, this.state, this.bases, this.units, this.projectiles);
    this.special = new SpecialSystem(this.state, this.units, this.projectiles, () => this.match.elapsedMs);
    this.status = new StatusSystem(this.state, this.units);
    this.ages = new AgeProgressionSystem(this.state, this.bases);
    this.utility = new UtilitySystem(this.units, this.projectiles);
    this.stats = new StatsSystem();
    // The account (Mech parts opened across games): only for matches a person plays.
    const personPlays = !HEADLESS_SIM && this.playerAiSetting === null && !duel && !net;
    this.account = personPlays ? new AccountTracker(this.units) : null;
    if (personPlays) this.state.player.mechLocked = lockedPartKeys(loadAccount());
    if (net) for (const side of SIDES) this.state[side].mechLocked = [...net.setup.mechLocked[side]];
    this.buildingSystem = new BuildingSystem(this.state, this.units);
    this.aiIncome = [];
    if (this.aiSetting !== 'off') {
      const bonus = conquestAiIncomeMult(this.sceneData.conquest?.effects ?? []);
      this.aiIncome.push(new AiIncomeSystem(this.state, 'enemy', this.difficultyFor(this.aiSetting), bonus));
    }
    if (this.playerAiSetting && this.sceneData.playerAiIncome !== false) this.aiIncome.push(new AiIncomeSystem(this.state, 'player', this.difficultyFor(this.playerAiSetting)));
    this.scaffolds = { player: new MechScaffold(this, 'player', LANE_Y), enemy: new MechScaffold(this, 'enemy', LANE_Y) };
    this.buildingViews = {
      player: this.createBuildingViews('player'),
      enemy: this.createBuildingViews('enemy'),
    };
    this.setupCamera();
    this.createExperiments();
    this.logger =
      import.meta.env.DEV && this.playerAiSetting === null
        ? new MatchLogger(this.state, this.units, this.aiSetting, () => this.match.elapsedMs, this.sceneData.conquest ?? null)
        : null;
    this.ai =
      this.aiSetting === 'off'
        ? null
        : this.makeBrain('enemy', this.difficultyFor(this.aiSetting), this.sceneData.profile, this.sceneData.genome);
    this.playerAi =
      this.playerAiSetting === null
        ? null
        : this.makeBrain('player', this.difficultyFor(this.playerAiSetting), this.sceneData.playerProfile, this.sceneData.playerGenome);

    this.cleanups.push(
      on(Events.BaseDestroyed, ({ side }) => this.onBaseDestroyed(side)),
      on(Events.MatchStateChanged, ({ from, to }) => {
        if (to === 'paused') {
          this.scene.launch(SCENE_KEYS.overlay, { kind: 'paused', conquest: this.isConquest } satisfies OverlaySceneData);
        }
        else if (from === 'paused') this.scene.stop(SCENE_KEYS.overlay);
        // Unit animations (walk cycles) freeze with the match.
        if (to === 'playing') this.anims.resumeAll();
        else this.anims.pauseAll();
      }),
      // The scenery follows the player's age (placeholder recolor, Phase 8).
      on(Events.AgeChanged, ({ side }) => {
        if (side === 'player') this.paintScenery();
        this.refreshRigArt();
      }),
      on(Events.RestartRequested, () => this.restartMatch()),
      on(Events.BuildingUpgraded, ({ side, buildingId, level }) => {
        this.buildingViews[side][buildingId]?.setLevel(level);
        this.showPerkBadges();
      }),
      on(Events.BuildingPerkChosen, () => this.showPerkBadges()),
      on(Events.MechAssistChanged, ({ side, buildingId, working, remainingMs }) => {
        for (const [id, view] of Object.entries(this.buildingViews[side])) {
          view?.setAssist(id === buildingId ? (working ? 'working' : 'coming') : null, Math.ceil(remainingMs / 1000));
        }
      }),
      // A Mech's sheets are drawn when its build starts (not the frame it
      // walks out), and older designs no longer on the lane are freed.
      on(Events.MechChanged, ({ side, build }) => {
        this.scaffolds[side].setBuild(build);
        if (!build || build.remainingMs < build.totalMs) return;
        releaseMechArt(this, this.rigArtInUse());
        ensureRigArt(this, build.unitId, side);
      }),
      on(Events.GameSpeedRequested, ({ multiplier }) => this.setSimSpeed(multiplier)),
      on(Events.CameraFocusRequested, ({ target }) => this.panCamera(target)),
      on(Events.BackgroundCycleRequested, () => this.cycleBackground()),
      on(Events.QuitToMenuRequested, () => {
        this.logger?.finish('quit');
        this.scene.start(SCENE_KEYS.menu);
      }),
      on(Events.ConquestContinueRequested, () => {
        if (!this.isConquest) return;
        // Leaving before the end is a retreat: the battle counts as lost.
        if (this.match.phase !== 'gameover') finishBattle(false);
        this.logger?.finish('quit');
        this.scene.start(SCENE_KEYS.conquest);
      }),
    );
    // Keymap (config/keybindings.config.ts): pause, speed (cycles 1x-8x for
    // playtesting, like the HUD button), background, camera, and in dev
    // builds the cheats (gold and XP for the player, an instant age-up).
    // The hangar takes Esc (close) while it is open.
    this.keys = new KeyboardControls(this, () => (this.scene.isActive(SCENE_KEYS.hangar) ? [] : ['always']))
      .on('pause', () => this.match.togglePause())
      .on('speed', () => {
        const next = GAME_SPEEDS[(GAME_SPEEDS.indexOf(this.simSpeed) + 1) % GAME_SPEEDS.length] ?? 1;
        this.setSimSpeed(next);
      })
      .on('background', () => this.cycleBackground());
    if (import.meta.env.DEV) {
      this.installDebug();
      this.keys
        .on('dev-gold', () => addGold(this.state, 'player', DEBUG_CHEATS.gold, 'cheat'))
        .on('dev-xp', () => addXp(this.state, 'player', DEBUG_CHEATS.xp))
        .on('dev-age', () => {
          this.debugAgeUp('player');
        });
    }

    this.refreshRigArt();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.lockstep = net
      ? new LockstepSystem({
          localSide: net.localSide,
          transport: net.transport,
          ...(net.replay ? { replay: net.replay } : {}),
          hash: () => hashMatch(this.state, this.match.tick, this.units.activeUnits, this.projectiles.activeProjectiles),
        })
      : null;
    if (HEADLESS_SIM) {
      // Automated runs: simulate only (no HUD, nothing drawn).
      this.cameras.main.setVisible(false);
      this.match.start();
      return;
    }
    this.scene.launch(SCENE_KEYS.hud, {
      state: this.state,
      enemyController: this.aiSetting,
      enemyProfile:
        this.sceneData.conquest?.label ??
        (this.aiSetting === 'off' ? '' : (findAiProfile(this.sceneData.profile ?? DEFAULT_AI_PROFILE)?.label ?? '')),
      backgroundName: this.background.name,
      ...(duel ? { duel: true } : {}),
    } satisfies HudSceneData);
    this.match.start();
    if (duel) this.startDuel(duel);
  }

  /** Mech vs Mech: both Mechs walk out of their gates; the enemy's module gets a small AI. */
  private startDuel(duel: NonNullable<GameSceneData['duel']>): void {
    for (const side of SIDES) {
      const definition = mechDefinition(side === 'player' ? duel.player : duel.enemy, duel.age);
      ensureRigArt(this, definition.id, side);
      const unit = this.units.create(definition.id, side);
      const mech = this.state[side].mech;
      mech.alive = true;
      mech.abilityReadyAt = this.match.elapsedMs;
      emit(Events.UnitSpawned, { side, unitId: definition.id, instanceId: unit.instanceId });
    }
    if (!this.sceneData.lockstep) {
      const brain = new MechDuelAI(this.state, this.units);
      this.experiments.push({ update: (now) => brain.update(now), destroy: () => undefined });
    }
    // The side whose Mech falls loses: its base goes with it.
    this.cleanups.push(
      on(Events.UnitDied, ({ side, unitId, retired }) => {
        if (isMechUnitId(unitId) && !retired && this.match.phase === 'playing') dealBaseDamage(this.bases[side], this.bases[side].maxHp * 10);
      }),
    );
  }

  update(time: number, delta: number): void {
    this.scrollCameraByKeys(delta);
    this.clampCamera();
    // The graceful thump (heavy blows, big blasts, base hits) moves the view.
    const thump = this.impacts.thump.offset(time);
    this.cameras.main.scrollY = thump;
    this.backdrop.update(this.cameras.main.scrollX, time, thump);
    this.impacts.updateTrails(this.projectiles.activeProjectiles, time, delta);
    if (this.match.phase !== 'playing') return;
    this.stepSim(Math.min(delta, MAX_FRAME_DELTA_MS) * this.simSpeed);
  }

  /**
   * One simulation step. Order matters: a Conquest battle's setup first,
   * then the AI decides (its requests
   * are handled at once, like the player's clicks), then spawning, expiring
   * modifiers, then
   * every damage source (units, turrets, special strikes, utility effects,
   * projectiles), then
   * the casualty sweep (so the dead are gone before anything moves), then
   * movement and income.
   */
  private tick(dt: number): void {
    this.match.update(dt);
    const now = this.match.elapsedMs;
    this.conquest?.update(now);
    this.ai?.update(now);
    this.playerAi?.update(now);
    this.spawn.update(dt);
    this.mech.update(dt, this.match.elapsedMs);
    this.status.update(now);
    this.combat.update(now);
    this.turrets.update(now);
    this.special.update(now);
    this.utility.update(now);
    this.projectileSystem.update(dt, now);
    this.casualties.update();
    this.lane.update(dt);
    this.economy.update(dt);
    this.buildingSystem.update(dt);
    for (const income of this.aiIncome) income.update(dt, this.match.elapsedMs);
    for (const experiment of this.experiments) experiment.update?.(now);
    this.logger?.update(this.match.elapsedMs);
  }

  /** A difficulty preset; a Conquest battle that starts in a later age skips the opening. */
  private difficultyFor(name: AiDifficultyName): AiDifficulty {
    const lateStart = this.sceneData.conquest?.effects.some((e) => e.kind === 'start-age' && e.age > 0) ?? false;
    return lateStart ? withoutOpening(AI_DIFFICULTIES[name]) : AI_DIFFICULTIES[name];
  }

  /**
   * The AI for a side: the classic controller, or the utility brain with a
   * profile's genome (2026-09-26). An explicit genome (training) wins.
   */
  private makeBrain(side: Side, difficulty: AiDifficulty, profileId?: string, genome?: AiGenome): AiBrain {
    const profile = findAiProfile(profileId ?? DEFAULT_AI_PROFILE);
    const weights = genome ?? (profile?.brain === 'utility' ? profile.genome : undefined);
    if (weights) return new UtilityAI(this.state, side, this.units, this.bases, difficulty, weights);
    return new AIController(this.state, side, this.units, this.bases, difficulty);
  }

  /** The prototype systems that are switched on (see `config/features.config.ts`). */
  private createExperiments(): void {
    this.experiments = [];
    const aiSides: Side[] = [];
    if (this.aiSetting !== 'off') aiSides.push('enemy');
    if (this.playerAiSetting) aiSides.push('player');
    if (feature('veterancy')) this.experiments.push(new VeterancySystem(this.units));
    this.conquest = this.sceneData.conquest
      ? new ConquestSystem(this.state, this.units, this.bases, this.sceneData.conquest.effects)
      : null;
    if (feature('ageDoctrines')) {
      this.experiments.push(new DoctrineSystem(this.state, this.units, () => this.match.elapsedMs));
      for (const side of aiSides) this.experiments.push(new DoctrineAi(side, this.units, this.state.seed));
    }
    if (feature('warCry')) {
      const warCry = new WarCrySystem(this.state, this.units, () => this.match.elapsedMs);
      this.experiments.push(warCry);
      for (const side of aiSides) {
        const ai = new WarCryAi(side, this.units, warCry);
        this.experiments.push({ update: (now) => ai.update(now), destroy: () => undefined });
      }
    }
  }

  /**
   * Spends `ms` of time on whole `SIM_STEP_MS` ticks and carries the rest, so
   * the battle never depends on the frame rate (lockstep multiplayer needs
   * both browsers to step identically). A high playtest speed runs more
   * ticks per frame, never bigger ones.
   */
  private stepSim(ms: number): void {
    this.simCarryMs += ms;
    while (this.simCarryMs >= SIM_STEP_MS && this.match.phase === 'playing') {
      const lockstep = this.lockstep;
      if (lockstep) {
        // Waiting for the other player's turn: keep a little time to catch up with.
        if (!lockstep.ready(this.match.tick)) {
          this.simCarryMs = Math.min(this.simCarryMs, MAX_CATCH_UP_MS);
          return;
        }
        lockstep.runTick(this.match.tick, () => this.tick(SIM_STEP_MS));
      } else {
        this.tick(SIM_STEP_MS);
      }
      this.simCarryMs -= SIM_STEP_MS;
    }
    if (this.match.phase !== 'playing') this.simCarryMs = 0;
  }

  private drawBackground(): void {
    this.backdrop = new Backdrop(this);
    this.ground = this.add.graphics();
    this.laneLine = this.add.graphics();
    this.laneLine.lineStyle(4, LANE_COLOR, 1);
    const margin = scrollMargin();
    this.laneLine.lineBetween(-margin, LANE_Y, GAME_WIDTH + margin, LANE_Y);
    this.backgroundIndex = this.loadBackgroundChoice();
    this.applyBackground();
  }

  private get background(): BackgroundDef {
    return BACKGROUNDS[this.backgroundIndex] ?? BACKGROUNDS[0]!;
  }

  /** Playtest: next background option (HUD button or its key, Y by default). */
  private cycleBackground(): void {
    this.backgroundIndex = (this.backgroundIndex + 1) % BACKGROUNDS.length;
    try {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, this.background.id);
    } catch {
      // Storage can be unavailable; the choice then lasts until reload.
    }
    this.applyBackground();
  }

  private loadBackgroundChoice(): number {
    try {
      const id = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
      const index = BACKGROUNDS.findIndex((b) => b.id === id);
      return index >= 0 ? index : 0;
    } catch {
      return 0;
    }
  }

  private applyBackground(): void {
    this.backdrop.show(this.background);
    this.paintScenery();
    emit(Events.BackgroundChanged, { id: this.background.id, name: this.background.name });
  }

  /**
   * Sky color and the ground strip under the lane: the player's age colors,
   * or the chosen background's strip color. Backgrounds whose art has its own
   * ground hide the strip and the lane line.
   */
  private paintScenery(): void {
    const def = this.background;
    const { sky, ground } = getAge(this.state.player.age).visuals;
    this.cameras.main.setBackgroundColor(sky);
    this.ground.clear();
    this.laneLine.setVisible(def.ground === 'strip');
    if (def.ground !== 'strip') return;
    this.ground.fillStyle(def.stripColor ?? ground, 1);
    const margin = scrollMargin();
    // A little past the bottom edge: the camera thump lifts the view a few px.
    this.ground.fillRect(-margin, LANE_Y, GAME_WIDTH + 2 * margin, GAME_HEIGHT - LANE_Y + 24);
  }

  /**
   * Rig unit sheets are drawn per age on demand (they are large): the ages
   * both sides are in now, the next age a moment later (so the next age-up
   * doesn't stall a frame), and ages more than one away from both sides are
   * released once none of their units are left on the lane.
   */
  private refreshRigArt(): void {
    for (const age of new Set([this.state.player.age, this.state.enemy.age])) ensureRigArtForAge(this, age);
    this.time.delayedCall(RIG_ART_PREDRAW_DELAY_MS, () => {
      // Read the ages now, not when this was scheduled: several age-ups can
      // happen in between, and the current age's art must never be released.
      const lo = Math.min(this.state.player.age, this.state.enemy.age);
      const hi = Math.max(this.state.player.age, this.state.enemy.age);
      if (hi + 1 < AGE_COUNT) ensureRigArtForAge(this, hi + 1);
      releaseRigArtOutside(this, lo - 1, hi + 1, this.rigArtInUse());
    });
  }

  /** Units whose sheets must stay: on the lane (or dying), queued, or a Mech being built. */
  private rigArtInUse(): Set<string> {
    const inUse = new Set([...this.units.activeUnits].map((u) => u.definition.id));
    for (const side of [this.state.player, this.state.enemy]) {
      for (const queued of side.trainingQueue) inUse.add(queued.unitId);
      if (side.mech.build) inUse.add(side.mech.build.unitId);
    }
    return inUse;
  }

  /** Dev only: tops XP up to the threshold and asks for an age-up. */
  private debugAgeUp(side: Side): boolean {
    const sideState = this.state[side];
    const cost = getAge(sideState.age).xpToNext;
    if (cost === null || isFinalAge(sideState.age)) return false;
    if (sideState.xp < cost) addXp(this.state, side, cost - sideState.xp);
    const before = sideState.age;
    emit(Events.AgeUpRequested, { side });
    return sideState.age > before;
  }

  /** The base crumbles at once; the game-over panel follows a moment later. */
  private onBaseDestroyed(side: Side): void {
    this.logger?.finish(side === 'enemy' ? 'won' : 'lost');
    if (this.isConquest) {
      const me = this.state.player;
      finishBattle(side === 'enemy', Math.max(0, me.baseHp) / baseMaxHp(me.age));
    }
    this.bases[side].setTint(0x4a4a4a);
    const account =
      this.account?.finish({
        won: side === 'enemy',
        durationMs: this.match.elapsedMs,
        kills: this.stats.for('player').kills,
        conquest: this.isConquest,
      }) ?? null;
    this.time.delayedCall(GAME_OVER_DELAY_MS, () => {
      const summary = {
        won: side === 'enemy',
        durationMs: this.match.elapsedMs,
        playerAge: this.state.player.age,
        enemyAge: this.state.enemy.age,
        enemyController: this.aiSetting,
        player: this.stats.for('player'),
        account,
      };
      this.scene.launch(SCENE_KEYS.overlay, { kind: 'gameover', summary, conquest: this.isConquest } satisfies OverlaySceneData);
    });
  }

  /** A Conquest campaign battle (prototype): no restarts, the result counts. */
  private get isConquest(): boolean {
    return this.sceneData.conquest !== undefined;
  }

  /** A fresh match with the same opponent. */
  private restartMatch(): void {
    if (this.isConquest) return;
    this.logger?.finish('restarted');
    this.scene.restart({ ...this.sceneData });
  }

  private setSimSpeed(multiplier: number): void {
    this.simSpeed = Math.max(0, multiplier);
    emit(Events.GameSpeedChanged, { multiplier: this.simSpeed });
  }

  /** The player's buildings show a "PERK!" badge while a perk waits to be picked. */
  private showPerkBadges(): void {
    const me = this.state.player;
    for (const id of activeBuildingIds()) {
      this.buildingViews.player[id]?.setPerkPending(perksPending(me.buildings[id], me.buildingPerks[id].length) > 0);
    }
  }

  private createBuildingViews(side: Side): Partial<Record<BuildingId, Building>> {
    const views: Partial<Record<BuildingId, Building>> = {};
    activeBuildingIds().forEach((id, index) => {
      const view = new Building(this, side, id, buildingX(side, BASE_X[side], index));
      // A click sends the player's utility Mech here (MechSystem checks there is one).
      if (side === 'player') view.onPress(() => emit(Events.MechAssistRequested, { side, buildingId: id }));
      view.setLevel(this.state[side].buildings[id]);
      views[id] = view;
    });
    return views;
  }

  /**
   * The world is wider than the screen: each side's buildings stand behind
   * its base. Scroll with the arrow or A/D keys, the mouse wheel or by
   * dragging; the HUD's Buildings tab pans to them.
   */
  private setupCamera(): void {
    const camera = this.cameras.main;
    // Scroll limits are enforced in `clampCamera` (Phaser's setBounds assumes
    // a camera zoomed around its center; ours zooms from the top-left, see
    // utils/renderScale).
    camera.setScroll(0, 0);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      camera.scrollX += dx !== 0 ? dx : dy;
    });
  }

  /** Keeps the view inside the world: buildings on the left, enemy buildings on the right. */
  private clampCamera(): void {
    const camera = this.cameras.main;
    const margin = scrollMargin();
    camera.scrollX = Phaser.Math.Clamp(camera.scrollX, -margin, margin);
  }

  private scrollCameraByKeys(deltaMs: number): void {
    const keys = this.keys;
    if (!keys) return;
    const dir = (keys.isHeld('camera-right') ? 1 : 0) - (keys.isHeld('camera-left') ? 1 : 0);
    if (dir !== 0) this.cameras.main.scrollX += (dir * CAMERA_KEY_SCROLL * deltaMs) / 1000;
  }

  private panCamera(target: 'lane' | 'buildings'): void {
    const camera = this.cameras.main;
    this.tweens.killTweensOf(camera);
    this.tweens.add({
      targets: camera,
      scrollX: target === 'buildings' ? -scrollMargin() : 0,
      duration: CAMERA_PAN_MS,
      ease: 'Sine.easeInOut',
    });
  }

  private installDebug(): void {
    const sideSnapshot = (side: Side) => {
      const s = this.state[side];
      return {
        gold: s.gold,
        xp: s.xp,
        age: s.age,
        baseHp: s.baseHp,
        queue: s.trainingQueue.map((entry) => ({ ...entry })),
        unlockedSlots: s.unlockedSlots,
        turrets: s.turrets.map((t) => (t ? { ...t } : null)),
        incomePerSec: this.economy.incomePerSec(side),
        sideModifiers: s.modifiers.map((m) => `${m.id}:${m.mult.toFixed(3)}`),
        buildings: { ...s.buildings },
        research: { ...s.research },
      };
    };
    installDebugHandle({
      state: this.state,
      bus: eventBus,
      snapshot: (): DebugSnapshot => ({
        phase: this.match.phase,
        elapsedMs: this.match.elapsedMs,
        ai: this.aiSetting,
        playerAi: this.playerAiSetting,
        baseHp: { player: this.state.player.baseHp, enemy: this.state.enemy.baseHp },
        sides: { player: sideSnapshot('player'), enemy: sideSnapshot('enemy') },
        units: [...this.units.activeUnits].map((u) => ({
          id: u.instanceId,
          unitId: u.definition.id,
          side: u.side,
          x: u.x,
          width: u.bodyWidth,
          hp: u.hp,
          maxHp: u.getStat('maxHp'),
          shield: u.shield,
          speed: u.getStat('speed'),
          damage: u.getStat('damage'),
          modifiers: u.modifiers.map((m) => m.id),
          state: u.unitState,
        })),
      }),
      spawn: (unitId, side) => this.spawn.spawnNow(unitId, side),
      step: (ms) => {
        // Bulk steps render nothing: skip the effects (keeps AI training fast).
        this.effects.muted = true;
        this.impacts.muted = true;
        this.stepSim(ms);
        this.effects.muted = HEADLESS_SIM;
        this.impacts.muted = HEADLESS_SIM;
      },
      hash: () => hashMatch(this.state, this.match.tick, this.units.activeUnits, this.projectiles.activeProjectiles),
      tick: () => this.match.tick,
      lockstep: () => (this.lockstep ? { log: this.lockstep.log, desynced: this.lockstep.desynced, ready: this.lockstep.ready(this.match.tick) } : null),
      restart: (data = {}) => this.scene.restart(data),
      projectileCount: () => this.projectiles.activeProjectiles.size,
      projectilePoolSize: () => this.projectiles.createdCount,
      buy: (unitId, side = 'player') => emit(Events.BuyUnitRequested, { side, unitId }),
      buySlot: (side = 'player') => emit(Events.BuySlotRequested, { side }),
      buyTurret: (slotIndex, turretId, side = 'player') =>
        emit(Events.BuyTurretRequested, { side, slotIndex, turretId }),
      sellTurret: (slotIndex, side = 'player') => emit(Events.SellTurretRequested, { side, slotIndex }),
      upgradeTurret: (slotIndex, side = 'player') => emit(Events.UpgradeTurretRequested, { side, slotIndex }),
      special: (side = 'player') => emit(Events.SpecialRequested, { side }),
      ageUp: (side = 'player') => this.debugAgeUp(side),
      turretStats: (side = 'player') => this.turrets.statsFor(side),
      modify: (instanceId, stat, mult, durationMs) => {
        const unit = this.units.findByInstanceId(instanceId);
        if (!unit) return null;
        const id = `debug-${stat}-${this.debugModifierCount++}`;
        const expiresAt = durationMs === undefined ? undefined : this.match.elapsedMs + durationMs;
        applyModifier(unit, { id, source: 'debug', stat, mult, expiresAt });
        return id;
      },
      unmodify: (instanceId, modifierId) => {
        const unit = this.units.findByInstanceId(instanceId);
        return unit ? removeModifier(unit, modifierId) : false;
      },
      damage: (instanceId, amount) => {
        const unit = this.units.findByInstanceId(instanceId);
        if (!unit || !unit.isAlive) return false;
        dealUnitDamage(unit, amount, otherSide(unit.side));
        return true;
      },
      unlockAll: (on = true) => {
        const progress = loadAccount();
        if (on) progress.allUnlocked = true;
        else delete progress.allUnlocked;
        saveAccount(progress);
        this.state.player.mechLocked = lockedPartKeys(progress);
      },
      accountXp: (xp) => {
        const progress = loadAccount();
        progress.xp = Math.max(0, xp);
        saveAccount(progress);
        this.state.player.mechLocked = lockedPartKeys(progress);
      },
      place: (instanceId, x) => {
        const unit = this.units.findByInstanceId(instanceId);
        if (!unit || !unit.isAlive) return false;
        unit.x = x;
        return true;
      },
      kill: (instanceId) => {
        const unit = this.units.findByInstanceId(instanceId);
        if (!unit || !unit.isAlive) return false;
        dealUnitDamage(unit, (unit.hp + unit.shield) / unit.getStat('damageTaken'), otherSide(unit.side));
        return true;
      },
      shield: (instanceId, amount) => {
        const unit = this.units.findByInstanceId(instanceId);
        return unit ? grantShield(unit, amount) : 0;
      },
      setSideModifier: (side, stat, mult, id = `debug-side-${stat}`) =>
        setSideModifier(this.state, this.units.activeUnits, side, { id, source: 'debug', stat, mult }),
      clearSideModifier: (side, id) => clearSideModifier(this.state, this.units.activeUnits, side, id),
      specialRemainingMs: (side = 'player') => this.special.remainingMs(side),
      addGold: (amount = DEBUG_CHEATS.gold, side = 'player') => addGold(this.state, side, amount, 'cheat'),
      addXp: (amount = DEBUG_CHEATS.xp, side = 'player') => addXp(this.state, side, amount),
      setSpeed: (multiplier) => this.setSimSpeed(multiplier),
      pause: () => this.match.pause(),
      resume: () => this.match.resume(),
      damageBase: (side, amount) => dealBaseDamage(this.bases[side], amount),
      activeScenes: () => this.scene.manager.getScenes(true).map((scene) => scene.scene.key),
      displayCount: () => this.children.length,
      stats: (side = 'player') => this.stats.for(side),
      upgradeBuilding: (buildingId, side = 'player') => emit(Events.UpgradeBuildingRequested, { side, buildingId }),
      research: (researchId, side = 'player') => emit(Events.ResearchRequested, { side, researchId }),
      rigArtBytes: () => rigArtBytes(this),
      fxTimeScale: (scale) => {
        this.tweens.timeScale = scale;
        this.impacts.setTimeScale(scale);
      },
    });
  }

  private teardown(): void {
    for (const off of this.cleanups) off();
    this.cleanups = [];
    this.lockstep?.destroy();
    this.lockstep = null;
    setMatchFeatures(null);
    this.scene.stop(SCENE_KEYS.hud);
    this.scene.stop(SCENE_KEYS.hangar);
    this.scene.stop(SCENE_KEYS.overlay);
    this.anims.resumeAll();
    this.stats.destroy();
    this.backdrop.destroy();
    this.buildingSystem.destroy();
    for (const experiment of this.experiments) experiment.destroy();
    this.experiments = [];
    this.conquest?.destroy();
    this.conquest = null;
    this.logger?.finish('quit');
    this.logger?.destroy();
    this.logger = null;
    this.keys = null;
    this.ages.destroy();
    this.status.destroy();
    this.special.destroy();
    this.turrets.destroy();
    this.mech.destroy();
    this.account?.destroy();
    this.account = null;
    for (const scaffold of Object.values(this.scaffolds)) scaffold.destroy();
    this.spawn.destroy();
    this.economy.destroy();
    this.match.destroy();
    this.effects.destroy();
    this.impacts.destroy();
    this.projectiles.destroy();
    this.units.destroy();
    if (import.meta.env.DEV) removeDebugHandle();
  }
}
