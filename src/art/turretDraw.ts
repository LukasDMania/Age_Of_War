/**
 * Turret art in the rig style (owner, 2026-09-26: turrets for every age,
 * with "slight additions in sprite coolness when upgrading"). Each turret is
 * two pieces:
 *
 * - the mount, drawn with its bottom-center at (0, 0), standing on its slot;
 * - the head (barrel, arm, cauldron...), drawn around its pivot at (0, 0)
 *   facing right. The game rotates it to aim, kicks it back when it fires,
 *   or swings it (throwing arms).
 *
 * `level` is the upgrade level, 0..3. Every level adds something visible:
 * 1 reinforces (iron bands, plates, rivets), 2 adds team colors and an extra
 * part (banners, a second barrel, a scope), 3 is the elite look (gold trim,
 * glowing parts, trophies). Units: 1 rig unit = 1 screen px at scale 1.
 */
import {
  bar,
  C,
  dot,
  ellipse,
  glow,
  OUT,
  poly,
  pt,
  rgba,
  rrect,
  shade,
  shape,
  type Ctx,
  type P2,
} from '@/art/rigKit';

export type TurretArtId =
  | 'stone-spear'
  | 'stone-boulder'
  | 'stone-firepot'
  | 'castle-crossbow'
  | 'castle-ballista'
  | 'castle-oil'
  | 'renaissance-musket'
  | 'renaissance-cannon'
  | 'renaissance-mortar'
  | 'modern-machine-gun'
  | 'modern-artillery'
  | 'modern-grenade'
  | 'future-laser'
  | 'future-rail'
  | 'future-plasma';

/** How the head moves (see `entities/Turret.ts`). */
export interface TurretMotion {
  /** Head pivot in mount coordinates. */
  pivot: P2;
  /** Pivot to muzzle (where shots appear), along the head. */
  barrel: number;
  /** 'track' turns toward the target; 'swing' is a throwing arm (no tracking). */
  aim: 'track' | 'swing' | 'tip';
  /** Resting angle in radians, 0 = level forward, positive = up. */
  rest: number;
  /** Aim limits (radians, positive up). */
  minAim: number;
  maxAim: number;
  /** Kick-back distance when firing (tracking heads). */
  recoil: number;
  /** Swinging arms and tipping cauldrons: the angle they fire at. */
  release?: number;
  /** Flash drawn at the muzzle: 'fire', 'laser', 'plasma' or none. */
  flash: 'fire' | 'laser' | 'plasma' | 'none';
}

export const TURRET_MOTION: Readonly<Record<TurretArtId, TurretMotion>> = {
  'stone-spear': { pivot: [0, -19], barrel: 20, aim: 'track', rest: 0.08, minAim: -0.9, maxAim: 0.4, recoil: 3, flash: 'none' },
  'stone-boulder': { pivot: [-2, -18], barrel: 21, aim: 'swing', rest: 3.45, release: 1.05, minAim: 0, maxAim: 0, recoil: 0, flash: 'none' },
  'stone-firepot': { pivot: [-1, -17], barrel: 21, aim: 'swing', rest: 3.45, release: 1.05, minAim: 0, maxAim: 0, recoil: 0, flash: 'none' },
  'castle-crossbow': { pivot: [0, -20], barrel: 16, aim: 'track', rest: 0, minAim: -0.9, maxAim: 0.35, recoil: 2.5, flash: 'none' },
  'castle-ballista': { pivot: [0, -19], barrel: 22, aim: 'track', rest: 0.05, minAim: -0.9, maxAim: 0.35, recoil: 3.5, flash: 'none' },
  'castle-oil': { pivot: [0, -20], barrel: 12, aim: 'tip', rest: 0, release: -0.8, minAim: 0, maxAim: 0, recoil: 0, flash: 'none' },
  'renaissance-musket': { pivot: [0, -18], barrel: 20, aim: 'track', rest: 0, minAim: -0.9, maxAim: 0.35, recoil: 2, flash: 'fire' },
  'renaissance-cannon': { pivot: [-2, -15], barrel: 23, aim: 'track', rest: 0.1, minAim: -0.8, maxAim: 0.45, recoil: 5, flash: 'fire' },
  'renaissance-mortar': { pivot: [0, -13], barrel: 14, aim: 'track', rest: 0.6, minAim: -0.5, maxAim: 0.9, recoil: 3, flash: 'fire' },
  'modern-machine-gun': { pivot: [0, -18], barrel: 22, aim: 'track', rest: 0, minAim: -0.9, maxAim: 0.35, recoil: 1.5, flash: 'fire' },
  'modern-artillery': { pivot: [-3, -15], barrel: 28, aim: 'track', rest: 0.12, minAim: -0.8, maxAim: 0.45, recoil: 6, flash: 'fire' },
  'modern-grenade': { pivot: [0, -17], barrel: 17, aim: 'track', rest: 0.25, minAim: -0.7, maxAim: 0.6, recoil: 3, flash: 'fire' },
  'future-laser': { pivot: [0, -19], barrel: 19, aim: 'track', rest: 0, minAim: -0.9, maxAim: 0.35, recoil: 1.2, flash: 'laser' },
  'future-rail': { pivot: [-2, -17], barrel: 30, aim: 'track', rest: 0.05, minAim: -0.8, maxAim: 0.4, recoil: 4, flash: 'laser' },
  'future-plasma': { pivot: [0, -17], barrel: 16, aim: 'track', rest: 0.4, minAim: -0.6, maxAim: 0.8, recoil: 3, flash: 'plasma' },
};

