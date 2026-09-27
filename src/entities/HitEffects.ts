import Phaser from 'phaser';
import { BASE_X, LANE_Y } from '@config/constants';
import type { Side } from '@state/types';
import { UI_FONT } from '@ui/kenneyUi';
import { Events, on, type EventPayloads, type UtilityKind } from '@utils/EventBus';
import { ObjectPool } from '@utils/ObjectPool';
import { HEADLESS_SIM } from '@utils/runtimeFlags';
import { unitArtKey } from '@config/unitArt.config';
import { unitArtFor } from '@entities/unitArt';
import { flipOriginX } from '@utils/spriteOrigin';

const NUMBER_RISE_PX = 26;
const NUMBER_DURATION_MS = 650;
const PUFF_DURATION_MS = 320;
const RING_DURATION_MS = 280;
/** Ground splash rings are squashed to look like they lie on the lane. */
const RING_SQUASH = 0.35;

const NUMBER_COLOR: Record<Side, string> = {
  // Damage taken by the player's units is tinted red, damage dealt is white.
  player: '#ffb3a7',
  enemy: '#ffffff',
};
const PUFF_COLOR: Record<Side, number> = { player: 0x8fbaf0, enemy: 0xf0958e };
const RING_COLOR = 0xf2a03c;
const HEAL_NUMBER_COLOR = '#8fe08f';
/** Pulse colors of the utility effects (Phase 10). */
const PULSE_COLOR: Record<UtilityKind, number> = {
  heal: 0x6fcf6f,
  aoe: RING_COLOR,
  slow: 0xb070ff,
  buff: 0xf2c744,
  shield: 0x8fe0ff,
};
const PULSE_DURATION_MS = 450;
/** Puffs thrown up around a base when it falls. */
const BASE_RUBBLE_PUFFS = 7;
/** Camera flash when the player ages up. */
const AGE_UP_FLASH_MS = 350;

/**
 * Hit feedback that has no effect on the game: floating damage and heal
 * numbers, a puff where a unit died, a ring where splash damage landed and a
 * colored pulse when a utility unit acts. It also throws rubble when a base
 * falls and flashes the screen when the player ages up. (Camera thumps and
 * particles are in `ImpactEffects` since 2026-09-26; the old random shake is
 * gone.) (The white flash on a damaged
 * unit is done by `Unit.takeDamage` itself.)
 *
 * Every visual comes from a pool, and it is driven purely by events, like
 * the HUD. Tweens run on real time, so effects finish even while paused.
 *
 * Listens for: `unit-damaged`, `unit-healed`, `unit-died`, `area-hit`,
 * `utility-pulse`, `base-damaged`, `base-destroyed`, `age-changed`.
 */
