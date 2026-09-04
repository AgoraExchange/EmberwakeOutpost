import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { BRAND } from './config';
import { footprint, traceFootprint } from './iso';
import { SPRITE_ANCHORS, SPRITE_WIDTHS, sprite, type SpriteKey } from './sprites';
import type { EnemyConfig, EnemyKind, Vec2 } from './types';

export function worldText(value: string, size: number, color = 0xffffff, weight: '700' | '800' | '900' = '700'): Text {
  const text = new Text({ text: value, style: { fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: weight, fill: color, align: 'center', dropShadow: { color: 0x0a2230, alpha: 0.45, blur: 2, distance: 2 } } });
  text.anchor.set(0.5);
  return text;
}

function channel(value: number, factor: number): number {
  return factor >= 0 ? value + (255 - value) * factor : value * (1 + factor);
}

/** factor in [-1, 1]: negative darkens toward black, positive lightens toward white. */
export function shade(color: number, factor: number): number {
  const r = channel((color >> 16) & 0xff, factor);
  const g = channel((color >> 8) & 0xff, factor);
  const b = channel(color & 0xff, factor);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function contactShadow(rx: number, ry: number, alpha = 0.22, color = BRAND.colors.ao): Graphics {
  return new Graphics().ellipse(0, 0, rx, ry).fill({ color, alpha });
}

/** Draws a soft snow-buildup rim along an open polyline onto an existing Graphics. */
export function snowCap(g: Graphics, points: Array<{ x: number; y: number }>, thickness = 7): void {
  if (points.length < 2) return;
  g.moveTo(points[0]!.x, points[0]!.y);
  for (let index = 1; index < points.length; index += 1) g.lineTo(points[index]!.x, points[index]!.y);
  g.stroke({ color: BRAND.colors.snowHighlight, width: thickness, alpha: 0.88, cap: 'round', join: 'round' });
  for (let index = 0; index < points.length - 1; index += 1) {
    const midX = (points[index]!.x + points[index + 1]!.x) / 2;
    const midY = (points[index]!.y + points[index + 1]!.y) / 2;
    g.circle(midX, midY - thickness * 0.1, thickness * 0.62).fill({ color: 0xffffff, alpha: 0.5 });
  }
}

/**
 * Wraps a supplied texture as a world-space sprite, scaled to the width the layout
 * expects and anchored at its ground contact point. Returns null when that art has
 * not been supplied, so the caller falls back to drawing the shape.
 */
export function spriteFor(key: SpriteKey): Sprite | null {
  const texture = sprite(key);
  if (!texture) return null;
  const view = new Sprite(texture);
  const [anchorX, anchorY] = SPRITE_ANCHORS[key];
  view.anchor.set(anchorX, anchorY);
  const width = SPRITE_WIDTHS[key];
  view.scale.set(width / texture.width);
  return view;
}

export interface IsoBuildingSpec {
  /** Footprint half-extent along world x. */
  halfWidth: number;
  /** Footprint half-extent along world y. */
  halfDepth: number;
  /** Wall height in screen pixels. */
  height: number;
  wallColor: number;
  roofColor: number;
  label?: string;
  /** When this art has been supplied, it replaces the drawn box entirely. */
  art?: SpriteKey;
}

export interface IsoBuilding {
  container: Container;
  shadow: Graphics;
  walls: Graphics;
  roof: Graphics;
  sign?: Text;
  /** True when the supplied bitmap art is active instead of the procedural box. */
  illustrated: boolean;
  /** Screen-space y of the roof peak, for hanging signs and progress rings. */
  peakY: number;
}

/**
 * An isometric box: a ground-plane diamond extruded upward, showing the two
 * camera-facing wall planes plus a snow-capped hip roof.
 */
export function isoBuilding(spec: IsoBuildingSpec): IsoBuilding {
  const { halfWidth, halfDepth, height, wallColor, roofColor, label } = spec;
  const outline = BRAND.colors.outline;
  const container = new Container();

  const [east, south, west, north] = footprint(halfWidth, halfDepth) as [Vec2, Vec2, Vec2, Vec2];

  const shadow = new Graphics();
  traceFootprint(shadow, halfWidth * 1.12, halfDepth * 1.12, 6);
  shadow.fill({ color: BRAND.colors.ao, alpha: 0.22 });

  // Supplied art replaces the drawn box, keeping the same shadow and sign mounts so
  // callers do not care which path was taken.
  const art = spec.art ? spriteFor(spec.art) : null;
  if (art) {
    const peakY = north.y - height - Math.max(26, height * 0.62);
    const sign = label ? worldText(label, 16, 0xfff7dc, '800') : undefined;
    if (sign) sign.position.set(0, peakY - 16);
    container.addChild(shadow, art);
    if (sign) container.addChild(sign);
    return { container, shadow, walls: new Graphics(), roof: new Graphics(), sign, illustrated: true, peakY };
  }

  const walls = new Graphics();
  const lit = shade(wallColor, 0.05);
  const shaded = shade(wallColor, -0.3);
  // right-facing wall (south -> east)
  walls.moveTo(south.x, south.y).lineTo(east.x, east.y).lineTo(east.x, east.y - height).lineTo(south.x, south.y - height).closePath().fill(shaded);
  // left-facing wall (west -> south)
  walls.moveTo(west.x, west.y).lineTo(south.x, south.y).lineTo(south.x, south.y - height).lineTo(west.x, west.y - height).closePath().fill(lit);
  // vertical corner seams + silhouette
  walls.moveTo(west.x, west.y).lineTo(south.x, south.y).lineTo(east.x, east.y).stroke({ color: outline, width: 3 });
  walls.moveTo(south.x, south.y).lineTo(south.x, south.y - height).stroke({ color: outline, width: 2.5, alpha: 0.8 });
  walls.moveTo(west.x, west.y).lineTo(west.x, west.y - height).stroke({ color: outline, width: 2.5, alpha: 0.8 });
  walls.moveTo(east.x, east.y).lineTo(east.x, east.y - height).stroke({ color: outline, width: 2.5, alpha: 0.8 });
  // doorway on the front corner, with warm light spilling out
  const doorH = height * 0.56;
  const doorW = 26;
  walls.moveTo(south.x - doorW / 2, south.y - 2).lineTo(south.x - doorW / 2, south.y - doorH)
    .lineTo(south.x + doorW / 2, south.y - doorH).lineTo(south.x + doorW / 2, south.y - 2).closePath()
    .fill(shade(wallColor, -0.55));
  walls.moveTo(south.x - doorW / 2, south.y - 2).lineTo(south.x - doorW / 2, south.y - doorH)
    .lineTo(south.x + doorW / 2, south.y - doorH).lineTo(south.x + doorW / 2, south.y - 2).closePath()
    .stroke({ color: outline, width: 2.5 });
  walls.roundRect(south.x - doorW / 2 + 4, south.y - doorH + 5, doorW - 8, doorH * 0.42, 4).fill({ color: BRAND.colors.gold, alpha: 0.62 });
  // shuttered windows on each visible wall, lit from within
  const windowOn = (from: Vec2, to: Vec2, t: number, lift: number): void => {
    const wx = from.x + (to.x - from.x) * t;
    const wy = from.y + (to.y - from.y) * t - lift;
    walls.roundRect(wx - 9, wy - 9, 18, 18, 3).fill(0xffd98a);
    walls.roundRect(wx - 9, wy - 9, 18, 18, 3).stroke({ color: outline, width: 2.5 });
    walls.moveTo(wx, wy - 9).lineTo(wx, wy + 9).stroke({ color: outline, width: 1.8 });
  };
  windowOn(west, south, 0.42, height * 0.62);
  windowOn(south, east, 0.6, height * 0.62);

  const roof = new Graphics();
  const rise = Math.max(26, height * 0.62);
  const peakY = north.y - height - rise;
  const topN = { x: north.x, y: north.y - height };
  const topE = { x: east.x, y: east.y - height };
  const topS = { x: south.x, y: south.y - height };
  const topW = { x: west.x, y: west.y - height };
  const peak = { x: 0, y: -height - rise + (north.y + south.y) / 2 };
  const roofLit = shade(roofColor, 0.08);
  const roofShade = shade(roofColor, -0.34);
  // far slopes first so the silhouette stays solid, then the camera-facing pair
  roof.moveTo(topN.x, topN.y).lineTo(topE.x, topE.y).lineTo(peak.x, peak.y).closePath().fill(roofShade);
  roof.moveTo(topW.x, topW.y).lineTo(topN.x, topN.y).lineTo(peak.x, peak.y).closePath().fill(roofLit);
  roof.moveTo(topS.x, topS.y).lineTo(topE.x, topE.y).lineTo(peak.x, peak.y).closePath().fill(roofShade);
  roof.moveTo(topW.x, topW.y).lineTo(topS.x, topS.y).lineTo(peak.x, peak.y).closePath().fill(roofColor);
  roof.moveTo(topW.x, topW.y).lineTo(topS.x, topS.y).lineTo(topE.x, topE.y).stroke({ color: outline, width: 3 });
  roof.moveTo(topW.x, topW.y).lineTo(peak.x, peak.y).lineTo(topE.x, topE.y).stroke({ color: outline, width: 2.5, alpha: 0.85 });
  roof.moveTo(topS.x, topS.y).lineTo(peak.x, peak.y).stroke({ color: outline, width: 2.5, alpha: 0.7 });
  snowCap(roof, [topW, peak, topE], 7);

  const sign = label ? worldText(label, 16, 0xfff7dc, '800') : undefined;
  if (sign) sign.position.set(0, peak.y - 16);

  container.addChild(shadow, walls, roof);
  if (sign) container.addChild(sign);
  return { container, shadow, walls, roof, sign, illustrated: false, peakY };
}

/**
 * The Trailwarden: deliberately exaggerated mobile-tycoon proportions — oversized
 * hood, compact torso, stubby limbs — so the silhouette stays legible at phone scale.
 */
export function drawTrailwardenBody(g: Graphics): void {
  g.clear();
  const parka = 0x2f7fb5;
  const parkaDark = shade(parka, -0.3);
  const outline = BRAND.colors.outline;

  // stubby boots
  g.roundRect(-15, 12, 13, 14, 6).fill(0x33241a).stroke({ color: outline, width: 3 });
  g.roundRect(2, 12, 13, 14, 6).fill(0x33241a).stroke({ color: outline, width: 3 });
  // pack riding high on the shoulders
  g.roundRect(-26, -22, 15, 30, 7).fill(BRAND.colors.timber).stroke({ color: outline, width: 3 });
  g.roundRect(-23, -17, 9, 9, 3).fill(BRAND.colors.ember);
  // compact torso, front plane lit and side plane shaded
  g.roundRect(-20, -22, 40, 40, 15).fill(parka);
  g.moveTo(10, -22).lineTo(20, -16).lineTo(20, 12).lineTo(10, 18).closePath().fill(parkaDark);
  g.roundRect(-20, -22, 40, 40, 15).stroke({ color: outline, width: 4 });
  // ember sash
  g.roundRect(-19, -12, 38, 13, 6).fill(BRAND.colors.ember);
  g.roundRect(-19, -12, 38, 13, 6).stroke({ color: shade(BRAND.colors.ember, -0.35), width: 2, alpha: 0.75 });
  // mitten hands
  g.circle(-21, 6, 9).fill(0xe08a45).stroke({ color: outline, width: 3 });
  g.circle(21, 6, 9).fill(0xe08a45).stroke({ color: outline, width: 3 });
  // oversized fur-trimmed hood
  g.circle(0, -46, 27).fill(parka).stroke({ color: outline, width: 4 });
  g.circle(0, -44, 21).fill(0xf0d3ae).stroke({ color: outline, width: 3 });
  g.circle(0, -46, 27).stroke({ color: outline, width: 4 });
  // fur ruff framing the face
  for (let index = 0; index < 11; index += 1) {
    const angle = Math.PI * (0.08 + (index / 10) * 0.84);
    g.circle(Math.cos(angle) * -24, -46 - Math.sin(angle) * 24, 6).fill(0xf6fbfc);
  }
  g.circle(0, -44, 21).fill(0xf0d3ae);
  // face
  g.circle(-8, -46, 3.6).fill(0x16303f);
  g.circle(8, -46, 3.6).fill(0x16303f);
  g.roundRect(-5, -35, 10, 3.5, 2).fill({ color: 0xb9704a, alpha: 0.75 });
}

/**
 * The Armory chain, drawn into an existing Graphics:
 * 0 frost blade, 1 trail axe, 2 ember pike, 3 arc brand, 4 bolt gun.
 */
export function drawWeapon(g: Graphics, tier: number): void {
  g.clear();
  const outline = BRAND.colors.outline;
  switch (tier) {
    case 4: {
      // bolt gun: stock, receiver, muzzle
      g.roundRect(6, -12, 40, 13, 5).fill(0x4a5f66).stroke({ color: outline, width: 2.5 });
      g.roundRect(0, -8, 16, 22, 5).fill(0x6b4630).stroke({ color: outline, width: 2.5 });
      g.roundRect(40, -9, 14, 7, 3).fill(0x8fa5ad).stroke({ color: outline, width: 2 });
      g.circle(52, -6, 4).fill(BRAND.colors.ember);
      g.roundRect(14, -20, 18, 9, 4).fill(0x6f858c).stroke({ color: outline, width: 2 });
      break;
    }
    case 3: {
      // arc brand: a humming blade of light on a short grip
      g.roundRect(-4, 2, 9, 26, 4).fill(0x39404a).stroke({ color: outline, width: 2.5 });
      g.roundRect(-6, -2, 13, 7, 3).fill(0x8fa5ad).stroke({ color: outline, width: 2 });
      g.roundRect(-5, -62, 11, 62, 5).fill({ color: 0x7ff0ff, alpha: 0.35 });
      g.roundRect(-3, -60, 7, 60, 3).fill(0xd8fbff);
      g.circle(0, -62, 4).fill(0xd8fbff);
      break;
    }
    case 2: {
      // ember pike: long haft, leaf head
      g.roundRect(-4, -26, 8, 76, 4).fill(0x6e472e).stroke({ color: outline, width: 2 });
      g.moveTo(-10, -26).lineTo(0, -68).lineTo(10, -26).closePath().fill(0xb9ccd1).stroke({ color: outline, width: 2.5 });
      g.roundRect(-7, -24, 14, 6, 3).fill(BRAND.colors.ember);
      break;
    }
    case 1: {
      // trail axe: haft with a broad bit
      g.roundRect(14, -28, 9, 54, 4).fill(0x6e472e).stroke({ color: outline, width: 2 });
      g.moveTo(11, -34).lineTo(42, -50).lineTo(49, -33).lineTo(21, -20).closePath().fill(0x9fb5bb).stroke({ color: outline, width: 3 });
      break;
    }
    default: {
      // frost blade: the starting sword
      g.roundRect(10, 2, 8, 22, 3).fill(0x5d3826).stroke({ color: outline, width: 2 });
      g.roundRect(2, -2, 24, 7, 3).fill(0x8fa5ad).stroke({ color: outline, width: 2 });
      g.moveTo(9, -4).lineTo(14, -56).lineTo(19, -4).closePath().fill(0xd3e4e8).stroke({ color: outline, width: 2.5 });
      break;
    }
  }
}

/**
 * Original frostwild fauna: one heavy rounded mass, a low head, and a
 * kind-specific crown. Kept in a single Graphics so hurt flashes can tint it.
 * Rimebacks are low and plated; Icehorns are taller with branched ice horns.
 */
export function drawCreatureBody(g: Graphics, kind: EnemyKind, config: EnemyConfig): void {
  g.clear();
  const s = config.scale;
  const isIcehorn = kind === 'icehorn';
  const base = config.color;
  const dark = shade(base, -0.2);
  const outline = BRAND.colors.outline;
  const lineWidth = 5;

  // far legs first so they tuck behind the body mass
  g.roundRect(-30 * s, 8 * s, 15 * s, 26 * s, 7).fill(dark).stroke({ color: outline, width: 3.5 });
  g.roundRect(16 * s, 10 * s, 15 * s, 26 * s, 7).fill(dark).stroke({ color: outline, width: 3.5 });

  // one big rounded torso — the dominant read
  g.ellipse(0, -10 * s, 50 * s, 40 * s).fill(base).stroke({ color: outline, width: lineWidth });
  // top-lit crown of the mass
  g.ellipse(-4 * s, -26 * s, 40 * s, 20 * s).fill({ color: shade(base, 0.16), alpha: 0.85 });
  // belly shadow grounding it
  g.ellipse(0, 12 * s, 40 * s, 15 * s).fill({ color: dark, alpha: 0.5 });

  // near legs
  g.roundRect(-22 * s, 14 * s, 16 * s, 26 * s, 7).fill(base).stroke({ color: outline, width: 3.5 });
  g.roundRect(8 * s, 16 * s, 16 * s, 26 * s, 7).fill(base).stroke({ color: outline, width: 3.5 });

  // low-slung head
  g.circle(34 * s, -14 * s, 25 * s).fill(base).stroke({ color: outline, width: lineWidth });
  g.ellipse(52 * s, -6 * s, 13 * s, 10 * s).fill(shade(base, -0.12)).stroke({ color: outline, width: 3 });
  g.circle(60 * s, -9 * s, 3.5).fill(0x0e2735);
  g.circle(38 * s, -22 * s, 4.5).fill(0x0e2735);
  g.circle(39.5 * s, -23.5 * s, 1.6).fill(0xffffff);

  if (isIcehorn) {
    // branched ice horns sweeping back — a tall, unmistakable crown
    for (const dir of [-1, 1]) {
      const rootX = (30 + dir * 14) * s;
      g.moveTo(rootX, -34 * s)
        .bezierCurveTo(rootX + dir * 10 * s, -62 * s, rootX + dir * 4 * s, -84 * s, rootX + dir * 20 * s, -96 * s)
        .lineTo(rootX + dir * 26 * s, -84 * s)
        .bezierCurveTo(rootX + dir * 12 * s, -72 * s, rootX + dir * 14 * s, -56 * s, rootX + dir * 12 * s, -36 * s)
        .closePath().fill(0xe4f9ff).stroke({ color: outline, width: 3 });
    }
    // frost plates cresting the spine
    for (let index = 0; index < 3; index += 1) {
      const x = (-26 + index * 16) * s;
      g.moveTo(x - 9 * s, -36 * s).lineTo(x, -56 * s).lineTo(x + 9 * s, -36 * s).closePath()
        .fill(0xe4f9ff).stroke({ color: outline, width: 2.5 });
    }
  } else {
    // Rimebacks wear a low ridge of frost plates instead of horns
    for (let index = 0; index < 4; index += 1) {
      const x = (-30 + index * 15) * s;
      const rise = index === 1 || index === 2 ? 22 : 15;
      g.moveTo(x - 8 * s, -34 * s).lineTo(x, (-34 - rise) * s).lineTo(x + 8 * s, -34 * s).closePath()
        .fill(config.accent).stroke({ color: outline, width: 2.5 });
    }
    g.circle(20 * s, -32 * s, 8 * s).fill(config.accent).stroke({ color: outline, width: 2.5 });
  }
}

/** Yard clutter: a stack of timber crates, drawn as small iso boxes. */
export function drawCrateStack(g: Graphics, count: number, tone = BRAND.colors.timber): void {
  const outline = BRAND.colors.outline;
  const size = 17;
  const stack = [[0, 0], [size * 1.5, size * 0.6], [size * 0.7, -size * 0.85]].slice(0, count);
  for (const [ox, oy] of stack) {
    const [east, south, west, north] = footprint(size, size) as [Vec2, Vec2, Vec2, Vec2];
    const h = 22;
    const shift = (p: Vec2): Vec2 => ({ x: p.x + ox!, y: p.y + oy! });
    const e = shift(east); const s = shift(south); const w = shift(west); const n = shift(north);
    g.moveTo(w.x, w.y).lineTo(s.x, s.y).lineTo(s.x, s.y - h).lineTo(w.x, w.y - h).closePath().fill(tone);
    g.moveTo(s.x, s.y).lineTo(e.x, e.y).lineTo(e.x, e.y - h).lineTo(s.x, s.y - h).closePath().fill(shade(tone, -0.28));
    g.moveTo(n.x, n.y - h).lineTo(e.x, e.y - h).lineTo(s.x, s.y - h).lineTo(w.x, w.y - h).closePath().fill(shade(tone, 0.16));
    g.moveTo(w.x, w.y).lineTo(s.x, s.y).lineTo(e.x, e.y).stroke({ color: outline, width: 2.5 });
    g.moveTo(s.x, s.y).lineTo(s.x, s.y - h).stroke({ color: outline, width: 2 });
    g.moveTo(n.x, n.y - h).lineTo(e.x, e.y - h).lineTo(s.x, s.y - h).lineTo(w.x, w.y - h).closePath().stroke({ color: outline, width: 2.5 });
  }
}

/** A snow-topped barrel. */
export function drawBarrel(g: Graphics): void {
  const outline = BRAND.colors.outline;
  const body = 0x9a6a3f;
  g.ellipse(0, 0, 16, 8).fill(shade(body, -0.35));
  g.moveTo(-16, 0).lineTo(-16, -30).lineTo(16, -30).lineTo(16, 0).closePath().fill(body);
  g.moveTo(4, 0).lineTo(4, -30).lineTo(16, -30).lineTo(16, 0).closePath().fill(shade(body, -0.24));
  g.moveTo(-16, -8).lineTo(16, -8).moveTo(-16, -20).lineTo(16, -20).stroke({ color: shade(body, -0.4), width: 3 });
  g.moveTo(-16, 0).lineTo(-16, -30).moveTo(16, 0).lineTo(16, -30).stroke({ color: outline, width: 2.5 });
  g.ellipse(0, -30, 16, 8).fill(shade(body, 0.14)).stroke({ color: outline, width: 2.5 });
  g.ellipse(0, -32, 13, 6).fill({ color: BRAND.colors.snowHighlight, alpha: 0.9 });
}

/** A snowdrift mound for breaking up empty field. */
export function drawSnowdrift(g: Graphics, width: number): void {
  g.ellipse(0, 0, width, width * 0.42).fill(BRAND.colors.snowHighlight);
  g.ellipse(-width * 0.2, -width * 0.1, width * 0.6, width * 0.26).fill({ color: 0xffffff, alpha: 0.9 });
  g.ellipse(0, 0, width, width * 0.42).stroke({ color: BRAND.colors.snowShadow, width: 3, alpha: 0.55 });
}

/**
 * Compact build requirement dial. The dark center carries an actual log/bill glyph,
 * while the green outer arc communicates delivered progress without a second huge ring.
 */
export function paintResourceBadge(g: Graphics, progress: number, resource: 'wood' | 'cash', radius = 19): void {
  g.clear();
  const outline = BRAND.colors.outline;
  const filled = Math.max(0, Math.min(1, progress));
  g.circle(0, 0, radius + 3).fill({ color: 0x091f2c, alpha: .96 }).stroke({ color: outline, width: 2.5 });
  g.circle(0, 0, radius).stroke({ color: 0x66818d, width: 4, alpha: .8 });
  if (filled > 0) g.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * filled).stroke({ color: BRAND.colors.safe, width: 4.5, cap: 'round' });
  if (resource === 'wood') {
    g.roundRect(-10, -11, 20, 8, 4).fill(BRAND.colors.timber).stroke({ color: 0xe3b273, width: 1.4 });
    g.ellipse(8, -7, 3.2, 4).fill(0xd9ab74).stroke({ color: outline, width: 1 });
    g.arc(8, -7, 1.7, -1.2, 1.2).stroke({ color: BRAND.colors.timberDark, width: 1 });
  } else {
    g.roundRect(-11, -12, 22, 10, 2.5).fill(0x78d594).stroke({ color: 0xd9ffe1, width: 1.2 });
    g.circle(0, -7, 2.5).fill(0xffdf78);
    g.moveTo(-7, -9).lineTo(-7, -5).moveTo(7, -9).lineTo(7, -5).stroke({ color: 0x276747, width: 1.2 });
  }
}

