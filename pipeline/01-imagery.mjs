// Step 01: base globe textures from NASA Blue Marble Next Generation and Black Marble (public domain).
// Usage: node pipeline/01-imagery.mjs [base] [tiles]
//   base  -> site/tex/earth_{2k,4k,8k}.jpg, night_{2k,4k}.jpg
//   tiles -> site/tiles/{z}/{x}_{y}.jpg equirectangular pyramid from the 500 m mosaic (see 01b)
import path from 'node:path';
import sharp from 'sharp';
import { RAW, SITE, ensureDir, exists } from './lib/util.mjs';

sharp.cache(false);
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['base']);
const TEX = ensureDir(path.join(SITE, 'tex'));

async function resize(src, dest, width, quality = 84) {
  if (exists(dest) && !process.env.FORCE) return;
  await sharp(src, { limitInputPixels: false })
    .resize(width, width / 2, { kernel: 'lanczos3', fit: 'fill' })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toFile(dest);
  console.log('wrote', path.relative(SITE, dest));
}

if (want.has('base')) {
  const day = path.join(RAW, 'imagery', 'bluemarble_21600.jpg');
  await resize(day, path.join(TEX, 'earth_2k.jpg'), 2048, 82);
  await resize(day, path.join(TEX, 'earth_4k.jpg'), 4096, 84);
  await resize(day, path.join(TEX, 'earth_8k.jpg'), 8192, 82);
  const night = path.join(RAW, 'imagery', 'blackmarble_3km.jpg');
  await resize(night, path.join(TEX, 'night_2k.jpg'), 2048, 80);
  await resize(night, path.join(TEX, 'night_4k.jpg'), 4096, 80);
}
console.log('imagery done');
