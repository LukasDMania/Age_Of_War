# Mech expansion (design brief, 2026-09-29)

Agreed with the owner in a brainstorm session. Nothing here is built yet.
This is the brief for the next Mech session. Read it together with
`GAME_DESIGN.md`, section "The Mech workshop". Tags work the same way as in
GAME_DESIGN: **AGREED** means the owner said yes (the numbers are still
PROPOSED), **DEFERRED** means liked but not now, and **EXPERIMENTAL** means
build it behind a switch in `config/features.config.ts`.

Once a section is built, move its decisions into `GAME_DESIGN.md` and tick it
off in a new phase in `IMPLEMENTATION_PLAN.md`.

## Suggested build order

1. The hangar UI (section 1). Everything else plugs into it.
2. The parts roster up to 7 per slot, plus the Special module slot
   (sections 2 and 4).
3. Pair combos and set bonuses (section 3).
4. Account level and part unlocks (section 5).
5. Evolving on age-up (section 4b).
6. Utility Mech / building support (section 7).
7. The Mech vs Mech mode (section 6).
8. The Titan (EXPERIMENTAL, section 6).

Keep the game runnable after each step. Parts stay data in
`config/mech.config.ts`, with behavior as optional blocks and no subclasses
per part.

## 1. The hangar (AGREED)

It replaces the current Workshop panel. B still opens it.

- A **full-screen hangar scene** (a separate Phaser scene, like the HUD).
  The Mech stands large in the middle on a gantry. Each body slot is a
  clickable hotspot on the model, and clicking one slides out a drawer with
  that slot's parts. Keyboard support stays: 1-6 pick a slot, Q/E switch
  the part, R builds.
- **Background per age**, drawn in code like the other art (`src/art/`,
  plus a new `HangarArt`):
  - Stone: inside a hut (hides, a fire pit, wooden scaffold).
  - Medieval: a blacksmith's forge (anvil, bellows, stone walls).
  - Industrial (brass age): a steam factory hall (pipes, gears, chains).
  - Military: an army base hangar (camo nets, sandbags, floodlights).
  - Future: a clean lab bay (glowing panels, holo-grid floor).

  Use whatever the age names are in `ages.config.ts`.
- **Live preview:** hovering a part swaps it onto the model at once and
  plays a short idle/attack loop, so you see how a weapon behaves.
- **Stat bars** for HP, DPS, range, speed and armor, each with a green/red
  ghost segment that shows what the hovered part would change.
- **Build sheet:** total cost, build time, and role tags derived from the
  parts (Tank, Brawler, Artillery, Support, Utility). Active pair combos
  and set bonuses are listed here, and set progress shows as (2/3).
- **Blueprint slots:** 3-5 named saved designs, switched with one key. They
  are stored per browser, the same way as today's design.
- **Locked parts** show as blueprint line art with their unlock requirement.
- **Assembly on the lane:** while the Mech builds, show it being put
  together on a scaffold at the base (legs, then torso, then arms, head and
  module).
- Style: Kenney borders tinted over a blue blueprint grid.

## 2. Parts roster: 7 per body part (AGREED, numbers PROPOSED)

Slots: legs, torso, head, left arm, right arm (both arms use one arm list),
plus the new **Special module** (section 4).

In every slot:
- **Budget:** weak but cheap, always open.
- **Standard:** better, a bit more expensive, always open.
- **The other five:** they can go wild. They are pricier and most are
  unlocked through play (section 5).

The base unlocked set stays modest: budget, standard and about one more per
slot. "Base" in the tables means open from the first game.

Existing parts are kept and marked (existing).

### Legs
| Part | Role | Idea | Unlock |
|---|---|---|---|
| Walker (existing) | budget | +HP | base |
| Striders (existing) | standard | faster walk | base |
| Treads (existing) | tank | +HP, armor | base |
| Stompers (existing) | brawler | melee arms +30% | Forge 6 |
| Hover jets | wild | fast, immune to slows, low HP | level |
| Spider legs | wild | can't be knocked back, guns +range | achievement |
| Jump legs | wild | sometimes leaps over the front line and lands with splash | achievement |

### Torso
| Part | Role | Idea | Unlock |
|---|---|---|---|
| Frame (existing) | budget | +HP | base |
| Armory (existing) | standard | guns fire faster | base |
| Armored hull (existing) | tank | +HP, armor | base |
| Reactor (existing) | power | weapons +dmg, +speed | Forge 6 |
| Hangar bay | wild | launches small drones on a cooldown | level |
| Overcharge core | wild | big damage boost, but loses HP over time | achievement |
| Troop carrier | wild | carries 3 melee units of the current age, drops them when it stops or dies | achievement |

