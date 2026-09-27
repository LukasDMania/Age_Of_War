import Phaser from 'phaser';
import { drawMechDesign, type MechLook } from '@/art/mechDraw';
import { RIG_SUPERSAMPLE, rigArt, type RigBox, type UnitArt } from '@config/unitArt.config';
import { MECH } from '@config/mech.config';
import { parseMechId } from '@entities/mechDesign';

/**
 * Art of the player's Mech (the Mech workshop): a Mech unit's sprite sheets
 * are rig sheets whose frames `art/mechDraw.ts` draws from the design in its
 * id, so every design looks like its parts. `utils/RigArt.ts` draws the
 * sheets on demand like any rig unit's; the Workshop tab's preview is one
 * frame redrawn in place (no sheets while you try parts).
 */

/**
 * Drawn extent over every frame, in rig units: measured with
 * `/artlab.html?mechs&bounds` over the six showcase designs in all ages
 * (live [-28, 67, -109, 5], die [-28, 54, -106, 18]), plus a margin for
 * the other combinations.
 */
const LIVE: RigBox = [-32, 70, -112, 6];
const DIE: RigBox = [-32, 58, -108, 20];
const ICON: RigBox = [-32, 46, -112, 6];
/** Screen px per rig unit: about 125 px tall, twice a heavy. */
const PX_PER_UNIT = 1.15;

const cache = new Map<string, UnitArt>();

/** The UnitArt of a Mech unit id, or undefined for any other id. */
export function mechUnitArt(unitId: string): UnitArt | undefined {
  const cached = cache.get(unitId);
  if (cached) return cached;
  const parsed = parseMechId(unitId);
  if (!parsed) return undefined;
  const look: MechLook = { ...parsed.design, age: parsed.age };
  const art = rigArt('mech', LIVE, DIE, PX_PER_UNIT, MECH.attackRate, ICON);
  art.rig = { ...art.rig!, draw: (c, team, anim, u) => drawMechDesign(c, look, team, anim, u) };
  cache.set(unitId, art);
  return art;
}

/** Size of the Workshop preview texture, in shown px. */
export const MECH_PREVIEW_SIZE = { width: 118, height: 128 } as const;

/**
 * Draws a design's standing frame into the texture `key` (made on first
 * use, redrawn in place after). Returns the key.
 */
export function drawMechPreview(scene: Phaser.Scene, key: string, look: MechLook, team: string): string {
  const k = RIG_SUPERSAMPLE;
  const w = Math.round(MECH_PREVIEW_SIZE.width * k);
  const h = Math.round(MECH_PREVIEW_SIZE.height * k);
  let texture = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  if (!texture) {
    texture = scene.textures.createCanvas(key, w, h);
    if (!texture) return key;
  }
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  // Fit the live box into the preview, feet at the bottom.
  const scale = Math.min(w / (LIVE[1] - LIVE[0]), h / (LIVE[3] - LIVE[2]));
  ctx.translate(w / 2 - ((LIVE[0] + LIVE[1]) / 2) * scale, h - LIVE[3] * scale);
  ctx.scale(scale, scale);
  drawMechDesign(ctx, look, team, 'stand', 0);
  ctx.restore();
  texture.refresh();
  return key;
}
