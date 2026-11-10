// Step 05b: "What stood right here?" needs to know, for any spot, which territory covered it at
// every snapshot in time. Loading every border file for that would be far too heavy, so this step
// samples all of them onto a half-degree grid and stores the grids run-length encoded in one file.
// Output: site/data/borders/through-time.bin
import fs from 'node:fs';
import path from 'node:path';
import { RAW, dataPath, writeFileAtomic } from './lib/util.mjs';

const RES = 0.5;
const NX = 360 / RES;
const NY = 180 / RES;
const HB = path.join(RAW, 'borders', 'hb', 'historical-basemaps-master', 'geojson');
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

function ringArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(s / 2);
}

/** Even-odd scanline fill of a polygon (with holes) into the grid. */
function fill(grid, rings, value) {
  let y0 = 90, y1 = -90;
  for (const [, y] of rings[0]) {
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const j0 = Math.max(0, Math.floor((90 - y1) / RES));
  const j1 = Math.min(NY - 1, Math.floor((90 - y0) / RES));
  for (let j = j0; j <= j1; j++) {
    const lat = 90 - (j + 0.5) * RES;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
        const [xi, yi] = ring[i];
        const [xk, yk] = ring[k];
        if (yi > lat !== yk > lat) xs.push(((xk - xi) * (lat - yi)) / (yk - yi) + xi);
      }
    }
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const i0 = Math.max(0, Math.ceil((xs[n] + 180) / RES - 0.5));
      const i1 = Math.min(NX - 1, Math.floor((xs[n + 1] + 180) / RES - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * NX + i] = value;
    }
  }
}

function encode(features) {
  // features: [{ name, polys }]; larger first so smaller territories sit on top
  const names = [];
  const index = new Map();
  const grid = new Uint16Array(NX * NY);
  const flat = [];
  for (const f of features) for (const p of f.polys) if (p[0] && p[0].length > 3) flat.push({ name: f.name, rings: p, area: ringArea(p[0]) });
  flat.sort((a, b) => b.area - a.area);
  for (const f of flat) {
    if (!f.name) continue;
    if (!index.has(f.name)) {
      index.set(f.name, names.length + 1);
      names.push(f.name);
    }
    fill(grid, f.rings, index.get(f.name));
  }
  const runs = [];
  for (let j = 0; j < NY; j++) {
    let i = 0;
    while (i < NX) {
      const v = grid[j * NX + i];
      let n = 1;
      while (i + n < NX && grid[j * NX + i + n] === v) n++;
      runs.push(v, n);
      i += n;
    }
  }
  return { names, runs: new Uint16Array(runs) };
}

const snaps = [];
for (const f of fs.readdirSync(HB).filter((n) => /^world_(bc)?\d+\.geojson$/.test(n))) {
  const m = f.match(/^world_(bc)?(\d+)\.geojson$/);
  const year = m[1] ? -Number(m[2]) : Number(m[2]);
  if (year >= 1886) continue; // CShapes takes over
  const gj = JSON.parse(fs.readFileSync(path.join(HB, f), 'utf8'));
  snaps.push({ year, source: 'hb', ...encode(gj.features.map((ft) => ({ name: ft.properties.NAME, polys: polysOf(ft.geometry) }))) });
}
const cs = JSON.parse(fs.readFileSync(path.join(RAW, 'borders', 'CShapes-2.0.geojson'), 'utf8'));
for (const year of [1886, 1900, 1914, 1920, 1925, 1930, 1938, 1942, 1946, 1950, 1960, 1970, 1980, 1990, 1992, 2000, 2010, 2019]) {
  const at = year + 0.5;
  const feats = cs.features.filter((ft) => {
    const p = ft.properties;
    const s = p.gwsyear + (p.gwsmonth - 1) / 12;
    const e = p.gweyear + (p.gwemonth - 1) / 12;
    return s <= at && e >= at;
  });
  snaps.push({ year, source: 'cshapes', ...encode(feats.map((ft) => ({ name: ft.properties.cntry_name, polys: polysOf(ft.geometry) }))) });
}
snaps.sort((a, b) => a.year - b.year);

let offset = 0;
const header = { res: RES, nx: NX, ny: NY, snaps: [] };
const chunks = [];
for (const s of snaps) {
  header.snaps.push({ year: s.year, source: s.source, names: s.names, offset, length: s.runs.length });
  chunks.push(Buffer.from(s.runs.buffer));
  offset += s.runs.length;
}
const head = Buffer.from(JSON.stringify(header));
const pad = (4 - (head.length % 4)) % 4;
const len = Buffer.alloc(4);
len.writeUInt32LE(head.length + pad);
const out = Buffer.concat([len, head, Buffer.alloc(pad, 0x20), ...chunks]);
writeFileAtomic(dataPath('borders', 'through-time.bin'), out);
console.log(`through-time: ${snaps.length} snapshots, ${(out.length / 1e6).toFixed(2)} MB`);
