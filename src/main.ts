import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { GameScene } from '@/scenes/GameScene';
import { MenuScene } from '@/scenes/MenuScene';
import { TextureGalleryScene } from '@/scenes/TextureGalleryScene';
import { HUDScene } from '@ui/HUDScene';
import { OverlayScene } from '@ui/OverlayScene';
import { applyRenderScale, installCrispText, RENDER_SCALE } from '@utils/renderScale';

installCrispText();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  // The canvas is RENDER_SCALE x the 1280x720 layout; cameras zoom to match.
  width: Math.round(GAME_WIDTH * RENDER_SCALE),
  height: Math.round(GAME_HEIGHT * RENDER_SCALE),
  parent: 'game-container',
  backgroundColor: '#111111',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Later scenes render on top: the HUD over the game, the pause/game-over
  // overlay over the HUD.
  scene: [BootScene, PreloadScene, MenuScene, GameScene, HUDScene, OverlayScene, TextureGalleryScene],
};

const game = new Phaser.Game(config);
game.events.once(Phaser.Core.Events.READY, () => {
  for (const scene of game.scene.scenes) {
    scene.events.on(Phaser.Scenes.Events.CREATE, () => applyRenderScale(scene.cameras.main));
  }
});
