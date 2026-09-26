/**
 * Buildings in the rig style (owner, 2026-09-26: "add sprites for all the
 * buildings that are a bit prettier like the units. Also have staged sprites
 * that go up every x levels for satisfaction").
 *
 * Every building has five stages, one per age tier of levels (1-5 Stone
 * look, 6-10 Castle, 11-15 Renaissance, 16-20 Modern, 21-25 Future), and
 * within a stage each level adds a small prop (`step` 0..4), so every
 * upgrade shows. Drawn in a 130 x 110 box with (0, 0) at the bottom center,
 * facing right; team colors on flags, awnings and lights.
 */
import type { BuildingId } from '@config/buildings.config';
import { C, dot, ellipse, glow, OUT, poly, rgba, rrect, shape, type Ctx } from '@/art/rigKit';

export const BUILDING_BOX = { w: 130, h: 110 } as const;

/* ---- Shared props ------------------------------------------------------------ */

function flag(c: Ctx, x: number, top: number, team: string, h = 20): void {
  poly(c, [[x, top + h], [x, top]], 1.4, C.woodB);
  shape(c, [[x, top], [x + 12, top + 3], [x, top + 7]], team, 1.2);
}

function nuggets(c: Ctx, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) dot(c, [x + (i % 3) * 4 - 4, y - Math.floor(i / 3) * 3.5], 2, C.gold);
}

function crate(c: Ctx, x: number, y: number, s = 9, col: string = C.wood): void {
  rrect(c, x - s / 2, y - s, s, s, 1, col, 1.2);
  poly(c, [[x - s / 2 + 1, y - s + 1], [x + s / 2 - 1, y - 1]], 0.6, C.woodB);
}

function barrel(c: Ctx, x: number, y: number): void {
  ellipse(c, x, y - 6, 4.5, 6, 0, C.wood);
  poly(c, [[x - 4.5, y - 8], [x + 4.5, y - 8]], 0.8, C.iron);
  poly(c, [[x - 4.5, y - 4], [x + 4.5, y - 4]], 0.8, C.iron);
}

function lantern(c: Ctx, x: number, y: number, col: string = C.fireB): void {
  glow(c, [x, y], 7, col, 0.6);
  rrect(c, x - 2, y - 3, 4, 5, 1, col, 1);
}

function smokePuffs(c: Ctx, x: number, y: number, n = 3, col = '#9a948c'): void {
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(x + i * 4 - 2, y - i * 6, 3 + i * 1.3, 0, Math.PI * 2);
    c.fillStyle = rgba(col, 0.55 - i * 0.12);
    c.fill();
  }
}

function window_(c: Ctx, x: number, y: number, w: number, h: number, lit = true): void {
  rrect(c, x, y, w, h, 1.5, lit ? '#f8d878' : '#3a4a5a', 1.2);
  poly(c, [[x + w / 2, y], [x + w / 2, y + h]], 0.6, OUT);
}

function arch(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.lineTo(x - w / 2, y - h + w / 2);
  c.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w / 2, y);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = OUT;
  c.stroke();
}

function brick(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  rrect(c, x, y, w, h, 2, col);
  c.strokeStyle = rgba(OUT, 0.25);
  c.lineWidth = 0.7;
  for (let yy = y + 5, r = 0; yy < y + h; yy += 5, r++) {
    c.beginPath();
    c.moveTo(x + 1, yy);
    c.lineTo(x + w - 1, yy);
    c.stroke();
    for (let xx = x + (r % 2 ? 4 : 8); xx < x + w; xx += 9) {
      c.beginPath();
      c.moveTo(xx, yy - 5);
      c.lineTo(xx, yy);
      c.stroke();
    }
  }
}

function ground(c: Ctx, w = 120, col = '#8a7050'): void {
  c.fillStyle = 'rgba(0,0,0,.2)';
  c.beginPath();
  c.ellipse(0, 0, w / 2, 4, 0, 0, Math.PI * 2);
  c.fill();
  rrect(c, -w / 2 + 6, -3, w - 12, 4, 2, col, 1.1);
}

/* ---- Mine ---------------------------------------------------------------------- */

