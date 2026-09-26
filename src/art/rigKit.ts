/**
 * Shared drawing kit for the code-drawn "rig" art (owner's chosen style,
 * 2026-09-26): thick strokes with a dark outline, simple shapes, parts
 * rotated per frame. Every figure, vehicle, turret and effect is built from
 * these helpers so all ages look like one family.
 *
 * Coordinates are "rig units": feet (or wheels) at y = 0, up is negative y,
 * facing right (+x). Angles follow `pt`: 0 points down, PI/2 points forward
 * (+x), PI points up. Pure canvas drawing; no Phaser here.
 */
export type Ctx = CanvasRenderingContext2D;
export type P2 = [number, number];

/** Outline color used by every stroke. */
export const OUT = '#1a120c';

/** Shared palette. Per-age outfits add their own colors on top. */
export const C = {
  skin: '#d9a066',
  skinB: '#b27d4c',
  hair: '#3a2210',
  wood: '#7a4a24',
  woodB: '#5c3719',
  stone: '#8d8a85',
  stoneB: '#6d6a66',
  bone: '#efe6d2',
  leather: '#6b4a2a',
  leatherB: '#4e3520',
  steel: '#b9bfc6',
  steelB: '#8a9099',
  steelD: '#5d636b',
  iron: '#4a4d52',
  gold: '#e8c04a',
  goldB: '#b08a2a',
  cloth: '#e8e0cc',
  olive: '#6b7440',
  oliveB: '#525a30',
  khaki: '#a89868',
  black: '#2a2622',
  white: '#eef2f5',
  whiteB: '#c3ccd6',
  glass: '#9fe8ff',
  plasma: '#b070ff',
  laser: '#5ff5e0',
  fire: '#f28c2c',
  fireB: '#ffd35a',
};

export const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const easeOut = (x: number): number => 1 - (1 - x) * (1 - x);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** 0 -> 1 -> 0 bump over [a, b]. */
export const bump = (u: number, a: number, b: number): number => (u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI));
export const pt = (p: P2, a: number, l: number): P2 => [p[0] + Math.sin(a) * l, p[1] + Math.cos(a) * l];
/** Angle (in `pt` convention) from p to q. */
export const angleTo = (p: P2, q: P2): number => Math.atan2(q[0] - p[0], q[1] - p[1]);
export const dist = (p: P2, q: P2): number => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** Multiplies a #rrggbb color's channels by `k` (below 1 darker, above 1 lighter). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Same color with an alpha, as an rgba() string. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A thick outlined polyline (limbs, sticks, barrels). */
export function poly(c: Ctx, ps: P2[], w: number, col: string): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(ps[0]![0], ps[0]![1]);
  for (const p of ps.slice(1)) c.lineTo(p[0], p[1]);
  c.lineWidth = w + 3;
  c.strokeStyle = OUT;
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = col;
  c.stroke();
}

/** Like `poly` with square ends (blades, planks, barrels with a flat muzzle). */
export function bar(c: Ctx, a: P2, b: P2, w: number, col: string): void {
  c.lineCap = 'butt';
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.lineWidth = w + 3;
  c.strokeStyle = OUT;
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = col;
  c.stroke();
  c.lineCap = 'round';
}

export function dot(c: Ctx, p: P2, r: number, col: string): void {
  c.beginPath();
  c.arc(p[0], p[1], r, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
  c.stroke();
}

/** A filled, outlined closed polygon. */
export function shape(c: Ctx, ps: P2[], col: string, lw = 1.5): void {
  c.beginPath();
  c.moveTo(ps[0]![0], ps[0]![1]);
  for (const p of ps.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.stroke();
}

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, lw = 1.5): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = col;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUT;
  c.stroke();
}

export function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, rot: number, col: string, lw = 1.5): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = OUT;
    c.stroke();
  }
}

