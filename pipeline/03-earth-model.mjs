// Step 03: the Earth model the renderer runs on.
// Turns retrieved datasets into small tables: sea level, deep-time temperature by latitude, glaciations.
// Output: site/data/earth/model.json and site/data/earth/zonal_temp.png
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RAW, DATA, dataPath, writeJSON, exists, readJSON, round } from './lib/util.mjs';

// ---- sea level, 0 to 798 ka: Spratt & Lisiecki 2016 (NOAA WDC Paleoclimatology) ---------------
const spratt = fs
  .readFileSync(path.join(RAW, 'climate', 'spratt2016.txt'), 'utf8')
  .split('\n')
  .filter((l) => /^\d/.test(l))
  .map((l) => l.split('\t').map(Number));
const seaLevel = [];
for (const row of spratt) {
  const ka = row[0];
  // The short stack (0-430 ka) uses more records; the long stack carries on to 798 ka.
  let v = ka <= 430 && Number.isFinite(row[1]) ? row[1] : row[5];
  if (!Number.isFinite(v)) continue;
  // The stack is scaled to 0 m at 5 ka and cannot resolve the last few thousand years (its own
  // uncertainty there is about +/-5 m), so the late Holocene is held at today's level.
  if (ka <= 5) v = 0;
  seaLevel.push([ka, round(v, 1)]);
}

// ---- before 798 ka: scale the LR04 benthic d18O stack to sea level by regression on the overlap --
const lr04 = fs
  .readFileSync(path.join(RAW, 'climate', 'LR04stack.txt'), 'utf8')
  .split('\n')
  .filter((l) => /^\d/.test(l))
  .map((l) => l.split('\t').map(Number))
  .filter((r) => Number.isFinite(r[1]));
const d18 = new Map(lr04.map((r) => [r[0], r[1]]));
let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
for (const [ka, v] of seaLevel) {
  if (ka < 6 || !d18.has(ka)) continue;
  const x = d18.get(ka);
  sx += x; sy += v; sxx += x * x; sxy += x * v; n++;
}
const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
const intercept = (sy - slope * sx) / n;
const lastKa = seaLevel[seaLevel.length - 1][0];
for (const [ka, x] of lr04) {
  if (ka <= lastKa) continue;
  if (ka > 5300) break;
  // LR04 is sampled every 2 to 5 kyr this far back; keep every sample.
  seaLevel.push([ka, round(Math.max(-135, Math.min(25, intercept + slope * x)), 1)]);
}
console.log(`sea level: ${seaLevel.length} samples, regression ${slope.toFixed(1)} m per permil (n=${n})`);

// ---- deep-time temperature by latitude: Scotese 2022 (Zenodo 8238875), 100 Phanerozoic intervals --
const tdir = path.join(RAW, 'climate', 'scotese');
const ages = fs
  .readdirSync(tdir)
  .filter((f) => /^\d{3}_temp\.csv$/.test(f))
  .map((f) => Number(f.slice(0, 3)))
  .sort((a, b) => a - b);
const profiles = new Map(); // age -> Float32Array(181), index 0 = 90N
const warmth = [];
for (const age of ages) {
  const rows = fs.readFileSync(path.join(tdir, `${String(age).padStart(3, '0')}_temp.csv`), 'utf8').trim().split('\n');
  const prof = new Float32Array(181);
  let wsum = 0;
  let tsum = 0;
  rows.slice(0, 181).forEach((line, j) => {
    const vals = line.split(',').map(Number).slice(2).filter(Number.isFinite); // first two cells of the file hold the colour range
    vals.sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    prof[j] = mean;
    const w = Math.cos(((90 - j) * Math.PI) / 180);
    wsum += Math.max(0, w);
    tsum += mean * Math.max(0, w);
  });
  profiles.set(age, prof);
  warmth.push([age, round(tsum / wsum, 2)]);
}
// Regular grid for the shader: 0..540 Ma every 5 Myr (109 columns) x 91 latitudes (2 degrees), south at row 0.
const COLS = 109;
const ROWS = 91;
const px = Buffer.alloc(COLS * ROWS);
const profAt = (ma) => {
  let a = ages[0];
  let b = ages[ages.length - 1];
  for (let i = 0; i < ages.length - 1; i++) if (ma >= ages[i] && ma <= ages[i + 1]) { a = ages[i]; b = ages[i + 1]; break; }
  const f = b === a ? 0 : (ma - a) / (b - a);
  const pa = profiles.get(a);
  const pb = profiles.get(b);
  return (j) => pa[j] + (pb[j] - pa[j]) * f;
};
for (let c = 0; c < COLS; c++) {
  const get = profAt(Math.min(540, c * 5));
  for (let r = 0; r < ROWS; r++) {
    const lat = -90 + r * 2;
    const t = get(90 - lat);
    // image row 0 is the top of the texture; store north at the top so v = lat/180 + 0.5 after flipY
    px[(ROWS - 1 - r) * COLS + c] = Math.max(0, Math.min(255, Math.round(((t + 60) / 100) * 255)));
  }
}
await sharp(px, { raw: { width: COLS, height: ROWS, channels: 1 } }).png().toFile(dataPath('earth', 'zonal_temp.png'));
console.log(`zonal temperature: ${ages.length} intervals, GMST now ${warmth[0][1]} C, hottest ${Math.max(...warmth.map((w) => w[1]))} C`);

// ---- model ---------------------------------------------------------------------------------------
const model = {
  seaLevel,
  warmth,
  zonal: { file: 'zonal_temp.png', maxMa: 540, minC: -60, maxC: 40 },
  // Global glaciations. [startMa, endMa, strength]; strength < 1 marks events whose global reach is debated.
  snowball: [
    [2400, 2100, 0.55],
    [717, 660, 1],
    [639, 635, 1],
  ],
  // African Humid Period: [ka, greenness]. Began about 14,600-14,500 years ago, ended 6,000-5,000 years ago.
  sahara: [[4.8, 0], [5.6, 0.5], [6.5, 0.9], [8, 1], [11.5, 1], [13, 0.6], [14.6, 0], [15, 0]],
  sources: {
    seaLevel: 'Spratt & Lisiecki 2016, Climate of the Past 12 (NOAA WDC Paleoclimatology study 19982); before 798 ka scaled from the LR04 benthic stack (Lisiecki & Raymo 2005)',
    zonal: 'Scotese 2022, Global Mean Surface Temperatures for 100 Phanerozoic Time Intervals, Zenodo 8238875 (CC BY 4.0); Scotese et al. 2021, Earth-Science Reviews 215',
    snowball: 'Wikipedia: Sturtian glaciation (c. 717-660 Ma), Marinoan glaciation (639-635 Ma), Huronian glaciation (about 2.4-2.1 Ga)',
    sahara: 'Wikipedia: African humid period',
  },
};
const iceIndex = path.join(DATA, 'earth', 'ice', 'index.json');
if (exists(iceIndex)) {
  const ice = readJSON(iceIndex);
  model.ice = ice;
  model.sources.ice = ice.source;
}
writeJSON(dataPath('earth', 'model.json'), model);
console.log('model.json', (fs.statSync(dataPath('earth', 'model.json')).size / 1024).toFixed(0), 'KB');
