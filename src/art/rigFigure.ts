/**
 * The shared human figure of the rig art: one body (legs, torso, head, two
 * arms) dressed by an `Outfit` (clothes, headgear, carried items) and posed
 * per frame by a `Pose`. Every foot soldier of every age is this figure;
 * only the outfit and the weapon change (owner's art direction: shared body
 * parts rotated by code, per-age outfits and weapons, team-colored accents).
 *
 * Body frame: the hip sits 21 rig units above the feet; torso, head and arms
 * are drawn rotated by the pose's lean around the hip.
 */
import {
  arm,
  bar,
  C,
  clamp01,
  dot,
  ease,
  ellipse,
  glow,
  leg,
  lerp,
  muzzleFlash,
  OUT,
  poly,
  pt,
  reach,
  rgba,
  rrect,
  shade,
  shape,
  smoke,
  star,
  type Ctx,
  type P2,
} from '@/art/rigKit';

/* ---- Outfits ---------------------------------------------------------- */

export type Weapon =
  | 'club'
  | 'sling'
  | 'spear'
  | 'stick'
  | 'staff'
  | 'sword'
  | 'bow'
  | 'lance'
  | 'pike'
  | 'musket'
  | 'sabre'
  | 'rifle'
  | 'sniper'
  | 'pistol'
  | 'blade'
  | 'laser'
  | 'flask'
  | 'ledger'
  | 'clipboard'
  | 'chest'
  | 'none';

export type HeadGear =
  | 'none'
  | 'headband'
  | 'headdress'
  | 'nasal'
  | 'hood'
  | 'greathelm'
  | 'morion'
  | 'cavalier'
  | 'burgonet'
  | 'beret'
  | 'cowl'
  | 'm1'
  | 'boonie'
  | 'hardhat'
  | 'peaked'
  | 'visor';

export type Torso = 'tunic' | 'mail' | 'jerkin' | 'plate' | 'doublet' | 'coat' | 'robe' | 'fatigues' | 'vest' | 'suit' | 'armor';

export interface Outfit {
  torso: Torso;
  /** Main clothing color. `'team'` uses the side's color. */
  color: string;
  /** Second clothing color (trim, stripes, vest). */
  trim?: string;
  /** Arm color (sleeves); bare skin when absent. */
  sleeves?: string;
  /** Leg color (trousers); bare skin when absent. */
  legs?: string;
  boots?: string;
  gloves?: string;
  head: HeadGear;
  hair?: 'wild' | 'short' | 'bald' | 'long';
  hairColor?: string;
  facial?: 'mustache' | 'beard' | 'goatee';
  weapon: Weapon;
  /** Something worn or held that isn't the main weapon. */
  extra?: 'sack' | 'quiver' | 'shield' | 'pack' | 'cape' | 'pouches' | 'jetpack' | 'moneybag' | 'goggles';
  seated?: boolean;
  skin?: string;
}

/* ---- Poses ------------------------------------------------------------ */

export interface Pose {
  bob: number;
  lean: number;
  /** Front and back leg angle and knee bend. */
  fl: number;
  fb: number;
  bl: number;
  bb: number;
  /** Front and back arm angle and elbow bend (one-handed poses). */
  fa: number;
  fe: number;
  ba: number;
  be: number;
  /** Weapon angle relative to the forearm (club, staff, spear, sword). */
  tool: number;
  /** Sling cord angle (absolute in the body frame). */
  sling: number;
  rock: boolean;
  /** Impact spark strength 0..1. */
  fx: number;
  /** Magic / energy glow 0..1. */
  glow: number;
  /** Two-handed weapons: grip point (body frame) and weapon angle. */
  grip: P2;
  ga: number;
  /** Muzzle flash 0..1 (guns), smoke phase 0..1 (0 = none). */
  flash: number;
  smoke: number;
  /** Bow draw 0..1, and whether an arrow is on the string. */
  draw: number;
  nocked: boolean;
  /** Sniper kneel 0..1. */
  kneel: number;
  /** Bow raised to aim, 0 (carried low) .. 1 (at eye level). */
  aim: number;
}

export type RigAnim = 'stand' | 'walk' | 'attack' | 'die';

type AttackStyle = 'swing' | 'thrust' | 'sling' | 'raise' | 'shoot' | 'bow' | 'couch' | 'none';

const WEAPON_STYLE: Record<Weapon, AttackStyle> = {
  club: 'swing',
  sword: 'swing',
  sabre: 'swing',
  blade: 'swing',
  sling: 'sling',
  spear: 'thrust',
  pike: 'thrust',
  rifle: 'thrust', // the rifleman fights with the bayonet (slot 1 is melee)
  lance: 'couch',
  staff: 'raise',
  flask: 'raise',
  pistol: 'raise',
  musket: 'shoot',
  sniper: 'shoot',
  laser: 'shoot',
  bow: 'bow',
  stick: 'none',
  ledger: 'none',
  clipboard: 'none',
  chest: 'none',
  none: 'none',
};

/** Weapons held in both hands at a grip point (see `Pose.grip` / `Pose.ga`). */
const TWO_HANDED = new Set<Weapon>(['pike', 'musket', 'rifle', 'sniper', 'laser', 'lance']);

export function basePose(anim: RigAnim, u: number): Pose {
  const p: Pose = {
    bob: 0, lean: 0.03, fl: 0.15, fb: 0.1, bl: -0.15, bb: 0.1,
    fa: 0.35, fe: 0.9, ba: -0.1, be: 0.3, tool: 1.9, sling: 0.05, rock: true, fx: 0, glow: 0,
    grip: [4, -11], ga: Math.PI * 0.78, flash: 0, smoke: 0, draw: 0, nocked: false, kneel: 0, aim: 0,
  };
  if (anim === 'walk') {
    const ph = u * Math.PI * 2;
    const s = Math.sin(ph);
    const co = Math.cos(ph);
    Object.assign(p, {
      bob: -Math.abs(co) * 1.4, lean: 0.08,
      fl: s * 0.55, fb: 0.15 + 0.7 * Math.max(0, co), bl: -s * 0.55, bb: 0.15 + 0.7 * Math.max(0, -co),
      fa: 0.35 - s * 0.25, fe: 0.9, ba: s * 0.5, be: 0.5,
    });
    p.grip = [4 + s * 0.6, -11 + Math.abs(co) * 0.5];
  }
  return p;
}

