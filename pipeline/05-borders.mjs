// Step 05: territories through time.
//   before 1886: aourednik/historical-basemaps (GPL-3.0), 53 world snapshots from 123,000 BCE to 2010
//   1886 to 2019: CShapes 2.0 (Schvitz et al. 2022, CC BY-NC-SA 4.0), exact start and end dates
// Both are kept in their own directories (site/data/borders/hb and /cshapes) so the differently
// licensed data stay separable.
//
// Each output file: uint32 header length, header JSON, then binary sections
//   mesh position int16 xyz, mesh colour uint8 rgba, mesh polity uint16, mesh index uint32, ring points int16 lon/lat x100
import fs from 'node:fs';
import path from 'node:path';
import { RAW, dataPath, writeFileAtomic, writeJSON, round } from './lib/util.mjs';
import { meshPolygon } from '../src/shared/spheremesh.js';

const HB = path.join(RAW, 'borders', 'hb', 'historical-basemaps-master', 'geojson');

// Muted atlas colours that sit on satellite imagery without shouting. A polity keeps its colour across snapshots.
const PALETTE = [
  [214, 118, 96], [226, 170, 92], [222, 203, 112], [158, 190, 108], [104, 176, 142], [96, 170, 190],
  [110, 142, 208], [152, 126, 204], [198, 122, 184], [220, 130, 140], [184, 150, 110], [140, 160, 120],
  [118, 186, 170], [128, 160, 220], [176, 140, 220], [226, 150, 120], [200, 190, 130], [150, 200, 150],
  [120, 190, 205], [165, 150, 190], [210, 160, 170], [190, 175, 120], [130, 175, 160], [205, 140, 105],
];
function hashName(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const colorOf = (name) => PALETTE[hashName(name) % PALETTE.length];

function simplify(ring, tol) {
  if (ring.length < 6 || tol <= 0) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((ring[i][0] - ax) * dx + (ring[i][1] - ay) * dy) / len2));
      const d = Math.hypot(ring[i][0] - (ax + t * dx), ring[i][1] - (ay + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

function ringArea(r) {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(s / 2);
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(x, y, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-12)));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/** A label point well inside the largest ring: the interior grid point farthest from the edge. */
function labelPoint(ring) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  let best = [(x0 + x1) / 2, (y0 + y1) / 2];
  let bestD = -1;
  const N = 14;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = x0 + ((i + 0.5) / N) * (x1 - x0);
      const y = y0 + ((j + 0.5) / N) * (y1 - y0);
      if (!inRing(x, y, ring)) continue;
      const d = distToRing(x, y, ring);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  return best;
}

/** Build one binary territory file from a list of { name, subj, partOf, prec, start, end, polys }. */
function buildFile(records, meta, outFile, { tol, edgeDeg }) {
  const pos = [];
  const col = [];
  const pol = [];
  const idx = [];
  const ringPts = [];
  const polities = [];
  for (const rec of records) {
    const color = colorOf(rec.subj || rec.name || 'unnamed');
    const p = {
      name: rec.name,
      subj: rec.subj && rec.subj !== rec.name ? rec.subj : undefined,
      partOf: rec.partOf && rec.partOf !== rec.name ? rec.partOf : undefined,
      prec: rec.prec,
      start: rec.start,
      end: rec.end,
      cap: rec.cap,
      color,
      rings: [],
      area: 0,
    };
    let bigRing = null;
    let bigArea = 0;
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const poly of rec.polys) {
      const rings = poly.map((r) => simplify(r, tol)).filter((r) => r.length >= 4);
      if (!rings.length) continue;
      const a = ringArea(rings[0]);
      if (a < 0.004) continue; // specks
      p.area += a;
      if (a > bigArea) {
        bigArea = a;
        bigRing = rings[0];
      }
      for (const [x, y] of rings[0]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      // rings for outlines and point lookups (exterior first, then holes)
      rings.forEach((r, k) => {
        p.rings.push([ringPts.length / 2, r.length, k === 0 ? 0 : 1]);
        for (const [x, y] of r) ringPts.push(Math.round(x * 100), Math.round(y * 100));
      });
      if (!rec.name) continue; // unnamed regions are kept for lookups but not painted
      const m = meshPolygon(rings, edgeDeg);
      if (!m) continue;
      const base = pos.length / 3;
      for (const v of m.positions) pos.push(Math.round(v * 32767));
      const n = m.positions.length / 3;
      for (let i = 0; i < n; i++) {
        col.push(color[0], color[1], color[2], rec.prec === 1 ? 150 : 255);
        pol.push(polities.length);
      }
      for (const i of m.indices) idx.push(base + i);
    }
    if (!p.rings.length) continue;
    p.area = round(p.area, 2);
    p.bbox = [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)];
    p.label = labelPoint(bigRing).map((v) => round(v, 2));
    polities.push(p);
  }
  const sections = {};
  const chunks = [];
  let offset = 0;
  const push = (name, typed) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    sections[name] = [offset, typed.length];
    chunks.push(buf);
    if (pad) chunks.push(Buffer.alloc(pad));
    offset += buf.length + pad;
  };
  push('position', new Int16Array(pos));
  push('color', new Uint8Array(col));
  push('polity', new Uint16Array(pol));
  push('index', new Uint32Array(idx));
  push('rings', new Int16Array(ringPts));
  const header = Buffer.from(JSON.stringify({ ...meta, polities, sections }));
  const hpad = (4 - (header.length % 4)) % 4;
  const len = Buffer.alloc(4);
  len.writeUInt32LE(header.length + hpad);
  const out = Buffer.concat([len, header, Buffer.alloc(hpad, 0x20), ...chunks]);
  writeFileAtomic(outFile, out);
  return { bytes: out.length, polities: polities.length, named: polities.filter((p) => p.name).length, verts: pos.length / 3 };
}

