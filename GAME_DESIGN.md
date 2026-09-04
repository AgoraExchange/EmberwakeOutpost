# Emberwake Outpost — Vertical Slice Design

## Fantasy and loop

The player is the Trailwarden of a heat-starved frontier settlement. The hospitality loop is: leave furnace safety → kite and defeat a Rimeback → recover raw provisions → unload at the Cookout → let workers convert visible stock → collect the plated pile → carry it to the Mess Hall serving circle → feed waiting guests → collect physical bills. Raw meat can never be sold. Timber remains the steadier main income, while hospitality is a useful side task whenever a line forms.

The visual contrast is central: cool cyan snow and oversized frostwild creatures outside, honey timber and ember-orange work areas inside. Controls stay direct and minimal; combat is automatic so the player’s skill expression is movement, spacing, route planning, cargo risk, and upgrade order.

## Risk

Rimebacks alert, chase, telegraph, swipe, knock back, leash home, and refuse to enter furnace protection. Normal wildlife spawns only outside the compound and defeated wildlife returns on an off-camera frostwild patch. Icehorns are stronger, faster, and more rewarding. Player defeat permanently destroys all carried raw food, cooked meals, frostfin plates, and timber while preserving banked cash, station stock, structures, unlocks, workers, and upgrades. Respawn occurs at the furnace with full health and brief protection. A surge creates a different economic risk: if the east gate reaches zero it visibly buckles open, the pack storms the compound, and repeated attacks on the Cookout profit crate permanently drain banked cash until the raiders die or the bank reaches zero.

## The compound

A 9,600×6,200 world—roughly eight times the original explorable area—holding a single large walled compound, divided into working
districts defined by `ZONES` in `src/game/config.ts`: the **Mess Hall** (counter, serving
pad, guest queue, strongbox), the **Cookout** (grill and the drop pad behind it), the
**Stores**, the **Gate Yard** (the Armory plate and the guard, at the only wide entrance),
and the **Hearth** (furnace, respawn, infirmary, and the upgrade row along its south edge). Cooked stock piles up beside its station and must be picked up before it can be served. Upright timber-and-iron signboards identify the Cookout, Mess Hall, Timber Post, and upgrade prices without allowing floor text to disappear behind buildings or carried cargo.

The palisade has exactly two openings: the east gateway and the south shoreline gap. Both
are 300 units wide — because screen-relative movement is a world diagonal, a narrower
opening catches the player on its corner while steering through. Guests walk in and out
through the east gateway and never cross the wall. Every plate that finishes cooking creates exactly one outstanding guest order. Guests begin on varied off-camera trails, fill up to six visible line positions, wait indefinitely until fed, and only leave after receiving a cooked plate. A queued backlog refills each place as it opens, so an entire cooked batch can be sold without leftover food. Raid wildlife also starts beyond the camera, converges on the exterior approach, and then advances on the gate rather than materializing beside it.

Everything worth doing is outside: the hunting grounds run east of the compound, and
beasts and felled trees respawn beyond the player's current view, so restocking always means going to look. Respawns are restricted to the currently unlocked side of the next icefall pass.

## Plate availability

There are only ever **four purchase plates** in the yard, at fixed positions in the open
south-east. The plates never move; what they *offer* rotates. `PAD_PRIORITY` in
`src/game/Game.ts` defines the offer order, and `resolvePadSlots()` stocks each slot with
the next upgrade that is both gated-open and not yet maxed. A slot mid-payment keeps what
it has, so partial payments are never lost when the queue shifts.

Two filters combine. The offer order teaches the core loop first — carry more, hit harder,
cook faster, serve more — and `UPGRADE_GATES` in `src/game/config.ts` holds things back
until the run has earned them (meals sold, frostwild defeated, a first death, the eastern
expansion, a survived surge). Both are derived from saved progress, so old saves adopt
their correct state silently on load through the version-3 migration.

The player therefore learns one place to spend, sees at most four choices, and all sixteen
upgrade lines remain reachable.

