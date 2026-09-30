# Game Design

Source of truth for **what the game is**. `CLAUDE.md` says how to build it;
`docs/IMPLEMENTATION_PLAN.md` says in what order.

These decisions came out of a back-and-forth design conversation with the
project owner. Tags used below:

- **LOCKED** — the owner decided this. Don't change it without asking.
- **PROPOSED** — Claude's suggested default, not yet confirmed. Implement it
  as data/config so it is trivial to change, and mention it in the session
  log when you touch it.
- **DEFERRED** — explicitly not now. Do not build it, but don't make choices
  that would make it hard to add later.

---

## 1. Core loop (LOCKED)

- Two bases at opposite ends of **one horizontal lane**, head to head. One
  lane only.
- Units are bought with gold, appear at the owner's base, walk toward the
  enemy base automatically, fight whatever they meet, and attack the base
  when nothing blocks them.
- Kills award gold and XP, like the original. XP pays for age-ups.
- Destroy the enemy base to win. Lose if yours is destroyed.
- The special attack is a cooldown ability, same as the original.

Single-lane detail (PROPOSED): units cannot overlap (except friendly combat
and support units, which pass through each other; see section 4). A unit
stops behind the friendly unit in front of it. Ranged units attack from behind the front line
as long as an enemy is in range. Melee units attack the nearest enemy in
contact range, otherwise the base. New units appear inside their own base's
gate and walk out, so enemy units standing at the gate cannot stop a side
from spawning (changed in Phase 3; they used to appear in front of the base,
where enemies at the gate blocked every purchase).

Combat details:

- **Projectiles fly in a straight line and hit the first enemy they meet**
  (LOCKED, owner 2026-09-23). Units shoot level along the lane: a shot whose
  target died first keeps going and hits the next enemy, or the enemy base if
  nothing is left in the way. Turret shots and special strikes fly straight
  at their aim point and hit the first enemy on that line, or the ground.
  Projectiles never hit their own side.
- Splash deals full damage to every enemy within its radius of the impact
  point (PROPOSED).
- Kill gold is about 1.2x the killed unit's cost, so an even trade pays a
  little (PROPOSED; owner: fine for now, balance later).

## 2. Ages (LOCKED style, 5 ages PROPOSED)

- Age-ups work like the original: XP accumulates from kills; when a threshold
  is reached the player can pay it to advance. The threshold rises with each
  age.
- On age-up, the purchasable roster switches to the new age's five units.
  Units already on the lane keep fighting (PROPOSED, matches the original).
- **Turrets carry over on age-up and keep their old stats.** There is no
  auto-upgrade. Modernising a turret means selling and rebuying it (LOCKED).
- Five ages, placeholder names (PROPOSED): Stone, Castle, Renaissance,
  Modern, Future. Names live in `config/ages.config.ts` only.

Phase 8 details (PROPOSED):

- XP to leave each age: 300, 700, 1600, 3600 (the Future age is final). The
  XP is spent; anything above the price carries over.
- Ages scale by a factor of about 2.2 each (1, 2.2, 4.8, 10.5, 23): costs,
  HP, damage per second, income, kill gold and kill XP. Fights last about as
  long in every age, but a unit of the next age is roughly twice as cost
  effective as the one before, so ageing up pays off.
- On an age-up, units already queued still train (they were paid for), the
  special keeps its remaining cooldown and then fires the new age's special,
  and the base changes its look. The sky and ground follow the player's age.
- Age up with the button next to the XP bar, or the A key.

## 3. Units: five slots per age (LOCKED)

Every age has exactly five purchasable units. The slot decides the role:

| Slot | Role | What it is |
| --- | --- | --- |
| 1 | Combat | Basic melee: cheap and fast (beats massed ranged) |
| 2 | Combat | Ranged: shoots from behind the front line |
| 3 | Combat | Heavy: tanky, slow, tramples the next unit in line (beats massed melee) |
| 4 | Economy | Money-making unit (section 4) |
| 5 | Utility | Support unit whose role **changes per age** (section 5) |

