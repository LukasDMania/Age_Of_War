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
if (!params.has('turrets') && !params.has('buildings') && !params.has('mechs') && !params.has('muzzles')) (window as unknown as { __labReady: boolean }).__labReady = true;

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

/**
 * `?mechs`: the player's Mech (the Mech workshop). By default six designs
 * that between them use every part, standing, one row per age. With
 * `&design=legs,torso,head,left,right` one design's frames per age
 * (`&anims=walk,attack,die`). With `&bounds` the drawn extent over those
 * designs and all their frames, in rig units (`window.__mechBounds`).
 */
if (params.has('mechs')) {
  void import('@/art/mechDraw').then(({ drawMechDesign }) => {
    type Design = import('@config/mech.config').MechDesign;
    const showcase: Design[] = [
      { legs: 'walker', torso: 'frame', head: 'visor', left: 'fist', right: 'launcher', module: 'none' },
      { legs: 'treads', torso: 'hull', head: 'crest', left: 'shield', right: 'blade', module: 'dome' },
      { legs: 'stompers', torso: 'reactor', head: 'beacon', left: 'drill', right: 'fist', module: 'overload' },
      { legs: 'striders', torso: 'armory', head: 'siren', left: 'launcher', right: 'launcher', module: 'smoke' },
      { legs: 'hover', torso: 'bay', head: 'scope', left: 'minigun', right: 'railgun', module: 'orbital' },
      { legs: 'spider', torso: 'overcharge', head: 'taunt', left: 'flamer', right: 'tesla', module: 'emp' },
      { legs: 'jump', torso: 'carrier', head: 'salvage', left: 'wrecker', right: 'grapple', module: 'leap' },
      { legs: 'treads', torso: 'armory', head: 'crest', left: 'blade', right: 'blade', module: 'overdrive' },
    ];
    const one = params.get('design');
    const designs: Design[] = one
      ? [Object.fromEntries(['legs', 'torso', 'head', 'left', 'right', 'module'].map((k, i) => [k, one.split(',')[i] ?? 'none'])) as unknown as Design]
      : showcase;
    const ms = Number(params.get('scale') ?? 1.6);
    const cw = 110 * ms;
    const ch = 124 * ms;
    const frames: { anim: RigAnim; u: number }[] = one
      ? anims.flatMap((anim) => Array.from({ length: Math.ceil(FRAMES[anim] / step) }, (_, i) => ({ anim, u: FRAMES[anim] === 1 ? 0 : (i * step) / FRAMES[anim] })))
      : [{ anim: 'stand' as RigAnim, u: 0 }];
    const columns = one ? frames.length : designs.length;
    canvas.width = Math.min(8000, cw * columns + 10);
    canvas.height = ch * 5 + 10;
    const g = canvas.getContext('2d')!;
    for (let age = 0; age < 5; age++) {
      for (let col = 0; col < columns; col++) {
        const design = one ? designs[0]! : designs[col]!;
        const frame = one ? frames[col]! : frames[0]!;
        const x = 5 + col * cw;
        const y = 5 + age * ch;
        g.fillStyle = (age + col) % 2 ? '#3a4150' : '#353b48';
        g.fillRect(x, y, cw, ch);
        g.save();
        g.beginPath();
        g.rect(x, y, cw, ch);
        g.clip();
        g.translate(x + cw * 0.38, y + ch - 8 * ms);
        g.scale(ms, ms);
        drawMechDesign(g, { ...design, age }, team, frame.anim, frame.u);
        g.restore();
        g.fillStyle = '#9aa';
        g.fillText(one ? `age ${age} ${frame.anim}` : `age ${age}: ${design.legs} ${design.torso} ${design.head} ${design.left}/${design.right}`, x + 3, y + 11);
      }
    }
    if (params.has('bounds')) {
      const S = 3;
      const W = 160 * S;
      const H = 150 * S;
      const off = document.createElement('canvas');
      off.width = W;
      off.height = H;
      const o = off.getContext('2d', { willReadFrequently: true })!;
      const measure = (list: RigAnim[]): number[] => {
        const b = [Infinity, -Infinity, Infinity, -Infinity];
        for (let age = 0; age < 5; age++) {
          for (const design of showcase) {
            for (const anim of list) {
              for (let i = 0; i < FRAMES[anim]; i++) {
                o.clearRect(0, 0, W, H);
                o.save();
                o.translate(W * 0.4, H * 0.85);
                o.scale(S, S);
                drawMechDesign(o, { ...design, age }, team, anim, FRAMES[anim] === 1 ? 0 : i / FRAMES[anim]);
                o.restore();
                const data = o.getImageData(0, 0, W, H).data;
                for (let yy = 0; yy < H; yy++) {
                  for (let xx = 0; xx < W; xx++) {
                    if (data[(yy * W + xx) * 4 + 3]! > 24) {
                      const rx = (xx - W * 0.4) / S;
                      const ry = (yy - H * 0.85) / S;
                      b[0] = Math.min(b[0]!, rx);
                      b[1] = Math.max(b[1]!, rx);
                      b[2] = Math.min(b[2]!, ry);
                      b[3] = Math.max(b[3]!, ry);
                    }
                  }
                }
              }
            }
          }
        }
        return [Math.floor(b[0]!), Math.ceil(b[1]!), Math.floor(b[2]!), Math.ceil(b[3]!)];
      };
      (window as unknown as { __mechBounds: unknown }).__mechBounds = { live: measure(['stand', 'walk', 'attack']), die: measure(['die']) };
    }
    (window as unknown as { __labReady: boolean }).__labReady = true;
  });
}


