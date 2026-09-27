/**
 * The player's Mech (the Mech workshop, `config/mech.config.ts`), drawn from
 * its five parts: legs, torso, head, left arm (near side) and right arm (far
 * side). Every part has one shape per option and five looks, one per age:
 * a stone-and-log golem, an iron siege knight, brass clockwork, an olive war
 * machine and white future armor with glowing team lines. Same outline
 * style as the rest of the rig art (`rigKit.ts`).
 *
 * Coordinates are rig units: feet at y = 0, up is negative, facing +x.
 * `utils/RigArt.ts` renders sheets from `drawMechDesign`; the Workshop tab
 * draws its preview with the same function. Pure canvas drawing.
 */
import type { RigAnim } from '@/art/rigFigure';
import {
  bar,
  bump,
  C,
  clamp01,
  dot,
  ease,
  ellipse,
  glow,
  lerp,
  muzzleFlash,
  OUT,
  poly,
  pt,
  rgba,
  rrect,
  shade,
  shape,
  smoke,
  type Ctx,
  type P2,
} from '@/art/rigKit';
import type { ArmId, HeadId, LegsId, MechDesign, TorsoId } from '@config/mech.config';

export interface MechLook extends MechDesign {
  /** The age the parts were built in: picks their look (0-4). */
  age: number;
}

/** Materials of an age. */
interface Palette {
  main: string;
  mainB: string;
  mainD: string;
  /** Second material (wood, leather, copper, black rubber, dark joints). */
  trim: string;
  /** Hard bits: bone, iron, bronze, gunmetal, circuitry. */
  metal: string;
  /** Detail color: moss, gold, cream, hazard yellow, glow. */
  accent: string;
  /** Light of cores and lamps; null uses the team color. */
  fire: string | null;
}

const PALETTES: readonly Palette[] = [
  // Stone: a golem of stacked stone and logs, bone tools, moss.
  { main: '#9a958c', mainB: '#7f7a71', mainD: '#5f5b54', trim: C.wood, metal: C.bone, accent: '#6f8f3a', fire: C.fire },
  // Castle: iron plate over oak, rivets and gold trim.
  { main: '#aeb5bd', mainB: '#8a9099', mainD: '#5d636b', trim: '#6b4a2a', metal: '#4a4d52', accent: C.gold, fire: '#ffb347' },
  // Renaissance: brass and bronze clockwork, copper pipes.
  { main: '#c9a04a', mainB: '#a47e33', mainD: '#7a5a22', trim: '#9a5a32', metal: '#5a4a32', accent: '#efe3c4', fire: '#ffd35a' },
  // Modern: olive steel, black joints, hazard stripes.
  { main: C.olive, mainB: C.oliveB, mainD: '#3a4022', trim: '#34342e', metal: '#2a2622', accent: '#f2c744', fire: null },
  // Future: white armor, dark joints, glowing team lines.
  { main: C.white, mainB: C.whiteB, mainD: '#8e99a6', trim: '#3a4a5a', metal: '#5d636b', accent: C.glass, fire: null },
];

function palette(age: number): Palette {
  return PALETTES[Math.max(0, Math.min(PALETTES.length - 1, age))]!;
}

/** Hip height above the ground per legs. */
const HIP: Readonly<Record<LegsId, number>> = { walker: 34, stompers: 34, treads: 24 };

/** Everything that moves, for one frame. */
interface Pose {
  age: number;
  pal: Palette;
  team: string;
  anim: RigAnim;
  u: number;
  /** Walk phase in radians (0 when not walking). */
  p: number;
  walking: boolean;
  /** 0..1 through the death. */
  collapse: number;
  /** Hip (torso bottom) position. */
  hip: P2;
  /** Torso lean, radians (+ tips forward). */
  tilt: number;
}

/* ---- Age details ---------------------------------------------------------------------------- */

/** An age's surface detail on a plate: cracks and moss, rivets, a gear, panel lines, glow lines. */
function details(c: Ctx, x: number, y: number, w: number, h: number, s: Pose): void {
  switch (s.age) {
    case 0: {
      c.strokeStyle = rgba(OUT, 0.55);
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x + w * 0.25, y + h * 0.2);
      c.lineTo(x + w * 0.4, y + h * 0.45);
      c.lineTo(x + w * 0.3, y + h * 0.7);
      c.moveTo(x + w * 0.7, y + h * 0.3);
      c.lineTo(x + w * 0.62, y + h * 0.55);
      c.stroke();
      dot(c, [x + w * 0.8, y + h * 0.8], 1.3, s.pal.accent);
      dot(c, [x + w * 0.15, y + h * 0.85], 1, s.pal.accent);
      return;
    }
    case 1:
      for (const [fx, fy] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]] as const) {
        c.beginPath();
        c.arc(x + w * fx, y + h * fy, 0.9, 0, Math.PI * 2);
        c.fillStyle = s.pal.metal;
        c.fill();
      }
      return;
    case 2:
      gear(c, [x + w * 0.72, y + h * 0.4], Math.min(w, h) * 0.22, s.u * Math.PI * 2, s.pal.mainD);
      return;
    case 3: {
      c.strokeStyle = rgba(OUT, 0.5);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x + w * 0.1, y + h * 0.5);
      c.lineTo(x + w * 0.9, y + h * 0.5);
      c.stroke();
      c.fillStyle = s.pal.metal;
      c.fillRect(x + w * 0.12, y + h * 0.18, 1.2, 1.2);
      c.fillRect(x + w * 0.8, y + h * 0.18, 1.2, 1.2);
      return;
    }
    default:
      c.fillStyle = s.team;
      c.fillRect(x + w * 0.1, y + h * 0.55, w * 0.8, 1.3);
      glow(c, [x + w * 0.5, y + h * 0.56], w * 0.3, s.team, 0.25);
  }
}

