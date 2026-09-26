# Overnight session notes (2026-09-26)

Hi! This covers everything from your list, what to look at first, what I
decided on my own (so you can overrule it), and ideas I didn't build. All
of it is on the branch `claude/gallant-goldberg-kmxnuj`, one commit per
topic. Design details: `docs/GAME_DESIGN.md` section 13. Per-step log:
`docs/IMPLEMENTATION_PLAN.md` (Phase 17 and the last Session log entry).

## Quick tour (about 15 minutes)

1. `npm install` (two new font packages), then `npm run dev`.
2. **Title screen**: units from all five ages parade along the lane. `Q`/`E`
   (or the arrows under the difficulty cards) pick the enemy's **AI
   profile**. **Experiments** (top right) switches the prototypes on and
   off. **Conquest** (or `C`) opens the roguelite campaign.
3. Play a Normal match against Classic. The enemy should now build up
   gradually instead of sending a mammoth and a crowd of clubbers in the
   first minute.
4. Press `N` (dev only) a few times to jump through the ages: units,
   turrets, bases and the HUD all change their look each age. `G` gives
   gold, so you can buy turrets and upgrade them to see each level's look.
5. Scroll left (arrows, A/D or drag) to your buildings and level them:
   every level adds a detail, and every fifth level is a new stage.
6. `http://localhost:5173/artlab.html` shows every unit's animations
   (`?age=0`..`4`), `?turrets` all turrets at every level, `?buildings`
   every building stage.
7. Try a Conquest run.

## What I did, per request

**Art for the remaining ages.** All 25 units are drawn in code in the
Stone-age style (`src/art/`): Castle (swordsman, archer, knight on a horse,
merchant, catapult crew), Renaissance (pikeman, musketeer, cuirassier,
banker, alchemist), Modern (rifleman, sniper, tank, contractor, officer) and
Future (blade trooper, laser gunner, mech, broker drone, shield drone).
Each has stand, walk, attack (the hit lands on the strike frame) and death
animations with team colors. Sheets are drawn when an age is needed and
freed when nobody is near that age, which keeps memory reasonable
(28-47 MB for unit art instead of several hundred).

**Stone-age AI opening.** Each difficulty now eases in: the AI's own income
starts at 20-30% and grows to full over 3-5 minutes, its army size is capped
(2-3 units, growing each minute), no heavies before 70-150 s, one unit in
the queue at a time, and no early offensive special. Measured on hard: 3
units at 10 s and 6 at 60 s (it was 6, then 12 plus a mammoth). Tunable in
`config/ai.config.ts` (`opening` in each difficulty).

**Turrets.** All 15 turrets are drawn. The head tracks its target, recoils
and flashes; throwing arms swing; the oil cauldron tips. Every upgrade
level adds something visible: level 1 reinforcement (bands, plates,
rivets), level 2 team banners and an extra part (a second barrel, a bolt
rack), level 3 the elite look (gold trim, trophies, glowing parts).

**Projectiles and effects.** Every projectile is drawn (rocks, spears,
arrows, bolts, fire pots, cannonballs, shells, lasers, rail slugs,
plasma...), with trails (fire, smoke, sparks, laser glow) and impacts that
match (dust and chunks, splinters, fire bursts, explosions with shockwave
rings and scorch marks). Melee blows spark, machines explode when they
die, your kills pop coins, heals and buffs get particles, and bases shed
rubble and show cracks as they lose HP.

**Graceful impact shake.** The random jitter is gone. Heavy units' blows
and shots, special strikes, exploding machines and hits on your base now
give a short, damped vertical "thump" of the whole view, including the
background, with cooldowns so a line of heavies doesn't make it wobble all
the time. Turret splashes don't thump. Tunable in
`config/effects.config.ts` (`CAMERA_THUMP`).

**Themed UI.** The HUD takes on the player's age: Stone dark wood and bone,
Castle slate and gold, Renaissance burgundy damask, Modern olive canvas,
Future navy with cyan circuitry. It uses the ornate Kenney frame and new
fonts (Fredoka and Lilita One, free licence). The pause and game-over
panels match. There's a new title screen too.

**Smarter AI and machine learning.** A new AI brain (`systems/UtilityAI.ts`)
scores every option it has each time it thinks: units, buildings,
research, turrets, upgrades, saving up. How it weighs them is a "genome"
of 38 numbers. From that I made **profiles to playtest**: Balanced,
Warlord (big armies, heavies), Turtle (turrets and upgrades, late push),
Economist (mines, libraries, fast ages) and Tactician (hard counters,
keeps a healer close). **Classic**, the old AI, is still the default. The
machine learning part is `tools/train-ai.mjs`: a genetic algorithm that
plays thousands of headless AI-vs-AI matches and breeds the best genomes
(README, "Training an AI profile"). Results so far are in "AI training
results" below.

**Buildings.** The one-level-per-age limit is gone: every age opens **five
levels** (25 in all), each cheaper and giving a steady gain, so there's
always something to invest in. Every building has its own art with a
**new stage every five levels** (Stone, Castle, Renaissance, Modern and
Future versions) and a new detail on every level. Level-ups bounce with
dust and sparkles; a new stage flashes. Research now opens every fifth
Forge level, and every Forge level adds +1% unit damage.

**New buildings and mechanics (prototypes, switchable).**

- **Building perks**: every fifth level of a building, pick one of two
  permanent perks (Mine: +15% mine gold or +8% kill gold; Forge: cheaper
  research or +4% unit HP...). A PERK! badge shows until you pick.
- **Barracks** (faster training, tougher units), **Shrine** (special
  recharges faster and hits harder), **Market** (sells the XP you don't need
  for your next age-up for gold).
