/**
 * Generate PNG icons from logo.svg + OG image
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const svgSource = readFileSync(join(publicDir, 'logo.svg'), 'utf8');

// ── 1. icon-192.png ──
await sharp(Buffer.from(svgSource))
  .resize(192, 192)
  .png()
  .toFile(join(publicDir, 'icon-192.png'));
console.log('✓ icon-192.png');

// ── 2. icon-512.png ──
await sharp(Buffer.from(svgSource))
  .resize(512, 512)
  .png()
  .toFile(join(publicDir, 'icon-512.png'));
console.log('✓ icon-512.png');

// ── 3. icon-512-maskable.png (with 60px safe zone padding) ──
const innerSize = 512 - 120; // 392px inner
const inner = await sharp(Buffer.from(svgSource))
  .resize(innerSize, innerSize)
  .png()
  .toBuffer();

await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: inner, left: 60, top: 60 }])
  .png()
  .toFile(join(publicDir, 'icon-512-maskable.png'));
console.log('✓ icon-512-maskable.png');

// ── 4. apple-touch-icon.png (180x180) ──
await sharp(Buffer.from(svgSource))
  .resize(180, 180)
  .png()
  .toFile(join(publicDir, 'apple-touch-icon.png'));
console.log('✓ apple-touch-icon.png');

// ── 5. OG image (1200x630) ──
const W = 1200, H = 630;
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a3a5c"/>
      <stop offset="100%" stop-color="#2C5F8A"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- subtle grid pattern -->
  <g opacity="0.06" stroke="#fff" stroke-width="1">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${H}"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${W}" y2="${i * 100}"/>`).join('')}
  </g>
  <!-- calculator icon (simplified) -->
  <g transform="translate(160, 175) scale(0.55)" opacity="0.9">
    <rect x="128" y="64" width="256" height="384" rx="32" stroke="#fff" stroke-width="20" fill="none"/>
    <rect x="160" y="100" width="192" height="80" rx="12" fill="#fff" opacity="0.15"/>
    <text x="332" y="160" font-family="monospace" font-size="40" font-weight="bold" fill="#fff" text-anchor="end">$</text>
    <rect x="168" y="212" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="232" y="212" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="296" y="212" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="168" y="276" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="232" y="276" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="296" y="276" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="168" y="340" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="232" y="340" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="none"/>
    <rect x="296" y="340" width="48" height="48" rx="10" stroke="#fff" stroke-width="8" fill="#fff"/>
    <text x="320" y="372" font-family="sans-serif" font-size="24" font-weight="bold" fill="#1a3a5c" text-anchor="middle">=</text>
  </g>
  <!-- title -->
  <text x="520" y="250" font-family="Noto Sans TC, sans-serif" font-size="56" font-weight="900" fill="#fff">台股持有權重</text>
  <text x="520" y="320" font-family="Noto Sans TC, sans-serif" font-size="56" font-weight="900" fill="#fff">計算器</text>
  <!-- description -->
  <text x="520" y="380" font-family="Noto Sans TC, sans-serif" font-size="22" fill="#fff" opacity="0.75">即時股價 · 自訂權重 · 手續費試算</text>
  <!-- bottom accent line -->
  <rect x="520" y="410" width="120" height="4" rx="2" fill="#5BA0D9"/>
  <!-- URL -->
  <text x="520" y="460" font-family="monospace" font-size="16" fill="#fff" opacity="0.5">stockweightcalculation.vercel.app</text>
</svg>`;

await sharp(Buffer.from(ogSvg))
  .png()
  .toFile(join(publicDir, 'og-image.png'));
console.log('✓ og-image.png (1200x630)');

console.log('\nAll icons generated successfully!');