/** Linear blend between two partial poses. */
function blend<T extends Record<string, number>>(a: T, b: T, k: number): T {
  const out = {} as Record<string, number>;
  for (const key of Object.keys(a)) out[key] = lerp(a[key]!, b[key]!, k);
  return out as T;
}

/**
 * Four-key timeline used by most attacks: rest -> windup (0..w) -> strike
 * (w..0.45) -> hold (0.45..0.6) -> back to rest (0.6..1). The strike lands at
 * 45% of the animation; units' `windupMs` match that moment.
 */
function timeline<T extends Record<string, number>>(u: number, R: T, W: T, S: T, w = 0.3): T {
  if (u < w) return blend(R, W, ease(u / w));
  if (u < 0.45) return blend(W, S, (u - w) / (0.45 - w));
  if (u < 0.6) return S;
  return blend(S, R, ease((u - 0.6) / 0.4));
}

export function attackPose(weapon: Weapon, u: number): Pose {
  const P = basePose('stand', 0);
  Object.assign(P, { fl: 0.4, fb: 0.25, bl: -0.35, bb: 0.1 });
  const style = WEAPON_STYLE[weapon];
  const spark = u >= 0.45 && u < 0.62 ? 1 - (u - 0.45) / 0.17 : 0;
  switch (style) {
    case 'swing': {
      // Blades swing a bit flatter and faster than the club.
      const quick = weapon === 'blade';
      const k = timeline(
        u,
        { fa: 0.35, fe: 0.9, tool: 1.9, lean: 0.05 },
        { fa: 3.5, fe: 1.2, tool: 0.6, lean: -0.15 },
        { fa: 1, fe: 0.1, tool: quick ? 0.2 : 0.35, lean: 0.25 },
        quick ? 0.25 : 0.3,
      );
      Object.assign(P, k);
      P.fx = spark;
      break;
    }
    case 'sling':
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
      break;
    case 'thrust': {
      if (TWO_HANDED.has(weapon)) {
        // Level the weapon, draw back, lunge at 45%, recover.
        const k = timeline(
          u,
          { gx: 3, gy: -11, ga: Math.PI * 0.78, lean: 0.03 },
          { gx: -1, gy: -13, ga: Math.PI * 0.53, lean: -0.1 },
          { gx: 9, gy: -13, ga: Math.PI * 0.5, lean: 0.28 },
        );
        P.grip = [k.gx, k.gy]; P.ga = k.ga; P.lean = k.lean;
      } else {
        if (u < 0.3) {
          const k = ease(u / 0.3);
          P.fa = lerp(0.9, 0.55, k); P.fe = lerp(0.9, 1.35, k); P.tool = lerp(0.7, 0.3, k); P.lean = lerp(0.05, -0.1, k);
        } else {
          const k = u < 0.45 ? (u - 0.3) / 0.15 : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
          P.fa = lerp(0.9, 1.45, k); P.fe = lerp(0.9, 0.05, k); P.tool = lerp(0.7, 0.05, k); P.lean = lerp(0.05, 0.25, k);
        }
      }
      P.fx = spark;
      break;
    }
    case 'couch': {
      // Mounted lance: lower it, then drive it forward at 45%.
      const k = timeline(
        u,
        { gx: 3, gy: -12, ga: Math.PI * 0.8, lean: 0.03 },
        { gx: 0, gy: -13, ga: Math.PI * 0.55, lean: -0.08 },
        { gx: 8, gy: -12, ga: Math.PI * 0.5, lean: 0.25 },
      );
      P.grip = [k.gx, k.gy]; P.ga = k.ga; P.lean = k.lean;
      P.fx = spark;
      break;
    }
    case 'raise': {
      const k = u < 0.25 ? ease(u / 0.25) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
      if (weapon === 'pistol') {
        // The officer points forward and shouts orders.
        P.fa = lerp(0.35, 1.75, k); P.fe = lerp(0.9, 0.05, k); P.lean = lerp(0.03, 0.1, k);
      } else {
        P.fa = lerp(0.35, 2.8, k); P.fe = lerp(0.9, 0.2, k); P.tool = lerp(1.9, 0.2, k); P.lean = lerp(0.03, -0.08, k);
      }
      P.glow = u < 0.7 ? Math.sin((u / 0.7) * Math.PI) : 0;
      break;
    }
    case 'shoot': {
      // Raise to the shoulder and aim, fire at 45% (recoil), lower.
      const aim = u < 0.25 ? ease(u / 0.25) : u < 0.75 ? 1 : 1 - ease((u - 0.75) / 0.25);
      const kick = u >= 0.45 && u < 0.6 ? 1 - (u - 0.45) / 0.15 : 0;
      P.grip = [lerp(3, 5, aim) - kick * 2.2, lerp(-11, -15.5, aim)];
      P.ga = lerp(Math.PI * 0.78, Math.PI * 0.5, aim) + kick * 0.18;
      P.lean = lerp(0.03, 0.06, aim) - kick * 0.12;
      P.flash = u >= 0.45 && u < 0.56 ? 1 - (u - 0.45) / 0.11 : 0;
      P.smoke = u >= 0.45 ? (u - 0.45) / 0.55 : 0;
      if (weapon === 'sniper') P.kneel = u < 0.2 ? ease(u / 0.2) : u < 0.8 ? 1 : 1 - ease((u - 0.8) / 0.2);
      break;
    }
    case 'bow': {
      // Nock, draw to the cheek, loose at 45%, reach for the next arrow.
      P.aim = u < 0.15 ? ease(u / 0.15) : u < 0.7 ? 1 : 1 - ease((u - 0.7) / 0.3);
      P.draw = u < 0.12 ? 0 : u < 0.45 ? ease((u - 0.12) / 0.33) : 0;
      P.nocked = u > 0.05 && u < 0.45;
      P.lean = 0.02;
      P.fx = 0;
      break;
    }
    case 'none':
      break;
  }
  if (!TWO_HANDED.has(weapon) && style !== 'bow') {
    P.ba = -0.2 - P.lean;
    P.be = 0.4;
  }
  return P;
}