function drawMine(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  switch (stage) {
    case 0: {
      // A rocky hill with a timbered cave mouth.
      shape(c, [[-58, 0], [-42, -44], [-18, -66], [10, -60], [34, -40], [56, 0]], '#7a6a58', 2);
      shape(c, [[-20, 0], [-4, -38], [22, -30], [40, 0]], '#8f7c66', 1.4);
      arch(c, 6, 0, 26, 32, '#1e1812');
      poly(c, [[-8, 0], [-8, -30]], 3.2, C.wood);
      poly(c, [[20, 0], [20, -30]], 3.2, C.wood);
      poly(c, [[-11, -30], [23, -30]], 3.2, C.wood);
      // Pickaxe leaning on the hill.
      poly(c, [[-32, -2], [-24, -22]], 1.6, C.wood);
      shape(c, [[-30, -22], [-24, -25], [-18, -20], [-24, -22]], C.stone, 1);
      nuggets(c, 36, -3, 2 + step * 2);
      if (step >= 1) lantern(c, 24, -34);
      if (step >= 2) poly(c, [[-44, -2], [-36, -2]], 2.5, C.leather);
      if (step >= 3) {
        rrect(c, 40, -12, 14, 8, 2, C.woodB);
        nuggets(c, 47, -12, 3);
      }
      if (step >= 4) flag(c, -10, -86, team);
      break;
    }
    case 1: {
      // A stone portal with a windlass and a cart on rails.
      shape(c, [[-60, 0], [-46, -48], [-12, -70], [22, -62], [50, -36], [60, 0]], '#7a6a58', 2);
      brick(c, -14, -44, 40, 44, '#9a978f');
      arch(c, 6, 0, 24, 34, '#1e1812');
      // Windlass frame.
      poly(c, [[-40, 0], [-34, -40]], 2.6, C.wood);
      poly(c, [[-22, 0], [-28, -40]], 2.6, C.wood);
      poly(c, [[-36, -40], [-26, -40]], 3, C.woodB);
      dot(c, [-31, -40], 3.5, C.wood);
      poly(c, [[-31, -40], [-31, -16]], 0.8, C.cloth);
      rrect(c, -35, -16, 8, 7, 1.5, C.wood, 1);
      // Rails and a loaded cart.
      poly(c, [[20, -2], [58, -2]], 1.2, C.iron);
      rrect(c, 30, -14, 20, 10, 2, C.iron);
      nuggets(c, 40, -14, 3 + step);
      dot(c, [34, -3], 2.5, C.steelD);
      dot(c, [46, -3], 2.5, C.steelD);
      if (step >= 1) lantern(c, 20, -40);
      if (step >= 2) barrel(c, -48, 0);
      if (step >= 3) crate(c, -54, 0);
      if (step >= 4) flag(c, 26, -88, team);
      break;
    }
    case 2: {
      // Timber mill with a water wheel over a sluice.
      shape(c, [[-60, 0], [-50, -40], [-20, -58], [10, -52], [30, 0]], '#7a6a58', 2);
      rrect(c, -18, -60, 48, 60, 2, '#e8dcc0');
      poly(c, [[-18, -40], [30, -40]], 2.6, C.woodB);
      poly(c, [[-18, -20], [30, -20]], 2.6, C.woodB);
      shape(c, [[-24, -58], [6, -82], [36, -58]], '#9a4a3a', 1.8);
      window_(c, -8, -52, 10, 9);
      window_(c, 12, -52, 10, 9);
      arch(c, 6, 0, 16, 20, '#2a1a10');
      // Water wheel.
      dot(c, [44, -26], 18, C.woodB);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        poly(c, [[44, -26], [44 + Math.cos(a) * 17, -26 + Math.sin(a) * 17]], 1.3, C.wood);
      }
      dot(c, [44, -26], 3, C.iron);
      rrect(c, 30, -6, 30, 6, 1, '#5a8ab0', 1);
      nuggets(c, -40, -3, 3 + step);
      if (step >= 1) lantern(c, -18, -60);
      if (step >= 2) barrel(c, -52, 0);
      if (step >= 3) crate(c, -30, 0, 10);
      if (step >= 4) flag(c, 6, -104, team);
      break;
    }
    case 3: {
      // Steel headframe with its wheel, a brick engine house and a stack.
      brick(c, -50, -46, 50, 46, '#9a5a44');
      shape(c, [[-54, -46], [-25, -60], [4, -46]], '#5d636b', 1.6);
      window_(c, -42, -36, 10, 10);
      window_(c, -24, -36, 10, 10);
      rrect(c, -58, -84, 8, 38, 1, '#7a4a3a');
      smokePuffs(c, -54, -90);
      // Headframe.
      poly(c, [[10, 0], [26, -80]], 2.6, C.steelD);
      poly(c, [[44, 0], [28, -80]], 2.6, C.steelD);
      poly(c, [[14, -30], [40, -30]], 1.8, C.steelD);
      poly(c, [[18, -55], [36, -55]], 1.8, C.steelD);
      dot(c, [27, -82], 8, C.steelB);
      dot(c, [27, -82], 2, C.iron);
      poly(c, [[27, -74], [27, -8]], 0.8, C.iron);
      rrect(c, 20, -10, 14, 10, 2, C.iron);
      nuggets(c, 52, -3, 3 + step);
      if (step >= 1) lantern(c, 4, -50, '#fff2c0');
      if (step >= 2) rrect(c, 46, -14, 14, 10, 2, C.olive);
      if (step >= 3) crate(c, -2, 0, 10, C.olive);
      if (step >= 4) flag(c, 27, -108, team);
      break;
    }
    default: {
      // A drilling rig over glowing crystals, with energy conduits.
      shape(c, [[-60, 0], [-44, -30], [-10, -40], [20, -34], [52, 0]], '#4a4a5a', 2);
      for (const [x, y, h] of [[-36, -4, 18], [-26, -6, 24], [34, -4, 16]] as const) {
        shape(c, [[x - 4, y], [x, y - h], [x + 4, y]], '#8ff8ff', 1.2);
        glow(c, [x, y - h / 2], 10, team, 0.5);
      }
      shape(c, [[-6, 0], [2, -96], [10, 0]], C.whiteB, 1.6);
      poly(c, [[-4, -40], [8, -40]], 1.4, '#3a4658');
      poly(c, [[-3, -70], [7, -70]], 1.4, '#3a4658');
      rrect(c, -20, -24, 44, 24, 6, C.white);
      c.fillStyle = team;
      c.fillRect(-16, -14, 36, 2);
      glow(c, [2, -96], 10, team, 0.9);
      glow(c, [2, -4], 12, '#8ff8ff', 0.6);
      for (let i = 0; i <= step; i++) glow(c, [44 - i * 4, -8 - i * 3], 4, C.gold, 0.9);
      if (step >= 2) rrect(c, 32, -18, 14, 18, 3, C.whiteB);
      if (step >= 4) glow(c, [2, -50], 30, team, 0.3);
    }
  }
}

