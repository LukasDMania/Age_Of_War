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
  scale: number;
  walk: UnitAnimationArt;
  /** Played once each time the unit attacks. */
  attack: UnitAnimationArt;
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

/** How a rig unit's sheets are drawn. Sizes are in rig units (see art/rigDraw.ts). */
export interface RigSpec {
  kind: RigKind;
  /** Frame box, centered on the unit's x, with the feet `footRig` from the top. */
  boxW: number;
  boxH: number;
  footRig: number;
  /** Screen px per rig unit. */
  pxPerUnit: number;
}

/** Rig sheets are drawn this many times sharper than shown (matches the screen). */
export const RIG_SUPERSAMPLE = Math.min(3, Math.max(1.5, RENDER_SCALE));

const RIG_WALK_FRAMES = 8;
const RIG_ATTACK_FRAMES = 8;

/**
 * UnitArt for a rig unit. Walk strip: frame 0 is the standing pose, 1..8
 * the walk loop. Attack strip: 8 frames, strike first (damage lands when
 * the attack starts).
 */
function rigArt(kind: RigKind, boxW: number, boxH: number, footRig: number, pxPerUnit: number, attackRate: number): UnitArt {
  const k = pxPerUnit * RIG_SUPERSAMPLE;
  const frameWidth = Math.round(boxW * k);
  const frameHeight = Math.round(boxH * k);
  return {
    frameWidth,
    frameHeight,
    footY: footRig / boxH,
    scale: 1 / RIG_SUPERSAMPLE,
    walk: { file: '', frames: RIG_WALK_FRAMES + 1, start: 1, end: RIG_WALK_FRAMES, frameRate: 12, repeat: -1 },
    attack: { file: '', frames: RIG_ATTACK_FRAMES, frameRate: attackRate, repeat: 0 },
    standFrame: 0,
    icon: {
      x: Math.round(frameWidth * 0.12),
      y: 0,
      width: Math.round(frameWidth * 0.76),
      height: Math.round(frameHeight * 0.96),
    },
    rig: { kind, boxW, boxH, footRig, pxPerUnit },
  };
}

/**
 * Stone Clubber: a spear-carrying LPC caveman made with the Universal LPC
 * Spritesheet Character Generator (walk and thrust, 64x64 frames). Owner's
 * test of real art, 2026-09-24. Credits: CREDITS.txt in its folder.
 */
export const UNIT_ART: Readonly<Partial<Record<string, UnitArt>>> = {
  // Stone age in the rig style (owner, 2026-09-26).
  'stone-clubber': rigArt('clubber', 68, 58, 52, 1.45, 14),
  'stone-slinger': rigArt('slinger', 68, 62, 54, 1.4, 12),
  'stone-mammoth-rider': rigArt('mammoth-rider', 96, 86, 80, 1.15, 12),
  'stone-trader': rigArt('trader', 60, 56, 50, 1.4, 12),
  'stone-shaman': rigArt('shaman', 60, 66, 58, 1.4, 10),
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

export type UnitArtAnim = 'walk' | 'attack';

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
