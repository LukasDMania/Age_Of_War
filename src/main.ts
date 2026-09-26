import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { GameScene } from '@/scenes/GameScene';
import { MenuScene } from '@/scenes/MenuScene';
import { TextureGalleryScene } from '@/scenes/TextureGalleryScene';
import { HUDScene } from '@ui/HUDScene';
import { OverlayScene } from '@ui/OverlayScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
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

new Phaser.Game(config);
