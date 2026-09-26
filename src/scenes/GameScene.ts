import Phaser from 'phaser';
import { AGE_COUNT, getAge, isFinalAge } from '@config/ages.config';
import { BACKGROUND_STORAGE_KEY, BACKGROUNDS, type BackgroundDef } from '@config/backgrounds.config';
import { BUILDING_IDS, BUILDING_LAYOUT, buildingX, type BuildingId } from '@config/buildings.config';
import { AI_DIFFICULTIES, DEFAULT_AI_DIFFICULTY, type AiDifficulty, type AiDifficultyName } from '@config/ai.config';
import { DEFAULT_AI_PROFILE, findAiProfile, type AiGenome } from '@config/aiGenome.config';
import {
  BASE_X,
  DEBUG_CHEATS,
  GAME_HEIGHT,
  GAME_OVER_DELAY_MS,
  GAME_SPEEDS,
  GAME_WIDTH,
  LANE_COLOR,
  LANE_Y,
  MAX_FRAME_DELTA_MS,
  SCENE_KEYS,
} from '@config/constants';
import { Backdrop } from '@entities/Backdrop';
import { Base } from '@entities/Base';
import { Building } from '@entities/Building';
import { HitEffects } from '@entities/HitEffects';
import { ImpactEffects } from '@entities/ImpactEffects';
import { ProjectileFactory } from '@entities/ProjectileFactory';
import { UnitFactory } from '@entities/UnitFactory';
import { AgeProgressionSystem } from '@systems/AgeProgressionSystem';
import { AIController } from '@systems/AIController';
import { UtilityAI } from '@systems/UtilityAI';
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
import { otherSide, type Side } from '@state/types';
import type { HudSceneData } from '@ui/HUDScene';
import type { OverlaySceneData } from '@ui/OverlayScene';
import {
  installDebugHandle,
  removeDebugHandle,
  type DebugSnapshot,
} from '@utils/debug';
import { emit, eventBus, Events, on } from '@utils/EventBus';
import { ensureRigArtForAge, releaseRigArtOutside, rigArtBytes } from '@utils/RigArt';
import { HEADLESS_SIM } from '@utils/runtimeFlags';

/** Options for starting (or restarting) a match. */
export interface GameSceneData {
  /**
   * Who plays the enemy: an AI difficulty, or 'off' for nobody (tests and
   * sandbox play). Defaults to `DEFAULT_AI_DIFFICULTY`.
   */
  ai?: AiDifficultyName | 'off';
  /** Dev and tuning only: an AI also plays the player's side (AI vs AI). */
  playerAi?: AiDifficultyName;
  /** Enemy AI profile (strategy) by id, see `AI_PROFILES`; default 'classic'. */
  profile?: string;
  /** Player-side AI profile for AI vs AI. */
  playerProfile?: string;
  /** Training: explicit genomes for the utility brain (override the profiles). */
  genome?: AiGenome;
  playerGenome?: AiGenome;
}

/** Anything that plays a side by emitting requests. */
interface AiBrain {
  update(nowMs: number): void;
  lastDecision?: string;
}

