/**
 * Code-drawn "rig" characters (owner's chosen art style, 2026-09-26; first
 * shown in `docs/art/rig-demo.html`). Every figure is a few body parts drawn
 * as thick outlined strokes and rotated per frame, so all ages can share one
 * body and only swap outfit, weapon and colors.
 *
 * Coordinates are "rig units": feet at y = 0, up is negative y, the figure
 * faces right (+x). `utils/RigArt.ts` renders these into sprite sheets.
 * Pure canvas drawing; no Phaser here.
 */
type Ctx = CanvasRenderingContext2D;
type P2 = [number, number];

const OUT = '#1a120c';
const C = {
  skin: '#d9a066',
  skinB: '#b27d4c',
  hair: '#3a2210',
  wood: '#7a4a24',
  woodB: '#5c3719',
  stone: '#8d8a85',
  stoneB: '#6d6a66',
  bone: '#efe6d2',
  leather: '#6b4a2a',
};

export type RigKind = 'clubber' | 'slinger' | 'mammoth-rider' | 'trader' | 'shaman';
export type RigAnim = 'stand' | 'walk' | 'attack' | 'die';

const ease = (x: number): number => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const pt = (p: P2, a: number, l: number): P2 => [p[0] + Math.sin(a) * l, p[1] + Math.cos(a) * l];