Plates also require the player to **stop** on them before any cash moves. Presence alone is
not enough — crossing a plate at walking pace takes longer than any comfortable timer, so
the check is on movement speed plus a short hold. Walking through a plate you do not want
costs nothing.

## Progression

1. Opening: learn movement and one timber chopping/delivery/sale cycle; buy an edge or production upgrade.
2. Stabilize: improve grill throughput, counter capacity, guest flow, health, and weapon cadence.
3. Eastern Frontier: haul 30 timber to open Icehorn Ridge and gain higher provision yields.
4. Defense: the first surge unlocks after the eastern gate and sufficient lifetime earnings. Improve the Armory for stronger, longer, slightly faster attacks, then improve the guard, furnace, and infirmary to sustain repeat raids. Holding the gate earns a defense bonus; a buckled gate awards no bonus and exposes the bank to pillaging until every raider is eliminated.
5. Shoreline: haul 45 timber to thaw the southern gate. Catch frostfin actively, unload into the separate smokehouse, collect its cooked plates, and carry them to fish-requesting guests.
6. Glacier Reach: invest $650 at the next visible pass to open a larger forest and new Icehorn hunting ground.
7. Whiteout Expanse: invest $1,600 at the final staged pass to reach the deepest ice, largest forest, and strongest wildlife mix.

Displayed next-level text is generated from the same centralized balance data used by the simulation. Movement speed and attack cadence have control/performance caps.

## Current content

- One 9,600×6,200 scrolling world with clamped smooth camera—roughly eight times the original area.
- Central fenced camp, frozen shoreline/dock, and three sequential expedition regions separated by non-bypassable icefall passes.
- Rimeback, Icehorn, and raid-specific Frenzied Rimeback state machines.
- Provision/grill and frostfin/smokehouse economies.
- Inventory-matched guest demand with one order per cooked plate, six visible line slots, permanent waits until fed, readable requests, fed reactions, and full off-camera walk-in/walk-out routes.
- Sixteen upgrade lines, four construction/expedition plates, a repeatable defense surge, versioned save/migration/export/import/reset, and installable offline PWA shell.
- Procedural animations for idle, walk, carry, attack, hurt, defeat, interact, enemy wind-up/swipe/hurt/respawn, station work, footprints, particles, damage text, construction, and cargo/cash streams.

## Tycoon expansion roadmap

The next build-out should use a staged construction tree, with only the next relevant project visible. This keeps the yard readable while giving each purchase an obvious new capability:

1. **Compound wing:** expand the palisade and reveal a second Cookout slot plus a larger Mess Hall. This raises throughput but also raises guest demand.
2. **Cook crew:** hire cooks who carry raw stock from cold storage to individual grills. Upgrades add a cook, improve movement speed, and reduce batch time; the player still collects finished plates unless a later runner upgrade is purchased.
3. **Logging camp:** hire lumberjacks who leave through the gate, select trees in unlocked regions, chop, return visibly with logs, and sell at the timber post. Tool and sled upgrades improve trip yield without replacing the player's faster active route.
4. **Archer towers:** construct paired towers outside the compound approach. Each tower gains range, attack speed, damage, and a final slowing-arrow specialization, making late surges manageable without making the gate invulnerable.
5. **Hospitality wing:** add a second serving lane, table capacity, and premium recipes. More customers and better margins are paired with longer preparation chains so food remains supplemental to timber and expedition income.
6. **Regional contracts:** expedition boards in Glacier Reach and Whiteout Expanse request timed timber, hunt, and meal deliveries. Completing sets unlocks the next region or construction tier rather than exposing every pad at once.
7. **Weather and prestige:** whiteouts alter visibility and routes; completing the deep-ice project allows a new season with permanent cosmetic or efficiency bonuses while preserving the physical production loop.

Each automation line should remain visible in the world—workers walk, collect, carry, deliver, and can be helped by the player—so growth feels like an increasingly busy outpost instead of a menu of passive numbers.
