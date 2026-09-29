import Phaser from 'phaser';
import type { MechSlot } from '@config/mech.config';
import { BASE_X } from '@config/constants';
import { parseMechId } from '@entities/mechDesign';
import { laneDir, type Side } from '@state/types';
import { drawMechPreview, mechPreviewFit } from '@utils/MechArt';
import { TEAM_COLORS } from '@utils/RigArt';

/** Parts shown at each quarter of the build (legs, then torso, then arms, then the head). */
const STAGES: readonly (readonly MechSlot[])[] = [
  ['legs'],
  ['legs', 'torso'],
  ['legs', 'torso', 'left', 'right'],
  ['legs', 'torso', 'left', 'right', 'head'],
];
/** Shown size of the Mech on the scaffold (its lane size: 1.15 px per rig unit). */
const W = 118;
const H = 146;
/** In front of the gate, px from the base's center. */
const OFFSET_X = 96;
/** Scaffold colors per age (wood, iron, brass, steel, white). */
const POLES = [0x7a4a24, 0x5d636b, 0xa47e33, 0x52564a, 0xc3ccd6];

/**
 * The Mech being put together in front of its base while it builds
 * (Mech expansion, section 1: "assembly on the lane"): a scaffold with the
 * parts appearing in order and welding sparks. Only a view: `GameScene`
 * feeds it from `mech-changed`; it hides when the Mech walks out.
 */
export class MechScaffold {
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly x: number;
  private readonly y: number;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly mech: Phaser.GameObjects.Image;
  private readonly spark: Phaser.GameObjects.Graphics;
  private readonly key: string;
  private shown = '';

  constructor(scene: Phaser.Scene, side: Side, groundY: number) {
    this.scene = scene;
    this.side = side;
    this.x = BASE_X[side] + OFFSET_X * laneDir(side);
    this.y = groundY;
    this.key = `mech-scaffold-${side}`;
    this.frame = scene.add.graphics().setDepth(0.85).setVisible(false);
    this.mech = scene.add.image(this.x, this.y, '__DEFAULT').setDepth(0.9).setVisible(false).setFlipX(side === 'enemy');
    this.spark = scene.add.graphics().setDepth(0.95).setVisible(false);
  }

  /** The build as `mech-changed` reports it (null: nothing building). */
  setBuild(build: { unitId: string; remainingMs: number; totalMs: number } | null): void {
    const parsed = build ? parseMechId(build.unitId) : null;
    if (!build || !parsed) {
      this.setVisible(false);
      this.shown = '';
      return;
    }
    const done = 1 - build.remainingMs / Math.max(1, build.totalMs);
    const stage = Math.min(STAGES.length - 1, Math.floor(done * STAGES.length));
    const key = `${build.unitId}|${stage}`;
    if (key !== this.shown) {
      this.shown = key;
      this.drawFrame(parsed.age);
      drawMechPreview(this.scene, this.key, { ...parsed.design, age: parsed.age }, TEAM_COLORS[this.side], {
        width: W,
        height: H,
        parts: new Set(STAGES[stage]),
      });
      const fit = mechPreviewFit(W, H);
      this.mech.setTexture(this.key).setDisplaySize(W, H).setOrigin(fit.feetX / W, fit.feetY / H);
    }
    this.setVisible(true);
    // Welding sparks at the height of the part going on.
    const sparkY = this.y - 20 - Math.min(3, stage) * 26;
    const flicker = Math.sin(this.scene.time.now / 45) > 0.2 && build.remainingMs > 0;
    this.spark.clear();
    if (flicker) {
      const dx = Math.sin(this.scene.time.now / 130) * 16;
      this.spark.fillStyle(0xfff2b0, 0.95).fillCircle(this.x + dx, sparkY, 3);
      this.spark.fillStyle(0xffc040, 0.4).fillCircle(this.x + dx, sparkY, 8);
    }
  }

  destroy(): void {
    this.frame.destroy();
    this.mech.destroy();
    this.spark.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }

  private setVisible(visible: boolean): void {
    this.frame.setVisible(visible);
    this.mech.setVisible(visible);
    this.spark.setVisible(visible);
  }

  private drawFrame(age: number): void {
    const color = POLES[Math.max(0, Math.min(POLES.length - 1, age))]!;
    const g = this.frame.clear();
    const left = this.x - W / 2 - 4;
    const right = this.x + W / 2 + 4;
    const top = this.y - H - 8;
    g.lineStyle(5, 0x1a120c, 1);
    for (const x of [left, right]) g.lineBetween(x, this.y, x, top);
    g.lineBetween(left - 6, top, right + 6, top);
    g.lineStyle(3, color, 1);
    for (const x of [left, right]) g.lineBetween(x, this.y, x, top);
    g.lineBetween(left - 6, top, right + 6, top);
    g.lineStyle(2, color, 0.8);
    for (let y = this.y - 30; y > top + 10; y -= 34) {
      g.lineBetween(left, y, right, y);
    }
    // The hoist hook over the middle.
    g.lineStyle(2, 0x1a120c, 1).lineBetween(this.x, top, this.x, top + 12);
  }
}
