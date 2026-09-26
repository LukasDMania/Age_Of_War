/**
 * Machines of the rig art: the Castle catapult (with its crew), the Modern
 * tank, the Future mech and the Future drones. Same outline style and team
 * accents as the figures.
 */
import { drawFigure, pushPose, type Outfit, type RigAnim } from '@/art/rigFigure';
import { dustCloud } from '@/art/rigMounts';
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

/** Fade-out used by every machine's death after `from` of the animation. */
function fadeAfter(c: Ctx, u: number, from: number): void {
  c.globalAlpha = u > from ? Math.max(0, 1 - (u - from) / (1 - from)) : 1;
}

function wheel(c: Ctx, p: P2, r: number, spin: number, col: string): void {
  dot(c, p, r, col);
  c.strokeStyle = OUT;
  c.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI) / 3;
    const s = pt(p, a, r * 0.85);
    const e = pt(p, a + Math.PI, r * 0.85);
    c.beginPath();
    c.moveTo(s[0], s[1]);
    c.lineTo(e[0], e[1]);
    c.stroke();
  }
  dot(c, p, r * 0.3, C.iron);
}

/* ---- Catapult crew (Castle utility) --------------------------------------- */

const CREW: Outfit = { torso: 'jerkin', color: '#7a5a3a', sleeves: '#7a5a3a', legs: '#5a4632', boots: C.leatherB, head: 'hood', weapon: 'none' };

