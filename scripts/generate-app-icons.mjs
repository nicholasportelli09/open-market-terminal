// Generates the installed-app icons from the candle logo (same design as src/app/icon.svg).
// Run: node scripts/generate-app-icons.mjs
// Uses sharp, which ships with Next.js (no extra dependency).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BG = "#0c0e12";
const ACCENT = "#f08c00";

// The candles, drawn in the logo's 64x64 coordinate space.
const CANDLES = `
  <path d="M20 14v36M32 20v30M44 12v32" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round"/>
  <rect x="15" y="24" width="10" height="16" rx="2" fill="${ACCENT}"/>
  <rect x="27" y="28" width="10" height="12" rx="2" fill="#fff"/>
  <rect x="39" y="18" width="10" height="16" rx="2" fill="${ACCENT}"/>`;

const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

/** macOS-style: rounded dark tile at 824/1024 of the canvas, transparent corners and padding. */
function anyIcon(size) {
  const tile = size * (824 / 1024);
  const offset = (size - tile) / 2;
  const scale = tile / 64;
  return svg(
    size,
    `<g transform="translate(${offset} ${offset}) scale(${scale})">
       <rect width="64" height="64" rx="14" fill="${BG}"/>${CANDLES}
     </g>`,
  );
}

/** Full-bleed dark square, candles centred and kept well inside the 80% safe-zone circle. */
function fullBleedIcon(size, contentScale) {
  const scale = (size / 64) * contentScale;
  // Candle artwork spans roughly x 13.5..50.5, y 10.5..51.5; centre it on the canvas.
  const cx = 32;
  const cy = 31;
  const tx = size / 2 - cx * scale;
  const ty = size / 2 - cy * scale;
  return svg(
    size,
    `<rect width="${size}" height="${size}" fill="${BG}"/>
     <g transform="translate(${tx} ${ty}) scale(${scale})">${CANDLES}</g>`,
  );
}

const OUTPUTS = [
  { file: "public/icons/icon-192.png", size: 192, make: anyIcon },
  { file: "public/icons/icon-512.png", size: 512, make: anyIcon },
  { file: "public/icons/icon-maskable-512.png", size: 512, make: (s) => fullBleedIcon(s, 0.78) },
  { file: "src/app/apple-icon.png", size: 180, make: (s) => fullBleedIcon(s, 0.95) },
];

for (const { file, size, make } of OUTPUTS) {
  const out = path.join(ROOT, file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(Buffer.from(make(size)), { density: 72 }).png().toFile(out);
  console.log(`wrote ${file} (${size}x${size})`);
}
