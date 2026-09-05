import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __EMBERWAKE__: {
      getSave: () => { trailwardenName: string; contributions: Partial<Record<string, number>> };
      getState: () => {
        player: { x: number; y: number; health: number; meat: number; fish: number; meals: number; fishMeals: number; wood: number; alive: boolean; ammo: number; reloadTimer: number };
        enemies: Array<{ kind: string; state: string; health: number; damage: number; cashReward: number; x: number; y: number; isRaid: boolean }>;
        cash: number;
        simulationTime: number;
        cashDrops: number;
        cashLoot: Array<{ x: number; y: number; value: number }>;
        rawLoot: Array<{ x: number; y: number; amount: number }>;
        defense: { level: number; kind: string; posts: number; warriors: number; warriorHealth: number[]; shots: number };
        wardenPositions: Array<{ x: number; y: number; health: number }>;
        lumberjacks: Array<{ x: number; y: number; state: string; carried: number; target: { x: number; y: number } | null }>;
        cargoAnchor: { x: number; y: number; bottom: number };
        customers: number;
        customerDemand: number;
        waitingCustomers: number;
        cook: { x: number; y: number; carrying: number; delivering: boolean };
        station: { rawMeat: number; meals: number; rawFish: number; fishMeals: number; lumber: number; passiveCash: number };
        upgrades: Record<string, number>;
        unlocks: { zone2: boolean; dock: boolean; glacier: boolean; whiteout: boolean; raidSeen: boolean };
        raidState: string;
        raidWave: number;
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
      setAmmo: (ammo: number) => void;
      damagePlayer: (amount: number) => void;
      triggerRaid: () => void;
      damageGate: (amount: number) => void;
    };
  }
}

test('slow rendering does not slow the game clock or advance paused time', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise deliberately slow frames once');
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => request(() => window.setTimeout(() => callback(performance.now()), 180));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().simulationTime)).toBeGreaterThan(.1);
  const before = await page.evaluate(() => ({ game: window.__EMBERWAKE__.getState().simulationTime, real: performance.now() }));
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ game: window.__EMBERWAKE__.getState().simulationTime, real: performance.now() }));
  expect((after.game - before.game) / ((after.real - before.real) / 1000)).toBeGreaterThan(.75);
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  const paused = await page.evaluate(() => window.__EMBERWAKE__.getState().simulationTime);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().simulationTime)).toBe(paused);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForTimeout(600);
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState().simulationTime)) - paused).toBeLessThan(1);
});

test('offline crews leave collectible cash and three-pile lumber stock', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise offline earnings once');
  await page.addInitScript(() => localStorage.setItem('emberwake-save-v2', JSON.stringify({
    version: 8, updatedAt: Date.now() - 1_000_000, trailwardenName: 'Ember Fox', cash: 0,
    upgrades: { worker: 1, saleValue: 2, lumberjack: 1, hunters: 1 },
    unlocks: { zone2: true, dock: false, glacier: false, whiteout: false, raidSeen: false },
    station: { rawMeat: 12 }, tutorial: 'complete'
  })));
  await page.goto('/');
  await expect(page.locator('#away-report')).toContainText('ready to collect');
  await expect(page.locator('#away-report')).toContainText('logs stacked');
  await expect(page.locator('#away-report')).toContainText('meat hunted');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  const produced = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(produced.station.passiveCash).toBeGreaterThan(0);
  expect(produced.station.lumber).toBeGreaterThan(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(420, 420));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.passiveCash)).toBe(0);
  const afterCash = await page.evaluate(() => window.__EMBERWAKE__.getState().cash);
  expect(afterCash).toBeGreaterThan(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1420, 1220));
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: 'test-results/offline-lumber-yard.png' });
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1500, 1120));
  await expect(page.locator('#interaction-title')).toContainText('Lumber yard');
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().player.wood)).toBeGreaterThan(0);
});

