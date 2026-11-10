// High-resolution ground: patches of the 500 m Blue Marble mosaic, streamed as the user descends.
// Each patch reuses the Earth shader, so sea level, ice, the Green Sahara and night lights all still
// apply to the detailed imagery.
import * as THREE from 'three';
import { state } from '../core/store.js';
import { fetchJSON } from '../data/net.js';
import { makeEarthMaterial } from './earth.js';

const D2R = Math.PI / 180;

export class Tiles {
  constructor(engine, earth) {
    this.engine = engine;
    this.earth = earth;
    this.index = null;
    this.patches = new Map();
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.loader = new THREE.TextureLoader();
    this.limit = engine.quality === 'low' ? 26 : engine.quality === 'medium' ? 44 : 72;
    this.key = '';
    this.requested = false;
    engine.addLayer(this);
  }

  loadIndex() {
    if (this.requested) return;
    this.requested = true;
    this.engine.track(
      fetchJSON('tiles/index.json')
        .then((idx) => {
          for (const lvl of Object.values(idx.levels)) {
            const bin = atob(lvl.have);
            lvl.bits = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) lvl.bits[i] = bin.charCodeAt(i);
          }
          this.index = idx;
          this.engine.invalidate();
        })
        .catch((e) => this.engine.reportError(`tile index: ${e.message}`)),
    );
  }

  has(z, x, y) {
    const lvl = this.index.levels[z];
    if (!lvl) return false;
    const bit = y * lvl.cols + x;
    return (lvl.bits[bit >> 3] & (1 << (bit & 7))) !== 0;
  }

  /** The finest existing tile at or above (z, x, y). Level 4 is complete, so this always resolves. */
  resolve(z, x, y) {
    while (z > 4 && !this.has(z, x, y)) {
      z--;
      x >>= 1;
      y >>= 1;
    }
    return this.has(z, x, y) ? [z, x, y] : null;
  }

  patch(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let p = this.patches.get(key);
    if (p) return p;
    const cols = 2 ** (z + 1);
    const rows = 2 ** z;
    const span = 180 / rows;
    const lon0 = -180 + x * span;
    const lat1 = 90 - y * span;
    const n = z >= 6 ? 6 : z === 5 ? 10 : 16;
    const pos = new Float32Array((n + 1) * (n + 1) * 3);
    let k = 0;
    for (let j = 0; j <= n; j++) {
      const lat = (lat1 - (j / n) * span) * D2R;
      for (let i = 0; i <= n; i++) {
        const lon = (lon0 + (i / n) * span) * D2R;
        pos[k++] = Math.cos(lat) * Math.cos(lon);
        pos[k++] = Math.sin(lat);
        pos[k++] = -Math.cos(lat) * Math.sin(lon);
      }
    }
    const idx = new Uint16Array(n * n * 6);
    k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + 1;
        const c = a + n + 1;
        const d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
    const uniforms = {
      ...this.earth.uniforms,
      uTile: { value: 1 },
      uTileTex: { value: this.earth.uniforms.uTileTex.value },
      uTileRect: { value: new THREE.Vector4(x / cols, 1 - (y + 1) / rows, 1 / cols, 1 / rows) },
      uFade: { value: 0 },
    };
    const material = makeEarthMaterial(uniforms, this.engine.octaves);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0.4 + z * 0.01;
    mesh.visible = false;
    this.group.add(mesh);
    p = { key, z, mesh, uniforms, tex: null, loaded: false, used: 0 };
    this.patches.set(key, p);
    this.engine.track(
      new Promise((resolve) => {
        this.loader.load(
          `tiles/${z}/${x}/${y}.webp`,
          (tex) => {
            tex.colorSpace = THREE.NoColorSpace;
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.anisotropy = this.engine.anisotropy;
            p.tex = tex;
            uniforms.uTileTex.value = tex;
            p.loaded = true;
            this.engine.invalidate();
            resolve();
          },
          undefined,
          () => {
            this.engine.reportError(`tile ${key} failed to load`);
            p.failed = true;
            resolve();
          },
        );
      }),
    );
    return p;
  }

  update(env, dt) {
    const alt = state.altKm;
    const active = env.modern > 0.99 && alt < 5200 && !state.solar;
    if (!active) {
      if (this.group.visible) this.group.visible = false;
      return;
    }
    this.loadIndex();
    if (!this.index) return;
    this.group.visible = true;
    const e = this.engine;
    const dpp = e.degreesPerPixel();
    // choose the level whose texels are about one screen pixel
    let z = 4;
    for (const cand of [5, 6]) if (180 / (2 ** cand * 512) > dpp * 0.55) z = cand;
    const reach = Math.min(50, dpp * Math.hypot(e.width, e.height) * 0.56 + 180 / 2 ** z);
    const key = `${z}|${(state.lat / (reach * 0.12)) | 0}|${(state.lon / (reach * 0.12)) | 0}|${Math.round(reach)}`;
    if (key !== this.key) {
      this.key = key;
      const want = new Map();
      const rows = 2 ** z;
      const cols = rows * 2;
      const span = 180 / rows;
      const latA = Math.max(-89.999, state.lat - reach);
      const latB = Math.min(89.999, state.lat + reach);
      const lonReach = Math.min(180, reach / Math.max(0.15, Math.cos(Math.max(Math.abs(latA), Math.abs(latB)) * D2R)));
      const y0 = Math.max(0, Math.floor((90 - latB) / span));
      const y1 = Math.min(rows - 1, Math.floor((90 - latA) / span));
      const x0 = Math.floor((state.lon - lonReach + 180) / span);
      const x1 = Math.floor((state.lon + lonReach + 180) / span);
      const list = [];
      for (let y = y0; y <= y1; y++) {
        for (let xx = x0; xx <= x1; xx++) {
          const x = ((xx % cols) + cols) % cols;
          const cLat = 90 - (y + 0.5) * span;
          const cLon = -180 + (x + 0.5) * span;
          let dLon = Math.abs(cLon - state.lon);
          if (dLon > 180) dLon = 360 - dLon;
          list.push({ x, y, d: Math.hypot(cLat - state.lat, dLon * Math.cos(state.lat * D2R)) });
        }
      }
      list.sort((a, b) => a.d - b.d);
      for (const t of list) {
        if (want.size >= this.limit) break;
        const r = this.resolve(z, t.x, t.y);
        if (r) want.set(r.join('/'), r);
        // a coarse parent underneath covers the moment before the fine tile arrives
        if (z > 4 && want.size < this.limit) {
          const pz = z - (z - 4);
          const pr = [pz, t.x >> (z - pz), t.y >> (z - pz)];
          want.set(pr.join('/'), pr);
        }
      }
      this.want = want;
      this.stamp = (this.stamp || 0) + 1;
      for (const r of want.values()) this.patch(r[0], r[1], r[2]).used = this.stamp;
      // forget the least recently used patches
      if (this.patches.size > this.limit * 2.2) {
        const old = [...this.patches.values()].filter((p) => !want.has(p.key)).sort((a, b) => a.used - b.used);
        for (const p of old.slice(0, this.patches.size - this.limit * 2)) {
          p.mesh.removeFromParent();
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          if (p.tex) p.tex.dispose();
          this.patches.delete(p.key);
        }
      }
    }
    // fade in by altitude so the hand-over from the whole-globe texture is never a pop
    const lift = 1 - Math.min(1, Math.max(0, (alt - 4200) / 1000));
    let fading = false;
    for (const p of this.patches.values()) {
      const on = this.want.has(p.key) && p.loaded;
      const u = p.uniforms.uFade;
      const target = on ? lift : 0;
      if (state.capture || state.reducedMotion || dt <= 0) u.value = target;
      else if (Math.abs(u.value - target) > 0.01) {
        u.value += (target - u.value) * Math.min(1, dt * 6);
        fading = true;
      } else u.value = target;
      p.mesh.visible = u.value > 0.01;
    }
    if (fading) this.engine.invalidate();
  }
}
