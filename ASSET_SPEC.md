# Emberwake Outpost — Sprite Art Specification

Everything in the game currently draws itself procedurally. Supplying a PNG makes the
renderer use it instead. **Art is optional and additive**: drop in one file, list it in the
manifest, reload, and only that thing changes. Nothing breaks while the set is incomplete.

## Originality requirement

All art must be **original work for Emberwake Outpost**. Do not copy, trace, or derive from
another game's characters, buildings, UI, logos, or screenshots. The conventions below
(isometric camera, chunky proportions, bold outlines) are common to the genre and are fine
to work within — specific designs must be your own. Record the source of each file in
`ASSET_LICENSES.md` as it lands.

## How to add a file

1. Save the PNG to `public/art/sprites/<key>.png` — e.g. `public/art/sprites/building/furnace.png`
2. Add the key to `public/art/sprites/index.json`:
   ```json
   ["building/furnace", "creature/rimeback"]
   ```
3. Reload. Unlisted or missing files silently fall back to the drawn version.

The manifest exists so a partly-illustrated build makes exactly the requests it needs,
with no 404 noise.

## Camera and format

| Property | Value |
| --- | --- |
| Projection | 2:1 dimetric isometric |
| Plan rotation | 45° |
| Elevation | ~30° above horizon |
| Format | PNG-32, straight (non-premultiplied) alpha |
| Background | Fully transparent |
| Authoring scale | 2× the drawn size, for crisp rendering on dense displays |
| Lighting | Single key light from the **upper left**, consistent across every asset |

Practically: model or draw the subject, rotate it 45° around the vertical axis, then view it
from above at roughly 30°. Verticals stay vertical; the ground plane recedes at 2:1 — a
horizontal edge drops one pixel for every two it travels sideways.

**Do not bake a ground shadow into the image.** The engine draws contact shadows so they
sit correctly against terrain. Include only shadow that falls on the object itself.

## Anchors

Each sprite's origin is its **ground contact point** — where the object meets the floor, not
the image centre. Anchors are already configured in `src/game/sprites.ts`; match them when
composing so the subject's base sits at the stated fraction of image height.

| Category | Anchor (x, y) | Meaning |
| --- | --- | --- |
| Buildings | 0.5, 0.82 | Base of the front corner |
| Creatures | 0.5, 0.86 | Between the front paws |
| Actors | 0.5, 0.88 | Between the feet |
| Props | 0.5, 0.84–0.92 | Where the object rests |

Leave headroom above the subject (roofs, horns, raised tools) — that is what the remaining
image height is for.

## Canvas sizes

Author at these sizes. The engine rescales to the world width in the right-hand column, so
exact pixel dimensions are forgiving; the **aspect and anchor** are what must be right.

| Key | Canvas | Drawn world width |
| --- | --- | --- |
| `building/furnace` | 512×512 | 190 |
| `building/cookout` | 640×512 | 250 |
| `building/mess-hall` | 640×512 | 260 |
| `building/smokehouse` | 640×512 | 240 |
| `building/infirmary` | 384×384 | 150 |
| `building/timber-post` | 384×384 | 150 |
| `creature/rimeback` | 384×384 | 150 |
| `creature/icehorn` | 448×448 | 185 |
| `actor/trailwarden` | 256×384 | 110 |
| `actor/villager` | 256×384 | 95 |
| `actor/worker` | 256×384 | 95 |
| `actor/guard` | 256×384 | 100 |
| `prop/tree` | 384×512 | 150 |
| `prop/stump` | 256×256 | 90 |
| `prop/rock` | 320×256 | 120 |
| `prop/crates` | 320×320 | 120 |
| `prop/barrel` | 192×256 | 70 |
| `prop/fence-post` | 128×256 | 60 |
| `prop/gate-closed` | 512×384 | 200 |
| `prop/gate-open` | 512×384 | 200 |

## Palette

Match the world's existing colours so art and drawn elements coexist while the set is partial.