- **Veterancy**: units that kill rank up (gold chevrons over the HP bar),
  heal fully and get stronger.
- **Age doctrines**: after each age-up, pick one of three army-wide
  doctrines (Shield Wall, Berserkers, Marksmen, Volley Fire, Juggernauts,
  Shock Troops, Forced March, Hardened, Support Corps). Keys 7-9.
- **War Cry**: a free second ability (`W`, every 45 s): 6 s of +30% speed
  and +20% damage for your army.

The AI uses all of these by the same rules.

**Beyond a one-time play: Conquest mode (prototype).** A campaign of five
battles. Before each, choose one of two or three battles: each has its own
enemy (difficulty and AI profile), battlefield rules (e.g. "Fortified":
the enemy starts with two upgraded turrets; "Glass cannons": everyone hits
harder but has less HP) and a Glory reward, and later ones may start in
the Castle or Renaissance age. Win and pick a **relic** for the rest of the
run (e.g. +10% damage, start with a level 3 Mine, a free upgraded turret).
Lose once and the run is over. **Glory** carries over between runs and buys
permanent unlocks in the **Hall of Glory** (more relic choices, a reroll, a
starting relic, extra gold, rarer relics). Clearing a run unlocks the next
**Ascension** level (tougher enemies, more Glory), up to 10.

## Turning things off or undoing them

- **Prototypes**: the Experiments panel on the title screen (per browser),
  or the defaults in `src/config/features.config.ts`. Each prototype's code
  is in its own files and only wired in when its switch is on. I ran a full
  AI-vs-AI match with every switch off: no errors.
- **Everything else**: one commit per topic, so `git revert <commit>`
  undoes one. Later commits build on earlier ones in places (the prototypes
  use the new buildings; Conquest uses the switches).

| Commit | What |
| --- | --- |
| `5466be9` | AI opening |
| `638a2bd` | Unit art for every age |
| `97c77b9` | Turret art |
| `5ec38a7` | Projectiles, effects, camera thump |
| `7097860` | Base art |
| `71b5778` | Themed UI, fonts, title screen |
| `5f7815b` | Utility AI, profiles, training tool |
| `0baa88c` | Buildings rework and art; Barracks/Shrine/Market and perks |
| `9e1e613` | Veterancy, doctrines, War Cry, Experiments panel |
| `6cc6b79` | Conquest mode |

## Decisions I made that you may want to change

1. **Buildings went from one level per age to five** (your request, but the
   exact scheme is mine). Costs and outputs are PROPOSED in
   `config/buildings.config.ts`.
2. **Barracks, Shrine and Market exist**, although the design said "Forge,
   Library and Mine for now" and listed a market as deferred. They're only
   a prototype you can switch off. Same for **Conquest** (roguelite modes
   were deferred): built because you asked for experiments.
3. **The HUD restyles on every age-up** (it rebuilds itself in the new
   age's look). If you'd rather keep one look, that's a small change.
4. **The screen shake is now a vertical thump**, for heavy units' blows and
   shots, special strikes, exploding tanks and mechs, and hits on your
   base. Your round-4 call still holds: turret splashes (mortars, grenade
   launchers) never shake the screen.
5. **Classic stays the default AI.** The profiles are opt-in on the title
   screen. Tell me which ones feel right and I'll tune them or make one the
   default.
6. All the new numbers are PROPOSED first guesses.

## Things I noticed

- **Late-game stalemates.** In AI-vs-AI tests, matches between strong AIs
  often stall in the Future age with both bases nearly full: both sides
  have maxed buildings and turrets, and the 5-unit training queue caps
  what they can spend (one AI sat on 35,000 gold). Ideas for this are
  below ("late-game gold sinks").
- **Conquest late starts:** the AI's gentle opening is meant for the Stone
  age, so an enemy that starts in a later age skips it and plays at full
  pace from the first second.
- **Conquest:** if the page is reloaded mid-battle, you can fight that
  battle again from the start (lenient on purpose for a prototype).
- **Not tested:** real play with a mouse by a person (I drove the game from
  scripts and checked screenshots), mobile, and audio (there is none).

## Ideas I didn't build

Buildings and mechanics:

- **Late-game gold sinks** (for the stalemates): a Barracks level that adds
  queue slots, a one-shot "mercenary" purchase of an elite unit, or a
  Future-age **Wonder**: a very expensive multi-minute build that ends the
  match when finished, so a banked side has something to race for.
- **Infirmary**: your units slowly regenerate near your own base, which
  rewards falling back behind turrets.
- **Observatory**: each level makes age-ups cheaper in XP.
- **War college**: new units start at veteran rank 1 (pairs with
  veterancy).

More strategy and interaction:

- **Weather and lane events**: rain (everyone slower), fog (shorter range),
  a storm that knocks out turrets for a few seconds. They shake up a match
  without new controls.
- **Active unit abilities**: each unit type gets one click ability on a
  cooldown (knight charge, musketeer volley, tank smoke).
- **Doctrine trees**: doctrines that chain from age to age (pick "Shield
  Wall" in Stone to unlock "Phalanx" in Castle).

Replayability:

- **Daily challenge**: one fixed Conquest run per day (same battles and
  relics for everyone), with a best score.
- **Scenarios**: short set-piece battles ("hold for 8 minutes with only
  turrets", "win without money units").
- **Medals and cosmetics**: achievements that unlock base skins or banner
  colors.
- **Endless mode**: waves that grow stronger until your base falls, with a
  high score. (Survival modes were on the deferred list, so only if you
  want it.)
