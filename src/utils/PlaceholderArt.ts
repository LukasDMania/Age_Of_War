/**
 * Generates every placeholder texture at boot using Phaser graphics, so the
 * game needs no image files. Gameplay code refers only to sprite keys from
 * the definitions (plus `textureKeyFor` for the side variant); swapping in
 * real sprites later should only change this file and the asset loading in
 * `PreloadScene`.
 *
 * Shapes tell roles apart, colors tell sides apart:
 *   unit slot 1 rounded rectangle (melee)
 *   unit slot 2 triangle          (ranged)
 *   unit slot 3 big rectangle     (heavy)
 *   unit slot 4 ellipse + coin    (economy)
 *   unit slot 5 diamond + cross   (utility)
 * Everything is drawn facing right; flip the sprite for the enemy side.
 * A small dot in the age's accent color (`AgeConfig.visuals.accent`) tells
 * the ages apart, and each age has its own base drawing (Phase 8).
 */
import Phaser from 'phaser';
import { AGES } from '@config/ages.config';
import {
  TURRET_DEFINITIONS,
  type TurretDefinition,
} from '@entities/turretDefinitions';
import {
  UNIT_DEFINITIONS,
  type UnitDefinition,
} from '@entities/unitDefinitions';
import { SIDES, type Side } from '@state/types';

/** Sprite key of a side's base in a given age (before the side suffix). */
export function baseSpriteKey(age: number): string {
  return `base-${age}`;
}

const BASE_SIZE = { w: 120, h: 200 };
const TURRET_SIZE = 48;

/** Texture key for a definition's sprite key on a given side. */
export function textureKeyFor(spriteKey: string, side: Side): string {
  return `${spriteKey}@${side}`;
}

interface SidePalette {
  main: number;
  dark: number;
  light: number;
}

const SIDE_PALETTE: Record<Side, SidePalette> = {
  player: { main: 0x3d7fd9, dark: 0x1b3f7a, light: 0x8fbaf0 },
  enemy: { main: 0xd9483d, dark: 0x7a1d17, light: 0xf0958e },
};

const COIN_COLOR = 0xf2c744;
const HEAL_COLOR = 0x59c274;
/** Color of the cross on each kind of utility unit (Phase 10). */
const UTILITY_COLORS: Record<NonNullable<UnitDefinition['utility']>['kind'], number> = {
  heal: HEAL_COLOR,
  aoe: 0xf28c2c,
  slow: 0xb070ff,
  buff: 0xf2c744,
  shield: 0x8fe0ff,
};
const FIRE_COLOR = 0xf28c2c;
const METAL_COLOR = 0x555555;

const UNIT_SIZE: Record<UnitDefinition['slot'], { w: number; h: number }> = {
  1: { w: 30, h: 46 },
  2: { w: 28, h: 44 },
  3: { w: 56, h: 62 },
  4: { w: 34, h: 44 },
  5: { w: 30, h: 46 },
};

/** A unit's footprint: its slot's size, or its own width if it sets one. */
function unitSize(def: UnitDefinition): { w: number; h: number } {
  const size = UNIT_SIZE[def.slot];
  return def.bodyWidth ? { w: def.bodyWidth, h: size.h } : size;
}

interface ProjectileStyle {
  w: number;
  h: number;
  color: number;
  shape: 'circle' | 'bar' | 'comet';
}

const PROJECTILE_STYLES: Record<string, ProjectileStyle> = {
  'proj-stone': { w: 10, h: 10, color: 0x9e9e9e, shape: 'circle' },
  'proj-spear': { w: 26, h: 4, color: 0xc9a66b, shape: 'bar' },
  'proj-boulder': { w: 18, h: 18, color: 0x6d6d6d, shape: 'circle' },
  'proj-fire': { w: 14, h: 14, color: FIRE_COLOR, shape: 'circle' },
  'proj-meteor': { w: 40, h: 18, color: 0x8a4b2a, shape: 'comet' },
  'proj-arrow': { w: 22, h: 3, color: 0xd9c08c, shape: 'bar' },
  'proj-bolt': { w: 16, h: 4, color: 0x8b5a2b, shape: 'bar' },
  'proj-ballista': { w: 32, h: 5, color: 0x6b4a2b, shape: 'bar' },
  'proj-oil': { w: 14, h: 14, color: 0x2b2b2b, shape: 'circle' },
  'proj-bullet': { w: 9, h: 3, color: 0xf2d16b, shape: 'bar' },
  'proj-cannonball': { w: 14, h: 14, color: 0x333333, shape: 'circle' },
  'proj-mortar': { w: 12, h: 12, color: 0x555555, shape: 'circle' },
  'proj-shell': { w: 14, h: 6, color: 0x8a8a4a, shape: 'bar' },
  'proj-grenade': { w: 10, h: 10, color: 0x4a6b2b, shape: 'circle' },
  'proj-laser': { w: 22, h: 3, color: 0x7fffd4, shape: 'bar' },
  'proj-rail': { w: 36, h: 4, color: 0x9fd8ff, shape: 'bar' },
  'proj-plasma': { w: 14, h: 14, color: 0xb070ff, shape: 'circle' },
  'proj-bomb': { w: 20, h: 8, color: 0x3a3a3a, shape: 'bar' },
  'proj-orbital': { w: 44, h: 6, color: 0xe8f8ff, shape: 'bar' },
};

