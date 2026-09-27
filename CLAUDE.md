# CLAUDE.md

Guidance for Claude Code / Cowork when working in this repo. Read this, then
`docs/GAME_DESIGN.md`, then `docs/IMPLEMENTATION_PLAN.md`, before writing
gameplay code.

## What this project is

An Age of War-inspired lane-defense game with its own twists, built with
Phaser 3, TypeScript and Vite. Two bases face each other across a single
horizontal lane. You buy units and turrets with gold, earn XP from kills to
advance through five ages, and use a cooldown special attack. Placeholder art
is generated at runtime; no external assets yet.

Where things live:

- `docs/GAME_DESIGN.md`: what the game is. Decisions are tagged LOCKED,
  PROPOSED or DEFERRED. Respect the tags.
- `docs/IMPLEMENTATION_PLAN.md`: the phased build order, event catalog, data
  shape sketches and a session log. **Start there to find the next task.**
- `README.md`: setup and a short overview for humans.

## Working agreement with the owner

- **Discuss features before building them.** The owner prefers back-and-forth
  on design. If something isn't covered in `GAME_DESIGN.md`, ask instead of
  inventing. Don't add features from the DEFERRED list (factions, turret
  targeting options, forward turrets, investment buildings, and so on).
- Work phase by phase in the plan's order. Keep the game runnable at the end of
  every phase.
- When a design decision is made or changed, update `GAME_DESIGN.md` in the
  same session. When you finish work, tick the plan's checkboxes and add a
  Session log entry.
- Never change a LOCKED decision on your own. Mention any PROPOSED value you
  change in the Session log.

## Design rules that shape the code

These come from the locked design, so the code must not contradict them:

- **Five units per age, by slot:** 1 melee, 2 ranged, 3 heavy, 4 economy,
  5 utility. The utility role varies by age.
- **Economy units** produce gold while alive and apply a stacking penalty to
  the owner's other units while alive.
- **Turrets** exist on the base only, always target the front-most enemy in
  range, keep their stats through age-ups (no auto-upgrade), and can be
  upgraded and sold.
