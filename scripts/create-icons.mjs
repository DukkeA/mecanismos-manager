import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/icons',{recursive:true});
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#087484"/><path d="M128 352V160h48l80 100 80-100h48v192h-52V242l-76 90-76-90v110z" fill="white"/></svg>');
for (const size of [192,512]) await sharp(svg).resize(size,size).png().toFile(`public/icons/icon-${size}.png`);
await sharp(svg).png().toFile('public/icons/maskable-512.png');
