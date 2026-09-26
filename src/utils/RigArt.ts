import Phaser from 'phaser';
import { drawRig, type RigAnim } from '@/art/rigDraw';
import {
  RIG_SUPERSAMPLE,
  UNIT_ART,
  UNIT_ART_ICON_FRAME,
  unitArtKey,
  type RigBox,
  type UnitArt,
  type UnitArtAnim,
} from '@config/unitArt.config';
import { findUnitDefinition, UNIT_DEFINITIONS } from '@entities/unitDefinitions';
import { SIDES, type Side } from '@state/types';
import { HEADLESS_SIM } from '@utils/runtimeFlags';

/** Team colors on rig art (belts, headbands, saddles), matching the placeholders. */
export const TEAM_COLORS: Record<Side, string> = { player: '#3d7fd9', enemy: '#d9483d' };

/** Widest texture we create; wider strips wrap into rows. */
const MAX_TEXTURE_WIDTH = 4096;

const ANIMS: readonly UnitArtAnim[] = ['walk', 'attack', 'die'];

/**
 * Rig unit sprite sheets (Phase 16, all ages since 2026-09-26). Sheets are
 * drawn with canvas at `RIG_SUPERSAMPLE` times their shown size, one set per
 * side (team colors are part of the drawing), and registered as textures
 * with numbered frames plus their animations.
 *
 * Twenty-five units x two sides would hold a lot of texture memory, so
 * sheets are made on demand: an age's units when a side reaches it (and the
 * Stone age at boot), or any single unit the moment one is needed. Ages no
 * longer in play are released again (`releaseRigArtOutside`).
 *
 * Textures and animations are game-wide in Phaser, so any scene can be used
 * to create them; the functions take one only to reach those managers.
 */
export function ensureRigArtForAge(scene: Phaser.Scene, age: number): void {
  for (const def of UNIT_DEFINITIONS) if (def.age === age) ensureRigArt(scene, def.id);
}

/** Draws and registers a rig unit's sheets (both sides) if they don't exist yet. */
export function ensureRigArt(scene: Phaser.Scene, unitId: string): void {
  const art = UNIT_ART[unitId];
  if (!art?.rig || HEADLESS_SIM) return;
  for (const side of SIDES) {
    for (const anim of ANIMS) {
      if (!art[anim]) continue;
      const key = unitArtKey(unitId, anim, side);
      if (scene.textures.exists(key)) continue;
      addSheet(scene, key, art, anim, side);
      const spec = art[anim]!;
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, { start: spec.start ?? 0, end: spec.end ?? spec.frames - 1 }),
          frameRate: spec.frameRate,
          repeat: spec.repeat,
        });
      }
      if (anim === 'walk') {
        const walk = scene.textures.get(key);
        const { x, y, width, height } = art.icon;
        const stand = walk.get(art.standFrame);
        walk.add(UNIT_ART_ICON_FRAME, 0, stand.cutX + x, stand.cutY + y, width, height);
      }
    }
  }
}

/**
 * Frees the sheets of rig units whose age is outside `[minAge, maxAge]`,
 * except units listed in `inUse` (still on the lane or dying). Their
 * animations are removed with them; `ensureRigArt` recreates both if needed.
 */
export function releaseRigArtOutside(scene: Phaser.Scene, minAge: number, maxAge: number, inUse: ReadonlySet<string>): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art?.rig || inUse.has(unitId)) continue;
    const age = findUnitDefinition(unitId)?.age ?? 0;
    if (age >= minAge && age <= maxAge) continue;
    for (const side of SIDES) {
      for (const anim of ANIMS) {
        const key = unitArtKey(unitId, anim, side);
        if (scene.anims.exists(key)) scene.anims.remove(key);
        if (scene.textures.exists(key)) scene.textures.remove(key);
      }
    }
  }
}

/** Texture memory the rig sheets currently use, in bytes (debug handle). */
export function rigArtBytes(scene: Phaser.Scene): number {
  let bytes = 0;
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art?.rig) continue;
    for (const side of SIDES) {
      for (const anim of ANIMS) {
        const key = unitArtKey(unitId, anim, side);
        if (!scene.textures.exists(key)) continue;
        const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
        bytes += source.width * source.height * 4;
      }
    }
  }
  return bytes;
}

function addSheet(scene: Phaser.Scene, key: string, art: UnitArt, anim: UnitArtAnim, side: Side): void {
  const rig = art.rig;
  const spec = art[anim];
  if (!rig || !spec) return;
  const box: RigBox = anim === 'die' ? rig.die : rig.live;
  const scale = rig.pxPerUnit * RIG_SUPERSAMPLE;
  const fw = anim === 'die' && art.dieBox ? art.dieBox.frameWidth : art.frameWidth;
  const fh = anim === 'die' && art.dieBox ? art.dieBox.frameHeight : art.frameHeight;
  const frames = spec.frames;
  const cols = Math.max(1, Math.min(frames, Math.floor(MAX_TEXTURE_WIDTH / fw)));
  const rows = Math.ceil(frames / cols);
  const canvas = document.createElement('canvas');
  canvas.width = fw * cols;
  canvas.height = fh * rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  for (let i = 0; i < frames; i++) {
    // Walk strip: frame 0 stands, 1..n loop through one stride.
    let rigAnim: RigAnim = anim;
    let u = i / frames;
    if (anim === 'walk') {
      rigAnim = i === 0 ? 'stand' : 'walk';
      u = (i - 1) / (frames - 1);
    }
    const fx = (i % cols) * fw;
    const fy = Math.floor(i / cols) * fh;
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, fy, fw, fh);
    ctx.clip();
    ctx.translate(fx - box[0] * scale, fy - box[2] * scale);
    ctx.scale(scale, scale);
    drawRig(ctx, rig.kind, TEAM_COLORS[side], rigAnim, u);
    ctx.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) return;
  for (let i = 0; i < frames; i++) texture.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
}
