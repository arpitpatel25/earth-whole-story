// Spinning and zooming the globe. These handlers only ever call setPlace: place never moves time.
import { state, setPlace, MIN_ALT, MAX_ALT, normLon } from '../core/store.js';

export class Controls {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;
    this.pointers = new Map();
    this.vel = { lon: 0, lat: 0 };
    this.drag = null;
    this.fly = null;
    this.targetAlt = null;
    this.onTap = null; // (x, y) => void, set by the app for picking
    this.onHover = null;
    this.wheelMode = () => 'zoom'; // the story engine switches this to 'scroll'
    this.maxAlt = MAX_ALT;
    this.enabled = true;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this.dbl(e));
    canvas.addEventListener('keydown', (e) => this.key(e));
    engine.addLayer(this);
  }

  cancelFly() {
    if (this.fly) {
      const f = this.fly;
      this.fly = null;
      f.resolve(false);
    }
  }

  down(e) {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.cancelFly();
    this.targetAlt = null;
    this.vel.lon = this.vel.lat = 0;
    if (this.pointers.size === 1) {
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), alt: state.altKm };
      this.drag = null;
    }
  }

  move(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (!this.pointers.has(e.pointerId)) {
      if (this.onHover) this.onHover(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) setPlace({ altKm: Math.min(this.maxAlt, Math.max(MIN_ALT, this.pinch.alt * (this.pinch.d / d))) }, 'user-place');
      return;
    }
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const k = this.engine.degreesPerPixel();
    const cosLat = Math.max(0.2, Math.cos((state.lat * Math.PI) / 180));
    const dLon = (-dx * k) / cosLat;
    const dLat = dy * k;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    // velocity in degrees per second, lightly smoothed, for the release fling
    this.vel.lon = this.vel.lon * 0.5 + ((dLon / dt) * 1000) * 0.5;
    this.vel.lat = this.vel.lat * 0.5 + ((dLat / dt) * 1000) * 0.5;
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = now;
    setPlace({ lon: state.lon + dLon, lat: state.lat + dLat }, 'user-place');
  }

  up(e) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    if (had && d && this.pointers.size === 0) {
      this.drag = null;
      if (!d.moved) {
        this.vel.lon = this.vel.lat = 0;
        const rect = this.canvas.getBoundingClientRect();
        if (this.onTap) this.onTap(e.clientX - rect.left, e.clientY - rect.top, e);
      } else if (performance.now() - d.t > 80 || state.reducedMotion || state.capture) {
        this.vel.lon = this.vel.lat = 0; // the pointer rested before release: no fling
      }
    }
  }

  wheel(e) {
    if (!this.enabled) return;
    const mode = this.wheelMode(e);
    if (mode === 'scroll') return; // let the page scroll (stories)
    e.preventDefault();
    this.cancelFly();
    const unit = e.deltaMode === 1 ? 16 : 1;
    const base = this.targetAlt ?? state.altKm;
    const pinchBoost = e.ctrlKey ? 4 : 1;
    this.targetAlt = Math.min(this.maxAlt, Math.max(MIN_ALT, base * Math.exp(e.deltaY * unit * 0.0016 * pinchBoost)));
    this.engine.invalidate();
  }

  dbl(e) {
    if (!this.enabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const hit = this.engine.pick(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) this.flyTo({ lat: hit.lat, lon: hit.lon, altKm: Math.max(MIN_ALT, state.altKm * 0.45) }, 600);
  }

  key(e) {
    // The globe owns WASD and +/-; arrow keys belong to the timeline.
    const k = this.engine.degreesPerPixel() * 60;
    const cosLat = Math.max(0.2, Math.cos((state.lat * Math.PI) / 180));
    let used = true;
    if (e.key === 'a' || e.key === 'A') setPlace({ lon: state.lon - k / cosLat }, 'user-place');
    else if (e.key === 'd' || e.key === 'D') setPlace({ lon: state.lon + k / cosLat }, 'user-place');
    else if (e.key === 'w' || e.key === 'W') setPlace({ lat: state.lat + k }, 'user-place');
    else if (e.key === 's' || e.key === 'S') setPlace({ lat: state.lat - k }, 'user-place');
    else if (e.key === '+' || e.key === '=') this.zoomBy(0.7);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 0.7);
    else used = false;
    if (used) e.preventDefault();
  }

  zoomBy(factor) {
    this.cancelFly();
    const base = this.targetAlt ?? state.altKm;
    this.targetAlt = Math.min(this.maxAlt, Math.max(MIN_ALT, base * factor));
    this.engine.invalidate();
  }

  /** Animate the camera only. Resolves true when it arrives, false if the user interrupts. */
  flyTo(place, ms = 1400) {
    this.cancelFly();
    this.targetAlt = null;
    this.vel.lon = this.vel.lat = 0;
    const to = {
      lat: place.lat ?? state.lat,
      lon: place.lon ?? state.lon,
      altKm: Math.min(this.maxAlt, Math.max(MIN_ALT, place.altKm ?? state.altKm)),
    };
    if (state.capture || state.reducedMotion || ms <= 0) {
      setPlace(to, 'fly');
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let dLon = normLon(to.lon - state.lon);
      const from = { lat: state.lat, lon: state.lon, altKm: state.altKm };
      // Long hops rise first so the planet reads as a globe on the way over.
      const arc = Math.hypot(dLon * Math.cos((from.lat * Math.PI) / 180), to.lat - from.lat);
      const lift = Math.min(18000, arc * 160);
      this.fly = { from, to, dLon, lift, t: 0, ms, resolve };
      this.engine.invalidate();
    });
  }

  update(env, dt) {
    if (this.fly) {
      const f = this.fly;
      f.t += dt * 1000;
      const u = Math.min(1, f.t / f.ms);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // easeInOutCubic
      const la = Math.log(f.from.altKm) + (Math.log(f.to.altKm) - Math.log(f.from.altKm)) * e;
      const hump = Math.sin(Math.PI * u) * f.lift;
      setPlace({ lat: f.from.lat + (f.to.lat - f.from.lat) * e, lon: f.from.lon + f.dLon * e, altKm: Math.min(this.maxAlt, Math.exp(la) + hump * (f.from.altKm < 12000 ? 1 : 0.3)) }, 'fly');
      if (u >= 1) {
        this.fly = null;
        f.resolve(true);
      }
      this.engine.invalidate();
      return;
    }
    if (this.targetAlt != null) {
      const cur = state.altKm;
      const k = state.reducedMotion || state.capture ? 1 : 1 - Math.exp(-dt * 12);
      const next = Math.exp(Math.log(cur) + (Math.log(this.targetAlt) - Math.log(cur)) * k);
      if (Math.abs(next - this.targetAlt) < this.targetAlt * 0.002) {
        setPlace({ altKm: this.targetAlt }, 'user-place');
        this.targetAlt = null;
      } else setPlace({ altKm: next }, 'user-place');
      this.engine.invalidate();
    }
    // Fling after release: spin eases out. Place only; the date is untouched.
    if (!this.drag && !this.pinch && (Math.abs(this.vel.lon) > 0.02 || Math.abs(this.vel.lat) > 0.02) && dt > 0) {
      setPlace({ lon: state.lon + this.vel.lon * dt, lat: state.lat + this.vel.lat * dt }, 'user-place');
      const decay = Math.exp(-dt * 3.2);
      this.vel.lon *= decay;
      this.vel.lat *= decay;
      this.engine.invalidate();
    }
  }
}