/** Used for any projectile key that has no style entry yet. */
const DEFAULT_PROJECTILE_STYLE: ProjectileStyle = {
  w: 8,
  h: 8,
  color: 0xffffff,
  shape: 'circle',
};

/* ---- What exists ------------------------------------------------------ */

/** Every projectile key used by units, turrets, specials and utility throws. */
export function projectileKeys(): string[] {
  const keys = new Set<string>();
  for (const def of UNIT_DEFINITIONS) {
    if (def.attack?.projectileKey) keys.add(def.attack.projectileKey);
  }
  for (const def of TURRET_DEFINITIONS) {
    if (def.projectileKey) keys.add(def.projectileKey);
  }
  for (const age of AGES) keys.add(age.special.projectileKey);
  for (const def of UNIT_DEFINITIONS) {
    if (def.utility?.kind === 'aoe') keys.add(def.utility.projectileKey);
  }
  return [...keys];
}

export interface PlaceholderTextureGroup {
  title: string;
  /** Texture keys in the group, in display order. */
  keys: string[];
  /** Whether the enemy variants are drawn flipped (facing left) in previews. */
  side?: Side;
}

/** Lists every texture `generatePlaceholderTextures` creates, by group. */
export function listPlaceholderTextures(): PlaceholderTextureGroup[] {
  const groups: PlaceholderTextureGroup[] = [];
  for (const age of AGES) {
    groups.push({
      title: `${age.name}: units and turrets (player)`,
      keys: [
        ...UNIT_DEFINITIONS.filter((d) => d.age === age.index).map((d) => textureKeyFor(d.spriteKey, 'player')),
        ...TURRET_DEFINITIONS.filter((d) => d.age === age.index).map((d) => textureKeyFor(d.spriteKey, 'player')),
      ],
    });
  }
  groups.push({
    title: 'Enemy side (Stone sample)',
    side: 'enemy',
    keys: [
      ...UNIT_DEFINITIONS.filter((d) => d.age === 0).map((d) => textureKeyFor(d.spriteKey, 'enemy')),
      ...TURRET_DEFINITIONS.filter((d) => d.age === 0).map((d) => textureKeyFor(d.spriteKey, 'enemy')),
    ],
  });
  groups.push({ title: 'Projectiles', keys: projectileKeys() });
  groups.push({
    title: 'Bases by age (player, enemy)',
    keys: AGES.flatMap((age) => SIDES.map((side) => textureKeyFor(baseSpriteKey(age.index), side))),
  });
  return groups;
}

/* ---- Drawing ---------------------------------------------------------- */

/** A small dot in the age's accent color, so units of different ages differ. */
function drawAgeBadge(g: Phaser.GameObjects.Graphics, age: number, x: number, y: number): void {
  const accent = AGES[age]?.visuals.accent ?? 0xffffff;
  g.fillStyle(0x000000, 0.5);
  g.fillCircle(x, y, 5);
  g.fillStyle(accent, 1);
  g.fillCircle(x, y, 4);
}

