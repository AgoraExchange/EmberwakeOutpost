import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const iconDir = path.join(publicDir, 'icons');
const artDir = path.join(publicDir, 'art');
const sourceDir = path.join(root, 'assets', 'source');
await mkdir(iconDir, { recursive: true });
await mkdir(artDir, { recursive: true });

await sharp(path.join(sourceDir, 'emberwake-key-art.png'))
  .resize({ width: 1024, height: 1536, fit: 'cover' })
  .webp({ quality: 82, effort: 5 })
  .toFile(path.join(artDir, 'emberwake-key-art.webp'));

const iconSvg = (maskable) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#17485f"/><stop offset="1" stop-color="#071b2c"/></linearGradient><radialGradient id="fire"><stop stop-color="#ffe7a0"/><stop offset=".6" stop-color="#ff984e"/><stop offset="1" stop-color="#d95132"/></radialGradient></defs>
  <rect width="512" height="512" ${maskable ? '' : 'rx="112"'} fill="url(#bg)"/>
  <circle cx="256" cy="266" r="${maskable ? 178 : 165}" fill="#0b293a" stroke="#92e5ed" stroke-width="12" opacity=".97"/>
  <g fill="none" stroke="#d8fbff" stroke-width="18" stroke-linecap="round"><path d="M256 100v80M256 350v62M112 256h72M328 256h72"/><path d="m153 153 52 52M307 307l51 51M358 153l-51 52M205 307l-52 51"/></g>
  <path d="M257 361c-77 0-125-48-115-111 8-48 50-75 75-112 4 43 32 53 40 90 15-22 29-46 25-76 59 51 94 104 65 159-17 32-48 50-90 50Z" fill="url(#fire)" stroke="#fff0bd" stroke-width="10"/>
  <path d="M255 329c-31 0-50-20-46-45 3-20 20-31 30-46 2 18 13 22 16 37 7-8 12-18 10-30 25 21 39 43 27 66-7 12-19 18-37 18Z" fill="#fff3b1"/>
</svg>`);

await sharp(iconSvg(false)).png().resize(192, 192).toFile(path.join(iconDir, 'icon-192.png'));
await sharp(iconSvg(false)).png().resize(512, 512).toFile(path.join(iconDir, 'icon-512.png'));
await sharp(iconSvg(true)).png().resize(512, 512).toFile(path.join(iconDir, 'icon-maskable-512.png'));
await sharp(iconSvg(false)).png().resize(180, 180).toFile(path.join(publicDir, 'apple-touch-icon.png'));

// Keep the editable generations in assets/source while shipping only the pixels the
// game can display. Pixi scales sprites by width, so retaining each source aspect
// ratio avoids distorting silhouettes and cuts first-load/decode cost substantially.
const spriteWidths = {
  'actor/trailwarden': 256,
  'actor/villager': 256,
  'actor/worker': 256,
  'actor/guard': 256,
  'building/furnace': 512,
  'building/cookout': 640,
  'building/mess-hall': 640,
  'building/timber-post': 384,
  'creature/rimeback': 384,
  'creature/icehorn': 448,
  'prop/tree': 384
};

for (const [key, width] of Object.entries(spriteWidths)) {
  const source = path.join(sourceDir, 'sprites', `${key}.png`);
  const output = path.join(artDir, 'sprites', `${key}.png`);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(output);
}

console.log(`Generated Emberwake PWA art and ${Object.keys(spriteWidths).length} optimized gameplay sprites.`);