/* ---- Drawing ---------------------------------------------------------- */

function teamOr(color: string, team: string): string {
  return color === 'team' ? team : color;
}

/** Hand position of the bow arm: carried low, or raised to aim (body frame). */
const BOW_LOW: P2 = [8, -6];
const BOW_AIM: P2 = [15, -17];
function bowHand(P: Pose): P2 {
  return [lerp(BOW_LOW[0], BOW_AIM[0], P.aim), lerp(BOW_LOW[1], BOW_AIM[1], P.aim)];
}

/**
 * Draws one human figure. The canvas is at the feet; `team` is the side's
 * color. Legs are drawn in the hip frame, the rest in the leaning body frame.
 */
export function drawFigure(c: Ctx, o: Outfit, team: string, P: Pose): void {
  const skin = o.skin ?? C.skin;
  const skinB = shade(skin, 0.82);
  const sleeve = o.sleeves ? teamOr(o.sleeves, team) : skin;
  const sleeveB = o.sleeves ? shade(sleeve, 0.8) : skinB;
  const legCol = o.legs ? teamOr(o.legs, team) : skin;
  const legColB = o.legs ? shade(legCol, 0.8) : skinB;
  const main = teamOr(o.color, team);
  const kneel = P.kneel;
  const hipY = -21 + P.bob + kneel * 7;
  const hip: P2 = [0, hipY];
  const body = (f: () => void): void => {
    c.save();
    c.translate(hip[0], hip[1]);
    c.rotate(P.lean);
    f();
    c.restore();
  };
  const twoHanded = TWO_HANDED.has(o.weapon);

  // Behind the body: carried packs, capes, quivers.
  body(() => drawBackExtra(c, o, team));

  // Back arm (and a two-handed weapon's rear grip).
  body(() => {
    if (twoHanded) {
      const r = reach([0, -16], P.grip, 8, -1);
      const { h } = arm(c, [0, -16], r.a, r.bend, sleeveB);
      dot(c, h, 2.2, o.gloves ?? skinB);
    } else if (o.weapon === 'bow' && P.aim > 0) {
      const bh = bowHand(P);
      const target: P2 = [bh[0] - 3 - 12 * P.draw, bh[1] + 1];
      const r = reach([0, -16], target, 8, -1);
      const { h } = arm(c, [0, -16], r.a, r.bend, sleeveB);
      dot(c, h, 2.2, o.gloves ?? skinB);
    } else {
      const { h } = arm(c, [0, -16], P.ba, P.be, sleeveB);
      dot(c, h, 2.2, o.gloves ?? skinB);
    }
  });

  // Legs.
  if (o.seated) {
    leg(c, hip, 1.45, -1.3, legCol, o.boots);
  } else if (kneel > 0) {
    // Front knee up, back knee on the ground.
    leg(c, hip, lerp(P.bl, -0.2, kneel), lerp(P.bb, 1.9, kneel), legColB, o.boots ? shade(o.boots, 0.85) : undefined);
    leg(c, hip, lerp(P.fl, 1.1, kneel), lerp(P.fb, 1.5, kneel), legCol, o.boots);
  } else {
    leg(c, hip, P.bl, P.bb, legColB, o.boots ? shade(o.boots, 0.85) : undefined);
    leg(c, hip, P.fl, P.fb, legCol, o.boots);
  }

  body(() => {
    drawTorso(c, o, team, skin, main);
    if (o.extra === 'shield') drawHeldShield(c, team);
    drawHead(c, o, team, skin);

    // Front arm and weapon.
    if (twoHanded) {
      drawTwoHanded(c, o, team, P);
      const fore = pt(P.grip, P.ga, o.weapon === 'pike' || o.weapon === 'lance' ? 9 : 8);
      const r = reach([1, -16], fore, 8, -1);
      const { h } = arm(c, [1, -16], r.a, r.bend, sleeve);
      dot(c, h, 2.3, o.gloves ?? skin);
      return;
    }
    if (o.weapon === 'bow') {
      drawBow(c, P);
      const r = reach([1, -16], bowHand(P), 8, -1);
      const { h } = arm(c, [1, -16], r.a, r.bend, sleeve);
      dot(c, h, 2.3, o.gloves ?? skin);
      return;
    }
    const { h, fa } = arm(c, [1, -16], P.fa, P.fe, sleeve);
    drawOneHanded(c, o, team, P, h, fa + P.tool, fa);
    dot(c, h, 2.3, o.gloves ?? skin);
  });
}

function drawBackExtra(c: Ctx, o: Outfit, team: string): void {
  switch (o.extra) {
    case 'sack':
      dot(c, [-8, -15], 7, '#a58a5a');
      poly(c, [[-3, -20], [2, -8]], 1.2, C.leather);
      break;
    case 'quiver':
      c.save();
      c.translate(-6, -14);
      c.rotate(-0.35);
      rrect(c, -2.5, -9, 5, 14, 1.5, C.leather);
      for (let i = 0; i < 3; i++) {
        poly(c, [[-1 + i * 1.2, -9], [-1.5 + i * 1.3, -13]], 0.8, C.wood);
        shape(c, [[-2.4 + i * 1.3, -13], [-0.6 + i * 1.3, -13], [-1.5 + i * 1.3, -15.5]], C.cloth, 0.8);
      }
      c.restore();
      break;
    case 'pack':
      rrect(c, -11, -19, 7, 11, 2, C.oliveB);
      rrect(c, -11.5, -13, 4, 4, 1, C.olive);
      break;
    case 'jetpack':
      rrect(c, -12, -21, 7, 14, 2.5, C.whiteB);
      glow(c, [-8.5, -5], 4, team, 0.8);
      break;
    case 'cape': {
      c.beginPath();
      c.moveTo(-3, -19);
      c.quadraticCurveTo(-13, -8, -11, 2);
      c.lineTo(-3, 0);
      c.closePath();
      c.fillStyle = shade(team, 0.75);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      break;
    }
    case 'moneybag':
      dot(c, [-8, -9], 5, '#8a6a3a');
      c.fillStyle = C.gold;
      c.font = 'bold 6px sans-serif';
      c.fillText('$', -9.6, -7);
      break;
    default:
      break;
  }
}

