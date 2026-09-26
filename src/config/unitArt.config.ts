import type { RigKind } from '@/art/rigDraw';
import type { Side } from '@state/types';
import { RENDER_SCALE } from '@utils/renderScale';
/**
 * Real unit art (sprite sheets) replacing the generated placeholders, one
 * unit at a time. A unit listed here is drawn with its sheets; every other
 * unit keeps its placeholder. Art is visual only: a unit's footprint for
 * blocking, reach and hits stays the size of its placeholder, so swapping art
 * never changes the balance.
 *
 * Sheets live in `public/assets/sprites/units/<unitId>/` as horizontal strips
 * of equal frames, facing right (the player's direction); enemy units are
 * mirrored. Keep the art's credits file next to it.
 */

/** One animation strip. */
export interface UnitAnimationArt {
  /** File name inside the unit's folder. */
  file: string;
  /** Frames in the strip. */
  frames: number;
  /** First and last frame played (0-based; default the whole strip). */
  start?: number;
  end?: number;
  frameRate: number;
  /** -1 loops (walking), 0 plays once (an attack). */
  repeat: number;
}

export interface UnitArt {
  frameWidth: number;
  frameHeight: number;
  /** Where the feet are, as a fraction of the frame height (the sprite's origin). */
  footY: number;
  /** Where the unit's center line is, as a fraction of the frame width (default 0.5). */
  originX?: number;
  scale: number;
  walk: UnitAnimationArt;
  /** Played once each time the unit attacks (units without an attack have none). */
  attack?: UnitAnimationArt;
  /** Played once where the unit died (rig art, Phase 16). */
  die?: UnitAnimationArt;
  /** Frame box of the die strip when it differs from the others (rig art). */
  dieBox?: { frameWidth: number; frameHeight: number; originX: number; originY: number };
  /** Frame of the walk strip shown while standing (blocked, or between attacks). */
  standFrame: number;
  /** Part of the stand frame used as the buy-button icon, in frame pixels. */
  icon: { x: number; y: number; width: number; height: number };
  /** Tint for the enemy's copy, until each side has its own sheets. */
  enemyTint?: number;
  /**
   * Code-drawn rig art (Phase 16, `utils/RigArt.ts`): the sheets are drawn at
   * boot instead of loaded, one set per side (team colors), smooth filtering.
   */
  rig?: RigSpec;
}

/** A box in rig units around the feet: [minX, maxX, minY, maxY] (up is negative). */
export type RigBox = readonly [number, number, number, number];

/** How a rig unit's sheets are drawn. Sizes are in rig units (see art/rigDraw.ts). */
export interface RigSpec {
  kind: RigKind;
  /** Box of the stand, walk and attack frames. */
  live: RigBox;
  /** Box of the die frames. */
  die: RigBox;
  /** Screen px per rig unit. */
  pxPerUnit: number;
}

/** Rig sheets are drawn this many times sharper than shown (matches the screen). */
export const RIG_SUPERSAMPLE = Math.min(2, Math.max(1.25, RENDER_SCALE));

const RIG_WALK_FRAMES = 10;
const RIG_ATTACK_FRAMES = 10;
const RIG_DIE_FRAMES = 8;
/** Extra rig units kept around the measured boxes (outline strokes, rounding). */
const RIG_BOX_PAD = 2;

/**
 * Moment of the strike in a rig attack strip, as a share of the strip: the
 * figures strike at 45% (see `art/rigFigure.ts`). A unit's `windupMs` is
 * `RIG_STRIKE_AT x frames / attackRate` seconds.
 */
export const RIG_STRIKE_AT = 0.45;

/** `windupMs` matching a rig attack played at `attackRate` frames per second. */
export function rigWindupMs(attackRate: number): number {
  return Math.round((RIG_STRIKE_AT * RIG_ATTACK_FRAMES * 1000) / attackRate);
}

/**
 * UnitArt for a rig unit. Walk strip: frame 0 is the standing pose, 1..10
 * the walk loop. Attack strip: 10 frames with the strike at 45%; pick
 * `attackRate` so that moment matches the unit's `windupMs`
 * (`rigWindupMs`). Die strip: 8 frames, played once where it fell. `live`
 * and `die` are the measured drawn extents (see `/artlab.html?bounds`).
 * `attackRate` 0 means the unit never attacks (money units): no attack strip.
 */
