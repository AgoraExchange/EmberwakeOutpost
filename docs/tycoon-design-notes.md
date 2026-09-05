# Tycoon design pass — 4 September 2026

Primary references reviewed:

- [My Perfect Hotel, publisher's game description](https://play.google.com/store/apps/details?id=com.master.hotelmaster): manual service develops into staffing, amenities, and distinct properties; employee speed affects throughput.
- [SuperWEIRD Game Kit](https://github.com/ludenio/SuperWEIRDGameKit): its CC0 shop/production prototype links customer orders to expanding production and separates worlds into distinct visual collections. Emberwake reuses the design principle, not its Defold engine code.
- [Idle Miner Tycoon, developer's progression guide](https://www.kolibrigames.com/blog/lets-dig-in/): production, transport, and storage must grow together; new territory provides longer-term progression.
- [SayGames on developing My Perfect Hotel](https://blog.say.games/posts/my-perfect-hotel-saygames-latest-hybrid-casual-hit-becomes-the-most-downloaded-game-in-the-world): the publisher describes continued product iteration rather than a single final redesign.

Emberwake adaptations implemented:

1. Make automation visible and earned. The Cook is an affordable permanent floor-pad purchase and physically moves finite batches from kitchen stock to the actual queue. Upgrading improves carrying and speed. Food and money cannot be created by a decorative worker animation.
2. Show the bottleneck. The Outpost overview reports ingredients, ready shelf capacity, cook load, orders, gate strength, remaining upgrade payments, and uncollected cash, with a contextual next investment.
3. Preserve meaningful upgrades. Every Grill purchase reduces cook time, even after Cook upgrades. Beacon improves arrivals without restricting the requested eight-person queue. Dedicated Cook, Grill, Armory, and Defense pads stay in recognizable districts.
4. Improve world readability. Ground pads contain only a symbol and price, props leave them clear, the Cookout sign no longer hides the archer, guests form a connected two-row queue, and cash fits phone HUD cells.
5. Give return visits a useful outcome. Stocked stations cook while away, unfinished payments survive closing, and a cook's carried batch is saved. Returning does not invent ingredients or simulate unobserved raids.
6. Keep the economy independent of rendering speed. CI exposed Pixi's 100 ms delta cap slowing the game below ten frames per second. Fixed simulation steps now consume raw elapsed time with a one-second safety cap; pause and backgrounding stop the renderer, and resume discards suspended time. A browser test deliberately slows frames to verify the clock.

Existing expansion sequence: Eastern Frontier (30 timber), Shoreline Works (45 timber; fishing and smokehouse), Glacier Reach ($650), Whiteout Expanse ($1,600). Defense develops from spear watch through archer towers into automatic turrets.

Shipped in 1.3: Shoreline fishery staffing, Glacier salvage income, Whiteout utility robots, compound annexes, separate gate armor, roaming wardens, and persistent numbered raid scaling. Each distant district now introduces a functioning investment instead of serving only as a larger hunting field.

“Three times better” is a creative target, not a measured result. Validate these changes through task completion, readability on phones, delivery throughput, and actual player feedback.
