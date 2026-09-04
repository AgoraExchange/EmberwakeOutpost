import { chromium, expect } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4177/EmberwakeOutpost/';
const browser = await chromium.launch();
const context = await browser.newContext({ serviceWorkers: 'allow' });
await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false }));
const page = await context.newPage();
const failures = [];
page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText ?? 'failed'}`));
page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
page.on('pageerror', error => failures.push(error.message));

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByLabel('Trailwarden name').waitFor({ state: 'visible', timeout: 20_000 });
await page.getByLabel('Trailwarden name').fill('Frost Fox');
await page.getByRole('button', { name: 'TAKE THE WATCH' }).click();
await expect(page.getByRole('button', { name: 'ENTER THE FROSTWILD' })).toBeVisible();
await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable.');
  await navigator.serviceWorker.ready;
});
await page.waitForTimeout(1200);

const onlineFailures = [...failures];
failures.length = 0;
await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).waitFor({ state: 'visible' });
await expect(page.locator('#trailwarden-greeting')).toContainText('FROST FOX');
await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
await page.locator('#canvas-host canvas').waitFor({ state: 'visible' });
if (onlineFailures.length || failures.length) throw new Error(JSON.stringify({ onlineFailures, offlineFailures: failures }, null, 2));

console.log(JSON.stringify({ baseUrl, serviceWorker: 'ready', offlineRelaunch: 'passed', brokenRequests: 0 }));
await browser.close();
