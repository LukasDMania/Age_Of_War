import Phaser from 'phaser';
import { drawHangar, HANGAR_SIZE } from '@/art/hangarDraw';

/** The hangar's backdrop for an age (drawn once per age, kept). */
export function ensureHangarBackdrop(scene: Phaser.Scene, age: number): string {
  const key = `hangar-bg-${age}`;
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = HANGAR_SIZE.width;
  canvas.height = HANGAR_SIZE.height;
  const c = canvas.getContext('2d');
  if (c) drawHangar(c, age);
  scene.textures.addCanvas(key, canvas);
  return key;
}