Placeholder roster (PROPOSED — names and roles are the owner's to refine):

| Age | 1 Melee | 2 Ranged | 3 Heavy | 4 Economy | 5 Utility |
| --- | --- | --- | --- | --- | --- |
| Stone | Clubber | Slinger | Mammoth Rider | Trader | Shaman (heal) |
| Castle | Swordsman | Archer | Knight | Merchant | Catapult Crew (AoE) |
| Renaissance | Pikeman | Musketeer | Cuirassier | Banker | Alchemist (slow) |
| Modern | Rifleman | Sniper | Tank | Contractor | Officer (buff) |
| Future | Blade Trooper | Laser Gunner | Mech | Broker Drone | Shield Drone (shield) |

Turrets (rapid, heavy, area) and specials per age (PROPOSED, Phase 8):

| Age | Rapid | Heavy | Area | Special |
| --- | --- | --- | --- | --- |
| Stone | Spear Thrower | Boulder Thrower | Fire Pot Lobber | Meteor Shower |
| Castle | Crossbow Tower | Ballista | Oil Cauldron | Arrow Volley |
| Renaissance | Musket Nest | Cannon | Mortar | Cannon Barrage |
| Modern | Machine Gun | Artillery Gun | Grenade Launcher | Airstrike |
| Future | Laser Turret | Rail Gun | Plasma Mortar | Orbital Strike |

Unit flavor within the rules (PROPOSED): the Pikeman reaches a little
further, the Sniper has the longest range, the Tank and the Mech are heavies
that shoot short-range splashing shells, the Blade Trooper and the Laser
Gunner attack fast for less per hit. The Rifleman fights with the bayonet,
since slot 1 is melee.

## 4. Money unit, slot 4 of every age

LOCKED:

- The 4th unit of every age is an economy unit.
- It is **expensive** and has weak or no combat ability.
- It **produces gold** while alive. Buying one is a bet that you can hold the
  line long enough to earn the cost back.
- **Balancing debuff:** while a money unit is on the lane, the owner's other
  units are weaker. Each living money unit adds to the penalty, which also
  discourages spamming them.
- The "investment building" idea stays open for the future (see section 9).

PROPOSED numbers (all in config, tune in playtests):

- Cost around 2-3x a same-age combat unit; pays back after roughly 60-90
  seconds of survival. Later ages cost and pay more.
- Penalty is **global** (all friendly non-economy units) and stacks
  multiplicatively per living money unit: 0.9x damage and 0.9x move speed
  each, floored at 0.5x. A radius aura was considered and rejected for now
  because everything is bunched in one lane anyway.
- Killing a money unit awards the normal kill gold and XP, optionally with a
  bounty multiplier so the enemy is tempted to hunt them. (Implemented as a
  config knob, currently 1: no extra bounty.)
- Every age's money unit pays back its price in about 77 s (Phase 9).
- Rework 2026-09-27 (switch `moneyUnitRework`, section 14): income grows
  while the unit lives, kills near it pay extra, and its bounty is halved.

Support units (PROPOSED, Phase 9): money and utility units have no attack,
so they don't lead the army. They follow about 140 px (money) or 40 px
(utility) behind the front-most friendly combat unit, never block friendly
units and are never blocked by them; with no friendly combat unit on the lane
they wait just in front of the base. Enemies still stop them and attack them,
so they are safe only while the line holds.

## 5. Utility unit, slot 5 of every age

LOCKED:

- The 5th unit is a utility unit: AoE damage, slowing, healing, etc.
- **The role varies per age**, so aging up changes how you compose your army.

PROPOSED: utility units are fragile, deal little or no direct damage, and are
worth protecting or hunting. Supported effect kinds: `heal`, `aoe`, `slow`,
`buff`, `shield`. The per-age assignment is in the roster table above. Build
the effect kinds as data-driven variants of one system, not as separate unit
classes.

As built in Phase 10 (PROPOSED numbers, all in unit data):

| Age | Unit | Effect |
| --- | --- | --- |
| Stone | Shaman | Heals friendly units within 180 px by 10 every 1.5 s |
| Castle | Catapult Crew | Every 2.5 s, with an enemy within 170 px, a shot that deals 55 to every enemy within 60 px of the hit |
| Renaissance | Alchemist | Enemies within 160 px move and attack at 0.6x speed, lasting 3 s after they leave the range |
| Modern | Officer | Friendly units within 160 px deal 1.25x damage |
| Future | Shield Drone | Every 4 s, friendly units within 160 px gain a 230 shield (up to their max HP) |

Heal and shield include the utility unit itself. Two auras of the same kind
don't stack. Utility units follow 40 px behind the front fighter and keep
pace with it (see section 4, support units).

## 6. Turrets (LOCKED unless tagged)

- Turrets live **on the base only**, as in the original. No forward
  turrets or outposts.
- Targeting is always **front-most enemy in range** (the enemy unit furthest
  advanced toward your base). No targeting options for now.
- Turrets carry over through age-ups with their old stats (see section 2).
- Turrets can be **upgraded**. The intent: you can keep pouring gold into
  cheap low-age turrets deep into the game, or switch to newer turrets later.
  Both must be viable at different times.
- Turrets can be sold for a partial refund, like the original.

PROPOSED details:

- Slots: start with 1 unlocked, buy more up to a cap of 5, each slot costing
  more than the last (100, 200, 350, 550 gold, unlocked in order).
- Each age has three turret types with different jobs: rapid (fast, light),
  heavy (slow, big hits) and area (splash). Roles make buying more than one
  meaningful, given that targeting can't be aimed.
- Upgrades: up to 3 levels per turret, each raising damage and/or fire rate
  with diminishing returns. (Phase 11: 50%, 75% and 110% of the turret's
  price for about 1.44x, 1.79x and 2.04x its damage per second.) Tuning
  target: a fully upgraded turret of age N is competitive with a fresh turret
  of age N+1 for a while, but a fresh turret of age N+2 clearly beats it. If
  nobody ever switches, the cap is too generous.
- Sell refund: a percentage of the base cost plus a smaller percentage of the
  gold spent on upgrades. Defaults: 50% of the price, 25% of upgrade spend.
- **UI** (owner, 2026-09-23): the bottom panel gets Units / Turrets tabs. The
  Turrets tab shows the five slots as cards: unlock the next locked slot,
  build one of the current age's turret types in an empty slot, or sell a
  built turret (refund shown on the button). Turrets appear on the base.

## 7. Special attack (LOCKED: same as the original)

- A player-triggered ability on a cooldown that hits a large area of the
  enemy side of the lane. No gold cost.
- It scales with age and gets an age-themed look (data-driven, one entry per
  age).
- **Shape: a meteor shower, original style** (owner, 2026-09-23): several
  strikes over about two seconds, each landing on a random spot across the
  enemy army and damaging enemy units in a small radius. Later ages reuse the
  same mechanic with their own look and numbers (arrows, cannon barrage,
  airstrike, orbital strike).
- Stone numbers (PROPOSED): 12 strikes over 2 s, 30 damage each in a 36 px
  radius, 75 s cooldown (owner, 2026-09-26; was 45 s), ready at the start of
  a match. Strikes aim at random
  enemy units and never hit the base.

## 8. Enemy AI (PROPOSED)

- The AI is a scripted opponent that plays through the **same buy/upgrade/
  age-up/special requests as the human player**, using the same event names.
  It never mutates state directly.
- **AI income (LOCKED, owner 2026-09-26, "option C"):** the AI does not play
  on the player's economy alone. Each AI-played side earns its own gold and
  XP per second, independent of kills, so it can never be starved into a
  softlock. Rate = base (2 gold/s, 0.5 XP/s) x its age factor x a match-time
  ramp (up to x2 at 30 min) x the difficulty's income multiplier (easy 1,
  normal 1.5, hard 2.5). Numbers PROPOSED. It still shops through the same
  request events. The "no bonus on any difficulty" note below is outdated.
  Conquest battles scale it x0.1 (section 14, "Battle economy").
- Future (owner interest): train the AI with self-play / machine learning,
  then add named strategies (turret-heavy, economy-heavy...). Built on the
  owner's request 2026-09-26 as playtest options (a utility AI, profiles,
  a training tool); Classic below stays the default. See section 13.
- Opening (2026-09-26): each difficulty eases in over the first minutes
  (lower income, army cap, no early heavies); see section 13.
- Difficulty is a preset of tunables: reaction delay, how eagerly it buys
  economy units, its turret build schedule, when it ages up.
- Built in Phase 12 (all PROPOSED): `systems/AIController.ts`,
  presets in `config/ai.config.ts` (`AI_DIFFICULTIES`, default `normal`,
  `?ai=` URL parameter). No gold, XP or stat bonus on any difficulty; the
  difference is reaction time (think every 2 s / 1.2 s / 0.5 s), unit choice
  (easy random, normal and hard counter what the player fields: melee vs
  massed ranged, heavy vs massed melee, ranged vs heavies, kept mixed), queue
  depth (2/2/3), money units (0/1/2, only when its army outweighs the
  player's by 1.6x / 1.25x), utility unit every 6 / 4 fighters (never on
  easy), turrets (1 slot from 150 s / 2 slots from 60 s with one upgrade /
  3 slots from 25 s, upgraded to max and modernised after age-ups), age-up
  delay once it has the XP (40 s / 8 s / 0), and the special (easy 6+ and
  normal 4+ player units, only while they are near its base; hard 3+ units
  anywhere, as soon as it is ready: in AI-vs-AI tests the special timing was
  the biggest single lever). It keeps a reserve of 2x its cheapest fighter before spending
  on turrets or money units, buys only fighters while player units are near
  its base, and sells its best turret when it has no army and cannot afford
  a fighter (a safety net from before passive income; since Phase 13 it also
  fills its whole queue when it has lots of gold banked).

