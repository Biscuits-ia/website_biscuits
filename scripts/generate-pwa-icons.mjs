// scripts/generate-pwa-icons.mjs
//
// Genere les icones PWA 192x192 et 512x512 a partir du logo source
// (src/assets/logo.webp, 1200x800 -- pas carre). Le manifest W3C exige des
// icones carrees pour que Chrome propose l'installation ("Add to Home
// Screen") de facon fiable ; avant ce script, site.webmanifest ne declarait
// qu'une seule icone 180x180 (apple-touch-icon), insuffisante.
//
// Recadrage centre en carre (dimension = min(largeur, hauteur)) puis resize.
// A relancer si le logo change :
//
//     node scripts/generate-pwa-icons.mjs

import sharp from 'sharp';
import path from 'node:path';

const SOURCE = path.resolve('src/assets/logo.webp');
const OUT_DIR = path.resolve('public');
const SIZES = [192, 512];

async function main() {
  const meta = await sharp(SOURCE).metadata();
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - side) / 2);
  const top = Math.floor((meta.height - side) / 2);

  for (const size of SIZES) {
    const outPath = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(SOURCE)
      .extract({ left, top, width: side, height: side })
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`OK ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
