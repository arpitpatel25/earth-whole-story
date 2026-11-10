// The renderer: owns the WebGL context, the camera, the ambient clock and the frame loop.
// The ambient clock drives clouds, pulses and lava. It is not historical time: only the store's `y`
// is, and nothing in here ever writes it.
import * as THREE from 'three';
import { state, on } from '../core/store.js';
import { environment, atmosphere } from './epoch.js';
import { Earth } from './earth.js';
import { Plates } from './plates.js';
import { Cosmos } from './cosmos.js';
import { Atmosphere } from './atmosphere.js';
import { Tiles } from './tiles.js';

export const EARTH_RADIUS_KM = 6371;
const D2R = Math.PI / 180;

export function lonLatToVector(lon, lat, r = 1, out = new THREE.Vector3()) {
  const cl = Math.cos(lat * D2R);
  return out.set(r * cl * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * cl * Math.sin(lon * D2R));
}

export function vectorToLonLat(v) {
  const l = v.length() || 1;
  return { lon: Math.atan2(-v.z, v.x) / D2R, lat: Math.asin(Math.max(-1, Math.min(1, v.y / l))) / D2R };
}

function pickQuality() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 520;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (coarse && (small || cores <= 4 || mem <= 4)) return 'low';
  if (coarse || cores <= 4) return 'medium';
  return 'high';
}

