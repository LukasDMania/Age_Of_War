/**
 * Projectiles and effect particles in the rig style (owner, 2026-09-26:
 * "flesh out the projectile art and other effects art"). Projectiles are
 * drawn centered in their box facing right (the game rotates or mirrors
 * them). Particle textures are drawn white or light so they can be tinted.
 * Units: px at scale 1.
 */
import { C, dot, ellipse, glow, OUT, poly, rgba, rrect, shape, type Ctx, type P2 } from '@/art/rigKit';

/** Drawn size of each projectile, px (the texture is this times the supersample). */
export const PROJECTILE_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  'proj-stone': [11, 11],
  'proj-spear': [32, 8],
  'proj-boulder': [20, 20],
  'proj-fire': [18, 20],
  'proj-meteor': [48, 24],
  'proj-arrow': [26, 6],
  'proj-bolt': [20, 6],
  'proj-ballista': [38, 9],
  'proj-oil': [16, 16],
  'proj-bullet': [14, 5],
  'proj-cannonball': [15, 15],
  'proj-mortar': [16, 18],
  'proj-shell': [18, 8],
  'proj-grenade': [12, 13],
  'proj-laser': [30, 6],
  'proj-rail': [44, 8],
  'proj-plasma': [18, 18],
  'proj-bomb': [26, 12],
  'proj-orbital': [56, 12],
};

function arrowHead(c: Ctx, tip: P2, len: number, half: number, col: string): void {
  shape(c, [[tip[0] - len, tip[1] - half], tip, [tip[0] - len, tip[1] + half], [tip[0] - len * 0.7, tip[1]]], col, 1.1);
}

function fletch(c: Ctx, x: number, half: number, col: string): void {
  shape(c, [[x, 0], [x - 5, -half], [x - 2, 0], [x - 5, half]], col, 0.9);
}