export function drawCatapult(c: Ctx, team: string, anim: RigAnim, u: number): void {
  const walking = anim === 'walk';
  const spin = walking ? -u * Math.PI * 2 : 0;
  let tilt = 0;
  if (anim === 'die') {
    const k = ease(clamp01(u / 0.5));
    tilt = 0.35 * k;
    fadeAfter(c, u, 0.5);
  }
  // Throwing arm: cocked back at rest, swings to the crossbar at 45%.
  let armA = -0.95;
  let stone = true;
  if (anim === 'attack') {
    if (u < 0.3) armA = lerp(-0.95, -1.1, ease(u / 0.3));
    else if (u < 0.45) armA = lerp(-1.1, 0.75, (u - 0.3) / 0.15);
    else if (u < 0.6) armA = 0.75;
    else armA = lerp(0.75, -0.95, ease((u - 0.6) / 0.4));
    stone = u < 0.45 || u > 0.85;
  }
  c.save();
  c.translate(8, 0);
  c.rotate(tilt);
  c.translate(-6, 0);
  c.scale(1.45, 1.45);
  // Frame.
  bar(c, [-2, -7], [24, -7], 3.2, C.wood);
  poly(c, [[6, -7], [11, -24], [16, -7]], 2.6, C.woodB);
  bar(c, [9, -18], [22, -18], 2.2, C.wood);
  // Arm with its sling bucket.
  const pivot: P2 = [11, -12];
  const end = pt(pivot, Math.PI / 2 + armA + Math.PI, 18);
  poly(c, [pt(pivot, Math.PI / 2 + armA, 4), end], 2.6, C.wood);
  dot(c, pivot, 1.8, C.iron);
  ellipse(c, end[0], end[1], 3.4, 2.2, armA, C.leather);
  if (stone) dot(c, [end[0], end[1] - 2], 2.6, C.stone);
  // Team banner on the frame.
  shape(c, [[18, -24], [18, -34], [27, -31], [18, -28]], team, 1.2);
  poly(c, [[18, -18], [18, -34]], 1.2, C.woodB);
  wheel(c, [2, -5], 5, spin, C.wood);
  wheel(c, [20, -5], 5, spin, C.wood);
  c.restore();

  // Crew member behind, pushing (or cranking during the attack).
  c.save();
  c.translate(-13, 0);
  if (anim === 'die') {
    const fall = ease(clamp01(u / 0.55));
    c.rotate(-fall * 1.2);
  }
  const P = pushPose(anim === 'walk' ? 'walk' : 'stand', u);
  if (anim === 'attack') {
    const k = bump(u, 0.2, 0.6);
    P.lean = 0.35 - 0.3 * k;
    P.fa = 1.35 + 1.2 * k;
  }
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.beginPath();
  c.ellipse(0, 0, 10, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  drawFigure(c, CREW, team, P);
  c.restore();
}

/* ---- Tank (Modern heavy) ------------------------------------------------- */

export function drawTank(c: Ctx, team: string, anim: RigAnim, u: number): void {
  const moving = anim === 'walk';
  const spin = moving ? -u * Math.PI * 2 : 0;
  let recoil = 0;
  let flash = 0;
  let rock = 0;
  let wreck = 0;
  if (anim === 'attack') {
    recoil = u >= 0.45 ? Math.max(0, 1 - (u - 0.45) / 0.35) : 0;
    flash = u >= 0.45 && u < 0.56 ? 1 - (u - 0.45) / 0.11 : 0;
    rock = u >= 0.45 ? Math.sin(((u - 0.45) / 0.55) * Math.PI * 2) * (1 - (u - 0.45) / 0.55) * 0.05 : 0;
  }
  if (anim === 'die') {
    wreck = clamp01(u / 0.25);
    fadeAfter(c, u, 0.6);
  }
  // A destroyed tank is drawn scorched (darker colors), not overpainted.
  const burn = (col: string): string => shade(col, 1 - 0.62 * wreck);
  const hull = burn(C.olive);
  const hullB = burn(C.oliveB);
  const vib = moving ? Math.sin(u * Math.PI * 8) * 0.35 : 0;
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath();
  c.ellipse(0, 0, 30, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(-20, 0);
  c.rotate(-rock - wreck * 0.04);
  c.translate(20, vib);
  // Tracks.
  rrect(c, -29, -11, 58, 11, 5.5, burn('#3a3a34'));
  for (let i = 0; i < 6; i++) wheel(c, [-22 + i * 8.8, -5.5], 3.6, spin, burn('#6b6b60'));
  // Moving track teeth.
  c.fillStyle = OUT;
  const off = moving ? (u * 6) % 6 : 0;
  for (let x = -26 + off; x < 27; x += 6) c.fillRect(x, -11.2, 2, 1.4);
  // Hull.
  shape(c, [[-27, -11], [-25, -21], [22, -21], [30, -13], [27, -11]], hull);
  c.fillStyle = hullB;
  c.fillRect(-24, -15, 49, 2);
  // Team star on the hull side.
  drawStar(c, [-12, -16], 3.4, burn(team));
  // Turret (pops up and tilts when destroyed).
  const tx = -recoil * 1;
  c.save();
  c.translate(0, -wreck * 4);
  c.rotate(-wreck * 0.12);
  rrect(c, -12 + tx, -31, 27, 11, 5, hull);
  rrect(c, -6 + tx, -34, 9, 4, 2, hullB, 1.2);
  // Barrel.
  const b0: P2 = [12 + tx, -26];
  const len = 25 - recoil * 5;
  bar(c, b0, [b0[0] + len, b0[1]], 3.6, hullB);
  bar(c, [b0[0] + len - 4, b0[1]], [b0[0] + len, b0[1]], 5, hull);
  // Antenna with a team pennant.
  poly(c, [[-8 + tx, -31], [-12 + tx, -47]], 0.7, C.iron);
  shape(c, [[-12 + tx, -47], [-6 + tx, -45], [-11.5 + tx, -43.5]], burn(team), 1);
  const muzzle: P2 = [b0[0] + len + 1, b0[1]];
  muzzleFlash(c, muzzle, Math.PI / 2, 6, flash);
  if (anim === 'attack' && u > 0.45) smoke(c, [muzzle[0] + 4, muzzle[1]], 6, (u - 0.45) / 0.55);
  c.restore();
  c.restore();
  if (wreck > 0) {
    if (u < 0.3) glow(c, [0, -22], 26 * (1 - u / 0.3) + 6, C.fireB, 0.9 * (1 - u / 0.3));
    if (u < 0.5) glow(c, [4, -30], 8, C.fire, 0.8 * (1 - u / 0.5));
    smoke(c, [-2, -36], 9, clamp01(u * 1.1), '#4a4540');
    smoke(c, [10, -32], 7, clamp01(u * 1.3), '#5a5550');
  }
}

function drawStar(c: Ctx, p: P2, r: number, col: string): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = p[0] + Math.cos(a) * rr;
    const y = p[1] + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = OUT;
  c.stroke();
}

/* ---- Mech (Future heavy) --------------------------------------------------- */

function mechLeg(c: Ctx, hip: P2, a: number, knee: number, col: string, colB: string): void {
  const k = pt(hip, a, 11);
  const ankle = pt(k, a - knee, 12);
  poly(c, [hip, k], 6, col);
  poly(c, [k, ankle], 5, colB);
  dot(c, k, 2.8, C.steelD);
  shape(c, [[ankle[0] - 5, ankle[1] + 1], [ankle[0] + 7, ankle[1] + 1], [ankle[0] + 5, ankle[1] - 3], [ankle[0] - 3, ankle[1] - 3]], C.steelD, 1.3);
}

const MECH_SCALE = 1.35;

export function drawMech(c: Ctx, team: string, anim: RigAnim, u: number): void {
  const walking = anim === 'walk';
  const p = u * Math.PI * 2;
  let charge = 0;
  let flash = 0;
  let kick = 0;
  let collapse = 0;
  if (anim === 'attack') {
    charge = u < 0.45 ? ease(u / 0.45) : 0;
    flash = u >= 0.45 && u < 0.58 ? 1 - (u - 0.45) / 0.13 : 0;
    kick = u >= 0.45 ? Math.max(0, 1 - (u - 0.45) / 0.3) : 0;
  }
  if (anim === 'die') {
    collapse = ease(clamp01(u / 0.55));
    fadeAfter(c, u, 0.6);
  }
  const s = Math.sin(p);
  const stomp = walking ? -Math.abs(Math.cos(p)) * 2 : 0;
  const hipY = -30 + stomp + collapse * 12;
  c.fillStyle = 'rgba(0,0,0,.25)';
  c.beginPath();
  c.ellipse(0, 0, 26, 3.5, 0, 0, Math.PI * 2);
  c.fill();
  // A heavy: drawn larger than the figures' proportions.
  c.scale(MECH_SCALE, MECH_SCALE);
  const body = C.white;
  const bodyB = C.whiteB;
  // Far leg.
  mechLeg(c, [-2, hipY], walking ? -s * 0.5 + 0.3 : 0.3 + collapse * 0.6, walking ? 0.9 + Math.max(0, -Math.cos(p)) * 0.6 : 0.9 + collapse, bodyB, shade(bodyB, 0.85));
  // Back cannon arm.
  c.save();
  c.translate(-kick * 2, hipY - 12 + collapse * 4);
  c.rotate(collapse * 0.3);
  rrect(c, -4, -3, 20, 5, 2, C.steelD);
  c.restore();
  // Torso.
  c.save();
  c.translate(-kick * 1.5, hipY);
  c.rotate(collapse * 0.25);
  rrect(c, -13, -20, 26, 17, 5, body);
  rrect(c, -11, -5, 22, 5, 2, bodyB, 1.2);
  // Cockpit glass with the team glow.
  shape(c, [[3, -18], [12, -16], [12.5, -8], [3, -9]], '#20304a');
  glow(c, [8, -13], 7, team, 0.7);
  c.fillStyle = team;
  c.fillRect(-10, -12, 10, 2);
  c.fillRect(-10, -8.5, 6, 1.4);
  // Vents.
  c.fillStyle = OUT;
  for (let i = 0; i < 3; i++) c.fillRect(-11 + i * 3, -18, 1.2, 4);
  c.restore();
  // Near leg.
  mechLeg(c, [2, hipY], walking ? s * 0.5 + 0.3 : 0.25 + collapse * 0.8, walking ? 0.9 + Math.max(0, Math.cos(p)) * 0.6 : 0.9 + collapse, body, bodyB);
  // Front plasma cannon.
  c.save();
  c.translate(2 - kick * 3, hipY - 8 + collapse * 6);
  c.rotate(collapse * 0.5);
  rrect(c, -2, -4, 22, 7, 3, C.steelB);
  for (let i = 0; i < 3; i++) dot(c, [5 + i * 4, -0.5], 1.3, charge > 0.1 || flash > 0 ? team : C.steelD);
  const muzzle: P2 = [21, -0.5];
  glow(c, muzzle, 4 + charge * 8 + flash * 10, team, 0.4 + 0.6 * Math.max(charge, flash));
  if (flash > 0) dot(c, muzzle, 2 + flash * 2, '#ffffff');
  c.restore();
  if (anim === 'die') {
    if (u < 0.5) glow(c, [0, -34], 12 + u * 30, C.fireB, 0.7 * (1 - u / 0.5));
    smoke(c, [-4, -44], 7, clamp01(u * 1.2), '#555');
  }
}

/* ---- Drones (Future economy and utility) --------------------------------- */

export function drawDrone(c: Ctx, team: string, anim: RigAnim, u: number, kind: 'broker' | 'shield'): void {
  const p = u * Math.PI * 2;
  let y = -28 + Math.sin(p) * (anim === 'walk' ? 2 : 1.2);
  let spinA = 0;
  let pulse = 0;
  if (anim === 'attack') pulse = bump(u, 0.2, 0.75);
  if (anim === 'die') {
    const k = ease(clamp01(u / 0.6));
    y = lerp(-28, -6, k);
    spinA = k * 1.2;
    fadeAfter(c, u, 0.6);
  }
  // Shadow shrinks with height.
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.beginPath();
  c.ellipse(0, 0, 11 + (y + 28) * 0.2, 2.2, 0, 0, Math.PI * 2);
  c.fill();
  c.scale(1.2, 1.2);
  c.save();
  c.translate(0, y);
  c.rotate(spinA);
  // Antigrav glow under the body.
  glow(c, [0, 8], 10, team, anim === 'die' ? 0.2 : 0.55);
  ellipse(c, 0, 7, 6, 1.8, 0, rgba(team, 0.8), 0);
  // Side fins / rotors.
  poly(c, [[-10, -2], [-16, -5]], 2, C.whiteB);
  poly(c, [[10, -2], [16, -5]], 2, C.whiteB);
  ellipse(c, -16, -5.5, 4, 1.2, 0, rgba('#ffffff', 0.5), 0);
  ellipse(c, 16, -5.5, 4, 1.2, 0, rgba('#ffffff', 0.5), 0);
  // Body.
  ellipse(c, 0, 0, 11, 7.5, 0, C.white);
  ellipse(c, 0, 2.5, 10, 3.5, 0, C.whiteB, 0);
  c.fillStyle = team;
  c.fillRect(-9, -1, 18, 1.6);
  // Eye.
  dot(c, [6, -1.5], 2.8, '#1d2a3a');
  glow(c, [6.5, -1.5], 4, team, 0.9);
  if (kind === 'broker') {
    // A little holo screen with a rising chart and a coin.
    const holo = rgba('#7df5c8', 0.35);
    c.fillStyle = holo;
    c.beginPath();
    c.moveTo(-6, -8);
    c.lineTo(6, -8);
    c.lineTo(9, -20);
    c.lineTo(-9, -20);
    c.closePath();
    c.fill();
    c.strokeStyle = rgba('#b8ffe6', 0.9);
    c.lineWidth = 1;
    c.beginPath();
    const bars = [2, 4, 3, 6, 8];
    for (let i = 0; i < bars.length; i++) {
      const bx = -6 + i * 3;
      const by = -10 - bars[i]! * (0.9 + 0.1 * Math.sin(p + i));
      if (i === 0) c.moveTo(bx, by);
      else c.lineTo(bx, by);
    }
    c.stroke();
    const coinY = -24 + Math.sin(p * 2) * 1.2;
    ellipse(c, 0, coinY, 3.2 * Math.abs(Math.cos(p)) + 0.6, 3.2, 0, C.gold, 1);
  } else {
    // Shield emitter on top; the attack throws a hex bubble.
    rrect(c, -3, -11, 6, 4, 1.5, C.whiteB, 1.2);
    ellipse(c, 0, -12, 5, 1.8, 0, C.glass, 1.2);
    glow(c, [0, -12], 5 + pulse * 8, '#8fe0ff', 0.6 + 0.4 * pulse);
    if (pulse > 0) {
      c.strokeStyle = rgba('#8fe0ff', 0.8 * pulse);
      c.lineWidth = 1.4;
      const r = 10 + pulse * 12;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i * Math.PI) / 3;
        const x = Math.cos(a) * r;
        const yy = Math.sin(a) * r * 0.8;
        if (i === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.stroke();
    }
  }
  c.restore();
  if (anim === 'die' && u < 0.6) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + u * 4;
      dot(c, pt([0, y], a, 6 + u * 14), 0.8, C.fireB);
    }
  }
}

export { dustCloud };
