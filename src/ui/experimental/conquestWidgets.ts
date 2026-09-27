import Phaser from 'phaser';
import type { NodeType } from '@config/conquest.config';
import { UI_FONT, UI_TITLE_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';

/**
 * Drawing helpers for the Conquest campaign screen (prototype, feature
 * `conquest`): text styles, relic gems, node icons, banners and supply
 * crates, all drawn with Graphics (no assets).
 */

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

export const body = (size: number, color: string = UiTextColors.parchment, extra: TextStyle = {}): TextStyle => ({
  fontFamily: UI_FONT,
  fontSize: `${size}px`,
  fontStyle: '600',
  color,
  ...extra,
});

export const title = (size: number, color: string = UiTextColors.gold): TextStyle => ({
  fontFamily: UI_TITLE_FONT,
  fontSize: `${size}px`,
  color,
  stroke: UiTextColors.stroke,
  strokeThickness: Math.max(3, Math.round(size / 7)),
});

export const DIFFICULTY_COLORS = { easy: '#8fe08f', normal: '#f2c744', hard: '#f08a80' } as const;

/** A small emblem color per relic, so the relic bar reads at a glance. */
export const RELIC_COLORS: Record<string, number> = {
  whetstone: 0xc9ced6,
  hides: 0xa0703c,
  'war-chest': 0xe0b85c,
  prospector: 0x6fb0e0,
  tomes: 0x9b7fe0,
  anvil: 0x7d7d8a,
  watchtower: 0xb58a5a,
  drums: 0xd0584a,
  longbows: 0x6fcf6f,
  plate: 0xa8b8c8,
  'honed-edge': 0xe07a5a,
  fletching: 0x9fd87a,
  'banner-guard': 0x5a8ad0,
  ledger: 0xf0c060,
  'relic-shield': 0x7fd8e0,
  'siege-works': 0x8a6a4a,
  'war-college': 0xb09ae0,
  'beast-tamer': 0x8a5a30,
  crown: 0xf2d35a,
  grail: 0xf4f0e0,
  sunstone: 0xffa040,
};

/** A faceted gem in a gold setting. */
export function drawGem(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
  const light = Phaser.Display.Color.IntegerToColor(color).lighten(25).color;
  const dark = Phaser.Display.Color.IntegerToColor(color).darken(25).color;
  g.fillStyle(0x2a2233, 1).fillCircle(x, y, r + 3);
  g.lineStyle(2, UiColors.gold, 1).strokeCircle(x, y, r + 2);
  g.fillStyle(dark, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y }, { x, y: y + r }, { x: x - r * 0.8, y }], true);
  g.fillStyle(color, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.8, y }, { x, y: y + r * 0.2 }, { x: x - r * 0.8, y }], true);
  g.fillStyle(light, 1).fillPoints([{ x, y: y - r }, { x: x + r * 0.35, y: y - r * 0.2 }, { x: x - r * 0.35, y: y - r * 0.2 }], true);
}

/** A war banner on a pole (the run's lives); `lost` draws it torn and grey. */
export function drawBanner(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, lost = false): void {
  g.fillStyle(0x3a2a1a, 1).fillRect(x - 1 * s, y - 14 * s, 2 * s, 28 * s);
  g.fillStyle(0xe0b85c, 1).fillCircle(x, y - 14 * s, 2.2 * s);
  const cloth = lost ? 0x55505a : 0xc8453a;
  const edge = lost ? 0x3a363e : 0x8a2a22;
  g.fillStyle(edge, 1).fillPoints(
    [
      { x: x + 1 * s, y: y - 12 * s },
      { x: x + 14 * s, y: y - 12 * s },
      { x: x + 11 * s, y: y - 6 * s },
      { x: x + 14 * s, y: y },
      { x: x + 1 * s, y: y },
    ],
    true,
  );
  g.fillStyle(cloth, 1).fillPoints(
    [
      { x: x + 1 * s, y: y - 11 * s },
      { x: x + 12 * s, y: y - 11 * s },
      { x: x + 9.5 * s, y: y - 6 * s },
      { x: x + 12 * s, y: y - 1 * s },
      { x: x + 1 * s, y: y - 1 * s },
    ],
    true,
  );
  if (!lost) g.fillStyle(0xf2d35a, 1).fillCircle(x + 5.5 * s, y - 6 * s, 1.8 * s);
}

