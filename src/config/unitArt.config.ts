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
}

/**
 * Stone Clubber: a spear-carrying LPC caveman made with the Universal LPC
 * Spritesheet Character Generator (walk and thrust, 64x64 frames). Owner's
 * test of real art, 2026-09-24. Credits: CREDITS.txt in its folder.
 */
export const UNIT_ART: Readonly<Partial<Record<string, UnitArt>>> = {
  'stone-clubber': {
    frameWidth: 64,
    frameHeight: 64,
    footY: 62 / 64,
    scale: 1,
    walk: { file: 'walk.png', frames: 9, start: 1, end: 8, frameRate: 12, repeat: -1 },
    attack: { file: 'thrust.png', frames: 8, frameRate: 16, repeat: 0 },
    standFrame: 0,
    icon: { x: 8, y: 10, width: 56, height: 54 },
    enemyTint: 0xffa8a0,
  },
};

export type UnitArtAnim = 'walk' | 'attack';

/** Texture key of a unit's sheet; also the key of its animation. */
export function unitArtKey(unitId: string, anim: UnitArtAnim): string {
  return `unit-art-${unitId}-${anim}`;
}

/** Name of the icon frame added to a unit's walk texture. */
export const UNIT_ART_ICON_FRAME = 'icon';

/** URL of a unit's sheet (relative to the page, served from `public/`). */
export function unitArtUrl(unitId: string, file: string): string {
  return `assets/sprites/units/${unitId}/${file}`;
}
