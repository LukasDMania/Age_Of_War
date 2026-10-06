# Age of War Clone

A Phaser 3 + TypeScript + Vite lane-defense game inspired by Age of War, with
its own twists. Two bases face each other across a single lane. You buy units
and base turrets with gold, earn XP from kills to advance through five ages,
and fire a cooldown special attack.

**Status:** all planned phases (0-13) are in, ready for playtesting: units that walk, block, shoot and fight (with
splash, hit flashes and damage numbers), gold and XP from kills, a HUD with a
Units tab (buy, training queue) and a Turrets tab (unlock slots, build and
sell turrets), a special attack per age, a status-effect system (stat
modifiers and shields), all five ages (Stone, Castle, Renaissance, Modern,
Future) with their units, turrets, specials and placeholder looks, money
units that earn gold at a cost to the army, and utility units that heal,
bombard, slow, buff or shield, turret upgrades, an enemy AI with easy,
normal and hard presets that plays by the player's rules, a title menu,
pause and game-over screens with restart, passive income, and some game
feel (screen shake, age-up banners). Numbers are first-pass and meant to be
tuned from playtests. See
`docs/IMPLEMENTATION_PLAN.md` for the build order and progress.

Since then: buildings behind the base (Mine, Library, Forge; five levels per
age) and Forge research, code-drawn art for every unit, turret, base,
building and projectile, an age-themed UI, AI profiles (including AIs
trained by self-play), and switchable prototypes (building perks, Barracks /
Shrine / Market, veterancy, age doctrines, War Cry, a money-unit rework, age
catch-up, and Conquest: a roguelite campaign through all five ages with
commanders, relics, camps, events, bosses and a Legacy tree).
`docs/OVERNIGHT_NOTES.md` summarizes the latest sessions.

## Setup and running

You need Node.js 18 or newer. In the project folder:

```bash
npm install
npm run dev
```

`npm run dev` opens http://localhost:5173 with hot reload. If `node_modules`
was created on another operating system, delete it first, then run
`npm install`. Other scripts: `npm run build` (typecheck + production build),
`npm run typecheck`, `npm run preview`.

## Playing online (1v1)

In the game: press **O** (Online) in the menu. One player hosts (**H**) and
gets a 4-letter room code; the other joins (**J**) and types it. The host
picks the mode first (**M**: a normal battle or a Mech duel, arrows for the
duel's age) and plays the left side.

### Putting it online (Cloudflare, free)

One Cloudflare Worker serves the game and runs the relay that pairs
players (`wrangler.toml`, `tools/relay/worker.mjs`). Once:

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. In the project folder: `npm install`, then `npx wrangler login` (a
   browser window asks you to allow it).
3. `npm run deploy`. It builds the game and uploads it; the first time,
   Cloudflare may ask you to pick a `workers.dev` subdomain in its dashboard
   (Workers & Pages). It prints the address, like
   `https://age-of-war.<you>.workers.dev`: send that to a friend.

After changing the game, `npm run deploy` again; both players then reload
the page (different versions refuse to play each other). `npx wrangler
tail` shows the relay's log (rooms hosted, joined, dropped). The free plan
covers friends-scale play (noted 2026-09-27: 100,000 requests a day, and
WebSocket messages count 20 to 1; a match sends about 60 messages a
second, so roughly 9 hours of play a day).

### Without Cloudflare (same network)

On one PC: `npm run relay` (port 8787) and `npx vite --host`. Both players
open `http://<that PC's address>:5173`; the lobby finds the relay on the
same machine. `?relay=ws://host:port/relay` points the lobby at another
relay. Without another person, `?loopback=80` (dev) plays the online rules
against a pretend opponent 80 ms away.

## Trying it out

The title menu comes first: pick Easy, Normal or Hard (click, or
Left/Right / `1`-`3`) and press Play (or Enter). You are blue, on the left,
with 100 gold. Both sides also earn passive income: 2 gold per second in the
Stone age, times the age factor later (about 4, 10, 21 and 46 gold/s).

- **Units tab** (bottom panel, `Z`; keys `1`-`5`): units are paid for when queued,
  train one at a time (up to 5 in the queue) and walk out of your base.
  Clubbers beat massed slingers, mammoth riders trample massed clubbers, and a
  mix beats any single type.
- **Turrets tab** (click it, `X`, or `Tab` to cycle): unlock more slots (100, 200, 350,
  550), build one of your age's three turrets in an empty slot (Stone: Spear
  Thrower, Boulder Thrower, Fire Pot Lobber), upgrade it up to three times,
  or sell it for half its price plus a quarter of what you spent upgrading.
  Turrets shoot the enemy closest to your base, and keep their stats (and
  their upgrades) when you age up. By keyboard: `1`-`5` choose a slot,
  `Q`/`E`/`R` build, `U` upgrades (or unlocks), `Del` sells.
