import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __EMBERWAKE__: {
      getSave: () => { trailwardenName: string };
      getState: () => {
        player: { x: number; y: number; health: number; meat: number; fish: number; meals: number; fishMeals: number; wood: number; alive: boolean };
        enemies: Array<{ kind: string; state: string; x: number; y: number; isRaid: boolean }>;
        cash: number;
        cashDrops: number;
        customers: number;
        customerDemand: number;
        station: { rawMeat: number; meals: number; rawFish: number; fishMeals: number };
        upgrades: Record<string, number>;
        unlocks: { zone2: boolean; dock: boolean; glacier: boolean; whiteout: boolean; raidSeen: boolean };
        raidState: string;
        raidBreached: boolean;
        raidCashLost: number;
        gateHealth: number;
        campGateOpen: number;
      };
      teleport: (x: number, y: number) => void;
      defeatEnemy: () => void;
      grantCash: (amount: number) => void;
      setCargo: (meat: number, fish: number) => void;
      setMeals: (meals: number, fishMeals: number) => void;
      setWood: (wood: number) => void;
      damagePlayer: (amount: number) => void;
      triggerRaid: () => void;
      damageGate: (amount: number) => void;
    };
  }
}

test('the real first launch shows the loading ritual and stores the Trailwarden name', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'run the seven-second first-run sequence once');
  // The normal suite uses a fast automation-only path. This assertion deliberately
  // exposes the real timing and first-run prompt seen by an installed player.
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false }));
  await page.goto('/');
  await expect(page.locator('#launch-loader')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.launch-progress-track')).toHaveAttribute('aria-valuenow', /[1-9]/);
  await expect(page.getByRole('heading', { name: 'What do your villagers call you?' })).toBeVisible({ timeout: 7_000 });
  await page.getByLabel('Trailwarden name').fill('Frost Fox');
  await page.getByRole('button', { name: 'TAKE THE WATCH' }).click();
  await expect(page.getByRole('heading', { name: 'EMBERWAKE' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getSave().trailwardenName)).toBe('Frost Fox');
});

test('boots, starts, renders HUD and moves with keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'EMBERWAKE' })).toBeVisible();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await expect(page.locator('#canvas-host canvas')).toBeVisible();
  const before = await page.evaluate(() => window.__EMBERWAKE__.getState().player);
  await page.keyboard.down('d');
  await page.waitForTimeout(700);
  await page.keyboard.up('d');
  const after = await page.evaluate(() => window.__EMBERWAKE__.getState().player);
  expect(after.x).toBeGreaterThan(before.x + 30);
  expect(after.health).toBeGreaterThan(0);
  const wildlifeInsideCompound = (await page.evaluate(() => window.__EMBERWAKE__.getState())).enemies
    .filter(enemy => !enemy.isRaid && enemy.x >= 210 && enemy.x <= 1840 && enemy.y >= 210 && enemy.y <= 1540);
  expect(wildlifeInsideCompound).toEqual([]);
  expect(errors).toEqual([]);
});

test('compound gate opens before the player crosses the palisade', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1560, 870));

  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).campGateOpen).toBeGreaterThan(0.72);

  // Mobile projects verify their real pointer joystick in the dedicated test below;
  // synthetic multi-key chords are not consistently emitted by mobile emulation.
  if (isMobile) return;

  // Down + right in screen space maps to due-east movement through the gateway.
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await page.waitForTimeout(1_800);
  await page.keyboard.up('s');
  await page.keyboard.up('d');
  const player = (await page.evaluate(() => window.__EMBERWAKE__.getState())).player;
  expect(player.x).toBeGreaterThan(1760);
  expect(Math.abs(player.y - 870)).toBeLessThan(120);
});

test('mobile floating joystick responds and the viewport never scrolls', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  const before = await page.evaluate(() => window.__EMBERWAKE__.getState().player);
  const canvas = page.locator('#canvas-host canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas missing');
  const startX = box.x + box.width * .55;
  const startY = box.y + box.height * .78;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY, { steps: 8 });
  await page.waitForTimeout(650);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__EMBERWAKE__.getState().player);
  expect(after.x).toBeGreaterThan(before.x + 20);
  expect(await page.evaluate(() => ({ h: document.documentElement.scrollHeight, inner: window.innerHeight, y: window.scrollY }))).toEqual({ h: 956, inner: 956, y: 0 });
});

test('every cooked plate creates one waiting customer and the whole batch sells through', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'run the inventory-driven queue acceptance once');
  test.setTimeout(70_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();

  await page.evaluate(() => {
    window.__EMBERWAKE__.setCargo(4, 0);
    window.__EMBERWAKE__.teleport(1200, 430);
  });
  await expect.poll(async () => {
    const station = (await page.evaluate(() => window.__EMBERWAKE__.getState())).station;
    return station.rawMeat + station.meals;
  }).toBe(4);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).station.meals, { timeout: 24_000 }).toBe(4);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).customerDemand).toBe(4);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).customers, { timeout: 8_000 }).toBe(4);

  await page.evaluate(() => window.__EMBERWAKE__.teleport(1360, 670));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.meals).toBe(4);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(720, 500));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.meals, { timeout: 24_000 }).toBe(0);
  const sold = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(sold.customerDemand).toBe(0);
  expect(sold.cashDrops).toBe(4);
});