function poly(c: Ctx, ps: P2[], w: number, col: string): void {
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

function dot(c: Ctx, p: P2, r: number, col: string): void {
  c.beginPath();
  c.arc(p[0], p[1], r, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
  c.stroke();
}

function star(c: Ctx, p: P2, a: number, color = '255,230,150'): void {
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

function leg(c: Ctx, hip: P2, a: number, bend: number, col: string): void {
  const k = pt(hip, a, 10);
  const an = pt(k, a - bend, 10);
  poly(c, [hip, k, an, [an[0] + 4, an[1]]], 4.5, col);
}

function arm(c: Ctx, sh: P2, a: number, bend: number, col: string): { h: P2; fa: number } {
  const e = pt(sh, a, 8);
  const fa = a + bend;
  const h = pt(e, fa, 8);
  poly(c, [sh, e, h], 4, col);
  return { h, fa };
}

/* ---- Human poses ---------------------------------------------------------- */

interface Pose {
  bob: number;
  lean: number;
  fl: number;
  fb: number;
  bl: number;
  bb: number;
  fa: number;
  fe: number;
  ba: number;
  be: number;
  /** Weapon angle relative to the forearm (club, staff, spear). */
  tool: number;
  /** Sling cord angle (absolute in the body frame). */
  sling: number;
  rock: boolean;
  fx: number;
  glow: number;
}

type Weapon = 'club' | 'sling' | 'spear' | 'stick' | 'staff';

function basePose(anim: RigAnim, u: number): Pose {
  if (anim === 'walk') {
    const p = u * Math.PI * 2;
    const s = Math.sin(p);
    const co = Math.cos(p);
    return {
      bob: -Math.abs(co) * 1.4, lean: 0.08,
      fl: s * 0.55, fb: 0.15 + 0.7 * Math.max(0, co), bl: -s * 0.55, bb: 0.15 + 0.7 * Math.max(0, -co),
      fa: 0.35 - s * 0.25, fe: 0.9, ba: s * 0.5, be: 0.5,
      tool: 1.9, sling: 0.05, rock: true, fx: 0, glow: 0,
    };
  }
  return {
    bob: 0, lean: 0.03, fl: 0.15, fb: 0.1, bl: -0.15, bb: 0.1,
    fa: 0.35, fe: 0.9, ba: -0.1, be: 0.3, tool: 1.9, sling: 0.05, rock: true, fx: 0, glow: 0,
  };
}

/**
 * Attack timelines: wind up, strike at about 45% of the animation (the
 * unit's `windupMs` is set to that moment, so damage lands on the strike
 * frame), hold briefly, recover.
 */
function attackPose(weapon: Weapon, u: number): Pose {
  const P = basePose('stand', 0);
  Object.assign(P, { fl: 0.4, fb: 0.25, bl: -0.35, bb: 0.1 });
  if (weapon === 'club') {
    const R = { fa: 0.35, fe: 0.9, tool: 1.9, lean: 0.05 };
    const W = { fa: 3.5, fe: 1.2, tool: 0.6, lean: -0.15 };
    const S = { fa: 1, fe: 0.1, tool: 0.35, lean: 0.25 };
    let A = R, B = W, k = 0;
    if (u < 0.3) { A = R; B = W; k = ease(u / 0.3); }
    else if (u < 0.45) { A = W; B = S; k = (u - 0.3) / 0.15; }
    else if (u < 0.6) { A = S; B = S; k = 0; }
    else { A = S; B = R; k = ease((u - 0.6) / 0.4); }
    P.fa = lerp(A.fa, B.fa, k); P.fe = lerp(A.fe, B.fe, k); P.tool = lerp(A.tool, B.tool, k); P.lean = lerp(A.lean, B.lean, k);
    P.fx = u >= 0.45 && u < 0.62 ? 1 - (u - 0.45) / 0.17 : 0;
  } else if (weapon === 'sling') {
    // Whirl overhead, release at 45% (the stone leaves then), recover.
    if (u < 0.35) {
      const k = u / 0.35;
      P.fa = lerp(0.2, 2.3, ease(clamp01(k * 2.5))); P.fe = 0.6; P.lean = -0.05;
      P.sling = k * 22; P.rock = true;
    } else if (u < 0.45) {
      const k = (u - 0.35) / 0.1;
      P.fa = lerp(2.3, 1.1, k); P.fe = lerp(0.6, 0.1, k); P.lean = 0.15; P.rock = true;
      P.sling = P.fa + P.fe + 1.2;
    } else if (u < 0.6) {
      P.fa = 1.1; P.fe = 0.1; P.lean = 0.15; P.rock = false; P.sling = P.fa + P.fe + 1.2;
    } else {
      const k = ease((u - 0.6) / 0.4);
      P.fa = lerp(1.1, 0.2, k); P.fe = lerp(0.1, 0.5, k); P.lean = lerp(0.15, 0.03, k);
      P.sling = lerp(2.4, 0.05, k); P.rock = u > 0.85;
    }
  } else if (weapon === 'spear') {
    // Draw back, thrust at 45%, recover.
    if (u < 0.3) {
      const k = ease(u / 0.3);
      P.fa = lerp(0.9, 0.55, k); P.fe = lerp(0.9, 1.35, k); P.tool = lerp(0.7, 0.3, k); P.lean = lerp(0.05, -0.1, k);
    } else {
      const k = u < 0.45 ? (u - 0.3) / 0.15 : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
      P.fa = lerp(0.9, 1.45, k); P.fe = lerp(0.9, 0.05, k); P.tool = lerp(0.7, 0.05, k); P.lean = lerp(0.05, 0.25, k);
    }
    P.fx = u >= 0.45 && u < 0.62 ? 1 - (u - 0.45) / 0.17 : 0;
  } else if (weapon === 'staff') {
    const k = u < 0.25 ? ease(u / 0.25) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
    P.fa = lerp(0.35, 2.8, k); P.fe = lerp(0.9, 0.2, k); P.tool = lerp(1.9, 0.2, k); P.lean = lerp(0.03, -0.08, k);
    P.glow = u < 0.7 ? Math.sin((u / 0.7) * Math.PI) : 0;
  }
  P.ba = -0.2 - P.lean;
  P.be = 0.4;
  return P;
}

interface Kit {
  tunic: string;
  weapon: Weapon;
  headband?: boolean;
  headdress?: boolean;
  sack?: boolean;
  seated?: boolean;
}

const KITS: Record<Exclude<RigKind, 'mammoth-rider'> | 'rider', Kit> = {
  clubber: { tunic: '#8b5a2b', weapon: 'club' },
  slinger: { tunic: '#b08452', weapon: 'sling', headband: true },
  trader: { tunic: '#9c7a3c', weapon: 'stick', sack: true },
  shaman: { tunic: '#5e4a6e', weapon: 'staff', headdress: true },
  rider: { tunic: '#8b5a2b', weapon: 'spear', headband: true, seated: true },
};

function drawHuman(c: Ctx, kit: Kit, team: string, P: Pose): void {
  const hip: P2 = [0, -21 + P.bob];
  const body = (f: () => void): void => {
    c.save();
    c.translate(hip[0], hip[1]);
    c.rotate(P.lean);
    f();
    c.restore();
  };
  if (kit.sack) {
    body(() => {
      dot(c, [-8, -15], 7, '#a58a5a');
      poly(c, [[-3, -20], [2, -8]], 1.2, C.leather);
    });
  }
  body(() => {
    const { h } = arm(c, [0, -16], P.ba, P.be, C.skinB);
    dot(c, h, 2.2, C.skinB);
  });
  if (kit.seated) {
    leg(c, hip, 1.45, -1.3, C.skin);
  } else {
    leg(c, hip, P.bl, P.bb, C.skinB);
    leg(c, hip, P.fl, P.fb, C.skin);
  }
  body(() => {
    c.lineWidth = 1.5;
    c.strokeStyle = OUT;
    c.beginPath();
    c.roundRect(-6, -19, 12, 16, 4);
    c.fillStyle = C.skin;
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(-7, -18);
    c.lineTo(-3, -19.5);
    c.lineTo(7, -10);
    c.lineTo(7.5, 2);
    for (let i = 0; i <= 5; i++) c.lineTo(7.5 - i * 3, i % 2 ? 4.5 : 2);
    c.closePath();
    c.fillStyle = kit.tunic;
    c.fill();
    c.stroke();
    c.fillStyle = team;
    c.fillRect(-7.5, -5, 15, 2.4);
    c.strokeRect(-7.5, -5, 15, 2.4);
    if (kit.weapon === 'sling') dot(c, [-5, -2], 2.6, C.leather);
    if (kit.headdress) for (let i = 0; i < 3; i++) dot(c, [-2 + i * 3, -17.5 + (i % 2)], 1.2, C.bone);
    // Head.
    dot(c, [2, -24], 6.5, C.skin);
    c.beginPath();
    c.arc(1.2, -25.5, 7, Math.PI * 0.8, Math.PI * 2.05);
    c.closePath();
    c.fillStyle = C.hair;
    c.fill();
    c.beginPath();
    c.moveTo(-5.5, -23);
    c.lineTo(-9, -21);
    c.lineTo(-6, -27);
    c.lineTo(-9, -28);
    c.lineTo(-3, -31);
    c.lineTo(-3, -33.5);
    c.lineTo(2, -32);
    c.fill();
    if (kit.headband) {
      c.fillStyle = team;
      c.fillRect(-4.5, -29, 12, 2.2);
      c.strokeRect(-4.5, -29, 12, 2.2);
      c.beginPath();
      c.ellipse(-6, -33, 1.6, 4.5, -0.5, 0, Math.PI * 2);
      c.fillStyle = C.bone;
      c.fill();
      c.stroke();
    }
    if (kit.headdress) {
      for (const [x, a] of [[-4, -0.5], [0, -0.1], [4, 0.3]] as const) {
        c.save();
        c.translate(x, -31);
        c.rotate(a);
        c.beginPath();
        c.ellipse(0, -5, 1.8, 5.5, 0, 0, Math.PI * 2);
        c.fillStyle = C.bone;
        c.fill();
        c.stroke();
        c.fillStyle = team;
        c.fillRect(-1.6, -10.5, 3.2, 3);
        c.restore();
      }
      c.fillStyle = team;
      c.fillRect(5, -24.5, 3.5, 1.2);
      c.fillRect(5, -22.5, 3.5, 1.2);
    }
    c.fillStyle = OUT;
    c.fillRect(4, -27, 5, 1.6);
    c.fillRect(5.5, -24.5, 1.6, 1.6);
    dot(c, [8.5, -22.5], 1.3, C.skin);
    // Front arm and weapon.
    const { h, fa } = arm(c, [1, -16], P.fa, P.fe, C.skin);
    const ta = fa + P.tool;
    switch (kit.weapon) {
      case 'club':
        poly(c, [pt(h, ta, -3), pt(h, ta, 7)], 3, C.wood);
        poly(c, [pt(h, ta, 7), pt(h, ta, 16)], 7, C.wood);
        dot(c, pt(h, ta, 12), 1, C.woodB);
        if (P.fx) star(c, pt(h, ta, 18), P.fx);
        break;
      case 'sling': {
        const e = pt(h, P.sling - P.lean, 9);
        c.lineWidth = 1.2;
        c.strokeStyle = '#4a3020';
        c.beginPath();
        c.moveTo(h[0], h[1]);
        c.lineTo(e[0], e[1]);
        c.stroke();
        dot(c, e, 1.8, C.leather);
        if (P.rock) dot(c, e, 1.5, C.stone);
        break;
      }
      case 'spear': {
        poly(c, [pt(h, ta, -12), pt(h, ta, 16)], 2.2, C.wood);
        const tip = pt(h, ta, 16);
        c.beginPath();
        const a1 = pt(tip, ta + 0.5, -4);
        const a2 = pt(tip, ta - 0.5, -4);
        const t2 = pt(tip, ta, 4);
        c.moveTo(a1[0], a1[1]);
        c.lineTo(t2[0], t2[1]);
        c.lineTo(a2[0], a2[1]);
        c.closePath();
        c.fillStyle = C.stone;
        c.fill();
        c.stroke();
        if (P.fx) star(c, pt(h, ta, 20), P.fx);
        break;
      }
      case 'stick':
        poly(c, [pt(h, 0.1, -8), pt(h, 0.1, 12)], 2, C.wood);
        break;
      case 'staff': {
        const top = pt(h, ta + Math.PI, 12);
        poly(c, [pt(h, ta + Math.PI, -6), top], 2.2, C.woodB);
        if (P.glow > 0) {
          c.beginPath();
          c.arc(top[0], top[1], 5 + P.glow * 6, 0, Math.PI * 2);
          c.fillStyle = `rgba(120,255,150,${0.45 * P.glow})`;
          c.fill();
        }
        dot(c, top, 3.2, C.bone);
        c.fillStyle = OUT;
        c.fillRect(top[0] + 0.3, top[1] - 1, 1.2, 1.2);
        break;
      }
    }
    dot(c, h, 2.3, C.skin);
  });
}

/* ---- Mammoth ---------------------------------------------------------------- */

function drawMammoth(c: Ctx, team: string, anim: RigAnim, u: number): void {
  const walking = anim === 'walk';
  const p = u * Math.PI * 2;
  // Attack: rear up on the hind legs, then stomp (the splash) and settle.
  let rear = 0;
  let dust = 0;
  if (anim === 'attack') {
    // Rear up, stomp down at 45% (the hit), dust.
    rear = u < 0.3 ? -0.22 * ease(u / 0.3) : u < 0.45 ? -0.22 * (1 - (u - 0.3) / 0.15) : 0;
    dust = u >= 0.45 && u < 0.8 ? 1 - (u - 0.45) / 0.35 : 0;
  }
  if (anim === 'die') {
    // Topples over backwards, the rider drops, both fade.
    const fall = ease(clamp01(u / 0.6));
    rear = -0.55 * fall;
    c.translate(0, fall * 6);
    c.globalAlpha = u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
  }
  const bob = walking ? -Math.abs(Math.cos(p)) * 1.2 : 0;
  c.save();
  c.translate(-14, 0);
  c.rotate(rear);
  c.translate(14, bob);

  const fur = '#7a4e2c';
  const furB = '#5e3a1f';
  const legAt = (x: number, phase: number, col: string): void => {
    const swing = walking ? Math.sin(p + phase) * 0.35 : 0;
    const top: P2 = [x, -14];
    const foot = pt(top, swing, 14);
    poly(c, [top, foot], 8, col);
    dot(c, [foot[0] + 0.5, foot[1] - 0.5], 3.2, '#4a3222');
  };
  legAt(-16, Math.PI, furB);
  legAt(8, 0, furB);
  // Tail.
  poly(c, [[-26, -28], [-30, -20 + (walking ? Math.sin(p) : 0)]], 2, furB);
  // Body.
  c.beginPath();
  c.ellipse(-3, -26, 25, 16, 0, 0, Math.PI * 2);
  c.fillStyle = fur;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
  c.stroke();
  c.beginPath();
  c.moveTo(-26, -20);
  for (let i = 0; i <= 12; i++) c.lineTo(-26 + i * 4.2, i % 2 ? -8 : -12);
  c.lineTo(18, -20);
  c.fillStyle = fur;
  c.fill();
  c.stroke();
  legAt(-10, 0, fur);
  legAt(14, Math.PI, fur);
  // Saddle blanket in the team color.
  c.fillStyle = team;
  c.beginPath();
  c.roundRect(-14, -43, 18, 8, 2);
  c.fill();
  c.stroke();
  // Head, ear, eye.
  c.beginPath();
  c.arc(20, -30, 11, 0, Math.PI * 2);
  c.fillStyle = fur;
  c.fill();
  c.stroke();
  c.beginPath();
  c.ellipse(14, -29, 5, 7, 0.2, 0, Math.PI * 2);
  c.fillStyle = furB;
  c.fill();
  c.stroke();
  dot(c, [24, -33], 1.2, OUT);
  // Tusk and trunk.
  const sway = walking ? Math.sin(p) * 0.15 : anim === 'attack' ? rear * 1.5 : 0;
  c.lineCap = 'round';
  c.lineWidth = 5.5;
  c.strokeStyle = OUT;
  c.beginPath();
  c.moveTo(25, -22);
  c.quadraticCurveTo(36, -18, 37, -27);
  c.stroke();
  c.lineWidth = 3;
  c.strokeStyle = C.bone;
  c.stroke();
  const t1: P2 = [29, -26];
  const t2 = pt(t1, 0.15 + sway, 10);
  const t3 = pt(t2, -0.6 + sway, 6);
  poly(c, [t1, t2, t3], 5, fur);
  c.restore();

  // Rider on the saddle.
  c.save();
  c.translate(-14, 0);
  c.rotate(rear);
  c.translate(14, bob);
  c.translate(-5, -24);
  const pose = anim === 'attack' ? attackPose('spear', u) : basePose('stand', 0);
  pose.bob = 0;
  pose.fa = anim === 'attack' ? pose.fa : 0.9;
  pose.fe = anim === 'attack' ? pose.fe : 0.9;
  pose.tool = anim === 'attack' ? pose.tool : 0.7;
  drawHuman(c, KITS.rider, team, pose);
  c.restore();

  if (dust > 0) {
    c.fillStyle = `rgba(200,180,140,${0.6 * dust})`;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(22 + i * 6, -2 - (1 - dust) * 4, 3 + (1 - dust) * 5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/**
 * Draws one frame. `u` is the phase through the animation, 0..1.
 * The canvas must already be translated to the feet and scaled to rig units.
 */
export function drawRig(c: Ctx, kind: RigKind, team: string, anim: RigAnim, u: number): void {
  if (kind === 'mammoth-rider') {
    drawMammoth(c, team, anim, u);
    c.globalAlpha = 1;
    return;
  }
  const kit = KITS[kind];
  const pose = anim === 'attack' ? attackPose(kit.weapon, u) : basePose(anim === 'die' ? 'stand' : anim, u);
  if (anim === 'die') {
    // Falls over backwards and fades out.
    const fall = ease(clamp01(u / 0.55));
    c.translate(fall * 3, 0); // keep the fallen body inside the frame
    c.rotate(-fall * 1.45);
    c.globalAlpha = u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
    pose.fa = lerp(pose.fa, 2.4, fall);
    pose.ba = lerp(pose.ba, 2.0, fall);
  }
  if (kind === 'trader') {
    pose.fa = 0.5;
    pose.fe = 0.4;
  }
  if (kind === 'shaman' && anim !== 'attack') pose.tool = 1.9;
  // Shadow.
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.beginPath();
  c.ellipse(0, 0, 12, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  drawHuman(c, kit, team, pose);
  c.globalAlpha = 1;
}