export class HitEffects {
  private readonly scene: Phaser.Scene;
  private readonly numbers: ObjectPool<Phaser.GameObjects.Text>;
  private readonly puffs: ObjectPool<Phaser.GameObjects.Arc>;
  private readonly rings: ObjectPool<Phaser.GameObjects.Arc>;
  /** Falling bodies of units with a die animation (Phase 16). */
  private readonly corpses: ObjectPool<Phaser.GameObjects.Sprite>;
  private readonly cleanups: (() => void)[];
  /** Set while the simulation runs in bulk without rendering (dev tooling). */
  muted = HEADLESS_SIM;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.numbers = new ObjectPool({
      create: () =>
        scene.add
          .text(0, 0, '', {
            fontFamily: UI_FONT,
            fontSize: '13px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 1)
          .setDepth(20),
      onRelease: (text) => text.setActive(false).setVisible(false),
      onDestroy: (text) => text.destroy(),
      prewarm: 24,
    });
    this.puffs = new ObjectPool({
      create: () => scene.add.circle(0, 0, 12, 0xffffff).setDepth(4),
      onRelease: (arc) => arc.setActive(false).setVisible(false),
      onDestroy: (arc) => arc.destroy(),
      prewarm: 8,
    });
    this.rings = new ObjectPool({
      create: () => scene.add.circle(0, 0, 10, RING_COLOR).setDepth(0.5),
      onRelease: (arc) => arc.setActive(false).setVisible(false),
      onDestroy: (arc) => arc.destroy(),
      prewarm: 8,
    });

    this.corpses = new ObjectPool({
      create: () => scene.add.sprite(0, 0, '__DEFAULT').setDepth(0.95),
      onRelease: (sprite) => sprite.stop().setActive(false).setVisible(false),
      onDestroy: (sprite) => sprite.destroy(),
      prewarm: 6,
    });

    this.cleanups = [
      on(Events.UnitDamaged, (payload) => this.showNumber(payload)),
      on(Events.UnitDied, ({ side, unitId, x }) => {
        if (!this.showCorpse(side, unitId, x)) this.showPuff(side, x);
      }),
      on(Events.AreaHit, ({ x, radius }) => this.showRing(x, radius, RING_COLOR, RING_DURATION_MS, 0.3)),
      on(Events.BaseDestroyed, ({ side }) => this.showBaseFall(side)),
      on(Events.AgeChanged, ({ side }) => {
        if (side === 'player') this.scene.cameras.main.flash(AGE_UP_FLASH_MS, 255, 240, 200);
      }),
      on(Events.UnitHealed, ({ amount, x, topY }) => this.showFloatingText(`+${Math.round(amount)}`, HEAL_NUMBER_COLOR, x, topY)),
      on(Events.UnitPromoted, ({ rank, x, topY }) => this.showFloatingText(rank >= 3 ? 'ELITE!' : 'RANK UP!', '#f7cf5a', x, topY - 10)),
      on(Events.UtilityPulse, ({ kind, x, radius }) => this.showRing(x, radius, PULSE_COLOR[kind], PULSE_DURATION_MS)),
    ];
  }

  destroy(): void {
    for (const off of this.cleanups) off();
    this.numbers.destroy();
    this.puffs.destroy();
    this.rings.destroy();
    this.corpses.destroy();
  }

  /** Plays the unit's die animation where it fell; false if it has none. */
  private showCorpse(side: Side, unitId: string, x: number): boolean {
    if (this.muted) return true;
    const art = unitArtFor(unitId);
    if (!art?.die) return false;
    const key = unitArtKey(unitId, 'die', side);
    if (!this.scene.anims.exists(key)) return false;
    const sprite = this.corpses.acquire();
    sprite
      .setTexture(key, 0)
      .setOrigin(flipOriginX(art.dieBox?.originX ?? art.originX ?? 0.5, side === 'enemy'), art.dieBox?.originY ?? art.footY)
      .setScale(art.scale)
      .setFlipX(side === 'enemy')
      .setPosition(x, LANE_Y)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    sprite.play(key);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.corpses.release(sprite));
    return true;
  }

  private showBaseFall(side: Side): void {
    for (let i = 0; i < BASE_RUBBLE_PUFFS; i++) {
      this.scene.time.delayedCall(i * 90, () => this.showPuff(side, BASE_X[side] + Phaser.Math.Between(-50, 50), Phaser.Math.Between(20, 110)));
    }
  }

  private showNumber({ side, amount, absorbed, x, topY }: EventPayloads[typeof Events.UnitDamaged]): void {
    const hp = Math.round(amount);
    const shield = Math.round(absorbed);
    if (hp <= 0 && shield <= 0) return;
    const label = shield > 0 ? (hp > 0 ? `${hp} (${shield})` : `(${shield})`) : String(hp);
    this.showFloatingText(label, hp > 0 ? NUMBER_COLOR[side] : '#8fe0ff', x, topY);
  }

  private showFloatingText(label: string, color: string, x: number, topY: number): void {
    if (this.muted) return;
    const text = this.numbers.acquire();
    text
      .setText(label)
      .setColor(color)
      .setPosition(x + Phaser.Math.Between(-6, 6), topY - 4)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: text,
      y: text.y - NUMBER_RISE_PX,
      alpha: 0,
      duration: NUMBER_DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => this.numbers.release(text),
    });
  }

  private showPuff(side: Side, x: number, height = 20): void {
    if (this.muted) return;
    const puff = this.puffs.acquire();
    puff
      .setFillStyle(PUFF_COLOR[side], 1)
      .setPosition(x, LANE_Y - height)
      .setScale(1)
      .setAlpha(0.8)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: puff,
      scale: 2.6,
      alpha: 0,
      duration: PUFF_DURATION_MS,
      ease: 'Quad.easeOut',
      onComplete: () => this.puffs.release(puff),
    });
  }

  private showRing(x: number, radius: number, color = RING_COLOR, durationMs = RING_DURATION_MS, alpha = 0.55): void {
    if (this.muted) return;
    const ring = this.rings.acquire();
    ring
      .setFillStyle(color, 1)
      .setRadius(radius)
      .setPosition(x, LANE_Y)
      .setScale(0.3, 0.3 * RING_SQUASH)
      .setAlpha(alpha)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1,
      scaleY: RING_SQUASH,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => this.rings.release(ring),
    });
  }
}