function drawTorso(c: Ctx, o: Outfit, team: string, skin: string, main: string): void {
  const trim = o.trim ? teamOr(o.trim, team) : shade(main, 0.75);
  switch (o.torso) {
    case 'tunic': {
      rrect(c, -6, -19, 12, 16, 4, skin);
      c.beginPath();
      c.moveTo(-7, -18);
      c.lineTo(-3, -19.5);
      c.lineTo(7, -10);
      c.lineTo(7.5, 2);
      for (let i = 0; i <= 5; i++) c.lineTo(7.5 - i * 3, i % 2 ? 4.5 : 2);
      c.closePath();
      c.fillStyle = main;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      belt(c, team);
      if (o.weapon === 'sling') dot(c, [-5, -2], 2.6, C.leather);
      if (o.head === 'headdress') for (let i = 0; i < 3; i++) dot(c, [-2 + i * 3, -17.5 + (i % 2)], 1.2, C.bone);
      break;
    }
    case 'mail': {
      rrect(c, -6.5, -19.5, 13, 20, 4, C.steelB);
      c.fillStyle = rgba(OUT, 0.25);
      for (let y = -17; y < 0; y += 2.5) for (let x = -5 + ((y / 2.5) % 2 ? 1.2 : 0); x < 6; x += 2.5) c.fillRect(x, y, 1, 1);
      // Tabard in the team color.
      shape(c, [[-3, -18.5], [4.5, -18.5], [5, 3], [-3.5, 3]], team);
      c.fillStyle = shade(team, 1.35);
      c.fillRect(-0.5, -15, 2, 8);
      c.fillRect(-2.5, -12, 6, 2);
      belt(c, C.leather);
      break;
    }
    case 'jerkin': {
      rrect(c, -6.5, -19.5, 13, 21, 4, main);
      c.strokeStyle = rgba(OUT, 0.5);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(1, -19);
      c.lineTo(1, 1);
      c.stroke();
      belt(c, team);
      break;
    }
    case 'plate': {
      rrect(c, -6.5, -19.5, 13, 18, 5, C.steel);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(2, -17, 2, 10);
      // Skirt of lames and a team sash.
      rrect(c, -7, -3, 14, 5, 2, C.steelB);
      c.beginPath();
      c.moveTo(-6, -18);
      c.lineTo(6.5, -6);
      c.lineWidth = 3.2;
      c.strokeStyle = team;
      c.stroke();
      break;
    }
    case 'doublet': {
      rrect(c, -7, -20, 14, 19, 5, main);
      c.fillStyle = trim;
      for (let i = 0; i < 3; i++) c.fillRect(-4.5 + i * 4, -18, 1.8, 15);
      rrect(c, -7.5, -3, 15, 5, 2, shade(main, 0.8));
      belt(c, C.leather);
      break;
    }
    case 'coat': {
      shape(c, [[-6.5, -19.5], [6, -19.5], [8, 6], [-7, 6]], main);
      poly(c, [[1, -19], [1.5, 5]], 0.6, trim);
      for (let i = 0; i < 4; i++) dot(c, [3, -16 + i * 4], 0.8, C.gold);
      shape(c, [[-1, -19.5], [4, -19.5], [1.5, -14]], C.cloth, 1);
      belt(c, trim);
      break;
    }
    case 'robe': {
      shape(c, [[-6, -19.5], [6, -19.5], [9, 19], [-8, 19]], main);
      poly(c, [[-7, 12], [8.5, 12]], 1.4, trim);
      belt(c, trim);
      break;
    }
    case 'fatigues': {
      rrect(c, -6.5, -19.5, 13, 20, 4, main);
      // Pockets and webbing.
      rrect(c, 1, -17, 4, 4, 1, shade(main, 0.85), 1);
      poly(c, [[-5, -19], [5, -4]], 1.1, C.oliveB);
      belt(c, shade(main, 0.6));
      rrect(c, -5.5, -18.5, 3.5, 3, 0.8, team, 1);
      if (o.extra === 'pouches') {
        rrect(c, 2, -3, 3.5, 3, 0.8, C.oliveB, 1);
        rrect(c, -4, -3, 3.5, 3, 0.8, C.oliveB, 1);
      }
      break;
    }
    case 'vest': {
      rrect(c, -6.5, -19.5, 13, 20, 4, main);
      shape(c, [[-6, -18], [5.5, -18], [6, -2], [-6, -2]], trim);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillRect(-6, -11, 12, 1.4);
      c.fillRect(-6, -7, 12, 1.4);
      belt(c, C.black);
      break;
    }
    case 'suit': {
      rrect(c, -6.5, -19.5, 13, 21, 4, main);
      shape(c, [[-0.5, -19.5], [4.5, -19.5], [2, -9]], C.cloth, 1);
      poly(c, [[2, -18], [2, -12]], 1.2, team);
      poly(c, [[-0.5, -19], [2, -8], [5, -19]], 0.6, shade(main, 0.6));
      break;
    }
    case 'armor': {
      rrect(c, -7, -20, 14, 19, 5, C.white);
      rrect(c, -6, -3, 12, 5, 2, C.whiteB);
      c.fillStyle = team;
      c.fillRect(-5, -14, 10, 1.6);
      c.fillRect(-0.8, -18, 1.6, 12);
      glow(c, [0, -13], 4, team, 0.5);
      break;
    }
  }
}

function belt(c: Ctx, col: string): void {
  c.fillStyle = col;
  c.fillRect(-7.5, -5, 15, 2.4);
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
  c.strokeRect(-7.5, -5, 15, 2.4);
}

function drawHeldShield(c: Ctx, team: string): void {
  // A round shield held on the far arm, in front of the body.
  ellipse(c, -1, -11, 7.5, 8.5, 0, shade(team, 0.9));
  ellipse(c, -1, -11, 5, 6, 0, team, 1);
  dot(c, [-1, -11], 1.8, C.steel);
}