/** Fixed step used by the dev-only `__aow.step()` fast-forward. */
const DEBUG_STEP_MS = 1000 / 60;

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
  private turrets!: TurretSystem;
  private special!: SpecialSystem;
  private status!: StatusSystem;
  private ages!: AgeProgressionSystem;
  private utility!: UtilitySystem;
  private stats!: StatsSystem;
  private buildingSystem!: BuildingSystem;
  private buildingViews!: Record<Side, Record<BuildingId, Building>>;
  private scrollKeys: Phaser.Input.Keyboard.Key[][] = [];
  private ai: AiBrain | null = null;
  private playerAi: AiBrain | null = null;
  /** The AI's own income, one per AI-played side (Phase 15). */
  private aiIncome: AiIncomeSystem[] = [];
  /** Dev builds, human player only: records the match to playtest-logs/. */
  private logger: MatchLogger | null = null;
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
  private cleanups: (() => void)[] = [];

  constructor() {
    super({ key: SCENE_KEYS.game });
  }

  /** Runs before `create` on every start and restart: reset per-match fields. */
  init(data: GameSceneData = {}): void {
    this.sceneData = data;
    this.aiSetting = data.ai ?? DEFAULT_AI_DIFFICULTY;
    this.playerAiSetting = data.playerAi ?? null;
    this.simSpeed = 1;
    this.cleanups = [];
  }

  create(): void {
    this.state = createGameState();
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
    this.combat = new CombatSystem(this.units, this.bases, this.projectiles);
    this.projectileSystem = new ProjectileSystem(this.projectiles, this.units, this.bases);
    this.casualties = new CasualtySystem(this.units);
    this.lane = new LaneSystem(this.units, this.bases);
    this.economy = new EconomySystem(this.state, this.units);
    this.spawn = new SpawnSystem(this.state, this.units, (unitId, side) =>
      this.lane.isSpawnPointClear(side, this.units.spriteWidth(unitId, side)),
    );
    this.turrets = new TurretSystem(this, this.state, this.bases, this.units, this.projectiles);
    this.special = new SpecialSystem(this.state, this.units, this.projectiles, () => this.match.elapsedMs);
    this.status = new StatusSystem(this.state, this.units);
    this.ages = new AgeProgressionSystem(this.state, this.bases);
    this.utility = new UtilitySystem(this.units, this.projectiles);
    this.stats = new StatsSystem();
    this.buildingSystem = new BuildingSystem(this.state, this.units);
    this.aiIncome = [];
    if (this.aiSetting !== 'off') this.aiIncome.push(new AiIncomeSystem(this.state, 'enemy', AI_DIFFICULTIES[this.aiSetting]));
    if (this.playerAiSetting) this.aiIncome.push(new AiIncomeSystem(this.state, 'player', AI_DIFFICULTIES[this.playerAiSetting]));
    this.buildingViews = {
      player: this.createBuildingViews('player'),
      enemy: this.createBuildingViews('enemy'),
    };
    this.setupCamera();
    this.logger =
      import.meta.env.DEV && this.playerAiSetting === null
        ? new MatchLogger(this.state, this.units, this.aiSetting, () => this.match.elapsedMs)
        : null;
    this.ai =
      this.aiSetting === 'off'
        ? null
        : this.makeBrain('enemy', AI_DIFFICULTIES[this.aiSetting], this.sceneData.profile, this.sceneData.genome);
    this.playerAi =
      this.playerAiSetting === null
        ? null
        : this.makeBrain('player', AI_DIFFICULTIES[this.playerAiSetting], this.sceneData.playerProfile, this.sceneData.playerGenome);

    this.cleanups.push(
      on(Events.BaseDestroyed, ({ side }) => this.onBaseDestroyed(side)),
      on(Events.MatchStateChanged, ({ from, to }) => {
        if (to === 'paused') this.scene.launch(SCENE_KEYS.overlay, { kind: 'paused' } satisfies OverlaySceneData);
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
      on(Events.BuildingUpgraded, ({ side, buildingId, level }) => this.buildingViews[side][buildingId].setLevel(level)),
      on(Events.GameSpeedRequested, ({ multiplier }) => this.setSimSpeed(multiplier)),
      on(Events.CameraFocusRequested, ({ target }) => this.panCamera(target)),
      on(Events.BackgroundCycleRequested, () => this.cycleBackground()),
      on(Events.QuitToMenuRequested, () => {
        this.logger?.finish('quit');
        this.scene.start(SCENE_KEYS.menu);
      }),
    );
    this.input.keyboard?.on('keydown-B', () => this.cycleBackground());
    this.input.keyboard?.on('keydown-P', () => this.match.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.match.togglePause());

    // F cycles the game speed (1x, 2x, 3x, 4x, 8x) for playtesting, like the HUD button.
    this.input.keyboard?.on('keydown-F', () => {
      const next = GAME_SPEEDS[(GAME_SPEEDS.indexOf(this.simSpeed) + 1) % GAME_SPEEDS.length] ?? 1;
      this.setSimSpeed(next);
    });
    if (import.meta.env.DEV) {
      this.installDebug();
      // Dev shortcuts: G adds gold and X adds XP to the player, N ages the player up at once.
      this.input.keyboard?.on('keydown-G', () => addGold(this.state, 'player', DEBUG_CHEATS.gold, 'cheat'));
      this.input.keyboard?.on('keydown-X', () => addXp(this.state, 'player', DEBUG_CHEATS.xp));
      this.input.keyboard?.on('keydown-N', () => this.debugAgeUp('player'));
    }

    this.refreshRigArt();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    if (HEADLESS_SIM) {
      // Automated runs: simulate only (no HUD, nothing drawn).
      this.cameras.main.setVisible(false);
      this.match.start();
      return;
    }
    this.scene.launch(SCENE_KEYS.hud, {
      state: this.state,
      enemyController: this.aiSetting,
      enemyProfile: this.aiSetting === 'off' ? '' : (findAiProfile(this.sceneData.profile ?? DEFAULT_AI_PROFILE)?.label ?? ''),
      backgroundName: this.background.name,
    } satisfies HudSceneData);
    this.match.start();
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
    // Fixed-size sub-steps, so a high playtest speed doesn't make units skip
    // past each other in one giant step.
    this.stepSim(Math.min(delta, MAX_FRAME_DELTA_MS) * this.simSpeed);
  }

  /**
   * One simulation step. Order matters: the AI decides first (its requests
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
    this.ai?.update(now);
    this.playerAi?.update(now);
    this.spawn.update(dt);
    this.status.update(now);
    this.combat.update(now);
    this.turrets.update(now);
    this.special.update(now);
    this.utility.update(now);
    this.projectileSystem.update(dt);
    this.casualties.update();
    this.lane.update(dt);
    this.economy.update(dt);
    this.buildingSystem.update(dt);
    for (const income of this.aiIncome) income.update(dt, this.match.elapsedMs);
    this.logger?.update(this.match.elapsedMs);
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

  /** Dev only: runs `ms` of simulation at once in fixed steps, without rendering. */
  private stepSim(ms: number): void {
    let left = ms;
    while (left > 0 && this.match.phase === 'playing') {
      const dt = Math.min(DEBUG_STEP_MS, left);
      this.tick(dt);
      left -= dt;
    }
  }

  private drawBackground(): void {
    this.backdrop = new Backdrop(this);
    this.ground = this.add.graphics();
    this.laneLine = this.add.graphics();
    this.laneLine.lineStyle(4, LANE_COLOR, 1);
    const margin = BUILDING_LAYOUT.scrollMarginX;
    this.laneLine.lineBetween(-margin, LANE_Y, GAME_WIDTH + margin, LANE_Y);
    this.backgroundIndex = this.loadBackgroundChoice();
    this.applyBackground();
  }

  private get background(): BackgroundDef {
    return BACKGROUNDS[this.backgroundIndex] ?? BACKGROUNDS[0]!;
  }

  /** Playtest: next background option (HUD button or the B key). */
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
    const margin = BUILDING_LAYOUT.scrollMarginX;
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
      const inUse = new Set([...this.units.activeUnits].map((u) => u.definition.id));
      for (const queued of [...this.state.player.trainingQueue, ...this.state.enemy.trainingQueue]) inUse.add(queued.unitId);
      releaseRigArtOutside(this, lo - 1, hi + 1, inUse);
    });
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
    this.bases[side].setTint(0x4a4a4a);
    this.time.delayedCall(GAME_OVER_DELAY_MS, () => {
      const summary = {
        won: side === 'enemy',
        durationMs: this.match.elapsedMs,
        playerAge: this.state.player.age,
        enemyAge: this.state.enemy.age,
        enemyController: this.aiSetting,
        player: this.stats.for('player'),
      };
      this.scene.launch(SCENE_KEYS.overlay, { kind: 'gameover', summary } satisfies OverlaySceneData);
    });
  }

  /** A fresh match with the same opponent. */
  private restartMatch(): void {
    this.logger?.finish('restarted');
    this.scene.restart({ ...this.sceneData });
  }

  private setSimSpeed(multiplier: number): void {
    this.simSpeed = Math.max(0, multiplier);
    emit(Events.GameSpeedChanged, { multiplier: this.simSpeed });
  }

  private createBuildingViews(side: Side): Record<BuildingId, Building> {
    const views = {} as Record<BuildingId, Building>;
    BUILDING_IDS.forEach((id, index) => {
      const view = new Building(this, side, id, buildingX(side, BASE_X[side], index));
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
    const keyboard = this.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.scrollKeys = [
        [keyboard.addKey(K.LEFT), keyboard.addKey(K.A)],
        [keyboard.addKey(K.RIGHT), keyboard.addKey(K.D)],
      ];
    }
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
    const margin = BUILDING_LAYOUT.scrollMarginX;
    camera.scrollX = Phaser.Math.Clamp(camera.scrollX, -margin, margin);
  }

  private scrollCameraByKeys(deltaMs: number): void {
    const [left, right] = this.scrollKeys;
    const dir = (right?.some((k) => k.isDown) ? 1 : 0) - (left?.some((k) => k.isDown) ? 1 : 0);
    if (dir !== 0) this.cameras.main.scrollX += (dir * CAMERA_KEY_SCROLL * deltaMs) / 1000;
  }

  private panCamera(target: 'lane' | 'buildings'): void {
    const camera = this.cameras.main;
    this.tweens.killTweensOf(camera);
    this.tweens.add({
      targets: camera,
      scrollX: target === 'buildings' ? -BUILDING_LAYOUT.scrollMarginX : 0,
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
    });
  }

  private teardown(): void {
    for (const off of this.cleanups) off();
    this.cleanups = [];
    this.scene.stop(SCENE_KEYS.hud);
    this.scene.stop(SCENE_KEYS.overlay);
    this.anims.resumeAll();
    this.stats.destroy();
    this.backdrop.destroy();
    this.buildingSystem.destroy();
    this.logger?.finish('quit');
    this.logger?.destroy();
    this.logger = null;
    this.ages.destroy();
    this.status.destroy();
    this.special.destroy();
    this.turrets.destroy();
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
