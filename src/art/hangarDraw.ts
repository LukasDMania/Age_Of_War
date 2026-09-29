/**
 * The hangar's backdrops (Mech expansion, `docs/MECH_EXPANSION.md` section
 * 1): one room per age, drawn in code like the rest of the art, with the
 * gantry the Mech stands on in the middle.
 *
 * - Stone: inside a hut (hides, a fire pit, a wooden scaffold).
 * - Castle: a blacksmith's forge (anvil, bellows, stone walls).
 * - Renaissance: a steam factory hall (pipes, gears, chains).
 * - Modern: an army base hangar (camo nets, sandbags, floodlights).
 * - Future: a clean lab bay (glowing panels, a holo-grid floor).
 *
 * Screen pixels (1280 x 720), not rig units. `HANGAR_FLOOR_Y` is where the
 * Mech's feet stand and `HANGAR_MECH_X` its middle. Pure canvas drawing.
 */
import { C, OUT, rgba, shade, type Ctx } from '@/art/rigKit';

export const HANGAR_SIZE = { width: 1280, height: 720 } as const;
/** Where the Mech stands on the gantry. */
export const HANGAR_MECH_X = 620;
export const HANGAR_FLOOR_Y = 606;

const W = HANGAR_SIZE.width;
const H = HANGAR_SIZE.height;

/** Deterministic noise so a backdrop looks the same every time. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fill(c: Ctx, col: string): void {
  c.fillStyle = col;
  c.fill();
}

function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string, outline = true): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
  if (outline) {
    c.lineWidth = 2;
    c.strokeStyle = OUT;
    c.strokeRect(x, y, w, h);
  }
}

function vGradient(c: Ctx, y0: number, y1: number, top: string, bottom: string): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function glowAt(c: Ctx, x: number, y: number, r: number, col: string, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** The floor below the wall: a band from `HANGAR_FLOOR_Y - 40` down. */
function floor(c: Ctx, top: string, bottom: string): void {
  c.fillStyle = vGradient(c, HANGAR_FLOOR_Y - 40, H, top, bottom);
  c.fillRect(0, HANGAR_FLOOR_Y - 40, W, H);
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.fillRect(0, HANGAR_FLOOR_Y - 40, W, 3);
}

/* ---- Stone: a hut ------------------------------------------------------------------------------ */

function stone(c: Ctx): void {
  const r = rand(11);
  // Hide walls on a pole frame.
  c.fillStyle = vGradient(c, 0, HANGAR_FLOOR_Y, '#3a2618', '#6b4a2e');
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const x = i * 150 - 20;
    c.beginPath();
    c.moveTo(x, 0);
    c.quadraticCurveTo(x + 75, 60 + r() * 30, x + 150, 0);
    c.lineTo(x + 150, HANGAR_FLOOR_Y);
    c.lineTo(x, HANGAR_FLOOR_Y);
    c.closePath();
    fill(c, i % 2 ? '#7a5634' : '#6c4a2c');
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(26,18,12,.5)';
    c.stroke();
    for (let s = 0; s < 6; s++) {
      c.fillStyle = 'rgba(40,24,12,.25)';
      c.fillRect(x + 20 + r() * 110, 90 + r() * 420, 4 + r() * 10, 2);
    }
  }
  for (let i = 0; i < 10; i++) rect(c, i * 150 - 28, 0, 16, HANGAR_FLOOR_Y, C.woodB);
  rect(c, -10, 70, W + 20, 16, C.wood);
  // Hanging bones and a skull charm.
  for (const x of [180, 1080]) {
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 86);
    c.lineTo(x, 150);
    c.stroke();
    rect(c, x - 14, 150, 28, 8, C.bone);
    rect(c, x - 6, 158, 12, 20, C.bone);
  }
  floor(c, '#5a4128', '#2e2014');
  // Straw on the floor.
  for (let i = 0; i < 140; i++) {
    c.strokeStyle = rgba('#c9a45a', 0.35 + r() * 0.3);
    c.lineWidth = 1.5;
    const x = r() * W;
    const y = HANGAR_FLOOR_Y - 30 + r() * 120;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 8 + r() * 10, y - 2 + r() * 4);
    c.stroke();
  }
  // Fire pit, left.
  glowAt(c, 200, HANGAR_FLOOR_Y - 10, 240, C.fire, 0.35);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI;
    c.beginPath();
    c.ellipse(200 + Math.cos(a) * 60, HANGAR_FLOOR_Y + 14 - Math.sin(a) * 12, 18, 11, 0, 0, Math.PI * 2);
    fill(c, i % 2 ? C.stone : C.stoneB);
    c.strokeStyle = OUT;
    c.stroke();
  }
  c.beginPath();
  c.moveTo(160, HANGAR_FLOOR_Y + 6);
  c.quadraticCurveTo(185, HANGAR_FLOOR_Y - 90, 200, HANGAR_FLOOR_Y - 40);
  c.quadraticCurveTo(215, HANGAR_FLOOR_Y - 110, 240, HANGAR_FLOOR_Y + 6);
  c.closePath();
  fill(c, C.fire);
  c.beginPath();
  c.moveTo(180, HANGAR_FLOOR_Y + 6);
  c.quadraticCurveTo(200, HANGAR_FLOOR_Y - 50, 220, HANGAR_FLOOR_Y + 6);
  c.closePath();
  fill(c, C.fireB);
  // Hides stretched on a rack, right.
  rect(c, 980, 360, 10, HANGAR_FLOOR_Y - 360, C.woodB);
  rect(c, 1160, 360, 10, HANGAR_FLOOR_Y - 360, C.woodB);
  rect(c, 970, 360, 210, 10, C.wood);
  c.beginPath();
  c.moveTo(1000, 380);
  c.quadraticCurveTo(1075, 360, 1150, 380);
  c.lineTo(1140, 520);
  c.quadraticCurveTo(1075, 545, 1010, 520);
  c.closePath();
  fill(c, '#b48a5a');
  c.lineWidth = 2;
  c.strokeStyle = OUT;
  c.stroke();
}