function drawUnit(
  g: Phaser.GameObjects.Graphics,
  def: UnitDefinition,
  palette: SidePalette,
): void {
  const { w, h } = unitSize(def);
  g.fillStyle(palette.main, 1);
  g.lineStyle(3, palette.dark, 1);

  switch (def.slot) {
    case 1:
      g.fillRoundedRect(2, 2, w - 4, h - 4, 6);
      g.strokeRoundedRect(2, 2, w - 4, h - 4, 6);
      break;
    case 2:
      g.fillTriangle(w / 2, 2, w - 2, h - 2, 2, h - 2);
      g.strokeTriangle(w / 2, 2, w - 2, h - 2, 2, h - 2);
      break;
    case 3:
      g.fillRoundedRect(2, 2, w - 4, h - 4, 10);
      g.lineStyle(4, palette.dark, 1);
      g.strokeRoundedRect(2, 2, w - 4, h - 4, 10);
      g.fillStyle(palette.light, 1);
      g.fillRect(10, 10, w - 20, 10);
      break;
    case 4:
      g.fillEllipse(w / 2, h / 2, w - 4, h - 4);
      g.strokeEllipse(w / 2, h / 2, w - 4, h - 4);
      g.fillStyle(COIN_COLOR, 1);
      g.fillCircle(w / 2, h / 2, 7);
      break;
    case 5: {
      const diamond = [
        { x: w / 2, y: 2 },
        { x: w - 2, y: h / 2 },
        { x: w / 2, y: h - 2 },
        { x: 2, y: h / 2 },
      ];
      g.fillPoints(diamond, true);
      g.strokePoints(diamond, true);
      // The cross takes the color of the unit's utility effect.
      g.fillStyle(UTILITY_COLORS[def.utility?.kind ?? 'heal'], 1);
      g.fillRect(w / 2 - 2, h / 2 - 8, 4, 16);
      g.fillRect(w / 2 - 8, h / 2 - 2, 16, 4);
      break;
    }
  }
  drawAgeBadge(g, def.age, w / 2, Math.round(h * 0.3));
}

function drawTurret(
  g: Phaser.GameObjects.Graphics,
  def: TurretDefinition,
  palette: SidePalette,
): void {
  g.lineStyle(3, palette.dark, 1);
  switch (def.kind) {
    case 'rapid':
      g.fillStyle(METAL_COLOR, 1);
      g.fillRect(28, 16, 18, 6);
      g.fillStyle(palette.main, 1);
      g.fillRect(6, 22, 32, 22);
      g.strokeRect(6, 22, 32, 22);
      break;
    case 'heavy':
      g.fillStyle(METAL_COLOR, 1);
      g.fillRect(24, 8, 22, 13);
      g.fillStyle(palette.main, 1);
      g.fillRect(4, 18, 38, 26);
      g.strokeRect(4, 18, 38, 26);
      break;
    case 'area':
      g.fillStyle(METAL_COLOR, 1);
      g.fillRect(22, 6, 10, 22);
      g.fillStyle(FIRE_COLOR, 1);
      g.fillCircle(27, 6, 5);
      g.fillStyle(palette.main, 1);
      g.fillCircle(24, 33, 14);
      g.strokeCircle(24, 33, 14);
      break;
  }
  drawAgeBadge(g, def.age, 14, 36);
}

function drawBase(g: Phaser.GameObjects.Graphics, palette: SidePalette, age: number): void {
  const { w, h } = BASE_SIZE;
  switch (age) {
    case 0: {
      // Stone: a thatched hut behind a palisade, with a banner.
      g.fillStyle(0x8b5a2b, 1);
      g.lineStyle(4, 0x5a3a1a, 1);
      g.fillRect(16, 96, w - 32, h - 98);
      g.strokeRect(16, 96, w - 32, h - 98);
      g.fillStyle(0xc8a24a, 1);
      g.fillTriangle(4, 102, w / 2, 44, w - 4, 102);
      g.fillStyle(0x6b4423, 1);
      for (let i = 0; i < 8; i++) {
        const x = 3 + i * 14.5;
        g.fillRect(x, 150, 10, 50);
        g.fillTriangle(x, 150, x + 5, 138, x + 10, 150);
      }
      g.fillStyle(palette.dark, 1);
      g.fillRect(w / 2 - 14, h - 62, 28, 60);
      g.fillStyle(0x5a3a1a, 1);
      g.fillRect(w / 2 - 2, 10, 4, 38);
      g.fillStyle(palette.main, 1);
      g.fillTriangle(w / 2 + 2, 10, w / 2 + 34, 19, w / 2 + 2, 28);
      break;
    }
    case 1: {
      // Castle: a stone tower with battlements.
      g.fillStyle(palette.main, 1);
      g.lineStyle(4, palette.dark, 1);
      g.fillRect(10, 40, w - 20, h - 42);
      g.strokeRect(10, 40, w - 20, h - 42);
      for (let i = 0; i < 4; i++) {
        g.fillRect(10 + i * 28, 22, 22, 18);
        g.strokeRect(10 + i * 28, 22, 22, 18);
      }
      g.fillStyle(palette.dark, 1);
      g.fillRect(w / 2 - 14, h - 72, 28, 70);
      g.fillStyle(palette.light, 1);
      g.fillRect(w / 2 - 3, 70, 6, 24);
      break;
    }
    case 2: {
      // Renaissance: a plastered tower with a pointed roof and windows.
      g.fillStyle(0xe8dcc0, 1);
      g.lineStyle(4, palette.dark, 1);
      g.fillRect(14, 70, w - 28, h - 72);
      g.strokeRect(14, 70, w - 28, h - 72);
      g.fillStyle(palette.main, 1);
      g.fillTriangle(4, 74, w / 2, 6, w - 4, 74);
      g.fillStyle(palette.light, 1);
      g.fillRect(28, 92, 18, 24);
      g.fillRect(w - 46, 92, 18, 24);
      g.fillStyle(palette.dark, 1);
      g.fillRect(w / 2 - 14, h - 66, 28, 64);
      break;
    }
    case 3: {
      // Modern: a concrete bunker with a painted stripe and an antenna.
      g.fillStyle(0x5a5a5a, 1);
      g.fillRect(w - 28, 34, 3, 60);
      g.fillCircle(w - 26, 34, 6);
      g.fillStyle(0x8c8c8c, 1);
      g.lineStyle(4, 0x555555, 1);
      g.fillRect(6, 92, w - 12, h - 94);
      g.strokeRect(6, 92, w - 12, h - 94);
      g.fillStyle(palette.main, 1);
      g.fillRect(6, 124, w - 12, 14);
      g.fillStyle(0x2a2a2a, 1);
      g.fillRect(20, 102, w - 40, 8);
      g.fillStyle(palette.dark, 1);
      g.fillRect(w / 2 - 14, h - 56, 28, 54);
      break;
    }
    default: {
      // Future: a slim tower with a glowing dome and an antenna.
      g.fillStyle(0x9aa8b8, 1);
      g.fillRect(w / 2 - 2, 2, 4, 30);
      g.fillStyle(0x00e5ff, 1);
      g.fillCircle(w / 2, 4, 4);
      g.fillStyle(palette.light, 0.9);
      g.fillCircle(w / 2, 64, 32);
      g.fillStyle(0xdde6f0, 1);
      g.lineStyle(3, palette.main, 1);
      g.fillRect(22, 64, w - 44, h - 66);
      g.strokeRect(22, 64, w - 44, h - 66);
      g.fillStyle(palette.main, 1);
      for (let i = 0; i < 3; i++) g.fillRect(28, 88 + i * 18, w - 56, 5);
      g.fillStyle(palette.dark, 1);
      g.fillRoundedRect(w / 2 - 12, h - 50, 24, 48, 8);
      break;
    }
  }
}

