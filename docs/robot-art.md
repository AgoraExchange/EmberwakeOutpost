# Robot artwork — 1.9.0

Mode: built-in image generation, transparent RGBA PNG. The selected original images are preserved under `assets/source/sprites`; runtime copies retain alpha and are resized with Sharp to the project's sprite scale. Both runtime sprites are included in the PWA cache.

| Asset | Original | Runtime |
| --- | --- | --- |
| Robot Foundry | `assets/source/sprites/building/robot-foundry.png` | `public/art/sprites/building/robot-foundry.png` |
| Utility robot | `assets/source/sprites/actor/robot.png` | `public/art/sprites/actor/robot.png` |

## Final prompt set

Foundry:

> One isolated transparent RGBA PNG sprite for an arctic fantasy tycoon game, high-quality hand-painted 3D isometric robot foundry building matching chunky timber, snowy iron furnaces and glowing copper industrial machinery. Compact workshop with exposed assembly bay, mechanical gantry arm holding a small robot head, glowing cyan power core, warm amber furnace vents, copper pipes, snow on iron and timber surfaces, tiny tool benches. Entire structure visible uncropped, 3/4 isometric top-down view front and right, stone foundation. Rich warm painted textures, dark outlines, charming mobile game readability. No text, no signs, no scenery, no checkerboard, actual transparent alpha background.

Utility robot:

> Transparent PNG game sprite, isolated friendly small utility robot, full body, centered in a square canvas. Actual alpha transparency background. Chunky hand-painted fantasy 3D mobile tycoon style: navy iron and brass copper plating, cyan eyes and chest lamp, 2 legs and 2 articulated arms, small cargo backpack, snowy shoulder caps. Sturdy charming worker automaton, no tool held, neutral stance angled three-quarter to right and down, viewed from slightly above. Entire object visible with margin. Real RGBA transparent background. No scenery, no lettering, no checkerboard, no floor.

The game adds contact shadows, carried goods, labels and work effects separately so resource counts and assigned jobs remain visible.