/* ---- Castle: a blacksmith's forge -------------------------------------------------------------- */

function castle(c: Ctx): void {
  const r = rand(23);
  c.fillStyle = vGradient(c, 0, HANGAR_FLOOR_Y, '#2a2a30', '#4d4b50');
  c.fillRect(0, 0, W, H);
  // Stone blocks.
  for (let row = 0; row < 16; row++) {
    const y = row * 38;
    for (let col = -1; col < 18; col++) {
      const x = col * 76 + (row % 2) * 38;
      const t = 0.85 + r() * 0.3;
      c.fillStyle = shade('#6d6a70', t);
      c.fillRect(x + 2, y + 2, 72, 34);
    }
  }
  // Arched window with daylight.
  c.beginPath();
  c.moveTo(1020, 330);
  c.lineTo(1020, 190);
  c.arc(1080, 190, 60, Math.PI, 0);
  c.lineTo(1140, 330);
  c.closePath();
  fill(c, '#9fc4e8');
  c.lineWidth = 6;
  c.strokeStyle = OUT;
  c.stroke();
  rect(c, 1077, 130, 6, 200, '#3a3a3e', false);
  rect(c, 1020, 250, 120, 6, '#3a3a3e', false);
  // Weapons rack.
  rect(c, 60, 250, 260, 12, C.wood);
  for (let i = 0; i < 5; i++) {
    const x = 90 + i * 50;
    rect(c, x, 262, 6, 150, C.steelB);
    c.beginPath();
    c.moveTo(x - 6, 262);
    c.lineTo(x + 3, 225);
    c.lineTo(x + 12, 262);
    c.closePath();
    fill(c, C.steel);
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.stroke();
  }
  // Banner.
  c.beginPath();
  c.moveTo(430, 60);
  c.lineTo(530, 60);
  c.lineTo(530, 240);
  c.lineTo(480, 210);
  c.lineTo(430, 240);
  c.closePath();
  fill(c, '#7a2a2a');
  c.stroke();
  floor(c, '#4a4040', '#221c1c');
  for (let i = 0; i < 12; i++) {
    c.strokeStyle = 'rgba(0,0,0,.25)';
    c.beginPath();
    c.moveTo(i * 120, HANGAR_FLOOR_Y - 37);
    c.lineTo(i * 120 - 60, H);
    c.stroke();
  }
  // Forge hearth with bellows, left.
  glowAt(c, 170, HANGAR_FLOOR_Y - 90, 260, '#ff7a2a', 0.4);
  rect(c, 70, HANGAR_FLOOR_Y - 190, 200, 190, '#5a5358');
  c.beginPath();
  c.moveTo(120, HANGAR_FLOOR_Y - 20);
  c.lineTo(120, HANGAR_FLOOR_Y - 110);
  c.arc(170, HANGAR_FLOOR_Y - 110, 50, Math.PI, 0);
  c.lineTo(220, HANGAR_FLOOR_Y - 20);
  c.closePath();
  fill(c, '#2a1208');
  glowAt(c, 170, HANGAR_FLOOR_Y - 50, 60, C.fireB, 0.9);
  rect(c, 90, HANGAR_FLOOR_Y - 280, 160, 90, '#4a4448');
  c.beginPath();
  c.moveTo(280, HANGAR_FLOOR_Y - 70);
  c.lineTo(350, HANGAR_FLOOR_Y - 100);
  c.lineTo(350, HANGAR_FLOOR_Y - 40);
  c.closePath();
  fill(c, C.leather);
  c.stroke();
  // Anvil, right.
  c.beginPath();
  c.moveTo(1000, HANGAR_FLOOR_Y - 70);
  c.lineTo(1120, HANGAR_FLOOR_Y - 70);
  c.lineTo(1150, HANGAR_FLOOR_Y - 90);
  c.lineTo(1100, HANGAR_FLOOR_Y - 90);
  c.lineTo(1085, HANGAR_FLOOR_Y - 100);
  c.lineTo(1015, HANGAR_FLOOR_Y - 100);
  c.closePath();
  fill(c, '#3e3e44');
  c.stroke();
  rect(c, 1035, HANGAR_FLOOR_Y - 70, 50, 50, '#35353a');
  rect(c, 1015, HANGAR_FLOOR_Y - 20, 90, 20, C.woodB);
}