function gear(c: Ctx, p: P2, r: number, spin: number, col: string): void {
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = spin + (i * Math.PI) / 8;
    const rr = i % 2 ? r : r * 1.3;
    c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 0.9;
  c.strokeStyle = OUT;
  c.stroke();
  dot(c, p, r * 0.35, shade(col, 0.7));
}

/** A plate in the age's main material with its detail. */
function plate(c: Ctx, x: number, y: number, w: number, h: number, r: number, col: string, s: Pose): void {
  rrect(c, x, y, w, h, r, col);
  details(c, x, y, w, h, s);
}

function hazard(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.fillStyle = '#f2c744';
  c.fillRect(x, y, w, h);
  c.fillStyle = C.black;
  for (let i = -h; i < w; i += 4) {
    c.beginPath();
    c.moveTo(x + i, y + h);
    c.lineTo(x + i + 2, y + h);
    c.lineTo(x + i + 2 + h, y);
    c.lineTo(x + i + h, y);
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** The light of cores and lamps: fire in the early ages, the team color later. */
function light(s: Pose): string {
  return s.pal.fire ?? s.team;
}

/* ---- Legs ----------------------------------------------------------------------------------- */

function drawLegs(c: Ctx, legs: LegsId, s: Pose, near: boolean): void {
  if (legs === 'treads') {
    if (!near) drawTreads(c, s);
    return;
  }
  const heavy = legs === 'stompers';
  const side = near ? 1 : -1;
  const sw = s.walking ? Math.sin(s.p) * side : 0;
  const lift = s.walking ? Math.max(0, Math.cos(s.p) * side) : 0;
  let a = (heavy ? 0.12 : 0.28) + sw * (heavy ? 0.32 : 0.42);
  let bend = (heavy ? 0.42 : 0.86) + lift * (heavy ? 0.4 : 0.55);
  if (s.collapse > 0) {
    a += s.collapse * (near ? 0.9 : 0.5);
    bend += s.collapse * 1.2;
  }
  const hip: P2 = [s.hip[0] + (near ? 3 : -3), s.hip[1]];
  const thigh = heavy ? 15 : 17;
  const shin = heavy ? 17 : 17;
  const knee = pt(hip, a, thigh);
  const ankle = pt(knee, a - bend, shin);
  const col = near ? s.pal.main : s.pal.mainB;
  const colB = near ? s.pal.mainB : s.pal.mainD;
  if (s.age === 0) {
    // Stone: log thighs lashed to stone shins.
    poly(c, [hip, knee], heavy ? 10 : 7, near ? s.pal.trim : shade(s.pal.trim, 0.8));
    poly(c, [knee, ankle], heavy ? 12 : 7.5, colB);
  } else {
    poly(c, [hip, knee], heavy ? 10 : 7, col);
    poly(c, [knee, ankle], heavy ? 12 : 6.5, colB);
  }
  if (s.age === 4) poly(c, [pt(knee, a - bend, 3), pt(knee, a - bend, shin - 4)], 1.2, s.team);
  if (s.age === 3 && near) {
    const m = pt(knee, a - bend, shin * 0.45);
    hazard(c, m[0] - 3, m[1] - 1.5, 6, 3);
  }
  dot(c, knee, heavy ? 4 : 3, s.pal.metal);
  // Foot.
  const fw = heavy ? 18 : 13;
  const fh = heavy ? 6 : 4.5;
  rrect(c, ankle[0] - fw * 0.35, ankle[1] - fh * 0.6, fw, fh, heavy ? 3 : 2, near ? s.pal.mainD : shade(s.pal.mainD, 0.85));
  if (heavy && s.age >= 1) {
    for (let i = 0; i < 3; i++) dot(c, [ankle[0] - fw * 0.35 + 3 + i * 5, ankle[1] + fh * 0.4], 1.2, s.pal.metal);
  }
}

function drawTreads(c: Ctx, s: Pose): void {
  const spin = s.walking ? -s.u * Math.PI * 4 : 0;
  const vib = s.walking ? Math.sin(s.u * Math.PI * 12) * 0.3 : 0;
  const x0 = s.hip[0];
  const drop = s.collapse * 2;
  c.save();
  c.translate(0, vib + drop);
  // Pelvis on top of the tracks.
  plate(c, x0 - 11, s.hip[1] - 2, 22, 9, 3, s.pal.mainB, s);
  // Track block.
  const trackCol = s.age === 0 ? s.pal.trim : s.age === 4 ? s.pal.trim : shade(s.pal.trim, 1);
  rrect(c, x0 - 25, -17, 50, 17, 8.5, trackCol);
  const wheelCol = s.age === 0 ? s.pal.mainB : s.pal.metal;
  for (let i = 0; i < 4; i++) {
    const w: P2 = [x0 - 17 + i * 11.3, -8.5];
    dot(c, w, 5, wheelCol);
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const a = spin + (k * Math.PI) / 2;
      const p1 = pt(w, a, 4);
      const p2 = pt(w, a + Math.PI, 4);
      c.beginPath();
      c.moveTo(p1[0], p1[1]);
      c.lineTo(p2[0], p2[1]);
      c.stroke();
    }
    dot(c, w, 1.5, s.pal.mainD);
  }
  // Track teeth.
  c.fillStyle = OUT;
  const off = s.walking ? (s.u * 12) % 5 : 0;
  for (let x = x0 - 22 + off; x < x0 + 23; x += 5) c.fillRect(x, -17.4, 2, 1.5);
  // Side skirt with the age's look.
  plate(c, x0 - 20, -21, 40, 7, 2.5, s.pal.main, s);
  if (s.age === 3) hazard(c, x0 + 10, -20, 8, 5);
  c.restore();
}

/* ---- Torso ---------------------------------------------------------------------------------- */

/** Shoulder joints in torso space (relative to the hip). */
const SHOULDER_NEAR: P2 = [5, -31];
const SHOULDER_FAR: P2 = [-5, -33];

function drawTorso(c: Ctx, torso: TorsoId, s: Pose): void {
  const pal = s.pal;
  switch (torso) {
    case 'frame': {
      // An open frame: back plate, struts, a small engine in the middle.
      shape(c, [[-15, -40], [15, -40], [10, -2], [-10, -2]], shade(pal.mainD, 0.8));
      rrect(c, -6, -26, 12, 12, 3, pal.metal);
      glow(c, [0, -20], 7, light(s), 0.55 + 0.25 * Math.sin(s.u * Math.PI * 4));
      dot(c, [0, -20], 2.4, light(s));
      poly(c, [[-15, -40], [15, -40]], 4.5, pal.main);
      poly(c, [[-15, -40], [-10, -2], [10, -2], [15, -40]], 3.5, pal.main);
      poly(c, [[-12, -30], [11, -12]], 2, pal.mainB);
      poly(c, [[12, -30], [-11, -12]], 2, pal.mainB);
      if (s.age === 0) {
        // Rope lashings.
        poly(c, [[-14, -34], [-9, -34]], 1.5, C.khaki);
        poly(c, [[9, -34], [14, -34]], 1.5, C.khaki);
      }
      emblem(c, [0, -35], 3.2, s);
      return;
    }
    case 'hull': {
      plate(c, -17, -42, 34, 40, 11, pal.main, s);
      rrect(c, -14, -13, 28, 9, 3, pal.mainB, 1.3);
      // Chest plate and the team badge.
      rrect(c, -9, -36, 20, 15, 5, pal.mainB, 1.3);
      emblem(c, [1, -28.5], 4.2, s);
      if (s.age === 3) hazard(c, -13, -11, 26, 5);
      if (s.age === 2) {
        poly(c, [[-17, -20], [-22, -20], [-22, -6]], 2.2, pal.trim);
        dot(c, [-22, -6], 1.8, pal.trim);
      }
      return;
    }
    case 'reactor': {
      plate(c, -16, -40, 32, 38, 8, pal.main, s);
      // Vents and pipes.
      c.fillStyle = OUT;
      for (let i = 0; i < 4; i++) c.fillRect(-13 + i * 3.2, -37, 1.4, 5);
      poly(c, [[16, -30], [20, -30], [20, -14], [16, -14]], 2, pal.trim);
      // The core: fire in the early ages, a team-colored reactor later.
      const pulse = 0.5 + 0.5 * Math.sin(s.u * Math.PI * 4);
      dot(c, [0, -21], 8.5, pal.mainD);
      glow(c, [0, -21], 13 + pulse * 4, light(s), 0.55 + 0.3 * pulse);
      dot(c, [0, -21], 6, s.age <= 2 ? '#3a1a0a' : '#16202e');
      glow(c, [0, -21], 7, light(s), 0.95);
      dot(c, [0, -21], 2.6, s.age <= 2 ? C.fireB : '#ffffff');
      if (s.age === 0) {
        // A fire pit in a stone ring.
        for (let i = 0; i < 6; i++) dot(c, pt([0, -21], (i * Math.PI) / 3, 8), 1.6, pal.mainB);
      }
      emblem(c, [-9, -8], 2.8, s);
      return;
    }
  }
}

/** The team mark on the chest: painted hand, heraldic shield, a cockade, a star, a glowing ring. */
function emblem(c: Ctx, p: P2, r: number, s: Pose): void {
  switch (s.age) {
    case 0:
      dot(c, p, r, s.team);
      dot(c, p, r * 0.35, C.bone);
      return;
    case 1:
      shape(c, [[p[0] - r, p[1] - r], [p[0] + r, p[1] - r], [p[0] + r, p[1] + r * 0.2], [p[0], p[1] + r * 1.3], [p[0] - r, p[1] + r * 0.2]], s.team, 1.2);
      poly(c, [[p[0], p[1] - r * 0.7], [p[0], p[1] + r * 0.8]], 0.8, s.pal.accent);
      return;
    case 2:
      dot(c, p, r, s.pal.accent);
      dot(c, p, r * 0.65, s.team);
      return;
    case 3:
      star(c, p, r, s.team);
      return;
    default:
      glow(c, p, r * 2, s.team, 0.7);
      c.strokeStyle = s.team;
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(p[0], p[1], r, 0, Math.PI * 2);
      c.stroke();
  }
}

function star(c: Ctx, p: P2, r: number, col: string): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = OUT;
  c.stroke();
}