function drawHead(c: Ctx, o: Outfit, team: string, skin: string): void {
  const H: P2 = [2, -24];
  const fullHelm = o.head === 'greathelm' || o.head === 'visor';
  if (!fullHelm) dot(c, H, 6.5, skin);
  // Hair under hats.
  const hair = o.hairColor ?? C.hair;
  const style = o.hair ?? 'wild';
  const hat = o.head !== 'none' && o.head !== 'headband' && o.head !== 'headdress';
  if (!fullHelm) {
    if (style === 'wild' && !hat) {
      c.beginPath();
      c.arc(1.2, -25.5, 7, Math.PI * 0.8, Math.PI * 2.05);
      c.closePath();
      c.fillStyle = hair;
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
    } else if (style !== 'bald') {
      c.beginPath();
      c.arc(1.5, -25, 6.9, Math.PI * 0.85, Math.PI * 1.95);
      c.closePath();
      c.fillStyle = hair;
      c.fill();
      if (style === 'long') {
        c.beginPath();
        c.moveTo(-4, -26);
        c.quadraticCurveTo(-8, -20, -5, -15);
        c.lineTo(-2, -19);
        c.fill();
      }
    }
  }
  // Face (hidden behind full helmets).
  if (!fullHelm) {
    c.fillStyle = OUT;
    c.fillRect(4, -27, 5, 1.6);
    c.fillRect(5.5, -24.5, 1.6, 1.6);
    dot(c, [8.5, -22.5], 1.3, skin);
    if (o.facial === 'mustache') {
      c.fillStyle = hair;
      c.beginPath();
      c.ellipse(7.2, -20.6, 2.8, 1.1, -0.15, 0, Math.PI * 2);
      c.fill();
    } else if (o.facial === 'beard') {
      c.beginPath();
      c.moveTo(1, -22);
      c.quadraticCurveTo(3, -15, 8.5, -19.5);
      c.lineTo(8, -21);
      c.lineTo(3, -21);
      c.closePath();
      c.fillStyle = hair;
      c.fill();
    } else if (o.facial === 'goatee') {
      c.fillStyle = hair;
      c.fillRect(6.5, -19.8, 2.4, 2);
    }
  }
  drawHeadGear(c, o, team);
}

function drawHeadGear(c: Ctx, o: Outfit, team: string): void {
  switch (o.head) {
    case 'none':
      return;
    case 'headband':
      c.fillStyle = team;
      c.fillRect(-4.5, -29, 12, 2.2);
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.strokeRect(-4.5, -29, 12, 2.2);
      ellipse(c, -6, -33, 1.6, 4.5, -0.5, C.bone);
      return;
    case 'headdress':
      for (const [x, a] of [[-4, -0.5], [0, -0.1], [4, 0.3]] as const) {
        c.save();
        c.translate(x, -31);
        c.rotate(a);
        ellipse(c, 0, -5, 1.8, 5.5, 0, C.bone);
        c.fillStyle = team;
        c.fillRect(-1.6, -10.5, 3.2, 3);
        c.restore();
      }
      c.fillStyle = team;
      c.fillRect(5, -24.5, 3.5, 1.2);
      c.fillRect(5, -22.5, 3.5, 1.2);
      return;
    case 'nasal': {
      // Conical steel cap with a nose guard.
      shape(c, [[-5, -26], [-3, -31], [2, -33.5], [7, -31], [9, -26]], C.steel);
      rrect(c, -5.5, -27.5, 15, 2.6, 1, C.steelB, 1.2);
      rrect(c, 7.3, -27, 1.8, 6, 0.8, C.steelB, 1);
      return;
    }
    case 'hood': {
      c.beginPath();
      c.moveTo(8.5, -25);
      c.quadraticCurveTo(8, -33, 1, -32.5);
      c.quadraticCurveTo(-6, -32, -9, -24);
      c.lineTo(-11, -18);
      c.lineTo(-4, -20);
      c.quadraticCurveTo(-4, -24, 4, -28);
      c.quadraticCurveTo(6.5, -27, 8.5, -25);
      c.closePath();
      c.fillStyle = shade(team, 0.55);
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      return;
    }
    case 'greathelm': {
      rrect(c, -5, -32.5, 14, 16, 3, C.steel);
      c.fillStyle = OUT;
      c.fillRect(3, -26.5, 6, 1.8);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.fillRect(-3.5, -31, 2, 12);
      for (let i = 0; i < 3; i++) dot(c, [6.5, -22 + i * 1.8], 0.4, OUT);
      // Plume.
      c.beginPath();
      c.moveTo(1, -32);
      c.quadraticCurveTo(-4, -41, -10, -36);
      c.quadraticCurveTo(-5, -35, 0, -31);
      c.fillStyle = team;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      return;
    }
    case 'morion': {
      // Brim sweeping up at both ends, domed crown, a comb on top.
      c.beginPath();
      c.moveTo(-8, -30);
      c.quadraticCurveTo(2, -25, 12, -30);
      c.quadraticCurveTo(2, -27.5, -8, -30);
      c.fillStyle = C.steel;
      c.fill();
      c.lineWidth = 1.3;
      c.strokeStyle = OUT;
      c.stroke();
      shape(c, [[-4, -28], [-3, -32.5], [2, -34], [7, -32.5], [8, -28]], C.steel);
      c.beginPath();
      c.moveTo(-2.5, -32.5);
      c.quadraticCurveTo(2, -40, 6.5, -32.5);
      c.closePath();
      c.fillStyle = C.steelB;
      c.fill();
      c.stroke();
      return;
    }
    case 'cavalier': {
      // Wide brim, soft crown, a big team-colored feather.
      c.beginPath();
      c.moveTo(0, -32);
      c.quadraticCurveTo(-10, -40, -14, -31);
      c.quadraticCurveTo(-8, -33, -1, -30);
      c.fillStyle = team;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      rrect(c, -4, -35, 12, 7, 3, C.black);
      ellipse(c, 2, -28.5, 11.5, 2.2, -0.05, C.black);
      return;
    }
    case 'burgonet': {
      shape(c, [[-6, -24], [-5, -31], [2, -33.8], [8, -30], [9.5, -27], [4, -27]], C.steelB);
      // Neck guard lames and a cheek piece.
      for (let i = 0; i < 3; i++) rrect(c, -7.5 - i * 0.6, -25 + i * 2.2, 5, 2.2, 0.8, C.steel, 1);
      rrect(c, 0.5, -26, 3.5, 6, 1.2, C.steel, 1);
      dot(c, [2, -34], 1.4, team);
      return;
    }
    case 'beret': {
      ellipse(c, 0, -30.5, 8.5, 3.8, -0.15, '#8e2a2a');
      c.fillStyle = C.gold;
      c.fillRect(4.5, -30, 2, 1.8);
      return;
    }
    case 'cowl': {
      c.beginPath();
      c.moveTo(8.5, -24);
      c.quadraticCurveTo(9, -33, 0, -33);
      c.lineTo(-7, -39);
      c.lineTo(-7.5, -28);
      c.quadraticCurveTo(-9, -21, -8, -17);
      c.lineTo(-3.5, -19);
      c.quadraticCurveTo(-3, -26, 5, -28);
      c.closePath();
      c.fillStyle = '#4b3a63';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      // Goggles on the forehead.
      dot(c, [5.5, -28.3], 2, C.glass);
      dot(c, [2, -28.8], 2, C.glass);
      return;
    }
    case 'm1': {
      c.beginPath();
      c.arc(1.8, -26, 7.8, Math.PI * 1.02, Math.PI * 1.98);
      c.closePath();
      c.fillStyle = C.olive;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      rrect(c, -7, -27, 17.5, 2.2, 1, C.oliveB, 1.2);
      poly(c, [[7.5, -25], [6, -19]], 0.5, C.black);
      c.fillStyle = team;
      c.fillRect(-3, -31, 4, 3);
      return;
    }
    case 'boonie': {
      ellipse(c, 2, -28, 11, 2.4, 0.05, C.oliveB);
      rrect(c, -4, -34, 12, 6.5, 3, C.olive);
      c.fillStyle = '#4f5a2a';
      for (const [x, y] of [[-2, -32], [3, -31], [6, -33]] as const) c.fillRect(x, y, 2, 1.2);
      return;
    }
    case 'hardhat': {
      c.beginPath();
      c.arc(1.8, -27, 7.5, Math.PI, Math.PI * 2);
      c.closePath();
      c.fillStyle = '#f2c230';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      rrect(c, -6.5, -28, 17.5, 2.2, 1, '#d9a81f', 1.2);
      poly(c, [[1.8, -34], [1.8, -28.5]], 0.8, '#d9a81f');
      return;
    }
    case 'peaked': {
      rrect(c, -5, -34, 14, 5.5, 2.5, C.olive);
      c.fillStyle = team;
      c.fillRect(-4.5, -30.2, 13, 1.8);
      shape(c, [[4, -29], [12, -28.5], [11, -27], [4, -27.5]], C.black, 1.2);
      dot(c, [4.8, -32], 1.3, C.gold);
      return;
    }
    case 'visor': {
      c.beginPath();
      c.arc(2, -25, 7.8, 0, Math.PI * 2);
      c.fillStyle = C.white;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = OUT;
      c.stroke();
      c.fillStyle = C.whiteB;
      c.beginPath();
      c.arc(2, -25, 7.8, Math.PI * 0.35, Math.PI * 0.95);
      c.fill();
      rrect(c, 2.5, -28.5, 7.5, 3.8, 1.8, '#1d2a3a', 1.2);
      glow(c, [7, -26.6], 4, team, 0.9);
      c.fillStyle = team;
      c.fillRect(3.5, -27.3, 5.8, 1.2);
      return;
    }
  }
}

