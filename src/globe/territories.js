// States, empires and peoples through time.
// Before 1886 the source is a set of world snapshots (historical-basemaps); the layer crossfades
// between the two snapshots around the clock. From 1886 on, CShapes gives every state a start and an
// end date, so borders change on the day they changed. Everything here is labelled approximate where
// the source is.
import * as THREE from 'three';
import { state } from '../core/store.js';
import { fetchJSON, fetchBuffer } from '../data/net.js';

const D2R = Math.PI / 180;

const fillVertex = /* glsl */ `
attribute vec4 aColor;
attribute float aPolity;
uniform sampler2D uSpan;      // per polity: start, end (years); only used for dated datasets
uniform float uYear;
uniform float uDated;
varying vec4 vColor;
varying float vShow;
varying vec3 vPos;
void main(){
  vColor = aColor;
  vShow = 1.0;
  if(uDated > 0.5){
    vec2 span = texelFetch(uSpan, ivec2(int(aPolity + 0.5), 0), 0).rg;
    vShow = step(span.x, uYear) * step(uYear, span.y);
  }
  vPos = position;
  gl_Position = vShow < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const fillFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
uniform vec3 uSunDir;
varying vec4 vColor;
varying float vShow;
varying vec3 vPos;
void main(){
  if(vShow < 0.5) discard;
  float light = 0.45 + 0.55 * smoothstep(-0.22, 0.5, dot(normalize(vPos), uSunDir));
  gl_FragColor = vec4(vColor.rgb * light, uAlpha * vColor.a);
}
`;
const lineVertex = /* glsl */ `
attribute float aPolity;
attribute float aSoft;
uniform sampler2D uSpan;
uniform float uYear;
uniform float uDated;
varying float vShow;
varying float vSoft;
void main(){
  vShow = 1.0;
  if(uDated > 0.5){
    vec2 span = texelFetch(uSpan, ivec2(int(aPolity + 0.5), 0), 0).rg;
    vShow = step(span.x, uYear) * step(uYear, span.y);
  }
  vSoft = aSoft;
  gl_Position = vShow < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const lineFragment = /* glsl */ `
