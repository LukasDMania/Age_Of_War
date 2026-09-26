import Phaser from 'phaser';
import { drawRig, type RigAnim } from '@/art/rigDraw';
import { RIG_SUPERSAMPLE, UNIT_ART, unitArtKey, type UnitArt, type UnitArtAnim } from '@config/unitArt.config';
import { SIDES, type Side } from '@state/types';

/** Team colors on rig art (belts, headbands, saddles), matching the placeholders. */
const TEAM_COLORS: Record<Side, string> = { player: '#3d7fd9', enemy: '#d9483d' };

/**
 * Draws every rig unit's sprite sheets at boot (Phase 16) and registers them
 * as textures with numbered frames, so `registerUnitArt` can build the same
 * walk/attack animations as for loaded sheets. One set per side, since the
 * team color is part of the drawing. Drawn `RIG_SUPERSAMPLE` times larger
 * than shown so they stay sharp on high-resolution screens.
 */
export function generateRigArt(scene: Phaser.Scene): void {
  for (const [unitId, art] of Object.entries(UNIT_ART)) {
    if (!art?.rig) continue;
    for (const side of SIDES) {
      addSheet(scene, unitId, art, 'walk', side);
      addSheet(scene, unitId, art, 'attack', side);
      addSheet(scene, unitId, art, 'die', side);
    }
  }
}

function addSheet(scene: Phaser.Scene, unitId: string, art: UnitArt, anim: UnitArtAnim, side: Side): void {
  const rig = art.rig;
  const key = unitArtKey(unitId, anim, side);
  if (!rig || scene.textures.exists(key)) return;
  const spec = art[anim];
  if (!spec) return;
  const frames = spec.frames;
  const canvas = document.createElement('canvas');
  canvas.width = art.frameWidth * frames;
  canvas.height = art.frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = rig.pxPerUnit * RIG_SUPERSAMPLE;
  for (let i = 0; i < frames; i++) {
    // Walk strip: frame 0 stands, 1..n loop through one stride.
    let rigAnim: RigAnim = anim;
    let u = i / frames;
    if (anim === 'walk') {
      rigAnim = i === 0 ? 'stand' : 'walk';
      u = (i - 1) / (frames - 1);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * art.frameWidth, 0, art.frameWidth, art.frameHeight);
    ctx.clip();
    ctx.translate(i * art.frameWidth + art.frameWidth / 2, rig.footRig * scale);
    ctx.scale(scale, scale);
    drawRig(ctx, rig.kind, TEAM_COLORS[side], rigAnim, u);
    ctx.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) return;
  for (let i = 0; i < frames; i++) texture.add(i, 0, i * art.frameWidth, 0, art.frameWidth, art.frameHeight);
}
