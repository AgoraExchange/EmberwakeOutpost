import { expect, test, type Page } from '@playwright/test';

async function start(page: Page, robots: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ robots, extra }) => {
    if (sessionStorage.getItem('robot-test-seeded')) return;
    sessionStorage.setItem('robot-test-seeded', 'yes');
    localStorage.setItem('emberwake-save-v2', JSON.stringify({
      version: 10, updatedAt: Date.now(), trailwardenName: 'Robot Tester', cash: 0,
      upgrades: { robots: 3, oreRig: 1, counterCapacity: 5, customerRate: 5 },
      unlocks: { zone2: true, dock: true, glacier: true, whiteout: true, raidSeen: false },
      robots, tutorial: 'complete', ...extra
    }));
  }, { robots, extra });
  await page.goto('/');
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
}

test('nearby robots have a touch assignment menu and saved mining work leaves collectible cash', async ({ page }, testInfo) => {
  test.setTimeout(65_000);
  await start(page);
  const assign = page.getByRole('button', { name: 'Assign robot 1', exact: true });
  await expect(assign).toBeHidden();
  await page.evaluate(() => window.__EMBERWAKE__.teleport(7100, 4150));
  await expect(assign).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('foundry.png') });
  await assign.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.robot-job')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('assignment.png') });
  await page.locator('[data-job="ore"]').click();
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.job)).toBe('ore');
  // Exercise the actual route from Whiteout through the ridge pass to Glacier.
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.status), { timeout: 30_000 }).toBe('Mining ore');
  await page.evaluate(() => window.__EMBERWAKE__.teleport(4760, 2570));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.robotOreCash), { timeout: 15_000 }).toBeGreaterThanOrEqual(70);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(0);
  await assign.click();
  await page.locator('[data-job="idle"]').click();
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.job)).toBe('idle');
  const owed = await page.evaluate(() => window.__EMBERWAKE__.getState().station.robotOreCash);
  expect(owed).toBeGreaterThanOrEqual(70);
  await page.evaluate(() => window.__EMBERWAKE__.teleport(5200, 2470));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.robotOreCash)).toBe(0);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBeGreaterThanOrEqual(owed);
});

test('six mining robots use separate work spaces and contribute separate payouts', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise the full mining crew once');
  const nodes = [{ x: 4760, y: 2450 }, { x: 4940, y: 2620 }, { x: 5320, y: 2320 }];
  await start(page, Array.from({ length: 6 }, (_, i) => ({ job: 'ore', ...nodes[i % 3] })));
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots.filter(r => r.status === 'Mining ore').length)).toBe(6);
  const robots = await page.evaluate(() => window.__EMBERWAKE__.getState().robots);
  for (let i = 0; i < 3; i++) expect(Math.hypot(robots[i]!.x - robots[i + 3]!.x, robots[i]!.y - robots[i + 3]!.y)).toBeGreaterThan(90);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.robotOreCash), { timeout: 15_000 }).toBe(420);
});

test('robot chops real trees, carries bonus logs and banks exact timber sales', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise harvesting once');
  test.setTimeout(50_000);
  await start(page, [{ job: 'timber', x: 1910, y: 780 }]);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.wood), { timeout: 15_000, intervals: [100] }).toBe(10);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cash), { timeout: 25_000 }).toBe(80);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().cash), { timeout: 25_000 }).toBe(168);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().station.lumber)).toBe(0);
});

test('reassigning a loaded robot keeps its delivery through a reload without duplicate payment', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise delivery persistence once');
  await start(page, [{ job: 'timber', x: 2220, y: 900, wood: 14 }]);
  await page.evaluate(async () => {
    for (let frame = 0; frame < 100; frame++) {
      const r = window.__EMBERWAKE__.getState().robots[0]!;
      window.__EMBERWAKE__.teleport(r.x, r.y + 90);
      await new Promise(resolve => setTimeout(resolve, 30));
      const button = document.querySelector<HTMLButtonElement>('.robot-tap')!;
      if (!button.hidden) { button.click(); return; }
    }
  });
  await expect(page.locator('#robot-status')).toContainText('14 logs');
  await page.locator('[data-job="idle"]').click();
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.job), { timeout: 15_000 }).toBe('idle');
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(112);
  await page.getByRole('button', { name: 'Pause and settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().cash)).toBe(112);
  expect(await page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.wood)).toBe(0);
});

test('robot hunts a real bear, banks its bonus and delivers meat to the kitchen', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise hunting once');
  test.setTimeout(45_000);
  await start(page, [{ job: 'hunt', x: 2110, y: 600 }]);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().robots[0]?.meat), { timeout: 15_000 }).toBe(14);
  const killed = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(killed.cash).toBe(21);
  expect(killed.rawLoot).toHaveLength(0);
  expect(killed.cashLoot.filter(drop => drop.x < 3000)).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().station.rawMeat), { timeout: 20_000 }).toBeGreaterThanOrEqual(13);
});

for (const fish of [false, true]) test(`robot delivers ${fish ? 'fish' : 'meat'} plates and leaves cash at the strongbox`, async ({ page, browserName, isMobile }) => {
  test.skip(isMobile || browserName !== 'chromium', 'exercise each meal source once');
  test.setTimeout(45_000);
  await start(page, [{ job: 'serve', x: fish ? 1120 : 1360, y: fish ? 1860 : 670 }], { station: fish ? { fishMeals: 7 } : { meals: 7 } });
  await expect.poll(() => page.evaluate(fish => { const r = window.__EMBERWAKE__.getState().robots[0]!; return fish ? r.fishMeals : r.meals; }, fish)).toBe(7);
  await expect.poll(() => page.evaluate(() => window.__EMBERWAKE__.getState().customerDemand), { timeout: 30_000 }).toBe(0);
  const served = await page.evaluate(() => window.__EMBERWAKE__.getState());
  expect(served.cash).toBe(0);
  expect(served.cashLoot.filter(drop => drop.x < 1000).reduce((sum, drop) => sum + drop.value, 0)).toBeGreaterThan(0);
  expect(served.robots[0]!.meals + served.robots[0]!.fishMeals).toBe(0);
});
