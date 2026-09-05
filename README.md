# Emberwake Outpost

Emberwake Outpost is an original, mobile-first arctic action-tycoon built as a static PixiJS Progressive Web App. Hunt fictional Rimebacks, recover provisions, run a visible grill-and-serving pipeline, collect physical cash, grow the camp, defend the east gate, and unlock a second frostfin fishing economy.

The game has no backend, accounts, tracking, ads, remote APIs, or paid services. After the first successful visit, the production build can relaunch offline.

## 1.7.0 — Frostfin meal runners

- Hired meal runners now monitor both Cookout meals and ready frostfin plates, prioritize waiting fish orders, and walk through the shoreline gate to collect smokehouse food.
- The runner visibly carries blue frostfin plates back to the Mess Hall, serves waiting villagers, and creates the normal collectible cash drops.
- Ready frostfin also enters the existing offline serving pipeline, with its higher meal value saved to the strongbox while the player is away.

## 1.6.1 — Compact lumber stand

- The roofed lumber shed is replaced by one smaller open stand with three divided sections holding 100 logs each.
- All 300 stored logs remain individually visible while the cleaner footprint opens the walkway and nearby upgrade-pad space.

## 1.6.0 — Working crews and fortress firepower

- Lumberjacks now walk through the compound gate, reserve an available frontier tree, visibly chop through its health, carry the tree's four-log stack home, and deposit it into the lumber yard. Multiple lumberjacks choose different trees.
- The lumber yard is a roofed timber shed with braces, a saw station, snow treatment, and three framed stock bays. Every stored log is rendered, so 29 saved logs visibly appear as 29 logs instead of six compressed markers.
- The Fisher Crew pad moved out of the lake collision barrier. The Glacier Salvage Rig has a drill tower, conveyor, powered tanks, ore machinery, and a forward upgrade pad that remains readable.
- The Cookout and Timber Post boards are removed; compact live interaction labels and onboarding retain the core instructions without blocking the yard.
- Raid kill cash starts at $6 and rises by $2 each wave to a recoverable $60 cap. Ordinary Rimebacks remain $6, Icehorns begin at $12, and Glacier/Whiteout wildlife gains health, damage, speed, and cash value.
- The Armory continues after the Bolt gun through Sniper Rifle, .50 Sniper Rifle, SCAR Assault Rifle, and AK-47 Assault Rifle. The SCAR fires 26 rounds at four per second; the AK fires 36 rounds at five per second; both reload in two seconds.
- Defense continues after the two Ember batteries: two low-profile road turrets are added and upgraded one at a time outside the east gate, ending with four advanced turrets in crossfire.
- Roaming wardens have visible health, charge through the east gate during a raid, chase and fight Rimebacks outside, and can be attacked. Warrior upgrades raise their health from 125, movement speed, damage, range, and cadence; fallen wardens return for the next wave.

## 1.5.0 — Hunter crew supply chain

- A dedicated Hunter Crew pad sits beside the Lumberjacks pad with a clear walking gap. It unlocks with the Eastern Frontier and recruits up to three visible spear hunters.
- Hunters travel from the Cookout into the frontier and return timed raw-meat batches directly to the grill input. Upgrades increase the crew from one to three, shorten trips from 45 to 22 seconds, grow deliveries from two to four meat, and raise stocked-meat limits from 24 to 80.
- Hunter production also advances for up to eight offline hours before cooking and meal delivery are calculated, allowing a fully upgraded hunting, cooking, serving, and collectible-cash chain to operate while away.
- The lumber collection circle no longer shares its space with a rotating Tempo pad, so its three physical stacks and interaction prompt remain clear.

## 1.4.0 — Offline crews and collectible earnings

- Closing, backgrounding, or hiding the app immediately writes a timestamped device save. Launch selects the newest valid snapshot from IndexedDB or the synchronous fallback, so a fast mobile close does not discard the last work state.
- Stocked Cookout production continues for up to eight hours. A hired meal runner finishes deliveries while away and leaves the exact proceeds at the strongbox for the player to collect after returning.
- A new Lumberjacks pad hires up to three visible workers. They travel between the forest and lumber yard while playing and continue working offline.
- The lumber yard has three physical piles that fill sequentially to 100 logs each, cap at 300 total, persist across relaunches, and load onto the Trailwarden for sale at the Timber Post.
- The return report and Outpost overview show cooked meals, collectible passive cash, and newly stacked logs. Offline time never runs raids or invents kitchen ingredients.

## 1.3.0 — Fortify and industrialize the frontier