/* ---- Head ----------------------------------------------------------------------------------- */

function drawHead(c: Ctx, head: HeadId, s: Pose): void {
  const pal = s.pal;
  const top: P2 = [2, -41];
  c.save();
  c.translate(top[0], top[1]);
  // Neck.
  rrect(c, -3, -3, 6, 5, 1.5, pal.metal, 1.2);
  // Helmet shape per age.
  switch (s.age) {
    case 0:
      // A carved stone mask.
      shape(c, [[-7, -2], [-8, -12], [-3, -16], [6, -15], [9, -9], [8, -2]], pal.main);
      details(c, -7, -15, 15, 13, s);
      break;
    case 1:
      // A great helm.
      rrect(c, -7, -16, 15, 15, 3, pal.main);
      poly(c, [[1, -16], [1, -2]], 1, pal.mainB);
      break;
    case 2:
      // A brass diving helm.
      dot(c, [0.5, -9], 8, pal.main);
      break;
    case 3:
      rrect(c, -7, -14, 16, 13, 4, pal.main);
      break;
    default:
      shape(c, [[-7, -2], [-7, -12], [-2, -16], [8, -14], [10, -6], [8, -2]], pal.main);
  }
  // Eyes / visor.
  const lit = light(s);
  switch (s.age) {
    case 0:
      dot(c, [3, -10], 1.6, OUT);
      dot(c, [7, -10], 1.4, OUT);
      glow(c, [5, -10], 4, lit, 0.5);
      break;
    case 1:
      c.fillStyle = OUT;
      c.fillRect(2, -11, 6, 1.6);
      for (let i = 0; i < 3; i++) c.fillRect(4 + i * 1.6, -7, 0.8, 2.4);
      break;
    case 2:
      dot(c, [4, -9], 4, pal.accent);
      dot(c, [4, -9], 2.8, C.glass);
      break;
    case 3:
      c.fillStyle = OUT;
      c.fillRect(0, -10, 9, 2.4);
      glow(c, [6, -9], 4, '#ff5a3a', 0.6);
      break;
    default:
      shape(c, [[1, -11], [9, -11], [9.5, -7], [1, -7]], '#16202e', 1);
      glow(c, [6, -9], 6, s.team, 0.85);
  }
  // The head part on top.
  switch (head) {
    case 'visor':
      // A sensor stalk.
      poly(c, [[-4, -14], [-6, -20]], 1.2, pal.metal);
      dot(c, [-6, -20.5], 1.6, s.age >= 3 ? s.team : pal.accent);
      break;
    case 'crest':
      drawCrest(c, s);
      break;
    case 'beacon':
      drawBeacon(c, s);
      break;
  }
  c.restore();
}

