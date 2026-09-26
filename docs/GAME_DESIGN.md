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
  radius, 45 s cooldown, ready at the start of a match. Strikes aim at random
  enemy units and never hit the base.

## 8. Enemy AI (PROPOSED)

- The AI is a scripted opponent that plays through the **same buy/upgrade/
  age-up/special requests as the human player**, using the same event names.
  It never mutates state directly.
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
  section 11), e.g. a market.
- Interest on banked gold, caravan-style lump payouts, mid-lane bounties,
  frontline-based income.
- Multiple lanes, campaign, survival/roguelite modes.

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
  owner says; gameplay first.
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
  - Built in Phase 14. PROPOSED numbers (all in `config/buildings.config.ts`):
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

