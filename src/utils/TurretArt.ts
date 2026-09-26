import Phaser from 'phaser';
import {
  drawTurretFlash,
  drawTurretHead,
  drawTurretMount,
  TURRET_HEAD_BOX,
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
