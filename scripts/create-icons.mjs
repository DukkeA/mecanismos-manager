import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Use the approved monogram, never a separately drawn approximation.
const source = 'public/brand/monogram.png';
await mkdir('public/icons', { recursive: true });
async function icon(size, name, opaque = false, scale = 0.88) {
  const mark = await sharp(source).resize(Math.round(size * scale), Math.round(size * scale), { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: opaque ? '#eaf1f5' : '#00000000' } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toFile(`public/icons/${name}.png`);
}
for (const size of [192, 512]) await icon(size, `icon-${size}`);
await icon(48, 'favicon');
await icon(180, 'apple-touch-icon', true, 0.72);
// Entire mark fits inside the central safe circle for Android launchers.
await icon(512, 'maskable-512', true, 0.68);
