/**
 * Phaser mirrors a flipped sprite inside its own frame, so an off-center
 * origin ends up on the mirrored spot of the art (e.g. a unit whose frame
 * reaches further forward than back is drawn shifted when flipped). Art is
 * drawn facing right with its anchor at `originX`; this returns the origin
 * to set so that the same point of the art sits on the object's position
 * whether it is flipped or not.
 */
export function flipOriginX(originX: number, flipped: boolean): number {
  return flipped ? 1 - originX : originX;
}
