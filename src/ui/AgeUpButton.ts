import Phaser from 'phaser';
import { getAge, isFinalAge } from '@config/ages.config';
import type { Side } from '@state/types';
import { UI_FONT, UiColors, UiTextColors } from '@ui/kenneyUi';
import { UiButton } from '@ui/UiButton';
import { emit, Events } from '@utils/EventBus';

/**
 * The age-up button next to the XP bar: shows the next age and its XP price,
 * lights up when the XP is there, and emits `age-up-requested` when pressed
 * (or A). `AgeProgressionSystem` decides. Told about XP and age changes by
 * `HUDScene`.
 */
export class AgeUpButton {
  private readonly scene: Phaser.Scene;
  private readonly side: Side;
  private readonly button: UiButton;
  private readonly next: Phaser.GameObjects.Text;
  private readonly price: Phaser.GameObjects.Text;
  private readonly onKey = (): void => this.button.press();
  private age = 0;
  private xp = 0;
  private locked = false;
  /** Highest age allowed this match (Conquest chapters lock it). */
  private readonly maxAge: number;

  /** (x, y) is the center. */
  constructor(
    scene: Phaser.Scene,
    side: Side,
    x: number,
    y: number,
    width: number,
    height: number,
    age: number,
    xp: number,
    maxAge = Infinity,
  ) {
    this.scene = scene;
    this.side = side;
    this.button = new UiButton(scene, x, y, width, height, {
      onPress: () => emit(Events.AgeUpRequested, { side: this.side }),
      tint: UiColors.panelDark,
      framed: true,
      hoverTint: UiColors.ready,
    });
    const halfW = width / 2;
    const halfH = height / 2;
    const title = scene.add.text(-halfW + 10, -halfH + 8, 'Age up', { fontFamily: UI_FONT, fontSize: '13px', color: UiTextColors.dim });
    const key = scene.add
      .text(halfW - 10, -halfH + 8, 'A', { fontFamily: UI_FONT, fontSize: '12px', color: UiTextColors.dim })
      .setOrigin(1, 0);
    this.next = scene.add
      .text(0, -2, '', { fontFamily: UI_FONT, fontSize: '15px', color: UiTextColors.parchment })
      .setOrigin(0.5);
    this.price = scene.add
      .text(0, halfH - 18, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#c9b6ff' })
      .setOrigin(0.5);
    this.button.add(title, key, this.next, this.price);
    this.age = age;
    this.xp = xp;
    this.maxAge = maxAge;
    this.refresh();
    scene.input.keyboard?.on('keydown-A', this.onKey);
  }

  setAge(age: number): void {
    this.age = age;
    this.refresh();
  }

  setXp(xp: number): void {
    this.xp = xp;
    this.refresh();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.refresh();
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-A', this.onKey);
  }

  private refresh(): void {
    const final = isFinalAge(this.age);
    const cost = getAge(this.age).xpToNext;
    if (final || cost === null) {
      this.next.setText('Final age');
      this.price.setText('');
      this.button.setEnabled(false).setSelected(false);
      return;
    }
    if (this.age >= this.maxAge) {
      this.next.setText('Age locked');
      this.price.setText('this battle');
      this.button.setEnabled(false).setSelected(false);
      return;
    }
    this.next.setText(`${getAge(this.age + 1).name}`);
    this.price.setText(`${cost} XP`);
    const ready = !this.locked && this.xp >= cost;
    this.button.setEnabled(ready).setSelected(ready);
  }
}
