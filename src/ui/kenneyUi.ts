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
import frameOrnateUrl from './kenney_fantasy-ui-borders/PNG/Default/Border/panel-border-002.png?url';
import { uiTheme, type UiPattern } from '@config/uiTheme.config';

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
  /** Frame with small corner ornaments: the trim on themed panels (2026-09-26). */
  frameOrnate: 'ui-frame-ornate',
} as const;

export type UiTextureKey = (typeof UiTextures)[keyof typeof UiTextures];

/** Imported URL for each key. Add a piece here (and to `UiTextures`) to use it. */
const SOURCES: Record<UiTextureKey, string> = {
  [UiTextures.panel]: panelUrl,
  [UiTextures.panelGlass]: panelGlassUrl,
  [UiTextures.frame]: frameUrl,
  [UiTextures.divider]: dividerUrl,
  [UiTextures.dividerFade]: dividerFadeUrl,
  [UiTextures.frameOrnate]: frameOrnateUrl,
};

/** Pixels of the 48x48 source kept fixed at each edge when stretching. */
const NINE_SLICE_INSET = 6;
/** The ornate frame's corners are larger. */
const ORNATE_INSET = 12;

/**
 * Shared UI tints, so panels across the game agree. Since 2026-09-26 these
 * follow the player's age (`applyUiTheme`, palettes in
 * `config/uiTheme.config.ts`); read them when building a panel.
 */
export const UiColors = {
  panelDark: 0x2a2233,
  /** Buttons and slots: a little lighter than `panelDark`. */
  panelMid: 0x3f3450,
  panelHover: 0x584a6e,
  /** Something ready to use (the special when charged). */
  ready: 0x7a6230,
  /** Frames and ornaments on themed panels. */
  trim: 0xe0c48a,
  gold: 0xe0b85c,
  parchment: 0xf1e4c3,
  xp: 0x9b7fe0,
  good: 0x6fcf6f,
  warn: 0xf2c744,
  bad: 0xe0554a,
};

/** CSS versions of the text colors, for `Phaser.GameObjects.Text` styles. */
export const UiTextColors = {
  parchment: '#f1e4c3',
  gold: '#e0b85c',
  dim: '#a89cb8',
  /** Big titles (age names, banners). */
  title: '#fff0c8',
  /** Outline under titles. */
  stroke: '#2a2233',
};

/** Material pattern of the current theme (see `addThemedPanel`). */
let currentPattern: UiPattern = 'wood';
let currentPatternAlpha = 0.2;

/** Switches the UI palette to an age's (call before building panels). */
export function applyUiTheme(age: number): void {
  const t = uiTheme(age);
  UiColors.panelDark = t.panelDark;
  UiColors.panelMid = t.panelMid;
  UiColors.panelHover = t.panelHover;
  UiColors.ready = t.ready;
  UiColors.trim = t.trim;
  UiColors.gold = t.gold;
  UiColors.xp = t.xp;
  Object.assign(UiTextColors, t.text);
  currentPattern = t.pattern;
  currentPatternAlpha = t.patternAlpha;
}

/**
 * Fonts (2026-09-26): Fredoka for UI text and Lilita One for titles and big
 * numbers, both SIL OFL, bundled from npm (`@fontsource`, imported in
 * main.ts). BootScene waits for them before any text is drawn.
 */
export const UI_FONT = '"Fredoka", "Trebuchet MS", sans-serif';
export const UI_TITLE_FONT = '"Lilita One", "Fredoka", "Trebuchet MS", sans-serif';

/** Font faces BootScene loads before the first scene draws text. */
export const UI_FONT_FACES: readonly string[] = ['500 16px "Fredoka"', '600 16px "Fredoka"', '400 24px "Lilita One"'];

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

/**
 * A themed panel (2026-09-26): the palette's fill, a faint material pattern
 * (wood grain, stone blocks, damask, canvas, a grid) and the ornate Kenney
 * frame in the trim color, grouped in a container centered on (x, y).
 */