/* ---- Library ----------------------------------------------------------------------- */

function drawLibrary(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  switch (stage) {
    case 0: {
      // Hut with painted hides and a rack of stone tablets.
      rrect(c, -40, -40, 64, 40, 3, '#8b5a2b');
      shape(c, [[-50, -38], [-8, -76], [34, -38]], '#c8a24a', 2);
      arch(c, -8, 0, 18, 26, '#2a1a10');
      // Painted hide with a hunt scene.
      rrect(c, 8, -34, 12, 16, 1, '#d8b88a', 1);
      poly(c, [[10, -24], [14, -28], [18, -24]], 0.8, '#8a3a2a');
      // Tablet rack.
      poly(c, [[34, 0], [34, -30]], 2, C.woodB);
      poly(c, [[56, 0], [56, -30]], 2, C.woodB);
      const tablets = 1 + step;
      for (let i = 0; i < tablets; i++) rrect(c, 36 + (i % 3) * 6.5, -12 - Math.floor(i / 3) * 14, 5.5, 10, 1.5, C.stone, 1);
      if (step >= 2) lantern(c, -34, -44);
      if (step >= 4) flag(c, -8, -98, team);
      break;
    }
    case 1: {
      // Stone scriptorium with a tall arched window.
      brick(c, -44, -64, 76, 64, '#9a978f');
      shape(c, [[-50, -62], [-6, -90], [38, -62]], '#6a4a3a', 2);
      arch(c, -26, -18, 14, 34, '#f8d878');
      arch(c, 14, -18, 14, 34, '#f8d878');
      arch(c, -6, 0, 16, 24, '#2a1a10');
      // Book stand with a candle.
      poly(c, [[46, 0], [46, -20]], 2, C.woodB);
      shape(c, [[38, -20], [54, -20], [50, -26], [42, -26]], C.cloth, 1.2);
      for (let i = 0; i <= step; i++) rrect(c, 36 + i * 4, -6, 3.5, 6, 0.8, ['#8a2a2a', '#2a4a8a', '#2a6a3a'][i % 3]!, 0.8);
      if (step >= 1) lantern(c, 52, -30);
      if (step >= 3) banner(c, -40, -60, team);
      if (step >= 4) flag(c, -6, -106, team);
      break;
    }
    case 2: {
      // Domed library with columns and a telescope on the roof.
      rrect(c, -50, -52, 96, 52, 2, '#e8dcc0');
      shape(c, [[-56, -52], [-2, -66], [52, -52]], '#d8ccb0', 1.8);
      c.beginPath();
      c.arc(-2, -66, 20, Math.PI, 0);
      c.closePath();
      c.fillStyle = team;
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = OUT;
      c.stroke();
      for (let i = 0; i < 5; i++) rrect(c, -44 + i * 20, -48, 6, 44, 1, '#f4ecd8', 1.1);
      arch(c, -2, 0, 14, 26, '#2a1a10');
      // Telescope.
      poly(c, [[10, -84], [28, -96]], 3, C.gold);
      poly(c, [[16, -84], [16, -76]], 1, C.iron);
      for (let i = 0; i <= step; i++) rrect(c, 34 + (i % 2) * 7, -8 - Math.floor(i / 2) * 7, 6, 7, 1, ['#8a2a2a', '#2a4a8a', '#2a6a3a'][i % 3]!, 0.8);
      if (step >= 2) lantern(c, -50, -30);
      if (step >= 4) flag(c, -2, -108, team);
      break;
    }
    case 3: {
      // Brick university with a clock and a radio mast.
      brick(c, -52, -60, 100, 60, '#9a5a44');
      shape(c, [[-56, -60], [-2, -80], [52, -60]], '#5d636b', 1.8);
      dot(c, [-2, -68], 7, '#f8f2e0');
      poly(c, [[-2, -68], [-2, -72]], 0.9, OUT);
      poly(c, [[-2, -68], [1, -68]], 0.9, OUT);
      for (const x of [-42, -24, 16, 34]) window_(c, x, -48, 10, 14);
      rrect(c, -10, -28, 16, 28, 2, '#3a2a1a');
      poly(c, [[40, -60], [40, -104]], 1, C.iron);
      glow(c, [40, -104], 5, team, 0.9);
      for (let i = 0; i <= step; i++) window_(c, -42 + i * 19, -26, 8, 10, i % 2 === 0);
      if (step >= 4) flag(c, -2, -104, team);
      break;
    }
    default: {
      // A data spire with a floating holographic book.
      shape(c, [[-30, 0], [-16, -70], [-2, -96], [12, -70], [26, 0]], C.white, 2);
      shape(c, [[-16, -70], [-2, -96], [-2, -70]], C.whiteB, 1.2);
      c.fillStyle = team;
      c.fillRect(-20, -40, 42, 2.4);
      c.fillRect(-14, -62, 26, 2);
      rrect(c, -10, -22, 16, 22, 5, '#20304a');
      glow(c, [-2, -96], 10, team, 0.9);
      // Hologram book.
      c.fillStyle = rgba('#8ff8ff', 0.4);
      c.beginPath();
      c.moveTo(34, -60);
      c.lineTo(46, -64);
      c.lineTo(58, -60);
      c.lineTo(58, -44);
      c.lineTo(46, -48);
      c.lineTo(34, -44);
      c.closePath();
      c.fill();
      c.strokeStyle = rgba('#b8ffff', 0.9);
      c.lineWidth = 1;
      c.stroke();
      glow(c, [46, -54], 16, '#8ff8ff', 0.3);
      for (let i = 0; i <= step; i++) glow(c, [-40 + i * 6, -10], 3.5, team, 0.9);
    }
  }
}

