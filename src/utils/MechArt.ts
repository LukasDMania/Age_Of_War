import Phaser from 'phaser';
import { drawMechDesign, type MechLook } from '@/art/mechDraw';
import type { RigAnim } from '@/art/rigFigure';
import { RIG_SUPERSAMPLE, rigArt, type RigBox, type UnitArt } from '@config/unitArt.config';
import { MECH, type MechSlot } from '@config/mech.config';
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
 * (live [-29, 67, -116, 5], die [-28, 54, -114, 18]; Striders stand
 * tallest), plus a margin for the other combinations.
 */
const LIVE: RigBox = [-32, 70, -120, 6];
const DIE: RigBox = [-32, 58, -118, 20];
const ICON: RigBox = [-32, 46, -120, 6];
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

/** Default size of a preview texture, in shown px. */
export const MECH_PREVIEW_SIZE = { width: 118, height: 128 } as const;

export interface MechPreviewOptions {
  /** Shown size in px (default `MECH_PREVIEW_SIZE`). */
  width?: number;
  height?: number;
  /** Texture px per shown px (default the rig supersample). */
  supersample?: number;
  anim?: RigAnim;
  /** Phase through `anim`, 0..1. */
  u?: number;
  /** Only these slots (the scaffold while a Mech is put together). */
  parts?: ReadonlySet<MechSlot>;
  /** Drawn as blue blueprint lines (a part you haven't unlocked). */
  blueprint?: boolean;
}

/** How rig units map into a preview of this size: px per unit and where the feet are. */
export function mechPreviewFit(width: number, height: number): { scale: number; feetX: number; feetY: number } {
  const scale = Math.min(width / (LIVE[1] - LIVE[0]), height / (LIVE[3] - LIVE[2]));
  return { scale, feetX: width / 2 - ((LIVE[0] + LIVE[1]) / 2) * scale, feetY: height - LIVE[3] * scale };
}

let scratch: HTMLCanvasElement | null = null;

/**
 * Draws one frame of a design into the texture `key` (made on first use,
 * redrawn in place after), feet at the bottom. Returns the key.
 */
export function drawMechPreview(scene: Phaser.Scene, key: string, look: MechLook, team: string, options: MechPreviewOptions = {}): string {
  const k = options.supersample ?? RIG_SUPERSAMPLE;
  const w = Math.round((options.width ?? MECH_PREVIEW_SIZE.width) * k);
  const h = Math.round((options.height ?? MECH_PREVIEW_SIZE.height) * k);
  let texture = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  if (texture && (texture.width !== w || texture.height !== h)) {
    scene.textures.remove(key);
    texture = null;
  }
  if (!texture) {
    texture = scene.textures.createCanvas(key, w, h);
    if (!texture) return key;
  }
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, w, h);
  const paint = (c: CanvasRenderingContext2D): void => {
    const fit = mechPreviewFit(w, h);
    c.save();
    c.translate(fit.feetX, fit.feetY);
    c.scale(fit.scale, fit.scale);
    drawMechDesign(c, look, team, options.anim ?? 'stand', options.u ?? 0, options.parts);
    c.restore();
  };
  if (options.blueprint) {
    // Draw it aside, turn it blue, then lay it down see-through.
    scratch ??= document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    const s = scratch.getContext('2d');
    if (s) {
      paint(s);
      s.globalCompositeOperation = 'source-atop';
      s.fillStyle = 'rgba(80,150,255,0.82)';
      s.fillRect(0, 0, w, h);
      s.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.75;
      ctx.drawImage(scratch, 0, 0);
      ctx.globalAlpha = 1;
    }
  } else {
    paint(ctx);
  }
  texture.refresh();
  return key;
}