export type PadState = 'locked' | 'affordable' | 'maxed';

/**
 * Paints an upgrade/unlock plate as a raised purchase pad: a slab with visible edge
 * thickness, a bright category-colored top, and a chevron pointing into it.
 */
export function paintUpgradePlate(g: Graphics, halfWidth: number, halfDepth: number, state: PadState, categoryColor: number): void {
  g.clear();
  const top = state === 'maxed' ? 0x6d8794 : state === 'affordable' ? shade(categoryColor, 0.12) : shade(categoryColor, -0.36);
  const side = shade(top, -0.34);
  const rim = state === 'maxed' ? 0xb2cdd4 : state === 'affordable' ? shade(categoryColor, 0.62) : shade(categoryColor, -0.1);
  const outline = BRAND.colors.outline;
  const thickness = 11;
  const [east, south, west] = footprint(halfWidth, halfDepth) as [Vec2, Vec2, Vec2, Vec2];

  // side walls give the pad physical presence on the ground
  g.moveTo(west.x, west.y).lineTo(south.x, south.y).lineTo(south.x, south.y + thickness).lineTo(west.x, west.y + thickness).closePath().fill(side);
  g.moveTo(south.x, south.y).lineTo(east.x, east.y).lineTo(east.x, east.y + thickness).lineTo(south.x, south.y + thickness).closePath().fill(shade(side, -0.18));
  g.moveTo(west.x, west.y + thickness).lineTo(south.x, south.y + thickness).lineTo(east.x, east.y + thickness).stroke({ color: outline, width: 2.5 });

  traceFootprint(g, halfWidth, halfDepth);
  g.fill({ color: top, alpha: state === 'locked' ? 0.85 : 1 });
  traceFootprint(g, halfWidth, halfDepth);
  g.stroke({ color: outline, width: 3 });
  traceFootprint(g, halfWidth * 0.72, halfDepth * 0.72);
  g.stroke({ color: rim, width: 2.5, alpha: 0.7 });
}

