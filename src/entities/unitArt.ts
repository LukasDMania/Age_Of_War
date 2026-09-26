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
import { ensureRigArt } from '@utils/RigArt';

const ANIMS: readonly UnitArtAnim[] = ['walk', 'attack', 'die'];

/** Queues every unit sheet. Call from a scene's `preload()`. */
export function loadUnitArt(scene: Phaser.Scene): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art || art.rig) continue; // rig sheets are drawn, not loaded
    for (const anim of ANIMS) {
      const spec = art[anim];
      if (!spec) continue;
      scene.load.spritesheet(unitArtKey(unitId, anim), unitArtUrl(unitId, spec.file), {
        frameWidth: art.frameWidth,
        frameHeight: art.frameHeight,
      });
    }
  }
}

/**
 * After loading: crisp pixel filtering, the global animations, and an icon
 * frame for the buy buttons, for loaded (non-rig) sheets. Rig sheets are
 * drawn and registered on demand by `utils/RigArt.ts`. Call once from a
 * scene's `create()`.
 */
export function registerUnitArt(scene: Phaser.Scene): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art || art.rig) continue;
    const sides: readonly (Side | undefined)[] = [undefined];
    for (const side of sides) {
      for (const anim of ANIMS) {
        const spec = art[anim];
        if (!spec) continue;
        const key = unitArtKey(unitId, anim, side);
        const texture = scene.textures.get(key);
        // Pixel art stays crisp with nearest filtering; rig art is smooth.
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        if (!scene.anims.exists(key)) {
          scene.anims.create({
            key,
            frames: scene.anims.generateFrameNumbers(key, { start: spec.start ?? 0, end: spec.end ?? spec.frames - 1 }),
            frameRate: spec.frameRate,
            repeat: spec.repeat,
          });
        }
      }
      const walk = scene.textures.get(unitArtKey(unitId, 'walk', side));
      if (!walk.has(UNIT_ART_ICON_FRAME)) {
        const { x, y, width, height } = art.icon;
        walk.add(UNIT_ART_ICON_FRAME, 0, art.standFrame * art.frameWidth + x, y, width, height);
      }
    }
  }
}

export function unitArtFor(unitId: string): UnitArt | undefined {
  return UNIT_ART[unitId];
}

/** Texture and frame for a unit's icon (buy buttons, training queue); draws rig art if needed. */
export function unitIcon(scene: Phaser.Scene, definition: UnitDefinition, side: Side): { key: string; frame?: string } {
  if (unitArtFor(definition.id)) {
    ensureRigArt(scene, definition.id);
    return { key: unitArtKey(definition.id, 'walk', side), frame: UNIT_ART_ICON_FRAME };
  }
  return { key: textureKeyFor(definition.spriteKey, side) };
}