### Head
| Part | Role | Idea | Unlock |
|---|---|---|---|
| Visor (existing) | budget | +gun range, +10% dmg | base |
| Command crest (existing) | standard | allies nearby +dmg | base |
| War siren (existing) | control | enemies nearby slowed | base |
| Repair beacon (existing) | support | heals itself and allies | Forge 11 |
| Sniper scope | wild | gun arm targets the back-most enemy | level |
| Taunt beacon | wild | nearby enemies must attack the Mech | achievement |
| Salvage scanner | wild | kills near the Mech give extra gold | achievement |

### Arms (one list, used for both arms)
7+ options. There are already 5, so the list grows to 11. Arms are the most
fun slot, so they may go past 7.
| Part | Role | Idea | Unlock |
|---|---|---|---|
| Fist (existing) | budget | heavy splash blows | base |
| Blade (existing) | standard | fast cuts | base |
| Shield (existing) | defense | +HP, armor, no weapon | base |
| Launcher (existing) | ranged | splash shells, fires while walking | base |
| Siege drill (existing) | siege | x3 damage to bases | Forge 6 |
| Flamethrower | wild | short cone, burn over time | level |
| Minigun | wild | spins up: slow at first, very fast after 2 s | level |
| Tesla coil | wild | chain lightning to 3-4 targets | achievement |
| Railgun | wild | slow charge, pierces the whole lane | achievement |
| Grapple claw | wild | pulls a back-line enemy forward | achievement |
| Wrecking ball | wild | knockback | achievement |

Each new part needs five age looks, like the existing ones. Pricing should
follow the existing formula (price x tier factor x age factor), so the
current balance check still applies. Re-run the headless Mech-vs-stream
balance check after adding parts.

## 3. Pair combos and set bonuses (AGREED)

These are two separate systems, and both are data in `mech.config.ts` so
the lists can grow without limit.

### Pair combos (two specific parts together)
| Combo | Parts | Bonus |
|---|---|---|
| Dual wield | Blade + Blade | every 4th attack is a spin that hits all enemies in melee reach |
| Shield bash | Fist + Shield | the Fist sometimes stuns briefly |
| Bulwark | Shield + Shield | armor x0.8, and allies directly behind take -15% damage |
| Artillery lock | Launcher + Sniper scope | Launcher reach +30% |
| Crossfire | Minigun + Launcher | the Minigun keeps its spin-up while walking |
| Firestorm | Flamethrower + Reactor | burn lasts twice as long |
| Conductor | Tesla coil + Armory | +1 chain jump |
| Hook and cut | Grapple claw + Blade | a pulled target takes a free Blade hit |
| Demolisher | Siege drill + Stompers | drill base damage x4 instead of x3 |
| Juggernaut | Treads + Armored hull | immune to knockback and slows |
| Skirmisher | Striders + Launcher | the Launcher fires 25% faster while walking |
| Death from above | Jump legs + Fist | the landing splash doubles |
| Field medic | Repair beacon + Shield | healing +50% |
| Rally point | Command crest + Troop carrier | dropped troops get the crest buff for 10 s |

### Matching sets (a "brand" tag on each part; bonuses at 2/3/4+ pieces)
Every part gets one set tag. The bonus steps are at 2, 3 and 4 parts (the
module counts too, so 6 slots in total).
| Set | Members (examples) | 2 pieces | 3 pieces | 4+ pieces |
|---|---|---|---|---|
| Bastion (armor) | Treads, Armored hull, Shield, Taunt beacon | +10% HP | thorns (reflects 10% melee) | taunt aura, -10% damage taken |
| Assault (melee) | Stompers, Blade, Fist, Wrecking ball | +10% melee dmg | lifesteal 5% | a charge at the start of combat |
| Arsenal (guns) | Armory, Launcher, Minigun, Visor, Sniper scope | +10% range | +15% fire rate | an extra salvo every 10 s |
| Tesla / Energy | Reactor, Tesla coil, Railgun, Overcharge core | +10% dmg | attacks sometimes slow | chain hits jump once more |
| Command (support) | Command crest, Repair beacon, Troop carrier, Hangar bay | aura radius +20% | ally units +5% HP | allies near the Mech regen |
| Scrapper (budget) | Walker, Frame, Visor, Fist | -10% cost | -15% build time | +20% kill gold |

The Scrapper set makes an all-budget Mech a real choice. Keep the rules
general (a tag plus a threshold list) so 10+ parts per slot later need only
new rows.

## 4. Special module slot (AGREED)

- A **sixth, optional body slot**: the Special module. It can be left empty
  (null), which saves gold.
- The module gives the Mech one **active ability** on a cooldown. It uses
  the existing War cry button and key (`ui/experimental/WarCryButton`,
  `war-cry` keybinding): while a Mech with a module is alive, that button
  fires the module instead. The War cry prototype is replaced by this, so
  decide at build time whether War cry stays as its own switch.
- Emits a `mech-ability-requested` event, and MechSystem validates it.
  Add the row to the event catalog.