/** An upright shop sign for a purchase plate: icon above, name, then price pill. */
export function paintPadChrome(g: Graphics, state: PadState, categoryColor: number, contentWidth: number, iconY: number, priceY: number): void {
  g.clear();
  const halfWidth = Math.max(47, contentWidth / 2 + 15);
  const top = iconY - 31;
  const bottom = priceY + 17;
  const boardColor = state === 'maxed' ? 0x38505a : state === 'affordable' ? 0x355968 : 0x294653;
  // A real post and shadow tie the price information to the world instead of
  // allowing letters to float through nearby buildings or carried items.
  g.ellipse(0, 7, 19, 7).fill({ color: BRAND.colors.ao, alpha: .22 });
  g.roundRect(-5, bottom - 2, 10, Math.max(8, 8 - bottom), 3).fill(0x5b3929).stroke({ color: BRAND.colors.outline, width: 2 });
  g.roundRect(-halfWidth, top, halfWidth * 2, bottom - top, 9).fill(boardColor).stroke({ color: BRAND.colors.outline, width: 3.5 });
  g.roundRect(-halfWidth + 5, top + 5, halfWidth * 2 - 10, 7, 3).fill({ color: categoryColor, alpha: state === 'locked' ? .55 : 1 });
  g.circle(-halfWidth + 11, top + 19, 2.7).fill(0xd8b478);
  g.circle(halfWidth - 11, top + 19, 2.7).fill(0xd8b478);
  const halfWidthPill = Math.max(22, contentWidth / 2 + 9);
  g.roundRect(-halfWidthPill, priceY - 11, halfWidthPill * 2, 22, 11).fill({ color: 0x0d2c3d, alpha: 0.9 });
  g.roundRect(-halfWidthPill, priceY - 11, halfWidthPill * 2, 22, 11)
    .stroke({ color: state === 'affordable' ? BRAND.colors.gold : 0x50707f, width: 2.5 });
}
