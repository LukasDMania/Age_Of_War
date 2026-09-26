import Phaser from 'phaser';
import { GAME_WIDTH, SCENE_KEYS } from '@config/constants';
import { listPlaceholderTextures } from '@utils/PlaceholderArt';

const MARGIN = 16;
const MIN_CELL = 64;
const CELL_PAD = 10;
const TITLE_HEIGHT = 16;
const LABEL_HEIGHT = 14;
const GROUP_GAP = 4;
/** Bases go in a right-hand column at half size so every age fits. */
const RIGHT_COLUMN_X = 720;
const BASE_SCALE = 0.5;

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '9px',
  color: '#cccccc',
  align: 'center',
};

/** "unit-castle-knight@player" -> "knight", "base-2@enemy" -> "2 enemy". */
function shortLabel(key: string): string {
  const [name = key, side = ''] = key.split('@');
  if (name.startsWith('base-')) return `${name.slice(5)} ${side}`;
  return name.replace(/^(unit|turret)-[a-z]+-/, '').replace(/^proj-/, '');
}

/**
 * Dev-only viewer that draws every generated placeholder texture so they can
 * be eyeballed. Open the game with `?gallery` in the URL (dev server only).
 * Groups flow left to right and wrap; the bases get their own column on the
 * right. Delete once real art replaces the placeholders.
 */
export class TextureGalleryScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.gallery });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x222222);
    const columnBottom = { left: MARGIN, right: MARGIN };

    for (const group of listPlaceholderTextures()) {
      const isBases = group.keys.every((key) => key.startsWith('base-'));
      const column = isBases ? 'right' : 'left';
      const left = isBases ? RIGHT_COLUMN_X : MARGIN;
      const right = isBases ? GAME_WIDTH - MARGIN : RIGHT_COLUMN_X - MARGIN;
      let y = columnBottom[column];

      this.add.text(left, y, group.title, { fontFamily: 'monospace', fontSize: '12px', color: '#ffd166' });
      y += TITLE_HEIGHT;
      let x = left;
      let rowHeight = 0;

      for (const key of group.keys) {
        const frame = this.textures.getFrame(key);
        const scale = isBases ? BASE_SCALE : 1;
        const w = frame.width * scale;
        const h = frame.height * scale;
        const cell = Math.max(MIN_CELL, w + CELL_PAD);
        if (x + cell > right) {
          x = left;
          y += rowHeight + LABEL_HEIGHT;
          rowHeight = 0;
        }
        const image = this.add.image(x + cell / 2, y, key).setOrigin(0.5, 0).setScale(scale);
        // Show the enemy facing left, the way it appears in play.
        if (key.endsWith('@enemy')) image.setFlipX(true);
        this.add.text(image.x, y + h + 1, shortLabel(key), LABEL_STYLE).setOrigin(0.5, 0);
        x += cell;
        rowHeight = Math.max(rowHeight, h);
      }
      columnBottom[column] = y + rowHeight + LABEL_HEIGHT + GROUP_GAP;
    }
  }
}