function rigArt(kind: RigKind, live: RigBox, die: RigBox, pxPerUnit: number, attackRate: number, iconBox?: RigBox): UnitArt {
  const k = pxPerUnit * RIG_SUPERSAMPLE;
  const pad = (b: RigBox): RigBox => [b[0] - RIG_BOX_PAD, b[1] + RIG_BOX_PAD, b[2] - RIG_BOX_PAD, b[3] + RIG_BOX_PAD];
  const L = pad(live);
  const D = pad(die);
  const frameWidth = Math.round((L[1] - L[0]) * k);
  const frameHeight = Math.round((L[3] - L[2]) * k);
  // Icon: the standing figure without long weapons reaching far out.
  const I = iconBox ?? [Math.max(L[0], -24), Math.min(L[1], 26), L[2], Math.min(L[3], 2)];
  return {
    frameWidth,
    frameHeight,
    footY: -L[2] / (L[3] - L[2]),
    originX: -L[0] / (L[1] - L[0]),
    scale: 1 / RIG_SUPERSAMPLE,
    walk: { file: '', frames: RIG_WALK_FRAMES + 1, start: 1, end: RIG_WALK_FRAMES, frameRate: 14, repeat: -1 },
    ...(attackRate > 0 ? { attack: { file: '', frames: RIG_ATTACK_FRAMES, frameRate: attackRate, repeat: 0 } } : {}),
    die: { file: '', frames: RIG_DIE_FRAMES, frameRate: 12, repeat: 0 },
    dieBox: {
      frameWidth: Math.round((D[1] - D[0]) * k),
      frameHeight: Math.round((D[3] - D[2]) * k),
      originX: -D[0] / (D[1] - D[0]),
      originY: -D[2] / (D[3] - D[2]),
    },
    standFrame: 0,
    icon: {
      x: Math.round((I[0] - L[0]) * k),
      y: Math.round((I[2] - L[2]) * k),
      width: Math.round((I[1] - I[0]) * k),
      height: Math.round((I[3] - I[2]) * k),
    },
    rig: { kind, live: L, die: D, pxPerUnit },
  };
}

/**
 * Attack strip frame rates of the rig units, chosen so the strip fits in the
 * unit's attack cooldown. Unit definitions take their `windupMs` from these
 * (`rigWindupMs`), so damage lands on the strike frame.
 */
export const RIG_ATTACK_RATE: Readonly<Record<string, number>> = {
  'stone-clubber': 16,
  'stone-slinger': 14,
  'stone-mammoth-rider': 14,
  'stone-shaman': 10,
  'castle-swordsman': 16,
  'castle-archer': 13,
  'castle-knight': 14,
  'castle-catapult-crew': 12,
  'renaissance-pikeman': 16,
  'renaissance-musketeer': 12,
  'renaissance-cuirassier': 14,
  'renaissance-alchemist': 10,
  'modern-rifleman': 16,
  'modern-sniper': 11,
  'modern-tank': 12,
  'modern-officer': 10,
  'future-blade-trooper': 20,
  'future-laser-gunner': 22,
  'future-mech': 14,
  'future-shield-drone': 10,
};

const rate = (unitId: string): number => RIG_ATTACK_RATE[unitId] ?? 0;

/**
 * Every unit in the rig style (owner, 2026-09-26: the Stone age first, then
 * the other ages "as done for the first age"). Boxes are the measured drawn
 * extents of the stand/walk/attack frames and of the die frames.
 */