function drawCrest(c: Ctx, s: Pose): void {
  const wave = Math.sin(s.u * Math.PI * 2) * (s.walking ? 1.5 : 0.6);
  switch (s.age) {
    case 0:
      // Feathers and bones.
      for (let i = 0; i < 3; i++) {
        const base: P2 = [-5 + i * 3, -14];
        poly(c, [base, [base[0] - 3 + wave * 0.3, base[1] - 11 + i]], 2.4, i === 1 ? s.team : C.bone);
      }
      break;
    case 1: {
      // A tall plume in the team color.
      poly(c, [[-1, -16], [-2, -20]], 1.4, s.pal.accent);
      shape(c, [[-2, -20], [-12 + wave, -28], [-6 + wave, -22], [-14 + wave, -24], [-3, -18]], s.team, 1.2);
      break;
    }
    case 2:
      // A cavalier's feathered hat brim.
      ellipse(c, 0.5, -15, 10, 2.4, 0, s.pal.metal, 1.2);
      shape(c, [[-3, -16], [-14 + wave, -26], [-7 + wave, -19]], s.team, 1.1);
      break;
    case 3:
      // Antenna with a pennant.
      poly(c, [[-4, -14], [-7, -32]], 0.9, C.iron);
      shape(c, [[-7, -32], [1 + wave, -30], [-6.5, -27.5]], s.team, 1);
      break;
    default:
      // A holo fin.
      shape(c, [[-5, -14], [-9, -26], [2, -16]], rgba(s.team, 0.8), 1);
      glow(c, [-5, -20], 7, s.team, 0.6);
  }
}