precision highp float;
uniform float uAlpha;
uniform vec3 uColor;
varying float vShow;
varying float vSoft;
void main(){
  if(vShow < 0.5) discard;
  gl_FragColor = vec4(uColor, uAlpha * mix(1.0, 0.55, vSoft));
}
`;

class Snapshot {
  constructor(layer, meta, buffer) {
    const headLen = new DataView(buffer).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headLen)));
    const base = 4 + headLen;
    const sec = header.sections;
    this.header = header;
    this.year = header.year;
    this.dated = header.dataset === 'cshapes';
    this.polities = header.polities;
    this.ringPts = new Int16Array(buffer, base + sec.rings[0], sec.rings[1]);
    const blank = layer.blankSpan;
    let span = blank;
    if (this.dated) {
      const data = new Float32Array(Math.max(1, this.polities.length) * 4);
      this.polities.forEach((p, i) => {
        data[i * 4] = p.start;
        data[i * 4 + 1] = p.end;
      });
      span = new THREE.DataTexture(data, Math.max(1, this.polities.length), 1, THREE.RGBAFormat, THREE.FloatType);
      span.minFilter = span.magFilter = THREE.NearestFilter;
      span.needsUpdate = true;
    }
    this.span = span;

    // fills
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Int16Array(buffer, base + sec.position[0], sec.position[1]), 3, true));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Uint8Array(buffer, base + sec.color[0], sec.color[1]), 4, true));
    geo.setAttribute('aPolity', new THREE.BufferAttribute(new Uint16Array(buffer, base + sec.polity[0], sec.polity[1]), 1));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, base + sec.index[0], sec.index[1]), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
    this.fillMaterial = new THREE.ShaderMaterial({
      vertexShader: fillVertex,
      fragmentShader: fillFragment,
      uniforms: { uAlpha: { value: 0 }, uSpan: { value: span }, uYear: { value: 0 }, uDated: { value: this.dated ? 1 : 0 }, uSunDir: layer.engine.earth.uniforms.uSunDir },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.fill = new THREE.Mesh(geo, this.fillMaterial);
    this.fill.frustumCulled = false;
    this.fill.renderOrder = 4;

    // outlines, from the same rings the lookups use
    let segs = 0;
    for (const p of this.polities) for (const r of p.rings) segs += r[1];
    const lp = new Float32Array(segs * 6);
    const lpol = new Float32Array(segs * 2);
    const soft = new Float32Array(segs * 2);
    let k = 0;
    this.polities.forEach((p, pi) => {
      for (const [start, count] of p.rings) {
        for (let i = 0; i < count; i++) {
          const a = start + i;
          const b = start + ((i + 1) % count);
          for (const q of [a, b]) {
            const lon = this.ringPts[q * 2] / 100;
            const lat = this.ringPts[q * 2 + 1] / 100;
            const cl = Math.cos(lat * D2R);
            lp[k * 3] = cl * Math.cos(lon * D2R) * 1.0008;
            lp[k * 3 + 1] = Math.sin(lat * D2R) * 1.0008;
            lp[k * 3 + 2] = -cl * Math.sin(lon * D2R) * 1.0008;
            lpol[k] = pi;
            soft[k] = p.prec === 1 || !p.name ? 1 : 0;
            k++;
          }
        }
      }
    });
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lgeo.setAttribute('aPolity', new THREE.BufferAttribute(lpol, 1));
    lgeo.setAttribute('aSoft', new THREE.BufferAttribute(soft, 1));
    lgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
    this.lineMaterial = new THREE.ShaderMaterial({
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color('#f4f1e8') }, uSpan: { value: span }, uYear: { value: 0 }, uDated: { value: this.dated ? 1 : 0 } },
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(lgeo, this.lineMaterial);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.group = new THREE.Group();
    this.group.add(this.fill, this.lines);
    this.group.visible = false;
    layer.engine.scene.add(this.group);
  }

  setAlpha(fill, line, year) {
    this.group.visible = fill > 0.004 || line > 0.004;
    this.fillMaterial.uniforms.uAlpha.value = fill;
    this.lineMaterial.uniforms.uAlpha.value = line;
    this.fillMaterial.uniforms.uYear.value = year;
    this.lineMaterial.uniforms.uYear.value = year;
    this.fill.visible = fill > 0.004;
  }

  /** The polity containing a point, honouring holes; smaller territories win over the ones they sit inside. */
  polityAt(lon, lat, year) {
    const x = lon * 100;
    const y = lat * 100;
    let best = null;
    for (const p of this.polities) {
      if (this.dated && (year < p.start || year > p.end)) continue;
      const b = p.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      let inside = false;
      for (const [start, count] of p.rings) {
        // even-odd across exterior rings and holes
        let c = false;
        for (let i = 0, j = count - 1; i < count; j = i++) {
          const xi = this.ringPts[(start + i) * 2];
          const yi = this.ringPts[(start + i) * 2 + 1];
          const xj = this.ringPts[(start + j) * 2];
          const yj = this.ringPts[(start + j) * 2 + 1];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        if (c) inside = !inside;
      }
      if (inside && (!best || p.area < best.area)) best = p;
    }
    return best;
  }

  dispose() {
    this.group.removeFromParent();
    this.fill.geometry.dispose();
    this.lines.geometry.dispose();
    this.fillMaterial.dispose();
    this.lineMaterial.dispose();
    if (this.dated) this.span.dispose();
  }
}

export class Territories {
  constructor(engine) {
    this.engine = engine;
    this.index = null;
    this.cache = new Map(); // file -> Snapshot | 'loading'
    this.active = []; // [{ snap, weight }]
    const blank = new THREE.DataTexture(new Float32Array([-1e12, 1e12, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    blank.needsUpdate = true;
    this.blankSpan = blank;
    this.ready = engine.track(
      fetchJSON('data/borders/index.json')
        .then((idx) => {
          this.index = idx;
          engine.invalidate();
        })
        .catch((e) => engine.reportError(`borders index failed: ${e.message}`)),
    );
    engine.addLayer(this);
  }

  load(file) {
    const hit = this.cache.get(file);
    if (hit) return hit === 'loading' ? null : hit;
    this.cache.set(file, 'loading');
    this.engine.track(
      fetchBuffer(`data/borders/${file}`)
        .then((buf) => {
          this.cache.set(file, new Snapshot(this, file, buf));
          this.trim();
          this.engine.invalidate();
        })
        .catch((e) => {
          this.engine.reportError(`borders ${file}: ${e.message}`);
          this.cache.delete(file);
        }),
    );
    return null;
  }

  /** Keep a handful of snapshots; drop the ones farthest from the clock. */
  trim() {
    const loaded = [...this.cache.entries()].filter(([, s]) => s !== 'loading');
    if (loaded.length <= 5) return;
    const keep = new Set(this.active.map((a) => a.snap));
    for (const [file, snap] of loaded) {
      if (keep.has(snap) || this.cache.size <= 5) continue;
      snap.dispose();
      this.cache.delete(file);
    }
  }

  /** Which sources describe year y: [{ file, weight, year }] */
  plan(y) {
    const idx = this.index;
    if (!idx) return [];
    if (y >= idx.cshapes.from) {
      const p = idx.cshapes.periods.find((q) => y >= q.from && y < q.to) || idx.cshapes.periods[idx.cshapes.periods.length - 1];
      return [{ file: p.file, weight: 1, dated: true }];
    }
    const s = idx.snapshots;
    if (y < s[0].year) return [];
    let i = 0;
    while (i < s.length - 1 && s[i + 1].year <= y) i++;
    const a = s[i];
    const b = s[i + 1];
    if (!b || b.year > idx.cshapes.from) return [{ file: a.file, weight: 1, year: a.year }];
    const t = (y - a.year) / (b.year - a.year);
    const w = t * t * (3 - 2 * t);
    const out = [{ file: a.file, weight: 1 - w, year: a.year }];
    if (w > 0.02) out.push({ file: b.file, weight: w, year: b.year });
    else this.load(b.file); // warm the next one so scrubbing forward never waits
    return out;
  }

  update(env) {
    for (const a of this.active) a.snap.setAlpha(0, 0, state.y);
    this.active = [];
    if (!this.index || env.modern < 0.99 || state.solar) return;
    const lens = state.lens;
    // Territory fill belongs to power and politics; other lenses keep only a quiet outline.
    const fillK = lens === 'power' ? 0.52 : lens === 'all' ? 0.26 : lens === 'war' ? 0.2 : lens === 'nature' ? 0 : 0.1;
    const lineK = lens === 'nature' ? 0.12 : lens === 'power' ? 0.8 : 0.5;
    const far = Math.min(1, Math.max(0.55, state.altKm / 9000)); // a little lighter when close to the ground
    for (const p of this.plan(state.y)) {
      const snap = this.load(p.file);
      if (!snap) continue;
      snap.setAlpha(fillK * p.weight * far, lineK * p.weight, state.y);
      this.active.push({ snap, weight: p.weight, year: p.year });
    }
  }

  /** Who held this point at the current time, according to the sources. */
  polityAt(lon, lat, y = state.y) {
    let best = null;
    for (const a of this.active) {
      if (best && a.weight < best.weight) continue;
      const p = a.snap.polityAt(lon, lat, y);
      best = { polity: p, weight: a.weight, snapshotYear: a.snap.year, dataset: a.snap.header.dataset, approximate: !!a.snap.header.approximate };
    }
    return best;
  }

  /** Named territories of the dominant snapshot, for labels. */
  labelled() {
    if (!this.active.length) return [];
    const main = this.active[0]; // the snapshot at or before the clock: no state is named before the map that attests it
    const snap = main.snap;
    if (snap.labelCacheYear !== (snap.dated ? Math.floor(state.y * 4) : 0)) {
      snap.labelCacheYear = snap.dated ? Math.floor(state.y * 4) : 0;
      const seen = new Map();
      for (const p of snap.polities) {
        if (!p.name) continue;
        if (snap.dated && (state.y < p.start || state.y > p.end)) continue;
        const prev = seen.get(p.name);
        if (!prev || p.area > prev.area) seen.set(p.name, p);
      }
      snap.labelCache = [...seen.values()];
    }
    return snap.labelCache;
  }

  /** Polygons ([[ring of [lon, lat]]...]) of named territories in the dominant snapshot, for story highlights. */
  polysOf(names, y = state.y) {
    if (!this.active.length) return { key: '', polys: [] };
    const main = this.active[0]; // the snapshot at or before the clock: no state is named before the map that attests it
    const snap = main.snap;
    const want = new Set(names);
    const polys = [];
    for (const p of snap.polities) {
      if (!want.has(p.name)) continue;
      if (snap.dated && (y < p.start || y > p.end)) continue;
      let cur = null;
      for (const [start, count, hole] of p.rings) {
        const ring = [];
        for (let i = 0; i < count; i++) ring.push([snap.ringPts[(start + i) * 2] / 100, snap.ringPts[(start + i) * 2 + 1] / 100]);
        if (!hole || !cur) {
          cur = [ring];
          polys.push(cur);
        } else cur.push(ring);
      }
    }
    return { key: `${snap.year ?? snap.header.from}:${snap.dated ? Math.floor(y) : ''}`, polys };
  }

  sourceNote() {
    if (!this.index || !this.active.length) return null;
    const main = this.active[0]; // the snapshot at or before the clock: no state is named before the map that attests it
    return main.snap.dated ? { ...this.index.sources.cshapes, dated: true } : { ...this.index.sources.hb, snapshotYear: main.snap.year, dated: false };
  }
}