/** Drawing boxes (rig units): mount around its bottom-center, head around its pivot. */
export const TURRET_MOUNT_BOX = { minX: -30, maxX: 30, minY: -40, maxY: 3 } as const;
export const TURRET_HEAD_BOX = { minX: -26, maxX: 40, minY: -26, maxY: 26 } as const;

/* ---- Shared bits ---------------------------------------------------------- */

function rivets(c: Ctx, ps: P2[], col = C.steelB): void {
  for (const p of ps) dot(c, p, 0.9, col);
}

function pennant(c: Ctx, base: P2, h: number, team: string, gold = false): void {
  poly(c, [base, [base[0], base[1] - h]], 1.1, gold ? C.gold : C.woodB);
  shape(c, [[base[0], base[1] - h], [base[0] + 9, base[1] - h + 3], [base[0], base[1] - h + 6]], team, 1.1);
}

function stoneBlocks(c: Ctx, w: number, h: number, col = C.stone): void {
  rrect(c, -w / 2, -h, w, h, 2, col);
  c.strokeStyle = rgba(OUT, 0.45);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(-w / 2 + 1, -h / 2);
  c.lineTo(w / 2 - 1, -h / 2);
  for (let i = 1; i < 3; i++) {
    const x = -w / 2 + (w * i) / 3;
    c.moveTo(x + (i % 2 ? 2 : -2), -h + 1);
    c.lineTo(x + (i % 2 ? 2 : -2), -h / 2);
    c.moveTo(x, -h / 2);
    c.lineTo(x, -1);
  }
  c.stroke();
}

function sandbags(c: Ctx, w: number, rows: number, col = '#b8a878'): void {
  for (let r = 0; r < rows; r++) {
    const n = Math.max(2, Math.round(w / 9) - r);
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (r % 2 ? bw / 2 : 0) + i * bw;
      if (x + bw > w / 2 + 0.1) continue;
      rrect(c, x, -6 - r * 5.2, bw, 6, 2.5, col, 1.2);
    }
  }
}

function goldTrim(c: Ctx, a: P2, b: P2): void {
  poly(c, [a, b], 1.2, C.gold);
}

/* ---- Mounts ---------------------------------------------------------------- */

