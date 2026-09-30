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
  markShot,
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
import type { ArmId, HeadId, LegsId, MechDesign, MechSlot, ModuleId, TorsoId } from '@config/mech.config';

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
const HIP: Readonly<Record<LegsId, number>> = { walker: 34, stompers: 34, treads: 24, striders: 40, hover: 36, spider: 30, jump: 36, crawler: 24 };

/**
 * Where each slot's part sits on a standing Mech, rig units from the feet,
 * and roughly how far it reaches (the hangar's hotspots on the model).
 */
export function mechSlotAnchors(legs: LegsId): Record<MechSlot, { at: P2; r: number }> {
  const h = HIP[legs];
  return {
    legs: { at: [0, -h / 2], r: Math.max(12, h / 2) },
    torso: { at: [-2, -h - 20], r: 15 },
    head: { at: [3, -h - 50], r: 10 },
    left: { at: [22, -h - 18], r: 10 },
    right: { at: [20, -h - 36], r: 10 },
    module: { at: [-20, -h - 30], r: 10 },
  };
}

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
  if (legs === 'hover') {
    if (!near) drawHover(c, s);
    return;
  }
  if (legs === 'crawler') {
    if (!near) drawCrawler(c, s);
    return;
  }
  if (legs === 'spider') {
    drawSpider(c, s, near);
    return;
  }
  if (legs === 'striders') {
    drawStrider(c, s, near);
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
  if (legs === 'jump') {
    // A coil spring down the shin and a piston: jump legs.
    const a0 = pt(knee, a - bend, 3);
    c.strokeStyle = s.age === 4 ? s.team : s.pal.accent;
    c.lineWidth = 1.3;
    c.beginPath();
    for (let i = 0; i <= 10; i++) {
      const q = pt(a0, a - bend, (i / 10) * (shin - 5));
      const side = (i % 2 ? 1 : -1) * 3.2;
      c.lineTo(q[0] + Math.cos(a - bend) * side, q[1] - Math.sin(a - bend) * side);
    }
    c.stroke();
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

/** Hover jets: a skirted pod under the hip, jets firing downward. */
function drawHover(c: Ctx, s: Pose): void {
  const pal = s.pal;
  const bob = Math.sin(s.u * Math.PI * 2) * 1.2;
  const y = s.hip[1] + 2 + bob + s.collapse * 20;
  c.save();
  // Jet flames, flickering.
  const flame = s.pal.fire ?? s.team;
  const flick = 0.7 + 0.3 * Math.sin(s.u * Math.PI * 16);
  for (const x of [-10, 10]) {
    if (s.collapse < 0.5) {
      glow(c, [x, y + 20], 9 * flick, flame, 0.6);
      shape(c, [[x - 4, y + 13], [x, y + 13 + 14 * flick], [x + 4, y + 13]], rgba(C.fireB, 0.9), 0);
    }
    rrect(c, x - 5, y + 6, 10, 8, 2, pal.metal);
  }
  // The pod.
  shape(c, [[-18, y - 3], [18, y - 3], [14, y + 9], [-14, y + 9]], pal.mainB);
  plate(c, -13, y - 5, 26, 9, 4, pal.main, s);
  if (s.age === 0) {
    // A floating boulder with a glowing rune.
    dot(c, [0, y + 2], 3, rgba(C.fireB, 0.8));
  } else if (s.age === 3) hazard(c, -12, y + 5, 24, 3);
  else if (s.age === 4) poly(c, [[-12, y + 5], [12, y + 5]], 1.2, s.team);
  // Shadow on the ground, smaller the higher it floats.
  c.restore();
}

/** Cargo crawler: a low six-wheeled flatbed with a crate lashed on the back. */
function drawCrawler(c: Ctx, s: Pose): void {
  const pal = s.pal;
  const spin = s.walking ? -s.u * Math.PI * 4 : 0;
  const drop = s.collapse * 2;
  c.save();
  c.translate(0, drop);
  // The crate at the back.
  rrect(c, -28, -26, 14, 12, 1.5, s.age === 0 ? C.wood : s.age === 4 ? pal.mainB : shade(pal.trim, 1.1));
  poly(c, [[-28, -20], [-14, -20]], 1, OUT);
  // Flatbed.
  plate(c, -30, -15, 58, 7, 2, pal.mainB, s);
  if (s.age === 3) hazard(c, -26, -10, 50, 2.5);
  if (s.age === 4) poly(c, [[-26, -9], [24, -9]], 1.2, s.team);
  // Pelvis mount.
  rrect(c, s.hip[0] - 9, s.hip[1] - 1, 18, 10, 3, pal.main);
  // Six wheels.
  for (let i = 0; i < 6; i++) {
    const w: P2 = [-25 + i * 10, -4.5];
    dot(c, w, 4.5, s.age === 0 ? pal.mainD : C.black);
    dot(c, w, 2.2, s.age === 0 ? C.wood : pal.metal);
    poly(c, [pt(w, spin + i, 2), pt(w, spin + i + Math.PI, 2)], 0.8, OUT);
  }
  c.restore();
}

/** Spider legs: two legs per side, bent high like an insect's. */
function drawSpider(c: Ctx, s: Pose, near: boolean): void {
  const pal = s.pal;
  const col = near ? pal.main : pal.mainB;
  const colB = near ? pal.mainB : pal.mainD;
  for (const [i, reachX] of [[0, 20], [1, -18]] as const) {
    const phase = s.walking ? Math.sin(s.p + i * Math.PI + (near ? 0 : Math.PI / 2)) : 0;
    const lift = s.walking ? Math.max(0, Math.cos(s.p + i * Math.PI + (near ? 0 : Math.PI / 2))) * 4 : 0;
    const hip: P2 = [s.hip[0] + (reachX > 0 ? 6 : -6), s.hip[1] + 2];
    const foot: P2 = [reachX + phase * 5 + (near ? 2 : -2), -lift + s.collapse * -4];
    const knee: P2 = [(hip[0] + foot[0]) / 2 + (reachX > 0 ? 8 : -8), hip[1] - 12 + s.collapse * 14];
    poly(c, [hip, knee], 5.5, s.age === 0 ? (near ? pal.trim : shade(pal.trim, 0.8)) : col);
    poly(c, [knee, foot], 4, colB);
    dot(c, knee, 2.6, pal.metal);
    if (s.age === 4) poly(c, [pt(knee, Math.atan2(foot[0] - knee[0], foot[1] - knee[1]), 2), pt(knee, Math.atan2(foot[0] - knee[0], foot[1] - knee[1]), 10)], 1, s.team);
    shape(c, [[foot[0] - 2, foot[1]], [foot[0], foot[1] - 4], [foot[0] + 2, foot[1]]], pal.metal, 1);
  }
  if (!near) plate(c, s.hip[0] - 12, s.hip[1] - 2, 24, 8, 3, pal.mainB, s);
}

/** Long bird-like legs: thigh forward, shin back, a long foot and toes. */
function drawStrider(c: Ctx, s: Pose, near: boolean): void {
  const side = near ? 1 : -1;
  const sw = s.walking ? Math.sin(s.p) * side : 0;
  const lift = s.walking ? Math.max(0, Math.cos(s.p) * side) : 0;
  let a = 0.55 + sw * 0.5;
  let bend = 1.45 + lift * 0.5;
  if (s.collapse > 0) {
    a += s.collapse * (near ? 1.0 : 0.6);
    bend += s.collapse * 0.9;
  }
  const hip: P2 = [s.hip[0] + (near ? 3 : -3), s.hip[1]];
  const knee = pt(hip, a, 15);
  const hock = pt(knee, a - bend, 16);
  const foot = pt(hock, a - bend + 1.05 + lift * 0.4, 12);
  const col = near ? s.pal.main : s.pal.mainB;
  const colB = near ? s.pal.mainB : s.pal.mainD;
  poly(c, [hip, knee], 7.5, s.age === 0 ? (near ? s.pal.trim : shade(s.pal.trim, 0.8)) : col);
  poly(c, [knee, hock], 5.5, colB);
  poly(c, [hock, foot], 4, s.age === 0 ? C.bone : s.pal.metal);
  if (s.age === 2) {
    // A brass piston along the shin.
    poly(c, [pt(knee, a - bend, 3), pt(knee, a - bend, 12)], 1.6, s.pal.trim);
  }
  if (s.age === 4) poly(c, [pt(knee, a - bend, 3), pt(knee, a - bend, 13)], 1.1, s.team);
  if (s.age === 3 && near) {
    const m = pt(knee, a - bend, 8);
    hazard(c, m[0] - 2.5, m[1] - 1.5, 5, 3);
  }
  dot(c, knee, 3.4, s.pal.metal);
  dot(c, hock, 2.4, s.pal.metal);
  // Toes: two forward, one back.
  const toe = near ? s.pal.mainD : shade(s.pal.mainD, 0.85);
  poly(c, [foot, [foot[0] + 7, foot[1] + 0.5]], 2.6, toe);
  poly(c, [foot, [foot[0] + 5, foot[1] - 1.5]], 2.2, toe);
  poly(c, [foot, [foot[0] - 4, foot[1] + 0.3]], 2.2, toe);
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
    case 'armory': {
      // A gun torso: a magazine on the back feeding a belt to the shoulder.
      const feed = s.anim === 'attack' ? s.u * 3 : s.walking ? s.u : 0;
      plate(c, -15, -40, 30, 38, 7, pal.main, s);
      rrect(c, -11, -34, 20, 11, 3, pal.mainB, 1.2);
      drawMagazine(c, [-15, -20], s);
      // The belt: rounds from the magazine up to the gun shoulder.
      const beltCol = s.age === 4 ? s.team : s.age <= 1 ? pal.trim : '#d8b04a';
      for (let i = 0; i < 6; i++) {
        const k = ((i + feed) % 6) / 6;
        const p: P2 = [lerp(-8, 8, k), lerp(-16, -32, k)];
        rrect(c, p[0] - 1.6, p[1] - 1.3, 3.2, 2.6, 0.8, beltCol, 0.8);
      }
      emblem(c, [4, -12], 3, s);
      if (s.age === 3) hazard(c, -12, -8, 24, 4);
      return;
    }
    case 'bay': {
      // A drone hangar: a box with a roof hatch and a drone waiting on it.
      plate(c, -16, -38, 32, 36, 6, pal.main, s);
      rrect(c, -13, -44, 22, 7, 2, pal.mainB, 1.2);
      const open = s.anim === 'attack' ? bump(s.u, 0.2, 0.8) : 0;
      poly(c, [[-13, -44], [-13 - open * 6, -50 - open * 2]], 2, pal.metal);
      drawDrone(c, [-2, -50 - open * 6], s, 0.8);
      rrect(c, -10, -30, 20, 16, 3, pal.mainD, 1.2);
      for (let i = 0; i < 3; i++) poly(c, [[-8, -26 + i * 5], [8, -26 + i * 5]], 1, pal.mainB);
      emblem(c, [9, -9], 3, s);
      if (s.age === 3) hazard(c, -13, -8, 18, 4);
      return;
    }
    case 'overcharge': {
      // A cracked core that burns too hot.
      const pulse = 0.5 + 0.5 * Math.sin(s.u * Math.PI * 8);
      plate(c, -16, -40, 32, 38, 8, pal.mainD, s);
      glow(c, [0, -22], 16 + pulse * 5, s.pal.fire ?? s.team, 0.5 + 0.35 * pulse);
      dot(c, [0, -22], 9, pal.metal);
      dot(c, [0, -22], 6.5, s.age <= 2 ? C.fire : s.team);
      dot(c, [0, -22], 3, '#ffffff');
      c.strokeStyle = rgba('#fff3c8', 0.9);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-6, -30);
      c.lineTo(-2, -25);
      c.lineTo(-7, -20);
      c.moveTo(6, -14);
      c.lineTo(3, -19);
      c.stroke();
      // Heat vents with a lick of flame.
      for (const x of [-12, 12]) {
        rrect(c, x - 2.5, -44, 5, 6, 1, pal.metal, 1);
        shape(c, [[x - 2, -44], [x, -49 - pulse * 3], [x + 2, -44]], C.fireB, 0);
      }
      return;
    }
    case 'workshop': {
      // A walking workbench: tool rack, an anvil or lathe, a work lamp.
      plate(c, -16, -40, 32, 38, 5, pal.main, s);
      rrect(c, -13, -35, 26, 10, 2, s.age === 0 ? C.wood : pal.mainD, 1.2);
      // Tools hung on the rack.
      poly(c, [[-9, -34], [-9, -27]], 1.4, pal.metal);
      shape(c, [[-11, -28], [-7, -28], [-9, -25]], pal.metal, 0.8);
      poly(c, [[-2, -34], [-2, -27]], 1.4, s.age === 0 ? C.bone : C.steel);
      dot(c, [5, -30], 2.6, pal.metal);
      poly(c, [[5, -30], [9, -27]], 1.2, pal.metal);
      // An anvil (early) or a spinning gear lathe (later).
      if (s.age <= 1) {
        shape(c, [[-10, -20], [8, -20], [11, -17], [4, -17], [4, -12], [-5, -12], [-5, -17], [-10, -17]], s.age === 0 ? C.stone : C.iron);
      } else {
        gear(c, [0, -16], 5.5, s.u * Math.PI * 4, pal.metal);
        if (s.age >= 3) glow(c, [0, -16], 6, s.team, 0.3);
      }
      emblem(c, [11, -8], 2.6, s);
      return;
    }
    case 'carrier': {
      // A wide troop box: a side door and three helmets in the window.
      plate(c, -19, -40, 38, 38, 6, pal.main, s);
      rrect(c, -15, -34, 28, 11, 3, '#1c2430', 1.2);
      const helmet = s.age === 0 ? C.hair : s.age === 1 ? C.steel : s.age === 2 ? pal.metal : s.age === 3 ? C.olive : C.white;
      for (let i = 0; i < 3; i++) {
        const bob = s.walking ? Math.sin(s.p + i) * 0.8 : 0;
        dot(c, [-9 + i * 9, -27 + bob], 3.2, C.skin);
        shape(c, [[-12.5 + i * 9, -28 + bob], [-9 + i * 9, -32 + bob], [-5.5 + i * 9, -28 + bob]], helmet, 1);
      }
      rrect(c, -8, -20, 16, 16, 2, pal.mainB, 1.3);
      poly(c, [[0, -20], [0, -4]], 1, pal.mainD);
      emblem(c, [13, -12], 3, s);
      if (s.age === 3) hazard(c, -17, -6, 12, 3);
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

/** A small drone (the Hangar bay's): stone bird, kite, brass beetle, quadcopter, glowing orb. */
export function drawDrone(c: Ctx, p: P2, s: Pose | { age: number; team: string; pal?: undefined }, k = 1): void {
  const age = s.age;
  const team = s.team;
  c.save();
  c.translate(p[0], p[1]);
  c.scale(k, k);
  switch (age) {
    case 0:
      shape(c, [[-6, 0], [0, -2], [6, 0], [0, 2]], '#8d8a85', 1);
      shape(c, [[-2, -1], [-5, -6], [2, -1]], '#6d6a66', 1);
      break;
    case 1:
      shape(c, [[-6, 0], [0, -5], [6, 0], [0, 4]], team, 1);
      poly(c, [[0, 4], [-2, 8]], 0.8, '#efe6d2');
      break;
    case 2:
      ellipse(c, 0, 0, 6, 3.5, 0, '#c9a04a', 1);
      poly(c, [[-5, -3], [5, -3]], 1, '#5a4a32');
      break;
    case 3:
      rrect(c, -4, -2, 8, 4, 1, '#6b7440', 1);
      poly(c, [[-7, -3], [7, -3]], 1.2, '#2a2622');
      dot(c, [0, 1], 1, '#ff5a3a');
      break;
    default:
      glow(c, [0, 0], 7, team, 0.6);
      dot(c, [0, 0], 3.5, '#eef2f5');
      dot(c, [0, 0], 1.6, team);
  }
  c.restore();
}

/** The Special module, on the Mech's back (behind the torso). */
function drawModule(c: Ctx, module: ModuleId, s: Pose): void {
  if (module === 'none') return;
  const pal = s.pal;
  const pulse = 0.5 + 0.5 * Math.sin(s.u * Math.PI * 4);
  const at: P2 = [-18, -30];
  // The mount.
  rrect(c, at[0] - 3, at[1] - 6, 8, 16, 2, pal.mainD, 1.2);
  switch (module) {
    case 'smoke':
      for (let i = 0; i < 3; i++) {
        rrect(c, at[0] - 6 + i * 4, at[1] - 16, 3.6, 12, 1.2, i === 1 ? pal.accent : pal.metal, 1);
        dot(c, [at[0] - 4.2 + i * 4, at[1] - 16], 1.3, OUT);
      }
      break;
    case 'overdrive':
      rrect(c, at[0] - 6, at[1] - 10, 10, 14, 3, pal.main);
      gear(c, [at[0] - 1, at[1] - 3], 3.5, s.u * Math.PI * 4, pal.metal);
      poly(c, [[at[0] - 4, at[1] - 10], [at[0] - 4, at[1] - 18]], 2.4, pal.trim);
      if (s.age >= 2) smoke(c, [at[0] - 4, at[1] - 20], 4, s.u);
      break;
    case 'leap':
      for (const dx of [-5, 1]) {
        rrect(c, at[0] + dx, at[1] - 12, 5, 18, 2, pal.main, 1.2);
        shape(c, [[at[0] + dx, at[1] + 6], [at[0] + dx + 2.5, at[1] + 10], [at[0] + dx + 5, at[1] + 6]], pal.metal, 1);
      }
      break;
    case 'overload':
      rrect(c, at[0] - 6, at[1] - 14, 11, 18, 3, pal.mainB);
      for (let i = 0; i < 3; i++) poly(c, [[at[0] - 6, at[1] - 10 + i * 5], [at[0] + 5, at[1] - 10 + i * 5]], 1.4, pal.metal);
      glow(c, [at[0], at[1] - 18], 5 + pulse * 3, s.pal.fire ?? s.team, 0.7);
      poly(c, [[at[0] - 3, at[1] - 14], [at[0] - 1, at[1] - 18], [at[0] + 1, at[1] - 16], [at[0] + 3, at[1] - 20]], 0.9, '#fff3c8');
      break;
    case 'dome':
      poly(c, [[at[0], at[1] - 6], [at[0], at[1] - 16]], 1.6, pal.metal);
      c.beginPath();
      c.arc(at[0], at[1] - 16, 6, Math.PI, 0);
      c.closePath();
      c.fillStyle = rgba(s.age >= 3 ? s.team : C.glass, 0.55);
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      break;
    case 'emp':
      poly(c, [[at[0], at[1] - 6], [at[0], at[1] - 14]], 1.4, pal.metal);
      c.strokeStyle = s.age >= 3 ? s.team : pal.accent;
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(at[0], at[1] - 17, 7, 2.6, 0, 0, Math.PI * 2);
      c.stroke();
      glow(c, [at[0], at[1] - 17], 6, s.team, 0.3 + 0.4 * pulse);
      break;
    case 'rush':
      // A pennant and a stopwatch: rush order.
      poly(c, [[at[0] - 2, at[1] - 6], [at[0] - 2, at[1] - 24]], 1.2, s.age === 0 ? C.wood : pal.metal);
      shape(c, [[at[0] - 2, at[1] - 24], [at[0] + 7, at[1] - 21], [at[0] - 2, at[1] - 18]], '#f2c744', 1);
      dot(c, [at[0] + 1, at[1] - 10], 3.6, pal.accent);
      poly(c, [[at[0] + 1, at[1] - 10], [at[0] + 1 + Math.sin(s.u * Math.PI * 2) * 2.4, at[1] - 10 - Math.cos(s.u * Math.PI * 2) * 2.4]], 0.8, OUT);
      break;
    case 'orbital':
      poly(c, [[at[0] + 1, at[1] - 6], [at[0] - 2, at[1] - 30]], 1.2, pal.metal);
      poly(c, [[at[0] - 5, at[1] - 22], [at[0] + 2, at[1] - 22]], 1, pal.metal);
      dot(c, [at[0] - 2, at[1] - 31], 1.8, pulse > 0.5 ? '#ff5a3a' : '#7a2a2a');
      glow(c, [at[0] - 2, at[1] - 31], 5, '#ff5a3a', 0.5 * pulse);
      break;
  }
}

/** The Armory's magazine per age: a basket of stones, a bolt rack, powder kegs, an ammo drum, a power cell. */
function drawMagazine(c: Ctx, p: P2, s: Pose): void {
  const pal = s.pal;
  switch (s.age) {
    case 0:
      ellipse(c, p[0], p[1], 9, 11, 0, '#b08452');
      c.strokeStyle = rgba(OUT, 0.6);
      c.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(p[0] - 8, p[1] + i * 4);
        c.lineTo(p[0] + 8, p[1] + i * 4);
        c.stroke();
      }
      for (let i = 0; i < 3; i++) dot(c, [p[0] - 4 + i * 4, p[1] - 10], 2.4, C.stone);
      return;
    case 1:
      rrect(c, p[0] - 7, p[1] - 12, 11, 24, 2, pal.trim);
      for (let i = 0; i < 4; i++) {
        poly(c, [[p[0] - 5 + i * 2.6, p[1] - 16], [p[0] - 5 + i * 2.6, p[1] + 8]], 1, pal.metal);
        shape(c, [[p[0] - 6.2 + i * 2.6, p[1] - 16], [p[0] - 5 + i * 2.6, p[1] - 19], [p[0] - 3.8 + i * 2.6, p[1] - 16]], pal.accent, 0.6);
      }
      return;
    case 2:
      for (let i = 0; i < 2; i++) {
        rrect(c, p[0] - 7, p[1] - 12 + i * 12, 12, 11, 4, pal.trim);
        poly(c, [[p[0] - 7, p[1] - 9 + i * 12], [p[0] + 5, p[1] - 9 + i * 12]], 1.2, pal.mainD);
        poly(c, [[p[0] - 7, p[1] - 4 + i * 12], [p[0] + 5, p[1] - 4 + i * 12]], 1.2, pal.mainD);
      }
      return;
    case 3:
      dot(c, p, 10, pal.mainB);
      dot(c, p, 6.5, pal.metal);
      hazard(c, p[0] - 6, p[1] + 5, 12, 3);
      star(c, p, 3, s.team);
      return;
    default: {
      rrect(c, p[0] - 6, p[1] - 13, 12, 26, 4, pal.mainB);
      const charge = 0.5 + 0.5 * Math.sin(s.u * Math.PI * 4);
      for (let i = 0; i < 4; i++) rrect(c, p[0] - 3.5, p[1] - 10 + i * 6, 7, 3.5, 1, rgba(s.team, i < 1 + charge * 3 ? 0.95 : 0.25), 0.6);
      glow(c, p, 12, s.team, 0.3 + 0.2 * charge);
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
    case 'siren':
      drawSiren(c, s);
      break;
    case 'beacon':
      drawBeacon(c, s);
      break;
    case 'scope':
      // A long scope on the side of the head.
      rrect(c, -3, -16, 16, 4, 1.5, pal.metal, 1.1);
      ellipse(c, 13, -14, 1.6, 2.6, 0, s.age >= 3 ? '#ff5a3a' : C.glass, 1);
      glow(c, [14, -14], 4, s.age >= 3 ? '#ff5a3a' : C.glass, 0.5);
      break;
    case 'taunt': {
      // A red flag or beacon that dares enemies to come.
      const wave = Math.sin(s.u * Math.PI * 2) * 1.4;
      poly(c, [[-4, -14], [-5, -30]], 1.1, s.age === 0 ? C.wood : C.iron);
      shape(c, [[-5, -30], [7 + wave, -27], [-5, -23]], '#d9483d', 1);
      if (s.age >= 3) glow(c, [-5, -30], 5, '#ff5a3a', 0.6 + 0.3 * Math.sin(s.u * Math.PI * 8));
      break;
    }
    case 'foreman': {
      // A hard hat for the age (fur cap, iron cap, brass dome, a yellow hard hat, a light visor) and a work lamp.
      const hat = s.age === 0 ? '#8a5a2b' : s.age === 1 ? C.steelB : s.age === 2 ? pal.main : s.age === 3 ? '#f2c744' : pal.mainB;
      c.beginPath();
      c.arc(1, -14, 8.5, Math.PI, 0);
      c.closePath();
      c.fillStyle = hat;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      poly(c, [[-9, -14], [11, -14]], 1.8, shade(hat, 0.8));
      const lamp = s.age >= 3 ? '#fff6c8' : C.fireB;
      dot(c, [8, -18], 2, lamp);
      glow(c, [10, -18], 6, lamp, 0.55);
      break;
    }
    case 'salvage': {
      // A turning scanner dish with a magnet hook.
      const turn = Math.sin(s.u * Math.PI * 2);
      poly(c, [[-2, -14], [-2, -19]], 1.3, pal.metal);
      ellipse(c, -2, -22, 6 * (0.6 + 0.4 * Math.abs(turn)), 3, 0, pal.mainB, 1.1);
      dot(c, [-2 + turn * 2, -22], 1.2, s.age >= 3 ? s.team : pal.accent);
      shape(c, [[5, -15], [9, -15], [9, -12], [7, -12], [7, -13.5], [5, -13.5]], '#c0392b', 0.8);
      break;
    }
  }
  c.restore();
}

/** War siren: a horn, a bell, a brass horn, a loudspeaker or an emitter dish, with sound rings. */
function drawSiren(c: Ctx, s: Pose): void {
  const pal = s.pal;
  // Rings travel out every half cycle.
  const ring = (at: P2, col: string): void => {
    for (let i = 0; i < 2; i++) {
      const k = (s.u * 2 + i * 0.5) % 1;
      c.strokeStyle = rgba(col, 0.7 * (1 - k));
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(at[0], at[1], 3 + k * 9, -0.9, 0.9);
      c.stroke();
    }
  };
  switch (s.age) {
    case 0: {
      // A curled war horn.
      c.beginPath();
      c.moveTo(-6, -14);
      c.quadraticCurveTo(-10, -26, 2, -26);
      c.lineTo(9, -30);
      c.lineTo(9, -21);
      c.quadraticCurveTo(1, -21, -2, -14);
      c.closePath();
      c.fillStyle = C.bone;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      poly(c, [[-3, -22], [-1, -19]], 0.8, '#b8ad9a');
      ring([11, -25.5], '#fff3c8');
      return;
    }
    case 1:
      // A bell in a small frame.
      poly(c, [[-6, -14], [-6, -27], [6, -27], [6, -14]], 1.6, pal.trim);
      shape(c, [[-3.5, -25], [3.5, -25], [5, -17], [-5, -17]], C.gold);
      dot(c, [0, -16.5], 1.4, pal.metal);
      ring([7, -21], '#fff3c8');
      return;
    case 2:
      // A brass horn.
      poly(c, [[-2, -14], [-2, -20]], 1.4, pal.metal);
      shape(c, [[-2, -22], [7, -25], [11, -29], [11, -15], [7, -19], [-2, -20]], pal.main);
      ellipse(c, 11, -22, 1.8, 7, 0, pal.mainD, 1);
      ring([13, -22], '#fff3c8');
      return;
    case 3:
      // A loudspeaker on a post.
      poly(c, [[-3, -14], [-3, -21]], 1.4, C.iron);
      shape(c, [[-5, -24], [-1, -24], [9, -29], [9, -15], [-1, -20], [-5, -20]], '#8a8f7a');
      ellipse(c, 9, -22, 1.6, 7, 0, '#2a2622', 1);
      ring([11, -22], '#fff3c8');
      return;
    default:
      // An emitter dish.
      poly(c, [[-2, -14], [-2, -19]], 1.4, pal.metal);
      c.beginPath();
      c.arc(2, -22, 7, -1.9, 1.9);
      c.fillStyle = pal.mainB;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      glow(c, [6, -22], 6, s.team, 0.7);
      ring([8, -22], s.team);
  }
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
  const gun = arm === 'launcher' || arm === 'minigun' || arm === 'railgun' || arm === 'flamer' || arm === 'tesla' || arm === 'grapple';
  if (gun) {
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
    if (arm === 'fist' || arm === 'blade' || arm === 'wrecker') {
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
    } else if (arm === 'minigun') {
      pose.spin = u * Math.PI * 12;
      pose.flash = Math.sin(u * Math.PI * 12) > 0.3 ? 0.8 : 0;
      pose.back = Math.sin(u * Math.PI * 24) * 0.6;
    } else if (arm === 'railgun') {
      const recoil = u >= 0.45 ? Math.max(0, 1 - (u - 0.45) / 0.4) : 0;
      pose.back = recoil * 5;
      pose.flash = u < 0.45 ? u / 0.45 : 0;
      pose.ua -= recoil * 0.2;
    } else if (arm === 'flamer' || arm === 'tesla') {
      pose.flash = bump(u, 0.3, 1);
    } else if (arm === 'grapple') {
      pose.flash = bump(u, 0.25, 0.95);
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
      markShot(c, muzzle, near ? 'near' : 'far');
      if (s.anim === 'attack' && s.u > 0.45 && s.age >= 2 && s.age <= 3) smoke(c, [muzzle[0] + 3, muzzle[1]], 5, (s.u - 0.45) / 0.55);
      break;
    }
    case 'flamer': {
      // A fuel tank under a nozzle; a jet of fire on the attack.
      rrect(c, -2, 1, 12, 7, 3, s.age === 3 ? '#b03a2a' : pal.trim);
      bar(c, [2, -1.5], [20, -1.5], 3.4, s.age === 0 ? C.wood : pal.metal);
      rrect(c, 18, -4.5, 5, 6, 1.5, pal.mainD, 1);
      if (s.age === 0) dot(c, [22, -1.5], 2.2, C.fire);
      else glow(c, [23, -1.5], 2.5, C.fire, 0.8);
      if (pose.flash > 0) {
        const len = 14 + 26 * pose.flash;
        glow(c, [23 + len * 0.6, -1.5], len * 0.5, C.fire, 0.55 * pose.flash);
        shape(c, [[23, -3], [23 + len, -8 * pose.flash], [23 + len * 1.1, -1.5], [23 + len, 5 * pose.flash], [23, 0]], rgba(C.fire, 0.9), 0);
        shape(c, [[23, -2.2], [23 + len * 0.7, -3], [23 + len * 0.75, -1.5], [23 + len * 0.7, 0.5], [23, -0.8]], rgba(C.fireB, 0.95), 0);
      }
      markShot(c, [24, -1.5], near ? 'near' : 'far');
      break;
    }
    case 'minigun': {
      rrect(c, -2, -4, 9, 9, 2, pal.mainB);
      if (s.age === 3) hazard(c, -1, 2, 7, 2.5);
      const barrels = 3;
      for (let i = 0; i < barrels; i++) {
        const off = Math.sin(pose.spin + (i * Math.PI * 2) / barrels) * 2.4;
        bar(c, [7, off], [24, off], 1.8, s.age === 4 ? pal.mainB : s.age === 0 ? C.wood : pal.metal);
      }
      rrect(c, 7, -3.5, 3, 7, 1, pal.main, 1);
      rrect(c, 20, -3.5, 2.5, 7, 1, pal.main, 1);
      if (pose.flash > 0) muzzleFlash(c, [25, 0], Math.PI / 2, 4, pose.flash, s.age === 4 ? '#e0c8ff' : C.fireB);
      markShot(c, [25, 0], near ? 'near' : 'far');
      break;
    }
    case 'tesla': {
      // A coil with rings; lightning crackles from the tip on the attack.
      bar(c, [0, 0], [10, 0], 3.5, pal.mainB);
      for (let i = 0; i < 4; i++) ellipse(c, 11 + i * 3, 0, 1.6, 5.5 - i * 0.6, 0, s.age <= 1 ? '#b87a3a' : s.age === 2 ? pal.accent : C.steelB, 0.9);
      const tip: P2 = [24, 0];
      dot(c, tip, 3.2, pal.metal);
      const arc = s.age >= 3 ? s.team : '#9fe8ff';
      glow(c, tip, 4 + pose.flash * 12, arc, 0.35 + 0.55 * pose.flash);
      if (pose.flash > 0.2) {
        c.strokeStyle = rgba('#ffffff', 0.9);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(tip[0], tip[1]);
        for (let i = 1; i <= 5; i++) c.lineTo(tip[0] + i * 5, tip[1] + Math.sin(s.u * 50 + i * 2) * 3);
        c.stroke();
      }
      markShot(c, tip, near ? 'near' : 'far');
      break;
    }
    case 'railgun': {
      // Two long rails that glow as they charge.
      rrect(c, -3, -4, 10, 8, 2, pal.mainB);
      const railCol = s.age === 0 ? C.wood : s.age === 4 ? pal.main : pal.metal;
      bar(c, [5, -2.5], [32, -2.5], 1.8, railCol);
      bar(c, [5, 2.5], [32, 2.5], 1.8, railCol);
      for (let x = 9; x < 30; x += 6) rrect(c, x, -3.5, 2, 7, 0.6, pal.mainD, 0.8);
      const charge = s.age >= 3 ? s.team : C.fireB;
      if (pose.flash > 0) {
        c.strokeStyle = rgba(charge, 0.9 * pose.flash);
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(5, 0);
        c.lineTo(5 + 27 * pose.flash, 0);
        c.stroke();
        glow(c, [5 + 27 * pose.flash, 0], 5, charge, 0.8 * pose.flash);
      }
      markShot(c, [33, 0], near ? 'near' : 'far');
      break;
    }
    case 'grapple': {
      // A launcher with a claw on a cable; the claw flies out on the attack.
      rrect(c, -2, -4, 12, 8, 3, pal.mainB);
      const out = pose.flash * 26;
      if (out > 0) {
        c.strokeStyle = OUT;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(10, 0);
        c.lineTo(12 + out, 0);
        c.stroke();
      }
      const claw: P2 = [12 + out, 0];
      poly(c, [[claw[0], claw[1]], [claw[0] + 5, claw[1] - 4], [claw[0] + 8, claw[1] - 1]], 1.6, pal.metal);
      poly(c, [[claw[0], claw[1]], [claw[0] + 5, claw[1] + 4], [claw[0] + 8, claw[1] + 1]], 1.6, pal.metal);
      dot(c, claw, 2, pal.accent);
      break;
    }
    case 'wrench': {
      // A big wrench (a bone club with a hook in the Stone age); it knocks on the attack.
      const tap = s.anim === 'attack' ? Math.sin(s.u * Math.PI * 4) * 0.35 : 0;
      c.rotate(tap);
      bar(c, [0, 0], [18, 0], 3.2, s.age === 0 ? C.bone : C.steel);
      shape(c, [[16, -5], [24, -6], [26, -2], [21, -1], [21, 1], [26, 2], [24, 6], [16, 5]], s.age === 0 ? C.bone : C.steelB, 1.1);
      if (s.age === 3) rrect(c, 3, -2, 7, 4, 1, '#c0392b', 0.8);
      if (s.age === 4) glow(c, [22, 0], 6, s.team, 0.5);
      break;
    }
    case 'crane': {
      // A small crane jib with a cable and a hook that swings.
      bar(c, [0, 0], [22, 0], 3, s.age === 0 ? C.wood : pal.metal);
      for (let x = 4; x < 20; x += 5) poly(c, [[x, -1.5], [x + 2.5, 1.5]], 0.8, OUT);
      const swing = Math.sin((s.anim === 'attack' ? s.u * 4 : s.u * 2) * Math.PI) * 0.25;
      c.save();
      c.translate(22, 0);
      c.rotate(-(Math.PI / 2 - pose.fa) + swing);
      poly(c, [[0, 0], [0, 12]], 0.9, OUT);
      c.beginPath();
      c.arc(0, 14, 2.6, -Math.PI / 2, Math.PI * 0.9);
      c.lineWidth = 1.6;
      c.strokeStyle = s.age === 0 ? C.bone : C.steelB;
      c.stroke();
      c.restore();
      break;
    }
    case 'wrecker': {
      // A short haft with a chain and a heavy ball.
      bar(c, [0, 0], [7, 0], 3, pal.trim);
      const swing = s.anim === 'attack' ? Math.sin(s.u * Math.PI * 2) * 0.8 : s.walking ? Math.sin(s.p) * 0.3 : 0;
      const ball = pt([8, 0], Math.PI / 2 - 0.5 + swing, 13);
      c.strokeStyle = s.age === 0 ? C.khaki : pal.metal;
      c.lineWidth = 1.4;
      c.setLineDash([1.6, 1]);
      c.beginPath();
      c.moveTo(8, 0);
      c.lineTo(ball[0], ball[1]);
      c.stroke();
      c.setLineDash([]);
      dot(c, ball, 7, s.age === 0 ? C.stone : s.age === 4 ? pal.mainB : pal.metal);
      if (s.age >= 1) for (let i = 0; i < 6; i++) dot(c, pt(ball, (i * Math.PI) / 3, 7), 1.2, pal.mainD);
      if (s.age === 4) glow(c, ball, 8, s.team, 0.4);
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
 * `parts` limits it to some slots (the scaffold at the base shows the Mech
 * being put together; the hangar highlights a slot).
 */
export function drawMechDesign(c: Ctx, look: MechLook, team: string, anim: RigAnim, u: number, parts?: ReadonlySet<MechSlot>): void {
  const has = (slot: MechSlot): boolean => !parts || parts.has(slot);
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
  if (has('legs')) {
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath();
    c.ellipse(0, 0, 28, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    drawLegs(c, look.legs, s, false);
  }
  // Upper body: rotates around the hip.
  const upper = (fn: () => void): void => {
    c.save();
    c.translate(s.hip[0], s.hip[1]);
    c.rotate(s.tilt);
    fn();
    c.restore();
  };
  if (has('module')) upper(() => drawModule(c, look.module, s));
  if (has('right')) upper(() => drawArm(c, look.right, s, false));
  if (has('torso')) upper(() => drawTorso(c, look.torso, s));
  if (has('head')) upper(() => drawHead(c, look.head, s));
  if (has('legs')) drawLegs(c, look.legs, s, true);
  if (has('left')) upper(() => drawArm(c, look.left, s, true));

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
