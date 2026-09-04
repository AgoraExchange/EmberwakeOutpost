import type { Graphics } from 'pixi.js';
import { WORLD } from './config';
import type { Vec2 } from './types';

/**
 * 2:1 dimetric projection.
 *
 * The simulation keeps running in flat, axis-aligned world space (x, y) — collision
 * rectangles, AI steering, landmark coordinates and the save schema are untouched.
 * Only rendering is projected, by rotating world space 45 degrees and compressing
 * the vertical axis by half.
 */
const AXIS = Math.SQRT1_2;
const SQUASH = 0.5;

export const ISO_X = AXIS;
export const ISO_Y = AXIS * SQUASH;

export function isoX(x: number, y: number): number { return (x - y) * ISO_X; }
export function isoY(x: number, y: number): number { return (x + y) * ISO_Y; }

export function worldToScreen(x: number, y: number): Vec2 {
  return { x: (x - y) * ISO_X, y: (x + y) * ISO_Y };
}

export function screenToWorld(screenX: number, screenY: number): Vec2 {
  const difference = screenX / ISO_X;
  const sum = screenY / ISO_Y;
  return { x: (sum + difference) / 2, y: (sum - difference) / 2 };
}

/** Painter's-algorithm sort key: things further down the screen draw in front. */
export function depth(x: number, y: number, bias = 0): number {
  return (x + y) * ISO_Y + bias;
}

/** Rotates a screen-space input vector into the world-space direction it should drive. */
export function inputToWorld(x: number, y: number): Vec2 {
  return { x: x * AXIS + y * AXIS, y: -x * AXIS + y * AXIS };
}

/** True when a world-space velocity moves left across the screen (for sprite flipping). */
export function facesLeft(vx: number, vy: number): boolean {
  return vx - vy < 0;
}

/** Projected bounding box of the whole world, used to clamp the camera. */
export const ISO_BOUNDS = {
  minX: -WORLD.height * ISO_X,
  maxX: WORLD.width * ISO_X,
  minY: 0,
  maxY: (WORLD.width + WORLD.height) * ISO_Y
} as const;

/** The four screen-space corners of a world-space rectangle's ground footprint. */
export function footprint(halfWidth: number, halfDepth: number): Vec2[] {
  return [
    { x: (halfWidth + halfDepth) * ISO_X, y: (halfWidth - halfDepth) * ISO_Y },
    { x: (halfWidth - halfDepth) * ISO_X, y: (halfWidth + halfDepth) * ISO_Y },
    { x: (-halfWidth - halfDepth) * ISO_X, y: (-halfWidth + halfDepth) * ISO_Y },
    { x: (-halfWidth + halfDepth) * ISO_X, y: (-halfWidth - halfDepth) * ISO_Y }
  ];
}

/** Traces a ground-plane diamond (a world-space rect seen in projection) onto a Graphics. */
export function traceFootprint(g: Graphics, halfWidth: number, halfDepth: number, offsetY = 0): void {
  const [east, south, west, north] = footprint(halfWidth, halfDepth) as [Vec2, Vec2, Vec2, Vec2];
  g.moveTo(north.x, north.y + offsetY)
    .lineTo(east.x, east.y + offsetY)
    .lineTo(south.x, south.y + offsetY)
    .lineTo(west.x, west.y + offsetY)
    .closePath();
}
