# Implementation Plan

Handoff document. Read `CLAUDE.md` (rules) and `docs/GAME_DESIGN.md` (what
we're building) first, then work through the phases below **in order**.

**Current status:** All phases (0 to 13) are done (see Session log). The
owner is playtesting next and will give general directions; features are
expected to change, so long balance simulations are on hold. The owner reviewed the phase 4-7
choices; the Phase 8 to 13 choices are listed under "Choices to review" in
the latest session log entries. The folder is intentionally not a git
repository yet; the owner said not to `git init` or push for now.

## How to work

- One phase at a time. Each phase must leave the game **running and
  playable** at its own level, not half-wired.
- Phase done means all of these:
  1. `npm run typecheck` and `npm run build` both pass.
  2. `npm run dev` boots with no console errors, and the phase's acceptance
     checks (listed per phase) are demonstrated.
  3. New events are added to Appendix A, and new tunables live in `config/`.
  4. Checkboxes below are ticked and a line is added to the Session log.
- Design is settled in `GAME_DESIGN.md`. If you need a decision that isn't
  there, or want to add a feature, **ask the owner first**. The owner prefers
  to discuss features before code gets written.
- Placeholder art for units, turrets, bases and projectiles: generate textures
  at boot (see Phase 1). The **UI** uses the owner's Kenney "Fantasy UI
  Borders" pack in `src/ui/kenney_fantasy-ui-borders/` (CC0), loaded through
  `ui/kenneyUi.ts`. Build panels, frames and dividers from it rather than
  drawing UI boxes by hand.
- Verifying behavior: a browser is the ground truth. Use headless
  Chromium/Playwright screenshots when available, plus the dev-only debug
  handle described in Phase 3 to read state and fire cheats.

---

## Phase 0: Boot the scaffold

Goal: `npm run dev` shows an empty Phaser canvas.

- [x] `npm install`; confirm the Phaser and Vite versions in `package.json`.
- [x] Create `src/main.ts`: Phaser `Game` config, 1280x720 canvas,
  `Scale.FIT` + `CENTER_BOTH`, parent `#game-container`, scene list.
- [x] `src/scenes/BootScene.ts`: does nothing yet except start `PreloadScene`.
- [x] `src/scenes/PreloadScene.ts`: starts `GameScene`.
- [x] `src/scenes/GameScene.ts`: draws a flat background and the lane line.
- [x] Prove one path alias works end to end (typecheck **and** Vite bundle).
- [x] Ask the owner whether to `git init`; the folder has no repo. (Answer: not
  for now. Do not init or push until the owner says so.)

Acceptance: canvas visible, no console errors, typecheck and build pass.

## Phase 1: Data, state and placeholder art

Goal: every later phase has types and config to build on. No gameplay yet.

- [x] `config/constants.ts`: canvas size, lane Y, base X positions, base HP,
  starting gold and XP, spawn offsets, `passiveIncomePerSec` (see design open
  questions).
- [x] `utils/EventBus.ts`: one shared `Phaser.Events.EventEmitter` plus
  typed helpers, with event names defined in one `Events` map matching
  Appendix A.
- [x] `state/GameState.ts`: `MatchState` with a `SideState` for `'player'` and
  `'enemy'` plus the match phase. Sketch in Appendix B. A `createGameState()`
  factory, not a singleton.
- [x] `entities/unitDefinitions.ts`, `entities/turretDefinitions.ts`,
  `config/ages.config.ts`: types from Appendix B. Fill in **Stone age only**
  (5 units, 3 turrets, special, XP threshold); leave later ages as clearly
  marked stubs to fill in Phase 8.
- [x] `utils/PlaceholderArt.ts`: generates textures at boot with Phaser
  graphics (colored shapes, distinguishable by role and side) and registers
  them under the sprite keys the definitions use. Swapping to real sprites
  later should only change this file plus asset loading.
- [x] `utils/ObjectPool.ts` (or a pooled `Phaser.GameObjects.Group` helper).

Acceptance: typecheck passes; a throwaway scene draws each placeholder
texture in a row so they can be eyeballed.

## Phase 2: One unit walking and hitting a base

Goal: the first visible slice of the game loop.

- [x] `entities/Base.ts`: sprite, HP bar, `takeDamage` bookkeeping only. Damage
  rules live in a system.
- [x] `entities/Unit.ts`: one class, state machine `idle -> walking ->
  attacking -> dead`, holds definition + current hp + stat modifier list
  (empty for now).
- [x] `entities/UnitFactory.ts`: `create(unitId, side)` reads the definition and
  gets a pooled `Unit`.
- [x] `systems/CombatSystem.ts`: picks targets (nearest enemy in range, else
  enemy base), applies damage on cooldown, emits `unit-died`, `base-damaged`,
  `base-destroyed`.
- [x] Lane blocking: a unit stops behind the friendly unit in front of it;
  ranged units attack over the front line.
- [x] `systems/MatchSystem.ts` (or equivalent): match state machine
  `pre-game -> playing -> paused -> gameover`, emitting
  `match-state-changed`; `base-destroyed` moves it to `gameover`.
- [x] Temporary test spawner in `GameScene`: spawns a Stone melee unit per side
  every few seconds. Remove or hide behind the debug flag later.

Acceptance: units from both sides meet in the middle, fight, and one base can
be destroyed, ending the match. No overlapping units.

## Phase 3: Economy, HUD, buying units

Goal: the player plays the actual loop by spending gold.

- [x] `state/economyOps.ts`: small pure helpers (`addGold`, `trySpendGold`,
  `addXp`, `spendXp`) that mutate a `SideState` and emit `gold-changed` /
  `xp-changed`. **All gold and XP changes go through these**, so any system
  can spend without holding a reference to another system.
- [x] `systems/EconomySystem.ts`: listens for `unit-died`, awards kill gold and
  XP to the killer's side and applies `passiveIncomePerSec`, using the
  helpers above.
- [x] `systems/SpawnSystem.ts`: handles `buy-unit-requested`, validates cost and
  age, deducts gold with `trySpendGold`, runs the
  training queue, spawns through `UnitFactory`. Emits `unit-spawned`,
  `unit-queue-changed`.
- [x] `ui/HUDScene.ts`: **separate parallel scene**. Gold, XP bar, base HP
  bars. Updates from EventBus events, not per-frame polling.
- [x] `ui/UnitBuyPanel.ts`: five buttons (slots 1-5) showing cost, greyed out
  when unaffordable, emitting `buy-unit-requested`. Slots 4 and 5 can spawn
  a plain unit for now.
- [x] Debug tooling, dev only (`import.meta.env.DEV`): a `window.__aow` handle
  exposing `gameState` and the bus, plus cheat keys for +gold, +XP and
  instant age-up. This is also how automated checks read state. (The
  age-up cheat moved to Phase 8, since there is no second age to go to yet.)

Acceptance: player buys units with gold; gold rises from kills; queue and
affordability update in the HUD; enemy is still on a temporary timer spawner.

## Phase 4: Full combat roster for the Stone age

Goal: three combat archetypes feel different.

- [x] Melee, ranged and heavy stats defined as data; ranged units fire
  pooled `entities/Projectile.ts` objects.
- [x] Splash support in `CombatSystem` (`attack.splashRadius`), needed later by
  turrets, AoE utility and the special.
- [x] Hit feedback: damage flash, floating damage numbers, small death effect.
- [x] First tuning pass so slot 1-3 units form a sensible counter triangle.

Acceptance: a mixed army beats a mono-type army of equal cost in most
matchups; projectiles are pooled (no per-shot allocation).

## Phase 5: Turrets on the base

Goal: expanded version of the original's turrets, without upgrades yet.

- [x] `entities/Turret.ts` and `systems/TurretSystem.ts`: front-most enemy in
  range as the only targeting mode, cooldown, projectile or hitscan,
  splash for the area type.
- [x] Slots on `SideState`: start with 1 unlocked, buy up to 5 at escalating
  cost. Handle `buy-slot-requested`, `buy-turret-requested`,
  `sell-turret-requested`. Emit `turret-built`, `turret-sold`,
  `slot-unlocked`.
- [x] `ui/TurretPanel.ts`: slot display, buy/sell, refund shown before selling.
- [x] Sell refund percentages as config.

Acceptance: buy a slot, build all three Stone turret types, watch them target
the most advanced enemy, sell one and get the right refund.

## Phase 6: Special attack

Goal: same as the original.

- [x] `systems/SpecialSystem.ts`: cooldown per side, handles `special-requested`,
  applies area damage to the enemy side of the lane, emits `special-fired` and
  `special-cooldown-changed`. (Owner choice: a meteor shower, original style.)
- [x] Per-age special data (visual style, damage, radius) in
  `ages.config.ts`; Stone implemented now.
- [x] HUD button with cooldown fill.

Acceptance: pressing the button damages an area of enemy units, then goes on
cooldown; cannot be fired while cooling down.

## Phase 7: Stat modifiers and status effects (foundation)

Goal: one mechanism for everything that changes a unit's stats. Needed by the
money-unit penalty and every utility effect.

- [x] `systems/StatusSystem.ts`: modifiers of the form `{ id, source, stat,
  mult, expiresAt? }`; effective stat = base x product of modifiers. Handles
  apply/remove/expire, and emits `modifier-applied` / `modifier-removed`.
  (Apply/remove live in `systems/statusOps.ts` so any system can use them.)
- [x] `Unit` reads effective stats (damage, speed, attack cooldown, max HP,
  shield) through one accessor. CombatSystem and movement use it.
- [x] Shield/absorb support as a pool that depletes before HP.

Acceptance: a debug command applying a 0.5x speed modifier visibly slows a
unit and removing it restores speed.

## Phase 8: Age progression and the full roster

Goal: all five ages playable.

- [x] `systems/AgeProgressionSystem.ts`: handles `age-up-requested`, checks XP
  threshold, spends XP, updates `SideState.age`, emits `age-changed`.
- [x] Dev cheat for an instant age-up (`__aow` plus a key), moved here from
  Phase 3. `HUDScene` and `UnitBuyPanel` already react to `age-changed`.
- [x] Buy panel reflects the current age's five units. Existing units stay on
  the lane; turrets keep old stats.
- [x] Fill in `unitDefinitions.ts`, `turretDefinitions.ts` and
  `ages.config.ts` for all five ages (see roster table in the design doc).
  Slots 4 and 5 can still be stand-ins until Phases 9 and 10.
- [x] Background/base visuals change per age (placeholder recolor is fine).

Acceptance: player can age up through all five ages with a debug XP cheat and
each age offers five units and its own turret set.

## Phase 9: Money unit (slot 4)

- [x] `income` block on the unit definition. `EconomySystem` ticks gold for
  each living economy unit and emits `gold-changed` (with `source`).
- [x] The penalty: on `unit-spawned` and `unit-died` of an economy unit,
  recompute a global modifier for that side through `StatusSystem`
  (multiplicative per living money unit, with a floor). Economy units are
  exempt from their own penalty.
- [x] Optional kill bounty multiplier for economy units.
- [x] HUD hint showing income rate and current penalty.
- [x] Fill in real stats for all five ages' economy units.
- [x] (Added) Support-unit movement, so money units don't block the army.

Acceptance: buying one drops your army's damage and speed and shows income;
buying a second stacks the penalty and adds income; killing them removes both
effects immediately.

## Phase 10: Utility unit (slot 5), variable per age

- [x] `systems/UtilitySystem.ts` handling the `heal`, `aoe`, `slow`, `buff` and
  `shield` effect kinds as data variants, applying effects via
  `StatusSystem` where they are stat changes.
- [x] Wire the placeholder assignments: Stone heal, Castle AoE, Renaissance
  slow, Modern buff, Future shield.
- [x] Visual cue for the effect radius or pulse (placeholder).

Acceptance: each of the five effect kinds works in isolation with a debug
spawn, and the correct one is available in each age.

## Phase 11: Turret upgrades

- [x] Upgrade levels on `TurretState`, handled through
  `upgrade-turret-requested`, emitting `turret-upgraded`.
- [x] Upgrade cost and effect curves as config per turret definition, capped
  at 3 levels with diminishing returns.
- [x] Sell refund includes a configurable share of upgrade spend.
- [x] UI: upgrade button with cost and the level shown on each slot.
- [x] Tuning check: simulate the decision to stay on an upgraded old turret
  versus rebuying a newer one, and adjust curves until both are viable at
  different points.

Acceptance: upgrading raises stats and cost as configured; refund is right;
the tuning check is written up in the Session log.

## Phase 12: Enemy AI

- [x] `systems/AIController.ts`: acts only by emitting the same
  `*-requested` events as the player, per side. Replaces the temporary
  spawner from Phase 2 (removed).
- [x] Behaviors: buy combat units by matchup, buy economy units when safe,
  build and upgrade turrets on a schedule, age up when able, fire the special
  when a group of enemies is in range.
- [x] Difficulty presets (easy, normal, hard) as config.
- [x] Tuned and checked (see the Phase 12 session log).

Acceptance: a full match against each difficulty finishes without the AI
soft-locking, and hard is noticeably harder than easy.

## Phase 13: Game flow, polish and balance

- [x] `MenuScene`, pause, game over with restart. Restart must fully reset
  `MatchState` (this is what the no-singletons rule is for).
- [x] Screen shake, hit effects, clearer age-up moment.
- [x] Balance pass against the match-length target (owner: up to ~30 min is
  fine; first pass only, see the session log).
- [x] Update `README.md` to match the finished structure.

Acceptance: menu -> match -> game over -> restart works repeatedly with no
leaked state; a full match lands roughly in the target length.

## Phase 14: Buildings, Forge research, playtest speed

Owner direction 2026-09-26 (GAME_DESIGN section 11).

- [x] `config/buildings.config.ts`: Mine, Library, Forge (costs, output per
  level, age caps) and nine research tracks (per-tier bonus, costs), plus the
  building row layout.
- [x] `SideState.buildings` and `SideState.research`; passive income removed
  (the Mine replaces it).
- [x] `systems/BuildingSystem.ts`: handles `upgrade-building-requested` and
  `research-requested`, pays Mine gold and Library XP, applies unit research
  as side-wide modifiers. Emits `building-upgraded`, `research-completed`.
- [x] New modifiable stats `range` and `damageTaken` (armor); side modifiers
  can target unit slots (`onlySlots`). Turret research read in
  `Turret.getStat`, Plunder in `EconomySystem`.
- [x] Buildings drawn behind each base (`entities/Building.ts`, placeholder
  textures); the camera scrolls (arrow/A-D keys, wheel, drag) and the HUD's
  Buildings tab pans to them.
- [x] HUD: Buildings and Research tabs, income line includes the Mine, speed
  button (1x/2x/3x/4x/8x, also the F key, now in all builds).
- [x] AI builds (Mine first) and researches, capped per difficulty.

Acceptance: both sides can build, upgrade and research by the rules; the AI
uses them; typecheck and build pass.

---

## Appendix A: Event catalog

All cross-system communication goes through `utils/EventBus.ts`. Keep this
table current: add a row whenever you add an event. `side` is always
`'player' | 'enemy'`.

Payload types live in `EventPayloads` in `utils/EventBus.ts`. Details the
tables leave open: `gold-changed.source` is a `GoldSource` (`'kill' | 'mine'
| 'economy-unit' | 'purchase' | 'refund' | 'cheat'`), `unit-queue-changed.queue`
is a list of `{ unitId, remainingMs }`, and `modifier-applied.stat` is a
`ModifiableStat`.

**Requests** (emitted by the HUD or the `AIController`; the owning system
validates and acts):

| Event | Payload | Handled by |
| --- | --- | --- |
| `buy-unit-requested` | `{ side, unitId }` | SpawnSystem |
| `buy-slot-requested` | `{ side }` | TurretSystem |
| `buy-turret-requested` | `{ side, slotIndex, turretId }` | TurretSystem |
| `upgrade-turret-requested` | `{ side, slotIndex }` | TurretSystem |
| `sell-turret-requested` | `{ side, slotIndex }` | TurretSystem |
| `age-up-requested` | `{ side }` | AgeProgressionSystem |
| `special-requested` | `{ side }` | SpecialSystem |
| `pause-requested` | `{}` | MatchSystem (HUD pause button) |
| `resume-requested` | `{}` | MatchSystem (pause panel) |
| `restart-requested` | `{}` | GameScene (pause / game-over panel; restarts with the same opponent) |
| `quit-to-menu-requested` | `{}` | GameScene (pause / game-over panel) |
| `upgrade-building-requested` | `{ side, buildingId }` (builds at level 0) | BuildingSystem |
| `research-requested` | `{ side, researchId }` | BuildingSystem |
| `game-speed-requested` | `{ multiplier }` | GameScene (HUD speed button) |
| `camera-focus-requested` | `{ target: 'lane' \| 'buildings' }` | GameScene (HUD tabs) |

**Notifications** (emitted by systems; anyone may listen):

| Event | Payload | Emitted by |
| --- | --- | --- |
| `gold-changed` | `{ side, gold, delta, source }` | `state/economyOps` helpers (any system that pays or earns) |
| `xp-changed` | `{ side, xp, xpToNext }` (`xpToNext` is null in the final age) | `state/economyOps` helpers |
| `unit-spawned` | `{ side, unitId, instanceId }` | SpawnSystem (bought units and debug spawns) |
| `unit-queue-changed` | `{ side, queue }` | SpawnSystem (on buy, on spawn, and every frame while the front unit trains) |
| `unit-died` | `{ side, unitId, instanceId, killerSide, x }` | CasualtySystem (end of frame, for every unit `damageOps` marked dead) |
| `unit-damaged` | `{ side, instanceId, amount, absorbed, x, topY }` | `systems/damageOps` (any damage source) |
| `area-hit` | `{ side, x, radius }` | `systems/damageOps` (splash landed; `side` dealt it) |
| `economy-changed` | `{ side, economyUnits, incomePerSec, damageMult, speedMult }` | EconomySystem (a money unit spawned or died) |
| `unit-healed` | `{ side, instanceId, amount, x, topY }` | UtilitySystem (`amount` = HP actually restored) |
| `utility-pulse` | `{ side, kind, x, radius }` | UtilitySystem (feedback only; `kind` is a `UtilityKind`) |
| `base-damaged` | `{ side, hp, maxHp, amount }` | `systems/damageOps` |
| `base-destroyed` | `{ side }` | `systems/damageOps` |
| `turret-built` | `{ side, slotIndex, turretId }` | TurretSystem |
| `turret-upgraded` | `{ side, slotIndex, level }` | TurretSystem |
| `turret-sold` | `{ side, slotIndex, refund }` | TurretSystem |
| `slot-unlocked` | `{ side, slotIndex }` | TurretSystem |
| `age-changed` | `{ side, age }` | AgeProgressionSystem |
| `special-fired` | `{ side, age }` | SpecialSystem |
| `special-cooldown-changed` | `{ side, remainingMs, totalMs }` | SpecialSystem |
| `modifier-applied` | `{ instanceId, modifierId, stat, mult }` | `systems/statusOps` (StatusSystem and any effect source) |
| `modifier-removed` | `{ instanceId, modifierId }` | `systems/statusOps` (StatusSystem expires timed ones) |
| `match-state-changed` | `{ from, to }` | MatchSystem |
| `building-upgraded` | `{ side, buildingId, level }` | BuildingSystem |
| `research-completed` | `{ side, researchId, tier }` | BuildingSystem |
| `game-speed-changed` | `{ multiplier }` | GameScene |

## Appendix B: Data shape sketches

Starting point, not gospel. Refine while implementing, but keep the intent:
content is data, behavior is selected by optional blocks, not subclasses.

```ts
type Side = 'player' | 'enemy';
type UnitRole = 'combat' | 'economy' | 'utility';

interface UnitDefinition {
  id: string;
  name: string;
  age: number;                 // 0-based index into ages
  slot: 1 | 2 | 3 | 4 | 5;
  role: UnitRole;
  spriteKey: string;
  cost: number;
  trainTimeMs: number;
  hp: number;
  speed: number;
  killGold: number;
  killXp: number;
  attack?: {                   // combat units, some utility units
    damage: number;
    range: number;
    cooldownMs: number;
    splashRadius?: number;
    projectileKey?: string;    // absent = melee
  };
  income?: { goldPerSecond: number };                       // economy units
  allyPenalty?: { damageMult: number; speedMult: number };  // economy units
  utility?: UtilityEffect;                                  // utility units
}

type UtilityEffect =
  | { kind: 'heal'; radius: number; amount: number; intervalMs: number }
  | { kind: 'aoe'; radius: number; damage: number; intervalMs: number }
  | { kind: 'slow'; range: number; mult: number; durationMs: number }
  | { kind: 'buff'; radius: number; damageMult: number }
  | { kind: 'shield'; radius: number; absorb: number; intervalMs: number };

interface TurretDefinition {
  id: string;
  name: string;
  age: number;
  kind: 'rapid' | 'heavy' | 'area';
  spriteKey: string;
  cost: number;
  damage: number;
  range: number;
  cooldownMs: number;
  splashRadius?: number;
  projectileKey?: string;
  upgrades: { cost: number; damageMult: number; cooldownMult: number }[]; // length = max level
}

interface AgeConfig {
  index: number;
  name: string;
  xpToNext: number | null;     // XP needed to leave this age; null = final
  visuals: { sky: number; ground: number; accent: number }; // Phase 8
  unitIds: [string, string, string, string, string];   // slot 1..5
  turretIds: string[];
  special: { id: string; cooldownMs: number; damage: number; radius: number };
}

interface TurretState { turretId: string; level: number; spent: number }

interface SideState {
  gold: number;
  xp: number;
  age: number;
  baseHp: number;
  unlockedSlots: number;
  turrets: (TurretState | null)[];   // length = slot cap
  specialReadyAt: number;            // scene time in ms
  trainingQueue: { unitId: string; remainingMs: number }[]; // added in Phase 3
  modifiers: SideModifier[];         // side-wide stat modifiers, Phase 7
}

interface MatchState {
  phase: 'pre-game' | 'playing' | 'paused' | 'gameover';
  player: SideState;
  enemy: SideState;
}
```

## Session log

Add one entry per work session: date, phase(s) touched, what changed,
decisions made, anything the owner needs to confirm.

- 2026-09-21: Design conversation with the owner. Wrote GAME_DESIGN.md, this
  plan, and rewrote CLAUDE.md and README.md. No code written yet.
- 2026-09-21: Phases 0 and 1 implemented.
  - Phase 0: `npm install` (Phaser 3.90.0, Vite 5.4.21, TypeScript 5.9.3),
    `src/main.ts` (1280x720, `Scale.FIT` + `CENTER_BOTH`), Boot, Preload and
    Game scenes; the game scene draws a flat sky, ground and the lane line.
    The `@config/*` and `@/*` aliases are used by `main.ts` and the scenes, so
    both typecheck and the Vite bundle exercise them. Added
    `"skipLibCheck": true` to `tsconfig.json` because Phaser 3.90's typings
    reference `ActiveXObject`, which no TS lib declares. **Still open:** whether
    to `git init` (not done; asked in the hand-off).
  - Phase 1: `config/constants.ts`, `config/ages.config.ts` (Stone only, plus
    the five age names), `state/types.ts` (new: `Side`, `MatchPhase`,
    `ModifiableStat`, import-free so nothing cycles), `state/GameState.ts`
    (`createGameState()` factory), `utils/EventBus.ts` (`Events` map, typed
    `EventPayloads`, `emit`/`on`/`once`/`off`/`clearAllListeners`),
    `entities/unitDefinitions.ts` and `entities/turretDefinitions.ts` (Stone:
    5 units, 3 turrets), `utils/PlaceholderArt.ts`, `utils/ObjectPool.ts`,
    and a dev-only `TextureGalleryScene` reachable with `?gallery` in the URL.
    Placeholder textures are keyed `<spriteKey>@player` / `@enemy` via
    `textureKeyFor()`; projectiles have no side. Art is drawn facing right, so
    enemy sprites should be flipped in play.
  - Decisions and PROPOSED values to confirm: `passiveIncomePerSec` defaults to
    0.5 (`PASSIVE_INCOME_PER_SEC`, set 0 to disable); starting gold 100, base HP
    1000, Stone XP threshold 300, Stone special 45 s cooldown / 60 damage / 320
    radius; all Stone unit and turret stats and upgrade curves are first-pass
    guesses for the Phase 4 and Phase 11 tuning passes. Added a `kind`
    (`rapid | heavy | area`) field to `TurretDefinition` so placeholder art and
    the UI can tell the three turret roles apart. `AGES` holds only Stone while
    `AGE_COUNT` is 5; `getAge()` throws for unbuilt ages until Phase 8.
  - Verified: `npm run typecheck` passes; the production build passes; the dev
    server boots in headless Chromium with no page errors and shows the
    background and lane; the gallery shows all placeholder textures; a scripted
    check confirmed the Stone data invariants (slot/role/age consistency, three
    turret kinds, ids unique), that `createGameState()` returns independent
    states, that `ObjectPool` reuses and rejects double releases, and that the
    event bus delivers, unsubscribes and clears correctly. Not verified: a run
    on the owner's own browser or GPU (headless software rendering only).
  - Note: on the sandbox mount `vite build` cannot empty `dist/` (deleting is
    blocked there), so builds were checked with `--outDir` outside the repo. An
    ordinary `npm run build` on the owner's machine is unaffected.
- 2026-09-21 (later): Phase 2 implemented, plus owner decisions.
  - Owner decisions: keep passive income off (`PASSIVE_INCOME_PER_SEC = 0`, also
    recorded in GAME_DESIGN.md section 10); no `git init` / push for now; use the
    Kenney pack in `src/ui/` for the UI.
  - Kenney UI: `ui/kenneyUi.ts` imports five pieces with Vite `?url` (panel, glass
    panel, frame, divider, fade divider), loads them in `PreloadScene`, and
    offers `addPanel()` (nine-slice, tinted) and `UiColors`. The pack is white
    artwork, so everything is tinted. Careful: the plain 2px frames are index
    **015** in each set (`panel-015`, `panel-border-015`,
    `panel-transparent-center-015`); other indices have corner ornaments and
    need larger nine-slice insets (about 16px). Used so far for the base HP bar
    frames and the victory banner; Phase 3 builds the HUD and buy panel from it.
  - Phase 2 code: `entities/Base.ts`, `Unit.ts`, `UnitFactory.ts`,
    `systems/CombatSystem.ts`, `LaneSystem.ts` (new: movement and blocking, kept
    out of CombatSystem), `MatchSystem.ts`, and `utils/debug.ts`. Per-frame order
    in `GameScene`: spawner -> combat -> lane. `Unit` extends `Sprite` and has a
    `getStat()` accessor already (no modifiers exist until Phase 7); its state
    field is `unitState` because Phaser reserves `state`. The match runs on a
    simulation clock (`MatchSystem.elapsedMs`) that stops while paused.
  - Rules as built: attack `range` is edge-to-edge reach (melee ranges lowered to
    8 and 12 px to match). Nothing walks through anything: units stop behind any
    unit ahead (friend or foe) and at the enemy base, so non-combat units stall
    at the front line. Ranged units hit instantly for now (TODO Phase 4:
    projectiles and splash). Spawning needs a clear spawn point
    (`LaneSystem.isSpawnPointClear`), which the Phase 3 SpawnSystem should use.
  - Finding for the owner: on one lane only the front melee unit of each side can
    fight, so identical melee streams duel forever (measured: flooding with
    clubbers and mammoths still had no base damage after 380 sim seconds).
    Ranged units firing from behind the line are what break the deadlock. The
    temporary spawner therefore gives the player [clubber, slinger, slinger]
    every 2 s and the enemy a clubber every 8 s (`TEST_SPAWNER` in constants;
    this deviates from the plan's "melee unit per side"). Worth keeping in mind
    when tuning the counter triangle in Phase 4.
  - Dev tooling: `window.__aow` (dev server only) now has `snapshot()`, `spawn()`,
    `setSpeed()`, `pause()`, `resume()`, `state` and `bus`; Phase 3 adds cheats.
    `P` pauses, `F` cycles 1x/2x/4x/8x speed. Not installed in production builds.
  - Verified in headless Chromium: typecheck and build pass, no console errors,
    pause freezes the clock and resumes, units meet and fight, a base was
    destroyed (`baseDestroyed` fired once, phase went playing -> gameover, the
    victory banner showed) in about 280 simulated seconds at the current test
    settings, and over ~230 samples of up to 22 units there were zero overlaps,
    zero units out of bounds, and slingers were seen attacking over their own
    front line. Not verified: the defeat banner path (never lost), feel at real
    frame rates on the owner's hardware, and any audio (none exists).
  - Repo hygiene: the sandbox cannot delete files, so `vite.config.ts.timestamp-*`
    temp files, `tsconfig.tsbuildinfo` and a stale `dist/` are lying around;
    they are safe to delete (and now git-ignored). `node_modules` was installed
    inside the Linux sandbox, so on Windows delete it and run `npm install`.
- 2026-09-23: Phase 3 implemented (economy, HUD, buying units).
  - New: `state/economyOps.ts` (`addGold`, `trySpendGold`, `addXp`, `spendXp`,
    plus `canAfford` and `xpToNextAge`; they take `(matchState, side, ...)` so
    the side in the event can never disagree with the state that changed, and
    throw on negative or non-finite amounts), `systems/EconomySystem.ts` (kill
    gold and XP to `killerSide`; passive income paid in whole-gold steps, still
    0), `systems/SpawnSystem.ts`, `ui/HUDScene.ts`, `ui/UnitBuyPanel.ts` and
    `ui/HudBar.ts` (framed meter used for XP and base HP).
  - Training queue: gold is paid when a unit is queued; units train one at a
    time in order, each for its `trainTimeMs`; at most `UNIT_QUEUE_LIMIT` = 5
    (PROPOSED, like the original) including the one training. A trained unit
    waits (yellow progress bar) until the spawn point is clear. The queue lives
    on `SideState.trainingQueue` (new field) so the HUD, AI and debug handle
    can see it; only SpawnSystem changes it. `QueuedUnit` moved to
    `state/types.ts` (`QueuedUnitInfo` in EventBus is now an alias).
    SpawnSystem gets the spawn point check as an injected function, so it does
    not hold a reference to LaneSystem. Purchases are refused unless the match
    is `playing`, the unit belongs to the side's current age, the queue has
    room and the side can pay (`SpawnSystem.rejectionFor` gives the reason; no
    rejection event was added).
  - HUD: top-left panel with age name, gold, XP bar and the player's base HP;
    top-right panel with the enemy base HP. The base HP bars moved from above
    the bases into the HUD (`Base` no longer draws a bar). Bottom panel: five
    buy buttons (icon, name, cost; greyed out when unaffordable, when the queue
    is full, and while paused or after game over) and the training queue with
    a progress bar. It reads `MatchState` once on start, then only reacts to
    events (it also handles `age-changed` already, ready for Phase 8).
  - Small additions to confirm: keys 1-5 press the buy buttons (not in the
    plan, trivial to remove); dev cheats `G` (+100 gold) and `X` (+100 XP),
    amounts in `DEBUG_CHEATS`; `__aow` gained `buy()`, `addGold()`, `addXp()`
    and per-side gold/XP/queue in `snapshot().sides`. The dev speed label moved
    to the top center.
  - **Changed a PROPOSED value:** `UNIT_SPAWN_OFFSET_X` 110 -> 20, so units now
    appear inside their own base's gate instead of 50 px in front of it.
    Reason: with player buying, a headless check showed that once enemy units
    reached the gate they sat on the spawn point, so every purchase was paid
    for but could never spawn, which guaranteed a loss. Enemies stop at the
    base front edge, so they can no longer block spawning; new units walk out
    of the gate and fight whatever is there. Also recorded in GAME_DESIGN.md
    section 1.
  - Temporary test spawner: now enemy only (`TEST_SPAWNER.sides`), free
    clubbers every 8 s, routed through `SpawnSystem.spawnNow` so they emit
    `unit-spawned` like any other unit.
  - Verified: `npm run typecheck` and the production build pass (build checked
    with `--outDir` outside the repo, see the Phase 1 note). In headless
    Chromium, dev server: 14 scripted checks pass (clicking slot 1 and pressing
    2 buy and charge correctly; unaffordable and unknown units are refused;
    the 6th queued unit is refused and not charged; units train in order and
    the queue empties; buying while paused is refused; a kill pays 15 gold and
    10 XP with `xpToNext` 300), no console errors. An idle player loses (DEFEAT
    after ~140 simulated s); a simple buying bot wins (VICTORY after ~320 sim
    s) with the gold ledger balancing exactly (100 + earned - spent = gold),
    zero unit overlaps over ~560 samples; with enemies at the gate a purchase
    now spawns and fights. Production preview: no errors, no `__aow`. The
    `?gallery` page still works. Not verified: feel at real frame rates on the
    owner's machine (headless ran at a few frames per second), mouse hover
    states, and the yellow "waiting for spawn point" bar in a real match.
  - Observations for later phases: a ranged unit that stops to shoot blocks
    the melee units behind it (single-lane blocking), so often only one melee
    unit is fighting; worth keeping in mind for the Phase 4 tuning pass. XP
    keeps climbing past the threshold (shows e.g. 390 / 300) until age-ups
    exist in Phase 8.
  - Repo hygiene: each `vite build` in the sandbox leaves another
    `vite.config.ts.timestamp-*.mjs` in the project root (the sandbox cannot
    delete files); they are git-ignored and safe to delete.
- 2026-09-23 (later): Phases 4, 5, 6 and 7 implemented in one session. The
  owner answered two questions up front (special = meteor shower, turret UI =
  Units/Turrets tabs), then asked for no further questions: every other
  choice below was made by Claude and is listed under "Choices to review".
  - Phase 4 code: `entities/Projectile.ts` + `ProjectileFactory.ts` (pooled,
    48 prewarmed; a shot allocates nothing), `systems/ProjectileSystem.ts`
    (homing flight with a lob, impact, splash), `systems/damageOps.ts` (the only
    way damage is dealt: units, splash, bases), `systems/CasualtySystem.ts`
    (reports `unit-died` and releases dead units at the end of the frame, so
    no system sees the unit set change mid-loop), `entities/HitEffects.ts`
    (pooled damage numbers, death puffs, splash rings; event-driven like the
    HUD), `config/projectiles.config.ts` (speed/arc per projectile). Units
    flash white when hit, bases flash pink. `CombatSystem` now launches
    projectiles for ranged units and applies melee splash. New events
    `unit-damaged` and `area-hit` (Appendix A). Frame order is in
    `GameScene.tick`: spawn, status expiry, unit combat, turrets, special,
    projectiles, casualties, movement, income.
  - Dev tooling: `GameScene` can restart cleanly (`init` resets per-match
    fields; `__aow.restart({ testSpawner })`), and `__aow.step(ms)` runs the
    simulation in fixed 60 Hz steps without rendering. Automated checks and the
    tuning below use them; a battle takes well under a second.
  - Phase 4 tuning (equal-cost battles, armies spawned as fast as the spawn
    point allows, no test spawner; 4 budgets from 300 to 840 gold, 2 mixed
    compositions): the Stone stats started with slingers beating everything,
    including mixed armies (mixed won 12/24). After a random search over ~100
    stat sets plus hand refinement, mixed armies win 22/24 (losing only to
    mass clubbers at 840 gold). Triangle edges: clubbers beat slingers at 4/4
    budgets, mammoth riders beat clubbers 4/4, slingers beat mammoth riders
    only at 2/4 (small armies). See "Choices to review" for the stat changes.
  - Phase 5 code: `entities/Turret.ts` (sprite in a slot, `getStat` already
    applies upgrade levels), `systems/TurretSystem.ts` (slots, build, sell,
    front-most targeting, projectile or hitscan, splash),
    `ui/TurretPanel.ts`, `ui/UiButton.ts` (shared button), turret helpers in
    `turretDefinitions.ts` (`turretSellRefund`, `slotUnlockCost`), ledges for
    unlocked slots drawn by `Base`. The bottom panel has Units / Turrets tabs
    (click or Tab key).
  - Phase 6 code: `systems/SpecialSystem.ts`, `ui/SpecialButton.ts` (right of
    the bottom panel, S key, draining overlay and seconds left),
    `SpecialConfig` reshaped for the meteor shower (name, strikes, duration,
    damage and radius per strike, projectile key), `proj-meteor` art.
  - Phase 7 code: `systems/statusOps.ts` (`applyModifier`, `removeModifier`,
    `grantShield`, `setSideModifier`, `clearSideModifier`),
    `systems/StatusSystem.ts` (expires timed modifiers on the sim clock and puts
    side-wide modifiers on new spawns), `Unit.shield` pool spent first by
    `damageOps`, thin cyan shield bar over the HP bar, `SideState.modifiers`,
    `UnitRole` moved to `state/types.ts`. `__aow` gained `modify`, `unmodify`,
    `shield`, `setSideModifier`, `clearSideModifier`, plus `buySlot`,
    `buyTurret`, `sellTurret`, `special`, `specialRemainingMs`,
    `projectileCount`, `projectilePoolSize`; snapshots include effective
    speed/damage, shield, max HP and modifier ids per unit, and turrets/slots
    per side.
  - Verified: `npm run typecheck` and the production build pass on the owner's
    machine (build with `--outDir` outside the repo, as before). Headless
    Chromium: the Phase 3 checks still pass (14/14, kill gold now 25); 21 new
    checks pass: ranged shots hit and the projectile pool never grows past 48;
    mammoth trample hits a second clubber; building in a locked or occupied
    slot is refused; unlocking slot 2 costs 100; the turret shoots the
    front-most of two clubbers and never the second one while the first lives;
    all three turret types build; selling the spear thrower refunds 30;
    clicking Unlock on the Turrets tab unlocks slot 4 for 350; the special goes
    on a 45 s cooldown, refuses a second press, lands 12 strikes that damage
    enemies, recharges and fires again, freezes while paused, and fires with
    S; a 0.5x speed modifier halves movement (60 -> 30 px/s) and removing it
    restores it; a timed modifier expires with events; a 50 shield absorbs
    exactly 50 before HP; a side-wide 0.5x damage modifier covers existing and
    new units and clears; a 2x max HP modifier keeps the HP ratio. A scripted
    full match against the test spawner (units, one turret, the special) ends
    in VICTORY after ~7.5 simulated minutes with the gold ledger exact and zero
    unit overlaps. Production preview: no errors, no `__aow`. No console
    errors anywhere. Not verified: feel at real frame rates on the owner's
    machine, hover states, and how the new numbers feel to a human.
  - Choices to review (all in config or data unless noted):
    1. **Kill gold raised to about 1.2x unit cost** (clubber 15 -> 25,
       slinger 22 -> 36, mammoth rider 50 -> 95, trader 40 -> 120, shaman
       40 -> 72). With passive income off and kill gold below cost, every even
       trade lost gold; scripted players lost or stalled against the free
       test spawner whatever mix they bought. Now mixed strategies win in 4-7 simulated minutes;
       pure clubber spam stalls (even trades). Alternative: turn on a small
       passive income instead.
    2. **Stone combat stats** (Phase 4 tuning): clubber HP 80 -> 90, speed
       50 -> 60, damage 10 -> 12; slinger HP 50 -> 45, range 200 -> 130;
       mammoth rider cost 70 -> 80, HP 320 -> 300, speed 30 -> 22, damage
       22 -> 16, and it now tramples (`splashRadius` 24: hits about the next
       unit in line). Stats alone don't give a strict triangle on one lane:
       only the front slinger can shoot at a melee unit walking up, so slingers
       beat mammoth riders only in small fights. If a hard triangle matters,
       options are bonus damage by target role (data on the attack) or letting
       ranged units keep advancing while they shoot.
    3. **Projectiles** home in and never miss a living target; if the target
       dies first they land on its spot and only splash can still hurt. No
       friendly fire, no collisions on the way.
    4. **Splash** deals full damage (no falloff) to every enemy whose body is
       within the radius of the impact point, measured along the lane.
    5. **Turret slots** unlock in order for 100 / 200 / 350 / 550 (slot 1 is
       free and unlocked). **Sell refund** 50% of the price (+25% of upgrade
       spend, used from Phase 11). Turret range is measured from the turret to
       the target's near edge; turrets never shoot bases. Turret stats are
       the Phase 1 guesses, not tuned yet. Slots are a column of ledges up the
       base's front edge; the top ones stick out above the tower (placeholder).
    6. **Meteor shower numbers**: 12 strikes over 2 s, 30 damage each, 36 px
       radius, 45 s cooldown, ready at match start. Each strike aims at a
       random living enemy unit (leading it if it walks); with none, a random
       spot on the enemy's half. It never damages bases. It fires the special
       of the side's age at the moment of use.
    7. **Modifiers**: same id replaces (re-applying refreshes, no stacking of
       one effect); different ids multiply. Max HP changes keep the HP ratio.
       The shield is a pool on the unit, capped at max HP by default, spent
       before HP; the `shield` stat now means shield strength (base 1).
       Side-wide modifiers can exempt roles (for the Phase 9 money-unit
       penalty). No visual cue for modifiers yet except the shield bar.
    8. **UI**: Tab key switches the bottom tabs, S fires the special, keys
       1-5 still buy units from either tab. Hovering a build button shows the
       turret's name in the card header. Buying, building, selling and the
       special are refused while paused or after game over. Damage numbers:
       white on enemy units, pink on yours, cyan in brackets for shield.
    9. **Architecture**: damage goes only through `systems/damageOps.ts` and
       stat changes only through `systems/statusOps.ts` (helpers like
       `economyOps`, so systems never hold references to each other).
       Deaths are reported by the new `CasualtySystem`. `HitEffects` lives in
       `entities/` as pooled visuals. `SpecialSystem` gets the sim clock as an
       injected function.
  - Repo hygiene: another `vite.config.ts.timestamp-*.mjs` was left in the
    project root by the build check (git-ignored, safe to delete).
- 2026-09-23 (evening): projectile rework, then Phase 8.
  - Owner review of the phase 4-7 choices: 1 (kill gold 1.2x) fine, balance
    later; 2 (Stone stats) no comment until later; 3 changed, see below; 4-7
    fine.
  - **Projectile rework (owner rule):** a projectile flies in a straight line
    and hits the first enemy it meets, or the enemy base if nothing is left
    in the way. Units now shoot level along the lane at `UNIT_SHOT_HEIGHT`
    (26 px; every unit sprite must be taller) from their front edge; the
    target only decides when to shoot. A shot whose target died keeps going
    into the next enemy or the base. Turret shots fly straight at the
    target's middle and meteors straight at their landing spot; both hit the
    first enemy on that line or the ground, never a base. Collision is a
    segment-versus-box test per step (`ProjectileSystem`), so fast shots
    can't tunnel through units. Homing, the lob (`arc`) and the aim modes are
    gone. New dev helper `__aow.kill(id)`. Checked in headless Chromium: a
    shot whose target is killed mid-flight hits the clubber behind it for
    exactly its damage; with nothing left it flies on and hits the enemy base
    (1000 -> 991); shots pass through friendly units (0 friendly hits over 40
    s). Balance re-check after the change: mixed armies still win 22/24
    equal-cost fights.
  - Phase 8 code: `systems/AgeProgressionSystem.ts` (spends `xpToNext`, keeps
    the rest, raises the age, re-skins the base, emits `age-changed`; the age
    is raised before the XP is spent so `xp-changed` already carries the new
    threshold), `ui/AgeUpButton.ts` (next to the XP bar; shows the next age
    and its XP price, lights up when affordable; A key), dev cheat N /
    `__aow.ageUp()`, `__aow.turretStats()`. `AgeConfig` gained `visuals` (sky,
    ground, accent) and `xpToNext` is null for the final age (so is
    `xp-changed.xpToNext`; the HUD shows "final age"). All five ages are
    filled in: 25 units, 15 turrets, 5 specials, 12 new projectile styles.
    Placeholder art: every unit and turret has a dot in its age's accent
    color, each age has its own base drawing (hut, castle, gabled tower,
    bunker, domed tower), and the sky and ground follow the player's age.
    `BACKGROUND_COLOR` / `GROUND_COLOR` were removed from constants. The
    `?gallery` view now flows and wraps, with the bases in their own column.
  - Verified: typecheck and production build pass on the owner's machine.
    Headless Chromium: 33 new checks pass: age-up refused without XP; for each
    of the five ages, all five units can be bought, other ages' units and
    turrets are refused, all three turrets can be built, and the special
    fired is that age's; each age-up spends exactly the threshold and keeps
    the rest; `xp-changed` carries the new threshold (null in Future); the
    final age can't be left; a Stone turret keeps identical stats through all
    four age-ups; a Stone unit on the lane stays after an age-up; pressing A
    ages up. Regression: phase 3 checks 14/14, phase 4-7 checks 21/21,
    projectile checks 3/3, scripted full match still ends in victory (~7 sim
    minutes), production preview has no errors and no `__aow`, gallery OK.
    Not verified by hand: how later ages feel; the enemy is still the Stone
    test spawner, so ageing up makes the current test match easy.
  - Choices to review (Phase 8):
    1. **XP thresholds** 300 / 700 / 1600 / 3600, spent on age-up (remainder
       kept).
    2. **Age factor ~2.2 per age** for cost, HP, damage per second, income,
       kill gold and kill XP (1, 2.2, 4.8, 10.5, 23). Same-age fights take
       as long in every age; a next-age unit is about twice as cost
       effective. Turret prices, upgrade prices and damage scale the same way.
    3. **Specials** all keep a 45 s cooldown; the total damage of a shower
       scales with the age factor, split differently per age (Arrow Volley 20
       x 40, Cannon Barrage 8 x 216, Airstrike 10 x 378, Orbital Strike 6 x
       1380). A special on cooldown during an age-up keeps its remaining time.
    4. **Unit flavor** (see the design doc): Pikeman reach 16, Sniper range
       220 at 85% damage per second, Tank and Mech shoot short-range
       splashing shells, Blade Trooper and Laser Gunner attack faster for
       less per hit, Knight and Cuirassier trample like the Mammoth Rider,
       the Rifleman is melee (slot 1 rule).
    5. **Names** of the 12 new turrets and 4 new specials are placeholders
       (table in the design doc).
    6. **Visuals**: placeholder bases per age, an age-colored dot on units
       and turrets, sky and ground colors follow the player's age only.
    7. **Controls**: A ages up, N is the dev instant age-up.
- 2026-09-23 (late evening): Phase 9 (money unit).
  - `EconomySystem` now takes the `UnitFactory`. Each living unit with an
    `income` block earns its `goldPerSecond` for its side (paid in whole-gold
    steps, source `economy-unit`). When a money unit spawns or dies, the side's
    income and penalty are recomputed: the product of each living money
    unit's `allyPenalty` (0.9 damage and 0.9 speed today), floored at
    `ECONOMY_PENALTY_FLOOR` (0.5), set as two side-wide modifiers
    (`economy-penalty-damage` / `-speed`, money units exempt) through
    `statusOps`, so units spawned later get it too. New event
    `economy-changed` (Appendix A) drives a new HUD row ("Money: +2.6 gold/s
    (2) ... army -19%"). Kill bounty knob `ECONOMY_KILL_BOUNTY_MULT` = 1 (off:
    a money unit's kill gold is already 1.2x its high price). The five ages'
    money units already had their stats from Phase 8 (each pays back in about
    77 s).
  - **Support-unit movement (added, changes a PROPOSED Phase 2 rule):** money
    units have no attack, so under the old "everyone queues single file" rule
    a trader walking at the front of the army blocked every melee unit behind
    it from fighting. Now money and utility units (`Unit.isSupport`, role not
    `combat`) never block friendly units and are never blocked by them (combat
    units still block each other; enemies block everyone). Support units
    don't lead: they walk up to `SUPPORT_TRAIL_GAP` behind the front-most
    friendly combat unit (economy 140 px, utility 40 px), lined up
    `SUPPORT_STAGGER` (38 px) apart in spawn order; with no friendly combat
    unit on the lane they wait `SUPPORT_RALLY_OFFSET` (120 px) in front of
    their spawn point. They are drawn behind combat units. Support units can
    always spawn (only enemies could block them, and those never reach the
    spawn point inside the base).
  - Verified in headless Chromium, 12 new checks: one trader puts the army
    at 0.9x damage and speed (12 -> 10.8, 60 -> 54) while the trader keeps
    its own speed; it earns 13 gold in 10 s; a second one stacks (0.81, also
    on units spawned afterwards) and doubles the income (2.6/s); killing one
    lifts its share at once, killing the last removes both modifiers and the
    income; eight traders hit the 0.5x floor with 10.4 gold/s; a trader with
    no army waits at x 260; a clubber walks through it; the trader then
    trails exactly 140 px behind the clubber and a second trader lines up 38
    px behind the first; killing an enemy trader pays 120. Regression: phase
    3 checks 14/14, phase 4-7 21/21, projectiles 3/3, phase 8 33/33, full
    scripted match still a victory. Typecheck and build pass on the owner's
    machine.
  - Observation: against the free test spawner, money units slow a scripted
    player down (victory at ~6.5 simulated minutes with one trader, ~11 with
    two, ~4.4 without; three traders early lost). In short Stone fights the
    10% army penalty costs more than 1.3 gold/s brings in. Worth revisiting
    in the Phase 13 balance pass, once the AI pays for its units too.
  - Choices to review (Phase 9):
    1. **Support units follow the army and pass through friends** (see
       above). The trail gaps (140 px for money units, 40 px for utility
       units), the 38 px spacing and the rally point are all in config.
    2. **Kill bounty off** (x1): killing a money unit pays its normal 1.2x
       kill gold (120 for a trader).
    3. **HUD**: a "Money" row in the top-left panel with income per second,
       the number of money units and the army penalty.
    4. **Income is paid per side** in whole gold, not per unit, so there is
       no gold popup over each trader (could be added as feedback later).
- 2026-09-23 (late evening, cont.): Phase 10 (utility unit).
  - `systems/UtilitySystem.ts` runs every living unit with a `utility` block
    (timers on the unit, simulation time): heal and shield pulse every
    `intervalMs` on friendly units in the radius (the utility unit included);
    aoe fires, every `intervalMs` while an enemy is within `range`, a level
    projectile with splash through the normal pipeline (its damage follows
    the unit's damage modifiers); slow and buff are auras refreshed every
    `UTILITY_AURA_TICK_MS` (250 ms) as timed modifiers through `statusOps`, so
    they wear off by themselves (slow `durationMs` after leaving range, buff
    `UTILITY_BUFF_LINGER_MS` = 600 ms). Same-kind auras share one modifier id,
    so two alchemists or two officers don't stack. `Unit` gained
    `statMultiplier()` and `heal()`. New events `unit-healed` and
    `utility-pulse` (Appendix A); `HitEffects` shows green "+10" heal numbers
    and a colored ring pulse per kind (heal green, aoe orange, slow purple,
    buff gold, shield cyan). The slot-5 placeholder's cross now has its
    effect's color. `__aow.damage(id, amount)` added.
  - Data change: the `aoe` effect gained `range` and `projectileKey` (the
    Catapult Crew: range 170, splash 60, 55 damage every 2.5 s, a boulder).
  - Movement fix found by the checks: support units now keep pace with the
    unit they follow (they walk at least as fast as it), otherwise a slow
    healer fell out of range while the army marched.
  - Verified in headless Chromium, 7 new checks: slot 5 is heal, aoe, slow,
    buff, shield in the five ages; a Shaman heals a clubber hurt to 40 HP
    back to 90 in five +10 pulses; a Catapult Crew's shot hits two bunched
    enemies for 55 each; an Alchemist slows an enemy to 0.6x (36 px/s) with
    both slow modifiers, the slow lasts ~3 s after the Alchemist dies, then
    speed is back to 60; an Officer raises a Rifleman from 126 to 157.5
    damage and it fades once the Officer is gone; a Shield Drone gives itself
    and a Blade Trooper 230 per pulse (460 after two). Regression all green:
    phase 3 (14), phases 4-7 (21), projectiles (3), phase 8 (33), phase 9
    (12), full scripted match, production preview without `__aow`.
    Typecheck and build pass on the owner's machine.
  - Choices to review (Phase 10):
    1. **Heal and shield include the utility unit itself**; the buff doesn't
       (it has no attack to buff).
    2. **Slow cuts attack rate too** (attack cooldown x 1/0.6), not only
       movement: slowing a unit that is standing and fighting would
       otherwise do nothing.
    3. **Auras don't stack** between two units of the same kind; different
       kinds do (a buffed, shielded unit is fine).
    4. **Catapult Crew** shoots like a ranged unit (level shot, first enemy
       in line) instead of lobbing at a chosen spot, to follow the
       straight-line projectile rule. Its damage is affected by the
       money-unit penalty and by an Officer's buff.
    5. **Utility units follow 40 px behind the front fighter** (from Phase 9)
       and keep pace with it; heal, buff and shield reach 160-180 px, slow
       160 px, the catapult 170 px.
- 2026-09-23 (night): Phase 11 (turret upgrades).
  - Upgrades now follow one curve per turret kind (`TURRET_UPGRADE_CURVES` in
    `turretDefinitions.ts`); each definition's `upgrades` is its kind's curve
    priced from its cost (`upgradesFor(kind, cost)`, rounded to 5 gold). Three
    levels at 50%, 75% and 110% of the turret's price, for about 1.44x, 1.79x
    and 2.04x its fresh damage per second. Rapid turrets mostly gain fire
    rate, heavy ones damage, area ones both. The Phase 1 upgrade numbers were
    replaced (their first level cost 83-90% of the turret for +44%, so an
    upgrade never beat rebuying the newer turret).
  - `TurretSystem` handles `upgrade-turret-requested` (refused unless playing,
    a turret is there, it isn't at max level and the side can pay), raises
    `TurretState.level`, adds the price to `spent`, emits `turret-upgraded`.
    The sell refund was already 50% of the price + 25% of `spent`. Turrets
    show gold dots under them per level; the Turrets tab card shows level dots,
    an Upgrade button with the next price ("Max level" when done) and the Sell
    button. `__aow.upgradeTurret(slot)` added.
  - **Tuning check** (from the live data, every age and kind; values are
    damage per second per gold, relative to buying a fresh turret of the same
    age = 1.00):
    - Right after an age-up, with a fresh old turret: its first upgrade gives
      0.86-0.89, selling it and buying the newer one 0.68-0.71. The upgrade is
      the cheap, efficient step (30-290 gold); the switch buys more damage in
      one go but costs 3-4x as much.
    - At level 1 the two are even (upgrade 0.42-0.46, switch 0.44-0.49).
    - At level 2 switching is better (0.27-0.33 against 0.23-0.26).
    - A fully upgraded turret has 0.92-0.96x the damage of a fresh one from the
      next age (competitive for a while) and 0.42-0.43x one from two ages later
      (clearly beaten), which is the target in the design doc.
    - Simulated check: a small Castle wave (2 swordsmen, 1 archer) against one
      turret and no units. Base HP lost: Stone Spear Thrower fresh 1000 (base
      falls), +1 631, +3 391; fresh Castle Crossbow Tower 318; fresh
      Renaissance Musket Nest 0. Area: Stone Fire Pot +3 423, fresh Castle Oil
      Cauldron 423. So a maxed old turret holds about as well as the next
      age's fresh one, and two ages on it is outclassed.
    No further curve changes were needed after the new curves.
  - Verified in headless Chromium, 9 new checks: upgrading an empty slot is
    refused; level 1 of a Spear Thrower costs 30 and gives 7.2 damage every
    415 ms; an unaffordable upgrade is refused and not charged; levels 2 and 3
    cost 45 + 65 and compound correctly; a fourth is refused; selling while
    paused is refused; selling the level-3 Spear Thrower refunds 65 (30 + 25%
    of 140); `turret-upgraded` fires for levels 1-3; clicking Upgrade on the
    Turrets tab upgrades a Boulder Thrower (40 -> 57.6 damage for 60).
    Regression all green (phase 3-10 suites, full scripted match). Typecheck
    and build pass on the owner's machine.
  - Choices to review (Phase 11):
    1. **Upgrade curve** per kind: 50% / 75% / 110% of the turret's price for
       ~1.44x / 1.79x / 2.04x damage per second (see the tuning check).
    2. **Upgrading an old-age turret after an age-up is allowed** (its own
       curve and prices), which is what makes "stay and upgrade" an option.
    3. **UI**: level dots on the card and under the turret on the base; the
       card got a bit crowded (name, icon, Upgrade and Sell buttons).
- 2026-09-23/24: Phase 12 (enemy AI). (Paused once midway when the owner
  ran out of usage; this entry replaces the interim one.)
  - `config/ai.config.ts`: `AI_DIFFICULTIES` (easy/normal/hard),
    `DEFAULT_AI_DIFFICULTY` normal, `AI_THREAT_DISTANCE` 420.
    `systems/AIController.ts` plays one side: it reads the state and the lane
    and only emits `*-requested` events, so the systems validate its moves
    exactly like the player's. What each preset does is in GAME_DESIGN
    section 8. The temporary test spawner is gone (`TEST_SPAWNER` removed).
  - Wiring: `GameSceneData` is `{ ai?: 'easy'|'normal'|'hard'|'off',
    playerAi? }` (`playerAi` = an AI also plays the player's side, for
    AI-vs-AI tuning). PreloadScene reads `?ai=` (unknown values fall back to
    normal). The AI thinks first in `GameScene.tick`. The HUD's top-right
    panel now shows "Enemy · <age> Age", the difficulty ("Hard AI", "No AI")
    and the enemy base bar. `__aow.snapshot()` has `ai` and `playerAi`.
  - Tuning (sim stepped, scripted players and AI vs AI; results vary run to
    run because the opening depends on real frames before the first step):
    - AI vs AI with the normal AI as the reference opponent: easy wins about
      1 in 9, hard about 6 in 10; hard beats easy 7 of 8 (and 3/3 in the
      check run).
    - Knobs tried on hard (8 games each vs normal): no turrets or one turret
      made it weaker; random picks weaker than counter picks; no money units,
      a utility unit every 6 fighters or a slower think rate were within
      noise. **The special was the biggest lever**: firing at 3+ targets as
      soon as it is ready won 5-6 of 8, waiting for 5 targets 1 of 8, using
      it only defensively 2 of 8. So easy and normal keep it for defence
      (which also protects a new player's opening wave) and hard uses it on
      cooldown.
    - Against scripted players (steady mix, clubber rush, ranged, heavy,
      turtle, no special) all three difficulties win and lose some; the
      economy snowballs from the first fight, so those results are noisy.
  - **Zero passive income, observed**: a side with no units, no turret and
    less gold than its cheapest fighter can never act again. The AI now
    sells its best turret when it has no army, no threat and no gold for a
    fighter, but a side that already sold everything is simply out. Seen in
    tests: the easy AI can be out after losing its first 100 gold of units
    (lost in 3 min to a steady player); a player who loses the opening wave
    to hard's special is out in 1.2 min; two scripted/AI pairs stalled for
    25 min with both sides broke. This is the case the owner asked to
    revisit (see choice 3).
  - Small fix: money-unit purchases now respect the AI's queue limit too.
  - Verified in headless Chromium, `check13` (24 checks): default and `?ai=`
    parsing (bogus -> normal, off -> the enemy never spends); every
    difficulty beats an idle player; a full match against a scripted player
    finishes on every difficulty with units bought (and the special used on
    normal/hard); easy never buys money or utility units; AI-vs-AI games
    finish; hard builds, upgrades, ages up, buys utility units and fires
    specials; hard beats easy at least 2 of 3; easy beats normal at most 1 of
    3; a broke AI with no army sells its turret and queues units; normal
    holds its special while player units are far and fires it once they get
    near its base. Regression green: checks for phases 3-11 (with
    `{ ai: 'off' }` instead of the old spawner flag), and the old full-match
    script now ends in a loss for its Stone-only scripted player, since the
    enemy ages up (ledger and spacing invariants hold). Typecheck and build
    pass on the owner's machine (build with `--outDir` outside the folder;
    the session can't empty `dist/`).
  - Choices to review (Phase 12):
    1. **Same rules, no cheats**: no gold, XP or stat bonus on any
       difficulty; difficulty is reaction time and play quality.
    2. **Presets** (all PROPOSED, GAME_DESIGN section 8): easy = slow,
       random units, one late turret, defensive special at 6+ attackers,
       slow to age up; normal = counters, 2 turrets with one upgrade, a
       money unit when well ahead, utility every 6 fighters, defensive
       special at 4+; hard = fast, counters, 3 turrets upgraded to max and
       modernised after age-ups, up to 2 money units, utility every 4,
       special on cooldown at 3+ targets. **Normal is the default.**
    3. **Passive income**: the tests show the zero-income dead end the owner
       asked to watch for. Recommendation: a small trickle (e.g. 1-2 gold/s
       via `PASSIVE_INCOME_PER_SEC`, maybe scaled by age) so a broke side can
       always rebuild. Not changed; the owner's call.
    4. **Hard vs normal** is a modest gap (about 6 in 10 AI vs AI); easy vs
       the others is a big one. Worth feeling out in real play.
    5. **`?ai=` URL parameter** picks the difficulty until the Phase 13 menu;
       `playerAi` (AI vs AI) stays as a dev/tuning option.
- 2026-09-24: Phase 13 (game flow, polish, first balance pass).
  - Flow: new `MenuScene` (title, Easy/Normal/Hard cards with a one-line
    description from `ai.config`, Play; keys Left/Right, 1-3, Enter/Space;
    the choice is remembered in the Phaser registry for the session).
    PreloadScene opens the menu unless `?ai=` is in the URL. New
    `OverlayScene` (on top of the HUD) for the pause panel (Resume, Restart,
    Main menu) and the game-over panel (Victory/Defeat, match stats, Play
    again, Main menu); it only emits requests. New requests
    `pause-requested`, `resume-requested` (MatchSystem), `restart-requested`,
    `quit-to-menu-requested` (GameScene). P and Esc toggle pause; the HUD has
    a II button. The old in-scene "PAUSED" text and "Reload the page" panel
    are gone. New `StatsSystem` (listens only) counts units trained, kills,
    losses, gold earned/spent, turrets built and specials per side.
  - Polish: `HitEffects` now also shakes the camera (`SCREEN_SHAKE`: player
    base hit, splashes 50 px or wider, base destroyed; each throttled),
    throws rubble puffs when a base falls (the base also turns dark), and
    flashes the screen on the player's age-up. The HUD shows a big "<AGE>
    AGE" banner for the player and a red "Enemy reached the ... Age" notice.
    The game-over panel appears `GAME_OVER_DELAY_MS` (1.2 s of scene time)
    after the base falls.
  - Balance: **passive income on** (owner OK'd): `PASSIVE_INCOME_PER_SEC` 2,
    times the age factor (new `AgeConfig.scale`). The AI now fills its whole
    queue when it has 4x its age's heavy-unit price banked
    (`AI_RICH_GOLD_MULT`), so gold doesn't pile up into late-game stalls.
    Match-length study (AI vs AI and scripted vs AI, 12 matches per setting):
    income off 7.5 min median, max age ~2.4; flat 2 g/s 13.8 min but 5/12
    stalled in the Future age; age-scaled 12.6 min, 1 stall; age-scaled +
    AI surplus spending 14 min (7-34), all reached the Future age, no stalls;
    base HP 2000 on top added little (14.4 min) and brought a stall back, so
    base HP stays 1000. The owner then asked to stop long simulations until
    after playtesting.
  - Debug handle: `damageBase(side, amount)`, `activeScenes()`,
    `displayCount()`, `stats(side)`.
  - Verified in headless Chromium, `check14` (22 checks): menu first with no
    match running; 3 + Enter starts a hard match; P pauses and shows the
    overlay, P resumes; the HUD pause button and the Resume button work; Esc
    + Restart gives a fresh match (100 gold, no units, same AI) with the same
    number of bus listeners (43) and game objects (143); a falling enemy
    base ends the match, the panel waits a moment then appears, Enter plays
    again; defeat + Main menu tears the match down; clicking Easy + Play
    starts an easy match; the menu remembers the choice; 6 restarts and 3
    menu round trips leave listeners, game objects and scenes unchanged.
    Regression green for the phase 3-11 suites (two checks updated for
    passive income). The long AI match suite (check13) was not re-run after
    income went on. Typecheck and build pass on the owner's machine.
  - Choices to review (Phase 13):
    1. **Passive income** age-scaled, 2 gold/s base.
    2. **Menu** is minimal (title, difficulty cards, controls). No settings,
       sound or how-to-play screen.
    3. **Restart keeps the opponent**; changing difficulty goes through the
       menu.
    4. **Game feel** kept subtle: shakes only for your base, big splashes and
       a base falling; banner 2.4 s.
    5. **Match length** now ~14 min median, within the owner's "around 30
       min" allowance.
- 2026-09-24: Real art test: the Stone Clubber uses the owner's LPC
  character (walk and thrust strips built from the generator's frames,
  `public/assets/sprites/units/stone-clubber/`). New
  `config/unitArt.config.ts` (per-unit sheets, frame rates, foot line,
  scale, icon crop, enemy tint) and `entities/unitArt.ts` (loading,
  animations, icons). `Unit` now keeps a footprint (`bodyWidth`,
  `bodyHeight`) from the placeholder, so `halfWidth`, `topY` and `centerY`
  no longer depend on the drawn sprite; art units walk, thrust on each
  attack (`Unit.playAttack`, called by CombatSystem) and stand otherwise.
  Animations freeze while paused or after game over. Buy buttons and the
  training queue show the art's icon. Choices to review: enemy copies are
  tinted red (a second, recolored character from the generator would look
  better); scale 1 (the caveman is 49 px tall, the placeholder 46); the hit
  lands when the thrust starts, not at its furthest frame; no death
  animation yet (the unit vanishes in a puff as before). Tests green
  (phases 3, 4, 8, 11, 13 suites), typecheck and build pass.
- 2026-09-26: Phase 14, buildings and research (owner direction, GAME_DESIGN
  section 11). Mine, Library and Forge behind each base; nine Forge research
  tracks; passive income removed; playtest speed button (1/2/3/4/8x, F key,
  now in all builds) and fixed-size sub-steps at high speed. New stats
  `range` and `damageTaken` on units; `SideModifier.onlySlots`. AI builds
  (first Mine without a gold reserve) and researches the cheapest open
  track, capped per difficulty (`buildingLevelCap`, `researchTierCap`).
  One tuning pass after AI-vs-AI runs: Mine 1/1.5/2/2.5/3 gold/s and
  Library 0.5/0.8/1.1/1.4/1.8 XP/s (both x age factor), turret research
  +8% damage / +5% range per tier. Checks: typecheck and build pass; buying
  and research driven through `__aow` (costs, age locks, Forge gating,
  modifiers on new units, Mine/Library output) and screenshots of both new
  tabs. Finding: normal-vs-normal AI matches often stall in the Future age
  (both queues full, gold piling up past 100k), with or without research
  and with the Library off, so it is not caused by one feature; not known
  whether Phase 13 code stalled the same way under this exact test.
  - Choices to review (Phase 14, all PROPOSED):
    1. **"Support" = ranged units (slot 2)**, as in Age of War 2.
    2. **Armor** = less damage taken (6% per tier, max 30%).
    3. **Research bonuses add up** per tier (+10% x 5 = +50%), not compound.
    4. **Building level cap = age number**; Mine and Library output x age factor.
    5. **Enemy buildings** exist behind the enemy base; the camera can scroll
       right to see them.
    6. **Research tab doesn't move the camera**; Buildings tab pans left,
       Units/Turrets pan back.
    7. **Placeholder building art** drawn in `PlaceholderArt` (no rig art yet).
- 2026-09-26: Playtest logging (owner request). `systems/MatchLogger.ts`
  records human-played matches in dev builds (not AI-vs-AI): actions with
  timestamps (units, turrets, buildings, research, age-ups, specials, base
  HP marks, speed, pauses), gold earned by source and spent, kills and
  losses by unit, and a snapshot of both sides every 15 s of game time,
  plus the tunables in force. On win, loss, restart, quit to menu or tab
  close it posts the log to a dev-server plugin (`playtestLogs` in
  `vite.config.ts`, serve only) that writes `playtest-logs/<date>_vs-<ai>_<result>.json`.
  Listens only; no new events. Checked headless: lost, quit and closed
  logs all saved; typecheck and build pass.

