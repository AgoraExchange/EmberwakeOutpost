# Asset and license notes

## Original project assets

- `assets/source/emberwake-key-art.png` and `public/art/emberwake-key-art.webp`: generated specifically for this project with OpenAI’s built-in image-generation tool on 2026-08-09. The PNG is the editable source and the WebP is the shipped optimized copy. Prompt summary: an original portrait-friendly elevated three-quarter arctic outpost at blue twilight, warm furnace and timber work yard, bundled trailwarden, fictional snow beast, distant fishing dock, stylized low-poly mobile-game finish, no text/logos/trademarks/watermark, and no resemblance to proprietary characters.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, and `public/apple-touch-icon.png`: original snowflake-and-ember marks generated locally from `scripts/generate-assets.mjs`.
- All world art, characters, creatures, buildings, props, UI shapes, particles, and animation silhouettes are original procedural vector graphics authored in TypeScript/CSS for this project.
- All sound and ambience are synthesized locally at runtime by `src/game/AudioEngine.ts`; there are no sampled or third-party audio files.

## Reference material

`Whiteout_Ad_Game_All_References_Horizontal.png` was supplied by the user only as a high-level reference for elevated camera readability, fenced-yard composition, resource stacks, purchase pads, and queue flow. It stays at the repository root, is not imported by application code, is not copied into `public`, and is not present in `dist`.

No artwork, logos, names, characters, audio, extracted files, or other proprietary assets from the referenced product are included.

### Supplied sprite art

`public/art/sprites/` holds optional PNG art, registered in `index.json`. The build ships
with an empty manifest and renders entirely procedurally; each file added replaces one
drawn element. **Every sprite added here must be original work commissioned or generated
for this project** — see `ASSET_SPEC.md` for the requirement and the format. Log each file's
origin below as it lands.

### 2026-09-03 illustrated gameplay pass

The following original PNG sprites were generated specifically for Emberwake Outpost with
OpenAI's built-in image-generation tool, using the project's own
`assets/source/emberwake-key-art.png` only as its palette, material, lighting, and mood
reference:

- `actor/trailwarden`, `actor/villager`, `actor/worker`, and `actor/guard`
- `building/furnace`, `building/cookout`, `building/mess-hall`, and `building/timber-post`
- `creature/rimeback` and `creature/icehorn`
- `prop/tree`

The shared prompt direction requested isolated, genuinely transparent, elevated isometric
mobile-game sprites with painterly 3D-rendered forms, tactile fur/timber/iron/snow, cool blue
ambient light, warm ember accents, original designs, and no text, logos, trademarks, or
watermarks. Each prompt then supplied the subject-specific description recorded by the asset
name. Alpha channels were validated before the files were registered in `index.json`.
High-resolution originals live under `assets/source/sprites/`; `scripts/generate-assets.mjs`
creates the smaller transparent PNGs shipped under `public/art/sprites/`.

The public CC0-licensed SuperWEIRD Game Kit by Luden.io was evaluated as a reference for
presentation patterns such as animated production stations, readable item flow, demand
bubbles, worker activity, and immediate harvest feedback. Its Defold/Lua implementation and
hand-drawn art direction do not directly match this PixiJS/isometric project, so none of its
code or bitmap assets are shipped in this pass.

### 2026-08-09 isometric rebuild

The renderer was converted to a 2:1 dimetric isometric projection (`src/game/iso.ts`) and the art direction reworked: a raised warm-earth yard platform against cold snow field, isometric building volumes with lit windows and doorways, chunky original character and creature designs, raised purchase pads with icon badges, and procedural yard clutter (crates, barrels, drifts). Every shape is generated in code — there are still no bitmap, sprite-sheet, or third-party image assets in the gameplay renderer. The contact sheet informed camera angle, composition, and readability conventions only; no shapes, proportions, colors, characters, buildings, UI, or names were traced or copied from it, and the game carries no branding from the referenced product.

### 2026-08-09 visual overhaul

The live gameplay renderer (buildings, the Trailwarden, Rimeback/Icehorn creatures, camp workers, customers, cargo/cash props, upgrade pads, and particle/VFX shapes) was rebuilt for a more dimensional, snow-capped, outlined 2.5D look. All of it is original procedural PixiJS `Graphics` authored in `src/game/visuals.ts` and `src/game/Game.ts` — layered planes, faux-3D shading, and contact shadows generated in code, no bitmap or sprite-sheet assets added. The reference sheet was consulted only for camera angle, composition, and readability conventions (fenced yards, purchase pads, resource stacks); no shapes, colors, proportions, or names were copied from it.

## Software

- PixiJS: MIT License.
- Vite: MIT License.
- vite-plugin-pwa / Workbox: MIT License.
- Vitest, Playwright, TypeScript, ESLint, and Sharp are development/build tools under their respective open-source licenses and are not remotely loaded by the shipped game.
