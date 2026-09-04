import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'test-results', 'visual');
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4175';
await mkdir(output, { recursive: true });

const browser = await chromium.launch();
for (const spec of [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'iphone-portrait', width: 440, height: 956, mobile: true }
]) {
  const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, isMobile: spec.mobile, hasTouch: spec.mobile, deviceScaleFactor: spec.mobile ? 2 : 1 });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__EMBERWAKE__?.spriteCount() >= 7);
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.keyboard.down('d');
  await page.waitForTimeout(900);
  await page.keyboard.up('d');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, `emberwake-${spec.name}.png`), fullPage: false });
  await page.evaluate(() => window.__EMBERWAKE__.teleport(2050, 650));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, `emberwake-${spec.name}-frostwild.png`), fullPage: false });
  // Fresh protected runs keep the visual fixtures deterministic instead of letting
  // an aggroed frostwild creature follow the camera back into later compositions.
  await page.reload();
  await page.waitForFunction(() => window.__EMBERWAKE__?.spriteCount() >= 7);
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.setCargo(4, 0);
    window.__EMBERWAKE__.setMeals(3, 0);
    window.__EMBERWAKE__.setWood(5);
    window.__EMBERWAKE__.teleport(1120, 980);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, `emberwake-${spec.name}-cargo.png`), fullPage: false });
  await page.reload();
  await page.waitForFunction(() => window.__EMBERWAKE__?.spriteCount() >= 7);
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  await page.evaluate(() => {
    window.__EMBERWAKE__.setCargo(6, 0);
    window.__EMBERWAKE__.teleport(1200, 430);
  });
  await page.waitForFunction(() => window.__EMBERWAKE__.getState().station.meals >= 3, undefined, { timeout: 12_000 });
  // Frame the output without entering its pickup radius, preserving the pile.
  await page.evaluate(() => window.__EMBERWAKE__.teleport(1480, 790));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output, `emberwake-${spec.name}-cookout.png`), fullPage: false });
  await context.close();
}
await browser.close();
console.log(output);
