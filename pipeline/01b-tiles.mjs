// Step 01b: high-resolution imagery tiles from the NASA Blue Marble Next Generation 500 m mosaic
// (July 2004, with topography and bathymetry; public domain).
// Equirectangular pyramid: level z has 2^(z+1) columns and 2^z rows of 512 px tiles.
// Levels 4 to 6 are written (level 6 is about 600 m per pixel). Deep-ocean tiles at levels 5 and 6
// are skipped; the index says which tiles exist so the app never asks for a missing one.
// Usage: node pipeline/01b-tiles.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RAW, SITE, DATA, ensureDir, writeJSON, pool } from './lib/util.mjs';

sharp.cache(false);
sharp.concurrency(4);
const SRC = path.join(RAW, 'imagery', 'bmng500');
const OUT = path.join(SITE, 'tiles');
const TILE = 512;
const LEVELS = [4, 5, 6];

// 0.25 degree elevation grid from step 01c, used to find tiles that are nothing but deep water
const elev = new Int16Array(fs.readFileSync(path.join(DATA, 'earth', 'elev_quarter.bin')).buffer);
function hasLandOrShelf(lon0, lat1, spanLon, spanLat) {
  const x0 = Math.max(0, Math.floor((lon0 + 180) * 4) - 1);
  const x1 = Math.min(1439, Math.ceil((lon0 + spanLon + 180) * 4));
  const y0 = Math.max(0, Math.floor((90 - lat1) * 4) - 1);
  const y1 = Math.min(719, Math.ceil((90 - (lat1 - spanLat)) * 4));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (elev[y * 1440 + x] > -150) return true;
  return false;
}

const have = Object.fromEntries(LEVELS.map((z) => [z, new Uint8Array(Math.ceil((2 ** (z + 1) * 2 ** z) / 8))]));
let written = 0;
let skipped = 0;
let bytes = 0;

for (const [ci, colName] of ['A', 'B', 'C', 'D'].entries()) {
  for (const [ri, rowName] of ['1', '2'].entries()) {
    const file = path.join(SRC, `world.topo.bathy.200407.3x21600x21600.${colName}${rowName}.jpg`);
    for (const z of LEVELS) {
      const n = 2 ** (z - 1); // tiles per 90 degrees
      const size = n * TILE;
      const { data } = await sharp(file, { limitInputPixels: false }).resize(size, size, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const jobs = [];
      for (let ty = 0; ty < n; ty++) {
        for (let tx = 0; tx < n; tx++) {
          const gx = ci * n + tx;
          const gy = ri * n + ty;
          const span = 90 / n;
          const lon0 = -180 + gx * span;
          const lat1 = 90 - gy * span;
          if (z > 4 && !hasLandOrShelf(lon0, lat1, span, span)) {
            skipped++;
            continue;
          }
          jobs.push({ tx, ty, gx, gy });
        }
      }
      await pool(jobs, 6, async ({ tx, ty, gx, gy }) => {
        const dir = ensureDir(path.join(OUT, String(z), String(gx)));
        const out = path.join(dir, `${gy}.webp`);
        const bit = gy * 2 ** (z + 1) + gx;
        have[z][bit >> 3] |= 1 << (bit & 7);
        written++;
        if (fs.existsSync(out) && fs.statSync(out).size > 0) {
          bytes += fs.statSync(out).size;
          return;
        }
        const info = await sharp(data, { raw: { width: size, height: size, channels: 3 }, limitInputPixels: false })
          .extract({ left: tx * TILE, top: ty * TILE, width: TILE, height: TILE })
          .webp({ quality: 78, effort: 4 })
          .toFile(out);
        bytes += info.size;
      });
      console.log(`${colName}${rowName} z${z}: ${jobs.length} tiles (${written} total, ${(bytes / 1e6).toFixed(0)} MB)`);
    }
  }
}

writeJSON(path.join(OUT, 'index.json'), {
  tile: TILE,
  format: 'webp',
  scheme: 'equirectangular: level z has 2^(z+1) columns from 180W and 2^z rows from 90N',
  levels: Object.fromEntries(LEVELS.map((z) => [z, { cols: 2 ** (z + 1), rows: 2 ** z, have: Buffer.from(have[z]).toString('base64') }])),
  source: 'NASA Blue Marble Next Generation, July 2004, with topography and bathymetry (NASA Earth Observatory; public domain)',
});
console.log(`done: ${written} tiles, ${skipped} deep-ocean tiles skipped, ${(bytes / 1e6).toFixed(0)} MB`);
