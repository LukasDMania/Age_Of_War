/**
 * UI look per age (owner, 2026-09-26: "stylize the UI to be more in line
 * with the theme of the game"). The HUD re-skins itself when the player
 * ages up: Stone is dark wood and bone, Castle slate stone and gold,
 * Renaissance burgundy and gold, Modern olive drab and khaki, Future navy
 * and cyan. Panels get a faint material pattern (`pattern`) and a trim
 * frame from the Kenney pack in the `trim` color. PROPOSED, all tweakable.
 */

export type UiPattern = 'wood' | 'stone' | 'damask' | 'canvas' | 'grid';

export interface UiPalette {
  name: string;
  /** Panel backgrounds. */
  panelDark: number;
  panelMid: number;
  panelHover: number;
  /** Something ready to use (the special when charged, Play). */
  ready: number;
  /** Frames and ornaments. */
  trim: number;
  gold: number;
  xp: number;
  /** Faint material pattern inside the big panels. */
  pattern: UiPattern;
  patternAlpha: number;
  text: { parchment: string; gold: string; dim: string; title: string; stroke: string };
}

export const UI_THEMES: readonly UiPalette[] = [
  {
    name: 'Stone',
    panelDark: 0x3a2618,
    panelMid: 0x5a3c26,
    panelHover: 0x7a5636,
    ready: 0x8a6428,
    trim: 0xe0c48a,
    gold: 0xf2c744,
    xp: 0xb58ae0,
    pattern: 'wood',
    patternAlpha: 0.22,
    text: { parchment: '#f6e8c8', gold: '#f7cf5a', dim: '#c9ae88', title: '#fff0c8', stroke: '#241408' },
  },
  {
    name: 'Castle',
    panelDark: 0x262c38,
    panelMid: 0x3e4658,
    panelHover: 0x566078,
    ready: 0x7a6230,
    trim: 0xd8b24c,
    gold: 0xf2c744,
    xp: 0x9b8ae8,
    pattern: 'stone',
    patternAlpha: 0.2,
    text: { parchment: '#eef0f6', gold: '#f2c744', dim: '#a8b0c2', title: '#fff6d8', stroke: '#141820' },
  },
  {
    name: 'Renaissance',
    panelDark: 0x3a1820,
    panelMid: 0x5e2833,
    panelHover: 0x7e3a48,
    ready: 0x8a6a28,
    trim: 0xe8c056,
    gold: 0xf2c744,
    xp: 0xb88ae0,
    pattern: 'damask',
    patternAlpha: 0.16,
    text: { parchment: '#f8ecd4', gold: '#f5cf60', dim: '#d0aaa4', title: '#fff2d0', stroke: '#200c10' },
  },
  {
    name: 'Modern',
    panelDark: 0x282c20,
    panelMid: 0x424832,
    panelHover: 0x5a6244,
    ready: 0x6a7a30,
    trim: 0xcab87a,
    gold: 0xf0c848,
    xp: 0x9a9ae0,
    pattern: 'canvas',
    patternAlpha: 0.18,
    text: { parchment: '#eeeedc', gold: '#f0d060', dim: '#b2b29a', title: '#f6f6e0', stroke: '#14160e' },
  },
  {
    name: 'Future',
    panelDark: 0x0c1826,
    panelMid: 0x17304a,
    panelHover: 0x224a6c,
    ready: 0x1a6a78,
    trim: 0x5ff5e0,
    gold: 0xffd35a,
    xp: 0xb070ff,
    pattern: 'grid',
    patternAlpha: 0.2,
    text: { parchment: '#e4f6ff', gold: '#ffd866', dim: '#86a8c4', title: '#dffcff', stroke: '#040a12' },
  },
];

export function uiTheme(age: number): UiPalette {
  return UI_THEMES[Math.max(0, Math.min(UI_THEMES.length - 1, age))]!;
}
