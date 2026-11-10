// Triangulate lon/lat polygons onto the unit sphere.
// Site axis convention: x = cos(lat)cos(lon), y = sin(lat), z = -cos(lat)sin(lon).
import earcut from 'earcut';

const D2R = Math.PI / 180;

export function lonLatToVec(lon, lat) {
  const cl = Math.cos(lat * D2R);
  return [cl * Math.cos(lon * D2R), Math.sin(lat * D2R), -cl * Math.sin(lon * D2R)];
}

export function vecToLonLat(v) {
  return [Math.atan2(-v[2], v[0]) / D2R, Math.asin(Math.max(-1, Math.min(1, v[1]))) / D2R];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function chord(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Insert great-circle points so no ring edge is longer than maxChord. */
function densify(ring, maxChord) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a);
    const n = Math.ceil(chord(a, b) / maxChord);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push(norm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
    }
  }
  return out;
}

function cleanRing(ring) {
  // lon/lat pairs -> unit vectors, dropping the closing duplicate and repeated points
  const out = [];
  for (const [lon, lat] of ring) {
    const v = lonLatToVec(lon, lat);
    if (out.length && chord(out[out.length - 1], v) < 1e-7) continue;
    out.push(v);
  }
  if (out.length > 1 && chord(out[0], out[out.length - 1]) < 1e-7) out.pop();
  return out;
}

/**
 * Mesh one polygon (array of rings of [lon, lat]) into sphere triangles.
 * Returns { positions: number[] (xyz...), indices: number[] } or null when degenerate.
 * maxEdgeDeg bounds triangle edge length so flat triangles hug the sphere.
 */
export function meshPolygon(rings, maxEdgeDeg = 4) {
  const maxChord = 2 * Math.sin((maxEdgeDeg * D2R) / 2);
  const vr = rings.map(cleanRing).filter((r) => r.length >= 3).map((r) => densify(r, maxChord));
  if (!vr.length) return null;

  // Stereographic projection about the ring centroid: conformal and valid for anything under a hemisphere.
  let c = [0, 0, 0];
  for (const v of vr[0]) c = [c[0] + v[0], c[1] + v[1], c[2] + v[2]];
  if (Math.hypot(...c) < 1e-9) c = vr[0][0];
  c = norm(c);
  const helper = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(helper, c));
  const e2 = cross(c, e1);

  const verts = [];
  const flat = [];
  const holes = [];
  for (let r = 0; r < vr.length; r++) {
    if (r > 0) holes.push(verts.length);
    for (const v of vr[r]) {
      const k = 2 / (1 + Math.max(-0.95, dot(v, c)));
      flat.push(k * dot(v, e1), k * dot(v, e2));
      verts.push(v);
    }
  }
  const tris = earcut(flat, holes, 2);
  if (!tris.length) return null;

  // Subdivide long edges at great-circle midpoints. The midpoint cache keeps shared edges crack-free.
  const mid = new Map();
  const midpoint = (i, j) => {
    const key = i < j ? i * 4194304 + j : j * 4194304 + i;
    let m = mid.get(key);
    if (m === undefined) {
      const a = verts[i];
      const b = verts[j];
      m = verts.length;
      verts.push(norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]));
      mid.set(key, m);
    }
    return m;
  };
  const out = [];
  const stack = [];
  for (let i = 0; i < tris.length; i += 3) stack.push([tris[i], tris[i + 1], tris[i + 2]]);
  let guard = 0;
  while (stack.length) {
    if (++guard > 4e6) break;
    const [a, b, cc] = stack.pop();
    const lab = chord(verts[a], verts[b]);
    const lbc = chord(verts[b], verts[cc]);
    const lca = chord(verts[cc], verts[a]);
    const m = Math.max(lab, lbc, lca);
    if (m <= maxChord * 1.001) {
      out.push(a, b, cc);
    } else if (m === lab) {
      const p = midpoint(a, b);
      stack.push([a, p, cc], [p, b, cc]);
    } else if (m === lbc) {
      const p = midpoint(b, cc);
      stack.push([a, b, p], [a, p, cc]);
    } else {
      const p = midpoint(cc, a);
      stack.push([a, b, p], [p, b, cc]);
    }
  }

  // Outward-facing winding (counter-clockwise seen from outside the sphere).
  for (let i = 0; i < out.length; i += 3) {
    const a = verts[out[i]];
    const b = verts[out[i + 1]];
    const d = verts[out[i + 2]];
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]);
    if (dot(n, [a[0] + b[0] + d[0], a[1] + b[1] + d[1], a[2] + b[2] + d[2]]) < 0) {
      const t = out[i + 1];
      out[i + 1] = out[i + 2];
      out[i + 2] = t;
    }
  }
  const positions = new Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3] = verts[i][0];
    positions[i * 3 + 1] = verts[i][1];
    positions[i * 3 + 2] = verts[i][2];
  }
  return { positions, indices: out };
}

/** Point-in-ring test on the sphere via planar test in a local stereographic frame is overkill here;
 *  this simple lon/lat ray cast is used for polygons that do not straddle the antimeridian. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
