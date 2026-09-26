/**
 * Loader and helpers for the Kenney "Fantasy UI Borders" pack (CC0) that lives
 * in `src/ui/kenney_fantasy-ui-borders/`. The pack is white artwork, so panels
 * are tinted with `setTint` to get colors. Only the handful of pieces the UI
 * uses are loaded, under the keys in `UiTextures`.
 *
 * Files are imported through Vite (`?url`), so they get hashed URLs in
 * production builds and no copy into `public/` is needed.
 */
import Phaser from 'phaser';

import panelUrl from './kenney_fantasy-ui-borders/PNG/Default/Panel/panel-015.png?url';
import panelGlassUrl from './kenney_fantasy-ui-borders/PNG/Default/Transparent center/panel-transparent-center-015.png?url';
import frameUrl from './kenney_fantasy-ui-borders/PNG/Default/Border/panel-border-015.png?url';
import dividerUrl from './kenney_fantasy-ui-borders/PNG/Default/Divider/divider-000.png?url';
import dividerFadeUrl from './kenney_fantasy-ui-borders/PNG/Default/Divider Fade/divider-fade-000.png?url';

/** Texture keys for the loaded pieces. */
export const UiTextures = {
  /** Solid white panel with a thin frame. Tint it for a colored panel. */
  panel: 'ui-panel',
  /** White frame with a half-transparent center. Tint for a glassy panel. */
  panelGlass: 'ui-panel-glass',
  /** Frame only, transparent inside. Good around bars and buttons. */
  frame: 'ui-frame',
  divider: 'ui-divider',
  dividerFade: 'ui-divider-fade',
} as const;

export type UiTextureKey = (typeof UiTextures)[keyof typeof UiTextures];

/** Imported URL for each key. Add a piece here (and to `UiTextures`) to use it. */
const SOURCES: Record<UiTextureKey, string> = {
  [UiTextures.panel]: panelUrl,
  [UiTextures.panelGlass]: panelGlassUrl,
  [UiTextures.frame]: frameUrl,
  [UiTextures.divider]: dividerUrl,
  [UiTextures.dividerFade]: dividerFadeUrl,
};

/** Pixels of the 48x48 source kept fixed at each edge when stretching. */
const NINE_SLICE_INSET = 6;

/** Shared UI tints, so panels across the game agree. */
export const UiColors = {
  panelDark: 0x2a2233,
  /** Buttons and slots: a little lighter than `panelDark`. */
  panelMid: 0x3f3450,
  panelHover: 0x584a6e,
  /** Something ready to use (the special when charged). */
  ready: 0x7a6230,
  gold: 0xe0b85c,
  parchment: 0xf1e4c3,
  xp: 0x9b7fe0,
  good: 0x6fcf6f,
  warn: 0xf2c744,
  bad: 0xe0554a,
} as const;

/** CSS versions of the text colors, for `Phaser.GameObjects.Text` styles. */
export const UiTextColors = {
  parchment: '#f1e4c3',
  gold: '#e0b85c',
  dim: '#a89cb8',
} as const;

/** Shared font family for all UI text. */
export const UI_FONT = 'monospace';

/** Queues the UI textures on a scene's loader. Call from `preload()`. */
export function loadKenneyUi(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(SOURCES)) {
    scene.load.image(key, url);
  }
}

/**
 * Adds a stretchable panel centered on (x, y). Use `UiTextures.panel`,
 * `.panelGlass` or `.frame`.
 */
export function addPanel(
  scene: Phaser.Scene,
  key: typeof UiTextures.panel | typeof UiTextures.panelGlass | typeof UiTextures.frame,
  x: number,
  y: number,
  width: number,
  height: number,
  tint: number = UiColors.panelDark,
): Phaser.GameObjects.NineSlice {
  const panel = scene.add.nineslice(
    x,
    y,
    key,
    undefined,
    width,
    height,
    NINE_SLICE_INSET,
    NINE_SLICE_INSET,
    NINE_SLICE_INSET,
    NINE_SLICE_INSET,
  );
  panel.setTint(tint);
  return panel;
}

/** Scales an image down (never up) to fit inside a box. */
export function fitImage(image: Phaser.GameObjects.Image, maxW: number, maxH: number): void {
  image.setScale(Math.min(1, maxW / image.width, maxH / image.height));
}
