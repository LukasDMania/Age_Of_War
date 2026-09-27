# Implementation Plan

Handoff document. Read `CLAUDE.md` (rules) and `docs/GAME_DESIGN.md` (what
we're building) first, then work through the phases below **in order**.

**Current status (2026-09-28):** Phases 0 to 20 are done (15 and 16 are
log-only). The work is on the branch `claude/youthful-ptolemy-su6zli`
(pushed; main has everything up to the Conquest balance fix of
2026-09-27, and the branch contains all of main, so merging it is a
fast-forward). Nothing is waiting half-built.

### Start here (new agent)

1. Read `CLAUDE.md`, then `docs/GAME_DESIGN.md` (sections 13-15 are the
   newest: overnight features, playtest round 5 and Conquest, then
   keyboard, the Mech and archetype paths), then the last three Session
   log entries at the bottom of this file.
2. `npm install`, `npm run dev`, and play: the title menu picks a
   difficulty (1-3, Enter) or Conquest (C); `?ai=normal` skips the menu.
3. Run the browser checks against the dev server (they need Playwright;
   see `tools/checks/_lib.mjs`): `node tools/checks/mech.mjs`,
   `node tools/checks/paths.mjs`, `node tools/checks/effects.mjs` (saves
   slow-motion screenshots of every effect to `tools/checks/out/`),
   `node tools/checks/muzzles.mjs` (after changing ranged art).
4. **Next up: ask the owner.** Phase 20's work is waiting for the owner's
   playtest. Candidates the owner has mentioned or that are half-planned:
   a Mech refit on the lane (GAME_DESIGN 15), more Mech parts unlocked
   through Conquest or research ("we can lock unlocking more parts behind
   other things"), a Workshop commander, 1v1 multiplayer (DEFERRED, hosting
   notes in GAME_DESIGN 15). Don't start any of them without asking.

### Where the newest systems live

- **Keyboard**: `config/keybindings.config.ts` (every action and default
  key), `ui/keymap.ts` (`KeyboardControls`), `ui/ControlsScene.ts`;
  compositions in `ui/compositions.ts`.
- **Mech**: parts in `config/mech.config.ts`; a design becomes a unit in
  `entities/mechDesign.ts` (the unit id spells out the design); art in
  `art/mechDraw.ts` + `utils/MechArt.ts`; `systems/MechSystem.ts`;
  `ui/WorkshopPanel.ts`. `/artlab.html?mechs` shows designs per age.
- **Conquest paths**: `PATHS`, `PATH_LEAN`, relics / camp upgrades with
  `path` and `keystone` in `config/conquest.config.ts`; offers in
  `state/conquestState.ts` (`pathCounts`, `rollRelics`, `campOffer`);
  behaviour rewards become `SideState.traits` (`state/traits.ts`), applied
  by `ConquestSystem` and read by the owning systems (search for
  `traits.`).
- **Shots from the weapon**: `attack.muzzle` on ranged units (px from the
  unit), `systems/shotLine.ts`; measured with `rigKit.markShot` and
  `/artlab.html?muzzles`.
- **Effects**: `entities/ImpactEffects.ts` (particles, streaks, flashes,
  slashes, explosions), tunables in `config/effects.config.ts`, textures in
  `art/fxDraw.ts`. `__aow.fxTimeScale(0.1)` slows them down for review.

### Dev tools

- `window.__aow` (dev builds, `utils/debug.ts`): state, bus, spawn, step,
  restart (`{ ai, playerAi, conquest }`), cheats, `fxTimeScale`.
- `?headless` simulates without drawing; `window.__aowTrain.runMatch(...)`
  plays a whole match (AI-vs-AI balance runs, `tools/train-ai.mjs`).
- `/artlab.html`: rig art per age (`?age=2`, `?bounds`), `?turrets`,
  `?buildings`, `?mechs`, `?muzzles`. `?gallery` on the game URL: every
  texture.

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

## Phase 17: Overnight session (owner's list, 2026-09-26)

Design in GAME_DESIGN section 13. Prototypes are behind
`config/features.config.ts` switches.

- [x] AI opening per difficulty (`AiOpening`): eased income, army cap, no
  early heavies or offensive special.
- [x] Rig art for all 25 units (`src/art/`: rigKit, rigFigure, rigMounts,
  rigMachines, rigDraw), drawn per age on demand and released for ages
  nobody is near; `/artlab.html` dev review page.
- [x] Turret art (15 turrets, mount + tracking head, recoil, flash, a new
  look per upgrade level).
- [x] Projectile art, trails, impact effects (`entities/ImpactEffects.ts`),
  camera thump instead of shake (`entities/CameraThump.ts`), base art per
  age with cracks.
- [x] Themed UI per age (`config/uiTheme.config.ts`, `addThemedPanel`),
  new fonts, title screen.
- [x] Utility AI with genomes and profiles (`systems/UtilityAI.ts`,
  `config/aiGenome.config.ts`), headless sim mode (`?headless`), training
  harness (`src/dev/trainHarness.ts`, `tools/train-ai.mjs`), trained
  profiles in `config/aiTrained.json`.
- [x] Buildings: five levels per age, staged art, level-up celebration;
  prototypes Barracks/Shrine/Market and building perks.
- [x] Prototypes: veterancy, age doctrines, War Cry, Experiments panel.
- [x] Prototype: Conquest mode (`scenes/ConquestScene.ts`,
  `state/conquestState.ts`, `systems/experimental/ConquestSystem.ts`,
  `config/conquest.config.ts`).

Acceptance: every prototype can be switched off and the game still runs;
typecheck and build pass; checked in headless Chromium screenshots.

## Phase 18: Playtest round 5 and the Conquest campaign (2026-09-27)

Design in GAME_DESIGN section 14.

- [x] Flipped sprites keep their anchor (`utils/spriteOrigin.ts`): enemy
  corpses no longer jump forward; enemy units and turret heads line up.
- [x] Mammoth, knight and cuirassier nerfs; veterancy promotions don't heal
  (`statusOps.applyModifier` HP mode `keep`).
- [x] `UnitDefinition.bodyWidth`; the catapult crew is two units wide.
- [x] Melee attackers hit enemies standing in the gate before the base
  (`CombatSystem.defenderAtGate`). The area-shot rule that first shipped
  here was reverted (misread request). Both undone the same night (owner):
  attackers at the door hit the wall, and units' splash reaches the base
  (`dealSplashDamage` `base`).
- [x] Money-unit rework (switch `moneyUnitRework`): growing income, loot,
  smaller bounty, income bar.
- [x] Age catch-up (switch `ageCatchUp`, `systems/ageCatchUp.ts`).
- [x] Per-side age cap (`SideState.maxAge`, `age-capped` rejection, Age
  locked button).
- [x] Conquest campaign: chapters, map, nodes, bosses, banners, supplies,
  camps, events, relics, commanders, achievements, Legacy tiers, siege
  (`config/conquest.config.ts`, `state/conquestState.ts`,
  `systems/experimental/ConquestSystem.ts`, `scenes/ConquestScene.ts`,
  `ui/experimental/conquestWidgets.ts`).
- [x] Conquest battle economy (`BATTLE_ECONOMY`, Conquest effect
  `kill-gold`), `GameSceneData.playerAiIncome` for human-like balance runs,
  Conquest battles in match logs (log version 2).
- [x] Conquest: the AI's first unit is in the battle's age; starting limits
  (`START_LIMITS`: bonus gold, turrets).

Acceptance: typecheck and build pass; 12 simulated runs of the campaign
state machine finish without getting stuck; AI-vs-AI chapter battles in
every age end within about 15 minutes; screens checked in headless
Chromium.

## Phase 19: Keyboard, compositions, the Mech, archetype runs (done)

Design in GAME_DESIGN section 15. Proposed order, smallest first; confirm
with the owner before each.

- [x] Buy several building levels and research tiers at once
  (Shift / Ctrl + click or key; `BuildingPanel.buyLevels`,
  `ResearchPanel.buyTiers`, press modifiers in `UiButton`).
- [x] Keymap with every battle action, full keyboard play, Controls screen
  to rebind (saved per browser): `config/keybindings.config.ts`,
  `ui/keymap.ts` (`KeyboardControls`), `ui/ControlsScene.ts`; event
  `keybindings-changed`.
- [x] Compositions by slot: F1-F8 to queue, Ctrl+Shift+F1-F8 to save the
  current queue, an editor (Controls, Armies page); stop at the first
  unaffordable unit or a full queue (`ui/compositions.ts`).
- [x] Mech workshop (first draft): five slots (legs, torso, head, left and
  right arm) with 3-5 parts each and five age looks
  (`config/mech.config.ts`, `entities/mechDesign.ts`, `art/mechDraw.ts`,
  `utils/MechArt.ts`), Workshop tab (`ui/WorkshopPanel.ts`), MechSystem
  (`build-mech-requested`, `mech-changed`, one at a time). Refit of a Mech
  on the lane not built yet.
- [x] Conquest archetype paths: tags on every reward, leaning offers, new
  behaviour effects, a first reward set for Vanguard, Marksmen,
  Juggernauts, Bastion, Guild and Workshop (`state/traits.ts`,
  `config/conquest.config.ts` `PATHS` / `PATH_LEAN`, `conquestState`
  `pathCounts` / `rollRelics` / `campOffer`).

---

## Phase 20: Owner's list of 2026-09-28 (done)

Owner (before going to sleep): "Yes continue, also for the mech make sure
there are at least 3 options for each body part ... Finish all the current
tasks. Then make sure in the turrets tab the icons for the turrets
correspond to the actual art ... Then make sure rangers projectiles come
out from where their model shoots it ... Then after that do a rehaul of the
effects ... Do all of em without my input ... Add to the docs so new agent
can pick up easily".

- [x] Mech: every slot has three or more open parts (Striders, Armory, War
  siren added, drawn in five ages) plus a Forge part.
- [x] Conquest archetype paths (the last Phase 19 item, ticked there).
- [x] Turrets tab icons drawn from the turrets' own art
  (`TurretArt.ensureTurretIcon`).
- [x] Ranged shots leave the weapon on the art (`attack.muzzle`,
  `systems/shotLine.ts`, `/artlab.html?muzzles`).
- [x] Effects rehaul (streaks, glows, muzzle flashes, slashes, sparkles,
  layered explosions, deaths, sky flash, ricochets, age-up).
- [x] Handoff: this file's "Start here", `tools/checks/`, session log.

---

## Appendix A: Event catalog

All cross-system communication goes through `utils/EventBus.ts`. Keep this
table current: add a row whenever you add an event. `side` is always
`'player' | 'enemy'`.

Payload types live in `EventPayloads` in `utils/EventBus.ts`. Details the
tables leave open: `gold-changed.source` is a `GoldSource` (`'kill' | 'mine'
| 'market' | 'ai-income' | 'economy-unit' | 'purchase' | 'refund' |
'conquest' | 'cheat'`; `market` and `conquest` are prototypes), `unit-queue-changed.queue`
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
| `background-cycle-requested` | `{}` | GameScene (HUD BG button; playtest) |
| `choose-perk-requested` | `{ side, buildingId, choice }` (`choice` `'a' \| 'b'`) | BuildingSystem (prototype `buildingPerks`; HUD perk popup, both AIs) |
| `choose-doctrine-requested` | `{ side, doctrineId }` | DoctrineSystem (prototype `ageDoctrines`; HUD popup, DoctrineAi) |
| `war-cry-requested` | `{ side }` | WarCrySystem (prototype `warCry`; HUD button or W, WarCryAi) |
| `conquest-continue-requested` | `{}` | GameScene (prototype `conquest`; game-over Continue or pause Retreat: records a retreat as a loss, returns to the campaign screen) |
| `build-mech-requested` | `{ side, design }` (`design` a `MechDesign`: legs, torso, head, left, right) | MechSystem (Workshop tab Build or R; pays and starts the build in the side's age) |

**Notifications** (emitted by systems; anyone may listen):

| Event | Payload | Emitted by |
| --- | --- | --- |
| `gold-changed` | `{ side, gold, delta, source }` | `state/economyOps` helpers (any system that pays or earns) |
| `xp-changed` | `{ side, xp, xpToNext }` (`xpToNext` is null in the final age) | `state/economyOps` helpers |
| `unit-spawned` | `{ side, unitId, instanceId }` | SpawnSystem (bought units and debug spawns) |
| `unit-queue-changed` | `{ side, queue }` | SpawnSystem (on buy, on spawn, and every frame while the front unit trains) |
| `unit-died` | `{ side, unitId, instanceId, killerSide, x, killerTurret? }` (`killerTurret`: the slot of the turret that scored it) | CasualtySystem (end of frame, for every unit `damageOps` marked dead) |
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
| `background-changed` | `{ id, name }` | GameScene |
| `keybindings-changed` | `{}` | ControlsScene (closed after keys or armies changed; the HUD redraws its key labels) |
| `projectile-impact` | `{ side, key, x, y, radius, target }` (`target` `'unit' \| 'base' \| 'ground'`) | ProjectileSystem (feedback: impact effects) |
| `unit-struck` | `{ side, instanceId, unitId, slot, x, frontX, ranged, muzzleX?, muzzleY?, projectileKey? }` (a shot: where it left the weapon and what it is) | CombatSystem (feedback: a blow landed or a shot left; heavies thump the camera; muzzle flashes) |
| `turret-fired` | `{ side, slotIndex, turretId, x, y }` (muzzle position) | TurretSystem (feedback: muzzle effects) |
| `building-perk-chosen` | `{ side, buildingId, choice, picks }` | BuildingSystem (prototype `buildingPerks`) |
| `unit-promoted` | `{ side, instanceId, rank, x, topY }` | VeterancySystem (prototype `veterancy`) |
| `doctrine-offered` | `{ side, age, options }` (doctrine ids) | DoctrineSystem (prototype; 400 ms of sim time after an age-up) |
| `doctrine-chosen` | `{ side, doctrineId }` | DoctrineSystem (prototype) |
| `war-cry-used` | `{ side, durationMs, positions }` (x of every rallied unit) | WarCrySystem (prototype) |
| `war-cry-cooldown-changed` | `{ side, remainingMs, totalMs }` | WarCrySystem (prototype; in 100 ms steps) |
| `siege-changed` | `{ mult }` (every unit's siege damage multiplier) | ConquestSystem (prototype; each minute of siege in a Conquest battle) |
| `shot-bounced` | `{ side, fromX, fromY, toX, toY }` | `systems/damageOps` `dealBounceDamage` (feedback: a turret shot ricocheted; Conquest's Ricochet) |
| `mech-changed` | `{ side, alive, build }` (`build` `{ unitId, remainingMs, totalMs }` or null) | MechSystem (build started, every frame while building, walked out, fell) |

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
- 2026-09-26: Owner playtest feedback (7 logs in `playtest-logs/`, all vs
  hard). Ranged units now keep walking while they shoot until they are right
  behind the friendly unit in front (`LaneSystem.closeRanks`), so the army
  stays one row; with no friendly ahead they hold at range. Checked headless
  (two slingers closed up behind a clubber while firing); typecheck passes.
  Log findings: in 5 of 6 finished matches the hard AI spent its 100
  starting gold on units at once, lost them, and then sat at 0-30 gold with
  no Mine and no income (its Mine needs 2 living fighters first), so it
  never recovered. In the long win the player held with turrets alone for
  ~6 minutes while gold piled up to 3000. AI economy redesign under
  discussion with the owner (AI may get its own economy instead of the
  same rules).
- 2026-09-26: Phase 15 (owner decisions): special cooldown 45 s -> 75 s.
  AI income "option C": `systems/AiIncomeSystem.ts`, one per AI-played side,
  pays gold (2/s) and XP (0.5/s) x age factor x match-time ramp (to x2 at
  30 min) x difficulty `incomeMult` (1 / 1.5 / 2.5), source `ai-income`.
  CLAUDE.md and GAME_DESIGN section 8 updated (the AI is no longer on the
  player's economy alone). Checks: typecheck passes; a turret-only player
  (the owner's cheese) now loses to every difficulty (hard in under 4 min,
  normal ~7 min, easy ~10 min). AI-vs-AI between equal AIs still stalls in
  the Future age (known, only matters for AI-vs-AI). To watch in playtests:
  the AI now reaches the Castle age around 3 min on hard; its XP trickle may
  make it age too fast for a human.
- 2026-09-26: Playtest round 3 (owner feedback + 1 long logged match: 27 min
  vs hard, lost; 570k kill gold for the player, both sides banking 100k+,
  front line stuck mid-lane between two turret lines).
  - Money and utility units walk and block like everyone else (`LaneSystem`
    rewritten: no more phasing, trailing or rally point; spawn point checks
    every unit). Checked: clubber, shaman, trader, clubber queue in one row.
  - Heal and shield auras don't stack: each ally gets at most one heal / one
    shield refresh per interval (`Unit.healLockUntil` / `shieldLockUntil`),
    and a shield is capped at one drone's absorb. Checked: 4 shamans heal a
    clubber exactly as fast as 1 (10 HP per 1.5 s).
  - Base max HP grows per age (`BASE_HP_BY_AGE` 1000/1500/2100/2800/3600);
    age-up adds the difference.
  - Kill rewards cut (`KILL_GOLD_MULT` 0.5, `KILL_XP_MULT` 0.6): a turret
    line was farming more gold than the enemy spent.
  - Turret upgrades weaker (full path ~x1.55 DPS instead of ~x2.05); turret
    research +5% damage / +3% range per tier (was +8% / +5%).
  - AI XP income 0.5 -> 0.25 per s (AIs reached the Future age in ~8 min).
  - AI-vs-AI after the changes: matches end in 7-13 min (no stall in 3
    runs); a turret-only player loses to every difficulty. All PROPOSED.
- 2026-09-26: AI unit variety (owner: the AI streamed only first-slot units
  when it wasn't rich). `AIController` now picks the next fighter first
  (counter weights, or random on easy) and saves up for it
  (`plannedSlot`); its reserve for turrets/buildings/research covers that
  unit. Only with enemies at its gate and no fighter left does it buy the
  best unit it can afford right away. Check vs a stand-in player (a clubber
  every 12 s): easy 9/4/9 melee/ranged/heavy, normal 8/7/7 + 3 shamans,
  hard 6/6/4 + 2 shamans. Typecheck passes.
- 2026-09-26: Background options for playtesting. The owner's `art/` packs
  (4 Craftpix layered scenes, 2 forest parallax packs) resized to 720 px
  high into `public/assets/backgrounds/<id>/` (2.5 MB). New
  `config/backgrounds.config.ts` (7 options incl. the old plain colors,
  per-layer parallax factor and cloud drift, ground mode) and
  `entities/Backdrop.ts` (screen-fixed tile sprites offset by camera scroll
  x factor; loads a set on demand and unloads the previous one). HUD button
  "BG: <name>" and the B key cycle options; choice kept in localStorage.
  Forest packs use their own ground (strip and lane line hidden); the others
  keep a colored ground strip. Unbuilt buildings now show a faded name
  (the "(not built)" labels overlapped). AI unit mix: `AI_UNIT_MIX`
  1 / 0.65 / 0.33 on melee / ranged / heavy (easy picks randomly with the
  same weights); vs the stand-in player it now sends about 55 / 30 / 15 %.
  Checked: screenshots of all 7 options and a pan to the buildings,
  no console errors; typecheck passes.
- 2026-09-26: Phase 16, crisp rendering + Stone age rig art.
  - Blur fix (`utils/renderScale.ts`): the canvas was 1280x720 stretched by
    CSS and the screen's pixel ratio. It is now created at its shown size
    (window fit x devicePixelRatio, capped at 3x, in 0.25 steps) and every
    scene camera zooms by that factor from its top-left (hooked in
    `main.ts` on each scene's CREATE), so game code keeps 1280x720
    coordinates. Text is rendered at the same resolution (the `add.text`
    factory is wrapped). GameScene clamps its own camera scroll now
    (Phaser's setBounds assumes centered zoom); drag scrolling divides by
    the zoom. Checked at 1.5x pixel ratio: 2240x1260 canvas, sharp text,
    buy-button clicks and the Buildings tab work.
  - Rig art (`art/rigDraw.ts` drawing, `utils/RigArt.ts` sheet generation,
    `rigArt()` entries in `config/unitArt.config.ts`): all five Stone units
    (clubber, slinger, mammoth rider with a spear rider, trader with a sack,
    shaman with feather headdress and a glowing skull staff). Sheets are
    drawn at boot per side (team-colored belts, headbands, saddle) at the
    render scale, walk strip = stand + 8 frames, attack = 8 frames that
    strike first (damage lands at the start of an attack). The shaman's
    heal (and any shield pulse) plays its attack animation. Footprints
    stay the placeholders' sizes. The LPC clubber sheet is kept as
    `LPC_CLUBBER_ART` but unused. Checked in screenshots on the forest
    background, no console errors; typecheck and build pass.
- 2026-09-26: Playtest round 4 (owner feedback; latest log: 12-min win vs
  hard where 5 mostly unupgraded turrets held the gate while the player
  banked gold, and the hard AI never built a turret).
  - Screen shake from big splashes turned off (mortar fire shook the screen
    constantly); base-hit and base-destroyed shakes stay.
  - Rig frames enlarged (weapons raised overhead were clipped at the top;
    falling bodies at the side); supersampling capped at 2x for memory.
  - Walk animation held for 220 ms through momentary stops (followers
    stopping/starting every few frames flickered between stand and walk).
    Walk loop now 10 frames at 14 fps.
  - Attacks land on the strike frame: new `UnitAttack.windupMs` (Stone:
    clubber 280, slinger 330, mammoth 330 ms; other ages 0 until they get
    rig art). CombatSystem starts the swing, keeps the unit in place, and
    hits whatever is in reach at the strike (`Unit.strikeAt`). Attack
    animations wind up and strike at 45% with frame rates matched to the
    windup. Checked: 283 ms from swing start to damage for the clubber.
  - Die animation for rig units (fall backwards and fade; mammoth tips
    over), played by `HitEffects` from a sprite pool where the unit died;
    units without one keep the puff.
  - Equal walking speed for every unit (`UNIT_WALK_SPEED` 45; unit
    `speed` values unused for now). Checked: a 180 px gap between a
    mammoth and a clubber stays 180 px.
  - Spawn stacking: up to `SPAWN_STACK_MAX` = 4 own units may overlap the
    spawn point (enemies there still block); stacked units peel off in
    spawn order. Checked with an unkillable enemy at the gate: 4 clubbers
    out, the 5th waits in the queue.
  - Turrets: all damage x0.7 (`TURRET_DAMAGE_MULT`); slot unlocks
    250 / 900 / 2500 / 6000 (were 100 / 200 / 350 / 550).
  - AI reserve back to 2 cheap fighters (holding back the planned unit's
    price stopped the hard AI from ever building turrets).

- 2026-09-26 (overnight, owner away): Phase 17, the owner's list. Design in
  GAME_DESIGN section 13; the owner-facing summary with ideas and how to
  turn things off is `docs/OVERNIGHT_NOTES.md`.
  - AI opening (PROPOSED, `AiOpening`): income 20 / 25 / 30% at the start
    easing to full over 5 / 4 / 3 min, army cap 2 / 2 / 3 growing 2 / 2.5 /
    3 per minute, heavies from 150 / 100 / 70 s, queue depth 1, no offensive
    special before 150 / 100 / 60 s. Measured on hard: 3 units at 10 s and
    6 at 60 s (was 6 and 12 plus a mammoth). `buildingLevelCap` in the
    difficulty presets now means levels per age (the AI's cap is
    5 x age + that).
  - Art: all 25 units as rigs (`src/art/`), per-unit measured frame boxes
    and `windupMs` matched to the strike frame; sheets drawn per age on
    demand and released for ages more than one away from both sides
    (28-47 MB of rig textures measured during a match instead of several
    hundred). 15 turrets with a look per upgrade level, tracking heads,
    recoil and muzzle flash (shots leave from the drawn muzzle). Bases per
    age (same 120x200 box, so hits are unchanged), ledges per age, cracks
    below 66% / 33%. Projectiles, trails, impacts, scorch marks. Screen
    shake replaced by `CAMERA_THUMP` (PROPOSED numbers in
    `config/effects.config.ts`; `SCREEN_SHAKE` removed). Buildings drawn
    per level with five staged looks.
  - UI: per-age themes, patterns and the ornate Kenney frame; fonts from
    npm (`@fontsource/fredoka`, `@fontsource/lilita-one`, SIL OFL); the HUD
    restarts itself in the new look when the player ages up (keeps tab,
    speed and the age banner). New title screen.
  - AI: `UtilityAI` + genomes + profiles (menu Q/E, `?profile=`), classic
    stays the default. `?headless` dev mode (Canvas renderer, hidden camera,
    no HUD, no rig art, effects muted) runs a 20-minute match in about 2 s.
    `tools/train-ai.mjs` trains genomes by self-play (see README).
  - Buildings (changes the PROPOSED "max level = age number"): five levels
    per age, step costs x the age factor, steady per-level output, research
    tier N at Forge level 5(N-1)+1, +1% unit damage per Forge level.
  - Prototypes behind `config/features.config.ts` (all default on; the
    title screen's Experiments button switches them per browser):
    `buildingPerks`, `extraBuildings` (Barracks, Shrine, Market),
    `veterancy`, `ageDoctrines`, `warCry`, `conquest`. Extra buildings and
    Conquest touch DEFERRED items (GAME_DESIGN section 9); the owner asked
    for such experiments, so they are built only as switchable prototypes.
  - Rules kept: the AI and all prototypes act through `*-requested` events
    (new: `choose-perk-requested`, `choose-doctrine-requested`,
    `war-cry-requested`, `conquest-continue-requested`); Conquest battle
    grants are exactly the price of each purchase, paid in with the new
    gold source `conquest` and then requested as usual. New feedback events
    `projectile-impact`, `unit-struck`, `turret-fired`. All added to
    Appendix A.
  - Checked: typecheck and build pass; screenshots in headless Chromium of
    every age's units, turrets, bases, effects, the HUD per age, the
    buildings at each stage, the prototypes' popups and the Conquest
    screens; a Conquest battle set up with a Renaissance start, turrets,
    a Forge and research; an AI-vs-AI match with every prototype switched
    off (no errors). Not checked: real-time play with a mouse by a person,
    audio (none), mobile.
  - Training: run 1 (30 generations, old rules) seeded runs 2 and 3 on the
    final rules (20 generations each), published as the **Trained** and
    **Raider** profiles; both won every exam game. Round robin on hard
    (`tools/ai-ladder.mjs`, `training/ladder-hard.json`): Raider 96%,
    Trained 82%, Classic 64%, Warlord 52%, Tactician 48%, Turtle 23%,
    Balanced 20%, Economist 14%. Against an idle player the trained AIs
    field 2-5 fighters in the first minutes (Classic 3-6).
  - Choices to review: every number above (PROPOSED); whether Barracks,
    Shrine, Market, perks, veterancy, doctrines, War Cry and Conquest stay;
    whether the HUD should restyle on age-up; the Classic vs trained AI as
    the default.
- 2026-09-27: Phase 18, playtest round 5 (owner away: "don't ask anything
  just go ahead"). Design in GAME_DESIGN section 14. Each item was pushed to
  `main` as its own commit.
  - Bug: enemy corpses jumped forward. Cause: Phaser mirrors flipped
    sprites inside their frame, so off-center origins landed on the
    mirrored spot (enemy units, death strips, turret heads and flashes were
    all drawn off their real position). `flipOriginX` fixes all of them;
    checked with mirrored melee screenshots in two ages.
  - Balance (PROPOSED values changed): mammoth 80 -> 90 gold, 300 -> 240
    HP, 16 -> 14 damage; knight 660 -> 600 HP; cuirassier 1440 -> 1300 HP.
    Measured with equal-gold fights (the mammoth used to beat 90 gold of
    slingers with a third of its HP left). Veterancy no longer heals.
  - Catapult crew footprint 60 px (`bodyWidth`), art centered
    (`rigArt` anchorX). Area shots dealt no damage to bases for a few
    hours (a misread of the owner's note), then reverted; the real issue
    was melee hitting the base while defenders stood inside its gate (see
    below).
  - Money-unit rework and age catch-up behind new switches (see section
    14 for numbers). Catch-up measured: AI follows an early player age-up
    in 60 s (normal) / 35 s (hard), was 180 s / 130 s.
  - Conquest rebuilt as a five-chapter campaign with meta progression.
    Twelve simulated runs (random choices, 60-95% win rates) all ended in a
    win or a loss without a stuck state; a strong run is ~20 nodes, ~14
    battles, ~180 Glory. Age-locked battles stalled AI-vs-AI for 20
    minutes in every age, so a siege rule ends them in about 15.
  - New event `siege-changed` (Appendix A). New switches
    `moneyUnitRework`, `ageCatchUp` (both default on).
  - Not checked: a full human playthrough of a campaign (hours long);
    balance of later chapters against a human; how the siege feels.
  - AI: the round-5 rules dropped the old Raider to 31% in a round robin;
    both trained profiles were retrained (15 more generations each,
    `training/trained-r5`, `training/raider-r5`) and replaced in place in
    `aiTrained.json`. Round robin on hard: Trained 89%, Raider 72%,
    Warlord 42%, Tactician 19%, Classic 14%.
  - Choices to review: the area-shot rule (tanks and mechs can't hurt
    bases now, so a pure tank army can't finish a base); the catch-up
    numbers; the siege timing; the campaign's numbers (banners, supplies,
    Glory, Legacy costs).
- 2026-09-27 (later): owner clarified the "heavy AOE" note: a mammoth
  trampling units in front of the enemy base damaged the base. Reverted the
  area-shot rule (`AREA_SHOT_BASE_DAMAGE_MULT` removed; shots hit bases in
  full again). Reproduced the real bug: an enemy unit standing at its spawn
  point (inside the base's gate) was out of melee reach of an attacker at
  the base front, which then hit the base: 12 blows on the base, none on
  the unit. `CombatSystem` now targets enemies in the gate before the base;
  checked: the same setup lands every blow on the defender (trample on the
  one behind it) and the base only once both are dead.
- 2026-09-27 (evening): owner: "I was playing the conquest mode but i can
  never win, always lose in the time out damage", suspecting the player
  should get more gold for kills. Read the five campaign logs pushed to
  `playtest-logs/` (17:43-17:58, chapter 1, vs normal, normal, hard,
  normal, easy; all lost; the 10:03 and 10:05 logs are the old five-battle
  prototype).
  - The player out-killed the AI in all five (74-43, 105-21, 92-51, 35-16,
    88-53) and the AI out-earned the player in all five (for example 3602
    vs 2708 gold, and 3126 vs 2695 on easy). The AI's own income alone
    (1613-2237 gold, 2-5 gold/s) beat the best Stone-age Mine (1.2 gold/s at
    level 5) several times over, and in three battles it beat everything the
    player earned. The player's army was 0-1 units at most snapshots.
  - The AI's base was untouched (1000; 965 in one battle) when the siege
    guns started at minute 8; the player's was at 166-899. The guns take the
    same share from both bases, so the lower one dies first: the siege
    finished battles that were already lost on the lane. The siege's damage
    growth (units only, not turrets) also favors the bigger army.
  - Cause: the AI's own income was made for skirmish, where the player can
    out-age it; Conquest battles are age-locked. The campaign's simulated
    runs missed it because an AI on the player's side gets that income too.
  - New dev option `GameSceneData.playerAiIncome: false`: an AI plays the
    player's side on a human's economy. Measured with
    `__aowTrain.runMatch`, a hard player AI (Classic, Balanced, Trained)
    against the six Conquest enemy profiles, 24 battles per row: it won
    8 / 0 / 0% of Stone-age battles against easy / normal / hard and 0-4% in
    later ages (hard battles there ended in about 3 minutes, with no AI
    opening).
  - Tried (18 battles per row, Stone age, easy / normal / hard): player
    kill gold x1.5: 22 / 6 / 0%; x2: 67 / 72 / 28% (later-age hard battles
    17-42%); x3: 100 / 89 / 56%; kill gold x2 for both sides: 50 / 17 /
    22%. AI income x0: 72 / 72 / 56%; x0.1: 44 / 50 / 11%; x0.25: 22 / 11 /
    0%. So the player's kills alone can't make up the AI's free income in
    hard battles (every elite, every boss, chapters 4-5), and small amounts
    of free income swing the Stone age hard.
  - Changed (new PROPOSED values, `BATTLE_ECONOMY` in
    `config/conquest.config.ts`): every Conquest battle scales the AI's own
    income x0.1 and the player's kill gold x1.5. New Conquest effect
    `kill-gold` (per side), read by GameScene into `EconomySystem` the way
    `ai-income` is read into `AiIncomeSystem`. Measured (two sets of 24 per
    row, no mutators or relics): 75-92% against easy, 83% against normal,
    63-71% against hard in the Stone age; 63-88% of battles in later ages;
    38% against Grok and 42% against the Iron Admiral. Battles average 6-9
    minutes, so fewer reach the siege guns. Skirmish is unchanged.
  - Checked in the browser (dev server, a real run's `battleSetup`): the AI
    earned 90 gold of its own in 6 minutes (907 in the same skirmish); a
    Clubber kill pays the player 18.75 (was 12.5) and the AI still 12.5.
  - Match logs (version 2) record a Conquest battle's label and effects, and
    the file name says `conquest-vs-<difficulty>`.
  - Not checked: a human playthrough with the new numbers; battles with
    mutators; elites and bosses beyond the two measured.
  - Choice to review: the income cut is a Conquest-only number under the
    owner's "option C" (the AI gets its own income so it can't be starved).
    It keeps 10%, plus its Mine and kill gold, and the siege ends every
    Conquest battle, so it can't stall. Keeping the AI's income whole would
    take about x3 kill gold for the player, and hard battles would still be
    lopsided. Side effect: whatever multiplies the AI's income (the War
    economy mutator, the Sunstone relic's drawback, ascension's +10% a
    level) now multiplies a much smaller number, so those matter less.
- 2026-09-27 (night): the owner's first full Conquest run (ascension 0,
  cleared; logs 18:56-19:39) and one skirmish on hard (Balanced, lost).
  Owner: "in general it was good"; asked about the strategies that won, a
  Stone-age first unit in later ages, the hard skirmish, and a stalemate
  with "infinite gold".
  - Bug fixed: in later-age Conquest battles the AI's first unit was a
    Stone-age one (8 of 15 later-age battles in the logs). On the first tick
    the AI decided before ConquestSystem applied the battle's age, so it
    spent its starting gold in the Stone age. ConquestSystem now has its own
    field in GameScene and ticks before the AIs. Checked (hard AI, ages 1-4,
    five profiles, first 20 s): 16 of 20 battles spawned a wrong-age unit
    before, 0 of 20 after.
  - The run (analysis, nothing changed): 15 won, 3 lost (the first tries at
    the Iron Admiral, General Kessler and the Overmind; each won on the
    retry). The player's head start grew every chapter: starting gold 1.1-2.6x
    the AI's in chapter 1, 2.8x in chapter 2, up to 5x in chapters 3-5
    (Treasury and the other +gold effects scale with the age factor); five
    turrets from chapter 3 (Masons, Watchtower, Siege works) against none;
    income 3-6x the AI's from chapter 3 (camp and relic Mine levels, Market).
    Regular battles got shorter (197-634 s in chapters 1-2, 73-80 s in 4-5);
    four wins took 141 s or less (the Overmind retry 45 s), by spending the
    starting gold on an army at once.
  - Stalemate (Kessler retry, 800 s, won on base HP 147 to 0): gold was not
    the limit (the player held 5-34k for the last five minutes); both sides
    trained as fast as they could. The AI stayed in it on kill gold (58.9k,
    42% of its income, from the player's losses) and its Market (46.8k: in
    an age-locked battle all XP is surplus). The fight sat in front of the
    AI's gate for about six minutes (lane control 0.70 during the siege; 0 =
    player's base, 1 = AI's), but the AI's base took no unit damage apart
    from one breakthrough: attackers hit defenders in the gate before the
    base, and the AI kept spawning into its gate. Same in the first Iron
    Admiral try: the player's army stood at the AI's gate for 75 s (540-615)
    and the AI's base lost only what the siege guns took; the player held
    more of the lane (0.59) and lost to one AI push (621 base HP in 15 s).
  - Hard skirmish (703 s, lost): the player reached every age first and the
    AI followed within 4-14 s; the AI's own income (12.4k) was more than
    everything the player earned (11.5k); it ended with an AI push and its
    special while the player spent on Forge and research after the Modern
    age-up. Owner: hard but not impossible; left as is.
  - Open for the owner: the run's snowball and t=0 all-ins; how a stalemate
    should end (siege guns for the side holding the lane, a gold sink for
    faster training, the Market in age-locked battles).
- 2026-09-27 (night, later): owner decisions on the analysis above.
  - Gate rule reversed (owner: "it makes more sense to do damage to the base
    when ur pushing them in hard"): `CombatSystem.defenderAtGate` removed,
    so a melee attacker at the base front strikes the wall while defenders
    stand inside the gate. `dealSplashDamage` takes the enemy base: units'
    splash (melee tramples in `CombatSystem`, units' shots in
    `ProjectileSystem`, which covers the catapult crew's area shot) also
    hits the base when its body is inside the radius; a shot that hit the
    base directly doesn't splash it again; turret and special shots
    (`hitsBase` false) still hurt only units. Checked with a nearly
    invulnerable defender at the AI's gate, 10 s of attacks: clubber vs a
    defender inside the gate 0 -> 120 base damage (it now hits the wall),
    mammoth vs a defender at the gate edge 0 -> 98 (trample), tank 0 ->
    1050 (shell splash), mech 2576 both times (its shots already hit the
    wall first).
  - Conquest starting limits (owner: starting gold "shouldn't get out of
    hand", "some glory upgrades etc.", "I don't think u should start with 5
    turrets ever ... 1/2 makes sense"): `START_LIMITS` caps the player's
    bonus starting gold at +200 Stone-age gold and starting turrets at 2
    (`capStartingBonuses` in `battleSetup`; the chapter's gold and Gold
    rush don't count). Sources cut (PROPOSED values changed): Treasury +100
    x5 -> +50 x4, War chest 150 -> 100, the Grail's gold 200 -> 100, the
    caravan's war chest 250 -> 100, Deep pockets (Legacy) 100 -> 50, the
    Merchant Prince 300 -> 200. Relic offers and camp upgrades skip what
    would only add capped gold or turrets (camp shows "Capped"). Chapter 5
    now starts at about 2.3x the AI's gold (was 5x). Checked in the browser:
    a run stacked with the Castellan, Watchtower, Siege works, War chest,
    the Grail, Treasury 2, Masons 1, the caravan and ruins events and Deep
    pockets (450 gold and 7 turrets uncapped) starts battles with 200 and
    2; 200 relic rerolls never offered War chest, Watchtower or Siege
    works; camp screenshot checked.
  - Not changed: Master builders and other Legacy unlocks that start
    buildings higher (economy, not the t=0 army); the AI's own building
    caps (its Mine stays far behind the player's in later chapters).
- 2026-09-27 (night, design): owner's answers on the next features,
  recorded in GAME_DESIGN section 15 and planned as Phase 19. Archetype
  paths: Claude's pick (owner: "u choose") is five to start plus the
  Workshop later; a commander tilts offers but must not lock a run.
  Compositions by slot, stop at the first unaffordable unit or a full
  queue. The Mech: player-only, available from the start with more parts
  unlockable, really built visually, parts in five age versions.
  Multiplayer: DEFERRED ("leave it for now"); hosting notes in section 15
  (checked 2026-09-27: Fly.io has no free tier any more; Cloudflare Workers
  with Durable Objects is free up to 100k requests a day, incoming
  WebSocket messages counted 20 to 1). Nothing built.
- 2026-09-27 (night, build): owner said "Go" on Phase 19; built its first
  three items (each its own commit), stopped before the Mech.
  - Multi-buy: Shift+click on a building buys to its stage end, Ctrl (Cmd)
    as many as allowed; Shift/Ctrl on research buys every open tier. One
    request per level; stops at a refusal or a perk to pick. Checked:
    Mine 1 -> 5 (perk), after the perk Ctrl -> 10, -> 15 (Renaissance
    cap); research tiers 0 -> 3 with Forge 11.
  - Keyboard: every battle action goes through the keymap; the old
    per-button listeners (1-5, Tab, A, S, W, 7-9, P, Esc, F, B, G, X, N,
    arrows, A/D) are gone. Changed defaults (PROPOSED): number keys act on
    the open tab (they used to buy units from any tab); tabs Z X C V;
    turret keys Q E R / U / Del on a chosen slot; camera arrows only (A
    both scrolled and aged up); the dev XP cheat moved from X to H. The
    building-perk popup had no keys; popup choices 7 8 9 now pick doctrines
    and perks. `KeyboardControls` listens on the window so it can stop the
    browser's own Tab and F-keys, only while its scene runs, and never
    while the Controls screen is open.
  - Armies: eight compositions by slot, three starting ones (PROPOSED).
  - Checked in the browser, keyboard only: 1 buys; X 1 Q builds, U
    upgrades, 2 U unlocks, 1 Del sells; C 1 Mine, Shift+2 Library to 5, 2
    and 7 pick its perk; V 1 researches; A ages up; S fires; F1 queues
    Melee x2 + Ranged, F2 stops at a full queue, Ctrl+Shift+F4 saves the
    queue, F1 with 50 gold in the Castle age queues one swordsman and
    stops; P pauses, Controls opens from the pause panel, Down Down Enter J
    rebinds the Units tab, Esc closes (still paused), P resumes, J opens
    Units. From the title menu: K opens Controls, Tab, Down, 3 3 2 edit
    Army 2, Esc closes, and the menu's own keys work again. No page
    errors. Screenshots of the HUD tabs, the pause panel and both Controls
    pages checked for layout. A headless AI-vs-AI run still plays through.
  - Not checked: whether browsers' own F-key actions (F1 help, F5 reload,
    F7 caret browsing) are fully stopped: bound keys call preventDefault,
    but headless tests can't show browser UI. Touch devices.

- 2026-09-27 (night, Mech): owner: "Go 5 pieces legs arm arm (arms can
  have 2 functions one each (dual wield, one meelee one range, etc) torso,
  weapon and maybe head? ... I'll leave ur creativity for the firs draft".
  Built the Mech workshop's first draft (GAME_DESIGN section 15 has the
  parts table; all numbers PROPOSED).
  - Data: `config/mech.config.ts` (five slots; 3 legs, 3 torsos, 3 heads,
    5 arms; tiers, costs, Forge locks), `entities/mechDesign.ts` (a design
    becomes a `UnitDefinition`; the unit id spells out the design and age,
    `mech:<age>:<legs>:<torso>:<head>:<left>:<right>`, so
    `getUnitDefinition` rebuilds it anywhere). Still one `Unit` class; new
    optional data on `UnitDefinition`: `armor` (base damage taken),
    `bodyHeight`, `secondaryAttack` (the second arm, fires on its own
    cooldown at anything in reach, even while walking; `CombatSystem`) and
    `baseDamageMult` on an attack (the drill).
  - Art: `art/mechDraw.ts` draws every part in five age looks (stone
    golem, castle iron, renaissance brass, modern olive, future white with
    a team glow) with walk, attack (per arm: smash, thrust, recoil, brace)
    and a collapse; `utils/MechArt.ts` makes rig sheets per design (drawn
    when a build starts, only for the side that builds, freed when no
    longer used) and the Workshop preview. `/artlab.html?mechs` shows
    designs in every age.
  - `systems/MechSystem.ts`: listens for `build-mech-requested` and
    `unit-died`, emits `mech-changed` and `unit-spawned`. Pays up front,
    builds beside the unit queue, walks the Mech out when the gate is
    clear; one Mech per side building or alive; player only
    (`MECH.sides`). Two new events in Appendix A.
  - `ui/WorkshopPanel.ts`: the fifth HUD tab (tabs narrowed to 92 px):
    preview, one card per part with arrows, cost / HP / damage / build
    time, a Build button that shows why it can't build, then the build's
    progress, then "Mech in battle". Keys: B opens it, 1-5 choose a card,
    Q / E switch the part, R builds. **Changed default:** the background
    key moved from B to Y.
  - Fix on the way: freeing rig sheets (age-ups, and now Mechs) could
    remove a texture a death animation was still showing (WebGL
    "glTexture" error, seen when a new Mech build started right after the
    old one fell). Sheets still shown on screen are now kept until the
    next release. And aura pulses play the attack animation only for
    utility units (a Mech's head aura would have swung its arms).
  - **PROPOSED values changed while tuning:** core HP 600 -> 400, every
    part's price x1.5 (listed in section 15), armor of the hull and shield
    0.85 -> 0.9. Why: headless check, Mech vs an equal-gold stream of the
    same age's melee, ranged and heavy units (no turrets): before, it won
    with 55-80% HP left in every age; now about 20-55% (tank builds, with
    treads, hull and shield, reach the enemy gate). The same gold in
    normal units about breaks even in that test.
  - Checked in the browser (dev server, Playwright): B, 5, E switch the
    right arm and the design is kept; R with no gold does nothing; R
    builds (345 then, 520 now at default); a second R is refused while
    building; the Mech walks out, fights a Stone-age pack, falls, and the
    Workshop frees up. With the Normal AI: a build carries on through an
    age-up (the HUD rebuilds on the Workshop tab), a Modern
    Stompers/Reactor/Beacon/Drill/Launcher Mech with Forge 20 builds,
    walks to the enemy gate and drills the base (2100 -> 957). No page
    errors after the fix. Screenshots of the Workshop tab (Stone and
    Modern), the lane and the Controls screen checked for layout.
    Typecheck and build pass. Headless AI-vs-AI runs still play through,
    and a Mech builds and fights in headless mode.
  - Noted for the owner: the Repair beacon heals the Mech itself only
    about 10 HP/s in the Stone age (15 per 1.5 s, times the age factor);
    small next to its HP, meant more for the army around it.
  - Not built: refit of a Mech on the lane (section 15's plan); Conquest's
    Workshop path; the AI doesn't react to a Mech in any special way.
    Not checked: a real match played by hand with a Mech, Conquest battles
    with a Mech, touch devices.
- 2026-09-28 (night, owner asleep; Phase 20): the owner's list, done in
  order, each its own commit on `claude/youthful-ptolemy-su6zli` (pushed,
  not merged to main: the owner asks for that).
  - **Mech parts**: Striders (legs, +200 HP, walks 60% faster), Armory
    (torso, +500 HP, guns 35% faster), War siren (head, enemies nearby 20%
    slower) are open to everyone, so every slot has three or more; the
    Forge parts stay. Art in five ages; Mech frames 4 units taller for the
    Striders. Headless check (Mech vs an equal-gold stream): the new
    designs win with 30-70% HP left, like the others; the siren was
    stronger at 25% and is 20% now.
  - **Conquest archetype paths** (GAME_DESIGN 15 has the reward table):
    six paths, tags on relics, camp upgrades, commanders and run-long event
    rewards; offers lean (weight 1 + owned, max 4), never one path only,
    one keystone per run and per offer; camps show the general upgrades
    plus a leaning pick of path upgrades. Behaviour rewards set
    `SideState.traits` and the owning systems apply them (prices and
    training, lifesteal, first strike, base damage, piercing shots, marks,
    ricochets, turret damage and veteran levels, the Mine's growth or
    closure, money income, the Mech's price, build time and Forge needs).
    New stat `shotDamageTaken`; side modifiers can target `only` or
    `exclude` the Mech; `unit-died` names the killing turret; new event
    `shot-bounced`. **PROPOSED changes from the plan** (section 15 lists
    them): Colossus priced instead of capped, Momentum instead of Trample,
    Veteran crews every 15 kills. Checked: `tools/checks/paths.mjs`; the
    campaign screens (commanders with paths, a camp offer, a keystone
    offer) in screenshots; a headless AI-vs-AI battle with every trait on.
  - **Turret icons**: the Turrets tab showed placeholder squares; now the
    real turret (mount plus head at rest, team colors, level), trimmed to
    its pixels. Checked in all five ages.
  - **Shots from the weapon**: shots flew level from the front edge at
    26 px. Each ranged unit's attack now has a `muzzle` measured from its
    art (the drawing marks its release point; `/artlab.html?muzzles`), and
    shots fly from there toward the nearest enemy's middle. The catapult's
    point is set by hand (its arm is cocked back at the release frame).
    AI-vs-AI runs after the change: 9 matches, mostly long and even, like
    before.
  - **Effects rehaul** (GAME_DESIGN 13, "Art and feel"): streaks and
    glows on every projectile, muzzle flashes, slashes and sparkles,
    layered explosions, dust rings on deaths, a sky flash for specials,
    ricochet streaks, an age-up flare. Colored flashes blend normally
    (additive washed them to white on bright skies). Checked with
    slow-motion screenshots (`tools/checks/effects.mjs`) and staged fights
    in every age. Frame rate in this sandbox's software renderer: the same
    with and without the new effects (12-14 fps both ways, the renderer's
    own limit); not measured on real hardware.
  - Handoff: "Start here" at the top of this file, `tools/checks/` (the
    browser checks, with a shared Playwright helper), README and CLAUDE.md
    notes.
  - Not checked: a match played by hand, touch devices, frame rate on real
    hardware with many units. Not built: Mech refit, a Workshop commander.