/** One-handed weapons and carried items, along the forearm angle `ta`. */
function drawOneHanded(c: Ctx, o: Outfit, team: string, P: Pose, h: P2, ta: number, fa: number): void {
  switch (o.weapon) {
    case 'club':
      poly(c, [pt(h, ta, -3), pt(h, ta, 7)], 3, C.wood);
      poly(c, [pt(h, ta, 7), pt(h, ta, 16)], 7, C.wood);
      dot(c, pt(h, ta, 12), 1, C.woodB);
      if (P.fx) star(c, pt(h, ta, 18), P.fx);
      return;
    case 'sword':
    case 'sabre': {
      poly(c, [pt(h, ta, -3), pt(h, ta, 1.5)], 2.4, C.leather);
      bar(c, pt(pt(h, ta, 1.8), ta + Math.PI / 2, 3.2), pt(pt(h, ta, 1.8), ta - Math.PI / 2, 3.2), 1.6, C.gold);
      const tip = pt(h, ta, o.weapon === 'sabre' ? 16 : 17);
      c.beginPath();
      const s = pt(h, ta, 2.2);
      const n = ta + Math.PI / 2;
      c.moveTo(...pt(s, n, 1.3));
      c.lineTo(...(o.weapon === 'sabre' ? pt(tip, n, 1.5) : tip));
      c.lineTo(...pt(tip, n, -1));
      c.lineTo(...pt(s, n, -1.3));
      c.closePath();
      c.fillStyle = C.steel;
      c.fill();
      c.lineWidth = 1.2;
      c.strokeStyle = OUT;
      c.stroke();
      if (P.fx) star(c, pt(h, ta, 18), P.fx);
      return;
    }
    case 'blade': {
      // Energy blade: a dark hilt and a glowing beam.
      poly(c, [pt(h, ta, -3), pt(h, ta, 2)], 2.6, C.iron);
      const s = pt(h, ta, 2.5);
      const e = pt(h, ta, 19);
      glow(c, pt(h, ta, 11), 9 + P.fx * 6, team, 0.35 + 0.3 * P.fx);
      c.lineCap = 'round';
      c.lineWidth = 3.8;
      c.strokeStyle = team;
      c.beginPath();
      c.moveTo(...s);
      c.lineTo(...e);
      c.stroke();
      c.lineWidth = 1.6;
      c.strokeStyle = '#ffffff';
      c.stroke();
      if (P.fx) star(c, pt(h, ta, 20), P.fx, '200,255,255');
      return;
    }
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
      return;
    }
    case 'spear': {
      poly(c, [pt(h, ta, -12), pt(h, ta, 16)], 2.2, C.wood);
      spearTip(c, pt(h, ta, 16), ta, C.stone);
      if (P.fx) star(c, pt(h, ta, 20), P.fx);
      return;
    }
    case 'stick':
      poly(c, [pt(h, 0.1, -8), pt(h, 0.1, 12)], 2, C.wood);
      return;
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
      return;
    }
    case 'flask': {
      // A bubbling flask held up by the neck.
      const f = pt(h, fa + Math.PI, 3.5);
      glow(c, f, 6 + P.glow * 10, C.plasma, 0.35 + 0.5 * P.glow);
      poly(c, [h, pt(h, fa + Math.PI, 2)], 1.6, C.glass);
      dot(c, f, 3.4, '#c9a4ff');
      c.fillStyle = C.plasma;
      c.beginPath();
      c.arc(f[0], f[1] + 0.8, 2.4, 0, Math.PI);
      c.fill();
      if (P.glow > 0.2) {
        for (let i = 0; i < 3; i++) dot(c, [f[0] - 2 + i * 2, f[1] - 5 - i * 2 * P.glow], 0.9 + P.glow * 0.8, '#d9c2ff');
      }
      return;
    }
    case 'pistol': {
      rrect(c, h[0] - 1, h[1] - 3.2, 7.5, 2.4, 0.8, C.iron, 1.1);
      rrect(c, h[0] - 1.5, h[1] - 1.5, 2.4, 4, 0.8, C.leatherB, 1);
      if (P.glow > 0.3) {
        // Shout lines while giving orders.
        c.strokeStyle = rgba(C.gold, P.glow);
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const a = -0.5 + i * 0.5;
          c.beginPath();
          c.moveTo(12 + Math.cos(a) * 3, -22 + Math.sin(a) * 3);
          c.lineTo(12 + Math.cos(a) * 7, -22 + Math.sin(a) * 7);
          c.stroke();
        }
      }
      return;
    }
    case 'ledger':
      c.save();
      c.translate(h[0], h[1] - 2);
      c.rotate(-0.25);
      rrect(c, -3, -5, 8, 10, 1, '#5a2a2a');
      c.fillStyle = C.gold;
      c.fillRect(-1.5, -3, 5, 1);
      c.restore();
      poly(c, [pt(h, 2.7, -2), pt(h, 2.7, 7)], 0.9, C.bone);
      return;
    case 'clipboard':
      c.save();
      c.translate(h[0] + 1, h[1] - 3);
      c.rotate(0.2);
      rrect(c, -3.5, -5, 7, 9, 1, '#9b7a4a');
      c.fillStyle = C.cloth;
      c.fillRect(-2.5, -3.5, 5, 6.5);
      c.fillStyle = OUT;
      for (let i = 0; i < 3; i++) c.fillRect(-1.8, -2.4 + i * 2, 3.6, 0.6);
      c.fillStyle = C.iron;
      c.fillRect(-1.5, -5.6, 3, 1.4);
      c.restore();
      return;
    case 'chest':
      rrect(c, h[0] - 4, h[1] - 7, 10, 7, 1.5, C.wood);
      rrect(c, h[0] - 4, h[1] - 8.5, 10, 3, 1.5, C.woodB, 1.2);
      dot(c, [h[0] + 1, h[1] - 4.5], 1.1, C.gold);
      return;
    default:
      return;
  }
}