export const UNIT_ART: Readonly<Partial<Record<string, UnitArt>>> = {
  // Stone.
  'stone-clubber': rigArt('clubber', [-31, 43, -62, 3], [-52, 17, -55, 6], 1.45, rate('stone-clubber')),
  'stone-slinger': rigArt('slinger', [-17, 27, -61, 3], [-57, 15, -59, 6], 1.4, rate('stone-slinger')),
  'stone-mammoth-rider': rigArt('mammoth-rider', [-37, 47, -85, 6], [-57, 40, -83, 13], 1.15, rate('stone-mammoth-rider'), [-32, 40, -85, 6]),
  'stone-trader': rigArt('trader', [-17, 17, -56, 3], [-57, 15, -55, 6], 1.4, 0),
  'stone-shaman': rigArt('shaman', [-17, 24, -65, 3], [-60, 17, -64, 6], 1.4, rate('stone-shaman')),
  // Castle.
  'castle-swordsman': rigArt('swordsman', [-28, 43, -58, 3], [-52, 16, -56, 6], 1.4, rate('castle-swordsman')),
  'castle-archer': rigArt('archer', [-17, 35, -56, 3], [-51, 13, -55, 6], 1.4, rate('castle-archer')),
  'castle-knight': rigArt('knight', [-38, 60, -90, 6], [-55, 41, -92, 9], 1.1, rate('castle-knight'), [-34, 38, -90, 6]),
  'castle-merchant': rigArt('merchant', [-17, 22, -58, 3], [-56, 21, -57, 6], 1.4, 0),
  'castle-catapult-crew': rigArt('catapult-crew', [-30, 42, -55, 6], [-60, 56, -54, 10], 1.25, rate('castle-catapult-crew')),
  // Renaissance.
  'renaissance-pikeman': rigArt('pikeman', [-23, 55, -68, 3], [-64, 14, -68, 6], 1.4, rate('renaissance-pikeman'), [-20, 22, -68, 3]),
  'renaissance-musketeer': rigArt('musketeer', [-17, 36, -60, 3], [-56, 20, -58, 6], 1.4, rate('renaissance-musketeer')),
  'renaissance-cuirassier': rigArt('cuirassier', [-42, 49, -88, 4], [-48, 41, -85, 9], 1.1, rate('renaissance-cuirassier')),
  'renaissance-banker': rigArt('banker', [-17, 20, -58, 3], [-54, 20, -57, 6], 1.4, 0),
  'renaissance-alchemist': rigArt('alchemist', [-17, 21, -64, 3], [-59, 18, -61, 6], 1.4, rate('renaissance-alchemist')),
  // Modern.
  'modern-rifleman': rigArt('rifleman', [-17, 46, -57, 3], [-52, 20, -56, 6], 1.4, rate('modern-rifleman')),
  'modern-sniper': rigArt('sniper', [-17, 34, -58, 4], [-53, 20, -56, 6], 1.4, rate('modern-sniper')),
  'modern-tank': rigArt('tank', [-30, 49, -50, 3], [-30, 37, -54, 3], 1.45, rate('modern-tank'), [-30, 40, -50, 3]),
  'modern-contractor': rigArt('contractor', [-17, 20, -59, 3], [-55, 20, -57, 6], 1.4, 0),
  'modern-officer': rigArt('officer', [-17, 26, -58, 3], [-53, 16, -57, 6], 1.4, rate('modern-officer')),
  // Future.
  'future-blade-trooper': rigArt('blade-trooper', [-30, 43, -62, 3], [-51, 20, -55, 6], 1.4, rate('future-blade-trooper')),
  'future-laser-gunner': rigArt('laser-gunner', [-17, 28, -56, 3], [-51, 17, -55, 6], 1.4, rate('future-laser-gunner')),
  'future-mech': rigArt('mech', [-29, 46, -72, 4], [-26, 35, -78, 4], 1.3, rate('future-mech')),
  'future-broker-drone': rigArt('broker-drone', [-24, 24, -70, 2], [-24, 33, -67, 13], 1.3, 0),
  'future-shield-drone': rigArt('shield-drone', [-28, 27, -62, 2], [-24, 25, -53, 13], 1.3, rate('future-shield-drone')),
};

/**
 * The owner's LPC test sheet for the clubber (2026-09-24), kept for
 * reference; replaced by the rig clubber above.
 */
export const LPC_CLUBBER_ART: UnitArt = {
  frameWidth: 64,
  frameHeight: 64,
  footY: 62 / 64,
  scale: 1,
  walk: { file: 'walk.png', frames: 9, start: 1, end: 8, frameRate: 12, repeat: -1 },
  attack: { file: 'thrust.png', frames: 8, frameRate: 16, repeat: 0 },
  standFrame: 0,
  icon: { x: 8, y: 10, width: 56, height: 54 },
  enemyTint: 0xffa8a0,
};

export type UnitArtAnim = 'walk' | 'attack' | 'die';

/** Texture key of a unit's sheet; also the key of its animation. */
/** Texture/animation key of a unit's sheet; rig units have one per side. */
export function unitArtKey(unitId: string, anim: UnitArtAnim, side?: Side): string {
  const base = `unit-art-${unitId}-${anim}`;
  return side && UNIT_ART[unitId]?.rig ? `${base}@${side}` : base;
}

/** Name of the icon frame added to a unit's walk texture. */
export const UNIT_ART_ICON_FRAME = 'icon';

/** URL of a unit's sheet (relative to the page, served from `public/`). */
export function unitArtUrl(unitId: string, file: string): string {
  return `assets/sprites/units/${unitId}/${file}`;
}
