import { CAMERA_THUMP, type ThumpConfig } from '@config/effects.config';

interface ActiveThump {
  start: number;
  config: ThumpConfig;
  scale: number;
}

/**
 * A graceful screen "thump" (owner, 2026-09-26: a more graceful impact shake
 * for the heavy units): a damped vertical bounce, `A e^(-3t/D) sin(2 pi c t/D)`,
 * instead of Phaser's random per-frame jitter. Several can overlap; each kind
 * has a cooldown so a line of heavies doesn't keep the screen shaking. Pure
 * visual; the scene reads `offset(now)` each frame and moves its camera.
 */
export class CameraThump {
  private readonly active: ActiveThump[] = [];
  private readonly readyAt = new Map<ThumpConfig, number>();

  /** Starts a thump of a kind unless one of that kind is cooling down. `scale` 0..1+. */
  add(config: ThumpConfig, now: number, scale = 1): void {
    if (config.amplitude <= 0 || now < (this.readyAt.get(config) ?? 0)) return;
    this.readyAt.set(config, now + config.cooldownMs);
    this.active.push({ start: now, config, scale });
  }

  /** The camera's vertical offset right now, px (positive moves the view down). */
  offset(now: number): number {
    let y = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i]!;
      const elapsed = now - t.start;
      const d = t.config.durationMs;
      if (elapsed >= d) {
        this.active.splice(i, 1);
        continue;
      }
      const k = elapsed / d;
      y += t.config.amplitude * t.scale * Math.exp(-3 * k) * Math.sin(2 * Math.PI * t.config.cycles * k);
    }
    return Math.max(-CAMERA_THUMP.maxOffset, Math.min(CAMERA_THUMP.maxOffset, y));
  }

  clear(): void {
    this.active.length = 0;
    this.readyAt.clear();
  }
}
