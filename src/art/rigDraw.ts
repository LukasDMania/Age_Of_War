/**
 * Code-drawn "rig" characters (owner's chosen art style, 2026-09-26; first
 * shown in `docs/art/rig-demo.html`). Every foot soldier is the shared
 * figure from `rigFigure.ts` in an age's outfit; mounts are in
 * `rigMounts.ts`, vehicles and drones in `rigMachines.ts`.
 *
 * Coordinates are "rig units": feet at y = 0, up is negative y, the figure
 * faces right (+x). `utils/RigArt.ts` renders these into sprite sheets.
 * Pure canvas drawing; no Phaser here.
 */
import { drawFigureFrame, type Outfit, type RigAnim } from '@/art/rigFigure';
import { C } from '@/art/rigKit';
import { drawCatapult, drawDrone, drawMech, drawTank } from '@/art/rigMachines';
import { drawHorse, drawMammoth, type HorseStyle } from '@/art/rigMounts';

export type { RigAnim };

export type RigKind =
  // Stone
  | 'clubber'
  | 'slinger'
  | 'mammoth-rider'
  | 'trader'
  | 'shaman'
  // Castle
  | 'swordsman'
  | 'archer'
  | 'knight'
  | 'merchant'
  | 'catapult-crew'
  // Renaissance
  | 'pikeman'
  | 'musketeer'
  | 'cuirassier'
  | 'banker'
  | 'alchemist'
  // Modern
  | 'rifleman'
  | 'sniper'
  | 'tank'
  | 'contractor'
  | 'officer'
  // Future
  | 'blade-trooper'
  | 'laser-gunner'
  | 'mech'
  | 'broker-drone'
  | 'shield-drone';

/** Outfits of every foot figure. `'team'` colors come from the side. */
const OUTFITS: Partial<Record<RigKind, Outfit>> = {
  // Stone: bare skin, hide tunics, team belts and headbands.
  clubber: { torso: 'tunic', color: '#8b5a2b', head: 'none', weapon: 'club' },
  slinger: { torso: 'tunic', color: '#b08452', head: 'headband', weapon: 'sling' },
  trader: { torso: 'tunic', color: '#9c7a3c', head: 'none', weapon: 'stick', extra: 'sack' },
  shaman: { torso: 'tunic', color: '#5e4a6e', head: 'headdress', weapon: 'staff' },

  // Castle: mail and tabards, hoods, a rich merchant.
  swordsman: {
    torso: 'mail', color: C.steelB, sleeves: C.steelB, legs: '#6a5a48', boots: C.leatherB,
    head: 'nasal', hair: 'short', facial: 'beard', weapon: 'sword', extra: 'shield',
  },
  archer: {
    torso: 'jerkin', color: '#4f6b3a', sleeves: '#4f6b3a', legs: '#5a4a34', boots: C.leatherB,
    head: 'hood', weapon: 'bow', extra: 'quiver', skin: '#c08a5a',
  },
  merchant: {
    torso: 'coat', color: '#7a2f45', trim: C.gold, sleeves: '#7a2f45', legs: '#4a3a2a', boots: C.leatherB,
    head: 'beret', hair: 'short', facial: 'beard', weapon: 'chest', extra: 'moneybag', skin: '#c9935e',
  },

  // Renaissance: slashed doublets in the team color, cavalier hats, robes.
  pikeman: {
    torso: 'doublet', color: 'team', trim: '#efe3c4', sleeves: 'team', legs: '#efe3c4', boots: C.black,
    head: 'morion', hair: 'short', facial: 'mustache', weapon: 'pike', skin: '#c08a5a',
  },
  musketeer: {
    torso: 'coat', color: '#6a4e32', trim: 'team', sleeves: '#6a4e32', legs: '#3a3040', boots: C.black,
    head: 'cavalier', hair: 'long', facial: 'goatee', weapon: 'musket', skin: '#e8b88a',
  },
  banker: {
    torso: 'robe', color: '#2a2a38', trim: C.gold, sleeves: '#2a2a38', legs: '#2a2a38', boots: C.black,
    head: 'beret', hair: 'short', weapon: 'ledger', extra: 'moneybag', skin: '#e8b88a',
  },
  alchemist: {
    torso: 'robe', color: '#4b3a63', trim: '#b89a4a', sleeves: '#4b3a63', legs: '#4b3a63', boots: C.black,
    head: 'cowl', hair: 'short', hairColor: '#cfc8bb', facial: 'beard', weapon: 'flask',
  },

  // Modern: olive fatigues, a contractor in hi-vis, an officer.
  rifleman: {
    torso: 'fatigues', color: C.olive, sleeves: C.olive, legs: C.oliveB, boots: C.black,
    head: 'm1', hair: 'short', weapon: 'rifle', extra: 'pouches', skin: '#a8764a',
  },
  sniper: {
    torso: 'fatigues', color: '#7d7c52', sleeves: '#7d7c52', legs: '#5f5e3c', boots: C.black,
    head: 'boonie', hair: 'short', weapon: 'sniper', extra: 'pack',
  },
  contractor: {
    torso: 'vest', color: '#5a6a8a', trim: '#f28c2c', sleeves: '#5a6a8a', legs: '#3a4a6a', boots: '#6a4a2a',
    head: 'hardhat', hair: 'short', facial: 'mustache', weapon: 'clipboard', skin: '#8a5a3a',
  },
  officer: {
    torso: 'coat', color: C.olive, trim: C.gold, sleeves: C.olive, legs: C.oliveB, boots: C.black,
    head: 'peaked', hair: 'short', facial: 'mustache', weapon: 'pistol', skin: '#e8b88a',
  },

  // Future: white armor with glowing team lines.
  'blade-trooper': {
    torso: 'armor', color: C.white, sleeves: C.whiteB, legs: C.white, boots: '#3a4a5a', gloves: '#3a4a5a',
    head: 'visor', weapon: 'blade', extra: 'jetpack',
  },
  'laser-gunner': {
    torso: 'armor', color: C.white, sleeves: C.whiteB, legs: C.white, boots: '#3a4a5a', gloves: '#3a4a5a',
    head: 'visor', weapon: 'laser', extra: 'jetpack',
  },
};