| Role | Hex |
| --- | --- |
| Outline (all shapes) | `#123A4D` |
| Snow — field | `#EAF7FB` |
| Snow — highlight | `#F4FDFF` |
| Snow — shadow | `#A7D2DF` |
| Ice / water | `#5DB7D2` |
| Yard earth | `#D9B483` |
| Yard earth edge | `#A9814F` |
| Timber | `#8A5637` |
| Timber dark | `#5D3826` |
| Ember / fire | `#FF8D47` |
| Gold / cash | `#FFD166` |
| Meat | `#E75B4B` |
| Ambient occlusion | `#0A2331` |

**Style rules**

- Bold dark outline on every silhouette, roughly 3–4px at 2× scale.
- Chunky, exaggerated proportions — oversized heads and hoods on actors, heavy rounded
  masses on creatures. Readability at phone size beats realism.
- Snow buildup on every upward-facing surface: roofs, rock tops, fence caps, tree crowns.
- Warm structures against cold ground. Timber and ember inside the walls, blue-white outside.
- Flat or lightly-graded fills. Avoid photographic texture and heavy noise.

## What each asset is

**Buildings**

- `building/furnace` — squat stone-and-iron hearth, open front with visible flame, short
  chimney. The compound's warm heart.
- `building/cookout` — open-sided timber cook shelter, pitched roof, grill and hanging pots.
- `building/mess-hall` — long low timber hall with a serving counter along its front edge.
- `building/smokehouse` — narrow tall smoking shed, slatted vents, thin smoke plume.
- `building/infirmary` — small canvas ridge tent, pale fabric, red cross on the side.
- `building/timber-post` — cutting bench with an axe embedded in a block and sawn logs stacked beside it.

**Creatures** — original arctic fauna, not real-world bears.

- `creature/rimeback` — heavy low quadruped, pale shaggy coat, a ridge of blue-white frost
  plates along the spine, no horns. Reads as broad and close to the ground.
- `creature/icehorn` — larger and taller, paler blue coat, tall branched translucent ice
  horns sweeping back from the skull. Silhouette must be unmistakable against the Rimeback.

**Actors** — three-quarter view facing screen-right; the engine mirrors for the other direction.

- `actor/trailwarden` — the player. Heavy fur-trimmed parka hood, compact torso, mitten
  hands, stubby boots, small pack. Blue coat with an ember-orange sash.
- `actor/villager` — bundled settler in a plain hooded coat, hands held in front.
- `actor/worker` — camp hand in a work coat with a tool.
- `actor/guard` — sentry in a heavier coat holding a crossbow at rest.

**Props**

- `prop/tree` — conical snow-laden conifer, dark blue-green, heavy white caps.
- `prop/stump` — cut stump with pale exposed rings, the felled state of the tree.
- `prop/rock` — faceted grey boulder with snow on its upper faces.
- `prop/crates` — stack of two or three timber crates with visible banding.
- `prop/barrel` — banded wooden barrel with a snow cap.
- `prop/fence-post` — single sharpened palisade post with a snow cap. Tiles as a run.
- `prop/gate-closed` / `prop/gate-open` — twin timber doors between heavy posts, shut and swung open.

## Animation

Not yet supported — the loader reads single frames. Actor motion is currently done by
posing the sprite in code (bob, lean, swing), which works on a static image.

If you want true frame animation, supply a **horizontal strip**: equal-width frames left to
right in one PNG, named `<key>-strip.png`, and tell me the frame count. I will add strip
support to the loader — it is a small change, but the frame count has to live in code.

## Priority

If you are producing these gradually, this order gives the largest visible gain per file:

1. `creature/rimeback`, `creature/icehorn` — most-looked-at objects, weakest procedurally
2. `actor/trailwarden` — always on screen
3. `building/cookout`, `building/mess-hall` — the two largest structures
4. `prop/tree` — very high instance count
5. Everything else