const polysOf = (geom) => (!geom ? [] : geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []);

// ---- historical-basemaps snapshots --------------------------------------------------------------------
const index = [];
for (const f of fs.readdirSync(HB).filter((n) => /^world_(bc)?\d+\.geojson$/.test(n))) {
  const m = f.match(/^world_(bc)?(\d+)\.geojson$/);
  const year = m[1] ? -Number(m[2]) : Number(m[2]);
  const gj = JSON.parse(fs.readFileSync(path.join(HB, f), 'utf8'));
  const records = gj.features
    .filter((ft) => ft.geometry)
    .map((ft) => ({
      name: ft.properties.NAME || null,
      subj: ft.properties.SUBJECTO || null,
      partOf: ft.properties.PARTOF || null,
      prec: ft.properties.BORDERPRECISION || 1,
      polys: polysOf(ft.geometry),
    }));
  // Larger territories first so small ones draw on top.
  records.sort((a, b) => ringArea((b.polys[0] || [[]])[0] || []) - ringArea((a.polys[0] || [[]])[0] || []));
  const key = year < 0 ? `bc${-year}` : String(year);
  const stats = buildFile(records, { year, dataset: 'historical-basemaps', approximate: true }, dataPath('borders', 'hb', `${key}.bin`), { tol: 0.02, edgeDeg: 5 });
  index.push({ year, file: `hb/${key}.bin`, ...stats });
}
index.sort((a, b) => a.year - b.year);
console.log(`historical-basemaps: ${index.length} snapshots, ${(index.reduce((s, i) => s + i.bytes, 0) / 1e6).toFixed(1)} MB`);

// ---- CShapes 2.0 -----------------------------------------------------------------------------------------
const cs = JSON.parse(fs.readFileSync(path.join(RAW, 'borders', 'CShapes-2.0.geojson'), 'utf8'));
const dec = (y, mo, d) => round(y + ((mo - 1) * 30.4375 + (d - 1)) / 365.25, 3);
const csRecords = cs.features.map((ft) => {
  const p = ft.properties;
  return {
    name: p.cntry_name,
    subj: p.cntry_name,
    prec: 3,
    start: dec(p.gwsyear, p.gwsmonth, p.gwsday),
    end: p.gweyear >= 2019 ? 9999 : dec(p.gweyear, p.gwemonth, p.gweday),
    cap: p.capname ? [p.capname, round(p.caplong, 2), round(p.caplat, 2)] : undefined,
    polys: polysOf(ft.geometry),
  };
});
csRecords.sort((a, b) => ringArea((b.polys[0] || [[]])[0] || []) - ringArea((a.polys[0] || [[]])[0] || []));
// One file per period keeps each download small; a state-period that spans two periods is written to both.
const PERIODS = [[1886, 1914], [1914, 1946], [1946, 1975], [1975, 1992], [1992, 9999]];
const csFiles = [];
for (const [from, to] of PERIODS) {
  const recs = csRecords.filter((r) => r.start < to && r.end > from);
  const file = `cshapes/${from}.bin`;
  const st = buildFile(recs, { dataset: 'cshapes', from, to, approximate: false }, dataPath('borders', 'cshapes', `${from}.bin`), { tol: 0.03, edgeDeg: 5 });
  csFiles.push({ from, to, file });
  console.log(`cshapes ${from}-${to === 9999 ? 'today' : to}: ${st.polities} state-periods, ${(st.bytes / 1e6).toFixed(1)} MB`);
}

writeJSON(dataPath('borders', 'index.json'), {
  snapshots: index.map(({ year, file, named }) => ({ year, file, named })),
  cshapes: { from: 1886, to: 2019, periods: csFiles },
  sources: {
    hb: { title: 'Historical boundaries of world countries and cultural regions', author: 'André Ourednik and contributors', url: 'https://github.com/aourednik/historical-basemaps', license: 'GPL-3.0', note: 'World snapshots; borders before the modern era are approximate.' },
    cshapes: { title: 'CShapes 2.0', author: 'Schvitz, Girardin, Rüegger, Weidmann, Cederman and Gleditsch (2022)', url: 'https://icr.ethz.ch/data/cshapes/', license: 'CC BY-NC-SA 4.0', note: 'Borders and capitals of independent states and dependencies, 1886 to 2019.' },
  },
});
for (const i of index.filter((_, k) => k % 9 === 0)) console.log(`  ${i.year}: ${i.named}/${i.polities} named, ${(i.bytes / 1024).toFixed(0)} KB`);
