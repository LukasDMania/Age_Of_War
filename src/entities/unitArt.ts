import Phaser from 'phaser';
import {
  UNIT_ART,
  UNIT_ART_ICON_FRAME,
  unitArtKey,
  unitArtUrl,
  type UnitArt,
  type UnitArtAnim,
} from '@config/unitArt.config';
import type { UnitDefinition } from '@entities/unitDefinitions';
import type { Side } from '@state/types';
import { textureKeyFor } from '@utils/PlaceholderArt';

const ANIMS: readonly UnitArtAnim[] = ['walk', 'attack'];

/** Queues every unit sheet. Call from a scene's `preload()`. */
export function loadUnitArt(scene: Phaser.Scene): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art) continue;
    for (const anim of ANIMS) {
      scene.load.spritesheet(unitArtKey(unitId, anim), unitArtUrl(unitId, art[anim].file), {
        frameWidth: art.frameWidth,
        frameHeight: art.frameHeight,
      });
    }
  }
}

/**
 * After loading: crisp pixel filtering, the global animations, and an icon
 * frame for the buy buttons. Call once from a scene's `create()`.
 */
export function registerUnitArt(scene: Phaser.Scene): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art) continue;
    for (const anim of ANIMS) {
      const key = unitArtKey(unitId, anim);
      const texture = scene.textures.get(key);
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      if (!scene.anims.exists(key)) {
        const spec = art[anim];
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, { start: spec.start ?? 0, end: spec.end ?? spec.frames - 1 }),
          frameRate: spec.frameRate,
          repeat: spec.repeat,
        });
      }
    }
    const walk = scene.textures.get(unitArtKey(unitId, 'walk'));
    if (!walk.has(UNIT_ART_ICON_FRAME)) {
      const { x, y, width, height } = art.icon;
      walk.add(UNIT_ART_ICON_FRAME, 0, art.standFrame * art.frameWidth + x, y, width, height);
    }
  }
}

export function unitArtFor(unitId: string): UnitArt | undefined {
  return UNIT_ART[unitId];
}

/** Texture and frame for a unit's icon (buy buttons, training queue). */
export function unitIcon(definition: UnitDefinition, side: Side): { key: string; frame?: string } {
  if (unitArtFor(definition.id)) return { key: unitArtKey(definition.id, 'walk'), frame: UNIT_ART_ICON_FRAME };
  return { key: textureKeyFor(definition.spriteKey, side) };
}