- The Compound pad develops the original camp into a reinforced core, a working shoreline annex, and an eastern stronghold with additional exits. Gate Armor is its own five-level investment and stacks with defense and compound tiers for much higher gate health.
- Raids now begin with **Wave 1: Raid** and persistently advance every time a wave begins. Each wave adds raiders and gradually increases their health, damage, and speed; all four values cap at a recoverable late-game ceiling. The defense bonus also rises by wave.
- The Warriors pad recruits up to eight roaming wardens. They physically patrol the compound and independently target raid packs alongside spear posts, archer towers, and Ember batteries.
- Shoreline Works has Fishery and Fisher Crew pads: manual catches improve, smokehouse throughput rises, and visible hired fishers automatically supply raw frostfin.
- Glacier Reach contains a buildable Salvage Rig that produces physical ore-cash crates. Whiteout Expanse contains a Robot Foundry whose visible utility robots accelerate salvage production.
- The Outpost overview reports the next wave, raid victories, gate construction, wall tier, patrol strength, and each district's actual business output.

## 1.2.0 — A working, growing outpost

- The Cookout sign sits behind the kitchen, clear of the archer tower. The HUD abbreviates thousands and millions, retains exact cash in its accessible label/tooltip, and gives phone inventory its own row.
- Open **Outpost** for production stock, delivery load, queued orders, defense strength, exact next costs, and expansion requirements. The overview pauses play and recommends the next useful task. Research and design decisions are recorded in [the tycoon design notes](docs/tycoon-design-notes.md).
- Simulation uses actual elapsed time rather than Pixi's 100 ms frame cap, keeping cooking, healing, and travel at their intended pace on slower devices. Pause and backgrounding stop rendering; returning discards paused time before simulation resumes.
- Eight villagers can queue in two connected rows. Beacon upgrades shorten arrival staggering, while Counter upgrades increase ready-food storage.
- Dedicated Cook ($108, then $243) and Grill (from $44) pads sit by the kitchen. The hired cook carries real batches of two meals to waiting villagers; the second level moves faster and carries four. The player supplies raw meat and collects the physical cash. Carried cook meals survive relaunches; deliveries pause while the game is paused or closed.
- Early progression at $8 per log: Edge costs four logs' income, Grill six, Counter seven, Armory nine, Defense twelve, and Cook fourteen. Later costs rise by upgrade level; expansions require 30 timber, 45 timber, $650, then $1,600. Every Grill tier improves actual cooking speed, including with the upgraded cook.
- Mess Hall, Cookout, and Timber Post retain their wayfinding signs. Upgrade and expansion costs are painted directly onto ground pads, with bright corners, affordable-state color, and payment progress around the edge. Walk near a pad to see the benefit; stand still in its center to contribute.
- Compact pads show just their symbol and cost, at roughly half their previous width and depth. Supply crates and barrels sit clear of purchase areas; upgrade names and benefits appear in the nearby-activity panel.
- Logs sell for $8 each. The dedicated Defense pad upgrades spear villagers into an archer tower, twin towers, automatic turrets, and advanced Ember batteries. Defenders attack raiders from their actual posts.
- Each slain bear drops raw meat and collectible $6 cash, including kills made by compound defenders. Raid meat remains for five minutes; the successful defense bonus is paid separately in collectible cash.
- Raw food, cooked meals, and timber share the same backpack-height base, including when all three stacks are carried.
- The green furnace circle heals living players at 4 HP per second, capped at maximum health. Each Infirmary level adds 2 HP per second and still shortens respawn time. Leaving the circle or pausing stops healing.
- Unfinished cash and timber contributions persist across relaunches. Save schema v9 migrates earlier saves, retaining their names, upgrades, stock, settings, and currency.
- Stocked grills and unlocked smokehouses finish cooking while the app is closed or hidden, using at most eight hours of elapsed time. Existing ingredients limit production, and purchased workers can finish deliveries into saved collectible proceeds. Offline time never runs raids.
- After onboarding, the objective card points to the next expansion or crew milestone.

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
- visible raw/cooked/timber backpack stacks, magnetic drops, provision storage, animated grill conversion, physical output piles, inventory-matched queues of eight villagers, hired meal delivery, physical cash, and real upgrade effects;
- 25 upgrade lines covering combat, survival, carrying, production, customers, staffing, compound construction, gate armor, defenses, remote industry, heat, and recovery;
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

The current schema is version 5. Progress saves after purchases, deposits/major state changes, deaths, settings updates, imports/resets, document hiding, and every eight active seconds. IndexedDB is primary and `localStorage` is a fallback for constrained/private environments.

Saved state includes the Trailwarden call-sign, banked cash, passive cash, lumber-yard stock, upgrade levels, unfinished pad contributions, all expedition gates, numbered raid history, station inventory/progress, tutorial completion, stats, and settings. Carried at-risk cargo and physical world drops are deliberately session state. Import validates and migrates the file before replacing progress; reset requires two confirmations. Migration hooks for v1–v7 and unknown/corrupt data are covered by unit tests.

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
