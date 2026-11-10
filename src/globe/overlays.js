// Drawing on the globe: arrows, routes, moving front lines, shaded areas, rings and site markers.
// Stories, trails and lenses describe what they want as plain data; this layer draws it.
import * as THREE from 'three';
import { state } from '../core/store.js';
import { meshPolygon } from '../shared/spheremesh.js';

const D2R = Math.PI / 180;

export function ll2v(lat, lon, r = 1) {
  const cl = Math.cos(lat * D2R);
  return new THREE.Vector3(r * cl * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * cl * Math.sin(lon * D2R));
}

/** Points along the great circle from a to b ([lat, lon] pairs), optionally lifted in an arc. */
export function greatCircle(a, b, lift = 0, minSteps = 8) {
  const va = ll2v(a[0], a[1]);
  const vb = ll2v(b[0], b[1]);
  const ang = va.angleTo(vb);
  const n = Math.max(minSteps, Math.ceil(ang / (2.5 * D2R)));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = ang < 1e-6 ? va.clone() : va.clone().multiplyScalar(Math.sin((1 - t) * ang)).addScaledVector(vb, Math.sin(t * ang)).normalize();
    out.push(v.multiplyScalar(1.0025 + lift * Math.sin(Math.PI * t) * Math.min(1, ang / 1.2)));
  }
  return out;
}

/** A path through several [lat, lon] points, following great circles between them. */
export function pathThrough(points, lift = 0) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = greatCircle(points[i], points[i + 1], lift, 3);
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}

const ribbonVertex = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
uniform vec2 uResolution;
uniform float uWidth;      // CSS pixels
uniform float uReveal;     // 0..1 of the path drawn
uniform float uHead;       // length of the arrow head as a share of the path (0 for none)
uniform vec3 uCamPos;
uniform float uPixelRatio;
varying float vT;
varying float vFacing;
varying float vAcross;
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aPrev, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
  vec2 sa = a.xy / a.w * uResolution;
  vec2 sb = b.xy / b.w * uResolution;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float w = uWidth;
  if(uHead > 0.0){
    float h0 = uReveal - uHead;
    if(aT > h0) w = uWidth * 3.0 * clamp((uReveal - aT) / uHead, 0.0, 1.0);
  }
  if(aT > uReveal + 0.0005) w = 0.0;
  p.xy += normal * aSide * w / uResolution * p.w;   // w is the full width in CSS pixels: half each side, times 2 for NDC
  gl_Position = p;
  vT = aT;
  vAcross = aSide;
  vec3 n = normalize(position);
  vFacing = dot(n, normalize(uCamPos - position));
}
`;
const ribbonFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uReveal;
uniform float uDash;       // 0 solid, >0 dash count along the path
uniform float uFlow;       // moving highlights (ambient)
uniform float uClock;
varying float vT;
varying float vFacing;
varying float vAcross;
void main(){
  if(vT > uReveal + 0.001) discard;
  float a = uAlpha * smoothstep(-0.02, 0.16, vFacing);
  if(uDash > 0.0){
    float d = fract(vT * uDash);
    a *= smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.55, 0.63, d));
  }
  vec3 col = uColor;
  if(uFlow > 0.0){
    float f = fract(vT * uFlow - uClock * 0.22);
    col = mix(col, vec3(1.0), smoothstep(0.80, 0.97, f) * 0.6);
  }
  float edge = 1.0 - smoothstep(0.65, 1.0, abs(vAcross));
  gl_FragColor = vec4(col, a * (0.55 + 0.45 * edge));
}
`;

const fillVertex = /* glsl */ `
varying vec3 vPos;
void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fillFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uHatch;
uniform vec3 uSunDir;
varying vec3 vPos;
void main(){
  float light = 0.55 + 0.45 * smoothstep(-0.22, 0.5, dot(normalize(vPos), uSunDir));
  float a = uAlpha;
  if(uHatch > 0.0){
    float h = fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0);
    a *= mix(0.55, 1.0, step(0.5, h));
  }
  gl_FragColor = vec4(uColor * light, a);
}
`;

