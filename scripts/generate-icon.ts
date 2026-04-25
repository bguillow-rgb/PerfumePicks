/**
 * Generate the Perfume Picks app icon set.
 *
 * Design:
 *   - Soft ivory background with a subtle radial warmth
 *   - Centered cursive "P" in champagne gold (Pinyon Script)
 *   - Two thin gold ornamental rings framing the wordmark
 *   - Tiny "PERFUME PICKS" letterspaced editorial label below the P
 *   - No transparency (App Store rejects transparent icons)
 *
 * Outputs:
 *   - assets/images/icon.png            1024×1024 (iOS App Store + iPhone home)
 *   - assets/images/adaptive-icon.png   1024×1024 (Android adaptive foreground)
 *   - assets/images/favicon.png          196×196  (web favicon)
 *   - assets/images/splash-icon.png     1024×1024 (legacy native splash, kept for parity)
 *
 * Usage:
 *   npx tsx scripts/generate-icon.ts
 *
 * Re-run any time the brand mark changes — output PNGs are deterministic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'images');
const FONT_PATH = path.join(
  ROOT,
  'node_modules/@expo-google-fonts/pinyon-script/400Regular/PinyonScript_400Regular.ttf',
);

if (!fs.existsSync(FONT_PATH)) {
  console.error(`Font not found: ${FONT_PATH}`);
  process.exit(1);
}

// Brand palette — matches src/constants/theme.ts COLORS
const PALETTE = {
  bg: '#FAF6F0',        // ivory
  bgWarm: '#FFFCF8',    // warmer center for radial
  bgEdge: '#F1E7D4',    // subtle edge tone
  accent: '#B8924B',    // champagne gold
  accentSoft: '#D4B179',
  accentDeep: '#8E6E36',
  blushSoft: '#F0D7D2',
  taupe: '#7A6A5C',
};

function buildSvg(size: number): string {
  // All design coordinates are in a 1024-unit canvas. We scale at render time.
  const c = 1024;
  const cx = c / 2;
  const cy = c / 2;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${c} ${c}">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="${PALETTE.bgWarm}"/>
      <stop offset="60%" stop-color="${PALETTE.bg}"/>
      <stop offset="100%" stop-color="${PALETTE.bgEdge}"/>
    </radialGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${PALETTE.accentSoft}"/>
      <stop offset="100%" stop-color="${PALETTE.accentDeep}"/>
    </linearGradient>
  </defs>

  <!-- Ivory background — solid first, then radial overlay so the corners
       stay opaque (Apple rejects transparent icons). -->
  <rect width="${c}" height="${c}" fill="${PALETTE.bg}"/>
  <rect width="${c}" height="${c}" fill="url(#bgGrad)"/>

  <!-- Soft blush halo behind the monogram for warmth -->
  <ellipse cx="${cx}" cy="${cy - 30}" rx="320" ry="280" fill="${PALETTE.blushSoft}" opacity="0.55"/>

  <!-- Outer ornamental ring — generous, low-opacity champagne -->
  <circle cx="${cx}" cy="${cy}" r="430" fill="none" stroke="url(#goldGrad)" stroke-width="3" opacity="0.55"/>
  <!-- Inner ring — thinner, tighter -->
  <circle cx="${cx}" cy="${cy}" r="395" fill="none" stroke="${PALETTE.accent}" stroke-width="1" opacity="0.4"/>

  <!-- Cursive "P" — Pinyon Script, deep champagne, generously sized.
       Pinyon descenders sit low so we anchor the baseline ~80% down the
       canvas so the loop of the P sits visually centered in the medallion.
       No wordmark text — luxury fragrance houses (Chanel, MFK, Tom Ford)
       use bare monograms; text at icon size is unreadable anyway. -->
  <text
    x="${cx}"
    y="${cy + 230}"
    font-family="Pinyon Script"
    font-size="780"
    fill="url(#goldGrad)"
    text-anchor="middle"
  >P</text>

  <!-- Three ornamental flourishes on the ring — small champagne dots at
       the top, like a vintage seal. Adds craft without adding noise. -->
  <circle cx="${cx}"      cy="${cy - 430}" r="6" fill="${PALETTE.accent}"/>
  <circle cx="${cx - 18}" cy="${cy - 425}" r="3" fill="${PALETTE.accent}" opacity="0.7"/>
  <circle cx="${cx + 18}" cy="${cy - 425}" r="3" fill="${PALETTE.accent}" opacity="0.7"/>
</svg>
`;
}

function render(svg: string, outPath: string, size: number) {
  const resvg = new Resvg(svg, {
    background: PALETTE.bg,
    fitTo: { mode: 'width', value: size },
    font: {
      fontFiles: [FONT_PATH],
      loadSystemFonts: true,        // for the serif fallback in the wordmark
      defaultFontFamily: 'Pinyon Script',
    },
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
  console.log(`wrote ${path.relative(ROOT, outPath)} (${size}×${size})`);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const svg1024 = buildSvg(1024);
  render(svg1024, path.join(OUT_DIR, 'icon.png'), 1024);
  render(svg1024, path.join(OUT_DIR, 'adaptive-icon.png'), 1024);
  render(svg1024, path.join(OUT_DIR, 'splash-icon.png'), 1024);

  const svg196 = buildSvg(196);
  render(svg196, path.join(OUT_DIR, 'favicon.png'), 196);

  console.log('\nIcon set generated. Re-run after design changes.');
}

main();
