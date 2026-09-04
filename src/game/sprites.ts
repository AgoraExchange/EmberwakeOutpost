import { Assets, Texture } from 'pixi.js';
import { assetPath } from './pathing';

/**
 * Optional sprite art.
 *
 * Every visual in the game has a procedural fallback, so the game runs with zero
 * art files present. Dropping a PNG in and listing it in the manifest index makes
 * the renderer prefer it — art can therefore land one piece at a time without any
 * migration step and without a broken intermediate state.
 */

export type SpriteKey =
  | 'building/furnace' | 'building/cookout' | 'building/mess-hall'
  | 'building/smokehouse' | 'building/infirmary' | 'building/timber-post'
  | 'creature/rimeback' | 'creature/icehorn'
  | 'actor/trailwarden' | 'actor/trailwarden-unarmed' | 'actor/villager' | 'actor/worker' | 'actor/guard'
  | 'prop/tree' | 'prop/stump' | 'prop/rock' | 'prop/crates' | 'prop/barrel'
  | 'prop/fence-post' | 'prop/gate-closed' | 'prop/gate-open';

/**
 * Where each sprite's origin sits inside its canvas, as a 0-1 fraction. The y value
 * is the ground contact point, so a building's anchor is where its base meets the
 * floor rather than the middle of the image.
 */
export const SPRITE_ANCHORS: Record<SpriteKey, [number, number]> = {
  'building/furnace': [0.5, 0.82],
  'building/cookout': [0.5, 0.82],
  'building/mess-hall': [0.5, 0.82],
  'building/smokehouse': [0.5, 0.82],
  'building/infirmary': [0.5, 0.82],
  'building/timber-post': [0.5, 0.84],
  'creature/rimeback': [0.5, 0.86],
  'creature/icehorn': [0.5, 0.86],
  'actor/trailwarden': [0.5, 0.88],
  'actor/trailwarden-unarmed': [0.5, 0.94],
  'actor/villager': [0.5, 0.88],
  'actor/worker': [0.5, 0.88],
  'actor/guard': [0.5, 0.88],
  'prop/tree': [0.5, 0.9],
  'prop/stump': [0.5, 0.86],
  'prop/rock': [0.5, 0.84],
  'prop/crates': [0.5, 0.86],
  'prop/barrel': [0.5, 0.88],
  'prop/fence-post': [0.5, 0.92],
  'prop/gate-closed': [0.5, 0.88],
  'prop/gate-open': [0.5, 0.88]
};

/**
 * How many world units wide the sprite should be drawn at. Art is authored at 2x
 * for crisp rendering on dense displays, so a 512px-wide building draws 256 wide.
 */
export const SPRITE_WIDTHS: Record<SpriteKey, number> = {
  'building/furnace': 190, 'building/cookout': 250, 'building/mess-hall': 260,
  'building/smokehouse': 240, 'building/infirmary': 150, 'building/timber-post': 150,
  'creature/rimeback': 150, 'creature/icehorn': 185,
  'actor/trailwarden': 110, 'actor/trailwarden-unarmed': 110, 'actor/villager': 95, 'actor/worker': 95, 'actor/guard': 100,
  'prop/tree': 150, 'prop/stump': 90, 'prop/rock': 120, 'prop/crates': 120,
  'prop/barrel': 70, 'prop/fence-post': 60, 'prop/gate-closed': 200, 'prop/gate-open': 200
};

const textures = new Map<SpriteKey, Texture>();
let loaded = false;

/**
 * Reads the manifest index and loads only the sprites it lists. Using an index
 * rather than probing each path avoids a burst of 404s when art is absent, and
 * lets a partially-illustrated build load exactly what exists.
 */
export async function loadSprites(): Promise<void> {
  if (loaded) return;
  loaded = true;
  let keys: string[] = [];
  try {
    const response = await fetch(assetPath('art/sprites/index.json'), { cache: 'no-cache' });
    if (!response.ok) return;
    const parsed: unknown = await response.json();
    if (!Array.isArray(parsed)) return;
    keys = parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    // No manifest, or it could not be parsed: the game runs fully procedural.
    return;
  }

  await Promise.all(keys.map(async key => {
    if (!(key in SPRITE_ANCHORS)) return;
    try {
      const texture = await Assets.load<Texture>(assetPath(`art/sprites/${key}.png`));
      textures.set(key as SpriteKey, texture);
    } catch {
      // A listed-but-missing file must never break startup.
    }
  }));
}

/** The loaded texture for a key, or null when that art has not been supplied. */
export function sprite(key: SpriteKey): Texture | null {
  return textures.get(key) ?? null;
}

/** True when any art at all was loaded, useful for debugging a build. */
export function spriteCount(): number {
  return textures.size;
}
