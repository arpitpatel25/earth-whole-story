// Step 04: modern geography from Natural Earth (public domain).
// Output under site/data/geo/: countries, disputed areas, India's states, cities, rivers, physical labels,
// railways, ports and airports.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as shapefile from 'shapefile';
import { RAW, dataPath, writeJSON, round, ensureDir } from './lib/util.mjs';

const NE = path.join(RAW, 'ne');

async function readShp(name) {
  const dir = path.join(NE, name);
  if (!fs.existsSync(dir)) {
    ensureDir(dir);
    execFileSync('unzip', ['-o', '-q', path.join(NE, `${name}.zip`), '-d', dir]);
  }
  const shp = fs.readdirSync(dir).find((f) => f.endsWith('.shp'));
  const fc = await shapefile.read(path.join(dir, shp), path.join(dir, shp.replace(/\.shp$/, '.dbf')), { encoding: 'utf-8' });
  // DBF text fields come back NUL-padded; strip the padding once, here, so no name downstream carries it
  for (const f of fc.features) for (const k in f.properties) if (typeof f.properties[k] === 'string') f.properties[k] = f.properties[k].replace(/\u0000/g, '').trim();
  return fc.features;
}

const q = (n, d = 2) => round(n, d);

/** Douglas-Peucker in degrees. Keeps rings closed and drops slivers. */
function simplify(ring, tol) {
  if (ring.length < 5 || tol <= 0) return ring;
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

/** GeoJSON geometry -> array of polygons, each an array of rings of [lon, lat], simplified and rounded. */
function polygons(geom, tol, minArea = 0, digits = 2) {
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const out = [];
  for (const poly of polys) {
    if (ringArea(poly[0]) < minArea) continue;
    const rings = [];
    for (let i = 0; i < poly.length; i++) {
      const r = simplify(poly[i], tol).map(([x, y]) => [q(x, digits), q(y, digits)]);
      if (r.length >= 4 && (i === 0 || ringArea(r) > minArea)) rings.push(r);
    }
    if (rings.length) out.push(rings);
  }
  return out;
}

function bbox(polys) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of polys) for (const [x, y] of p[0]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [q(x0), q(y0), q(x1), q(y1)];
}

// ---- countries ------------------------------------------------------------------------------------
const c50 = await readShp('ne_50m_admin_0_countries');
const countries = c50
  .map((f) => {
    const p = f.properties;
    const polys = polygons(f.geometry, 0.03, 0.002);
    if (!polys.length) return null;
    return {
      id: p.ADM0_A3,
      iso2: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2 !== '-99' ? p.ISO_A2 : null,
      wd: p.WIKIDATAID || null,
      name: p.NAME_EN || p.NAME,
      long: p.NAME_LONG,
      formal: p.FORMAL_EN || null,
      type: p.TYPE,
      sov: p.SOV_A3,
      continent: p.CONTINENT,
      region: p.SUBREGION,
      un: p.UN_A3 && p.UN_A3 !== '-099' ? 1 : 0,
      pop: p.POP_EST,
      label: [q(p.LABEL_X), q(p.LABEL_Y)],
      rank: p.LABELRANK,
      note: p.NOTE_BRK || null,
      bbox: bbox(polys),
      polys,
    };
  })
  .filter(Boolean);
writeJSON(dataPath('geo', 'countries.json'), { source: 'Natural Earth 1:50m Admin 0 Countries (public domain)', features: countries });

// Tiny countries missing from the 1:50m polygons still need a point so no state is left without a record.
const c10 = await readShp('ne_10m_admin_0_countries');
const have = new Set(countries.map((c) => c.id));
const points = c10
  .filter((f) => !have.has(f.properties.ADM0_A3))
  .map((f) => ({ id: f.properties.ADM0_A3, name: f.properties.NAME_EN || f.properties.NAME, wd: f.properties.WIKIDATAID, type: f.properties.TYPE, sov: f.properties.SOV_A3, label: [q(f.properties.LABEL_X), q(f.properties.LABEL_Y)] }));
