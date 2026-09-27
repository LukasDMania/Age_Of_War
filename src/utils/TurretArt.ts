import Phaser from 'phaser';
import {
  drawTurretFlash,
  drawTurretHead,
  drawTurretMount,
  TURRET_HEAD_BOX,
  TURRET_MOTION,
  TURRET_MOUNT_BOX,
  type TurretArtId,
} from '@/art/turretDraw';
import type { Side } from '@state/types';
import { RENDER_SCALE } from '@utils/renderScale';
import { TEAM_COLORS } from '@utils/RigArt';

/** Turret art is drawn this many times sharper than shown (it is small). */
export const TURRET_SUPERSAMPLE = Math.min(3, Math.max(2, RENDER_SCALE));

/** Highest upgrade level with its own look. */
const MAX_ART_LEVEL = 3;

export function turretArtId(spriteKey: string): TurretArtId {
  return spriteKey.replace(/^turret-/, '') as TurretArtId;
}

export function turretMountKey(id: TurretArtId, level: number, side: Side): string {
  return `turret-art-${id}-mount-L${Math.min(level, MAX_ART_LEVEL)}@${side}`;
}

export function turretHeadKey(id: TurretArtId, level: number, side: Side): string {
  return `turret-art-${id}-head-L${Math.min(level, MAX_ART_LEVEL)}@${side}`;
}

/** A turret's whole look (mount plus head at rest) in one texture, for the HUD. */
export function turretIconKey(id: TurretArtId, level: number, side: Side): string {
  return `turret-art-${id}-icon-L${Math.min(level, MAX_ART_LEVEL)}@${side}`;
}

/** Room for the mount and a head at rest on its pivot. */
const ICON_BOX = { minX: -30, maxX: 46, minY: -50, maxY: 4 } as const;

/**
 * Draws (once) and returns a turret's icon: the mount with the head on its
 * pivot at its rest angle, the way it stands on the base.
 */
export function ensureTurretIcon(scene: Phaser.Scene, id: TurretArtId, level: number, side: Side): string {
  const key = turretIconKey(id, level, side);
  if (scene.textures.exists(key)) return key;
  const lv = Math.min(level, MAX_ART_LEVEL);
  const team = TEAM_COLORS[side];
  const motion = TURRET_MOTION[id];
  const k = TURRET_SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((ICON_BOX.maxX - ICON_BOX.minX) * k);
  canvas.height = Math.ceil((ICON_BOX.maxY - ICON_BOX.minY) * k);
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return key;
  c.translate(-ICON_BOX.minX * k, -ICON_BOX.minY * k);
  c.scale(k, k);
  drawTurretMount(c, id, team, lv);
  c.save();
  c.translate(motion.pivot[0], motion.pivot[1]);
  c.rotate(-motion.rest);
  drawTurretHead(c, id, team, lv);
  c.restore();
  scene.textures.addCanvas(key, trimmed(canvas));
  return key;
}

/** A copy of a canvas cut to its drawn pixels (plus a pixel of margin), so icons fill their buttons. */
function trimmed(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return canvas;
  const { width, height } = canvas;
  const data = c.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return canvas;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 3;
  out.height = maxY - minY + 3;
  out.getContext('2d')?.drawImage(canvas, minX - 1, minY - 1, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function turretFlashKey(kind: 'fire' | 'laser' | 'plasma'): string {
  return `turret-flash-${kind}`;
}

/** Origins (as fractions) of the mount and head textures. */
export const TURRET_MOUNT_ORIGIN = {
  x: -TURRET_MOUNT_BOX.minX / (TURRET_MOUNT_BOX.maxX - TURRET_MOUNT_BOX.minX),
  y: -TURRET_MOUNT_BOX.minY / (TURRET_MOUNT_BOX.maxY - TURRET_MOUNT_BOX.minY),
};
export const TURRET_HEAD_ORIGIN = {
  x: -TURRET_HEAD_BOX.minX / (TURRET_HEAD_BOX.maxX - TURRET_HEAD_BOX.minX),
  y: -TURRET_HEAD_BOX.minY / (TURRET_HEAD_BOX.maxY - TURRET_HEAD_BOX.minY),
};
const FLASH_BOX = { minX: -12, maxX: 26, minY: -14, maxY: 14 } as const;
export const TURRET_FLASH_ORIGIN = {
  x: -FLASH_BOX.minX / (FLASH_BOX.maxX - FLASH_BOX.minX),
  y: -FLASH_BOX.minY / (FLASH_BOX.maxY - FLASH_BOX.minY),
};

type Box = { minX: number; maxX: number; minY: number; maxY: number };

function draw(scene: Phaser.Scene, key: string, box: Box, paint: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const k = TURRET_SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((box.maxX - box.minX) * k);
  canvas.height = Math.ceil((box.maxY - box.minY) * k);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.translate(-box.minX * k, -box.minY * k);
  c.scale(k, k);
  paint(c);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Draws a turret's mount and head at an upgrade level for one side, plus
 * the shared muzzle flashes, if not drawn yet (textures are game-wide).
 */
export function ensureTurretArt(scene: Phaser.Scene, id: TurretArtId, level: number, side: Side): void {
  const lv = Math.min(level, MAX_ART_LEVEL);
  const team = TEAM_COLORS[side];
  draw(scene, turretMountKey(id, lv, side), TURRET_MOUNT_BOX, (c) => drawTurretMount(c, id, team, lv));
  draw(scene, turretHeadKey(id, lv, side), TURRET_HEAD_BOX, (c) => drawTurretHead(c, id, team, lv));
  for (const kind of ['fire', 'laser', 'plasma'] as const) {
    draw(scene, turretFlashKey(kind), FLASH_BOX, (c) => drawTurretFlash(c, kind));
  }
}