export function drawTurretMount(c: Ctx, id: TurretArtId, team: string, lv: number): void {
  switch (id) {
    case 'stone-spear':
    case 'stone-boulder':
    case 'stone-firepot': {
      // Lashed log tripod on a stone.
      stoneBlocks(c, 26, 7, lv >= 1 ? C.stoneB : C.stone);
      poly(c, [[-11, -6], [-1, -20]], 3.2, C.wood);
      poly(c, [[11, -6], [1, -20]], 3.2, C.wood);
      poly(c, [[0, -6], [0, -20]], 3, C.woodB);
      poly(c, [[-4, -15], [4, -15]], 2.2, C.leather);
      if (lv >= 1) {
        poly(c, [[-7, -10], [7, -10]], 2, C.leather);
        rivets(c, [[-9, -3], [0, -3], [9, -3]], C.bone);
      }
      if (lv >= 2) {
        // Team feathers and a skull trophy.
        pennant(c, [-12, -6], 22, team);
        dot(c, [8, -9], 3, C.bone);
        c.fillStyle = OUT;
        c.fillRect(7, -9.8, 1.2, 1.2);
        c.fillRect(9, -9.8, 1.2, 1.2);
      }
      if (lv >= 3) {
        // Mammoth tusks flanking the stone and a fire bowl.
        c.lineCap = 'round';
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(s * 12, -3);
          c.quadraticCurveTo(s * 20, -4, s * 19, -13);
          c.lineWidth = 4.2;
          c.strokeStyle = OUT;
          c.stroke();
          c.lineWidth = 2.2;
          c.strokeStyle = C.bone;
          c.stroke();
        }
        glow(c, [-5, -26], 6, C.fire, 0.6);
      }
      break;
    }
    case 'castle-crossbow':
    case 'castle-ballista':
    case 'castle-oil': {
      // A crenellated stone block; the oil cauldron gets an iron tripod.
      stoneBlocks(c, 30, 10, lv >= 1 ? '#9a978f' : C.stone);
      rrect(c, -15, -14, 7, 5, 1, C.stone);
      rrect(c, 8, -14, 7, 5, 1, C.stone);
      if (id === 'castle-oil') {
        poly(c, [[-9, -10], [-3, -22]], 2, C.iron);
        poly(c, [[9, -10], [3, -22]], 2, C.iron);
        glow(c, [0, -13], 7, C.fire, 0.8);
        shape(c, [[-4, -10], [0, -18], [4, -10]], C.fire, 1);
        shape(c, [[-2, -10], [0, -14], [2, -10]], C.fireB, 0.8);
      } else {
        rrect(c, -3, -22, 6, 12, 1.5, C.wood);
      }
      if (lv >= 1) {
        rrect(c, -15.5, -6, 31, 2.4, 1, C.iron, 1.1);
        rivets(c, [[-12, -4.8], [-4, -4.8], [4, -4.8], [12, -4.8]], C.steel);
      }
      if (lv >= 2) {
        // Heater shield in the team color hung on the wall.
        shape(c, [[-5, -9.5], [5, -9.5], [5, -5], [0, -1.5], [-5, -5]], team, 1.2);
        pennant(c, [-14, -14], 18, team);
      }
      if (lv >= 3) {
        shape(c, [[-5, -9.5], [5, -9.5], [5, -5], [0, -1.5], [-5, -5]], team, 1.2);
        c.strokeStyle = C.gold;
        c.lineWidth = 1;
        c.stroke();
        dot(c, [0, -6], 1.3, C.gold);
        pennant(c, [14, -14], 18, team, true);
      }
      break;
    }
    case 'renaissance-musket':
    case 'renaissance-cannon':
    case 'renaissance-mortar': {
      if (id === 'renaissance-musket') {
        // Gabions (wicker baskets of earth).
        for (const x of [-10, 0, 10]) {
          rrect(c, x - 5, -13, 10, 13, 2, '#8a6a3a');
          c.strokeStyle = rgba(OUT, 0.5);
          c.lineWidth = 0.7;
          for (let y = -11; y < 0; y += 2.5) {
            c.beginPath();
            c.moveTo(x - 4.5, y);
            c.lineTo(x + 4.5, y);
            c.stroke();
          }
        }
        poly(c, [[0, -13], [0, -18]], 2.4, C.woodB);
      } else if (id === 'renaissance-cannon') {
        // Carriage with a spoked wheel.
        shape(c, [[-14, -4], [-12, -12], [8, -17], [10, -12], [4, -4]], C.wood);
        dot(c, [2, -7], 7, C.woodB);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 4;
          poly(c, [pt([2, -7], a, 6), pt([2, -7], a + Math.PI, 6)], 0.9, C.wood);
        }
        dot(c, [2, -7], 1.8, C.iron);
      } else {
        rrect(c, -13, -9, 26, 9, 2, C.wood);
        rrect(c, -11, -12, 22, 4, 1.5, C.woodB);
      }
      if (lv >= 1) {
        if (id === 'renaissance-cannon') {
          c.strokeStyle = OUT;
          c.lineWidth = 2.6;
          c.beginPath();
          c.arc(2, -7, 7, 0, Math.PI * 2);
          c.stroke();
          c.strokeStyle = C.iron;
          c.lineWidth = 1.4;
          c.stroke();
        } else {
          rrect(c, -14, -4, 28, 2.4, 1, C.iron, 1.1);
        }
      }
      if (lv >= 2) {
        pennant(c, [-12, -8], 20, team);
        rrect(c, 9, -5, 5, 5, 1, '#3a3a3a');
      }
      if (lv >= 3) {
        // Stacked shot and a gilded crest.
        dot(c, [12, -2.5], 2.2, C.iron);
        dot(c, [16, -2.5], 2.2, C.iron);
        dot(c, [14, -6], 2.2, C.iron);
        shape(c, [[-6, -12], [-3, -16], [0, -12], [-3, -9]], C.gold, 1);
      }
      break;
    }
    case 'modern-machine-gun':
    case 'modern-artillery':
    case 'modern-grenade': {
      if (id === 'modern-artillery') {
        // Split trail and a rubber wheel.
        poly(c, [[-16, -2], [2, -12]], 3, C.oliveB);
        poly(c, [[-11, -1], [2, -12]], 3, C.olive);
        dot(c, [3, -7], 7, '#2e2e2a');
        dot(c, [3, -7], 3.5, C.olive);
      } else {
        sandbags(c, 30, 2, lv >= 1 ? '#a89868' : '#b8a878');
        poly(c, [[-6, -11], [0, -18], [6, -11]], 1.8, C.iron);
      }
      if (lv >= 1) {
        if (id === 'modern-artillery') rrect(c, -12, -17, 12, 8, 1.5, C.oliveB);
        else sandbags(c, 18, 3, '#a89868');
      }
      if (lv >= 2) {
        // Ammo crate with the team star.
        rrect(c, 8, -8, 9, 8, 1, C.oliveB);
        dot(c, [12.5, -4], 1.8, team);
        pennant(c, [-14, -8], 18, team);
      }
      if (lv >= 3) {
        // Camo netting draped over the position.
        c.fillStyle = rgba('#4f5a2a', 0.85);
        c.beginPath();
        c.moveTo(-16, -9);
        c.quadraticCurveTo(-8, -15, 0, -10);
        c.quadraticCurveTo(8, -16, 16, -9);
        c.lineTo(15, -6);
        c.lineTo(-15, -6);
        c.closePath();
        c.fill();
        c.strokeStyle = OUT;
        c.lineWidth = 1;
        c.stroke();
        for (const x of [-10, -3, 5, 11]) dot(c, [x, -10], 1.1, '#6b7a30');
      }
      break;
    }
    case 'future-laser':
    case 'future-rail':
    case 'future-plasma': {
      // Hover pedestal with a glowing ring.
      shape(c, [[-13, 0], [-9, -10], [9, -10], [13, 0]], C.white);
      rrect(c, -10, -13, 20, 4, 2, C.whiteB);
      glow(c, [0, -2], 10, team, 0.5);
      rrect(c, -8, -3, 16, 2, 1, team, 0.9);
      if (id === 'future-rail') {
        rrect(c, -14, -8, 5, 8, 1.5, '#3a4658');
        glow(c, [-11.5, -4], 4, team, 0.8);
      }
      if (lv >= 1) {
        rrect(c, -13.5, -7, 27, 2.4, 1, '#3a4658', 1.1);
        rivets(c, [[-10, -5.8], [0, -5.8], [10, -5.8]], team);
      }
      if (lv >= 2) {
        // Floating shield fins.
        for (const s of [-1, 1]) shape(c, [[s * 14, -8], [s * 19, -20], [s * 16, -21], [s * 12, -10]], C.whiteB, 1.1);
        glow(c, [0, -11], 6, team, 0.7);
      }
      if (lv >= 3) {
        // Orbiting energy nodes and a halo.
        for (const x of [-16, 16]) {
          glow(c, [x, -24], 5, team, 0.9);
          dot(c, [x, -24], 1.8, '#ffffff');
        }
        ellipse(c, 0, -13, 13, 2.2, 0, rgba(team, 0.5), 0);
      }
      break;
    }
  }
}

