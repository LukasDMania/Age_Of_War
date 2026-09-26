import Phaser from 'phaser';
// UI fonts (SIL OFL, bundled from npm): Fredoka for text, Lilita One for titles.
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/lilita-one/400.css';
import { GAME_HEIGHT, GAME_WIDTH } from '@config/constants';
import { BootScene } from '@/scenes/BootScene';
import { PreloadScene } from '@/scenes/PreloadScene';
import { GameScene } from '@/scenes/GameScene';
import { MenuScene } from '@/scenes/MenuScene';
import { ConquestScene } from '@/scenes/ConquestScene';
import { TextureGalleryScene } from '@/scenes/TextureGalleryScene';
import { HUDScene } from '@ui/HUDScene';
import { OverlayScene } from '@ui/OverlayScene';
import { applyRenderScale, installCrispText, RENDER_SCALE } from '@utils/renderScale';
import { HEADLESS_SIM } from '@utils/runtimeFlags';

installCrispText();

const config: Phaser.Types.Core.GameConfig = {
  // `?headless` (dev): simulate without drawing, for AI training runs (the
  // Canvas renderer with hidden cameras; Phaser's HEADLESS can't make textures).
  type: HEADLESS_SIM ? Phaser.CANVAS : Phaser.AUTO,
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
  scene: [BootScene, PreloadScene, MenuScene, ConquestScene, GameScene, HUDScene, OverlayScene, TextureGalleryScene],
};

const game = new Phaser.Game(config);
if (import.meta.env.DEV) void import('@/dev/trainHarness').then((m) => m.installTrainHarness());
game.events.once(Phaser.Core.Events.READY, () => {
  for (const scene of game.scene.scenes) {
    scene.events.on(Phaser.Scenes.Events.CREATE, () => applyRenderScale(scene.cameras.main));
  }
});