/* ---- Renaissance: a steam factory hall --------------------------------------------------------- */

function gearShape(c: Ctx, x: number, y: number, rad: number, teeth: number, col: string): void {
  c.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? rad : rad * 1.15;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  fill(c, col);
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.stroke();
  c.beginPath();
  c.arc(x, y, rad * 0.35, 0, Math.PI * 2);
  fill(c, shade(col, 0.6));
  c.stroke();
}

function renaissance(c: Ctx): void {
  c.fillStyle = vGradient(c, 0, HANGAR_FLOOR_Y, '#3a2a1c', '#6a5034');
  c.fillRect(0, 0, W, H);
  // Brick wall.
  for (let row = 0; row < 32; row++) {
    for (let col = -1; col < 34; col++) {
      c.fillStyle = (row + col) % 5 ? '#7a4a30' : '#6a3e28';
      c.fillRect(col * 40 + (row % 2) * 20 + 1, row * 19 + 1, 38, 17);
    }
  }
  c.fillStyle = 'rgba(30,18,8,.35)';
  c.fillRect(0, 0, W, H);
  // Tall windows with a warm haze.
  for (const x of [140, 1040]) {
    rect(c, x, 90, 110, 260, '#e8c890');
    for (let i = 1; i < 3; i++) rect(c, x + i * 36, 90, 3, 260, '#3a2a1c', false);
    for (let i = 1; i < 5; i++) rect(c, x, 90 + i * 52, 110, 3, '#3a2a1c', false);
  }
  // Pipes along the wall and ceiling.
  const pipe = (x0: number, y0: number, x1: number, y1: number): void => {
    c.lineCap = 'round';
    c.strokeStyle = OUT;
    c.lineWidth = 20;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.strokeStyle = '#b87a3a';
    c.lineWidth = 14;
    c.stroke();
    c.strokeStyle = 'rgba(255,230,180,.4)';
    c.lineWidth = 4;
    c.stroke();
  };
  pipe(-10, 40, W + 10, 40);
  pipe(330, 40, 330, HANGAR_FLOOR_Y - 40);
  pipe(930, 40, 930, 300);
  pipe(930, 300, 1180, 300);
  for (const [x, y] of [
    [330, 200],
    [930, 150],
    [620, 40],
  ] as const) {
    rect(c, x - 14, y - 14, 28, 28, '#8a5a2a');
  }
  // Big gears.
  gearShape(c, 180, 470, 90, 12, '#a47e33');
  gearShape(c, 290, 400, 50, 9, '#c9a04a');
  gearShape(c, 1110, 470, 70, 10, '#a47e33');
  // Chains.
  for (const x of [470, 780]) {
    for (let y = 60; y < 300; y += 14) {
      c.beginPath();
      c.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2);
      c.lineWidth = 3;
      c.strokeStyle = '#3a3026';
      c.stroke();
    }
    c.beginPath();
    c.arc(x, 312, 12, 0, Math.PI);
    c.lineWidth = 5;
    c.stroke();
  }
  // Steam puffs.
  for (const [x, y, s] of [
    [360, 120, 40],
    [960, 330, 34],
    [700, 70, 50],
  ] as const) {
    for (let i = 0; i < 4; i++) glowAt(c, x + i * s * 0.5, y - i * 8, s, '#f0e8dc', 0.35);
  }
  floor(c, '#5a4630', '#2a1e12');
  for (let i = 0; i < 18; i++) rect(c, i * 80, HANGAR_FLOOR_Y - 36, 76, 4, 'rgba(0,0,0,.18)', false);
}

