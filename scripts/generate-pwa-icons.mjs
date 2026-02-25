/**
 * Generates PWA icons from public/favicon.svg using sharp.
 * Run once locally and commit the output — do not add to CI build.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../public/favicon.svg');
const outDir = join(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

// pink background color for the icon: #dd2284 = rgb(221, 34, 132)
const bg = { r: 221, g: 34, b: 132, alpha: 1 };

// 192×192 — standard Android home screen icon
await sharp({
  create: { width: 192, height: 192, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(140, 140, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-192.png'));

console.log('✅ pwa-192.png');

// 512×512 — standard high-res icon
await sharp({
  create: { width: 512, height: 512, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(370, 370, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-512.png'));

console.log('✅ pwa-512.png');

// 512×512 maskable — logo occupies 60% (safe zone), padded with solid background.
// Android adaptive icons crop to a circle/squircle — the safe zone keeps the logo visible.
const logoSize = Math.round(512 * 0.6); // 307px
await sharp({
  create: { width: 512, height: 512, channels: 4, background: bg },
})
  .composite([{
    input: await sharp(svgBuffer, { density: 300 })
      .resize(logoSize, logoSize, { fit: 'contain', background: { ...bg } })
      .png()
      .toBuffer(),
    gravity: 'center',
  }])
  .png()
  .toFile(join(outDir, 'pwa-512-maskable.png'));

console.log('✅ pwa-512-maskable.png');
console.log('🎉 All PWA icons generated in public/icons/');
