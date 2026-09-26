/**
 * Mounted heavies of the rig art: the Stone age mammoth and the horses of
 * the Castle knight and the Renaissance cuirassier. The riders are the
 * shared human figure (`rigFigure.ts`), seated.
 */
import { drawFigure, riderPose, type Outfit, type RigAnim } from '@/art/rigFigure';
import {
  C,
  clamp01,
  dot,
  ease,
  ellipse,
  OUT,
  poly,
  pt,
  shade,
  shape,
  type Ctx,
  type P2,
} from '@/art/rigKit';

/* ---- Mammoth (Stone) ------------------------------------------------------ */

const MAMMOTH_RIDER: Outfit = {
  torso: 'tunic',
  color: '#8b5a2b',
  head: 'headband',
  weapon: 'spear',
  seated: true,
};

export function drawMammoth(c: Ctx, team: string, anim: RigAnim, u: number): void {
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
  ellipse(c, -3, -26, 25, 16, 0, fur);
  c.beginPath();
  c.moveTo(-26, -20);
  for (let i = 0; i <= 12; i++) c.lineTo(-26 + i * 4.2, i % 2 ? -8 : -12);
  c.lineTo(18, -20);
  c.fillStyle = fur;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
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
  dot(c, [20, -30], 11, fur);
  ellipse(c, 14, -29, 5, 7, 0.2, furB);
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
  drawFigure(c, MAMMOTH_RIDER, team, riderPose(MAMMOTH_RIDER, anim, u));
  c.restore();

  if (dust > 0) dustCloud(c, 22, dust);
}

export function dustCloud(c: Ctx, x: number, k: number, col = '200,180,140'): void {
  c.fillStyle = `rgba(${col},${0.6 * k})`;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(x + i * 6, -2 - (1 - k) * 4, 3 + (1 - k) * 5, 0, Math.PI * 2);
    c.fill();
  }
}

/* ---- Horse (Castle knight, Renaissance cuirassier) ------------------------- */

export interface HorseStyle {
  coat: string;
  mane: string;
  /** Knight: a full cloth caparison in the team color. */
  caparison: boolean;
  /** Steel chanfron on the head. */
  chanfron: boolean;
  rider: Outfit;
  /** 'lunge' drives forward (lance), 'rear' rears up (sabre). */
  attack: 'lunge' | 'rear';
}

/** Horses are drawn this much larger than the figure's proportions. */
const HORSE_SCALE = 1.22;

/** One horse leg: upper from `top`, knee, cannon, hoof. */
function horseLeg(c: Ctx, top: P2, swing: number, lift: number, col: string): void {
  const knee = pt(top, swing, 10);
  const hoof = pt(knee, swing - lift * 1.2, 11);
  poly(c, [top, knee, hoof], 4.2, col);
  poly(c, [hoof, [hoof[0] + 2.5, hoof[1]]], 4.4, '#2e241c');
}