/**
 * `?muzzles`: where every ranged unit's shot leaves its art (2026-09-28).
 * Draws each one's attack frame just before release with a red dot on the
 * point the drawing marked (`markShot`), and puts the numbers, in px from
 * the unit's position (forward, up negative), in `window.__muzzles`: copy
 * them into the units' `attack.muzzle` (and `MECH_LAUNCHER_MUZZLES`) after
 * changing a ranged unit's art.
 */
if (params.has('muzzles')) {
  void Promise.all([
    import('@/art/rigKit'),
    import('@config/unitArt.config'),
    import('@entities/unitDefinitions'),
    import('@/art/mechDraw'),
    import('@config/mech.config'),
  ]).then(([kit, art, defs, mechDraw, mech]) => {
    const RELEASE = 0.44;
    const probe = (draw: (g: CanvasRenderingContext2D) => void): { tag: string; at: [number, number] }[] => {
      const off = document.createElement('canvas').getContext('2d')!;
      kit.shotProbe.active = true;
      kit.shotProbe.marks = [];
      draw(off);
      kit.shotProbe.active = false;
      return kit.shotProbe.marks as { tag: string; at: [number, number] }[];
    };
    const units: Record<string, { x: number; y: number }> = {};
    const ranged = defs.UNIT_DEFINITIONS.filter((d) => d.attack?.projectileKey || d.utility?.kind === 'aoe');
    const sheet = document.getElementById('lab') as HTMLCanvasElement;
    const S = 2.2;
    sheet.width = ranged.length * 110 * S * 0.5 + 20;
    sheet.height = 160 * S * 0.5 + 20;
    const g = sheet.getContext('2d')!;
    g.fillStyle = '#30343b';
    g.fillRect(0, 0, sheet.width, sheet.height);
    ranged.forEach((d, i) => {
      const ua = art.UNIT_ART[d.id];
      const rig = ua?.rig;
      if (!ua || !rig) return;
      const L = rig.live;
      const anchorX = L[0] + (ua.originX ?? 0.5) * (L[1] - L[0]);
      const marks = probe((o) => drawRig(o, rig.kind, team, 'attack', RELEASE));
      const at = marks[marks.length - 1]?.at;
      if (!at) return;
      units[d.id] = { x: Math.round((at[0] - anchorX) * rig.pxPerUnit), y: Math.round(at[1] * rig.pxPerUnit) };
      const k = S * 0.5 * 1.4;
      const cx = 10 + i * 110 * S * 0.5 + 40 * S * 0.5;
      const cy = sheet.height - 20;
      g.save();
      g.translate(cx, cy);
      g.scale(k, k);
      drawRig(g, rig.kind, team, 'attack', RELEASE);
      g.fillStyle = '#ff2a2a';
      g.beginPath();
      g.arc(at[0], at[1], 2.2, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillStyle = '#cfd';
      g.fillText(`${d.id.split('-').slice(1).join('-')} ${units[d.id]!.x},${units[d.id]!.y}`, cx - 40, 14);
    });
    // The player's Mech: a launcher in each arm, per legs (the hip height changes).
    const mechMuzzles: Record<string, { near: { x: number; y: number }; far: { x: number; y: number } }> = {};
    for (const legs of Object.keys(mech.MECH_LEGS)) {
      const marks = probe((o) =>
        mechDraw.drawMechDesign(o, { legs: legs as 'walker', torso: 'frame', head: 'visor', left: 'launcher', right: 'launcher', module: 'none', age: 3 }, team, 'attack', RELEASE),
      );
      const px = (tag: string): { x: number; y: number } => {
        const m = marks.find((x) => x.tag === tag)?.at ?? [0, 0];
        return { x: Math.round(m[0] * 1.15), y: Math.round(m[1] * 1.15) };
      };
      mechMuzzles[legs] = { near: px('near'), far: px('far') };
    }
    (window as unknown as { __muzzles: unknown }).__muzzles = { units, mech: mechMuzzles };
    (window as unknown as { __labReady: boolean }).__labReady = true;
  });
}
