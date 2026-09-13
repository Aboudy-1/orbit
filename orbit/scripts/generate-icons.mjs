import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(__dirname, '..', 'public', 'orbit.svg'), 'utf-8');

// Base SVG with padding for round icon look
function paddedSvg(size) {
  const pad = size * 0.1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.25}" fill="#0a0a0b"/>
    <g transform="translate(${pad}, ${pad}) scale(${(size - pad * 2) / 32})">
      ${svg.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">', '').replace('</svg>', '')}
    </g>
  </svg>`;
}

mkdirSync(join(__dirname, '..', 'public', 'icons'), { recursive: true });

const sizes = [192, 512];
for (const size of sizes) {
  await sharp(Buffer.from(paddedSvg(size)))
    .png()
    .toFile(join(__dirname, '..', 'public', 'icons', `icon-${size}x${size}.png`));
  console.log(`Generated icon-${size}x${size}.png`);
}