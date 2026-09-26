/**
 * Dev-only art lab (`/artlab.html` on the dev server, not part of the game
 * build): draws every frame of the rig art in a grid so it can be reviewed in
 * one screenshot. Query: `?kinds=clubber,archer` or `?age=1`, `?team=enemy`,
 * `?scale=1.4`, `?anims=walk,attack`.
 */
import { drawRig, RIG_KINDS, type RigAnim, type RigKind } from '@/art/rigDraw';

const params = new URLSearchParams(location.search);
const age = params.get('age');
const kinds: RigKind[] = params.get('kinds')
  ? (params.get('kinds')!.split(',') as RigKind[])
  : age !== null
    ? RIG_KINDS.slice(Number(age) * 5, Number(age) * 5 + 5)
    : [...RIG_KINDS];
const team = params.get('team') === 'enemy' ? '#d9483d' : '#3d7fd9';
const scale = Number(params.get('scale') ?? 1.3);
const anims = (params.get('anims') ?? 'stand,walk,attack,die').split(',') as RigAnim[];
const FRAMES: Record<RigAnim, number> = { stand: 1, walk: 10, attack: 10, die: 8 };
const step = Number(params.get('step') ?? 1);
const cellW = 100 * scale;
const cellH = Number(params.get("h") ?? 76) * scale;
const cols = anims.reduce((n, a) => n + Math.ceil(FRAMES[a] / step), 0);
const canvas = document.getElementById('lab') as HTMLCanvasElement;
canvas.width = Math.min(8000, cols * cellW + 10);
canvas.height = kinds.length * cellH + 10;
const c = canvas.getContext('2d')!;
kinds.forEach((kind, row) => {
  let col = 0;
  for (const anim of anims) {
    for (let i = 0; i < FRAMES[anim]; i += step) {
      const x = 5 + col * cellW;
      const y = 5 + row * cellH;
      c.fillStyle = (col + row) % 2 ? '#353a42' : '#30343b';
      c.fillRect(x, y, cellW, cellH);
      c.save();
      c.beginPath();
      c.rect(x, y, cellW, cellH);
      c.clip();
      c.translate(x + cellW / 2, y + cellH - 6 * scale);
      c.scale(scale, scale);
      drawRig(c, kind, team, anim, FRAMES[anim] === 1 ? 0 : i / FRAMES[anim]);
      c.restore();
      if (i === 0) {
        c.fillStyle = '#9aa';
        c.fillText(`${kind} ${anim}`, x + 3, y + 11);
      }
      col++;
    }
  }
});
if (!params.has('turrets') && !params.has('buildings')) (window as unknown as { __labReady: boolean }).__labReady = true;

/** `?bounds`: the drawn extent of each kind over all frames, in rig units. */
if (params.has('bounds')) {
  const S = 4;
  const W = 200 * S;
  const H = 160 * S;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d', { willReadFrequently: true })!;
  type Box = { minX: number; maxX: number; minY: number; maxY: number };
  const result: Record<string, { live: Box; die: Box }> = {};
  const measure = (kind: RigKind, list: RigAnim[]): Box => {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const anim of list) {
      for (let i = 0; i < FRAMES[anim]; i++) {
        o.clearRect(0, 0, W, H);
        o.save();
        o.translate(W / 2, H * 0.8);
        o.scale(S, S);
        drawRig(o, kind, team, anim, FRAMES[anim] === 1 ? 0 : i / FRAMES[anim]);
        o.restore();
        const data = o.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3]! > 24) {
              const rx = (x - W / 2) / S;
              const ry = (y - H * 0.8) / S;
              if (rx < b.minX) b.minX = rx;
              if (rx > b.maxX) b.maxX = rx;
              if (ry < b.minY) b.minY = ry;
              if (ry > b.maxY) b.maxY = ry;
            }
          }
        }
      }
    }
    return { minX: Math.floor(b.minX), maxX: Math.ceil(b.maxX), minY: Math.floor(b.minY), maxY: Math.ceil(b.maxY) };
  };
  for (const kind of RIG_KINDS) result[kind] = { live: measure(kind, ['stand', 'walk', 'attack']), die: measure(kind, ['die']) };
  (window as unknown as { __bounds: unknown }).__bounds = result;
}

/** `?turrets`: every turret at levels 0-3 (mount + head at rest and aimed). */
if (params.has('turrets')) {
  void import('@/art/turretDraw').then(({ drawTurretMount, drawTurretHead, drawTurretFlash, TURRET_MOTION }) => {
    const ids = Object.keys(TURRET_MOTION) as (keyof typeof TURRET_MOTION)[];
    const ts = Number(params.get('scale') ?? 3);
    const cw = 70 * ts;
    const ch = 62 * ts;
    canvas.width = cw * 8 + 10;
    canvas.height = ch * ids.length + 10;
    const g = canvas.getContext('2d')!;
    ids.forEach((id, row) => {
      const m = TURRET_MOTION[id];
      for (let col = 0; col < 8; col++) {
        const lv = col % 4;
        const fired = col >= 4;
        const x = 5 + col * cw;
        const y = 5 + row * ch;
        g.fillStyle = (row + col) % 2 ? '#3a4150' : '#353b48';
        g.fillRect(x, y, cw, ch);
        g.save();
        g.translate(x + cw * 0.42, y + ch - 10 * ts);
        g.scale(ts, ts);
        g.fillStyle = '#3a3027';
        g.fillRect(-23, 0, 46, 6);
        drawTurretMount(g, id, team, lv);
        g.save();
        g.translate(m.pivot[0], m.pivot[1]);
        const angle = m.aim !== 'track' ? (fired ? (m.release ?? 0) : m.rest) : fired ? -0.35 : m.rest;
        g.rotate(-angle);
        if (fired && m.aim === 'track') g.translate(-m.recoil, 0);
        drawTurretHead(g, id, team, lv);
        if (fired && m.flash !== 'none') {
          g.translate(m.barrel, 0);
          drawTurretFlash(g, m.flash);
        }
        g.restore();
        g.restore();
        if (col === 0) {
          g.fillStyle = '#9aa';
          g.fillText(id, x + 3, y + 11);
        }
      }
    });
    (window as unknown as { __labReady: boolean }).__labReady = true;
  });
}

/** `?buildings`: every building at levels 1, 3, 5 | 6, 10 | 11, 15 | 16, 20 | 21, 25. */
if (params.has('buildings')) {
  void import('@/art/buildingDraw').then(({ drawBuildingArt }) => {
    const ids = ['mine', 'library', 'forge', 'barracks', 'shrine', 'market'] as const;
    const levels = [1, 3, 5, 6, 10, 11, 15, 16, 20, 21, 25];
    const bs = Number(params.get('scale') ?? 1.2);
    const cw = 140 * bs;
    const ch = 124 * bs;
    canvas.width = cw * levels.length + 10;
    canvas.height = ch * ids.length + 10;
    const g = canvas.getContext('2d')!;
    ids.forEach((id, row) => {
      levels.forEach((level, col) => {
        const x = 5 + col * cw;
        const y = 5 + row * ch;
        g.fillStyle = (row + col) % 2 ? '#8fb8d8' : '#9ac4e0';
        g.fillRect(x, y, cw, ch);
        g.save();
        g.translate(x + cw / 2, y + ch - 6 * bs);
        g.scale(bs, bs);
        drawBuildingArt(g, id, level, team);
        g.restore();
        g.fillStyle = '#123';
        g.fillText(`${id} L${level}`, x + 3, y + 11);
      });
    });
    (window as unknown as { __labReady: boolean }).__labReady = true;
  });
}
