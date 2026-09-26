/**
 * Bases in the rig style, one per age, facing right (the enemy's copy is
 * mirrored). Drawn in a 120 x 200 box with (0, 0) at the bottom center, the
 * same size as the placeholder so hits and blocking don't change. Team
 * colors on banners, roofs and lights. Also: the turret ledges per age and
 * the crack overlays shown as the base loses HP.
 */
import { C, dot, ellipse, glow, OUT, poly, rgba, rrect, shade, shape, type Ctx } from '@/art/rigKit';

export const BASE_BOX = { w: 120, h: 200 } as const;

function banner(c: Ctx, x: number, top: number, h: number, team: string, w = 12): void {
  shape(c, [[x, top], [x + w, top], [x + w, top + h], [x + w / 2, top + h - 5], [x, top + h]], team, 1.4);
  c.fillStyle = shade(team, 1.35);
  c.fillRect(x + w / 2 - 1.2, top + 3, 2.4, h - 11);
}

function flag(c: Ctx, x: number, top: number, team: string, pole = C.woodB): void {
  poly(c, [[x, top + 26], [x, top]], 2, pole);
  shape(c, [[x, top], [x + 26, top + 6], [x, top + 13]], team, 1.4);
}

function brickLines(c: Ctx, x: number, y: number, w: number, h: number, rowH: number, col = rgba(OUT, 0.28)): void {
  c.strokeStyle = col;
  c.lineWidth = 0.9;
  c.beginPath();
  for (let r = 0, yy = y + rowH; yy < y + h; r++, yy += rowH) {
    c.moveTo(x, yy);
    c.lineTo(x + w, yy);
    for (let xx = x + (r % 2 ? rowH : rowH * 2); xx < x + w; xx += rowH * 2.6) {
      c.moveTo(xx, yy);
      c.lineTo(xx, yy + rowH);
    }
  }
  c.stroke();
}

export function drawBase(c: Ctx, age: number, team: string): void {
  switch (age) {
    case 0:
      drawStoneBase(c, team);
      break;
    case 1:
      drawCastleBase(c, team);
      break;
    case 2:
      drawRenaissanceBase(c, team);
      break;
    case 3:
      drawModernBase(c, team);
      break;
    default:
      drawFutureBase(c, team);
  }
}

/* ---- Stone: a thatched long hut behind a palisade ------------------------ */

function drawStoneBase(c: Ctx, team: string): void {
  // Totem pole at the back with a skull.
  rrect(c, -52, -150, 9, 150, 2, C.woodB);
  for (let y = -140; y < -20; y += 22) rrect(c, -54, y, 13, 7, 2, C.wood, 1.2);
  dot(c, [-47.5, -156], 7, C.bone);
  c.fillStyle = OUT;
  c.fillRect(-51, -158, 2.4, 2.4);
  c.fillRect(-46, -158, 2.4, 2.4);
  // Hut walls and thatch roof.
  rrect(c, -40, -104, 80, 72, 3, '#8b5a2b');
  c.strokeStyle = rgba(OUT, 0.35);
  c.lineWidth = 1;
  for (let x = -34; x < 40; x += 9) {
    c.beginPath();
    c.moveTo(x, -102);
    c.lineTo(x, -34);
    c.stroke();
  }
  shape(c, [[-54, -100], [0, -168], [54, -100]], '#c8a24a', 2);
  c.strokeStyle = rgba('#8a6a2a', 0.8);
  c.lineWidth = 1.2;
  for (let i = -3; i <= 3; i++) {
    c.beginPath();
    c.moveTo(i * 5, -160);
    c.lineTo(i * 14, -103);
    c.stroke();
  }
  shape(c, [[-8, -168], [0, -182], [8, -168]], '#a8822a', 1.4);
  // Hide banner in the team color hanging from the roof.
  banner(c, 16, -120, 34, team, 14);
  // Doorway.
  rrect(c, -13, -64, 26, 64, 10, '#2a1a10');
  // Palisade of sharpened stakes in front.
  for (let i = 0; i < 9; i++) {
    const x = -58 + i * 14.5;
    const h = 44 + ((i * 7) % 3) * 4;
    shape(c, [[x, 0], [x, -h], [x + 5, -h - 9], [x + 10, -h], [x + 10, 0]], i % 2 ? C.wood : C.woodB, 1.4);
  }
  poly(c, [[-58, -22], [58, -22]], 2.4, C.leather);
  // Team flag on top.
  flag(c, 0, -210 + 24, team);
}

/* ---- Castle: a stone keep with a gate and battlements --------------------- */