/* ---- Modern: an army base hangar --------------------------------------------------------------- */

function modern(c: Ctx): void {
  const r = rand(41);
  c.fillStyle = vGradient(c, 0, HANGAR_FLOOR_Y, '#2c3026', '#4a5040');
  c.fillRect(0, 0, W, H);
  // Corrugated wall.
  for (let x = 0; x < W; x += 16) {
    c.fillStyle = x % 32 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    c.fillRect(x, 0, 16, HANGAR_FLOOR_Y);
  }
  // Roof trusses.
  c.strokeStyle = '#23261e';
  c.lineWidth = 8;
  for (let x = -80; x < W + 80; x += 160) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + 80, 110);
    c.lineTo(x + 160, 0);
    c.stroke();
  }
  rect(c, -10, 106, W + 20, 12, '#23261e', false);
  // Floodlights.
  for (const x of [260, 980]) {
    c.fillStyle = 'rgba(255,250,210,.08)';
    c.beginPath();
    c.moveTo(x - 20, 130);
    c.lineTo(x - 220, HANGAR_FLOOR_Y);
    c.lineTo(x + 220, HANGAR_FLOOR_Y);
    c.lineTo(x + 20, 130);
    c.closePath();
    c.fill();
    rect(c, x - 26, 112, 52, 22, '#34342e');
    glowAt(c, x, 138, 50, '#fff6c8', 0.9);
  }
  // Camo net draped along the top.
  c.fillStyle = '#4d5a2e';
  c.beginPath();
  c.moveTo(0, 118);
  for (let x = 0; x <= W; x += 80) c.quadraticCurveTo(x + 40, 190 + r() * 30, x + 80, 118);
  c.closePath();
  c.fill();
  for (let i = 0; i < 60; i++) {
    c.fillStyle = [C.olive, '#3a4022', C.khaki, '#5c4a2e'][i % 4]!;
    c.beginPath();
    c.ellipse(r() * W, 124 + r() * 40, 18 + r() * 20, 6 + r() * 6, r(), 0, Math.PI * 2);
    c.fill();
  }
  // Stenciled number.
  c.font = 'bold 90px sans-serif';
  c.fillStyle = 'rgba(242,199,68,.25)';
  c.fillText('07', 1060, 300);
  floor(c, '#5a5c52', '#2a2c26');
  // Hazard lines on the floor.
  for (let x = 380; x < 860; x += 40) {
    c.fillStyle = (x / 40) % 2 ? '#f2c744' : '#2a2622';
    c.beginPath();
    c.moveTo(x, HANGAR_FLOOR_Y + 60);
    c.lineTo(x + 20, HANGAR_FLOOR_Y + 60);
    c.lineTo(x + 40, HANGAR_FLOOR_Y + 72);
    c.lineTo(x + 20, HANGAR_FLOOR_Y + 72);
    c.closePath();
    c.fill();
  }
  // Sandbags, left and right.
  const bags = (x0: number, rows: number): void => {
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < rows - row + 2; i++) {
        c.beginPath();
        c.ellipse(x0 + i * 44 + row * 22, HANGAR_FLOOR_Y + 10 - row * 22, 24, 13, 0, 0, Math.PI * 2);
        fill(c, i % 2 ? C.khaki : '#b8a878');
        c.lineWidth = 2;
        c.strokeStyle = OUT;
        c.stroke();
      }
    }
  };
  bags(40, 4);
  bags(1040, 3);
  // Crates.
  rect(c, 200, HANGAR_FLOOR_Y - 150, 110, 90, '#5c6a34');
  rect(c, 210, HANGAR_FLOOR_Y - 240, 90, 90, '#6b7440');
}

/* ---- Future: a lab bay ------------------------------------------------------------------------- */

