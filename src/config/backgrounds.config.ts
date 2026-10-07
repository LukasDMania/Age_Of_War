/**
 * Background options to try while playtesting (owner, 2026-09-26). Art from
 * the owner's `art/` folder, resized to 720 px high into
 * `public/assets/backgrounds/<id>/` (back layer first). Cycle them in game
 * with the HUD's background button or its key (Y); the owner will pick one.
 *
 * Each layer scrolls at `scroll` x the camera (0 = fixed sky, 1 = moves with
 * the lane) for parallax when the camera pans to the buildings, and cloud
 * layers `drift` slowly on their own (px per second).
 *
 * `ground`: 'strip' keeps the game's own ground strip and lane line under
 * the units (for art without a flat ground); 'art' lets the art's ground
 * layer be the ground (its top edge lines up with the lane).
 */
export interface BackgroundLayer {
  file: string;
  scroll: number;
  drift?: number;
}

export interface BackgroundDef {
  id: string;
  name: string;
  layers: readonly BackgroundLayer[];
  ground: 'strip' | 'art';
  /** Color of the ground strip; the age's ground color when not set. */
  stripColor?: number;
}

const L = (file: string, scroll: number, drift?: number): BackgroundLayer =>
  drift === undefined ? { file, scroll } : { file, scroll, drift };

const FOREST_LAYERS: readonly BackgroundLayer[] = [
  L('00-11_background.png', 0),
  L('01-10_distant_clouds.png', 0.02, 3),
  L('02-09_distant_clouds1.png', 0.04, 5),
  L('03-08_clouds.png', 0.06, 8),
  L('04-07_huge_clouds.png', 0.1, 4),
  L('05-06_hill2.png', 0.2),
  L('06-05_hill1.png', 0.3),
  L('07-04_bushes.png', 0.45),
  L('08-03_distant_trees.png', 0.55),
  L('09-02_trees-and-bushes.png', 0.75),
  L('10-01_ground.png', 1),
];

/** The battle background until a player picks another (Y): owner, 2026-10-07: "make the background BG: Forest path". */
export const DEFAULT_BACKGROUND_ID = 'forest-path';

export const BACKGROUNDS: readonly BackgroundDef[] = [
  { id: 'plain', name: 'Plain (age colors)', layers: [], ground: 'strip' },
  { id: 'forest-path', name: 'Forest path', layers: FOREST_LAYERS, ground: 'art' },
  { id: 'forest-path-bright', name: 'Forest path (bright)', layers: FOREST_LAYERS, ground: 'art' },
  {
    id: 'mountain-lake',
    name: 'Mountain lake',
    ground: 'strip',
    stripColor: 0x3a3450,
    layers: [
      L('00-sky.png', 0),
      L('01-clouds_1.png', 0.03, 4),
      L('02-clouds_2.png', 0.06, 7),
      L('03-rocks_1.png', 0.2),
      L('04-clouds_4.png', 0.25, 10),
      L('05-rocks_2.png', 0.35),
      L('06-clouds_3.png', 0.4, 12),
    ],
  },
  {
    id: 'cloudy-peaks',
    name: 'Cloudy peaks',
    ground: 'strip',
    stripColor: 0x4a3b3a,
    layers: [
      L('00-sky.png', 0),
      L('01-clouds_1.png', 0.03, 4),
      L('02-clouds_2.png', 0.06, 6),
      L('03-rocks_3.png', 0.15),
      L('04-rocks_2.png', 0.25),
      L('05-clouds_3.png', 0.3, 9),
      L('06-birds.png', 0.35, 20),
      L('07-rocks_1.png', 0.45),
      L('08-pines.png', 0.6),
    ],
  },
  {
    id: 'night-forest',
    name: 'Night forest',
    ground: 'strip',
    stripColor: 0x1b1a2b,
    layers: [
      L('00-sky.png', 0),
      L('01-clouds_1.png', 0.04, 5),
      L('02-clouds_2.png', 0.08, 8),
      L('03-rocks.png', 0.2),
      L('04-ground_1.png', 0.35),
      L('05-ground_2.png', 0.5),
      L('06-plant.png', 0.6),
      L('07-ground_3.png', 0.7),
    ],
  },
  {
    id: 'waterfall',
    name: 'Waterfall',
    ground: 'strip',
    stripColor: 0x23324e,
    layers: [
      L('00-sky.png', 0),
      L('01-clouds_1.png', 0.04, 5),
      L('02-clouds_2.png', 0.08, 8),
      L('03-rocks.png', 0.25),
      L('04-ground.png', 0.5),
    ],
  },
];

export function backgroundLayerUrl(def: BackgroundDef, layer: BackgroundLayer): string {
  return `assets/backgrounds/${def.id}/${layer.file}`;
}

export function backgroundLayerKey(def: BackgroundDef, layer: BackgroundLayer): string {
  return `bg-${def.id}-${layer.file}`;
}

/** Remembers the playtester's pick between sessions (per browser). */
export const BACKGROUND_STORAGE_KEY = 'aow-background';