- **The enemy AI acts through the same rules** (owner, 2026-09-26: except
  that it gets its own difficulty-scaled income, `systems/AiIncomeSystem.ts`,
  so it can't be starved) and uses the same `*-requested`
  events as the player. It never edits state directly.
- Both sides use the same `SideState` shape, so nothing is written twice for
  "player" and "enemy".

## Architecture rules

- **Entities vs systems.** `src/entities/` holds objects with state and a
  sprite (`Unit`, `Base`, `Turret`, `Projectile`). `src/systems/` holds rules
  that act on entities (combat, spawning, economy, turrets, status effects,
  age progression, special, AI). Don't put game rules in entity classes and
  don't give systems their own sprites.
- **Data-driven content, behavior via optional blocks.** Units are one `Unit`
  class. What a unit does is decided by optional blocks on its
  `UnitDefinition` in `entities/unitDefinitions.ts`: `attack`, `income`,
  `allyPenalty`, `utility`. Melee vs ranged vs heavy is just different data
  (range, speed, HP, projectile). Adding a unit or an age means adding rows,
  not classes. Add a subclass only when behavior genuinely can't be expressed
  as data, and say why in the Session log.
- **One mechanism for stat changes.** Anything that changes a unit's stats
  (economy penalty, slow, buff, shield) goes through `systems/statusOps.ts`
  (`applyModifier`, `removeModifier`, `grantShield`, `setSideModifier`);
  `StatusSystem` expires timed modifiers and applies side-wide ones to new
  units. Read effective stats through the unit's single accessor
  (`unit.getStat`), never `definition.damage` directly in gameplay code.
- **One mechanism for damage.** All damage goes through
  `systems/damageOps.ts` (`dealUnitDamage`, `dealSplashDamage`,
  `dealBaseDamage`), which spends shields first and marks dead units;
  `CasualtySystem` reports `unit-died` and releases them at the end of the
  frame. Don't release units or emit `unit-died` anywhere else.
- **Event-driven communication.** Systems talk through `utils/EventBus.ts`
  (`Phaser.Events.EventEmitter`), not by holding references to each other.
  UI and AI emit `*-requested` events; the owning system validates and acts,
  then emits a notification. The event catalog is in
  `docs/IMPLEMENTATION_PLAN.md` Appendix A. **Adding an event means adding a
  row there** with its payload.
- **Gold and XP only change through helpers.** Use `state/economyOps.ts`
  (`addGold`, `trySpendGold`, `addXp`, `spendXp`), which mutate a `SideState`
  and emit `gold-changed` / `xp-changed`. Never assign to `gold` or `xp`
  directly.
- **Object pooling for anything that spawns repeatedly** (units, projectiles,
  damage numbers, effects). Use `utils/ObjectPool.ts` or a pooled
  `Phaser.GameObjects.Group` (`get()` / `killAndHide()`), not create/destroy
  per spawn.
- **State machines for modes.** Units: `idle -> walking -> attacking -> dead`.
  Match: `pre-game -> playing -> paused -> gameover`. Use an enum and a
  switch, not a pile of booleans.
- **Factory for spawning.** Units are built by `UnitFactory.create(unitId,
  side)` from the definitions, never inline in a system.
- **`MatchState` passed by reference, no singletons.** Gold, XP, age, turrets
  and cooldowns live in `state/GameState.ts` and are handed to scenes and
  systems explicitly. No `SomeManager.instance`; restarting a match must be
  able to rebuild everything from a fresh state.
- **HUD is a separate parallel Scene** that listens to EventBus events. It does
  not poll game state each frame.
- **Tunables live in `config/`.** Costs, cooldowns, penalties, XP thresholds,
  refund percentages and AI difficulty are data, not literals scattered in
  systems.

## Conventions

- TypeScript strict mode is on (also `noUnusedLocals` / `noUnusedParameters`).
  Don't silence errors with `any`. If a type is awkward, the data shape
  probably needs a proper interface.
- Use the path aliases (`@entities/*`, `@systems/*`, `@ui/*`, `@state/*`,
  `@utils/*`, `@config/*`) instead of deep relative imports. `tsconfig.json`
  and `vite.config.ts` must stay in sync when adding an alias.
- No external sprites or audio yet. Unit, turret, base and projectile textures
  come from `utils/PlaceholderArt.ts`; gameplay code refers only to sprite keys
  (plus `textureKeyFor(key, side)`), so real assets can replace them later.
- **The UI uses the Kenney "Fantasy UI Borders" pack** in
  `src/ui/kenney_fantasy-ui-borders/` (CC0, white artwork, tint it). Load
  pieces through `ui/kenneyUi.ts` (`UiTextures`, `addPanel`, `UiColors`); to use
  a new piece, import it there with `?url`. Plain frames are index 015 in each
  set. Prefer these over hand-drawn UI boxes.
- Do not run `git init` or push until the owner asks.
- When adding a system, state what events it listens for and emits, and update
  the event catalog.

## Verifying your work

- `npm run typecheck` and `npm run build` must pass at the end of every phase.
- Check behavior in a real browser (`npm run dev`, or headless
  Chromium/Playwright screenshots where available). Typechecking alone does
  not prove gameplay works.
- In dev builds the game exposes a debug handle (`window.__aow`, see
  `utils/debug.ts`) with the match state, the event bus and cheat helpers, so
  behavior can be driven and inspected without clicking. Keep it out of
  production builds. For automated checks and balance tuning, use
  `__aow.restart({ ai: 'off' })` for a clean lane (or `{ ai, playerAi }` for
  AI-vs-AI runs; open the page with `?ai=...` to skip the menu) and
  `__aow.step(ms)` to run the simulation in fixed steps without rendering
  (hundreds of simulated seconds per real second). Unit stats can be patched
  live from the page by importing `/src/entities/unitDefinitions.ts` (the dev
  server shares the module instance) to try tuning variants without editing
  files.
- Browser checks live in `tools/checks/` (Playwright against the dev
  server): `mech.mjs`, `paths.mjs`, `effects.mjs` (slow-motion effect
  screenshots), `muzzles.mjs` (re-measure shot origins after changing
  ranged art). `__aow.fxTimeScale(k)` slows the effects for review.
- Report honestly what you ran and what you didn't.

## Repo notes

- `src/main.ts` exists as of Phase 0. `?gallery` on the dev URL opens a
  dev-only viewer of all placeholder textures; `/artlab.html` shows the rig
  art (units, `?turrets`, `?buildings`, `?mechs`).
- The project is a git repository now (the owner's GitHub). Commit and push
  only when the owner asks, to the branch you are given.
- Art is drawn in code (`src/art/`); `utils/RigArt.ts`, `TurretArt.ts`,
  `BaseArt.ts`, `BuildingArt.ts`, `FxArt.ts` turn it into textures on
  demand. Gameplay code still refers only to texture keys.
- Prototypes (2026-09-26) are behind switches in `config/features.config.ts`
  and live in `systems/experimental/` and `ui/experimental/`. Keep new
  experiments the same way: own files, wired only when the switch is on.
- `?headless` (dev) simulates without drawing; `tools/train-ai.mjs` trains
  AI genomes by self-play (README, "Training an AI profile").