function future(c: Ctx): void {
  c.fillStyle = vGradient(c, 0, HANGAR_FLOOR_Y, '#0e1822', '#1e3040');
  c.fillRect(0, 0, W, H);
  // Wall panels with glowing seams.
  for (let x = 0; x < W; x += 160) {
    for (let y = 0; y < HANGAR_FLOOR_Y - 40; y += 140) {
      c.fillStyle = (x / 160 + y / 140) % 2 ? '#1a2a38' : '#16242f';
      c.fillRect(x + 4, y + 4, 152, 132);
    }
  }
  c.strokeStyle = rgba(C.laser, 0.35);
  c.lineWidth = 2;
  for (let x = 0; x < W; x += 160) {
    c.beginPath();
    c.moveTo(x + 2, 0);
    c.lineTo(x + 2, HANGAR_FLOOR_Y - 40);
    c.stroke();
  }
  // Screens with readouts.
  for (const [x, y] of [
    [80, 180],
    [1040, 160],
  ] as const) {
    rect(c, x, y, 170, 110, '#0a1218');
    c.strokeStyle = rgba(C.laser, 0.8);
    c.lineWidth = 2;
    c.strokeRect(x, y, 170, 110);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = rgba(C.laser, 0.55);
      c.fillRect(x + 14, y + 16 + i * 14, 40 + ((i * 37) % 100), 5);
    }
  }
  // Light strip.
  glowAt(c, 620, 40, 420, C.glass, 0.18);
  rect(c, 300, 30, 640, 10, '#dff8ff', false);
  floor(c, '#1a2a38', '#070d12');
  // Holo grid in perspective.
  c.strokeStyle = rgba(C.laser, 0.28);
  c.lineWidth = 1.5;
  const horizon = HANGAR_FLOOR_Y - 40;
  for (let i = -16; i <= 16; i++) {
    c.beginPath();
    c.moveTo(HANGAR_MECH_X + i * 30, horizon);
    c.lineTo(HANGAR_MECH_X + i * 150, H);
    c.stroke();
  }
  for (let k = 1; k < 8; k++) {
    const y = horizon + (H - horizon) * Math.pow(k / 8, 1.8);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  // Pod racks.
  for (const x of [120, 1100]) {
    rect(c, x, HANGAR_FLOOR_Y - 220, 70, 220, '#c3ccd6');
    rect(c, x + 12, HANGAR_FLOOR_Y - 200, 46, 150, '#3a4a5a');
    glowAt(c, x + 35, HANGAR_FLOOR_Y - 125, 40, C.glass, 0.6);
  }
}

/* ---- The gantry -------------------------------------------------------------------------------- */

/** Colors of the gantry per age (wood, iron, brass, steel, white). */
const GANTRY: readonly { beam: string; deck: string }[] = [
  { beam: C.wood, deck: C.woodB },
  { beam: '#5d636b', deck: '#4a4d52' },
  { beam: '#a47e33', deck: '#7a5a22' },
  { beam: '#52564a', deck: '#34342e' },
  { beam: '#c3ccd6', deck: '#8e99a6' },
];

function gantry(c: Ctx, age: number): void {
  const g = GANTRY[Math.max(0, Math.min(GANTRY.length - 1, age))]!;
  const x0 = HANGAR_MECH_X - 230;
  const x1 = HANGAR_MECH_X + 230;
  const top = 120;
  // Towers on both sides with cross braces.
  for (const x of [x0, x1 - 26]) {
    rect(c, x, top, 26, HANGAR_FLOOR_Y - top, g.beam);
    c.strokeStyle = shade(g.beam, 0.7);
    c.lineWidth = 4;
    for (let y = top + 20; y < HANGAR_FLOOR_Y - 40; y += 70) {
      c.beginPath();
      c.moveTo(x + 4, y);
      c.lineTo(x + 22, y + 60);
      c.moveTo(x + 22, y);
      c.lineTo(x + 4, y + 60);
      c.stroke();
    }
  }
  // Top beam with a hoist.
  rect(c, x0 - 10, top - 20, x1 - x0 + 20, 22, g.beam);
  rect(c, HANGAR_MECH_X - 30, top + 2, 60, 18, g.deck);
  c.strokeStyle = OUT;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(HANGAR_MECH_X, top + 20);
  c.lineTo(HANGAR_MECH_X, top + 60);
  c.stroke();
  // Deck.
  rect(c, x0 - 20, HANGAR_FLOOR_Y, x1 - x0 + 40, 18, g.deck);
  c.fillStyle = 'rgba(0,0,0,.3)';
  c.fillRect(x0 - 20, HANGAR_FLOOR_Y + 18, x1 - x0 + 40, 8);
}

const ROOMS: readonly ((c: Ctx) => void)[] = [stone, castle, renaissance, modern, future];

/** Draws an age's hangar, 1280 x 720, into `c`. */
export function drawHangar(c: Ctx, age: number): void {
  ROOMS[Math.max(0, Math.min(ROOMS.length - 1, age))]!(c);
  gantry(c, age);
  // Vignette so the Mech and the panels stand out.
  const v = c.createRadialGradient(HANGAR_MECH_X, H / 2, 200, HANGAR_MECH_X, H / 2, 820);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}