/** A soft glow disc (no outline), for muzzle flashes, magic and energy. */
export function glow(c: Ctx, p: P2, r: number, col: string, a: number): void {
  if (a <= 0 || r <= 0) return;
  const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(0.45, rgba(col, a * 0.55));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(p[0], p[1], r, 0, Math.PI * 2);
  c.fill();
}

/** Impact star (the Stone age's hit spark). `a` fades it out. */
export function star(c: Ctx, p: P2, a: number, color = '255,230,150'): void {
  c.strokeStyle = `rgba(${color},${a})`;
  c.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const ang = i * 1.05;
    const r = 4 + (1 - a) * 6;
    const s = pt(p, ang, r * 0.4);
    const e = pt(p, ang, r);
    c.beginPath();
    c.moveTo(s[0], s[1]);
    c.lineTo(e[0], e[1]);
    c.stroke();
  }
}

/** A muzzle flash pointing along angle `a` (pt convention), size `s`, strength `k`. */
export function muzzleFlash(c: Ctx, p: P2, a: number, s: number, k: number, col = C.fireB): void {
  if (k <= 0) return;
  glow(c, p, s * 1.6, col, 0.8 * k);
  const tip = pt(p, a, s * 1.5 * (0.6 + 0.4 * k));
  const l = pt(p, a + 1.2, s * 0.5);
  const r = pt(p, a - 1.2, s * 0.5);
  c.beginPath();
  c.moveTo(l[0], l[1]);
  c.lineTo(tip[0], tip[1]);
  c.lineTo(r[0], r[1]);
  c.closePath();
  c.fillStyle = rgba('#fff6c8', 0.95 * k);
  c.fill();
}

/** A puff of smoke: a few soft grey blobs, `k` 0..1 through its life. */
export function smoke(c: Ctx, p: P2, size: number, k: number, col = '#bdb6aa'): void {
  if (k <= 0 || k >= 1) return;
  const a = 0.55 * (1 - k);
  for (let i = 0; i < 4; i++) {
    const ang = i * 1.7 + 0.4;
    const q = pt([p[0], p[1] - k * size * 1.2], ang, size * 0.35 * (0.4 + k));
    c.beginPath();
    c.arc(q[0], q[1], size * (0.35 + k * 0.5), 0, Math.PI * 2);
    c.fillStyle = rgba(col, a);
    c.fill();
  }
}

export function leg(c: Ctx, hip: P2, a: number, bend: number, col: string, boot?: string, len = 10): void {
  const k = pt(hip, a, len);
  const an = pt(k, a - bend, len);
  poly(c, [hip, k, an], 4.5, col);
  poly(c, [an, [an[0] + 4, an[1]]], 4.5, boot ?? col);
}

export function arm(c: Ctx, sh: P2, a: number, bend: number, col: string, len = 8): { h: P2; fa: number; e: P2 } {
  const e = pt(sh, a, len);
  const fa = a + bend;
  const h = pt(e, fa, len);
  poly(c, [sh, e, h], 4, col);
  return { h, fa, e };
}

/**
 * Two-bone reach: the elbow that puts the hand on `target` (clamped to arm
 * length). `bendSign` picks the elbow side (+1 elbow down/back for a normal
 * arm). Returns the arm angles in `arm()` terms.
 */
export function reach(sh: P2, target: P2, len = 8, bendSign = 1): { a: number; bend: number } {
  const d = Math.min(dist(sh, target), len * 2 - 0.01);
  const base = angleTo(sh, target);
  const off = Math.acos(Math.max(-1, Math.min(1, d / (2 * len))));
  const a = base + bendSign * off;
  return { a, bend: -2 * bendSign * off };
}

/** Ground shadow under a unit. */
export function shadow(c: Ctx, w: number, a = 0.22): void {
  c.fillStyle = `rgba(0,0,0,${a})`;
  c.beginPath();
  c.ellipse(0, 0, w, 2.5, 0, 0, Math.PI * 2);
  c.fill();
}