function banner(c: Ctx, x: number, top: number, team: string): void {
  shape(c, [[x, top], [x + 10, top], [x + 10, top + 22], [x + 5, top + 18], [x, top + 22]], team, 1.2);
}

/* ---- Forge ----------------------------------------------------------------------------- */

function drawForge(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  switch (stage) {
    case 0: {
      // Stone fire pit, an anvil stone and hide bellows.
      for (let i = 0; i < 7; i++) dot(c, [-30 + i * 6, -3 - (i % 2) * 2], 4, C.stone);
      glow(c, [-12, -12], 18, C.fire, 0.8);
      shape(c, [[-22, -6], [-16, -24], [-12, -10], [-6, -28], [0, -6]], C.fire, 1.2);
      shape(c, [[-16, -6], [-12, -18], [-8, -6]], C.fireB, 1);
      rrect(c, 14, -16, 22, 16, 4, C.stoneB);
      poly(c, [[20, -20], [34, -22]], 3, C.iron);
      ellipse(c, -44, -10, 10, 6, 0.3, C.leather);
      smokePuffs(c, -12, -36, 2 + Math.min(2, step));
      for (let i = 0; i < step; i++) poly(c, [[40 + i * 5, 0], [44 + i * 5, -20]], 1.4, C.wood);
      if (step >= 3) flag(c, 54, -46, team);
      break;
    }
    case 1: {
      // Smithy with a chimney, an anvil and a glowing hearth.
      brick(c, -48, -48, 60, 48, '#9a978f');
      shape(c, [[-54, -46], [-18, -70], [18, -46]], '#6a4a3a', 1.8);
      rrect(c, 2, -84, 12, 38, 1, '#8a877f');
      smokePuffs(c, 8, -90, 2 + Math.min(2, step));
      rrect(c, -40, -30, 24, 30, 3, '#2a1a10');
      glow(c, [-28, -12], 16, C.fire, 0.9);
      shape(c, [[-36, 0], [-28, -18], [-20, 0]], C.fire, 1.2);
      // Anvil.
      shape(c, [[24, -14], [44, -14], [40, -10], [36, -10], [36, -4], [42, 0], [26, 0], [32, -4], [32, -10], [28, -10]], C.iron, 1.3);
      for (let i = 0; i < step; i++) poly(c, [[48 + i * 4, 0], [52 + i * 4, -22]], 1.4, C.steelB);
      if (step >= 3) banner(c, -8, -46, team);
      if (step >= 4) flag(c, -18, -92, team);
      break;
    }
    case 2: {
      // Foundry with a big furnace, a stack and a quench trough.
      brick(c, -54, -60, 76, 60, '#b8a888');
      shape(c, [[-58, -58], [-16, -76], [26, -58]], '#6a3a2a', 1.8);
      rrect(c, 6, -100, 14, 42, 1, '#8a5a44');
      smokePuffs(c, 13, -106, 3);
      arch(c, -30, 0, 26, 34, '#2a1a10');
      glow(c, [-30, -14], 20, C.fire, 0.95);
      rrect(c, 30, -10, 26, 10, 2, C.woodB);
      rrect(c, 32, -8, 22, 4, 1, '#5a8ab0', 0.8);
      for (let i = 0; i <= step; i++) rrect(c, 34 + i * 5, -22, 4, 12, 1, C.steelB, 0.9);
      if (step >= 4) flag(c, -16, -100, team);
      break;
    }
    case 3: {
      // Factory with saw-tooth roof, stacks and a gear sign.
      rrect(c, -56, -46, 100, 46, 2, '#8a8a82');
      for (let i = 0; i < 4; i++) shape(c, [[-56 + i * 25, -46], [-56 + i * 25, -62], [-31 + i * 25, -46]], '#5d636b', 1.4);
      rrect(c, -46, -92, 10, 46, 1, '#7a4a3a');
      rrect(c, -28, -86, 10, 40, 1, '#7a4a3a');
      smokePuffs(c, -41, -98, 3, '#6a6a6a');
      smokePuffs(c, -23, -92, 2, '#6a6a6a');
      // Gear sign.
      dot(c, [26, -30], 10, C.steelB);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        rrect(c, 26 + Math.cos(a) * 11 - 2, -30 + Math.sin(a) * 11 - 2, 4, 4, 1, C.steelB, 0.8);
      }
      dot(c, [26, -30], 3.5, team);
      rrect(c, -10, -26, 22, 26, 2, '#3a3a3a');
      glow(c, [1, -10], 12, C.fire, 0.6);
      for (let i = 0; i <= step; i++) window_(c, -52 + i * 9, -40, 6, 8, true);
      if (step >= 4) flag(c, 40, -72, team);
      break;
    }
    default: {
      // Plasma forge: a reactor ring over an emitter.
      rrect(c, -40, -30, 76, 30, 8, C.white);
      c.fillStyle = team;
      c.fillRect(-34, -18, 64, 2.2);
      c.strokeStyle = OUT;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(-2, -62, 24, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = C.whiteB;
      c.lineWidth = 4;
      c.stroke();
      glow(c, [-2, -62], 20 + step * 2, C.plasma, 0.9);
      dot(c, [-2, -62], 6, '#f0e0ff');
      poly(c, [[-22, -30], [-18, -48]], 3, '#3a4658');
      poly(c, [[18, -30], [14, -48]], 3, '#3a4658');
      for (let i = 0; i <= step; i++) glow(c, [44, -6 - i * 7], 3.5, team, 0.9);
    }
  }
}

