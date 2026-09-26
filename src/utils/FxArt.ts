import Phaser from 'phaser';
import { drawFx, drawProjectile, FX_SIZE, PROJECTILE_SIZE, type FxTextureId } from '@/art/fxDraw';
import { RENDER_SCALE } from '@utils/renderScale';

/** Projectile and particle textures are drawn this many times sharper than shown. */
export const FX_SUPERSAMPLE = Math.min(3, Math.max(2, RENDER_SCALE));

/** Drawn size of a projectile, px; unknown keys get a small glowing orb. */
export function projectileSize(key: string): readonly [number, number] {
  return PROJECTILE_SIZE[key] ?? [10, 10];
}

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const k = FX_SUPERSAMPLE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * k);
  canvas.height = Math.ceil(h * k);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.translate(canvas.width / 2, canvas.height / 2);
  c.scale(k, k);
  draw(c);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Draws the projectile textures (under the projectile keys used by units,
 * turrets and specials) and the effect particle textures. Call once at boot,
 * before the placeholder art (which then skips the keys that exist).
 * Projectiles are shown at `1 / FX_SUPERSAMPLE` scale (see `Projectile`).
 */
export function generateFxArt(scene: Phaser.Scene, projectileKeys: readonly string[]): void {
  for (const key of projectileKeys) {
    const [w, h] = projectileSize(key);
    paint(scene, key, w, h, (c) => drawProjectile(c, key));
  }
  for (const [id, [w, h]] of Object.entries(FX_SIZE) as [FxTextureId, readonly [number, number]][]) {
    paint(scene, id, w, h, (c) => drawFx(c, id));
  }
}
