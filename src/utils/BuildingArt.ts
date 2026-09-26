import Phaser from 'phaser';
import { BUILDING_BOX, drawBuildingArt } from '@/art/buildingDraw';
import type { BuildingId } from '@config/buildings.config';
import type { Side } from '@state/types';
import { BASE_SUPERSAMPLE } from '@utils/BaseArt';
import { TEAM_COLORS } from '@utils/RigArt';

/** Building art is drawn at the base art's supersample. */
export const BUILDING_SUPERSAMPLE = BASE_SUPERSAMPLE;

/** Room above the 130 x 110 box for flags and smoke. */
const HEADROOM = 12;
export const BUILDING_ORIGIN_Y = (BUILDING_BOX.h + HEADROOM) / (BUILDING_BOX.h + HEADROOM + 4);

export function buildingArtKey(id: BuildingId, level: number, side: Side): string {
  return `building-art-${id}-L${level}@${side}`;
}

/**
 * Draws a building's picture at a level (0 = not built) for a side, if it
 * isn't drawn yet. 25 levels x 6 buildings x 2 sides would be a lot of
 * texture memory, so buildings draw only the level they show and free the
 * old one (`releaseBuildingArt`).
 */
export function ensureBuildingArt(scene: Phaser.Scene, id: BuildingId, level: number, side: Side): string {
  const key = buildingArtKey(id, level, side);
  if (scene.textures.exists(key)) return key;
  const k = BUILDING_SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(BUILDING_BOX.w * k);
  canvas.height = Math.round((BUILDING_BOX.h + HEADROOM + 4) * k);
  const c = canvas.getContext('2d');
  if (c) {
    c.scale(k, k);
    c.translate(BUILDING_BOX.w / 2, BUILDING_BOX.h + HEADROOM);
    drawBuildingArt(c, id, Math.max(1, level), TEAM_COLORS[side]);
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

export function releaseBuildingArt(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
}