function drawBeacon(c: Ctx, s: Pose): void {
  const pulse = 0.5 + 0.5 * Math.sin(s.u * Math.PI * 4);
  const lampAt: P2 = [-1, -21];
  switch (s.age) {
    case 0:
      // A brazier with a flame.
      shape(c, [[-6, -15], [4, -15], [2, -19], [-4, -19]], s.pal.mainD);
      glow(c, lampAt, 9 + pulse * 3, C.fire, 0.8);
      shape(c, [[-4, -19], [-1, -27 - pulse * 2], [2, -19]], C.fireB, 0);
      break;
    case 1:
    case 2:
      // A lantern.
      rrect(c, -5, -24, 8, 9, 2, s.age === 1 ? s.pal.metal : s.pal.main, 1.2);
      glow(c, lampAt, 8 + pulse * 3, s.pal.fire ?? C.fireB, 0.85);
      dot(c, [-1, -19.5], 2, C.fireB);
      poly(c, [[-1, -24], [-1, -26]], 1, s.pal.metal);
      break;
    case 3:
      // A siren light.
      rrect(c, -5, -17, 8, 3, 1, C.iron, 1);
      ellipse(c, -1, -20, 4, 3.4, 0, '#ff5a3a');
      glow(c, [-1 + Math.cos(s.u * Math.PI * 4) * 4, -20], 7, '#ff5a3a', 0.6 + 0.3 * pulse);
      break;
    default:
      // A holo emitter ring.
      ellipse(c, -1, -18, 6, 1.8, 0, s.pal.mainB, 1);
      c.strokeStyle = rgba(s.team, 0.9);
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(-1, -23, 4 + pulse * 3, 1.5 + pulse, 0, 0, Math.PI * 2);
      c.stroke();
      glow(c, [-1, -22], 8, s.team, 0.6);
  }
}

/* ---- Arms ----------------------------------------------------------------------------------- */

/** Upper arm and forearm angles (`pt` convention) plus effects, for one arm this frame. */
interface ArmPose {
  ua: number;
  fa: number;
  /** Shoulder slide back (recoil, drill wind-up). */
  back: number;
  flash: number;
  spin: number;
}

function armPose(arm: ArmId, s: Pose, near: boolean): ArmPose {
  const sway = s.walking ? Math.sin(s.p) * (near ? -0.18 : 0.18) : 0;
  // The far arm is carried high (at the chest, like a shoulder weapon) so
  // both arms' tools show; the near arm works at the waist.
  const rest = near ? 0.35 : 1.25;
  const pose: ArmPose = { ua: rest + sway, fa: near ? 1.45 : 1.5, back: 0, flash: 0, spin: s.walking ? s.u * Math.PI * 4 : 0 };
  if (arm === 'launcher') {
    pose.ua = (near ? 0.62 : 1.3) + sway * 0.4;
    pose.fa = Math.PI / 2;
  }
  if (arm === 'shield') {
    pose.ua = (near ? 0.55 : 1.1) + sway * 0.5;
    pose.fa = 1.25;
  }
  if (s.anim === 'attack') {
    const u = s.u;
    const restUa = pose.ua;
    const restFa = pose.fa;
    if (arm === 'fist' || arm === 'blade') {
      // Raise, smash at 45%, hold, return.
      const hitFa = arm === 'blade' ? 2.2 : 1.9;
      if (u < 0.3) {
        const k = ease(u / 0.3);
        pose.ua = lerp(restUa, -2.1, k);
        pose.fa = lerp(restFa, 3.2, k);
      } else if (u < 0.45) {
        const k = (u - 0.3) / 0.15;
        pose.ua = lerp(-2.1, 1.0, k);
        pose.fa = lerp(3.2, hitFa, k);
      } else if (u < 0.6) {
        pose.ua = 1.0;
        pose.fa = hitFa;
      } else {
        const k = ease((u - 0.6) / 0.4);
        pose.ua = lerp(1.0, restUa, k);
        pose.fa = lerp(hitFa, restFa, k);
      }
    } else if (arm === 'drill') {
      pose.fa = Math.PI / 2;
      pose.spin = u * Math.PI * 10;
      const reachUa = near ? 1.1 : 1.45;
      if (u < 0.3) pose.back = 4 * ease(u / 0.3);
      else if (u < 0.45) {
        pose.back = lerp(4, -5, (u - 0.3) / 0.15);
        pose.ua = lerp(restUa, reachUa, (u - 0.3) / 0.15);
      } else if (u < 0.6) {
        pose.back = -5;
        pose.ua = reachUa;
      } else {
        const k = ease((u - 0.6) / 0.4);
        pose.back = lerp(-5, 0, k);
        pose.ua = lerp(reachUa, restUa, k);
      }
    } else if (arm === 'launcher') {
      const recoil = u >= 0.45 ? Math.max(0, 1 - (u - 0.45) / 0.3) : 0;
      pose.back = recoil * 3.5;
      pose.flash = u >= 0.45 && u < 0.56 ? 1 - (u - 0.45) / 0.11 : 0;
      pose.ua -= recoil * 0.15;
    } else if (arm === 'shield') {
      pose.back = -2.5 * bump(u, 0.3, 0.7);
    }
  }
  if (s.collapse > 0) {
    pose.ua = lerp(pose.ua, 0.05, s.collapse);
    pose.fa = lerp(pose.fa, 0.35, s.collapse);
  }
  return pose;
}