## 8b. Game flow (Phase 13, PROPOSED)

- Title menu first: pick Easy / Normal / Hard (remembered for the session)
  and Play. `?ai=easy|normal|hard|off` in the URL skips it.
- Pause (P, Esc or the HUD's II button) dims the match and shows Resume,
  Restart and Main menu. A falling base crumbles and shakes the screen, and
  after about a second a Victory/Defeat panel shows match time, both ages,
  units trained, kills, losses, gold earned and turrets built, with Play
  again and Main menu. Restart keeps the opponent.
- Game feel: small screen shakes (your base hit, big splashes, a base
  falling; throttled), a screen flash and a big banner when you age up, a
  red notice when the enemy does.

## 9. Deferred (do not build yet)

- Factions.
- Targeting priority options for turrets.
- Forward turrets or outposts anywhere on the lane.
- Investment buildings beyond the Mine, Library and Forge (Phase 14, see
  section 11), e.g. a market. (2026-09-26: the owner asked for ideas;
  Barracks, Shrine and Market exist as a switchable prototype, section 13.)
- Interest on banked gold, caravan-style lump payouts, mid-lane bounties,
  frontline-based income.
- Multiple lanes, campaign, survival/roguelite modes. (2026-09-26: the
  owner asked for roguelite experiments; Conquest mode exists as a
  switchable prototype, section 13.)
- 1v1 multiplayer (owner, 2026-09-27: "leave it for now"). Feasibility and
  hosting notes in section 15; keep new game rules deterministic and
  driven by `*-requested` events so it stays possible.

## 10. Open questions and tunables

These need decisions or playtest tuning. Keep them all in `config/`.

- Are five ages right, and are the names final?
- Base HP, starting gold, kill gold and XP per unit, XP threshold per age.
  (Kill gold set to about 1.2x unit cost in Phase 4, PROPOSED.)
- Passive income: **removed in Phase 14** (owner, 2026-09-26; the Mine
  replaces it). History: on since Phase 13 (owner OK'd, 2026-09-24; was off
  from 2026-09-21). `PASSIVE_INCOME_PER_SEC` = 2 gold/s in the Stone age,
  times the side's age factor (`AgeConfig.scale`: 1, 2.2, 4.8, 10.5, 23), so
  a side that lost its army can always rebuild. With it off, AI matches
  lasted a median 7.5 min, rarely left the Renaissance age and could stall
  with both sides broke; with it on (and the AI spending surplus gold),
  median about 14 min, every match reached the Future age, no stalls in 12.
  To be tuned in playtests.
- Unit training: instant spawn, a per-unit cooldown, or the original's small
  training queue? Built as the default (PROPOSED, Phase 3): pay when queuing,
  units train one at a time for their `trainTimeMs`, up to 5 in the queue
  (`UNIT_QUEUE_LIMIT`).
- Special: cooldown length and damage curve (Stone defaults set in Phase 6).
- Turret slot costs, upgrade costs, sell refund percentages (slot and refund
  defaults set in Phase 5; upgrades in Phase 11).
- Money unit cost, income rate, penalty magnitude, bounty multiplier.
- Final unit and turret names, plus the placeholder art direction.
  Art direction (LOCKED, owner 2026-09-26): code-drawn "rig" sprites in the
  smooth style (shared body parts rotated by code, per-age outfits and
  weapons, team-colored accents). Prototype: `docs/art/rig-demo.html`
  (clubman, slinger, catapult). Not to be built into the game until the
  owner says; gameplay first. (The owner then asked for the Stone age, and
  on 2026-09-26 for all other ages, turrets, bases and effects: built, see
  section 13.)
- Target match length. Owner, 2026-09-24: "it can be around 30 min per
  game". Current AI-vs-AI median is about 14 min (7-34).

## 11. Post-playtest direction (owner, 2026-09-26)

Ideas reviewed from Age of War 2/3:

- **Research upgrades (LOCKED as a feature):** buy stat upgrades with gold,
  like Age of War 2, unlocked tier by tier through Forge levels (tier N needs
  Forge level N). Owner's list: kill gold, support (ranged) range and damage,
  turret range and damage, damage and armor of the other unit types.
  Built in Phase 14, PROPOSED numbers, 5 tiers each, bonuses add up per tier:
  kill gold +10%, melee/ranged/heavy damage +10%, melee/heavy armor -6%
  damage taken, ranged range +8%, turret damage +8%, turret range +5%.
  Tier costs = base x 1 / 2.5 / 6 / 13 / 28 (base 50-70 gold).
- **Buildings (LOCKED, owner 2026-09-26):** Forge, Library and Mine for now.
  Buildings never spawn troops.
  - Placement: a row of buildings behind the base; the player scrolls the
    camera left past their base to see and manage them.
  - Not targetable: enemies can't attack or interact with buildings.
  - Levels are kept on age-up; higher levels are locked behind ages.
  - No selling. Build and upgrade choices are permanent.
  - The enemy AI builds and upgrades them by the same rules.
  - Passive income is removed; the Mine replaces it.
  - Forge unlocks research: each Forge level opens the next research tier.
  - No free starting Mine (owner): a side that never builds one only
    earns from kills and money units.
  - Output scales with the age factor (owner OK'd the "age bonus mult").
  - Built in Phase 14. PROPOSED numbers (all in `config/buildings.config.ts`;
    the level scheme was reworked to five levels per age on 2026-09-26, see
    section 13, so the numbers below are history):
    max level = age number (1-5); Mine 1 / 1.5 / 2 / 2.5 / 3 gold/s and
    Library 0.5 / 0.8 / 1.1 / 1.4 / 1.8 XP/s per level, times the age
    factor; costs Mine 60 / 220 / 800 / 2200 / 5500, Library 80 / 260 /
    900 / 2400 / 6000, Forge 100 / 300 / 1000 / 2600 / 6000.
- **Rejected (LOCKED, do not build):** unit counters/armor types (each unit
  keeps its defined role), army stance (advance/hold), unit cap, walls,
  AI boss units.
- **Special:** stays as it is for now.
- **Difficulty (later, not now):** higher difficulty gives the enemy more
  health and damage, like the original Age of War.

## 12. Playtest round 3 decisions (owner, 2026-09-26)

- Money and utility units follow the same walking rules as everyone else
  (LOCKED): no phasing through units, they queue in the row like a unit
  without an attack.
- Healing/shielding from several utility units must not stack (LOCKED); built
  as one heal / shield refresh per ally per interval.
- Base HP goes up with each age (LOCKED); numbers PROPOSED (1000 / 1500 /
  2100 / 2800 / 3600).
- Turrets stay strong but must not hold forever late game; first pass: weaker
  upgrades and turret research, and lower kill rewards (PROPOSED).


## 13. Overnight session (owner requests, 2026-09-26)

The owner asked for a long unattended session: art for every age, a slower
Stone-age AI opening, effects, a themed UI, a smarter (trained) AI with
profiles to playtest, a building rework, and independent, easily
reversible prototypes for more strategy and replayability. Everything below
is **PROPOSED** unless tagged; the prototypes are behind switches (see
"Prototype switches") so the owner can try each one and turn it off.

### Enemy AI opening (PROPOSED)

The hard AI used to field six units in the first ten seconds and a mammoth
plus eleven fighters by one minute. Each difficulty now has an opening
(`AiOpening` in `config/ai.config.ts`): its own income starts at 20% /
25% / 30% (easy / normal / hard) and eases to full over 5 / 4 / 3 minutes;
its army (alive plus queued) is capped at 2 / 2 / 3 units, growing by
2 / 2.5 / 3 per minute (+1-2 when the player pushes); no heavies before
150 / 100 / 70 s; queue depth 1; no offensive special before 150 / 100 /
60 s. Measured on hard: 3 units at 10 s and 6 at 60 s.

### AI profiles and training (PROPOSED)

The "future: machine learning and named strategies" note in section 8 is
now built as a playtest option; the Classic AI (section 8) stays the
default.

- `systems/UtilityAI.ts` is a second enemy brain. Every think it scores all
  its options (each unit slot, utility and money units, the next level of
  each building, the best research track, turrets, slots, upgrades,
  replacing outdated turrets) from what it sees (army values and mix,
  threat near its base, base HP, payback times), times a **genome** of 38
  named weights (`config/aiGenome.config.ts`). It buys the best option,
  saves up for it, or falls back to the best affordable one. It plays by
  the same requests, the same difficulty presets, opening and caps.
- Profiles (menu: Q/E, or `?profile=` in the URL): **Classic** (section 8),
  **Balanced** (the hand-tuned starting genome), **Warlord** (big armies,
  heavies, few buildings), **Turtle** (turrets, upgrades, research, late
  push), **Economist** (mines, libraries, money units, fast ages),
  **Tactician** (hard counters, keeps a healer close), plus trained
  profiles from `config/aiTrained.json`: **Trained** (balanced fitness)
  and **Raider** (rewards pushing the front and quick wins). In a round
  robin on hard (2026-09-26) Raider scored 96%, Trained 82%, Classic 64%
  and the hand-made profiles 14-52%.
- Training (`tools/train-ai.mjs`): a genetic algorithm over genomes by
  self-play in headless Chromium, against the Classic hard AI, the hand
  profiles and a hall of fame of earlier champions (both sides on hard, so
  only strategy differs). Fitness per match: win 1 / draw 0.5 / loss 0,
  plus 0.3 x base HP margin and 0.4 x front-line pressure (equal AIs often
  stall in the Future age). A final exam picks the champion; `--publish`
  adds it as a profile.

### Art and feel

- Art direction (LOCKED, section 10) is now built for every age (owner:
  "make the art as you've done for the first age for the remaining ages").
  All 25 units, 15 turrets, 5 bases, every projectile and the buildings are
  drawn in code in the rig style.
- **Turrets** get a visible addition per upgrade level (owner: "slight
  additions in sprite coolness"): level 1 reinforcement (bands, plates,
  rivets), level 2 team banners plus an extra part (second barrel, bolt
  rack), level 3 the elite look (gold trim, trophies, glowing parts). Heads
  track their target, recoil and flash.
- **Effects**: projectile trails and per-projectile impacts, scorch marks,
  sparks on melee blows, exploding machines, coins for the player's kills,
  particles on heals/shields/buffs, rubble from bases.
- **Effects rehaul (2026-09-28, owner: "the art style is simple so that's
  fine but a lot of the effects and projectiles can have something more to
  it ... make the visuals look more impressive"; PROPOSED look):** every
  projectile has a motion streak (tracers for bullets, pale streaks for
  arrows, fire tails, energy beams) and fire or energy ones a soft glow;
  units' shots flash at the weapon's muzzle (flare, sparks and smoke for
  guns, a puff and a ground ring for cannons, colored flares for lasers
  and plasma); melee blows draw a slash arc in the age's tint and a hit
  sparkle; every shot that hits a unit sparkles; explosions layer a
  white-hot flare, a cartoon fireball, embers and a smoke column that rises
  after; units fall with a dust ring (heavies more); a special washes the
  sky with its age's color; ricochets streak. Tunables in
  `config/effects.config.ts` (`PROJECTILE_STREAK`, `MUZZLE_STYLE`,
  `SLASH_TINTS`, `SPECIAL_SKY_FLASH`). Shots also leave the weapon on the
  art now (`attack.muzzle`, measured with `/artlab.html?muzzles`).
- **Heavy impact shake** (owner: "more graceful"): Phaser's random jitter
  is replaced by a damped vertical thump (`CAMERA_THUMP` in
  `config/effects.config.ts`) for heavy units' blows and shots, special
  strikes, exploding tanks and mechs, hits on the player's base and a base
  falling, each with a cooldown so a line of heavies stays calm. Turret
  splashes never thump (playtest round 4: mortar fire shook the screen
  constantly). Section 8b's "small screen shakes" now means this thump.
- **Themed UI**: the HUD wears the player's age (Stone dark wood and bone,
  Castle slate and gold, Renaissance burgundy damask, Modern olive canvas,
  Future navy grid; `config/uiTheme.config.ts`) and rebuilds on age-up.
  Fonts Fredoka and Lilita One (SIL OFL, from npm). New title screen with a
  parade of units from all ages.

### Buildings rework (PROPOSED; section 11's LOCKED rules still hold)

Owner: "I don't like how it's just 1 level then you can't interact with
them until you go to the next age." Replaces section 11's PROPOSED
"max level = age number":

- **Five levels per age, 25 in all.** Each age opens five cheaper steps
  (step costs x the tier's age factor, e.g. Mine 40 / 55 / 70 / 90 / 110 in
  the Stone age); output grows steadily per level (Mine +0.4 gold/s at
  level 1, +0.2 per level after, times the age factor; Library 0.25 XP/s
  +0.1). Levels are kept on age-up, and higher levels stay locked behind
  ages (LOCKED rules unchanged).
- Research tier N now needs Forge level 5(N-1)+1 (1, 6, 11, 16, 21); every
  Forge level also gives combat units +1% damage.
- **Staged art**: each building gets a new look every five levels (a
  Stone, Castle, Renaissance, Modern and Future version) and a new prop on
  every level; level-ups bounce the building with dust and sparkles, and a
  new stage flashes.
- **Prototype: Barracks, Shrine, Market** (switch `extraBuildings`; section
  11 LOCKED "Forge, Library and Mine for now", and section 9 DEFERRED more
  investment buildings, so these are only a proposal for the owner to try):
  Barracks trains 2% faster per level (floor 50%) and +1% unit HP per
  level; Shrine recharges the special 1.5% faster and +3% special damage per
  level; Market sells XP you don't need for your next age-up for gold (1.5
  gold per XP, 0.4 XP/s at level 1).
- **Prototype: building perks** (switch `buildingPerks`): every fifth level
  of a building, pick one of two permanent perks (e.g. Mine: +15% mine gold
  or +8% kill gold). A PERK! badge shows on the building until picked.

### Prototype switches

`config/features.config.ts` holds one switch per prototype (all default on,
all PROPOSED); the title screen's **Experiments** button toggles them per
browser (localStorage `aow-features`). Each prototype lives in its own files
(`systems/experimental/`, `ui/experimental/`, its own config) and is only
wired in when its switch is on, so dropping one means turning it off or
deleting its files and the few lines that check the switch.

- `buildingPerks`, `extraBuildings`: above.
- `veterancy`: the fighter of the killing side nearest a kill gets the
  credit; 1 / 3 / 6 kills give ranks with +10% / +20% / +35% max HP and
  +10% / +20% / +30% damage, a full heal, and gold chevrons over the HP bar.
- `ageDoctrines`: after each age-up, pick one of three doctrines from nine
  (e.g. Shield Wall: melee +20% max HP; Volley Fire: ranged attack 15%
  faster; Forced March: all units walk 15% faster). They stack across
  ages. The AI picks what fits its army.
- `warCry`: a second, free ability (W): every 45 s, 6 s of +30% speed and
  +20% damage for the whole army. The AI uses it when its front meets the
  enemy.
- `conquest`: the roguelite mode below.

### Conquest mode (prototype, switch `conquest`)

(First version, 2026-09-26. Replaced by the campaign of 2026-09-27, see
section 14; kept here for history.)

Owner: "experiment with how this game could go beyond just a 1 time play,
with roguelite elements or other options / other stage with higher
difficulty". Section 9 DEFERRED "campaign, survival/roguelite modes"; this
is built only as a switchable prototype for the owner to judge.

- A **run** is five battles (Skirmish, Battle, Battle, Elite, Warlord).
  Before each, pick one of two or three **nodes**: each is a battle against
  its own difficulty and AI profile, with 0-3 **mutators** (Veteran foes:
  enemy +25% HP; Fury; Glass cannons; Gold rush; Fortified: the enemy
  starts with two upgraded turrets; Swift armies; War economy: enemy
  income x1.5; Enemy scholars) and a Glory reward. Later nodes may start
  in the Castle or Renaissance age with extra gold for both sides.
- Win and pick one of three **relics** for the rest of the run (e.g.
  Whetstone: your units +10% damage; Prospector's map: start with a Mine at
  level 3; Watchtower: start with an upgraded turret). Lose once and the
  run ends. No restarts inside a run; pausing offers Retreat (a loss).
- Every win earns **Glory** (the stage's, plus its mutators', plus the
  ascension level), kept between runs and spent in the **Hall of Glory** on
  permanent unlocks: four relic choices, one reroll per run, a random
  starting relic, +100 gold every battle, two more relics in the pool.
- Clearing a run unlocks the next **Ascension** level (up to 10): every
  enemy +8% HP, +6% damage and +10% income per level. This is the owner's
  section 11 "difficulty (later)" idea, kept inside Conquest only.
- Battle setups go through the normal rules (`ConquestSystem`: it grants
  exactly the gold a purchase costs, then sends the usual request). In a
  battle that starts in a later age, the enemy AI skips its Stone-age
  opening. Numbers
  in `config/conquest.config.ts`; progress in localStorage.

## 14. Playtest round 5 (owner, 2026-09-27)

Owner feedback after playing the overnight build, then "don't ask anything,
just go ahead". Numbers PROPOSED unless tagged.

- **Death animation jumped forward (bug, fixed).** Phaser mirrors a flipped
  sprite inside its frame, so every enemy sprite with an off-center origin
  (units, their death strips, turret heads, muzzle flashes) was drawn
  shifted from its real position, and the shift changed at death. Enemy
  art is now an exact mirror of the player's (`utils/spriteOrigin.ts`).
- **Mammoth too strong.** It beat equal gold of clubbers, slingers and
  mixed armies. Now 90 gold (was 80), 240 HP (300), 14 damage (16). Knight
  600 HP (660) and cuirassier 1300 HP (1440), milder. Heavies still edge
  out equal gold of pure ranged units in every age (packed ranged units die
  one by one at the front); not tuned further.
- **Veterancy must not reset HP (LOCKED, owner).** A promotion raises max
  HP; current HP stays as it was.
- **Catapult crew is two units wide** (footprint 60 px instead of 30; its
  art is centered on it). Any unit can now set its own footprint
  (`UnitDefinition.bodyWidth`).
- **Pushing an enemy back to its door hurts its base (LOCKED, owner,
  2026-09-27 night; replaces "units in the gate are hit before the base"
  from the same morning).** Units spawn inside their base's gate, out of
  reach of a melee attacker standing at the base front, so that attacker
  strikes the wall. Splash from units' attacks (heavy tramples, siege and
  tank shells, the catapult crew's area shot) also hits the enemy base when
  its body is inside the splash, so heavies and siege units fighting
  defenders at the gate damage the base too. Turret and special splash
  still hurt only units. Reason (owner): with the morning rule a stream of
  fresh defenders kept a bigger army off the wall ("even if ur at the door
  you will do some damage").
- **Money units** (owner: "rarely valuable; make them more useful but not
  always easy money"; switch `moneyUnitRework`, `MONEY_UNIT_REWORK`):
  income starts at 50% and grows to 200% after 60 s alive (a gold bar under
  the HP bar shows it); enemies killed within 170 px of a living friendly
  money unit pay +35% kill gold per such unit (max +100%); killing a money
  unit pays half the old bounty. The section 4 LOCKED rules (expensive, gold
  while alive, army penalty while alive, same walking rules) are unchanged.
- **Age snowball** (owner: "I go ahead in age before the enemy, then it's
  basically over for them"; switch `ageCatchUp`): per age behind, +50% XP
  from kills and +35% turret damage (both sides); an AI that is behind
  earns catch-up XP to reach its next age within 150 / 100 / 70 s (easy /
  normal / hard) and ages up without delay. Measured: after an early player
  age-up the AI followed in 60 s on normal (was 180 s) and 35 s on hard
  (was 130 s). The AI's own income was already its exception to "same
  rules" (section 8); this extends it.

### Conquest campaign (prototype, switch `conquest`)

Owner: "flesh out the roguelite idea more where it can really be a long
term idea, not a 1 h run idea, more like a 10 h game idea"; "we never get to
the space age". Replaces the five-battle run of section 13.

- **A run marches through history: five chapters, one per age** (Dawn of
  War, Age of Castles, Powder and Sail, The Great Wars, Among the Stars).
  Battles start in the chapter's age and **can't age up** (a per-side age
  cap, `SideState.maxAge`); the campaign moves to the next age after each
  chapter's boss, so every full run ends in the Future.
- **Chapter map:** three columns of three nodes, then a boss. A node leads
  to the neighbouring rows of the next column, so the route matters. Node
  types: Battle, Elite (harder, pays a relic), Camp, Event, Treasure (a
  relic, no fight), and the chapter's **warlord** (Grok the Mammoth King,
  Baron Blackwall, the Iron Admiral, General Kessler, the Overmind), each a
  hard AI with its own rules.
- **Banners** are the run's lives: 3 at the start (5 max); a lost battle
  costs one (a lost boss is fought again), a boss win gives one back, camps
  can restore one. No banners left ends the run.
- **Supplies**, earned by wins (more for a healthy base), buy **camp
  upgrades** for the rest of the run (Drill yard, Armory, Treasury, Masons,
  Surveyors, Smithy, Recruiting office).
- **Events** (10): choices and gambles (mercenaries, a cursed shrine,
  deserters, a fever, a wandering smith, dice, an ambush...).
- **Relics** (21, some rare), after elites, bosses and treasure, with
  rerolls from Legacy unlocks.
- **Commanders** (7) shape a run (e.g. the Warlord: units +15% damage,
  -10% HP; the Castellan: two turrets every battle). Six are unlocked by
  **achievements** (11: win 3 boss fights, reach chapter 3, hold 6 relics,
  reach the Future, lose 3 runs, win a run...).
- **Legacy** (Hall of Glory): 17 permanent unlocks in four tiers bought with
  Glory; a tier opens after enough unlocks (0 / 3 / 7 / 12). **Ascension**
  0-10 as before (a cleared run opens the next level).
- **Siege:** age-locked battles had no tiebreaker (AI-vs-AI chapter
  battles stalled for 20 minutes). From minute 5 all units deal +20% damage
  per minute (up to x3); from minute 8 siege guns hit both bases every 4 s,
  harder each minute. Battles end within about 15 minutes; the side with
  the healthier base wins a stalemate.
- **Battle economy** (2026-09-27, owner: "i can never win, always lose in
  the time out damage"): in every Conquest battle the AI's own income is
  x0.1 and the player's kill gold x1.5 (`BATTLE_ECONOMY`, PROPOSED;
  mutators, relics and ascension multiply on top). The AI's income was
  made for skirmish, where the player can out-age it; in age-locked battles
  it was pure extra money. In the owner's five chapter-1 logs the AI
  out-earned the player in all five while the player out-killed it, the
  AI's base was untouched when the siege guns started, and the siege
  finished the player's already lower base. Details and measurements in
  the session log.
- **Starting limits** (2026-09-27 night, owner: starting gold upgrades
  "shouldn't get out of hand"; "I don't think u should start with 5 turrets
  ever"): the player's bonus starting gold (commander, relics, camp,
  events, Legacy together) stops at +200 Stone-age gold (times the age
  factor), and starting turrets at 2 (`START_LIMITS`, PROPOSED). Smaller
  sources too: Treasury +50 a level (4 levels), War chest +100, the Grail
  +100, the caravan's war chest +100, Deep pockets +50, the Merchant Prince
  +200. Relics and camp upgrades that would only add capped gold or turrets
  aren't offered ("Capped" at the camp).
- Length: a strong run is about 20 nodes and 14 battles (~1.5-2.5 h) and
  earns ~180 Glory; the Legacy tree costs ~1000, so unlocking it takes
  about 6 full clears (10+ hours), with commanders and Ascension beyond.
- Numbers in `config/conquest.config.ts`; state in `state/conquestState.ts`
  (localStorage; runs from the first version are dropped, Glory and
  matching unlocks carry over).

## 15. Next features (owner, 2026-09-27 night)

Discussed after the first full Conquest run. Build order in
`IMPLEMENTATION_PLAN.md` Phase 19 (keyboard, compositions and the Mech are
built, archetype runs since 2026-09-28).

### Conquest archetype runs

- **LOCKED (owner):** rewards should build characterised runs, like
  building a deck around an archetype in Slay the Spire ("look at this
  crazy ranger unit run"): paths for units, turrets and buildings, less
  "your units do more damage in general". Choosing a commander must not
  lock a run into one path.
- **Paths (PROPOSED, Claude's pick, owner: "u choose"):** five to start,
  **Vanguard** (melee), **Marksmen** (ranged), **Juggernauts** (heavies and
  siege), **Bastion** (turrets) and **Guild** (money units, Mine, Market);
  a sixth, **Workshop**, once the Mech exists (its parts and upgrades).
  Utility units and the special show up as support rewards inside paths.
- **Offers lean, never lock (PROPOSED):** every relic, camp upgrade and
  event reward is tagged with a path. A path's offer weight is 1 plus the
  rewards of it you own (at most 4); a commander counts as one owned
  reward of its path, nothing more. Every offer of three includes at least
  one other path. A small pool of untagged rewards stays.
- **Rewards change behaviour, not just numbers (PROPOSED examples):**
  - Vanguard: melee units take 30% less damage from shots; melee units heal
    15% of the damage they deal. Keystone *Horde*: melee costs 40% less and
    trains twice as fast, -30% HP.
  - Marksmen: every third shot pierces one unit; a hit makes the target take
    15% more damage for 3 s. Keystone *Ranger Lord*: ranged costs 30% less,
    melee 50% more.
  - Juggernauts: heavies trample what they walk through; heavy splash deals
    double damage to bases. Keystone *Colossus*: one heavy alive at a time,
    with triple HP and damage.
  - Bastion: rapid turret shots bounce to a second unit; a turret gains a
    level for every 25 kills in a battle. Keystone *Citadel*: turrets deal
    double damage, units cost 25% more. (The two-turret starting cap of
    section 14 still holds.)
  - Guild: money units +50% HP; the Mine makes 4% more for every minute of a
    battle. Keystone *Robber baron*: kills pay double, the Mine is closed.
- Rarity: commons (small behaviour changes), rares, and keystones (define a
  run, always with a price; from elites, bosses and treasure).
- Built as data: new `ConquestEffect` kinds for the behaviours (pierce,
  marks, lifesteal, cost and training multipliers per slot, alive caps,
  turret bounce, turret kill levels, damage to bases), applied by the
  systems that own those rules.
- **Built 2026-09-28 (owner: "Yes continue"; all numbers PROPOSED).** Six
  paths including **Workshop** (the Mech). What changed from the plan
  above while building:
  - Colossus is priced instead of capped: heavies x2 HP and damage (not the
    Mech), cost x2.2, train 60% slower. An alive cap needed the HUD to
    track units; a price says the same ("fewer, bigger heavies").
  - Trample isn't built (units walking through each other needs lane
    rules); Juggernauts got *Momentum* (a heavy's first attack x3) instead.
  - Veteran crews levels a turret every 15 kills (25 was rarely reached in
    a battle); Compound interest is 6% a minute; Blood oath 20%; Shield
    wall 35%. Keystones are one per run, and an offer shows at most one.
  - Offers: rares and keystones only from elites, bosses and treasure, like
    rares before; keystones weigh 0.6 of a normal pick.
  - Camps: the four general upgrades (Drill yard, Armory, Treasury,
    Smithy) at every camp, plus path upgrades: the ones the run already
    has levels in and a leaning pick of others, three or more (at most
    six). Event rewards that last the run carry a path too (Caravan's war
    chest: Guild, Deserters: Marksmen, Ruins: Bastion).
  - Commanders lean: Warlord Vanguard, Castellan Bastion, Merchant Guild,
    Sage Marksmen; Chieftain, Survivor and Conqueror have none.
- The reward set (relics; K = keystone, R = rare):

  | Path | Relics | Camp upgrades |
  |---|---|---|
  | Vanguard | Honed edge, Banner guard, Plate armor, Shield wall (melee take 35% less from shots), R Blood oath (melee heal 20% of damage dealt), K The Horde (melee -40% cost, trains 2x faster, -30% HP) | Recruiting office, Sergeants (melee +8% HP and damage) |
  | Marksmen | Yew staves, Fine fletching, Bodkin points (every 3rd ranged shot pierces a second enemy), R Hunter's mark (ranged hits: target takes +15% for 3 s), K Ranger lord (ranged -30% cost and +15% damage, melee +50% cost) | Archery range (ranged +10% damage) |
  | Juggernauts | R Beast tamer, Siege engines (heavies x2 damage to bases), Momentum (a heavy's first attack x3), K Colossus | Stables (heavies +10% HP) |
  | Bastion | Watchtower, R Siege works, Ricochet (rapid turret shots bounce on for half damage), R Veteran crews (a free turret level per 15 kills), K Citadel (turrets x2 damage, units +25% cost) | Masons, Engineers (turrets +10% damage) |
  | Guild | War chest, Prospector's map, Merchant's ledger, Trade routes (money units +30% income), R Compound interest (Mine +6% a minute), K Robber baron (kills pay x2, Mine closed) | Surveyors |
  | Workshop | Blueprints (Mech parts need 6 fewer Forge levels), Assembly line (Mech builds 40% faster, 15% cheaper), R Titan plating (Mech +40% HP), K Iron titan (Mech +50% HP and damage, 30% cheaper; other units +20% cost) | Mech bay (Mech +10% HP and damage) |
  | General | Whetstone, Thick hides, Old tomes, Heirloom anvil, War drums, Ancestral shield, R War college, R Crown, R Grail, R Sunstone | Drill yard, Armory, Treasury, Smithy |

- How it works in code: behaviour rewards set `SideState.traits`
  (`state/traits.ts`) at battle setup (`ConquestSystem`); the owning
  systems read them (SpawnSystem prices and training, CombatSystem first
  strike, lifesteal, base damage and piercing shots, ProjectileSystem marks
  and ricochets, TurretSystem damage, ricochets and veteran levels,
  BuildingSystem the Mine and money income, MechSystem the Mech). Stat
  rewards stay side modifiers; they can now target `only` or `exclude` the
  Mech. Checked: offers for a Vanguard run show Vanguard relics about 31%
  of the time (16% for a fresh run), never one path only, never two
  keystones; every trait works in a scripted battle.

### Keyboard play, rebinding and compositions

- **LOCKED (owner):** the game is fully playable by keyboard, and every key
  can be rebound. Then compositions like StarCraft control groups (owner's
  example: Shift+F2 queues 2 melee and 3 ranged).
- **Compositions (LOCKED, owner):** made **by slot** (so they keep working
  in every age), any counts. Queued in list order; at the first unit that
  can't be afforded, or when the training queue is full, it **stops**: the
  rest isn't queued.
- Built 2026-09-27 (defaults PROPOSED, all rebindable): one keymap
  (`config/keybindings.config.ts`, changes kept per browser) for every
  battle action. **Number keys act on the open tab**: buy a unit (Units),
  choose a turret slot (Turrets), upgrade a building (Buildings), research
  a track (Research), choose a part (Workshop); Shift / Ctrl pass on for
  multi-buys. Tabs Z X C V B (Tab / Shift+Tab cycle); on Turrets, Q E R
  build the age's three turrets in the chosen slot, U upgrades or unlocks,
  Del sells; on the Workshop, Q / E switch the chosen part and R builds. A
  age up, S special, W War Cry, P / Esc pause, F speed, Y background (B
  until the Workshop took it), arrows scroll (A/D no longer scroll: A ages
  up). Popup choices (doctrines, building perks) 7 8 9. Dev cheats G / H / N (the XP cheat moved off X, now the
  Turrets tab). A hint line next to the tabs shows the open tab's keys.
- Controls screen (title screen, K, or the pause panel): every action by
  group with its keys; click (or Enter) and press a key to rebind, Shift
  adds a second key, conflicts show in red. Armies page: eight
  compositions (Army 1-3 start as Melee x2 + Ranged, Melee + Ranged x2,
  Heavy + Melee x2), built by adding units by slot in any order and
  amount, with Undo and Clear. F1-F8 queue them, Ctrl+Shift+F1-F8 save the
  current training queue as one (Ctrl+F4 would close the browser tab).
  Keys only press the same buttons as clicks, so they emit the same
  `*-requested` events. The title menu and Conquest screens keep their own
  fixed keys.

### Buying several building levels (PROPOSED, built 2026-09-27)

- Owner: "i got tired spam clicking in new games". Shift+click (or Shift and
  the key) buys levels up to the next stage (five) as far as the gold
  goes; Ctrl+click buys as many as it can up to the age's cap. The same for
  research tiers (Shift or Ctrl: every tier the Forge allows). Each level is
  still its own request, checked as today; a multi-buy also stops at a
  building perk waiting to be picked.

### The Mech workshop

- **LOCKED (owner):** a player-only unit you build yourself: very strong
  but not an instant win, expensive, a way to break stalemates. Building a
  Mech is available from the start; better parts and upgrades can be
  unlocked beyond that. You really build a visible thing: the parts you
  pick are what you see. Parts come in five versions, one per age, and
  change look with the age.
- **LOCKED (owner, 2026-09-27):** five pieces: legs, left arm, right arm,
  torso and a head. Each arm has its own function, so two arms can dual
  wield, pair a melee arm with a gun, and so on. The first draft's parts
  were left to Claude ("I'll leave ur creativity for the first draft").
- **LOCKED (owner, 2026-09-28):** at least three parts per body part that
  anyone can build, "so that it really is custom"; more parts come later
  and can be unlocked through other things (Forge levels now; Conquest
  rewards, research and so on later). Built: every slot has three or more
  open parts (Striders, Armory and War siren added), plus one Forge part.
- **Built 2026-09-27 (first draft, all numbers PROPOSED;
  `config/mech.config.ts`):**
  - A **Workshop** tab (key B): a preview of the design in the player's
    age, one card per slot with arrows to switch its part (1-5 choose a
    card, Q / E switch, R builds), and the cost, HP, damage and build
    time. The design is kept per browser. The background key moved from B
    to Y.
  - Parts (Stone-age numbers; tier 1 light, 2 standard, 3 advanced):

    | Slot | Part | Tier | Gold | What it does | Needs |
    |---|---|---|---|---|---|
    | Legs | Walker | 1 | 75 | +300 HP | |
    | Legs | Treads | 2 | 165 | +800 HP, armor (x0.9 damage taken) | |
    | Legs | Striders | 2 | 120 | +200 HP, walks 60% faster | |
    | Legs | Stompers | 3 | 240 | +500 HP, melee arms +30% | Forge 6 |
    | Torso | Frame | 1 | 90 | +500 HP | |
    | Torso | Armored hull | 2 | 210 | +1100 HP, armor x0.9 | |
    | Torso | Armory | 2 | 190 | +500 HP, guns fire 35% faster | |
    | Torso | Reactor | 3 | 300 | +700 HP, weapons +35%, 15% faster | Forge 6 |
    | Head | Visor | 1 | 45 | guns reach +25%, +10% damage | |
    | Head | Command crest | 2 | 120 | allies nearby +15% damage | |
    | Head | War siren | 2 | 120 | enemies nearby 20% slower (move and attack) | |
    | Head | Repair beacon | 3 | 195 | heals itself and allies nearby | Forge 11 |
    | Arm | Fist | 1 | 90 | heavy blows that splash | |
    | Arm | Blade | 2 | 150 | fast cuts | |
    | Arm | Launcher | 2 | 165 | shells that splash, fire on the move | |
    | Arm | Shield | 1 | 90 | +500 HP, armor x0.9, no weapon | |
    | Arm | Siege drill | 3 | 225 | x3 damage to bases | Forge 6 |

  - A core of 400 HP. Cost is the parts' prices x (1 + 0.12 x (total tier
    - 5)), times the age's factor like every unit: the default design
    (Walker, Frame, Visor, Fist, Launcher) is 520 gold in the Stone age and
    about 12k in the Future; a maxed one is the late-game gold sink. Build
    time 15 s plus 2.5 s per tier above 5, beside the unit queue (not in
    it); the Mech walks out when the build is done and the gate is clear.
    One Mech at a time, building or alive; rebuilt at full price when it
    falls. Kill rewards like any unit (1.2x its cost in gold).
  - Arms: the shorter-reach weapon is the Mech's main attack (it decides
    where the Mech stops); the other fires on its own cooldown at anything
    in its reach, even while walking. A Mech counts as a heavy (slot 3) for
    research and counters.
  - Across ages: the design is kept; a Mech is built in the age you are in
    when you press Build, and every part has five looks, one per age (stone
    golem, iron, brass, olive drab, white and glowing). **Refit** of a Mech
    already on the lane is not built yet.
  - Balance check (headless, Mech vs an equal-gold stream of the same
    age's melee, ranged and heavy units, no turrets): the Mech wins with
    about 20-55% HP left; the same gold in normal units about breaks even.
    Tank builds (treads, hull, shield) are the strongest and reach the
    enemy gate. Before the price change (parts 2/3 of these prices, 600
    core HP) it won with 55-80% left.
  - Only the player builds Mechs (`MECH.sides`); the AI doesn't (an
    exception to "the AI plays by the same rules", like its own income).
    Conquest bosses and the Workshop path come later.
- **Hangar (built 2026-09-29, expansion step 1):** the Workshop tab is
  replaced by a full-screen hangar (B, or the Hangar button beside the
  tabs): the Mech large on a gantry in an age room, slot hotspots, a
  parts drawer with hover preview, stat bars, build sheet, 4 blueprint
  slots (T), and the Mech assembled on a scaffold at the gate while it
  builds. PROPOSED: the battle keeps running while the hangar is open.
- **Parts roster and the Special module (built 2026-09-30, expansion
  step 2):** 7 legs, torsos and heads, 11 arms and an optional sixth
  module slot with an active ability on the War cry button, as in
  `docs/MECH_EXPANSION.md` sections 2 and 4 (numbers PROPOSED, tuned in
  the session log). Walking speed from legs now works (it was ignored).
- **Combos and sets (built 2026-09-30, expansion step 3):** 14 pair
  combos and 6 sets as in the brief, applied when the Mech is built and
  listed on the hangar's build sheet. "Sometimes" effects are every nth
  hit (PROPOSED).
- **Account unlocks (built 2026-09-30, expansion step 4):** an account
  level per browser from finished matches; wild parts open by level or
  achievement (table in the session log, numbers PROPOSED).
- **Evolve on age-up (built 2026-09-30, step 4b):** a Mech on the lane
  takes your new age for 25% of the price difference once you can pay
  (PROPOSED), with a short transformation effect.
- **Mech vs Mech (built 2026-09-30, v1):** from the menu (D): design in
  the hangar, pick an age, fight one random Mech of about the same price;
  one round. No account XP for duels (PROPOSED).
- **Titan (built 2026-09-30, EXPERIMENTAL, switch `titan`):** in the
  final age, once per match, the design built huge (numbers PROPOSED).
- **Expansion agreed 2026-09-29 (being built, Phase 21):** hangar UI, 7 parts per
  slot, pair combos and sets, an optional Special module slot, account
  unlocks, evolve on age-up, Mech vs Mech, a utility Mech and a Titan
  (experimental). See `docs/MECH_EXPANSION.md`.

### 1v1 multiplayer (DEFERRED, notes for later)

- Fits the code: every player action is already a `*-requested` command
  with a side, and the battle is nearly deterministic (randomness only in
  the AI, the campaign map and doctrines). Both browsers would run the same
  battle and exchange only commands (lockstep), after making the tick
  strictly fixed and adding a check that both games still match.
- Hosting: the game itself is static files (GitHub Pages, Cloudflare Pages
  or Netlify, free). Multiplayer adds a small relay that pairs two players
  by room code and forwards their commands; a Cloudflare Worker with a
  Durable Object per room fits and was free at friends-scale when checked
  (2026-09-27). A small always-on server (Fly.io and the like) costs a few
  dollars a month; for tests, a relay on the owner's PC behind a tunnel.

