// Glowing pins for events. One draw call; the visible set is rebuilt only when the clock, the lens
// or the loaded data change. Picking is done in screen space.
import * as THREE from 'three';
import { state } from '../core/store.js';
import { yearsPerU, NOW } from '../core/time.js';
import { lensBit, LENS_IDS } from '../data/events.js';

const vertexShader = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aKind;     // 0 automated, 1 curated
uniform float uPixelRatio;
uniform float uClock;
uniform vec3 uCamPos;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vPulse;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // fade pins that sit right on the limb so they do not pile up along the edge of the globe
  vec3 n = normalize(position);
  float facing = dot(n, normalize(uCamPos - position));
  vAlpha = aAlpha * smoothstep(0.02, 0.22, facing);
  vColor = aColor;
  vKind = aKind;
  vPulse = 0.5 + 0.5 * sin(uClock * 2.2 + position.x * 40.0 + position.y * 31.0);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 0.10 * vPulse * step(0.5, aKind));
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
varying float vPulse;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if(r > 1.0) discard;
  float core = 1.0 - smoothstep(0.26, 0.36, r);
  float halo = (1.0 - smoothstep(0.30, 1.0, r)) * 0.55;
  float ring = smoothstep(0.50, 0.58, r) * (1.0 - smoothstep(0.66, 0.74, r)) * vKind;
  vec3 col = mix(vColor, vec3(1.0), core * 0.55);
  float a = max(core, max(halo * (0.75 + 0.25 * vPulse), ring * 0.95));
  // a dark rim keeps pins readable over bright ice and desert
  float rim = smoothstep(0.34, 0.40, r) * (1.0 - smoothstep(0.40, 0.48, r));
  col = mix(col, vec3(0.02, 0.04, 0.07), rim * 0.55);
  gl_FragColor = vec4(col, a * vAlpha);
}
`;

const MAX_PINS = 1400;

export class Pins {
  constructor(engine, store, lenses) {
    this.engine = engine;
    this.store = store;
    this.lensColor = {};
    for (const l of [...lenses.human, ...lenses.deep]) this.lensColor[l.id] = new THREE.Color(l.color);
    this.visible = []; // events currently drawn, in buffer order
    this.screen = new Float32Array(MAX_PINS * 3); // x, y, radius for picking
    this.extra = []; // pins supplied by stories or trails: always drawn
    this.geometry = new THREE.BufferGeometry();
    this.attr = {
      position: new THREE.BufferAttribute(new Float32Array(MAX_PINS * 3), 3),
      aSize: new THREE.BufferAttribute(new Float32Array(MAX_PINS), 1),
      aColor: new THREE.BufferAttribute(new Float32Array(MAX_PINS * 3), 3),
      aAlpha: new THREE.BufferAttribute(new Float32Array(MAX_PINS), 1),
      aKind: new THREE.BufferAttribute(new Float32Array(MAX_PINS), 1),
    };
    for (const [k, a] of Object.entries(this.attr)) {
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(k, a);
    }
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uPixelRatio: { value: 1 }, uClock: { value: 0 }, uCamPos: { value: new THREE.Vector3() } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    engine.scene.add(this.points);
    this.key = '';
    this.hoverId = null;
    this.selectedId = null;
    this.enabled = true;
    engine.addLayer(this);
  }

  /** Years either side of the clock that count as "now" for pins. */
  timeWindow() {
    const ypp = yearsPerU(state.y) / (Math.max(1, state.timeZoom) * Math.max(320, this.engine.width));
    // "Around now" also has to mean it far back: never reach further than a fifth of the way to the present.
    return Math.max(0.6 / 365, Math.min(ypp * 80, Math.max(40, (NOW - state.y) * 0.2)));
  }

  /** Cells (30 degrees) under the camera, used only when the user is close enough for local detail. */
  cellsInView() {
    if (state.altKm > 9000) return null;
    const out = new Set();
    const reach = Math.min(45, 8 + state.altKm / 180);
    for (const dLat of [-reach, 0, reach]) {
      for (const dLon of [-reach, 0, reach]) {
        const lat = Math.max(-89.9, Math.min(89.9, state.lat + dLat));
        const lon = ((((state.lon + dLon / Math.max(0.3, Math.cos((lat * Math.PI) / 180)) + 180) % 360) + 360) % 360) - 180;
        out.add(`${Math.min(11, Math.floor((lon + 180) / 30))}_${Math.min(5, Math.floor((lat + 90) / 30))}`);
      }
    }
    return [...out];
  }

  /** Where an event sits at the clock time: riding its plate in deep time, at its own coordinates otherwise. */
  placeOf(e) {
    const ma = (NOW - state.y) / 1e6;
    const pl = this.engine.plates;
    if (ma < 2 || !pl || !pl.ready || ma > pl.meta.maxMa) return e;
    const k = Math.round(ma * 100);
    if (e._pk !== k) {
      e._pk = k;
      const r = pl.reconstructNear(e.lon, e.lat, ma);
      if (r) {
        const cl = Math.cos(r.lat * D2R);
        e._p = { lat: r.lat, lon: r.lon, x: cl * Math.cos(r.lon * D2R), yv: Math.sin(r.lat * D2R), z: -cl * Math.sin(r.lon * D2R) };
      } else e._p = null;
    }
    return e._p || e;
  }

  colorFor(e) {
    if (state.lens !== 'all' && this.lensColor[state.lens]) return this.lensColor[state.lens];
    for (let i = 0; i < LENS_IDS.length; i++) if (e.mask & (1 << i)) return this.lensColor[LENS_IDS[i]];
    return this.lensColor[e.lens] || WHITE;
  }

  rebuild() {
    const half = this.timeWindow();
    const cells = this.cellsInView();
    this.store.request(state.y, half, cells);
    const mask = state.lens === 'all' ? 0 : lensBit(state.lens);
    let list = this.enabled && this.engine.env && this.engine.env.earth > 0.5 ? this.store.query(state.y, half, mask) : [];
    if (state.lens !== 'all' && !mask) list = list.filter((e) => e.lens === state.lens || (e.lenses && e.lenses.includes(state.lens)));
    // Legibility: fewer pins from far away, the most important and the closest in time first.
    const budget = Math.round(state.altKm > 14000 ? 70 : state.altKm > 6000 ? 130 : state.altKm > 2000 ? 260 : 520) * (this.engine.quality === 'low' ? 0.6 : 1);
    const cam = this.engine.camera.position;
    const cl = cam.length();
    const scored = [];
    for (const e of list) {
      const at = this.placeOf(e);
      const facing = (at.x * cam.x + at.yv * cam.y + at.z * cam.z) / cl;
      if (facing < 1 / cl - 0.02) continue; // behind the limb
      const span = e.end && e.end > e.y ? (state.y >= e.y && state.y <= e.end ? 0 : Math.min(Math.abs(state.y - e.y), Math.abs(state.y - e.end))) : Math.abs(state.y - e.y);
      const near = 1 - Math.min(1, span / half);
      scored.push({ e, near, score: e.imp * 2 + (e.curated && !e.person && !e.plain ? 3 : 0) + near * 3 + (e.id === this.selectedId ? 100 : 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    const chosen = scored.slice(0, budget);
    const pos = this.attr.position.array;
    const size = this.attr.aSize.array;
    const col = this.attr.aColor.array;
    const alpha = this.attr.aAlpha.array;
    const kind = this.attr.aKind.array;
    this.visible = [];
    let n = 0;
    const zoomScale = state.altKm > 12000 ? 0.85 : state.altKm > 4000 ? 1 : 1.2;
    const lifeLens = state.lens === 'life';
    const put = (e, a, s, k) => {
      if (n >= MAX_PINS) return;
      const at = e._p && e._pk != null && state.y < NOW - 2e6 ? e._p : e;
      pos[n * 3] = at.x * 1.0015;
      pos[n * 3 + 1] = at.yv * 1.0015;
      pos[n * 3 + 2] = at.z * 1.0015;
      const c = e.color ? _c.set(e.color) : this.colorFor(e);
      col[n * 3] = c.r;
      col[n * 3 + 1] = c.g;
      col[n * 3 + 2] = c.b;
      size[n] = s;
      alpha[n] = a;
      kind[n] = k;
      this.visible.push(e);
      n++;
    };
    for (const { e, near } of chosen) {
      // under the Life lens the fossil finds are the subject, so they are drawn larger
      const s = (9 + e.imp * 3.2 + (e.curated && !e.person && !e.plain ? 5 : 0)) * zoomScale * (e.id === this.selectedId || e.id === this.hoverId ? 1.5 : 1) * (lifeLens && e.kind === 'fossil' ? 1.5 : 1);
      put(e, 0.35 + 0.65 * near, s, e.curated && !e.person && !e.plain ? 1 : 0);
    }
    for (const e of this.extra) put(e, 1, (e.size || 22) * zoomScale, 1);
    for (const a of Object.values(this.attr)) a.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
    this.count = n;
  }

  update() {
    const key = `${state.y}|${state.timeZoom}|${state.lens}|${this.store.version}|${Math.round(state.lat)}|${Math.round(state.lon)}|${Math.round(Math.log2(state.altKm) * 3)}|${this.hoverId}|${this.selectedId}|${this.extraVersion || 0}|${this.enabled}|${this.engine.plates && this.engine.plates.ready ? 1 : 0}`;
    if (key !== this.key) {
      this.key = key;
      this.rebuild();
    }
    this.material.uniforms.uPixelRatio.value = this.engine.renderer.getPixelRatio();
    this.material.uniforms.uClock.value = this.engine.clock;
    this.material.uniforms.uCamPos.value.copy(this.engine.camera.position);
  }

  setExtra(list) {
    const D2R = Math.PI / 180;
    this.extra = (list || []).map((e) => {
      const cl = Math.cos(e.lat * D2R);
      return { ...e, x: cl * Math.cos(e.lon * D2R), yv: Math.sin(e.lat * D2R), z: -cl * Math.sin(e.lon * D2R) };
    });
    this.extraVersion = (this.extraVersion || 0) + 1;
    this.engine.invalidate();
  }

  /** The pin under a screen point, if any. */
  pick(x, y, radius = 16) {
    let best = null;
    let bestD = radius;
    const p = { x: 0, y: 0, visible: false, facing: 0 };
    for (const e of this.visible) {
      const at = e._p && state.y < NOW - 2e6 ? e._p : e;
      _v.set(at.x, at.yv, at.z);
      this.engine.project(_v, p);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  setHover(id) {
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.engine.invalidate();
    }
  }

  setSelected(id) {
    if (id !== this.selectedId) {
      this.selectedId = id;
      this.engine.invalidate();
    }
  }
}

const D2R = Math.PI / 180;
const WHITE = new THREE.Color('#f4f1e8');
const _c = new THREE.Color();
const _v = new THREE.Vector3();