export function addThemedPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: number; alpha?: number; frame?: boolean; pattern?: boolean } = {},
): Phaser.GameObjects.Container {
  ensureUiPatterns(scene);
  const container = scene.add.container(x, y);
  const fill = addPanel(scene, UiTextures.panel, 0, 0, width, height, options.fill ?? UiColors.panelDark);
  container.add(fill);
  if (options.pattern !== false) {
    const tile = scene.add
      .tileSprite(0, 0, width - 8, height - 8, `ui-pattern-${currentPattern}`)
      .setAlpha(currentPatternAlpha)
      .setTileScale(1 / PATTERN_SUPERSAMPLE);
    container.add(tile);
  }
  if (options.frame !== false) {
    const frame = scene.add.nineslice(0, 0, UiTextures.frameOrnate, undefined, width + 6, height + 6, ORNATE_INSET, ORNATE_INSET, ORNATE_INSET, ORNATE_INSET);
    frame.setTint(UiColors.trim);
    container.add(frame);
  }
  if (options.alpha !== undefined) container.setAlpha(options.alpha);
  return container;
}

const PATTERN_SIZE = 96;
const PATTERN_SUPERSAMPLE = 2;

/** Draws the material pattern tiles (white on transparent) once. */
export function ensureUiPatterns(scene: Phaser.Scene): void {
  for (const pattern of ['wood', 'stone', 'damask', 'canvas', 'grid'] as const) {
    const key = `ui-pattern-${pattern}`;
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PATTERN_SIZE * PATTERN_SUPERSAMPLE;
    const c = canvas.getContext('2d');
    if (!c) continue;
    c.scale(PATTERN_SUPERSAMPLE, PATTERN_SUPERSAMPLE);
    drawPattern(c, pattern);
    scene.textures.addCanvas(key, canvas);
  }
}

function drawPattern(c: CanvasRenderingContext2D, pattern: UiPattern): void {
  const S = PATTERN_SIZE;
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  switch (pattern) {
    case 'wood':
      // Planks with wavy grain and a knot.
      c.lineWidth = 1;
      for (let y = 0; y < S; y += 4) {
        c.globalAlpha = 0.35 + ((y * 7) % 5) * 0.08;
        c.beginPath();
        for (let x = 0; x <= S; x += 8) c.lineTo(x, y + Math.sin((x + y * 3) / 14) * 1.2);
        c.stroke();
      }
      c.globalAlpha = 0.8;
      c.lineWidth = 2;
      for (const y of [0, 32, 64]) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(S, y);
        c.stroke();
      }
      c.beginPath();
      c.ellipse(60, 48, 6, 3, 0, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'stone':
      c.lineWidth = 2;
      c.globalAlpha = 0.8;
      for (let r = 0; r < 4; r++) {
        const y = r * 24;
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(S, y);
        c.stroke();
        for (let x = r % 2 ? 24 : 0; x < S; x += 48) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 24);
          c.stroke();
        }
      }
      c.globalAlpha = 0.3;
      for (let i = 0; i < 40; i++) c.fillRect((i * 37) % S, (i * 53) % S, 2, 2);
      break;
    case 'damask':
      // Repeating fleur-like diamonds.
      c.lineWidth = 1.4;
      c.globalAlpha = 0.8;
      for (const [cx, cy] of [[24, 24], [72, 72], [72, 24], [24, 72]] as const) {
        const big = (cx + cy) % 96 === 48;
        const r = big ? 14 : 7;
        c.beginPath();
        c.moveTo(cx, cy - r);
        c.quadraticCurveTo(cx + r, cy, cx, cy + r);
        c.quadraticCurveTo(cx - r, cy, cx, cy - r);
        c.stroke();
        if (big) {
          c.beginPath();
          c.arc(cx, cy, 3, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    case 'canvas':
      // Woven canvas and a few stencil marks.
      c.lineWidth = 1;
      c.globalAlpha = 0.4;
      for (let i = 0; i < S; i += 3) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, S);
        c.stroke();
      }
      c.globalAlpha = 0.25;
      for (let i = 0; i < S; i += 3) {
        c.beginPath();
        c.moveTo(0, i);
        c.lineTo(S, i);
        c.stroke();
      }
      break;
    case 'grid':
      c.lineWidth = 1;
      c.globalAlpha = 0.6;
      for (let i = 0; i <= S; i += 16) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, S);
        c.moveTo(0, i);
        c.lineTo(S, i);
        c.stroke();
      }
      c.globalAlpha = 1;
      for (let i = 0; i <= S; i += 32) for (let j = 0; j <= S; j += 32) c.fillRect(i - 1, j - 1, 2, 2);
      break;
  }
  c.globalAlpha = 1;
}

/** Scales an image down (never up) to fit inside a box. */
export function fitImage(image: Phaser.GameObjects.Image, maxW: number, maxH: number): void {
  image.setScale(Math.min(1, maxW / image.width, maxH / image.height));
}
