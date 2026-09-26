import Phaser from 'phaser';
import { BASE_BOX, drawBase, drawBaseDamage, drawLedge } from '@/art/baseDraw';
import type { Side } from '@state/types';
import { RENDER_SCALE } from '@utils/renderScale';
import { TEAM_COLORS } from '@utils/RigArt';

/** Base art is drawn this many times sharper than shown. */
export const BASE_SUPERSAMPLE = Math.min(2.5, Math.max(1.5, RENDER_SCALE));

export function baseArtKey(age: number, side: Side): string {
  return `base-art-${age}@${side}`;
}

export function ledgeArtKey(age: number, side: Side): string {
  return `base-ledge-${age}@${side}`;
}

export function baseDamageKey(level: 1 | 2): string {
  return `base-damage-${level}`;
}

/** Ledge texture box around its top-center. */
const LEDGE = { minX: -26, maxX: 26, minY: -2, maxY: 20 } as const;
export const LEDGE_ORIGIN = { x: 0.5, y: -LEDGE.minY / (LEDGE.maxY - LEDGE.minY) } as const;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, ox: number, oy: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const k = BASE_SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.scale(k, k);
  c.translate(ox, oy);
  draw(c);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Draws a base's art for an age and side (plus its turret ledge and the
 * shared crack overlays) if not drawn yet. The base texture is exactly the
 * placeholder's 120 x 200 box (times the supersample), so the base's size
 * for hits is unchanged.
 */
export function ensureBaseArt(scene: Phaser.Scene, age: number, side: Side): void {
  const team = TEAM_COLORS[side];
  paint(scene, baseArtKey(age, side), BASE_BOX.w, BASE_BOX.h, BASE_BOX.w / 2, BASE_BOX.h, (c) => drawBase(c, age, team));
  paint(scene, ledgeArtKey(age, side), LEDGE.maxX - LEDGE.minX, LEDGE.maxY - LEDGE.minY, -LEDGE.minX, -LEDGE.minY, (c) =>
    drawLedge(c, age, team),
  );
  for (const level of [1, 2] as const) {
    paint(scene, baseDamageKey(level), BASE_BOX.w, BASE_BOX.h, BASE_BOX.w / 2, BASE_BOX.h, (c) => drawBaseDamage(c, level));
  }
}