function drawArm(c: Ctx, arm: ArmId, s: Pose, near: boolean): void {
  const pose = armPose(arm, s, near);
  const pal = s.pal;
  const sh0 = near ? SHOULDER_NEAR : SHOULDER_FAR;
  const sh: P2 = [sh0[0] - pose.back, sh0[1]];
  const elbow = pt(sh, pose.ua, 13);
  const hand = pt(elbow, pose.fa, 12);
  const col = near ? pal.main : pal.mainB;
  const colB = near ? pal.mainB : pal.mainD;
  c.save();
  if (!near) c.globalAlpha *= 0.96;
  // Shoulder pad, upper arm, forearm.
  if (s.age === 0) {
    poly(c, [sh, elbow], 7, near ? pal.trim : shade(pal.trim, 0.8));
  } else {
    poly(c, [sh, elbow], 7, col);
  }
  dot(c, elbow, 2.8, pal.metal);
  poly(c, [elbow, hand], 6.5, colB);
  if (s.age === 4) poly(c, [pt(elbow, pose.fa, 2), pt(elbow, pose.fa, 9)], 1.1, s.team);
  const pad = near ? pal.main : pal.mainB;
  ellipse(c, sh[0], sh[1], 6.5, 5.5, 0, pad);
  details(c, sh[0] - 5, sh[1] - 4, 10, 8, s);
  // The tool.
  drawTool(c, arm, s, hand, pose, near);
  c.restore();
}