test('lumberjacks fell real trees and the shoreline crew pad is reachable', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise autonomous harvesting and shoreline collision once');
  test.setTimeout(55_000);
  await page.addInitScript(() => localStorage.setItem('emberwake-save-v2', JSON.stringify({
    version: 8, updatedAt: Date.now(), trailwardenName: 'Timber Fox', cash: 1000,
    upgrades: { lumberjack: 3 },
    unlocks: { zone2: true, dock: true, glacier: false, whiteout: false, raidSeen: false },
    station: { lumber: 296 }, tutorial: 'complete'
  })));
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().lumberjacks.some(worker => worker.state === 'chopping')), { timeout: 20_000 }).toBe(true);
  const target = await page.evaluate(() => window.__EMBERWAKE__.getState().lumberjacks.find(worker => worker.state === 'chopping')?.target);
  expect(target).not.toBeNull();
  await page.evaluate(point => window.__EMBERWAKE__.teleport(point!.x - 250, point!.y - 160), target);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/lumberjack-chopping-tree.png' });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.lumber), { timeout: 25_000 }).toBe(300);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1370, 1220));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/lumber-yard-after-delivery.png' });

  await page.evaluate(() => window.__EMBERWAKE__.teleport(640, 1740));
  await expect(page.locator('#interaction-title')).toContainText('Fisher Crew');
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().upgrades.fisher)).toBe(1);
});

test('the AK fires from a 36-round magazine and reloads for two seconds', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise the final Armory weapon once');
  await page.addInitScript(() => localStorage.setItem('emberwake-save-v2', JSON.stringify({
    version: 8, updatedAt: Date.now(), trailwardenName: 'Longshot', cash: 0,
    upgrades: { weaponTier: 8 }, unlocks: {}, station: {}, tutorial: 'complete'
  })));
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.setAmmo(1);
    window.__EMBERWAKE__.teleport(1900, 600);
  });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().player.reloadTimer)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().player.ammo)).toBe(0);
  await page.screenshot({ path: 'test-results/ak47-reloading.png' });
  // Step into the safe hearth so the freshly loaded magazine is not immediately fired.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(980, 1150));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().player.reloadTimer), { timeout: 3_500 }).toBe(0);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().player.ammo)).toBeGreaterThanOrEqual(35);
});

test('eight guests queue and the hired cook delivers meals without banking cash', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise cook delivery once');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    if (!localStorage.getItem('emberwake-save-v2')) localStorage.setItem('emberwake-save-v2', JSON.stringify({
      version: 5, updatedAt: Date.now(), cash: 8888, upgrades: { counterCapacity: 2, defense: 2 },
      station: { meals: 8 }, tutorial: 'complete'
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => window.__EMBERWAKE__.teleport(830, 1150));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().waitingCustomers), { timeout: 30_000 }).toBe(8);
  await page.screenshot({ path: 'test-results/eight-villager-queue.png' });
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1080, 850));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().upgrades.worker), { timeout: 15_000 }).toBe(1);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(830, 1150));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cook.carrying)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/cook-delivery.png' });
  const cash = await page.evaluate(() => window.__EMBERWAKE__.getState().cash);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().customerDemand), { timeout: 65_000 }).toBe(0);
  const state = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(state.cash).toBe(cash);
  expect(state.cashLoot.reduce((sum, item) => sum + item.value, 0)).toBe(32);
  expect(state.player.meals).toBe(0);
  expect(state.station.meals).toBe(0);
  expect(state.cook.carrying).toBe(0);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(420, 420));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(cash + 32);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1460, 790));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/cookout-sign-archer.png' });
});