function drawCastleBase(c: Ctx, team: string): void {
  const stone = '#9a978f';
  // Back tower.
  rrect(c, -56, -178, 34, 178, 2, shade(stone, 0.85));
  for (let i = 0; i < 3; i++) rrect(c, -58 + i * 13, -190, 10, 12, 1, shade(stone, 0.85));
  // Keep.
  rrect(c, -44, -150, 96, 150, 2, stone);
  brickLines(c, -44, -150, 96, 150, 12);
  for (let i = 0; i < 5; i++) rrect(c, -46 + i * 20, -164, 14, 14, 1, stone);
  // Arrow slits.
  for (const x of [-26, 30]) rrect(c, x, -128, 4, 16, 2, '#2a2622', 1);
  // Gate with portcullis.
  c.beginPath();
  c.moveTo(-18, 0);
  c.lineTo(-18, -44);
  c.arc(0, -44, 18, Math.PI, 0);
  c.lineTo(18, 0);
  c.closePath();
  c.fillStyle = '#2a1a10';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = OUT;
  c.stroke();
  c.strokeStyle = C.iron;
  c.lineWidth = 1.6;
  for (let x = -14; x <= 14; x += 7) {
    c.beginPath();
    c.moveTo(x, -58);
    c.lineTo(x, -12);
    c.stroke();
  }
  for (let y = -50; y < -10; y += 10) {
    c.beginPath();
    c.moveTo(-16, y);
    c.lineTo(16, y);
    c.stroke();
  }
  // Hanging banners and a flag.
  banner(c, -38, -140, 44, team);
  banner(c, 34, -140, 44, team);
  flag(c, -39, -199, team);
}

/* ---- Renaissance: a plastered bastion with a clock tower ------------------ */

function drawRenaissanceBase(c: Ctx, team: string): void {
  const plaster = '#e8dcc0';
  // Clock tower with a dome.
  rrect(c, -30, -176, 40, 90, 2, plaster);
  c.beginPath();
  c.arc(-10, -176, 20, Math.PI, 0);
  c.closePath();
  c.fillStyle = team;
  c.fill();
  c.lineWidth = 1.6;
  c.strokeStyle = OUT;
  c.stroke();
  dot(c, [-10, -197], 3, C.gold);
  dot(c, [-10, -150], 9, '#f8f2e0');
  poly(c, [[-10, -150], [-10, -156]], 1, OUT);
  poly(c, [[-10, -150], [-5, -150]], 1, OUT);
  // Main wall with sloped bastion base.
  shape(c, [[-56, 0], [-50, -96], [54, -96], [58, 0]], plaster, 2);
  shape(c, [[-60, 0], [-56, -30], [58, -30], [62, 0]], '#b8a888', 2);
  brickLines(c, -58, -30, 118, 30, 10);
  // Timber trim and windows.
  poly(c, [[-50, -96], [54, -96]], 3, C.woodB);
  for (const x of [-40, 30]) {
    rrect(c, x, -84, 14, 20, 6, '#4a6a8a');
    poly(c, [[x + 7, -84], [x + 7, -64]], 1, C.woodB);
  }
  // Cannon ports.
  for (const x of [-38, 38]) dot(c, [x, -46], 5, '#2a2622');
  // Gate.
  rrect(c, -15, -60, 30, 60, 13, C.woodB);
  poly(c, [[0, -58], [0, -2]], 1.2, OUT);
  dot(c, [-4, -28], 1.2, C.gold);
  dot(c, [4, -28], 1.2, C.gold);
  banner(c, 40, -94, 34, team);
}

/* ---- Modern: a concrete bunker with sandbags and a radar ------------------ */

function drawModernBase(c: Ctx, team: string): void {
  const concrete = '#9a9a92';
  // Radar mast and dish.
  poly(c, [[-40, -110], [-40, -176]], 2.4, C.iron);
  c.save();
  c.translate(-40, -182);
  c.rotate(-0.4);
  ellipse(c, 0, 0, 14, 5, 0, '#c8c8c0');
  c.restore();
  // Antenna with a blinking light.
  poly(c, [[34, -110], [34, -196]], 1.2, C.iron);
  glow(c, [34, -198], 6, team, 0.9);
  dot(c, [34, -198], 2, team);
  // Bunker body.
  shape(c, [[-56, 0], [-52, -112], [52, -112], [58, 0]], concrete, 2);
  rrect(c, -58, -120, 116, 12, 3, shade(concrete, 0.85));
  c.fillStyle = rgba(OUT, 0.18);
  for (const [x, y, w, h] of [[-40, -96, 18, 10], [10, -80, 26, 8], [-20, -48, 14, 12]] as const) c.fillRect(x, y, w, h);
  // Team stripe and firing slit.
  c.fillStyle = team;
  c.fillRect(-54, -74, 110, 10);
  rrect(c, -30, -100, 60, 8, 2, '#1e1e1c');
  // Blast door.
  rrect(c, -16, -52, 32, 52, 3, '#5a5a52');
  for (let y = -46; y < -4; y += 9) poly(c, [[-14, y], [14, y]], 0.8, rgba(OUT, 0.5));
  // Sandbags along the front.
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 6; i++) {
      const x = -60 + i * 20 + (r % 2 ? 10 : 0);
      if (x + 20 > 62) continue;
      rrect(c, x, -8 - r * 8, 20, 9, 4, '#b8a878', 1.3);
    }
  }
}