const HORSES: Partial<Record<RigKind, HorseStyle>> = {
  knight: {
    coat: '#e8e2d6',
    mane: '#b8ad9a',
    caparison: true,
    chanfron: true,
    attack: 'lunge',
    rider: {
      torso: 'plate', color: C.steel, sleeves: C.steel, legs: C.steelB, boots: C.steelD,
      head: 'greathelm', weapon: 'lance', seated: true,
    },
  },
  cuirassier: {
    coat: '#5a3a22',
    mane: '#1e1410',
    caparison: false,
    chanfron: false,
    attack: 'rear',
    rider: {
      torso: 'plate', color: C.steel, sleeves: '#e3d3a8', legs: '#e3d3a8', boots: C.black,
      head: 'burgonet', facial: 'mustache', weapon: 'sabre', seated: true, skin: '#e8b88a',
    },
  },
};

/**
 * Draws one frame. `u` is the phase through the animation, 0..1.
 * The canvas must already be translated to the feet and scaled to rig units.
 */
export function drawRig(c: CanvasRenderingContext2D, kind: RigKind, team: string, anim: RigAnim, u: number): void {
  c.save();
  switch (kind) {
    case 'mammoth-rider':
      drawMammoth(c, team, anim, u);
      break;
    case 'knight':
    case 'cuirassier':
      drawHorse(c, team, anim, u, HORSES[kind]!);
      break;
    case 'catapult-crew':
      drawCatapult(c, team, anim, u);
      break;
    case 'tank':
      drawTank(c, team, anim, u);
      break;
    case 'mech':
      drawMech(c, team, anim, u);
      break;
    case 'broker-drone':
      drawDrone(c, team, anim, u, 'broker');
      break;
    case 'shield-drone':
      drawDrone(c, team, anim, u, 'shield');
      break;
    default: {
      const outfit = OUTFITS[kind];
      if (outfit) drawFigureFrame(c, outfit, team, anim, u);
    }
  }
  c.restore();
  c.globalAlpha = 1;
}

/** Every rig kind, for the art lab and checks. */
export const RIG_KINDS: readonly RigKind[] = [
  'clubber', 'slinger', 'mammoth-rider', 'trader', 'shaman',
  'swordsman', 'archer', 'knight', 'merchant', 'catapult-crew',
  'pikeman', 'musketeer', 'cuirassier', 'banker', 'alchemist',
  'rifleman', 'sniper', 'tank', 'contractor', 'officer',
  'blade-trooper', 'laser-gunner', 'mech', 'broker-drone', 'shield-drone',
];