/* ---- Barracks (prototype) ------------------------------------------------------------------ */

function drawBarracks(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  const dummies = (x: number): void => {
    for (let i = 0; i <= Math.min(2, step); i++) {
      const dx = x + i * 12;
      poly(c, [[dx, 0], [dx, -22]], 2, C.woodB);
      poly(c, [[dx - 6, -16], [dx + 6, -16]], 2, C.woodB);
      dot(c, [dx, -26], 4.5, '#d8c078');
    }
  };
  switch (stage) {
    case 0:
      rrect(c, -46, -34, 52, 34, 3, '#8b5a2b');
      shape(c, [[-54, -32], [-20, -62], [14, -32]], '#c8a24a', 1.8);
      arch(c, -20, 0, 16, 22, '#2a1a10');
      // Spear rack.
      for (let i = 0; i < 4; i++) poly(c, [[12 + i * 4, 0], [14 + i * 4, -34]], 1.3, C.wood);
      dummies(36);
      if (step >= 3) flag(c, -20, -84, team);
      break;
    case 1:
      rrect(c, -50, -40, 60, 40, 2, '#8a6a4a');
      shape(c, [[-56, -38], [-20, -60], [16, -38]], '#6a4a3a', 1.8);
      poly(c, [[-50, -20], [10, -20]], 2.4, C.woodB);
      for (const x of [-42, -24, -6]) shape(c, [[x, -34], [x + 8, -34], [x + 8, -28], [x + 4, -24], [x, -28]], team, 1);
      arch(c, -20, 0, 14, 18, '#2a1a10');
      dummies(30);
      if (step >= 3) flag(c, -20, -80, team);
      break;
    case 2:
      brick(c, -52, -48, 70, 48, '#b8a888');
      shape(c, [[-56, -46], [-17, -64], [22, -46]], '#9a4a3a', 1.8);
      for (const x of [-44, -28, 4]) window_(c, x, -38, 8, 10);
      arch(c, -12, 0, 16, 24, '#2a1a10');
      // Drum.
      ellipse(c, 34, -10, 8, 10, 0, team);
      poly(c, [[26, -14], [42, -6]], 0.8, C.cloth);
      dummies(46);
      if (step >= 3) flag(c, -17, -86, team);
      break;
    case 3:
      // Quonset hut behind sandbags.
      c.beginPath();
      c.moveTo(-54, 0);
      c.arc(-14, 0, 40, Math.PI, 0);
      c.closePath();
      c.fillStyle = '#7a7c62';
      c.fill();
      c.lineWidth = 1.8;
      c.strokeStyle = OUT;
      c.stroke();
      for (let i = 1; i < 5; i++) {
        c.beginPath();
        c.arc(-14, 0, 40 - i * 0.1, Math.PI + (i * Math.PI) / 5 - 0.01, Math.PI + (i * Math.PI) / 5 + 0.01);
        c.stroke();
      }
      rrect(c, -22, -24, 16, 24, 2, '#3a3a2a');
      dot(c, [-14, -32], 5, team);
      for (let i = 0; i <= step; i++) rrect(c, 28 + (i % 3) * 10, -7 - Math.floor(i / 3) * 6, 10, 7, 3, '#b8a878', 1.1);
      if (step >= 3) flag(c, 26, -60, team);
      break;
    default:
      // Sleek hangar with a light-strip door.
      shape(c, [[-56, 0], [-50, -44], [22, -52], [40, 0]], C.white, 1.8);
      rrect(c, -40, -34, 50, 34, 3, '#20304a');
      for (let i = 0; i < 4; i++) {
        c.fillStyle = rgba(team, 0.5 + i * 0.1);
        c.fillRect(-38, -30 + i * 8, 46, 1.6);
      }
      glow(c, [-15, -20], 18, team, 0.35);
      for (let i = 0; i <= step; i++) glow(c, [48 + (i % 2) * 6, -8 - Math.floor(i / 2) * 8], 3.5, team, 0.9);
  }
}

