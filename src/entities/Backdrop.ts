import Phaser from 'phaser';
import {
  backgroundLayerKey,
  backgroundLayerUrl,
  type BackgroundDef,
} from '@config/backgrounds.config';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';

/** Depth of the back-most layer; each layer in front adds 0.01. */
const BACKDROP_DEPTH = -100;

/**
 * The layered parallax background behind the lane (visual only). Layers are
 * screen-fixed tile sprites whose texture offset follows the camera times
 * each layer's `scroll`, plus a slow `drift` for clouds. Textures are loaded
 * when a background is chosen and the previous background's are unloaded,
 * so only one set is ever in memory.
 */
export class Backdrop {
  private readonly scene: Phaser.Scene;
  private def: BackgroundDef | null = null;
  private layers: { sprite: Phaser.GameObjects.TileSprite; scroll: number; drift: number }[] = [];
  private loadToken = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Shows a background, loading its layers first if needed. */
  show(def: BackgroundDef): void {
    const previous = this.def;
    this.def = def;
    const token = ++this.loadToken;
    const missing = def.layers.filter((layer) => !this.scene.textures.exists(backgroundLayerKey(def, layer)));
    const build = (): void => {
      if (token !== this.loadToken) return;
      this.clear();
      if (previous && previous.id !== def.id) this.unload(previous);
      def.layers.forEach((layer, index) => {
        const sprite = this.scene.add
          .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, backgroundLayerKey(def, layer))
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(BACKDROP_DEPTH + index * 0.01);
        this.layers.push({ sprite, scroll: layer.scroll, drift: layer.drift ?? 0 });
      });
    };
    if (missing.length === 0) {
      build();
      return;
    }
    for (const layer of missing) this.scene.load.image(backgroundLayerKey(def, layer), backgroundLayerUrl(def, layer));
    this.scene.load.once(Phaser.Loader.Events.COMPLETE, build);
    this.scene.load.start();
  }

  /**
   * Call every frame with the camera's scroll and the scene clock. `offsetY`
   * is the camera's vertical bounce (a thump): layers follow it by their
   * parallax factor, so painted ground moves with the units on it.
   */
  update(scrollX: number, timeMs: number, offsetY = 0): void {
    for (const layer of this.layers) {
      layer.sprite.tilePositionX = scrollX * layer.scroll + (layer.drift * timeMs) / 1000;
      layer.sprite.y = -offsetY * layer.scroll;
    }
  }

  destroy(): void {
    this.loadToken++;
    this.clear();
  }

  private clear(): void {
    for (const layer of this.layers) layer.sprite.destroy();
    this.layers = [];
  }

  private unload(def: BackgroundDef): void {
    for (const layer of def.layers) {
      const key = backgroundLayerKey(def, layer);
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
  }
}