test('a buckled gate becomes a pantry breach that can drain the whole bank', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'run the full breach simulation once');
  test.setTimeout(70_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.grantCash(48);
    window.__EMBERWAKE__.triggerRaid();
    window.__EMBERWAKE__.damageGate(9999);
  });

  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).raidBreached).toBe(true);
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__EMBERWAKE__.getState());
    return Math.min(...state.enemies.filter(enemy => enemy.isRaid).map(enemy => Math.hypot(enemy.x - 1360, enemy.y - 670)));
  }, { timeout: 25_000 }).toBeLessThan(100);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).cash, { timeout: 18_000 }).toBe(0);
  const breached = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(breached.raidState).toBe('active');
  expect(breached.raidCashLost).toBe(48);
});

test('critical tycoon loop, defeat loss, expansions, fishing and raid stay live', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'run the long deterministic acceptance flow once');
  // This single test walks the entire game: hunt, deposit, production, sale, cash,
  // upgrade, death and permanent cargo loss, both paid expansions, fishing, and a raid.
  // Each plate purchase also waits out the deliberate stop-to-buy delay, so the
  // default 30s budget is too tight for the flow rather than for any one step.
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();

  await page.evaluate(() => {
    window.__EMBERWAKE__.defeatEnemy();
    window.__EMBERWAKE__.teleport(2060, 600);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.meat).toBeGreaterThan(0);

  // Raw meat cannot be served directly at the Mess Hall.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(720, 500));
  await page.waitForTimeout(1_000);
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).cashDrops).toBe(0);

  // Dump the whole raw haul on the pad behind the cookout.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1200, 430));
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__EMBERWAKE__.getState());
    return state.station.rawMeat + state.station.meals;
  }).toBeGreaterThan(0);

  // Wait for the grill, then physically collect its visible ready pile.
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).station.meals, { timeout: 8_000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1360, 670));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.meals).toBeGreaterThan(0);

  // Only carried cooked meals can feed guests behind the counter.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(720, 500));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).cashDrops, { timeout: 30_000 }).toBeGreaterThan(0);

  // Takings sit on their own plate, well off the working route.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(420, 420));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).cash).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__EMBERWAKE__.grantCash(100);
    // First rotating plate in the hearth district's upgrade row; Edge leads the order.
    window.__EMBERWAKE__.teleport(520, 1330);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).upgrades.weaponDamage).toBe(1);

  await page.evaluate(() => {
    // Out in the hunting grounds, well beyond the furnace's warm circle.
    window.__EMBERWAKE__.teleport(2100, 1000);
    window.__EMBERWAKE__.setCargo(2, 1);
    window.__EMBERWAKE__.setMeals(2, 1);
    window.__EMBERWAKE__.setWood(3);
    window.__EMBERWAKE__.damagePlayer(999);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.alive).toBe(false);
  await expect(page.locator('#defeat-loss')).toContainText('3 raw food · 3 cooked meals · 3 timber · Lost to the frostwild');
  const defeatedCargo = (await page.evaluate(() => window.__EMBERWAKE__.getState())).player;
  expect({ meat: defeatedCargo.meat, fish: defeatedCargo.fish, meals: defeatedCargo.meals, fishMeals: defeatedCargo.fishMeals, wood: defeatedCargo.wood })
    .toEqual({ meat: 0, fish: 0, meals: 0, fishMeals: 0, wood: 0 });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.alive, { timeout: 8_000 }).toBe(true);
  const respawnedCargo = (await page.evaluate(() => window.__EMBERWAKE__.getState())).player;
  expect({ meat: respawnedCargo.meat, fish: respawnedCargo.fish, meals: respawnedCargo.meals, fishMeals: respawnedCargo.fishMeals, wood: respawnedCargo.wood })
    .toEqual({ meat: 0, fish: 0, meals: 0, fishMeals: 0, wood: 0 });

  // Build plates are paid in hauled timber now, not cash.
  await page.evaluate(() => {
    window.__EMBERWAKE__.setWood(200);
    // Frontier plate, out east past the hunting grounds.
    window.__EMBERWAKE__.teleport(2390, 900);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).unlocks.zone2, { timeout: 15_000 }).toBe(true);
  // Shoreline plate, inside the compound at the south gap.
  await page.evaluate(() => {
    window.__EMBERWAKE__.setWood(200);
    window.__EMBERWAKE__.teleport(1010, 1385);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).unlocks.dock, { timeout: 15_000 }).toBe(true);

  await page.evaluate(() => window.__EMBERWAKE__.teleport(620, 1900));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.fish, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(862, 1770));
  await expect.poll(async () => {
    const station = (await page.evaluate(() => window.__EMBERWAKE__.getState())).station;
    return station.rawFish + station.fishMeals;
  }).toBeGreaterThan(0);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).station.fishMeals, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1120, 1860));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.fishMeals).toBeGreaterThan(0);

  await page.evaluate(() => window.__EMBERWAKE__.triggerRaid());
  const raid = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(raid.raidState).toBe('active');
  const raiders = raid.enemies.filter(enemy => enemy.kind === 'raider');
  expect(raiders.length).toBeGreaterThanOrEqual(4);
  expect(raiders.every(enemy => Math.hypot(enemy.x - 1738, enemy.y - 870) > 700)).toBe(true);
  const startingGateHealth = raid.gateHealth;
  // The staged path must complete: the off-camera pack reaches the compound and
  // lands at least one real hit instead of snagging on scenery in the frostwild.
  await expect.poll(async () => {
    const state = await page.evaluate(() => window.__EMBERWAKE__.getState());
    return Math.min(...state.enemies.filter(enemy => enemy.isRaid).map(enemy => Math.hypot(enemy.x - 1738, enemy.y - 870)));
  }, { timeout: 35_000 }).toBeLessThan(180);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).gateHealth, { timeout: 8_000 }).toBeLessThan(startingGateHealth);
});