/** A wooden supply crate. */
export function drawCrate(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
  g.fillStyle(0x5a3a1c, 1).fillRect(x - 9 * s, y - 8 * s, 18 * s, 16 * s);
  g.fillStyle(0xa0703c, 1).fillRect(x - 8 * s, y - 7 * s, 16 * s, 14 * s);
  g.lineStyle(2 * s, 0x5a3a1c, 1);
  g.lineBetween(x - 8 * s, y - 7 * s, x + 8 * s, y + 7 * s);
  g.lineBetween(x - 8 * s, y, x + 8 * s, y);
}

const NODE_COLORS: Readonly<Record<NodeType, number>> = {
  battle: 0x8a5a3a,
  elite: 0x9a3a3a,
  boss: 0x6a2a5a,
  camp: 0x3a6a3a,
  treasure: 0x9a7a2a,
  event: 0x3a4a7a,
};

/**
 * A map node: a medallion with the node type's symbol. `state` dims nodes
 * that can't be reached and rings the ones on the chosen path.
 */
export function drawNode(
  g: Phaser.GameObjects.Graphics,
  type: NodeType,
  x: number,
  y: number,
  r: number,
  state: 'open' | 'done' | 'closed' | 'ahead',
): void {
  const alpha = state === 'closed' ? 0.35 : 1;
  g.fillStyle(0x1c1826, alpha).fillCircle(x, y, r + 4);
  g.fillStyle(NODE_COLORS[type], alpha).fillCircle(x, y, r);
  g.lineStyle(3, state === 'done' ? 0xf2d35a : state === 'open' ? 0xfff6de : UiColors.trim, alpha).strokeCircle(x, y, r + 1);
  const ink = 0xfff0c8;
  g.fillStyle(ink, alpha);
  g.lineStyle(Math.max(2, r * 0.12), ink, alpha);
  const k = r / 30;
  switch (type) {
    case 'battle':
    case 'elite': {
      // Crossed swords (an elite gets a skull above them).
      g.lineBetween(x - 13 * k, y + 13 * k, x + 12 * k, y - 12 * k);
      g.lineBetween(x + 13 * k, y + 13 * k, x - 12 * k, y - 12 * k);
      g.lineBetween(x - 11 * k, y + 5 * k, x - 4 * k, y + 12 * k);
      g.lineBetween(x + 11 * k, y + 5 * k, x + 4 * k, y + 12 * k);
      if (type === 'elite') {
        g.fillCircle(x, y - 17 * k, 6 * k);
        g.fillStyle(NODE_COLORS.elite, alpha).fillCircle(x - 2.2 * k, y - 18 * k, 1.6 * k).fillCircle(x + 2.2 * k, y - 18 * k, 1.6 * k);
      }
      break;
    }
    case 'boss': {
      // A crown.
      g.fillPoints(
        [
          { x: x - 15 * k, y: y + 9 * k },
          { x: x - 16 * k, y: y - 9 * k },
          { x: x - 7 * k, y: y - 1 * k },
          { x, y: y - 14 * k },
          { x: x + 7 * k, y: y - 1 * k },
          { x: x + 16 * k, y: y - 9 * k },
          { x: x + 15 * k, y: y + 9 * k },
        ],
        true,
      );
      g.fillStyle(0xc8453a, alpha).fillCircle(x, y + 3 * k, 3 * k);
      break;
    }
    case 'camp': {
      // A tent over a fire.
      g.fillTriangle(x - 16 * k, y + 10 * k, x, y - 14 * k, x + 16 * k, y + 10 * k);
      g.fillStyle(NODE_COLORS.camp, alpha).fillTriangle(x - 5 * k, y + 10 * k, x, y - 1 * k, x + 5 * k, y + 10 * k);
      g.fillStyle(0xffa040, alpha).fillTriangle(x - 3 * k, y + 10 * k, x, y + 3 * k, x + 3 * k, y + 10 * k);
      break;
    }
    case 'treasure': {
      // A chest.
      g.fillRect(x - 14 * k, y - 4 * k, 28 * k, 15 * k);
      g.fillRoundedRect(x - 14 * k, y - 12 * k, 28 * k, 9 * k, 4 * k);
      g.fillStyle(NODE_COLORS.treasure, alpha).fillRect(x - 14 * k, y - 4 * k, 28 * k, 2 * k);
      g.fillStyle(0x3a2a1a, alpha).fillRect(x - 2 * k, y - 5 * k, 4 * k, 6 * k);
      break;
    }
    case 'event': {
      // A question mark.
      g.beginPath();
      g.arc(x, y - 5 * k, 8 * k, Math.PI * 1.05, Math.PI * 0.45, false);
      g.strokePath();
      g.lineBetween(x + 3 * k, y + 2 * k, x, y + 6 * k);
      g.fillCircle(x, y + 12 * k, 2.4 * k);
      break;
    }
  }
}
