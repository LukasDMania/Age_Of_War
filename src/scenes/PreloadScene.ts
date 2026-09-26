import Phaser from 'phaser';
import { isAiDifficultyName } from '@config/ai.config';
import { SCENE_KEYS } from '@config/constants';
import type { GameSceneData } from '@/scenes/GameScene';
import { loadUnitArt, registerUnitArt } from '@entities/unitArt';
import { loadKenneyUi } from '@ui/kenneyUi';
import { generatePlaceholderTextures } from '@utils/PlaceholderArt';
import { ensureRigArtForAge } from '@utils/RigArt';

/**
 * Loads the Kenney UI pieces and generates the placeholder textures, then
 * hands over to the game scene.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.preload });
  }

  preload(): void {
    loadKenneyUi(this);
    loadUnitArt(this);
  }

  create(): void {
    generatePlaceholderTextures(this);
    // Rig sheets of later ages are drawn when a side reaches them.
    ensureRigArtForAge(this, 0);
    registerUnitArt(this);

    const params = new URLSearchParams(window.location.search);
    // Dev-only: `?gallery` shows every placeholder texture instead of the game.
    if (import.meta.env.DEV && params.has('gallery')) {
      this.scene.start(SCENE_KEYS.gallery);
      return;
    }
    // `?ai=easy|normal|hard|off` skips the menu and starts a match against
    // that enemy (handy for testing); otherwise the title menu comes first.
    const ai = params.get('ai');
    if (ai === 'off' || isAiDifficultyName(ai)) {
      this.scene.start(SCENE_KEYS.game, { ai } satisfies GameSceneData);
      return;
    }
    this.scene.start(SCENE_KEYS.menu);
  }
}