function drawProjectile(
  g: Phaser.GameObjects.Graphics,
  style: ProjectileStyle,
): void {
  g.fillStyle(style.color, 1);
  if (style.shape === 'circle') {
    g.fillCircle(style.w / 2, style.h / 2, Math.min(style.w, style.h) / 2);
  } else if (style.shape === 'comet') {
    // Drawn flying right: a fiery tail on the left, the rock on the right.
    const r = style.h / 2;
    g.fillStyle(FIRE_COLOR, 0.5);
    g.fillTriangle(0, r, style.w - r, 1, style.w - r, style.h - 1);
    g.fillStyle(0xf2c744, 0.8);
    g.fillTriangle(style.w * 0.35, r, style.w - r, 4, style.w - r, style.h - 4);
    g.fillStyle(style.color, 1);
    g.fillCircle(style.w - r, r, r);
  } else {
    g.fillRect(0, 0, style.w, style.h);
  }
}

/* ---- Entry point ------------------------------------------------------ */

/**
 * Creates every placeholder texture that doesn't exist yet. Safe to call
 * more than once. Textures live in the game-wide texture manager, so the
 * scene passed in is only used as a factory.
 */
export function generatePlaceholderTextures(scene: Phaser.Scene): void {
  const textures = scene.textures;
  const g = scene.make.graphics({}, false);

  const build = (
    key: string,
    w: number,
    h: number,
    draw: () => void,
  ): void => {
    if (textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  for (const side of SIDES) {
    const palette = SIDE_PALETTE[side];

    for (const def of UNIT_DEFINITIONS) {
      const { w, h } = unitSize(def);
      build(textureKeyFor(def.spriteKey, side), w, h, () =>
        drawUnit(g, def, palette),
      );
    }

    for (const def of TURRET_DEFINITIONS) {
      build(textureKeyFor(def.spriteKey, side), TURRET_SIZE, TURRET_SIZE, () =>
        drawTurret(g, def, palette),
      );
    }

    for (const age of AGES) {
      build(textureKeyFor(baseSpriteKey(age.index), side), BASE_SIZE.w, BASE_SIZE.h, () =>
        drawBase(g, palette, age.index),
      );
    }
  }

  for (const key of projectileKeys()) {
    const style = PROJECTILE_STYLES[key] ?? DEFAULT_PROJECTILE_STYLE;
    build(key, style.w, style.h, () => drawProjectile(g, style));
  }

  g.destroy();
}