const index = c10.map((f) => {
  const p = f.properties;
  return { id: p.ADM0_A3, name: p.NAME_EN || p.NAME, long: p.NAME_LONG, formal: p.FORMAL_EN || null, wd: p.WIKIDATAID || null, iso2: p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : null, type: p.TYPE, sov: p.SOV_A3, un: p.UN_A3 && p.UN_A3 !== '-099' ? 1 : 0, continent: p.CONTINENT, region: p.SUBREGION, pop: p.POP_EST, label: [q(p.LABEL_X), q(p.LABEL_Y)] };
});
writeJSON(dataPath('geo', 'country-index.json'), index);
console.log(`countries: ${countries.length} with polygons, ${points.length} more as points, ${index.length} in index`);

// ---- disputed areas: shown neutrally, with the dispute stated ---------------------------------------
const disputed = (await readShp('ne_10m_admin_0_disputed_areas')).map((f) => {
  const p = f.properties;
  const polys = polygons(f.geometry, 0.02, 0.0005);
  return polys.length ? { name: p.NAME_EN || p.NAME || p.BRK_NAME, note: p.NOTE_BRK || p.NOTE_ADM0 || null, admin: p.ADMIN, sov: p.SOVEREIGNT, type: p.TYPE, label: [q(p.LABEL_X ?? 0), q(p.LABEL_Y ?? 0)], bbox: bbox(polys), polys } : null;
}).filter(Boolean);
const disputedLines = (await readShp('ne_10m_admin_0_boundary_lines_disputed_areas')).flatMap((f) => {
  const g = f.geometry;
  if (!g) return [];
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  return lines.map((l) => ({ name: f.properties.NAME || f.properties.BRK_NAME || null, note: f.properties.NOTE || f.properties.COMMENT || null, line: simplify(l, 0.01).map(([x, y]) => [q(x), q(y)]) }));
});
writeJSON(dataPath('geo', 'disputed.json'), { source: 'Natural Earth 1:10m disputed areas and breakaway lines (public domain)', areas: disputed, lines: disputedLines });
console.log(`disputed: ${disputed.length} areas, ${disputedLines.length} lines`);

// ---- India and its neighbours: first-level divisions ------------------------------------------------
const adm1 = await readShp('ne_10m_admin_1_states_provinces');
const SOUTH_ASIA = new Set(['IND', 'PAK', 'BGD', 'NPL', 'BTN', 'LKA', 'AFG']);
const states = adm1
  .filter((f) => SOUTH_ASIA.has(f.properties.adm0_a3))
  .map((f) => {
    const p = f.properties;
    const polys = polygons(f.geometry, 0.01, 0.0002, 3);
    const cl = (v) => (v == null ? v : String(v).replace(/\u0000/g, '').trim() || null); // DBF fields are NUL-padded
    return polys.length ? { id: cl(p.iso_3166_2 || p.adm1_code), country: cl(p.adm0_a3), name: cl(p.name_en || p.name), type: cl(p.type_en), wd: cl(p.wikidataid), label: [q(p.longitude, 3), q(p.latitude, 3)], bbox: bbox(polys), polys } : null;
  })
  .filter(Boolean);
writeJSON(dataPath('geo', 'south-asia-states.json'), { source: 'Natural Earth 1:10m Admin 1 (public domain)', features: states });
console.log(`south asia admin-1: ${states.length} (${states.filter((s) => s.country === 'IND').length} in India)`);

// ---- cities -------------------------------------------------------------------------------------------
const places = (await readShp('ne_10m_populated_places')).map((f) => {
  const p = f.properties;
  return [p.NAME_EN || p.NAME, q(p.LONGITUDE, 3), q(p.LATITUDE, 3), p.POP_MAX || 0, p.SCALERANK, p.ADM0_A3, p.FEATURECLA && /capital/i.test(p.FEATURECLA) ? 1 : 0, p.WIKIDATAID || null, p.ADM1NAME || null];
});
places.sort((a, b) => a[4] - b[4] || b[3] - a[3]);
writeJSON(dataPath('geo', 'cities.json'), { source: 'Natural Earth 1:10m Populated Places (public domain)', fields: ['name', 'lon', 'lat', 'pop', 'rank', 'country', 'capital', 'wd', 'adm1'], rows: places });
console.log(`cities: ${places.length}`);