/* ---- Heads ------------------------------------------------------------------- */

export function drawTurretHead(c: Ctx, id: TurretArtId, team: string, lv: number): void {
  switch (id) {
    case 'stone-spear': {
      // A wooden trough launcher with a stone-tipped spear.
      rrect(c, -10, -3, 24, 6, 2, C.wood);
      poly(c, [[-4, -3], [-2, -9], [4, -9]], 2, C.woodB);
      poly(c, [[-8, 0], [22, 0]], 1.8, C.woodB);
      shape(c, [[21, -2.4], [27, 0], [21, 2.4]], lv >= 3 ? '#2a2a3a' : C.stone);
      if (lv >= 3) glow(c, [24, 0], 5, '#8f7fff', 0.5);
      dot(c, [0, 0], 2.2, C.iron);
      if (lv >= 1) {
        poly(c, [[-2, -3.2], [-2, 3.2]], 1.4, C.leather);
        poly(c, [[6, -3.2], [6, 3.2]], 1.4, C.leather);
      }
      if (lv >= 2) {
        // Feathered fletching in the team color.
        shape(c, [[-10, 0], [-14, -3.5], [-11, 0], [-14, 3.5]], team, 1);
      }
      break;
    }
    case 'stone-boulder':
    case 'stone-firepot': {
      // A throwing arm: pivot at 0, cup at the end (drawn pointing right).
      const len = 20;
      poly(c, [[-5, 0], [len, 0]], lv >= 1 ? 3.6 : 3, C.wood);
      if (lv >= 1) {
        poly(c, [[4, -2], [4, 2]], 1.3, C.leather);
        poly(c, [[12, -2], [12, 2]], 1.3, C.leather);
      }
      // Counterweight at the short end.
      rrect(c, -10, -4, 6, 8, 2, lv >= 2 ? C.stoneB : C.stone);
      if (id === 'stone-boulder') {
        ellipse(c, len + 1, -2.5, 5, 3, 0, C.leather);
        dot(c, [len + 1, -5.5], lv >= 3 ? 4.6 : 3.8, lv >= 3 ? '#6d6a66' : C.stone);
        if (lv >= 3) {
          poly(c, [[len - 2, -7], [len - 1, -9.5]], 0.9, C.bone);
          poly(c, [[len + 3, -8.5], [len + 4.5, -10.5]], 0.9, C.bone);
        }
      } else {
        glow(c, [len + 1, -5], lv >= 3 ? 11 : 8, C.fire, 0.75);
        dot(c, [len + 1, -3.5], 4.2, lv >= 2 ? '#a0522d' : '#b5652d');
        shape(c, [[len - 2, -6], [len + 1, -12 - lv], [len + 4, -6]], C.fire, 1);
        shape(c, [[len - 0.5, -6], [len + 1, -9 - lv * 0.7], [len + 2.5, -6]], C.fireB, 0.8);
      }
      if (lv >= 2) pennantSmall(c, [-7, -4], team);
      dot(c, [0, 0], 2, C.iron);
      break;
    }
    case 'castle-crossbow': {
      // An arbalest: stock, steel prod, string and a loaded bolt.
      rrect(c, -9, -2.5, 22, 5, 1.5, C.wood);
      c.strokeStyle = OUT;
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(9, -10);
      c.quadraticCurveTo(14, 0, 9, 10);
      c.stroke();
      c.strokeStyle = lv >= 3 ? C.gold : C.steelB;
      c.lineWidth = 1.8;
      c.stroke();
      c.strokeStyle = C.cloth;
      c.lineWidth = 0.7;
      c.beginPath();
      c.moveTo(9, -10);
      c.lineTo(-2, 0);
      c.lineTo(9, 10);
      c.stroke();
      poly(c, [[-2, 0], [15, 0]], 1.2, C.woodB);
      shape(c, [[15, -1.8], [18, 0], [15, 1.8]], C.steel, 1);
      if (lv >= 1) rivets(c, [[-6, 0], [0, 0], [6, 0]], C.steel);
      if (lv >= 2) {
        // A second bolt ready in a rack.
        poly(c, [[-4, -5], [12, -5]], 1, C.woodB);
        shape(c, [[12, -6.4], [14.5, -5], [12, -3.6]], C.steel, 0.9);
        shape(c, [[-9, -2], [-13, -4.5], [-13, 0.5]], team, 1);
      }
      break;
    }
    case 'castle-ballista': {
      rrect(c, -12, -3, 30, 6, 1.5, C.wood);
      // Two arms with torsion springs.
      for (const s of [-1, 1]) {
        dot(c, [4, s * 4], 2.6, lv >= 1 ? C.iron : C.leather);
        poly(c, [[4, s * 4], [-2, s * 14]], 2.4, C.woodB);
      }
      c.strokeStyle = C.cloth;
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(-2, -14);
      c.lineTo(-9, 0);
      c.lineTo(-2, 14);
      c.stroke();
      poly(c, [[-9, 0], [20, 0]], 1.8, C.woodB);
      shape(c, [[19, -2.6], [25, 0], [19, 2.6]], C.steel, 1.1);
      if (lv >= 2) shape(c, [[-12, 0], [-16, -4], [-13, 0], [-16, 4]], team, 1);
      if (lv >= 3) {
        goldTrim(c, [-11, -3], [17, -3]);
        goldTrim(c, [-11, 3], [17, 3]);
      }
      break;
    }
    case 'castle-oil': {
      // The cauldron itself (it tips forward to pour).
      shape(c, [[-9, -9], [9, -9], [8, 2], [4, 6], [-4, 6], [-8, 2]], lv >= 3 ? '#b07a3a' : C.iron);
      rrect(c, -10, -11, 20, 3, 1.5, lv >= 3 ? C.gold : C.steelD, 1.2);
      poly(c, [[9, -9], [13, -12]], 2, lv >= 3 ? '#b07a3a' : C.iron);
      // Boiling oil.
      ellipse(c, 0, -10, 8, 1.6, 0, '#2b2418', 0);
      for (const [x, r] of [[-3, 1.4], [2, 1.1], [5, 0.9]] as const) dot(c, [x, -11.5], r, '#6a5a3a');
      if (lv >= 1) {
        rrect(c, -8.5, -4, 17, 2, 1, C.steelD, 1);
        rivets(c, [[-6, -3], [0, -3], [6, -3]], C.steel);
      }
      if (lv >= 2) {
        poly(c, [[-9, -9], [-12, -16]], 0.8, C.iron);
        poly(c, [[9, -9], [12, -16]], 0.8, C.iron);
        dot(c, [0, 1], 2.2, team);
      }
      if (lv >= 3) glow(c, [0, -12], 8, C.fireB, 0.35);
      break;
    }
    case 'renaissance-musket': {
      // A volley gun: several musket barrels on one stock.
      const n = lv >= 1 ? 3 : 2;
      rrect(c, -9, -3, 14, 6.5, 2, C.wood);
      for (let i = 0; i < n; i++) {
        const y = (i - (n - 1) / 2) * 2.6;
        bar(c, [0, y], [20, y], 1.5, lv >= 3 ? '#b5883a' : C.iron);
      }
      dot(c, [-2, 0], 2, C.iron);
      if (lv >= 2) pennantSmall(c, [-8, -3], team);
      if (lv >= 3) goldTrim(c, [-8, 3.5], [4, 3.5]);
      break;
    }
    case 'renaissance-cannon': {
      // Bronze barrel with reinforcing rings and a cascabel.
      const bronze = lv >= 3 ? '#d8a848' : '#b5883a';
      dot(c, [-9, 0], 2.4, bronze);
      shape(c, [[-8, -4.6], [20, -3.2], [20, 3.2], [-8, 4.6]], bronze);
      rrect(c, 19, -4.2, 4.5, 8.4, 1.5, shade(bronze, 0.85));
      c.fillStyle = OUT;
      c.beginPath();
      c.arc(23, 0, 1.6, 0, Math.PI * 2);
      c.fill();
      dot(c, [0, 0], 2, C.iron);
      if (lv >= 1) for (const x of [-4, 6, 14]) rrect(c, x, -4.6 + x * 0.05, 2, 9.2 - x * 0.1, 0.6, shade(bronze, 0.75), 1);
      if (lv >= 2) {
        // Dolphins (handles) on top.
        c.strokeStyle = OUT;
        c.lineWidth = 2.6;
        c.beginPath();
        c.arc(4, -5, 2.2, Math.PI, 0);
        c.stroke();
        c.strokeStyle = bronze;
        c.lineWidth = 1.2;
        c.stroke();
      }
      if (lv >= 3) {
        // A lion's mouth muzzle.
        shape(c, [[19, -5.5], [24.5, -3.5], [24.5, 3.5], [19, 5.5]], C.gold, 1.2);
        c.fillStyle = OUT;
        c.beginPath();
        c.arc(24, 0, 1.7, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'renaissance-mortar': {
      shape(c, [[-6, -6.5], [12, -5], [12, 5], [-6, 6.5]], lv >= 3 ? '#b5883a' : '#4a4d52');
      rrect(c, 11, -6, 3.5, 12, 1.2, lv >= 3 ? C.gold : '#3a3d42');
      dot(c, [0, 0], 2.4, C.iron);
      if (lv >= 1) rrect(c, 3, -6, 2.2, 12, 0.8, '#3a3d42', 1);
      if (lv >= 2) dot(c, [6, 0], 1.8, team);
      break;
    }
    case 'modern-machine-gun': {
      // Gun shield, receiver, perforated barrel jacket, ammo box.
      rrect(c, -10, -3, 14, 6, 1.5, C.iron);
      rrect(c, 3, -2, 12, 4, 1, '#3a3d42');
      c.fillStyle = OUT;
      for (let x = 5; x < 14; x += 2.4) c.fillRect(x, -0.6, 1.1, 1.2);
      bar(c, [14, 0], [22, 0], 1.2, C.iron);
      rrect(c, -6, 2.5, 6, 5, 1, C.olive, 1.1);
      if (lv >= 1) shape(c, [[2, -9], [5, -9], [5, 7], [2, 7]], C.oliveB, 1.2);
      if (lv >= 2) {
        // Twin barrel.
        bar(c, [3, -4], [21, -4], 1.2, C.iron);
        dot(c, [3.5, -1], 1.4, team);
      }
      if (lv >= 3) {
        // Optic sight.
        rrect(c, -6, -7, 7, 3, 1, C.black, 1);
        dot(c, [1, -5.5], 1, C.glass);
      }
      break;
    }
    case 'modern-artillery': {
      rrect(c, -8, -4, 14, 8, 2, C.olive);
      bar(c, [4, 0], [26, 0], 3.2, C.oliveB);
      // Muzzle brake.
      rrect(c, 25, -3, 4.5, 6, 1, C.iron, 1.2);
      dot(c, [0, 0], 2.2, C.iron);
      if (lv >= 1) shape(c, [[-3, -9], [6, -9], [6, 4], [-3, 4]], C.olive, 1.2);
      if (lv >= 2) {
        rrect(c, 8, -6, 6, 3, 1, C.oliveB, 1);
        dot(c, [1.5, -5.5], 1.6, team);
      }
      if (lv >= 3) {
        c.fillStyle = C.white;
        for (let i = 0; i < 3; i++) c.fillRect(12 + i * 3.5, -1.5, 1.2, 3);
      }
      break;
    }
    case 'modern-grenade': {
      rrect(c, -8, -3.5, 12, 7, 2, '#3a3d42');
      bar(c, [3, 0], [17, 0], 3.6, C.iron);
      // Revolving drum.
      dot(c, [-1, 3], 4.4, C.olive);
      for (let i = 0; i < 6; i++) dot(c, pt([-1, 3], (i * Math.PI) / 3, 2.6), 0.7, OUT);
      if (lv >= 1) rrect(c, 10, -2.8, 2, 5.6, 0.6, C.olive, 1);
      if (lv >= 2) dot(c, [-5, -2], 1.5, team);
      if (lv >= 3) {
        dot(c, [8, 5], 2, C.olive);
        dot(c, [12, 5], 2, C.olive);
      }
      break;
    }
    case 'future-laser': {
      ellipse(c, 0, 0, 9, 7, 0, C.white);
      rrect(c, 2, -2.8, 15, 5.6, 2.8, C.whiteB);
      rrect(c, 15, -3.6, 4, 7.2, 1.5, '#3a4658');
      glow(c, [19, 0], 6, team, 0.8);
      dot(c, [19, 0], 1.6, '#ffffff');
      c.fillStyle = team;
      c.fillRect(-6, -1, 10, 2);
      if (lv >= 1) {
        rrect(c, 6, -4.2, 6, 1.8, 0.8, '#3a4658', 1);
        rrect(c, 6, 2.4, 6, 1.8, 0.8, '#3a4658', 1);
      }
      if (lv >= 2) {
        // Second emitter.
        rrect(c, 2, 5, 12, 3.4, 1.7, C.whiteB, 1.1);
        glow(c, [14, 6.7], 4, team, 0.7);
      }
      if (lv >= 3) glow(c, [0, 0], 12, team, 0.35);
      break;
    }
    case 'future-rail': {
      rrect(c, -10, -5, 16, 10, 3, C.white);
      // Twin rails with coils between them.
      bar(c, [2, -3], [30, -3], 1.8, '#3a4658');
      bar(c, [2, 3], [30, 3], 1.8, '#3a4658');
      const coils = lv >= 1 ? 4 : 3;
      for (let i = 0; i < coils; i++) {
        const x = 7 + i * 5.5;
        rrect(c, x, -4.5, 2.4, 9, 1, team, 1);
      }
      glow(c, [28, 0], 5, team, 0.6);
      if (lv >= 2) glow(c, [-2, 0], 8, team, 0.5);
      if (lv >= 3) {
        goldTrim(c, [-9, -5], [5, -5]);
        for (let i = 0; i < 4; i++) glow(c, [8 + i * 5.5, 0], 3, '#ffffff', 0.5);
      }
      break;
    }
    case 'future-plasma': {
      ellipse(c, 0, 0, 8, 8, 0, C.white);
      rrect(c, 2, -4, 13, 8, 3, C.whiteB);
      rrect(c, 13, -5, 4, 10, 2, '#3a4658');
      glow(c, [0, 0], 7 + lv, C.plasma, 0.8);
      dot(c, [0, 0], 3, '#e0c8ff');
      if (lv >= 1) poly(c, [[-5, -6], [5, -6]], 1.2, '#3a4658');
      if (lv >= 2) dot(c, [8, -5.5], 1.4, team);
      if (lv >= 3) {
        for (let i = 0; i < 3; i++) dot(c, pt([0, 0], i * 2.1, 10), 1.3, C.plasma);
      }
      break;
    }
  }
}

function pennantSmall(c: Ctx, base: P2, team: string): void {
  poly(c, [base, [base[0], base[1] - 9]], 0.9, C.woodB);
  shape(c, [[base[0], base[1] - 9], [base[0] - 7, base[1] - 7], [base[0], base[1] - 5]], team, 1);
}

/** A filled polygon without an outline (flames, flashes). */
function fillPoly(c: Ctx, ps: P2[], col: string): void {
  c.beginPath();
  c.moveTo(ps[0]![0], ps[0]![1]);
  for (const p of ps.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
  c.fillStyle = col;
  c.fill();
}

/** Muzzle flash sprites, drawn around (0, 0) pointing right. */
export function drawTurretFlash(c: Ctx, kind: 'fire' | 'laser' | 'plasma'): void {
  if (kind === 'fire') {
    glow(c, [4, 0], 12, C.fireB, 0.9);
    fillPoly(c, [[0, -4], [16, 0], [0, 4], [4, 0]], '#fff2b0');
    fillPoly(c, [[2, -2], [10, 0], [2, 2]], '#ffffff');
    for (const a of [-0.9, 0.9]) fillPoly(c, [[2, -1], pt([2, 0], Math.PI / 2 + a, 8), [2, 1]], '#ffd35a');
  } else if (kind === 'laser') {
    glow(c, [2, 0], 10, '#aef8ff', 0.9);
    glow(c, [2, 0], 4, '#ffffff', 1);
  } else {
    glow(c, [3, 0], 12, C.plasma, 0.9);
    glow(c, [3, 0], 5, '#f0e0ff', 1);
  }
}