/* ---- Future: a white citadel with glowing lines and an energy dome -------- */

function drawFutureBase(c: Ctx, team: string): void {
  // Energy dome shimmer behind.
  c.fillStyle = rgba(team, 0.12);
  c.beginPath();
  c.arc(0, -40, 72, Math.PI, 0);
  c.fill();
  c.strokeStyle = rgba(team, 0.45);
  c.lineWidth = 1.4;
  c.stroke();
  // Spire.
  shape(c, [[-12, -120], [0, -196], [12, -120]], C.whiteB, 1.6);
  glow(c, [0, -186], 10, team, 0.9);
  dot(c, [0, -186], 2.6, '#ffffff');
  // Main body with angled wings.
  shape(c, [[-58, 0], [-50, -84], [-24, -128], [24, -128], [50, -84], [58, 0]], C.white, 2);
  shape(c, [[-50, -84], [-24, -128], [-20, -84]], C.whiteB, 1.2);
  // Glowing team lines.
  c.strokeStyle = team;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(-48, -76);
  c.lineTo(48, -76);
  c.moveTo(-40, -100);
  c.lineTo(40, -100);
  c.stroke();
  glow(c, [0, -76], 40, team, 0.25);
  // Windows.
  for (const x of [-36, -14, 8, 30]) rrect(c, x, -118 + (x === -36 || x === 30 ? 26 : 0), 8, 10, 2, '#20304a', 1.2);
  // Door with a light frame.
  rrect(c, -15, -52, 30, 52, 8, '#20304a');
  c.strokeStyle = team;
  c.lineWidth = 1.6;
  c.strokeRect(-12, -48, 24, 46);
  glow(c, [0, -26], 16, team, 0.35);
}

/** A turret ledge (platform) per age, 46 x 8 around its top-center. */
export function drawLedge(c: Ctx, age: number, team: string): void {
  switch (age) {
    case 0:
      poly(c, [[-22, 2], [22, 2]], 4, C.wood);
      poly(c, [[-16, 4], [-6, 14]], 2, C.woodB);
      poly(c, [[16, 4], [6, 14]], 2, C.woodB);
      break;
    case 1:
      rrect(c, -23, 0, 46, 7, 1, '#9a978f');
      shape(c, [[-12, 7], [12, 7], [4, 16], [-4, 16]], '#8a877f', 1.2);
      break;
    case 2:
      rrect(c, -23, 0, 46, 6, 2, C.woodB);
      rrect(c, -20, 6, 40, 3, 1, '#e8dcc0', 1);
      poly(c, [[-14, 9], [-4, 17]], 1.6, C.iron);
      break;
    case 3:
      rrect(c, -23, 0, 46, 6, 1, '#7a7a72');
      c.fillStyle = team;
      c.fillRect(-21, 2, 42, 1.6);
      poly(c, [[-16, 6], [-8, 16]], 1.6, C.iron);
      poly(c, [[16, 6], [8, 16]], 1.6, C.iron);
      break;
    default:
      rrect(c, -23, 0, 46, 5, 2.5, C.white);
      glow(c, [0, 8], 12, team, 0.5);
      c.fillStyle = team;
      c.fillRect(-18, 5, 36, 1.4);
  }
}

/** Cracks drawn over a damaged base: `level` 1 (hurt) or 2 (badly hurt). */
export function drawBaseDamage(c: Ctx, level: number): void {
  const cracks: [number, number][][] = [
    [[-30, -120], [-22, -104], [-26, -92], [-16, -80]],
    [[20, -60], [28, -70], [24, -82], [34, -94]],
    [[-8, -150], [-2, -138], [-10, -126]],
  ];
  const extra: [number, number][][] = [
    [[36, -130], [28, -116], [34, -104], [26, -92], [30, -80]],
    [[-44, -60], [-36, -48], [-42, -36], [-34, -22]],
    [[4, -100], [12, -92], [8, -80], [16, -70]],
  ];
  const draw = (list: [number, number][][]): void => {
    for (const pts of list) {
      c.beginPath();
      c.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
      c.lineWidth = 2.4;
      c.strokeStyle = rgba(OUT, 0.8);
      c.stroke();
    }
  };
  draw(cracks);
  if (level >= 2) {
    draw(extra);
    // Scorched patches.
    for (const [x, y, r] of [[-20, -70, 16], [24, -120, 12], [30, -30, 10]] as const) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(20,14,10,0.6)');
      g.addColorStop(1, 'rgba(20,14,10,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }
}