// ---- rivers and lakes ------------------------------------------------------------------------------------
const rivers = (await readShp('ne_50m_rivers'))
  .filter((f) => f.geometry)
  .flatMap((f) => {
    const g = f.geometry;
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    return lines.map((l) => ({ name: f.properties.name_en || f.properties.name || null, rank: f.properties.scalerank, line: simplify(l, 0.02).map(([x, y]) => [q(x), q(y)]) }));
  });
const lakes = (await readShp('ne_50m_lakes')).map((f) => ({ name: f.properties.name_en || f.properties.name || null, rank: f.properties.scalerank, polys: polygons(f.geometry, 0.02) })).filter((l) => l.polys.length);
writeJSON(dataPath('geo', 'rivers.json'), { source: 'Natural Earth 1:50m rivers and lakes (public domain)', rivers, lakes });
console.log(`rivers: ${rivers.length}, lakes: ${lakes.length}`);

// ---- names on the land and the sea -----------------------------------------------------------------------
function centroid(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best = polys[0];
  let bestA = 0;
  for (const p of polys) {
    const a = ringArea(p[0]);
    if (a > bestA) {
      bestA = a;
      best = p;
    }
  }
  let sx = 0, sy = 0;
  for (const [x, y] of best[0]) {
    sx += x;
    sy += y;
  }
  return [q(sx / best[0].length), q(sy / best[0].length), bestA];
}
const physical = [];
for (const [file, kind] of [['ne_10m_geography_regions_polys', 'land'], ['ne_10m_geography_marine_polys', 'sea']]) {
  for (const f of await readShp(file)) {
    if (!f.geometry) continue;
    const p = f.properties;
    const [x, y, area] = centroid(f.geometry);
    physical.push({ name: p.NAME_EN || p.NAME || p.name_en || p.name, kind, cls: p.FEATURECLA || p.featurecla, rank: p.SCALERANK ?? p.scalerank, lon: x, lat: y, area: q(area, 1) });
  }
}
writeJSON(dataPath('geo', 'physical-labels.json'), { source: 'Natural Earth 1:10m geography regions and marine areas (public domain)', rows: physical.filter((p) => p.name) });
console.log(`physical labels: ${physical.length}`);

// ---- railways, ports, airports for the modern lenses ------------------------------------------------------
const rail = (await readShp('ne_10m_railroads')).filter((f) => f.geometry).flatMap((f) => {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  return lines.map((l) => simplify(l, 0.03).map(([x, y]) => [q(x), q(y)])).filter((l) => l.length > 1);
});
writeJSON(dataPath('geo', 'railways.json'), { source: 'Natural Earth 1:10m railroads (public domain)', lines: rail });
const ports = (await readShp('ne_10m_ports')).map((f) => [f.properties.name, q(f.geometry.coordinates[0], 3), q(f.geometry.coordinates[1], 3), f.properties.scalerank]);
const airports = (await readShp('ne_10m_airports')).map((f) => [f.properties.name_en || f.properties.name, q(f.geometry.coordinates[0], 3), q(f.geometry.coordinates[1], 3), f.properties.scalerank, f.properties.iata_code]);
writeJSON(dataPath('geo', 'ports-airports.json'), { source: 'Natural Earth 1:10m ports and airports (public domain)', ports, airports });
console.log(`rail lines: ${rail.length}, ports: ${ports.length}, airports: ${airports.length}`);

const dir = dataPath('geo', 'x');
for (const f of fs.readdirSync(path.dirname(dir))) console.log(`  ${f}: ${(fs.statSync(path.join(path.dirname(dir), f)).size / 1024).toFixed(0)} KB`);