- **Buildings** (`C`) and **Research** (`V`): the number keys upgrade the
  card with that number. Shift+click (or Shift+number) buys a building's
  levels up to the end of its stage, Ctrl+click as many as you can afford;
  Shift on research buys every tier the Forge allows.
- **Workshop** (`B`): design and build your own Mech from five parts (legs,
  torso, head, left arm, right arm; each arm is its own weapon or tool).
  `1`-`5` choose a part, `Q`/`E` switch it, `R` builds. One Mech at a time;
  it is expensive and takes a while to build, and the better parts need a
  Forge level. The design is kept between matches.
- **Special** (button on the right, or `S`): a shower of strikes over the
  enemy army (meteors in the Stone age), then a 45 second cooldown.
- **Age up** (button next to the XP bar, or `A`): spend the XP shown to move
  to the next age and its units, turrets and special. Units on the lane and
  built turrets stay as they are.
- Shots fly in a straight line and hit the first enemy in their way (or the
  enemy base).
- **Money units** (slot 4, e.g. the Trader): earn gold every second while
  alive, but each one makes your other units 10% weaker and slower (down to
  half at most). The HUD's "Money" row shows both. Money and utility units
  follow your army instead of leading it, and your fighters walk through
  them.
- **Utility units** (slot 5) support the army, and their job changes per age:
  the Shaman heals, the Catapult Crew lobs splash shots, the Alchemist slows
  enemies, the Officer boosts damage and the Shield Drone hands out shields.
  Colored pulses show when they act.