function drawTool(c: Ctx, arm: ArmId, s: Pose, hand: P2, pose: ArmPose, near: boolean): void {
  if (arm === 'shield') {
    drawShield(c, s, hand, near);
    return;
  }
  const pal = s.pal;
  c.save();
  c.translate(hand[0], hand[1]);
  c.rotate(Math.PI / 2 - pose.fa);
  switch (arm) {
    case 'fist':
      switch (s.age) {
        case 0:
          ellipse(c, 6, 0, 8, 7, 0.2, pal.main);
          details(c, 0, -6, 12, 12, s);
          break;
        case 1:
          bar(c, [0, 0], [9, 0], 3.2, pal.trim);
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            shape(c, [pt([13, 0], a - 0.35, 5.5), pt([13, 0], a, 9), pt([13, 0], a + 0.35, 5.5)], pal.mainD, 1);
          }
          dot(c, [13, 0], 6, pal.metal);
          break;
        case 2:
          bar(c, [0, 0], [11, 0], 3, pal.trim);
          rrect(c, 9, -8, 9, 16, 2, pal.main);
          rrect(c, 11.5, -8, 2.5, 16, 0.5, pal.mainD, 1);
          break;
        case 3:
          rrect(c, 0, -6.5, 15, 13, 3, pal.main);
          for (let i = 0; i < 3; i++) rrect(c, 12, -5.5 + i * 4, 5, 3.2, 1, pal.mainD, 1);
          poly(c, [[1, 4.5], [11, 4.5]], 1.4, C.steelB);
          break;
        default:
          rrect(c, 0, -6.5, 14, 13, 5, pal.main);
          glow(c, [14, 0], 7, s.team, 0.8);
          for (let i = 0; i < 3; i++) dot(c, [12, -4 + i * 4], 1.2, s.team);
      }
      break;
    case 'blade':
      switch (s.age) {
        case 0:
          shape(c, [[1, -2.5], [8, -4.5], [14, -3], [20, -4], [26, 0], [18, 2.5], [10, 2], [1, 2.5]], '#4a4d52', 1.2);
          dot(c, [9, -1], 0.8, '#8a9099');
          dot(c, [16, 0], 0.8, '#8a9099');
          break;
        case 1:
          bar(c, [1, -6], [1, 6], 2.2, pal.accent);
          shape(c, [[2, -2.6], [26, -1], [30, 0], [26, 1], [2, 2.6]], C.steel, 1.2);
          poly(c, [[4, 0], [24, 0]], 0.6, C.steelB);
          break;
        case 2:
          bar(c, [1, -5], [1, 5], 2, pal.main);
          c.beginPath();
          c.moveTo(2, -2.4);
          c.quadraticCurveTo(16, -4, 29, 3);
          c.quadraticCurveTo(16, 1.5, 2, 2.4);
          c.closePath();
          c.fillStyle = C.steel;
          c.fill();
          c.lineWidth = 1.2;
          c.strokeStyle = OUT;
          c.stroke();
          break;
        case 3: {
          // A chainsaw.
          rrect(c, -4, -6, 9, 12, 2, '#f28c2c');
          rrect(c, 4, -3.2, 25, 6.4, 3.2, C.steelB);
          c.fillStyle = OUT;
          const off = (pose.spin * 2) % 3;
          for (let x = 5 + off; x < 28; x += 3) {
            c.fillRect(x, -4.2, 1.4, 1.2);
            c.fillRect(x, 3, 1.4, 1.2);
          }
          break;
        }
        default:
          rrect(c, -1, -2.5, 6, 5, 1.5, pal.metal, 1);
          glow(c, [18, 0], 14, s.team, 0.55);
          shape(c, [[5, -2], [30, -0.8], [32, 0], [30, 0.8], [5, 2]], rgba(s.team, 0.95), 0.8);
          poly(c, [[6, 0], [29, 0]], 0.9, '#ffffff');
      }
      break;
    case 'launcher': {
      let muzzle: P2 = [22, 0];
      switch (s.age) {
        case 0:
          rrect(c, 0, -5, 20, 10, 4, pal.trim);
          poly(c, [[5, -5], [5, 5]], 1.2, C.khaki);
          poly(c, [[13, -5], [13, 5]], 1.2, C.khaki);
          if (pose.flash === 0 && !(s.anim === 'attack' && s.u >= 0.45 && s.u < 0.85)) dot(c, [20, 0], 4.5, C.stone);
          muzzle = [21, 0];
          break;
        case 1: {
          // A crossbow.
          bar(c, [0, 0], [18, 0], 3, pal.trim);
          const drawn = s.anim === 'attack' && s.u >= 0.45 && s.u < 0.8 ? 0 : 1;
          c.beginPath();
          c.moveTo(13, -11);
          c.quadraticCurveTo(17, 0, 13, 11);
          c.lineWidth = 3.5;
          c.strokeStyle = OUT;
          c.stroke();
          c.lineWidth = 2;
          c.strokeStyle = pal.trim;
          c.stroke();
          poly(c, [[13, -11], [13 - 6 * drawn, 0], [13, 11]], 0.5, '#efe6d2');
          if (drawn) poly(c, [[5, 0], [19, 0]], 1, pal.metal);
          muzzle = [18, 0];
          break;
        }
        case 2:
          // A bronze hand cannon.
          shape(c, [[0, -4], [20, -5.5], [22, -6], [22, 6], [20, 5.5], [0, 4]], pal.main);
          for (const x of [6, 14]) rrect(c, x, -5.2, 2.2, 10.4, 0.8, pal.mainD, 1);
          muzzle = [23, 0];
          break;
        case 3:
          // Twin autocannons over an ammo box.
          rrect(c, -2, -1, 10, 9, 1.5, pal.mainB);
          hazard(c, -1, 4, 8, 3);
          bar(c, [4, -3.5], [26, -3.5], 2.6, pal.metal);
          bar(c, [4, 1.2], [26, 1.2], 2.6, pal.metal);
          rrect(c, 2, -6, 8, 9, 2, pal.main);
          muzzle = [27, -1];
          break;
        default:
          rrect(c, 0, -5, 23, 10, 4.5, pal.main);
          for (let i = 0; i < 3; i++) dot(c, [6 + i * 5, 0], 1.3, pose.flash > 0 || s.anim === 'attack' ? s.team : pal.mainD);
          glow(c, [23, 0], 4 + pose.flash * 10, s.team, 0.4 + 0.6 * pose.flash);
          muzzle = [24, 0];
      }
      if (pose.flash > 0) {
        muzzleFlash(c, muzzle, Math.PI / 2, 5, pose.flash, s.age === 4 ? '#e0c8ff' : C.fireB);
      }
      if (s.anim === 'attack' && s.u > 0.45 && s.age >= 2 && s.age <= 3) smoke(c, [muzzle[0] + 3, muzzle[1]], 5, (s.u - 0.45) / 0.55);
      break;
    }
    case 'drill': {
      const spin = pose.spin;
      switch (s.age) {
        case 0:
          // A great bone horn on a log.
          bar(c, [-1, 0], [7, 0], 5, pal.trim);
          shape(c, [[6, -6], [26, 1], [6, 6]], C.bone);
          for (let i = 0; i < 3; i++) poly(c, [[10 + i * 4, -4 + i], [10 + i * 4, 4 - i]], 0.6, '#b8ad9a');
          break;
        case 1:
          // A battering ram head.
          bar(c, [-1, 0], [12, 0], 6, pal.trim);
          rrect(c, 10, -7, 12, 14, 3, pal.metal);
          shape(c, [[22, -5], [27, -2], [27, 2], [22, 5]], pal.metal);
          dot(c, [14, -4], 1, pal.accent);
          dot(c, [14, 4], 1, pal.accent);
          break;
        default: {
          // An auger or drill bit, spinning.
          const housing = s.age === 2 ? pal.main : pal.mainB;
          rrect(c, -3, -7, 11, 14, 3, housing);
          if (s.age === 3) hazard(c, -1, 4, 7, 3);
          const bitCol = s.age === 4 ? rgba(s.team, 0.9) : s.age === 2 ? pal.mainB : C.steel;
          shape(c, [[8, -6.5], [30, 0], [8, 6.5]], bitCol);
          c.strokeStyle = s.age === 4 ? '#ffffff' : OUT;
          c.lineWidth = 0.9;
          for (let i = 0; i < 5; i++) {
            const x = 9 + ((i * 4.5 + (spin * 2) % 4.5 + 4.5) % 22);
            const hw = 6.5 * (1 - (x - 8) / 22);
            c.beginPath();
            c.moveTo(x, -hw);
            c.lineTo(x + 2.5, hw);
            c.stroke();
          }
          if (s.age === 4) glow(c, [22, 0], 10, s.team, 0.6);
        }
      }
      break;
    }
  }
  c.restore();
}

