import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';

/**
 * Crisp rendering (owner, 2026-09-26: "everything is slightly blurry").
 * The game is laid out in a fixed 1280x720 space, but the canvas used to be
 * exactly 1280x720 pixels and was then stretched by CSS to fill the window
 * (and again by the screen's pixel ratio), which blurs everything. Now the
 * canvas is created at the size it is actually shown at (window fit x device
 * pixel ratio, capped at 3x) and every camera zooms by that factor, so text,
 * shapes and art are drawn at full screen resolution while all game code
 * keeps using 1280x720 coordinates.
 */
function computeRenderScale(): number {
  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const scale = fit * (window.devicePixelRatio || 1);
  return Math.min(3, Math.max(1, Math.ceil(scale * 4) / 4));
}

export const RENDER_SCALE = computeRenderScale();

/** Zooms a camera so the 1280x720 layout fills the high-resolution canvas. */
export function applyRenderScale(camera: Phaser.Cameras.Scene2D.Camera): void {
  camera.setOrigin(0, 0).setZoom(RENDER_SCALE);
}

/**
 * Text is drawn to its own small canvas; render it at the same scale so it
 * stays sharp. Wraps the `this.add.text` factory once, for every scene.
 */
export function installCrispText(): void {
  const proto = Phaser.GameObjects.GameObjectFactory.prototype;
  const original = proto.text;
  proto.text = function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return original.call(this, x, y, text, { resolution: RENDER_SCALE, ...style });
  };
}