const QUALITY = {
  high: { pixelRatio: 2, octaves: 5, clouds: 1 },
  medium: { pixelRatio: 1.5, octaves: 4, clouds: 1 },
  low: { pixelRatio: 1.25, octaves: 3, clouds: 0.85 },
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.errors = [];
    this.pending = 0;
    this.idleWaiters = [];
    this.layers = [];
    this.clock = 0; // seconds, ambient
    this.clockFrozen = false;
    this.dirty = true;
    this.fps = 0;
    this.frameMs = 16.7;
    this.frames = 0;
    this.inset = { left: 0, right: 0, top: 0, bottom: 0 };
    this.insetNow = { left: 0, right: 0, top: 0, bottom: 0 };
    this.iceIndex = null;

    this.quality = pickQuality();
    this.applyQualityNumbers();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer = renderer;
    // Display-space workflow: colours in shaders are authored as they should appear on screen.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    renderer.sortObjects = true;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.001, 200);
    this.sunDir = new THREE.Vector3();

    this.cosmos = new Cosmos(this);
    this.earth = new Earth(this);
    this.plates = new Plates(this, this.earth);
    this.atmosphere = new Atmosphere(this, this.earth.uniforms);
    this.tiles = new Tiles(this, this.earth);

    this.resize();
    addEventListener('resize', () => this.resize());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.reportError('WebGL context lost');
    });
    on(['y', 'lat', 'lon', 'altKm', 'lens', 'story', 'step', 'event', 'solar'], () => this.invalidate());

    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  applyQualityNumbers() {
    const q = QUALITY[this.quality];
    this.octaves = q.octaves;
    this.cloudScale = q.clouds;
    this.maxPixelRatio = q.pixelRatio;
    state.quality = this.quality;
  }

  /** Drop one tier when frames are slow. Shader variants are compiled per tier, so this rebuilds them. */
  downgrade() {
    const next = this.quality === 'high' ? 'medium' : this.quality === 'medium' ? 'low' : null;
    if (!next) return;
    this.quality = next;
    this.applyQualityNumbers();
    for (const m of [this.earth.material, this.cosmos.material, ...this.plates.materials]) {
      m.defines.FBM_OCTAVES = this.octaves;
      m.needsUpdate = true;
    }
    this.resize();
    document.documentElement.dataset.quality = this.quality;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole planet comfortable on tall phone screens by widening the vertical field of view.
    this.camera.fov = w / h < 0.75 ? 44 : 32;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** Reserve screen space for panels: the globe's centre shifts into the free area. */
  setInset(inset) {
    Object.assign(this.inset, inset);
    this.invalidate();
  }

  addLayer(layer) {
    this.layers.push(layer);
    return layer;
  }

  invalidate() {
    this.dirty = true;
  }

  reportError(msg) {
    const text = String(msg);
    if (!this.errors.includes(text)) this.errors.push(text);
    console.warn('[earth]', text);
  }

  /** Register a load so capture `goto` can wait for the view to be complete. */
  track(promise) {
    this.pending++;
    const done = () => {
      this.pending--;
      this.invalidate();
      if (this.pending === 0) {
        const w = this.idleWaiters;
        this.idleWaiters = [];
        w.forEach((fn) => fn());
      }
    };
    promise.then(done, done);
    return promise;
  }

  whenIdle() {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  updateCamera(dt) {
    const cam = this.camera;
    const dist = 1 + state.altKm / EARTH_RADIUS_KM;
    lonLatToVector(state.lon, state.lat, dist, cam.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    const surface = Math.max(0.0001, dist - 1);
    cam.near = Math.max(0.00002, surface * 0.2);
    cam.far = dist + 60;
    // Panel insets: shift the optical centre smoothly so the planet sits in the free part of the screen.
    const k = dt <= 0 ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const d = this.inset[side] - this.insetNow[side];
      if (Math.abs(d) > 0.5) {
        this.insetNow[side] += d * (state.capture || state.reducedMotion ? 1 : k);
        moving = true;
      } else this.insetNow[side] = this.inset[side];
    }
    if (moving) this.invalidate();
    const ox = (this.insetNow.right - this.insetNow.left) / 2;
    const oy = (this.insetNow.bottom - this.insetNow.top) / 2;
    if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) cam.setViewOffset(this.width, this.height, ox, oy, this.width, this.height);
    else if (cam.view) cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    // The sun rides with the camera, up and to the left, so the face you look at is always lit.
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const back = new THREE.Vector3();
    cam.matrixWorld.extractBasis(right, up, back);
    this.sunDir.copy(back).multiplyScalar(0.78).addScaledVector(right, -0.52).addScaledVector(up, 0.36).normalize();
  }

  update(dt) {
    this.updateCamera(dt);
    const env = environment(state.y);
    this.env = env;
    const eu = this.earth.uniforms;
    eu.uClock.value = this.clock;
    eu.uSunDir.value.copy(this.sunDir);
    eu.uCamPos.value.copy(this.camera.position);
    const atmo = atmosphere(env);
    eu.uAtmo.value.set(atmo.color[0], atmo.color[1], atmo.color[2]);
    eu.uAtmoAmt.value = atmo.amount;
    this.cosmos.update(env, this.camera);
    this.earth.update(env);
    this.plates.update(env);
    this.atmosphere.update(env, state.altKm, this.cloudScale);
    for (const layer of this.layers) layer.update(env, dt, this);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  /** Render exactly one frame right now (capture contract). */
  renderOnce() {
    this.update(0);
    this.render();
    this.dirty = false;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dtMs = Math.min(100, now - this.lastT);
    this.lastT = now;
    if (document.hidden) return;
    if (!this.clockFrozen) this.clock += dtMs / 1000;
    // Ambient motion keeps the scene alive, so frames are drawn continuously unless the clock is frozen.
    if (this.clockFrozen && !this.dirty) return;
    this.dirty = false;
    this.update(dtMs / 1000);
    this.render();
    // Frame-time tracking for the fps log and automatic quality scaling.
    this.frameMs += (dtMs - this.frameMs) * 0.05;
    this.fps = 1000 / this.frameMs;
    if (!this.clockFrozen && this.frames > 90 && this.frames % 60 === 0) {
      if (this.frameMs > 30 && !this.downgradedAt) {
        this.slowCount = (this.slowCount || 0) + 1;
        if (this.slowCount >= 2) {
          this.downgrade();
          this.slowCount = 0;
          this.downgradedAt = this.frames;
        }
      } else this.slowCount = 0;
      if (this.downgradedAt && this.frames - this.downgradedAt > 600) this.downgradedAt = 0;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Geometry helpers shared by controls, pins and labels
  // ------------------------------------------------------------------------------------------

  /** Screen position (CSS px) of a unit-sphere point, or null when it is behind the limb. */
  project(v, out = { x: 0, y: 0, visible: false, facing: 0 }) {
    const cam = this.camera;
    const dist = cam.position.length();
    const facing = (v.x * cam.position.x + v.y * cam.position.y + v.z * cam.position.z) / dist;
    out.facing = facing;
    // Visible cap: the point faces the camera beyond the horizon angle.
    if (facing < 1 / dist) {
      out.visible = false;
      return out;
    }
    const p = _v.copy(v).project(cam);
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    out.visible = p.z < 1 && out.x > -40 && out.x < this.width + 40 && out.y > -40 && out.y < this.height + 40;
    return out;
  }

  /** Lon/lat under a screen point, or null if the ray misses the globe. */
  pick(x, y) {
    const ndc = new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    _ray.setFromCamera(ndc, this.camera);
    const hit = _ray.ray.intersectSphere(_unit, _v2);
    return hit ? vectorToLonLat(hit) : null;
  }

  /** Degrees of arc covered by one CSS pixel at the centre of the view. */
  degreesPerPixel() {
    const h = state.altKm / EARTH_RADIUS_KM;
    const perPx = (2 * Math.tan((this.camera.fov * D2R) / 2)) / this.height;
    return Math.min(0.35, (perPx * h) / D2R);
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _unit = new THREE.Sphere(new THREE.Vector3(), 1);