/* ---- Shrine (prototype) ------------------------------------------------------------------------ */

function drawShrine(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  switch (stage) {
    case 0:
      // Standing stones around a sacred fire and a totem.
      for (const [x, h] of [[-44, 40], [-24, 50], [24, 50], [44, 40]] as const) shape(c, [[x - 6, 0], [x - 5, -h], [x + 5, -h - 3], [x + 6, 0]], C.stone, 1.5);
      glow(c, [0, -12], 16 + step * 2, C.fire, 0.85);
      shape(c, [[-8, -2], [0, -26 - step * 2], [8, -2]], C.fire, 1.2);
      dot(c, [0, -58], 7, C.bone);
      poly(c, [[0, -50], [0, -34]], 2, C.woodB);
      if (step >= 3) flag(c, -24, -74, team);
      break;
    case 1:
      // Little chapel with a bell.
      brick(c, -30, -52, 50, 52, '#e0d8c8');
      shape(c, [[-36, -50], [-5, -76], [26, -50]], '#6a4a3a', 1.8);
      rrect(c, -12, -94, 14, 20, 2, '#e0d8c8');
      shape(c, [[-14, -92], [-5, -106], [4, -92]], '#6a4a3a', 1.4);
      dot(c, [-5, -84], 4, C.gold);
      arch(c, -5, 0, 14, 24, '#2a1a10');
      arch(c, -20, -26, 7, 14, '#8fb8e8');
      arch(c, 10, -26, 7, 14, '#8fb8e8');
      for (let i = 0; i <= step; i++) lantern(c, 30 + i * 6, -6 - (i % 2) * 4, C.fireB);
      break;
    case 2:
      // Temple with a dome, columns and a golden statue.
      rrect(c, -44, -40, 84, 40, 2, '#f0e8d4');
      for (let i = 0; i < 5; i++) rrect(c, -40 + i * 18, -38, 6, 36, 1, '#fffaf0', 1);
      shape(c, [[-50, -40], [-2, -58], [46, -40]], '#e0d4b8', 1.8);
      c.beginPath();
      c.arc(-2, -58, 16, Math.PI, 0);
      c.closePath();
      c.fillStyle = C.gold;
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = OUT;
      c.stroke();
      dot(c, [48, -30], 5, C.gold);
      rrect(c, 44, -26, 8, 26, 2, C.gold);
      glow(c, [48, -20], 10 + step * 2, C.gold, 0.4);
      if (step >= 3) flag(c, -2, -96, team);
      break;
    case 3:
      // Obelisk memorial with an eternal flame.
      shape(c, [[-12, 0], [-8, -86], [0, -96], [8, -86], [12, 0]], '#c8c4b8', 1.8);
      rrect(c, -30, -10, 60, 10, 2, '#a8a498');
      glow(c, [34, -18], 12 + step * 2, C.fire, 0.8);
      rrect(c, 28, -12, 12, 12, 2, C.steelD);
      shape(c, [[30, -12], [34, -26], [38, -12]], C.fire, 1);
      c.fillStyle = team;
      c.fillRect(-6, -60, 12, 3);
      if (step >= 3) flag(c, -40, -40, team);
      break;
    default:
      // Floating crystal obelisk inside an energy ring.
      rrect(c, -24, -8, 48, 8, 4, C.white);
      glow(c, [0, -60], 30 + step * 3, team, 0.35);
      shape(c, [[0, -100], [10, -60], [0, -24], [-10, -60]], '#bff8ff', 1.6);
      shape(c, [[0, -100], [10, -60], [0, -60]], '#e8ffff', 0.8);
      c.strokeStyle = rgba(team, 0.8);
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(0, -60, 28, 8, 0, 0, Math.PI * 2);
      c.stroke();
  }
}

