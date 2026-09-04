// Dev helper: capture gameplay screenshots at the target device sizes.
//   node scripts/screenshot.mjs [baseUrl] [outDir]
// Requires a dev server already running at baseUrl.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const outDir = process.argv[3] ?? 'screenshots';

const sizes = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone-portrait', width: 440, height: 956 },
  { name: 'phone-landscape', width: 956, height: 440 }
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

for (const size of sizes) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('pageerror', error => problems.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ENTER THE FROSTWILD' }).click();
  // let the ticker settle so the world is fully drawn
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/${size.name}.png` });

  // a second shot further into the world, to check the hunting grounds
  await page.evaluate(() => window.__EMBERWAKE__?.teleport(1500, 800));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/${size.name}-trail.png` });

  console.log(`${size.name}: captured${problems.length ? ` — console errors: ${problems.join(' | ')}` : ''}`);
  await page.close();
}

await browser.close();
