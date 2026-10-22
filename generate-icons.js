/* eslint-disable */
/**
 * Génère les icônes PWA / favicon de GradeUp à partir de public/logo-mark.svg
 * (dégradé de marque + graduation cap) afin d'avoir une identité visuelle
 * cohérente partout : navigateur, install PWA, manifeste.
 *
 * Usage : node generate-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join('public', 'logo-mark.svg');
const OUT = (name) => path.join('public', name);

// Variante "maskable" : plein cadre (pas d'angle arrondi) + marge de sécurité,
// pour que le crop circulaire Android/iOS ne coupe pas le glyph.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="#1D4ED8"/>
  <g transform="translate(14 14) scale(1.5)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
    <path d="M22 10v6"/>
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
  </g>
</svg>`;

async function render(svg, size, file) {
  await sharp(Buffer.from(svg), { density: Math.max(72, (size / 64) * 72) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(OUT(file));
}

async function generate() {
  if (!fs.existsSync(SRC)) {
    console.error('Source introuvable :', SRC);
    process.exit(1);
  }
  const svg = fs.readFileSync(SRC, 'utf8');

  await render(svg, 192, 'icon-192x192.png');
  await render(svg, 512, 'icon-512x512.png');
  await render(maskableSvg, 512, 'icon-maskable-512.png');
  await render(svg, 64, 'favicon.png');
  await render(svg, 32, 'favicon-32.png');

  console.log('Icônes générées : icon-192, icon-512, icon-maskable-512, favicon, favicon-32');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