function drawShield(c: Ctx, s: Pose, hand: P2, near: boolean): void {
  const pal = s.pal;
  const x = hand[0] + 3;
  const y = hand[1] - 4;
  c.save();
  if (!near) c.globalAlpha *= 0.9;
  switch (s.age) {
    case 0:
      dot(c, [x, y], 12, pal.trim);
      dot(c, [x, y], 7, '#b08452');
      for (let i = 0; i < 6; i++) dot(c, pt([x, y], (i * Math.PI) / 3, 10), 1.3, pal.main);
      dot(c, [x, y], 2.5, s.team);
      break;
    case 1:
      shape(c, [[x - 10, y - 13], [x + 10, y - 13], [x + 10, y + 1], [x, y + 14], [x - 10, y + 1]], s.team);
      poly(c, [[x, y - 11], [x, y + 11]], 2.4, pal.accent);
      poly(c, [[x - 8, y - 5], [x + 8, y - 5]], 2.4, pal.accent);
      break;
    case 2:
      dot(c, [x, y], 12, pal.main);
      c.strokeStyle = pal.mainD;
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.stroke();
      dot(c, [x, y], 3.5, pal.accent);
      dot(c, [x - 5, y - 4], 1.2, s.team);
      dot(c, [x + 5, y - 4], 1.2, s.team);
      break;
    case 3:
      rrect(c, x - 9, y - 15, 18, 30, 3, '#3a3f2a');
      rrect(c, x - 6, y - 10, 12, 4, 1, 'rgba(159,232,255,0.55)', 1);
      star(c, [x, y + 5], 3.6, s.team);
      break;
    default: {
      glow(c, [x, y], 17, s.team, 0.35);
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        c.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 15);
      }
      c.closePath();
      c.fillStyle = rgba(s.team, 0.28);
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = rgba(s.team, 0.95);
      c.stroke();
      rrect(c, hand[0] - 2, hand[1] - 3, 5, 6, 1.5, pal.mainB, 1);
    }
  }
  c.restore();
}

/* ---- The whole Mech ------------------------------------------------------------------------- */

/**
 * Draws one frame of a Mech. `u` is the phase through the animation, 0..1.
 * The canvas must already be translated to the feet and scaled to rig units.
 */
export function drawMechDesign(c: Ctx, look: MechLook, team: string, anim: RigAnim, u: number): void {
  const walking = anim === 'walk';
  const p = walking ? u * Math.PI * 2 : 0;
  const collapse = anim === 'die' ? ease(clamp01(u / 0.55)) : 0;
  const hipH = HIP[look.legs];
  const heavyStep = look.legs === 'stompers' ? 3 : look.legs === 'walker' ? 2 : 0.4;
  const bob = walking ? -Math.abs(Math.cos(p)) * heavyStep + heavyStep * 0.6 : 0;
  const lean = anim === 'attack' ? 0.08 * bump(u, 0.25, 0.7) : 0;
  const s: Pose = {
    age: look.age,
    pal: palette(look.age),
    team,
    anim,
    u,
    p,
    walking,
    collapse,
    hip: [0, -hipH + bob + collapse * hipH * 0.45],
    tilt: lean + collapse * 0.45,
  };
  if (anim === 'die' && u > 0.6) c.globalAlpha = Math.max(0, 1 - (u - 0.6) / 0.4);
  // Shadow.
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath();
  c.ellipse(0, 0, 28, 3.5, 0, 0, Math.PI * 2);
  c.fill();

  drawLegs(c, look.legs, s, false);
  // Upper body: rotates around the hip.
  const upper = (fn: () => void): void => {
    c.save();
    c.translate(s.hip[0], s.hip[1]);
    c.rotate(s.tilt);
    fn();
    c.restore();
  };
  upper(() => drawArm(c, look.right, s, false));
  upper(() => drawTorso(c, look.torso, s));
  upper(() => drawHead(c, look.head, s));
  drawLegs(c, look.legs, s, true);
  upper(() => drawArm(c, look.left, s, true));

  if (anim === 'die') {
    if (u < 0.55) glow(c, [4, -40], 14 + u * 30, C.fireB, 0.7 * (1 - u / 0.55));
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + u * 3;
      if (u < 0.7) dot(c, pt([4, -38], a, 6 + u * 22), 0.9, C.fireB);
    }
    smoke(c, [-2, -52], 9, clamp01(u * 1.1), '#555');
  }
  c.globalAlpha = 1;
}