const ringVertex = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uCamPos;
varying float vFacing;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio;
  vFacing = dot(normalize(position), normalize(uCamPos - position));
}
`;
const ringFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uClock;
uniform float uPulse;
varying float vFacing;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if(r > 1.0) discard;
  float ph = fract(uClock * 0.45 * uPulse);
  float ring = exp(-pow((r - ph) * 9.0, 2.0)) * (1.0 - ph);
  float ring2 = exp(-pow((r - fract(ph + 0.5)) * 9.0, 2.0)) * (1.0 - fract(ph + 0.5));
  float core = 1.0 - smoothstep(0.10, 0.16, r);
  float a = max(core, max(ring, ring2) * 0.85) * uAlpha * smoothstep(0.0, 0.18, vFacing);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.5), a);
}
`;

export class Overlays {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.items = new Map(); // id -> item
    this.resolution = new THREE.Vector2(1, 1);
    engine.addLayer(this);
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.object.removeFromParent();
    it.object.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.items.delete(id);
    this.engine.invalidate();
  }

  has(id) {
    return this.items.has(id);
  }

  setAlpha(id, alpha) {
    const it = this.items.get(id);
    if (it && it.alpha !== alpha) {
      it.alpha = alpha;
      this.engine.invalidate();
    }
  }

  setReveal(id, reveal) {
    const it = this.items.get(id);
    if (it && it.reveal !== reveal) {
      it.reveal = reveal;
      this.engine.invalidate();
    }
  }

  /** A ribbon along a list of Vector3 points. opts: color, width, head, dash, flow */
  addPath(id, vectors, opts = {}) {
    this.remove(id);
    const n = vectors.length;
    if (n < 2) return;
    // cumulative length for an even parameter along the path
    const cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + vectors[i].distanceTo(vectors[i - 1]));
    const total = cum[n - 1] || 1;
    const pos = new Float32Array(n * 2 * 3);
    const prev = new Float32Array(n * 2 * 3);
    const next = new Float32Array(n * 2 * 3);
    const side = new Float32Array(n * 2);
    const tt = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = vectors[i];
      const a = vectors[Math.max(0, i - 1)];
      const b = vectors[Math.min(n - 1, i + 1)];
      for (let s = 0; s < 2; s++) {
        const k = (i * 2 + s) * 3;
        pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
        prev[k] = a.x; prev[k + 1] = a.y; prev[k + 2] = a.z;
        next[k] = b.x; next[k + 1] = b.y; next[k + 2] = b.z;
        side[i * 2 + s] = s ? 1 : -1;
        tt[i * 2 + s] = cum[i] / total;
      }
    }
    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPrev', new THREE.BufferAttribute(prev, 3));
    geo.setAttribute('aNext', new THREE.BufferAttribute(next, 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
    const mat = new THREE.ShaderMaterial({
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      uniforms: {
        uResolution: { value: this.resolution },
        uWidth: { value: opts.width || 3 },
        uReveal: { value: 1 },
        uHead: { value: opts.head ? Math.min(0.5, (opts.headLen || 0.07) / Math.max(0.15, total)) : 0 },
        uCamPos: this.engine.earth.uniforms.uCamPos,
        uPixelRatio: { value: 1 },
        uColor: { value: new THREE.Color(opts.color || '#ffd23f') },
        uAlpha: { value: 1 },
        uDash: { value: opts.dash ? Math.max(4, Math.round(total * (opts.dash === true ? 60 : opts.dash))) : 0 },
        uFlow: { value: opts.flow ? Math.max(2, Math.round(total * 9)) : 0 },
        uClock: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = opts.order || 9;
    this.group.add(mesh);
    this.items.set(id, { kind: 'path', object: mesh, mat, alpha: opts.alpha ?? 1, reveal: opts.reveal ?? 1, baseAlpha: opts.opacity ?? 0.95 });
    this.engine.invalidate();
  }

  /** Great-circle arrow or arc between two [lat, lon] points. */
  addArc(id, from, to, opts = {}) {
    this.addPath(id, greatCircle(from, to, opts.lift ?? 0.05), { head: true, ...opts });
  }

  /** Filled polygon from [lat, lon] points (closed automatically). */
  addArea(id, points, opts = {}) {
    this.remove(id);
    const rings = [points.map(([lat, lon]) => [lon, lat])];
    const m = meshPolygon(rings, 4);
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: fillVertex,
      fragmentShader: fillFragment,
      uniforms: { uColor: { value: new THREE.Color(opts.color || '#ff5d52') }, uAlpha: { value: 0 }, uHatch: { value: opts.hatch ? 1 : 0 }, uSunDir: this.engine.earth.uniforms.uSunDir },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    if (m) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
      geo.setIndex(m.indices);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = opts.order || 6;
      group.add(mesh);
    }
    this.group.add(group);
    this.items.set(id, { kind: 'area', object: group, mat, alpha: opts.alpha ?? 1, baseAlpha: opts.opacity ?? 0.34 });
    this.engine.invalidate();
  }

  /** Several polygons at once (countries, for instance): polys is [[ [lon,lat]... rings ]...]. */
  addPolys(id, polys, opts = {}) {
    this.remove(id);
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: fillVertex,
      fragmentShader: fillFragment,
      uniforms: { uColor: { value: new THREE.Color(opts.color || '#ff5d52') }, uAlpha: { value: 0 }, uHatch: { value: opts.hatch ? 1 : 0 }, uSunDir: this.engine.earth.uniforms.uSunDir },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const positions = [];
    const indices = [];
    for (const rings of polys) {
      const m = meshPolygon(rings, 5);
      if (!m) continue;
      const base = positions.length / 3;
      for (const v of m.positions) positions.push(v);
      for (const i of m.indices) indices.push(base + i);
    }
    if (positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setIndex(indices);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = opts.order || 6;
      group.add(mesh);
    }
    this.group.add(group);
    this.items.set(id, { kind: 'area', object: group, mat, alpha: opts.alpha ?? 1, baseAlpha: opts.opacity ?? 0.36 });
    this.engine.invalidate();
  }

  /** Pulsing ring at a point (an impact, a city under siege, an epicentre). */
  addRing(id, lat, lon, opts = {}) {
    this.remove(id);
    const geo = new THREE.BufferGeometry();
    const v = ll2v(lat, lon, 1.002);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([v.x, v.y, v.z]), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: { uSize: { value: opts.size || 70 }, uPixelRatio: { value: 1 }, uCamPos: this.engine.earth.uniforms.uCamPos, uColor: { value: new THREE.Color(opts.color || '#ffd23f') }, uAlpha: { value: 0 }, uClock: { value: 0 }, uPulse: { value: opts.pulse ?? 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 11;
    this.group.add(pts);
    this.items.set(id, { kind: 'ring', object: pts, mat, alpha: opts.alpha ?? 1, baseAlpha: 1 });
    this.engine.invalidate();
  }

  update(env) {
    if (!this.items.size) return;
    const e = this.engine;
    this.resolution.set(e.width, e.height);
    const pr = e.renderer.getPixelRatio();
    // overlays belong to the Earth: hide them while the view is still among the stars
    const world = env.earth;
    for (const it of this.items.values()) {
      const u = it.mat.uniforms;
      u.uAlpha.value = it.alpha * it.baseAlpha * world;
      it.object.visible = u.uAlpha.value > 0.003;
      if (u.uClock) u.uClock.value = e.clock;
      if (u.uPixelRatio) u.uPixelRatio.value = it.kind === 'path' ? 1 : pr;
      if (u.uReveal) u.uReveal.value = it.reveal;
    }
  }
}

export { state };