export function drawHorse(c: Ctx, team: string, anim: RigAnim, u: number, st: HorseStyle): void {
  const walking = anim === 'walk';
  const p = u * Math.PI * 2;
  let pitch = 0;
  let surge = 0;
  let dust = 0;
  if (anim === 'attack') {
    if (st.attack === 'rear') {
      pitch = u < 0.3 ? -0.2 * ease(u / 0.3) : u < 0.45 ? -0.2 * (1 - (u - 0.3) / 0.15) : 0;
      dust = u >= 0.45 && u < 0.8 ? 1 - (u - 0.45) / 0.35 : 0;
    } else {
      surge = u < 0.3 ? -3 * ease(u / 0.3) : u < 0.45 ? lerpN(-3, 5, (u - 0.3) / 0.15) : u < 0.6 ? 5 : 5 * (1 - ease((u - 0.6) / 0.4));
      pitch = surge * 0.012;
      dust = u >= 0.45 && u < 0.8 ? 1 - (u - 0.45) / 0.35 : 0;
    }
  }
  if (anim === 'die') {
    const fall = ease(clamp01(u / 0.6));
    pitch = -0.5 * fall;
    c.translate(0, fall * 5);
    c.globalAlpha = u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
  }
  const bob = walking ? -Math.abs(Math.sin(p)) * 1.5 : 0;
  const coatB = shade(st.coat, 0.78);
  const frame = (f: () => void, scale = HORSE_SCALE): void => {
    c.save();
    c.translate(-16 + surge, 0);
    c.rotate(pitch);
    c.translate(16, bob);
    c.scale(scale, scale);
    f();
    c.restore();
  };
  // Walk: diagonal pairs move together (a trot, reads well at this size).
  const gait = (phase: number): { swing: number; lift: number } => {
    if (!walking) return { swing: anim === 'attack' && st.attack === 'rear' ? pitch * -1.5 : 0, lift: 0 };
    const s = Math.sin(p + phase);
    return { swing: s * 0.45, lift: Math.max(0, Math.cos(p + phase)) * 0.9 };
  };

  frame(() => {
    // Far legs.
    const lh = gait(Math.PI);
    const lf = gait(0);
    horseLeg(c, [-13, -22], lh.swing, lh.lift, coatB);
    horseLeg(c, [11, -22], lf.swing, lf.lift, coatB);
    // Tail.
    c.beginPath();
    c.moveTo(-20, -30);
    c.quadraticCurveTo(-29, -26 + (walking ? Math.sin(p) * 2 : 0), -26, -12);
    c.quadraticCurveTo(-24, -22, -19, -26);
    c.fillStyle = st.mane;
    c.fill();
    c.lineWidth = 1.3;
    c.strokeStyle = OUT;
    c.stroke();
    // Body.
    ellipse(c, -2, -28, 20, 9.5, 0, st.coat);
    // Neck and head (head angled down and forward).
    shape(c, [[9, -33], [15, -45], [21, -47], [22, -40], [17, -27]], st.coat);
    c.save();
    c.translate(21, -44);
    c.rotate(0.62);
    ellipse(c, 5, 0, 8.5, 4.4, 0, st.coat);
    ellipse(c, 11, 0.5, 3, 3.6, 0, shade(st.coat, 0.7), 1.2);
    c.restore();
    shape(c, [[17.5, -47], [18, -52], [20.5, -47.5]], st.coat, 1.2);
    // Mane.
    c.beginPath();
    c.moveTo(18, -48);
    c.quadraticCurveTo(12, -44, 9, -33);
    c.lineTo(12, -34);
    c.quadraticCurveTo(14, -42, 20, -47);
    c.fillStyle = st.mane;
    c.fill();
    c.stroke();
    if (st.chanfron) {
      c.save();
      c.translate(21, -44);
      c.rotate(0.62);
      shape(c, [[0, -4.6], [10, -3.2], [10.5, 0.5], [0, -1]], C.steel, 1.2);
      c.restore();
    }
    dot(c, [23, -45], 0.9, OUT);
    // Bridle and reins.
    poly(c, [[28, -38], [12, -37]], 0.7, C.leatherB);
    // Near legs.
    const rh = gait(0);
    const rf = gait(Math.PI);
    horseLeg(c, [-10, -22], rh.swing, rh.lift, st.coat);
    horseLeg(c, [14, -22], rf.swing, rf.lift, st.coat);
    // Saddle cloth or full caparison.
    if (st.caparison) {
      c.beginPath();
      c.moveTo(-20, -33);
      c.quadraticCurveTo(-4, -40, 13, -34);
      c.lineTo(17, -18);
      for (let i = 0; i <= 6; i++) c.lineTo(17 - i * 6.2, i % 2 ? -14.5 : -16.5);
      c.closePath();
      c.fillStyle = team;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      c.fillStyle = shade(team, 1.35);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.arc(-12 + i * 10, -24, 1.8, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      shape(c, [[-12, -37], [4, -37], [5, -27], [-11, -27]], team);
      c.fillStyle = C.gold;
      c.fillRect(-11, -29, 15, 1.4);
    }
    rrectSaddle(c);
  });

  // The rider is drawn at figure scale on the scaled-up saddle.
  frame(() => {
    c.translate(-3 * HORSE_SCALE, -40 * HORSE_SCALE + 21);
    drawFigure(c, st.rider, team, riderPose(st.rider, anim, u));
  }, 1);

  if (dust > 0) dustCloud(c, 24, dust);
}

function rrectSaddle(c: Ctx): void {
  c.beginPath();
  c.roundRect(-9, -40, 12, 4, 1.5);
  c.fillStyle = C.leatherB;
  c.fill();
  c.lineWidth = 1.3;
  c.strokeStyle = OUT;
  c.stroke();
}

function lerpN(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