function rock(c: Ctx, r: number, col: string): void {
  const pts: P2[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rr = r * (0.82 + ((i * 37) % 10) / 55);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  shape(c, pts, col, 1.3);
  c.fillStyle = 'rgba(255,255,255,0.3)';
  c.beginPath();
  c.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgba(OUT, 0.35);
  c.beginPath();
  c.arc(r * 0.25, r * 0.2, r * 0.18, 0, Math.PI * 2);
  c.fill();
}

/** Draws projectile `key` centered at (0, 0) facing right. */
export function drawProjectile(c: Ctx, key: string): void {
  switch (key) {
    case 'proj-stone':
      rock(c, 4.2, C.stone);
      return;
    case 'proj-boulder':
      rock(c, 8.2, C.stoneB);
      c.strokeStyle = rgba(OUT, 0.5);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(-3, -5);
      c.lineTo(0, -1);
      c.lineTo(-1, 3);
      c.stroke();
      return;
    case 'proj-spear':
      poly(c, [[-14, 0], [9, 0]], 1.8, C.wood);
      arrowHead(c, [15, 0], 7, 2.6, C.stone);
      fletch(c, -10, 3, '#e8e0cc');
      return;
    case 'proj-arrow':
      poly(c, [[-11, 0], [7, 0]], 1, C.wood);
      arrowHead(c, [12, 0], 4.5, 1.8, C.steel);
      fletch(c, -7, 2.2, '#e0e0e0');
      return;
    case 'proj-bolt':
      poly(c, [[-8, 0], [5, 0]], 1.4, C.woodB);
      arrowHead(c, [9, 0], 4, 2, C.steelB);
      fletch(c, -5, 2, '#b04040');
      return;
    case 'proj-ballista':
      poly(c, [[-17, 0], [11, 0]], 2.6, C.wood);
      arrowHead(c, [18, 0], 8, 3.4, C.steel);
      fletch(c, -12, 3.6, '#e8e0cc');
      return;
    case 'proj-fire':
      glow(c, [0, 1], 10, C.fire, 0.8);
      ellipse(c, 0, 3, 5.5, 5, 0, '#a0522d');
      rrect(c, -3, -3, 6, 2.5, 1, '#7a3e22', 1);
      shape(c, [[-3.5, -3], [0, -9.5], [3.5, -3]], C.fire, 1);
      shape(c, [[-1.8, -3], [0, -6.5], [1.8, -3]], C.fireB, 0.8);
      return;
    case 'proj-meteor':
      // Flaming rock, tail to the left.
      glow(c, [8, 0], 14, C.fire, 0.7);
      c.fillStyle = rgba(C.fire, 0.75);
      c.beginPath();
      c.moveTo(-23, 0);
      c.quadraticCurveTo(0, -11, 12, -7);
      c.lineTo(12, 7);
      c.quadraticCurveTo(0, 11, -23, 0);
      c.fill();
      c.fillStyle = rgba(C.fireB, 0.85);
      c.beginPath();
      c.moveTo(-12, 0);
      c.quadraticCurveTo(2, -6, 12, -4);
      c.lineTo(12, 4);
      c.quadraticCurveTo(2, 6, -12, 0);
      c.fill();
      c.save();
      c.translate(13, 0);
      rock(c, 7.5, '#6a3a22');
      c.restore();
      return;
    case 'proj-oil':
      glow(c, [0, 0], 8, '#8a6a3a', 0.4);
      shape(c, [[-6, -1], [-2, -6], [5, -5], [7, 1], [3, 6], [-4, 5]], '#2b2418', 1.2);
      dot(c, [-1.5, -2.5], 1.2, '#c8b890');
      return;
    case 'proj-bullet':
      c.fillStyle = rgba('#fff2b0', 0.55);
      c.fillRect(-7, -0.8, 8, 1.6);
      rrect(c, 0, -1.6, 6.5, 3.2, 1.6, '#e0b050', 1);
      return;
    case 'proj-cannonball':
      dot(c, [0, 0], 6, '#2e2e30');
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.arc(-2, -2, 1.8, 0, Math.PI * 2);
      c.fill();
      return;
    case 'proj-mortar':
      dot(c, [0, 2], 6.2, '#3a3d42');
      rrect(c, -1.5, -6, 3, 3, 0.8, C.iron, 1);
      poly(c, [[0, -6], [2, -8]], 0.8, C.leather);
      glow(c, [2.5, -8.5], 3.5, C.fireB, 0.95);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(-2, 0, 1.6, 0, Math.PI * 2);
      c.fill();
      return;
    case 'proj-shell':
      rrect(c, -8, -2.8, 9, 5.6, 1, '#c09040', 1.2);
      shape(c, [[1, -2.8], [6, -1.5], [8, 0], [6, 1.5], [1, 2.8]], '#6b6b60', 1.2);
      c.fillStyle = OUT;
      c.fillRect(-2, -2.8, 0.8, 5.6);
      return;
    case 'proj-grenade':
      ellipse(c, 0, 1, 4.6, 5.2, 0, C.olive);
      c.strokeStyle = rgba(OUT, 0.6);
      c.lineWidth = 0.7;
      for (const y of [-1.5, 1, 3.5]) {
        c.beginPath();
        c.moveTo(-4, y);
        c.lineTo(4, y);
        c.stroke();
      }
      rrect(c, -1.8, -5.6, 3.6, 2.2, 0.6, C.iron, 1);
      return;
    case 'proj-laser':
      glow(c, [0, 0], 9, C.laser, 0.6);
      c.lineCap = 'round';
      c.strokeStyle = rgba(C.laser, 0.95);
      c.lineWidth = 3.2;
      c.beginPath();
      c.moveTo(-12, 0);
      c.lineTo(12, 0);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.2;
      c.stroke();
      return;
    case 'proj-rail':
      glow(c, [6, 0], 12, '#9fd8ff', 0.7);
      c.fillStyle = rgba('#9fd8ff', 0.5);
      c.beginPath();
      c.moveTo(-21, 0);
      c.lineTo(12, -3);
      c.lineTo(12, 3);
      c.closePath();
      c.fill();
      rrect(c, 4, -2.2, 14, 4.4, 2, '#e8f8ff', 1);
      return;
    case 'proj-plasma':
      glow(c, [0, 0], 9, C.plasma, 0.95);
      dot(c, [0, 0], 4.4, '#d9b8ff');
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(-1, -1, 1.8, 0, Math.PI * 2);
      c.fill();
      return;
    case 'proj-bomb':
      shape(c, [[-12, -4.5], [-8, -1.5], [-8, 1.5], [-12, 4.5]], '#4a4d52', 1.1);
      ellipse(c, 1, 0, 9, 4.2, 0, '#3a3d42');
      c.fillStyle = C.fireB;
      c.fillRect(-2, -4, 1.2, 8);
      return;
    case 'proj-orbital':
      glow(c, [6, 0], 16, '#e8f8ff', 0.8);
      c.fillStyle = rgba('#aef8ff', 0.6);
      c.beginPath();
      c.moveTo(-27, 0);
      c.lineTo(20, -4);
      c.lineTo(20, 4);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(14, 0, 9, 2.4, 0, 0, Math.PI * 2);
      c.fill();
      return;
    default:
      glow(c, [0, 0], 5, '#ffffff', 0.9);
      dot(c, [0, 0], 2.5, '#ffffff');
  }
}

/* ---- Particle textures ------------------------------------------------------ */

export type FxTextureId =
  | 'fx-soft'
  | 'fx-spark'
  | 'fx-streak'
  | 'fx-chunk'
  | 'fx-splinter'
  | 'fx-coin'
  | 'fx-ring'
  | 'fx-scorch'
  | 'fx-hex'
  | 'fx-plus'
  | 'fx-drop'
  | 'fx-puff';

export const FX_SIZE: Readonly<Record<FxTextureId, readonly [number, number]>> = {
  'fx-soft': [32, 32],
  'fx-spark': [14, 14],
  'fx-streak': [20, 4],
  'fx-chunk': [8, 8],
  'fx-splinter': [10, 4],
  'fx-coin': [10, 10],
  'fx-ring': [64, 64],
  'fx-scorch': [64, 22],
  'fx-hex': [34, 34],
  'fx-plus': [12, 12],
  'fx-drop': [6, 8],
  'fx-puff': [26, 26],
};

export function drawFx(c: Ctx, id: FxTextureId): void {
  switch (id) {
    case 'fx-soft':
      glow(c, [0, 0], 16, '#ffffff', 1);
      return;
    case 'fx-spark':
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -7);
      c.lineTo(1.4, -1.4);
      c.lineTo(7, 0);
      c.lineTo(1.4, 1.4);
      c.lineTo(0, 7);
      c.lineTo(-1.4, 1.4);
      c.lineTo(-7, 0);
      c.lineTo(-1.4, -1.4);
      c.closePath();
      c.fill();
      return;
    case 'fx-streak': {
      const g = c.createLinearGradient(-10, 0, 10, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, 0, 10, 1.6, 0, 0, Math.PI * 2);
      c.fill();
      return;
    }
    case 'fx-chunk':
      shape(c, [[-3.5, -1], [-1, -3.5], [3, -2.5], [3.5, 1.5], [0, 3.5], [-3, 2]], '#d8d0c4', 1);
      return;
    case 'fx-splinter':
      poly(c, [[-4, 0.5], [4, -0.5]], 1.4, '#c8a070');
      return;
    case 'fx-coin':
      dot(c, [0, 0], 4, C.gold);
      c.fillStyle = '#fff4c0';
      c.fillRect(-0.6, -2.4, 1.2, 4.8);
      return;
    case 'fx-ring':
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 29, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.4)';
      c.lineWidth = 6;
      c.stroke();
      return;
    case 'fx-scorch': {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
      g.addColorStop(0, 'rgba(20,14,10,0.75)');
      g.addColorStop(0.6, 'rgba(30,22,16,0.35)');
      g.addColorStop(1, 'rgba(30,22,16,0)');
      c.save();
      c.scale(1, 0.33);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 30, 0, Math.PI * 2);
      c.fill();
      c.restore();
      return;
    }
    case 'fx-hex':
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const x = Math.cos(a) * 15;
        const y = Math.sin(a) * 15;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fill();
      return;
    case 'fx-plus':
      c.fillStyle = '#ffffff';
      c.fillRect(-1.6, -5, 3.2, 10);
      c.fillRect(-5, -1.6, 10, 3.2);
      return;
    case 'fx-drop':
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -3.5);
      c.quadraticCurveTo(2.8, 1, 0, 3.5);
      c.quadraticCurveTo(-2.8, 1, 0, -3.5);
      c.fill();
      return;
    case 'fx-puff': {
      // A cartoon cloud puff: a few overlapping soft circles.
      for (const [x, y, r] of [[-4, 2, 7], [4, 2, 6.5], [0, -3, 7.5], [0, 3, 6]] as const) {
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }
  }
}