- Module ideas (7, same budget/standard/wild split):
  | Module | Role | Ability |
  |---|---|---|
  | Smoke launcher | budget | a cloud that makes enemy ranged units miss for 4 s |
  | Overdrive | standard | +40% attack speed for 6 s |
  | Leap thrusters | wild | jumps forward and lands with splash damage |
  | Overload | wild | a big AoE blast that costs 15% of the Mech's HP |
  | Barrier dome | wild | shields itself and nearby allies |
  | EMP pulse | wild | stuns turrets and heavies in range for 3 s |
  | Orbital beacon | wild | calls one strike on the front-most enemy |

### 4b. Evolve on age-up (AGREED)
When the player ages up while a Mech is on the lane, it plays a short
transformation (flash, scaffold, sparks) into the new age's look. It is
free or cheap (PROPOSED: 25% of the cost difference). Its stats rise to the
new age's factor, and the design stays the same.

### Not now (owner said no)
Breakable parts, field refit, recall to base, and wreck/salvage.

## 5. Account level and unlocks (AGREED)

Goal: no one builds the wild parts in game 1. You earn them by playing.

- An **account level**, stored per browser (localStorage, with a try/catch
  like the design save). Account XP comes from finished matches: a win, a
  loss that lasted long, kills, Conquest stages, and so on.
- Three unlock routes, set per part in the data: `unlock: { kind: 'base' |
  'forge' | 'level' | 'achievement', ... }`.
  - **Base:** open from the start (budget, standard, about one more per
    slot).
  - **Level:** reach account level N.
  - **Achievement / requirement**, examples:
    - Tesla coil: win a match with a Mech that has both arms as guns.
    - Railgun: destroy an enemy base with a Launcher Mech.
    - Jump legs: have your Mech kill 10 units in a single life.
    - Taunt beacon: have a Mech absorb 5,000 damage in one match.
    - Grapple claw: kill 50 enemy ranged units with Mech melee.
    - Troop carrier: have 20 units alive at once.
  - Forge-level unlocks keep working within a match (they are separate from
    account unlocks).
- The hangar shows progress toward each lock.
- A dev cheat on `__aow` to unlock everything for testing.

## 6. New modes

### Mech vs Mech (AGREED)
A separate mode from the menu: you design a Mech in the hangar and fight a
Mech in an arena, and only Mechs fight. The enemy Mech gets a preset or
random design (an allowed exception to "player-only", limited to this
mode). It doubles as a balance testbed for new parts. Scope for v1: one
round, best of three maybe later.

### Titan finale (EXPERIMENTAL)
In the Future age only: a one-time, very expensive Titan build, a huge Mech
that fills about half the screen height. Behind a
`features.config.ts` switch.

### Conquest Mech stages (DEFERRED, agreed in principle)
Conquest will need Mech stages (enemy Mech bosses, Workshop path
stages). Later.

## 7. Utility Mech: helping the economy (owner's idea, AGREED in principle)

A Mech built for utility instead of combat, which walks to your buildings
and boosts them.

- Uses **utility parts**, a new role tag on some parts, for example:
  - Legs: *Cargo crawler* (slow, sturdy, +buff duration).
  - Torso: *Workshop core* (a craft rate bonus).
  - Arms: *Wrench arm* (repair/boost), *Crane arm* (build faster).
  - Head: *Foreman* (boosts every building in range).
  - Module: *Rush order* (instantly finishes the current research or
    building level).
- Behaviour: a Mech whose parts are mostly utility does not walk into the
  lane. It goes to a chosen building (you click the building, or it
  auto-picks by priority) and works there.
- It has a **lifetime** (PROPOSED: 60-90 s, extended by utility parts).
  After that it powers down and the Mech slot frees up. It still counts as
  the one Mech, so you choose between a fighting Mech and a helper Mech.
- Effects, to pick 2-3 for v1:
  - Buff a building: the Mine gives +50% gold while the Mech works it.
  - Speed up research at the Forge: faster Forge levels, or it "crafts" a
    Forge level outright after N seconds of work.
  - Speed up building upgrades or cut their cost.
  - Repair the base.
- Open questions for the owner before building: can it be attacked while
  working? Can it switch buildings mid-life? Is it a mode chosen in the
  hangar (combat vs utility), or implied by the parts?
- Code: behavior blocks on parts (`utility: { buildingBuff, craftRate, ...
  }`) handled by MechSystem and BuildingSystem through events
  (`mech-assist-started` / `mech-assist-ended`). No direct state edits.

## 8. DEFERRED (owner likes these, do not build yet)

- **Pilots:** a pilot with a perk (Ace, Engineer, Berserker, ...), a
  separate axis from parts.
- **Cosmetics:** paint colors, decals, emblems.
- **Conquest Mech stages** (see section 6).
