import Phaser from 'phaser';
import { SCENE_KEYS } from '@config/constants';
import { UI_FONT_FACES } from '@ui/kenneyUi';

/** How long to wait for the UI fonts before drawing text anyway. */
const FONT_TIMEOUT_MS = 2500;

/**
 * First scene: waits for the UI fonts (text drawn before they load would
 * use a fallback font and keep it), then hands over to preloading.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.boot });
  }

  create(): void {
    const fonts = Promise.all(UI_FONT_FACES.map((face) => document.fonts.load(face)));
    const timeout = new Promise((resolve) => window.setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fonts, timeout])
      .catch(() => undefined)
      .then(() => this.scene.start(SCENE_KEYS.preload));
  }
}