function spearTip(c: Ctx, tip: P2, ta: number, col: string): void {
  const a1 = pt(tip, ta + 0.5, -4);
  const a2 = pt(tip, ta - 0.5, -4);
  const t2 = pt(tip, ta, 4);
  shape(c, [a1, t2, a2], col);
}

/** Pikes, lances and guns: held at `P.grip`, pointing along `P.ga`. */
function drawTwoHanded(c: Ctx, o: Outfit, team: string, P: Pose): void {
  const G = P.grip;
  const a = P.ga;
  switch (o.weapon) {
    case 'pike': {
      poly(c, [pt(G, a, -18), pt(G, a, 30)], 2, C.wood);
      spearTip(c, pt(G, a, 30), a, C.steel);
      if (P.fx) star(c, pt(G, a, 34), P.fx);
      return;
    }
    case 'lance': {
      poly(c, [pt(G, a, -10), pt(G, a, 32)], 2.6, C.cloth);
      // Vamplate and a pennant in the team color.
      shape(c, [pt(pt(G, a, 1), a + Math.PI / 2, 3), pt(G, a, 5), pt(pt(G, a, 1), a - Math.PI / 2, 3)], C.steel, 1);
      const p0 = pt(G, a, 22);
      const p1 = pt(G, a, 28);
      const fl = pt(pt(G, a, 24), a + Math.PI / 2 + 0.3, 6);
      shape(c, [p0, p1, fl], team, 1);
      spearTip(c, pt(G, a, 32), a, C.steel);
      if (P.fx) star(c, pt(G, a, 36), P.fx);
      return;
    }
    case 'rifle': {
      gunBody(c, G, a, 16, C.wood, C.iron);
      // Bayonet.
      bar(c, pt(G, a, 16), pt(G, a, 23), 1.3, C.steel);
      if (P.fx) star(c, pt(G, a, 25), P.fx);
      return;
    }
    case 'musket': {
      gunBody(c, G, a, 22, C.wood, C.iron);
      const muzzle = pt(G, a, 22.5);
      muzzleFlash(c, muzzle, a, 5, P.flash);
      if (P.smoke > 0) smoke(c, pt(muzzle, a, 5), 5.5, P.smoke);
      return;
    }
    case 'sniper': {
      gunBody(c, G, a, 22, '#4f4a3a', C.iron);
      // Scope, above the barrel.
      const s0 = pt(pt(G, a, 3), a + Math.PI / 2, 2.8);
      const s1 = pt(pt(G, a, 10), a + Math.PI / 2, 2.8);
      poly(c, [s0, s1], 2.2, C.black);
      dot(c, s1, 1.2, C.glass);
      const muzzle = pt(G, a, 22.5);
      muzzleFlash(c, muzzle, a, 3, P.flash);
      if (P.smoke > 0) smoke(c, pt(muzzle, a, 3), 2.5, P.smoke);
      return;
    }
    case 'laser': {
      gunBody(c, G, a, 17, '#3a4658', '#252d3a');
      // Glowing power cells along the barrel.
      for (let i = 0; i < 3; i++) dot(c, pt(pt(G, a, 5 + i * 3.2), a + Math.PI / 2, 1.4), 1.1, team);
      glow(c, pt(G, a, 8), 6, team, 0.35);
      const muzzle = pt(G, a, 17.5);
      glow(c, muzzle, 3 + P.flash * 8, team, 0.5 + 0.5 * P.flash);
      if (P.flash > 0) dot(c, muzzle, 1.5 + P.flash * 1.5, '#ffffff');
      return;
    }
    default:
      return;
  }
}

