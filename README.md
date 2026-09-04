# Emberwake Outpost

Emberwake Outpost is an original, mobile-first arctic action-tycoon built as a static PixiJS Progressive Web App. Hunt fictional Rimebacks, recover provisions, run a visible grill-and-serving pipeline, collect physical cash, grow the camp, defend the east gate, and unlock a second frostfin fishing economy.

The game has no backend, accounts, tracking, ads, remote APIs, or paid services. After the first successful visit, the production build can relaunch offline.

## Run locally

Requirements: Node.js 22+ and npm.

```powershell
npm install
npm run dev
```

Open the URL printed by Vite. Useful commands:

```powershell
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
npm run preview
npm run check
```

`npm run test:e2e` starts its own development server and checks Chromium, a 440×956 iPhone-class viewport, desktop WebKit, and iPhone WebKit. The long deterministic acceptance flow runs once in desktop Chromium.

To emulate the GitHub Pages repository subpath exactly after a build:

```powershell
npm run build
node scripts/serve-subpath.mjs 4177
node scripts/production-smoke.mjs http://127.0.0.1:4177/EmberwakeOutpost/
```

The production smoke verifies the repository-base paths, real first-launch naming, service-worker activation, broken requests, and a forced-offline relaunch with the saved name.

## Controls

- Touch: drag from anywhere on the play surface to create a floating analog joystick. A fixed visible joystick is available in Settings.
- Desktop: WASD or arrow keys.
- Combat: automatic outside the protected furnace radius. Movement stays under player control.
- Interactions: stand inside a marked world circle. Raw food deposits and cooked-meal pickups are rapid; purchases visibly stream cash into a plate.
- Pause: top-right button or Escape.

Audio starts only after interaction. Haptics, reduced motion, 30 FPS battery mode, master/music/SFX volume, and joystick mode are configurable.

## Gameplay and content

The vertical slice includes:

- deterministic fixed-step movement, targeting, combat cadence, knockback, hit-stop, damage feedback, enemy finite-state behavior, death, protected respawn, and permanent loss of all carried cargo on defeat;
- visible raw/cooked/timber backpack stacks, magnetic drops, provision storage, animated grill conversion, physical output piles, inventory-matched customer queues capped at six visible orders, physical cash, and real upgrade effects;
- 16 upgrade lines covering combat, survival, carrying, production, customers, worker count, defense, heat, and recovery;
- an eight-times-larger 9,600×6,200 ice world with Rime Trail, Icehorn Ridge, Glacier Reach, Whiteout Expanse, sequential passes, new forests, obstacles, and tougher enemies;
- a repeatable telegraphed gate raid whose pack assembles off-camera, follows a staged route to the compound gate, and can be opposed by the guard; if the gate buckles, raiders enter the compound and destroy banked profit at the Cookout until the pack is eliminated;
- a paid shoreline unlock, hold-to-catch frostfin dock, separate smokehouse conversion and pickup pile, fish-requesting guests, and higher-value fish plates;
- event-driven onboarding arrows, local synthesized sound, light snowfall, footprints, depth sorting, particles, cash/provision stacks, and responsive portrait/landscape camera behavior.

Player defeat permanently destroys carried raw food, cooked meals, frostfin plates, and timber, making every trip outside the compound a real risk. Station stock, upgrades, and unlocked construction survive defeat. Banked cash is safe from an ordinary player defeat, but not from an active pantry breach: unchecked raiders can pillage it all the way to zero.

## Architecture

- `src/main.ts`: DOM overlays, settings, save import/export/reset, PWA update lifecycle, and application bootstrap.
- `src/game/Game.ts`: fixed-step scene orchestration, renderer-facing entities, world construction, AI, queues, raids, fishing, camera, collision, pooling, and feedback.
- `src/game/config.ts`: centralized brand palette, world landmarks, enemy/economy balance, and every upgrade cost/effect table.
- `src/game/rules.ts`: pure capacity, damage, cooldown, conversion, purchase, death-loss, and progression formulas.
- `src/game/save.ts`: versioned schema migration, IndexedDB storage, localStorage fallback, safe import/export, and reset.
- `src/game/InputController.ts`: normalized keyboard and analog floating/fixed joystick input.
- `src/game/AudioEngine.ts`: interaction-gated procedural SFX, ambient wind, volume routing, and optional haptics.
- `src/game/pathing.ts`: base-aware local asset path helpers.

The simulation advances at 60 fixed updates per second independently of rendering. Battery mode caps rendering at 30 FPS. Mobile render resolution is capped, the simulation pauses while hidden, and transient graphics/text use pools.

## Balance tuning

All economy, combat, unlock, enemy, world landmark, and upgrade data lives in `src/game/config.ts`. Formula helpers are in `src/game/rules.ts`. Timber is the dependable main income; hospitality starts at $4 per cooked bear meal and only pays after the complete hunt, cook, carry, feed, and cash-collection route. The first frontier and shoreline projects require 30 and 45 hauled timber. Later expedition passes cost $650 and $1,600 and only appear in sequence.

Change values in the config tables, then run `npm test` and the browser acceptance suite. Avoid changing displayed effect text without changing the corresponding formula.

## Save behavior

The current schema is version 4. Progress saves after purchases, deposits/major state changes, deaths, settings updates, imports/resets, document hiding, and every eight active seconds. IndexedDB is primary and `localStorage` is a fallback for constrained/private environments.

Saved state includes the Trailwarden call-sign, banked cash, upgrade levels, all expedition gates, station inventory/progress, tutorial completion, stats, and settings. Carried at-risk cargo and physical world drops are deliberately session state. Import validates and migrates the file before replacing progress; reset requires two confirmations. Migration hooks for v1–v4 and unknown/corrupt data are covered by unit tests.

## PWA and iPhone installation

On iPhone Safari, open the deployed site, use Share → Add to Home Screen, then launch Emberwake from the icon. The manifest requests standalone portrait display, the document uses viewport-fit and safe-area insets, and the play surface uses `touch-action: none` without disabling accessible menu controls. The game first holds the Emberwake mark for three seconds, then runs a four-second themed loading bar. New devices choose a Trailwarden call-sign after it completes; that name is stored alongside local outpost progress.

The generated worker precaches the shell and all local game assets. In Pause → **Check for updates**, Emberwake fetches the uncached release marker, asks the installed worker to check GitHub Pages, saves the current outpost, and restarts only if a new build is ready. That preserves local data while replacing code and assets. A changed commit is sufficient for the worker to detect a new build; update both `APP_VERSION` in `src/main.ts` and `public/app-version.json` when you want the player-facing release label to change too.

## Deploy to GitHub Pages

1. Push to [AgoraExchange/EmberwakeOutpost](https://github.com/AgoraExchange/EmberwakeOutpost) with `main` as the default branch.
2. In GitHub, open Settings → Pages and set Source to **GitHub Actions**.
3. Push to `main`, or run the “Build and deploy Emberwake Outpost” workflow manually.
4. The workflow derives `VITE_BASE_PATH` from the actual repository name, runs lint/unit/build checks, uploads `dist`, and deploys it.
5. Visit [Emberwake Outpost](https://agoraexchange.github.io/EmberwakeOutpost/).

For a custom manual build, set the base explicitly before `npm run build`:

```powershell
$env:VITE_BASE_PATH='/YOUR-REPOSITORY/'
npm run build
```

Never upload the source tree as the Pages artifact; deploy only `dist`.

## Art and licensing

See `ASSET_LICENSES.md`. The user-supplied horizontal reference sheet remains outside `public` and is never bundled. No third-party game artwork, extracted assets, product names, logos, or characters are used.