test('large cash values fit their HUD cell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  for (const amount of [8888, 88888, 8888888]) {
    await page.evaluate(value => window.__EMBERWAKE__.grantCash(value), amount);
    await expect(page.locator('#cash-value')).toContainText(/[KM]/);
    const fits = await page.locator('.cash-resource').evaluate(element => {
      const box = element.getBoundingClientRect();
      const icon = element.querySelector('.resource-icon')!.getBoundingClientRect();
      const value = element.querySelector('.hud-value')!.getBoundingClientRect();
      return icon.right <= value.left && value.right <= box.right && icon.left >= box.left;
    });
    expect(fits).toBe(true);
  }
});

test('outpost overview explains investments and resumes play', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.getByRole('button', { name: 'Outpost', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Outpost overview' })).toBeVisible();
  await expect(page.locator('#outpost-advice')).toContainText('$108');
  await expect(page.locator('#outpost-districts')).toContainText('45 timber');
  await expect(page.locator('#outpost-production')).toContainText('up to 8 guests');
  await page.screenshot({ path: `test-results/outpost-overview-${testInfo.project.name}.png` });
  await page.getByRole('button', { name: 'Back to camp' }).click();
  await expect(page.getByRole('heading', { name: 'Outpost overview' })).toBeHidden();
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
});

test('compact defense pad advances through defenders and raid loot stays collectible', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise the complete defense progression once');
  test.setTimeout(150_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => { window.__EMBERWAKE__.setWood(3); window.__EMBERWAKE__.teleport(1480, 1010); });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(24);
  await page.evaluate(() => { window.__EMBERWAKE__.grantCash(40000); window.__EMBERWAKE__.teleport(1460, 735); });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().upgrades.defense)).toBe(0);
  await page.screenshot({ path: 'test-results/compact-defense-pad.png' });
  for (const [index, kind] of ['spear', 'archer', 'archer', 'turret', 'turret', 'turret', 'turret', 'turret', 'turret'].entries()) {
    await page.evaluate(() => window.__EMBERWAKE__.teleport(1460, 680));
    await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().defense.level), { timeout: 30_000 }).toBe(index + 1);
    expect(await page.evaluate(() => window.__EMBERWAKE__.getState().defense.kind)).toBe(kind);
    await page.evaluate(() => window.__EMBERWAKE__.teleport(1460, 790));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/defense-level-${index + 1}.png` });
  }
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().defense.posts)).toBe(4);
  await page.evaluate(() => { window.__EMBERWAKE__.teleport(830, 1150); window.__EMBERWAKE__.triggerRaid(); });
  const count = await page.evaluate(() => window.__EMBERWAKE__.getState().enemies.filter(e => e.isRaid).length);
  const before = await page.evaluate(() => window.__EMBERWAKE__.getState().cash);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().defense.shots), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().raidState), { timeout: 40_000 }).not.toBe('active');
  const after = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(after.raidBreached).toBe(false);
  expect(after.cash).toBe(before);
  expect(after.cashLoot.filter(drop => drop.value === 6)).toHaveLength(count);
  expect(after.cashLoot.reduce((sum, drop) => sum + drop.value, 0)).toBe(count * 6 + 42);
  expect(after.rawLoot.reduce((sum, drop) => sum + drop.amount, 0)).toBe(count * 2);
  for (const drop of after.cashLoot) {
    await page.evaluate(({ x, y }) => window.__EMBERWAKE__.teleport(x, y), drop);
    await page.waitForTimeout(200);
  }
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(before + count * 6 + 42);
  await page.evaluate(() => {
    window.__EMBERWAKE__.teleport(1120, 980);
    window.__EMBERWAKE__.setCargo(3, 0); window.__EMBERWAKE__.setMeals(1, 0); window.__EMBERWAKE__.setWood(2);
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().cargoAnchor.bottom)).toBeLessThan(-60);
  await page.screenshot({ path: 'test-results/three-backpack-stacks.png' });
});

test('late districts operate businesses and numbered raid waves scale', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise the expanded economy once');
  test.setTimeout(65_000);
  await page.addInitScript(() => localStorage.setItem('emberwake-save-v2', JSON.stringify({
    version: 6, updatedAt: Date.now(), trailwardenName: 'Northstar', cash: 5000,
    upgrades: { defense: 3, gateArmor: 2, compound: 3, warriors: 2, fishery: 3, fisher: 2, oreRig: 2, robots: 2 },
    unlocks: { zone2: true, dock: true, glacier: true, whiteout: true, raidSeen: true },
    station: {}, tutorial: 'complete', stats: { raidsFaced: 4, raidsWon: 3 }
  })));
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  const initial = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(initial.defense.warriors).toBe(4);
  expect(initial.gateHealth).toBe(1150);
  const ridgeIcehorn = initial.enemies.find(enemy => enemy.kind === 'icehorn' && enemy.x < 4400)!;
  const whiteoutIcehorn = initial.enemies.find(enemy => enemy.kind === 'icehorn' && enemy.x >= 6800)!;
  expect(ridgeIcehorn.cashReward).toBe(12);
  expect(whiteoutIcehorn.cashReward).toBe(24);
  expect(whiteoutIcehorn.health).toBeGreaterThan(ridgeIcehorn.health);
  expect(whiteoutIcehorn.damage).toBeGreaterThan(ridgeIcehorn.damage);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1450, 1050));
  await page.waitForTimeout(1_800);
  await page.screenshot({ path: 'test-results/expanded-compound.png' });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.rawFish), { timeout: 12_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cashLoot.some(drop => Math.hypot(drop.x - 5200, drop.y - 2470) < 150)), { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(5050, 2680));
  await page.waitForTimeout(700);
  await expect(page.locator('#interaction-title')).toContainText('Salvage Rig');
  await page.screenshot({ path: 'test-results/glacier-salvage-rig.png' });
  await page.evaluate(() => window.__EMBERWAKE__.teleport(7280, 4040));
  await page.waitForTimeout(2_600);
  await page.screenshot({ path: 'test-results/whiteout-robot-foundry.png' });
  const raid = await page.evaluate(() => {
    window.__EMBERWAKE__.triggerRaid();
    return window.__EMBERWAKE__.getState();
  });
  expect(raid.raidWave).toBe(5);
  expect(raid.enemies.filter(enemy => enemy.isRaid).length).toBe(10);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().wardenPositions.some(warden => warden.x > 1750)), { timeout: 20_000 }).toBe(true);
  const defending = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(defending.defense.warriorHealth.every(health => health <= 160)).toBe(true);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1780, 870));
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/wardens-outside-gate.png' });
});

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

test('the hearth heals gradually, stops outside its boundary, and respects pause', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise simulation healing once');
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  const healingStart = await page.evaluate(() => {
    window.__EMBERWAKE__.teleport(830, 1150);
    window.__EMBERWAKE__.damagePlayer(20);
    return window.__EMBERWAKE__.getState();
  });
  await expect(page.locator('#healing-status')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health).toBeGreaterThan(83);
  const healed = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(healed.player.health).toBeCloseTo(Math.min(100, healingStart.player.health + (healed.simulationTime - healingStart.simulationTime) * 4), 4);
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  const paused = (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health;
  await page.waitForTimeout(650);
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health).toBe(paused);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.teleport(1200, 850);
    window.__EMBERWAKE__.damagePlayer(10);
  });
  await expect(page.locator('#healing-status')).toBeHidden();
  const outside = (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health;
  await page.waitForTimeout(650);
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health).toBe(outside);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(830, 1150));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health).toBeGreaterThan(outside + 1);
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).player.health, { timeout: 40_000 }).toBe(100);
  await expect(page.locator('#healing-status')).toBeHidden();
});

test('unfinished cash and timber contributions survive a reload', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise save continuity once');
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.grantCash(10);
    window.__EMBERWAKE__.teleport(520, 1220);
  });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getSave().contributions.weaponDamage)).toBe(10);
  await page.evaluate(() => {
    window.__EMBERWAKE__.setWood(5);
    window.__EMBERWAKE__.teleport(1180, 1210);
  });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getSave().contributions.dock)).toBe(5);
  // A real Settings change flushes the same save used on app hiding and autosave.
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  await page.getByLabel('Haptics').uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('emberwake-save-v2') ?? '{}').contributions?.dock)).toBe(5);
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  expect(await page.evaluate(() => window.__EMBERWAKE__.getSave().contributions)).toMatchObject({ weaponDamage: 10, dock: 5 });
  await page.evaluate(() => window.__EMBERWAKE__.teleport(520, 1100));
  await expect(page.locator('#interaction-action')).toContainText('$16');
  await page.evaluate(() => {
    window.__EMBERWAKE__.grantCash(16);
    window.__EMBERWAKE__.teleport(520, 1220);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).upgrades.weaponDamage).toBe(1);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getSave().contributions.weaponDamage)).toBeUndefined();
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1180, 1210));
  await expect(page.locator('#interaction-action')).toContainText('40 logs');
});

test('nearby floor pads explain their benefit and accept a purchase', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise floor-pad purchase once');
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.grantCash(26);
    window.__EMBERWAKE__.teleport(520, 1100);
  });
  await expect(page.locator('#interaction-title')).toContainText('Edge');
  await expect(page.locator('#interaction-detail')).toContainText('8 damage → 11 damage');
  await expect(page.locator('#interaction-action')).toContainText('$26');
  await page.evaluate(() => window.__EMBERWAKE__.teleport(520, 1220));
  await expect.poll(async () => (await page.evaluate(() => window.__EMBERWAKE__.getState())).upgrades.weaponDamage).toBe(1);
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).cash).toBe(0);
  await expect(page.locator('#interaction-title')).not.toContainText('Edge');
  await expect(page.locator('#toast')).toContainText('Edge upgraded · 11 damage');
});

test('returning to a stocked outpost cooks food once and shows the welcome report', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise closed-app production once');
  await page.addInitScript(() => {
    if (sessionStorage.getItem('offline-cooking-seeded')) return;
    sessionStorage.setItem('offline-cooking-seeded', 'yes');
    localStorage.setItem('emberwake-save-v2', JSON.stringify({
      version: 7, updatedAt: Date.now() - 60_000, trailwardenName: 'Ember Fox', cash: 0,
      upgrades: {}, unlocks: {}, tutorial: 'complete',
      station: { rawMeat: 10, meals: 0, rawFish: 0, fishMeals: 0, butcherProgress: 0, fishProgress: 0 }
    }));
  });
  await page.goto('/');
  await expect(page.locator('#away-report')).toContainText('4 meals cooked');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).waitFor();
  await page.waitForFunction(() => Boolean(window.__EMBERWAKE__));
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).station).toMatchObject({ rawMeat: 6, meals: 4 });
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).waitFor();
  await page.waitForFunction(() => Boolean(window.__EMBERWAKE__));
  await expect(page.locator('#away-report')).toBeHidden();
  expect((await page.evaluate(() => window.__EMBERWAKE__.getState())).station).toMatchObject({ rawMeat: 6, meals: 4 });
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
  await page.evaluate(() => {
    for (const key of ['d', 's']) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().player.x), { timeout: 10_000 }).toBeGreaterThan(1760);
  const player = await page.evaluate(() => {
    for (const key of ['d', 's']) window.dispatchEvent(new KeyboardEvent('keyup', { key }));
    return window.__EMBERWAKE__.getState().player;
  });
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
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().player.x), { timeout: 10_000 }).toBeGreaterThan(before.x + 20);
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
    window.__EMBERWAKE__.teleport(520, 1220);
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
    window.__EMBERWAKE__.teleport(1180, 1210);
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

  const raid = await page.evaluate(() => {
    window.__EMBERWAKE__.triggerRaid();
    return window.__EMBERWAKE__.getState();
  });
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