/* ---- Market (prototype) ------------------------------------------------------------------------ */

function drawMarket(c: Ctx, stage: number, step: number, team: string): void {
  ground(c);
  const goods = (x: number): void => {
    for (let i = 0; i <= step; i++) {
      if (i % 2 === 0) crate(c, x + i * 7, 0, 8);
      else barrel(c, x + i * 7, 0);
    }
  };
  switch (stage) {
    case 0:
      // A hide tent and a trading blanket with pots.
      shape(c, [[-50, 0], [-24, -48], [2, 0]], '#b08452', 1.8);
      poly(c, [[-24, -48], [-24, 0]], 1, C.woodB);
      rrect(c, 8, -4, 44, 4, 1, team, 1);
      for (let i = 0; i <= step; i++) ellipse(c, 14 + i * 9, -9, 3.5, 5, 0, i % 2 ? '#b5652d' : '#8a7a5a');
      if (step >= 3) flag(c, -24, -70, team);
      break;
    case 1:
      // A market stall with a striped awning.
      poly(c, [[-40, 0], [-40, -44]], 2.4, C.woodB);
      poly(c, [[20, 0], [20, -44]], 2.4, C.woodB);
      for (let i = 0; i < 6; i++) shape(c, [[-44 + i * 11, -44], [-33 + i * 11, -44], [-33 + i * 11, -36], [-44 + i * 11, -36]], i % 2 ? team : C.cloth, 1);
      rrect(c, -40, -20, 60, 20, 2, C.wood);
      for (let i = 0; i < 5; i++) dot(c, [-34 + i * 11, -24], 3.5, ['#d84a3a', '#f2c744', '#6ab04a'][i % 3]!);
      goods(28);
      break;
    case 2:
      // Merchant house with a hanging sign and scales.
      rrect(c, -48, -54, 56, 54, 2, '#e8dcc0');
      shape(c, [[-54, -52], [-20, -74], [14, -52]], '#9a4a3a', 1.8);
      window_(c, -40, -44, 10, 10);
      window_(c, -18, -44, 10, 10);
      rrect(c, -30, -24, 16, 24, 2, '#3a2a1a');
      poly(c, [[8, -40], [22, -40]], 1.4, C.iron);
      rrect(c, 14, -38, 14, 10, 1.5, team);
      dot(c, [21, -33], 2, C.gold);
      goods(28);
      if (step >= 3) flag(c, -20, -96, team);
      break;
    case 3:
      // A bank front with columns and a big coin sign.
      rrect(c, -50, -58, 80, 58, 2, '#d8d4c8');
      shape(c, [[-54, -58], [-10, -74], [34, -58]], '#b8b4a8', 1.8);
      for (let i = 0; i < 4; i++) rrect(c, -44 + i * 20, -52, 6, 48, 1, '#f4f0e8', 1);
      dot(c, [-10, -64], 6, C.gold);
      rrect(c, -18, -30, 16, 30, 2, '#3a3a3a');
      goods(38);
      if (step >= 3) flag(c, 26, -76, team);
      break;
    default:
      // Holo-exchange: a kiosk with a floating chart and a coin.
      rrect(c, -34, -30, 50, 30, 8, C.white);
      c.fillStyle = team;
      c.fillRect(-28, -20, 38, 2);
      c.fillStyle = rgba('#7df5c8', 0.35);
      c.fillRect(-34, -84, 50, 40);
      c.strokeStyle = rgba('#b8ffe6', 0.9);
      c.lineWidth = 1.4;
      c.beginPath();
      const pts = [0, 6, 4, 12, 10, 18, 22 + step * 2];
      pts.forEach((h, i) => {
        const x = -30 + i * 7;
        if (i === 0) c.moveTo(x, -50 - h);
        else c.lineTo(x, -50 - h);
      });
      c.stroke();
      ellipse(c, 34, -40, 7, 7, 0, C.gold);
      glow(c, [34, -40], 12, C.gold, 0.4);
  }
}

/** Draws a building at `level` (1..25; 0 = the faded "not built" outline of stage 0). */
export function drawBuildingArt(c: Ctx, id: BuildingId, level: number, team: string): void {
  const stage = level <= 0 ? 0 : Math.min(4, Math.floor((level - 1) / 5));
  const step = level <= 0 ? 0 : (level - 1) % 5;
  switch (id) {
    case 'mine':
      drawMine(c, stage, step, team);
      break;
    case 'library':
      drawLibrary(c, stage, step, team);
      break;
    case 'forge':
      drawForge(c, stage, step, team);
      break;
    case 'barracks':
      drawBarracks(c, stage, step, team);
      break;
    case 'shrine':
      drawShrine(c, stage, step, team);
      break;
    case 'market':
      drawMarket(c, stage, step, team);
      break;
  }
}
