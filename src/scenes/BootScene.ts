import Phaser from 'phaser';
import { SCENE_KEYS } from '@config/constants';

/** First scene. Nothing to set up yet; hands straight over to preloading. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.boot });
  }

  create(): void {
    this.scene.start(SCENE_KEYS.preload);
  }
}