function gunBody(c: Ctx, G: P2, a: number, length: number, stock: string, metal: string): void {
  // Stock behind the grip, barrel forward.
  const butt = pt(G, a, -8);
  const buttLow = pt(butt, a - Math.PI / 2, 2.2);
  const gripLow = pt(G, a - Math.PI / 2, 1.2);
  shape(c, [pt(butt, a + Math.PI / 2, 1), pt(G, a + Math.PI / 2, 1), gripLow, buttLow], stock, 1.2);
  bar(c, pt(G, a, -1), pt(G, a, length * 0.62), 2.6, stock);
  bar(c, pt(G, a, 1), pt(G, a, length), 1.5, metal);
}

function drawBow(c: Ctx, P: Pose): void {
  const h = bowHand(P);
  const top: P2 = [h[0] - 2, h[1] - 13];
  const bot: P2 = [h[0] - 2, h[1] + 13];
  const nock: P2 = [h[0] - 3 + lerp(0, -12, P.draw), h[1] + 1];
  // String.
  c.strokeStyle = '#e8e0cc';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(...top);
  c.lineTo(...nock);
  c.lineTo(...bot);
  c.stroke();
  // Stave.
  c.beginPath();
  c.moveTo(...top);
  c.quadraticCurveTo(h[0] + 6 - P.draw * 2, h[1], bot[0], bot[1]);
  c.lineCap = 'round';
  c.lineWidth = 4.2;
  c.strokeStyle = OUT;
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = C.wood;
  c.stroke();
  if (P.nocked) {
    const tip: P2 = [nock[0] + 20, nock[1]];
    poly(c, [nock, tip], 0.9, C.wood);
    shape(c, [[tip[0], tip[1] - 1.5], [tip[0] + 3, tip[1]], [tip[0], tip[1] + 1.5]], C.steel, 0.8);
    shape(c, [[nock[0], nock[1]], [nock[0] + 3, nock[1] - 1.8], [nock[0] + 4, nock[1]]], C.cloth, 0.6);
  }
}

/** Standing / walking pose adjusted for what the figure carries. */
export function carryPose(o: Outfit, anim: RigAnim, u: number): Pose {
  const P = basePose(anim, u);
  switch (o.weapon) {
    case 'stick':
    case 'chest':
    case 'ledger':
    case 'clipboard':
      P.fa = 0.5; P.fe = 0.4;
      if (o.weapon === 'chest') { P.fa = 0.9; P.fe = 1.3; }
      if (o.weapon === 'ledger' || o.weapon === 'clipboard') { P.fa = 0.55; P.fe = 1.3; }
      break;
    case 'staff':
    case 'flask':
      P.tool = 1.9;
      if (o.weapon === 'flask') { P.fa = 0.7; P.fe = 1.1; }
      break;
    case 'sword':
    case 'sabre':
    case 'blade':
      P.tool = 1.6; P.fa = 0.4; P.fe = 1.1;
      break;
    case 'pike':
      // Carried upright.
      P.grip = [3, -12]; P.ga = Math.PI * 0.93;
      break;
    case 'lance':
      P.grip = [5, -9]; P.ga = Math.PI * 0.8;
      break;
    case 'musket':
    case 'rifle':
    case 'sniper':
    case 'laser':
      // Port arms.
      P.grip = [3 + (anim === 'walk' ? Math.sin(u * Math.PI * 2) * 0.5 : 0), -11]; P.ga = Math.PI * 0.78;
      break;
    case 'pistol':
      P.fa = 0.25; P.fe = 0.5;
      break;
    default:
      break;
  }
  return P;
}

/** Falls over backwards and fades (every foot soldier's death). */
export function applyDeath(c: Ctx, P: Pose, u: number): void {
  const fall = ease(clamp01(u / 0.55));
  // Lands on its back: lifted a little so the body lies on the ground, not in it.
  c.translate(fall * 3, -fall * 6);
  c.rotate(-fall * 1.45);
  c.globalAlpha = u > 0.55 ? Math.max(0, 1 - (u - 0.55) / 0.45) : 1;
  P.fa = lerp(P.fa, 2.4, fall);
  P.ba = lerp(P.ba, 2.0, fall);
  P.ga = lerp(P.ga, Math.PI * 1.1, fall);
  P.kneel = 0;
}

/** Full figure frame: pose for the animation, shadow, figure. */
export function drawFigureFrame(c: Ctx, o: Outfit, team: string, anim: RigAnim, u: number): void {
  const P = anim === 'attack' ? attackPose(o.weapon, u) : carryPose(o, anim === 'die' ? 'stand' : anim, u);
  if (anim === 'die') applyDeath(c, P, u);
  if (anim === 'attack' && WEAPON_STYLE[o.weapon] === 'none') Object.assign(P, carryPose(o, 'stand', 0));
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.beginPath();
  c.ellipse(0, 0, 12, 2.5, 0, 0, Math.PI * 2);
  c.fill();
  drawFigure(c, o, team, P);
  c.globalAlpha = 1;
}

/** For mounted riders: a figure pose for the given animation. */
export function riderPose(o: Outfit, anim: RigAnim, u: number): Pose {
  if (anim === 'attack') return attackPose(o.weapon, u);
  const P = carryPose(o, 'stand', 0);
  P.bob = 0;
  if (o.weapon === 'spear') { P.fa = 0.9; P.fe = 0.9; P.tool = 0.7; }
  return P;
}

/** Whether a weapon's attack has a muzzle / spark we might show in the lab. */
export function weaponStyle(w: Weapon): AttackStyle {
  return WEAPON_STYLE[w];
}

/** Used by crews: a figure leaning forward, pushing with both arms. */
export function pushPose(anim: RigAnim, u: number): Pose {
  const P = basePose(anim === 'walk' ? 'walk' : 'stand', u);
  P.lean = 0.35;
  P.fa = 1.35; P.fe = 0.25;
  P.ba = 1.2; P.be = 0.35;
  return P;
}

export const TEAM_NEUTRAL = '#888888';
export { glow };