- Kills earn gold (about 1.2x the unit's cost) and XP. The red enemy is an AI
  that buys units, turrets, upgrades and ages up with the same gold and XP
  rules as you (normal difficulty by default). Destroy its base to win;
  then play again from the game-over panel.
- `?ai=easy`, `?ai=normal`, `?ai=hard` or `?ai=off` in the URL skips the
  menu and starts a match against that enemy (`off` = nobody plays it). The
  top-right panel shows the enemy's age and difficulty.
- **AI profiles**: on the title screen, `Q`/`E` (or the arrows) pick the
  enemy's strategy: Classic (default), Balanced, Warlord, Turtle, Economist,
  Tactician, and trained ones. `?profile=turtle` in the URL does the same.
- **Experiments** (title screen, top right) switches the prototypes on or
  off for your browser. **Conquest** (title screen, or `C`) opens the
  roguelite campaign.

- **Armies**: `F1`-`F8` queue a saved unit composition (by slot, so it
  works in every age); queuing stops at the first unit you can't afford or
  when the queue is full. `Ctrl+Shift+F1`-`F8` saves what is training now.
- **Controls** (title screen, `K`, or the pause panel): rebind every key
  and edit the eight armies. Kept per browser.
- `P`, `Esc` or the `II` button at the top pauses. The pause panel has
  Resume, Restart, Controls and Main menu (keys Enter, `R`, `M`). When a base falls,
  a Victory/Defeat panel shows the match stats with Play again and Main menu.
- `F` cycles the speed: 1x, 2x, 4x, 8x (dev server only).
- `G` adds 100 gold, `H` adds 100 XP and `N` ages up at once (dev server
  only).
- The arrow keys scroll the view (A/D no longer do: `A` is age up).
- `http://localhost:5173/?gallery` shows every generated placeholder texture,
  age by age, plus the bases of every age.
- The browser console has `window.__aow` (dev server only). A few highlights
  (the full list is `DebugHandle` in `src/utils/debug.ts`):
  - `__aow.snapshot()`: every unit (with effective stats, shield, modifiers)
    plus each side's gold, XP, base HP, queue and turrets.
  - `__aow.buy('stone-slinger')`, `__aow.buySlot()`,
    `__aow.buyTurret(0, 'stone-spear-thrower')`, `__aow.upgradeTurret(0)`,
    `__aow.sellTurret(0)`,
    `__aow.special()`: the same requests the HUD sends. `__aow.ageUp()` tops
    up XP and ages up; `__aow.turretStats()` shows live turret stats;
    `__aow.kill(id)` removes a unit and `__aow.damage(id, 50)` hurts one.
  - `__aow.spawn('stone-mammoth-rider', 'enemy')` adds a free unit (ids are in
    `src/entities/unitDefinitions.ts`); `__aow.addGold()` / `__aow.addXp()`.
  - `__aow.modify(id, 'speed', 0.5, 3000)`, `__aow.unmodify(id, modId)`,
    `__aow.shield(id, 50)`, `__aow.setSideModifier('player', 'damage', 0.5)`.
  - `__aow.restart({ ai: 'off' })` starts a fresh match with no enemy AI
    (`{ ai: 'hard' }` for a difficulty, `{ playerAi: 'easy' }` lets an AI
    play your side too, for AI-vs-AI tuning);
    `__aow.step(10000)` runs 10 simulated seconds instantly;
    `__aow.damageBase('enemy', 5000)` ends a match; `__aow.stats()` shows
    the numbers the game-over panel will report;
    `__aow.setSpeed(4)` fast-forwards in real time; `__aow.bus` is the bus.
- `npm run typecheck` and `npm run build` must pass before a phase counts as done.
- `http://localhost:5173/artlab.html` (dev server) draws the rig art for
  review: `?age=2`, `?kinds=knight,tank`, `?anims=walk,attack`, `?scale=2`,
  `?bounds` (measured frame boxes), `?turrets`, `?buildings`, `?mechs`
  (Mech designs in every age; `&design=walker,frame,visor,fist,launcher`).
- `tools/checks/*.mjs`: browser checks and effect screenshots against the
  dev server (Playwright; see `tools/checks/_lib.mjs`). `/artlab.html?muzzles`
  measures where ranged units' shots leave their art.
- `?headless` (dev server) simulates without drawing, for fast automated
  runs; `window.__aowTrain.runMatch(...)` plays a whole match
  (`src/dev/trainHarness.ts`).

### Training an AI profile

`tools/train-ai.mjs` evolves AI genomes by self-play in headless Chromium
(needs Playwright: `npm i -D playwright && npx playwright install chromium`,
or set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH`):

```bash
node tools/train-ai.mjs --generations 30 --population 20 --workers 3 \
  --id trained --label "Trained" --publish
```

It builds a dev bundle into `training/build`, logs each generation to
`training/<id>/log.jsonl` (resumes from `state.json`), writes the winner to
`training/<id>/champion.json`, and with `--publish` adds it to
`src/config/aiTrained.json`, where it shows up as a menu profile. Other
options: `--fitness aggressive` (rewards pushing the front and quick wins more), `--seed-hof`
(start from the champions of earlier runs), `--minutes` (match time limit),
`--no-build`.

`node tools/ai-ladder.mjs` plays every profile against every other (both
sides on hard by default; `--difficulty`, `--games`, `--profiles
classic,warlord`) and prints who beats whom.

## What makes it different from the original

- **Five units per age** instead of three. Slots 1-3 are combat units, slot 4
  is a **money unit** (expensive, earns gold while alive, but weakens your
  other units while on the lane), and slot 5 is a **utility unit** whose role
  changes each age (heal, area damage, slow, buff, shield).
- **Expanded turrets** on the base: buy extra slots, pick from several turret
  types per age, and upgrade them. Turrets keep their old stats when you age
  up, so you can keep investing in cheap early turrets or switch to newer
  ones later.
- Everything else follows the original: single lane, kills give gold and XP,
  XP pays for age-ups, cooldown special attack, front-first turret targeting.

Full details: `docs/GAME_DESIGN.md`.

## Structure

- `src/scenes/`: Boot, Preload, Menu (title and difficulty), Game, Conquest
  (prototype campaign screen), and the dev-only texture gallery.
- `src/art/`: the code-drawn art (units, turrets, bases, buildings,
  projectiles and effects); `src/utils/*Art.ts` turn it into textures.
- `src/systems/experimental/`, `src/ui/experimental/`: prototypes, each
  wired in only when its switch in `src/config/features.config.ts` is on.
- `src/ui/`: `HUDScene` (a parallel scene on top of the game),
  `OverlayScene` (pause and game-over panel, on top of the HUD), `UnitBuyPanel`
  and `TurretPanel` (the two tabs), `SpecialButton`, `UiButton`, `HudBar`, and
  `kenneyUi.ts` (loader and panel helpers for the Kenney UI pack in
  `kenney_fantasy-ui-borders/`).
- `src/entities/`: things with state and a sprite (`Unit`, `Base`, `Turret`,
  `Projectile`), the unit and turret definition tables, `UnitFactory`,
  `ProjectileFactory` and `HitEffects` (pooled damage numbers and puffs).
- `src/systems/`: the rules layer (combat, projectiles, casualties, lane
  movement, spawning, economy, turrets, special attack, status effects, age
  progression, utility effects, match stats and the enemy AI in
  `AIController.ts`), plus the shared helpers
  `damageOps.ts` and `statusOps.ts`.
- `src/config/`: `ages.config.ts` (ages and their specials), `constants.ts`,
  `projectiles.config.ts`, `ai.config.ts` (AI difficulty presets) and other
  tunables.
- `src/state/`: `GameState.ts` (match state passed by reference) and the gold
  and XP helpers.
- `src/utils/`: `EventBus.ts`, `ObjectPool.ts`, `PlaceholderArt.ts`.
- `docs/`: game design and the implementation plan.

Systems communicate through the event bus rather than calling each other; the
full event list is in `docs/IMPLEMENTATION_PLAN.md`.

## Art

Units, turrets, bases, buildings, projectiles and effects are drawn in code
in the "rig" style (`src/art/`), per age and on demand. Older notes:

- A unit listed in `src/config/unitArt.config.ts` is drawn from sprite
  strips in `public/assets/sprites/units/<unitId>/` (frames facing right;
  enemies are mirrored and tinted). It loops its walk animation while
  walking, plays its attack animation on each attack and stands still
  otherwise. Its footprint stays the placeholder's size, so art never
  changes the balance.
- **Stone Clubber** (test, 2026-09-24): an LPC spear caveman made with the
  [Universal LPC Spritesheet Character Generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/)
  (walk + thrust). Licences are per layer (OGA-BY 3.0 / CC-BY-SA 3.0 /
  GPL 3.0; the hair and spear are CC-BY-SA 3.0 or GPL only), and the artists
  must be credited: see `CREDITS.txt` in its folder, which ships with the
  build. `character.json` there reloads the character in the generator.

The UI is built from the "Fantasy UI Borders" pack by
[Kenney](https://www.kenney.nl) (CC0, `src/ui/kenney_fantasy-ui-borders/`).

## Playtest logs

While running `npm run dev`, every match you play yourself is saved when it
ends (win, loss, restart, quit or closing the tab) to
`playtest-logs/<date>_vs-<difficulty>_<result>.json`: what both sides bought
and built and when, gold and kills, and a snapshot every 15 s of game time.
Production builds don't log.

