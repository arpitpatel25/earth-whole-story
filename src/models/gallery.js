// The 3D scenes: a gallery sheet and a viewer in which a model can be turned, zoomed and read part by part.
import * as THREE from 'three';
import { state, on, setUI, MAX_ALT } from '../core/store.js';
import { h, icon, ICONS, clear, announce } from '../ui/dom.js';
import { formatEventDate } from '../core/time.js';
import { sourceLine } from '../ui/here.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeKit } from './kit.js';
import { DEFS } from './defs.js';

const HILITE = new THREE.Color('#ffd23f');

class Viewer {
  constructor(app) {
    this.app = app;
    this.canvas = h('canvas.mv-canvas', { role: 'img', tabindex: 0 });
    this.dots = h('div.mv-dots');
    this.hint = h('p.mv-hint');
    this.playBtn = h('button.btn.mv-play', { type: 'button', hidden: true, onclick: () => this.togglePlay() });
    this.resetBtn = h('button.btn', { type: 'button', onclick: () => this.resetView(true) }, 'Reset view');
    this.stage = h('div.mv-stage', this.canvas, this.dots, h('div.mv-tools', this.playBtn, this.resetBtn), this.hint);
    this.panel = h('aside.mv-panel', { tabindex: -1 });
    this.el = h('section.mv', { role: 'dialog', 'aria-modal': 'true', hidden: true, dataset: { keys: 'own' } }, this.stage, this.panel);
    document.getElementById('ui').append(this.el);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    });
    on(['level'], () => { if (this.model) this.renderPanel(); });
    this.bindControls();
  }

  // ---- scene ----
  setup() {
    if (this.renderer) return;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    this.hemi = new THREE.HemisphereLight('#dfeaff', '#3b3026', 1.0);
    this.key = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.fill = new THREE.DirectionalLight('#9fc3ff', 0.55);
    this.rim = new THREE.DirectionalLight('#ffffff', 0.9);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill, this.rim);
    // a soft studio environment so that metals have something to reflect
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.raycaster = new THREE.Raycaster();
    this.kit = makeKit();
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  resize() {
    if (!this.renderer || this.el.hidden) return;
    const w = this.stage.clientWidth, hgt = this.stage.clientHeight;
    if (!w || !hgt) return;
    this.renderer.setSize(w, hgt, false);
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  build(model) {
    const def = DEFS[model.id];
    if (!def) throw new Error(`no geometry for ${model.id}`);
    if (this.root) { this.scene.remove(this.root); this.disposeTree(this.root); }
    if (this.ground) { this.scene.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.dispose(); this.ground = null; }
    const built = def(this.kit);
    this.built = built;
    this.root = built.root;
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.radius = sphere.radius;
    this.centre = sphere.center.clone();
    // parts: meshes, anchors and highlight materials
    this.parts = new Map();
    this.root.traverse((o) => {
      if (!o.userData.part) return;
      const meshes = [];
      o.traverse((m) => { if (m.isMesh) { m.userData.partId = o.userData.part; m.userData.base = m.material; meshes.push(m); } });
      const b = new THREE.Box3().setFromObject(o);
      this.parts.set(o.userData.part, { group: o, meshes, anchor: b.getCenter(new THREE.Vector3()), top: b.max.y });
    });
    this.root.traverse((o) => { if (o.userData.scale) o.traverse((m) => { m.userData.noPick = true; }); });
    // light rig scaled to the model
    const r = this.radius;
    const space = !!built.space;
    this.hemi.intensity = space ? 0.22 : built.sunlight ? 0.5 : 0.8;
    this.scene.environmentIntensity = space ? 0.3 : 0.5;
    this.key.intensity = space ? 3.4 : 2.6;
    this.key.position.copy(this.centre).add(new THREE.Vector3(r * 1.3, r * 2.3, r * 1.5));
    this.key.target.position.copy(this.centre);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -r * 1.5; sc.right = sc.top = r * 1.5; sc.near = r * 0.2; sc.far = r * 7;
    sc.updateProjectionMatrix();
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = r * 0.006;
    this.fill.position.copy(this.centre).add(new THREE.Vector3(-r * 2, r * 0.8, r * 0.6));
    this.rim.position.copy(this.centre).add(new THREE.Vector3(-r * 0.6, r * 1.4, -r * 2.2));
    // the plinth of light the model stands on
    if (built.ground !== false) {
      const y = typeof built.ground === 'number' ? built.ground : box.min.y;
      const g = new THREE.CircleGeometry(r * 3.2, 72);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshStandardMaterial({ color: '#16283b', roughness: 1, transparent: true, alphaMap: fadeTexture(), depthWrite: false });
      this.ground = new THREE.Mesh(g, m);
      this.ground.receiveShadow = true;
      this.ground.position.set(this.centre.x, y - r * 0.002, this.centre.z);
      this.ground.renderOrder = -1;
      this.scene.add(this.ground);
    }
    this.camera.near = r * 0.02;
    this.camera.far = r * 40;
    this.home = { az: (built.view && built.view.az) ?? 0.6, pol: (built.view && built.view.pol) ?? 1.2, dist: (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.12 * ((built.view && built.view.zoom) || 1) };
    this.resetView(false);
    this.t = 0;
    if (built.tick) built.tick(this.clockNow());
  }

  disposeTree(root) {
    root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.userData.hi) o.userData.hi.dispose(); } });
  }

  clockNow() {
    return state.capture ? (this.app.engine.clock || 0) : this.t;
  }

  resetView(animate) {
    const to = { ...this.home };
    if (animate && !state.reducedMotion && !state.capture) this.fly = { from: { az: this.az, pol: this.pol, dist: this.dist }, to, t: 0 };
    else Object.assign(this, to);
    this.vAz = this.vPol = 0;
    this.dirty = true;
  }

  placeCamera() {
    const sp = Math.sin(this.pol), cp = Math.cos(this.pol);
    this.camera.position.set(this.centre.x + this.dist * sp * Math.sin(this.az), this.centre.y + this.dist * cp, this.centre.z + this.dist * sp * Math.cos(this.az));
    this.camera.lookAt(this.centre);
  }

  frame(now) {
    if (this.el.hidden) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    const still = state.capture || state.reducedMotion;
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / 0.5);
      const e = 1 - Math.pow(1 - this.fly.t, 3);
      for (const k of ['az', 'pol', 'dist']) this[k] = this.fly.from[k] + (this.fly.to[k] - this.fly.from[k]) * e;
      if (this.fly.t >= 1) this.fly = null;
      this.dirty = true;
    }
    if (!this.dragging && (Math.abs(this.vAz) > 1e-4 || Math.abs(this.vPol) > 1e-4)) {
      this.az += this.vAz * dt; this.pol = clampPol(this.pol + this.vPol * dt);
      this.vAz *= Math.pow(0.02, dt); this.vPol *= Math.pow(0.02, dt);
      this.dirty = true;
    }
    if (this.idle && !still && !this.dragging) { this.az += dt * 0.12; this.dirty = true; }
    if (this.built.tick && this.playing && !still) { this.t += dt; this.built.tick(this.t); this.dirty = true; }
    if (this.dirty) this.render();
  }

  render() {
    this.dirty = false;
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
    this.placeDots();
  }

  placeDots() {
    const w = this.stage.clientWidth, hgt = this.stage.clientHeight;
    const v = new THREE.Vector3();
    for (const [id, btn] of this.dotEls || []) {
      const p = this.parts.get(id);
      if (!p) continue;
      if (this.built.tick) { p.group.updateMatrixWorld(true); new THREE.Box3().setFromObject(p.group).getCenter(p.anchor); }
      v.copy(p.anchor).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * hgt;
      btn.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      btn.hidden = v.z > 1;
    }
  }

  // ---- interaction ----
  bindControls() {
    const c = this.canvas;
    const pointers = new Map();
    let moved = 0, pinch = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true; this.idle = false; this.fly = null; moved = 0;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    c.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) { this.hover(e); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoomBy(pinch / d);
        pinch = d;
      } else {
        moved += Math.abs(dx) + Math.abs(dy);
        this.az -= dx * 0.008; this.pol = clampPol(this.pol - dy * 0.006);
        this.vAz = -dx * 0.45; this.vPol = -dy * 0.3;
      }
      this.dirty = true;
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!pointers.size) { this.dragging = false; if (moved < 6) { this.vAz = this.vPol = 0; this.pick(e); } }
      pinch = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.idle = false; this.zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    c.addEventListener('dblclick', () => this.resetView(true));
    c.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.3 : 0.12;
      if (e.key === 'ArrowLeft') this.az -= step; else if (e.key === 'ArrowRight') this.az += step;
      else if (e.key === 'ArrowUp') this.pol = clampPol(this.pol - step); else if (e.key === 'ArrowDown') this.pol = clampPol(this.pol + step);
      else if (e.key === '+' || e.key === '=') this.zoomBy(0.88); else if (e.key === '-') this.zoomBy(1.14);
      else return;
      e.preventDefault(); this.idle = false; this.dirty = true;
    });
  }

  zoomBy(f) {
    this.dist = Math.max(this.home.dist * 0.22, Math.min(this.home.dist * 2.2, this.dist * f));
    this.dirty = true;
  }

  partAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObject(this.root, true)) {
      if (hit.object.userData.noPick) continue;
      if (hit.object.userData.partId) return hit.object.userData.partId;
      return null; // an unlabelled piece in front hides what is behind it
    }
    return null;
  }

  hover(e) {
    const id = this.partAt(e);
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.paint();
  }

  pick(e) {
    const id = this.partAt(e);
    if (id) this.select(id);
  }

  paint() {
    for (const [id, p] of this.parts) {
      const level = id === this.selected ? 0.34 : id === this.hoverId ? 0.16 : 0;
      for (const m of p.meshes) {
        if (!level) { m.material = m.userData.base; continue; }
        if (!m.userData.hi) { m.userData.hi = m.userData.base.clone(); }
        const hi = m.userData.hi;
        hi.emissive.copy(HILITE);
        hi.emissiveIntensity = level;
        m.material = hi;
      }
    }
    this.dirty = true;
  }

  select(id, { focus = false } = {}) {
    this.selected = id;
    this.idle = false;
    this.paint();
    for (const [pid, btn] of this.dotEls) btn.setAttribute('aria-pressed', String(pid === id));
    for (const b of this.panel.querySelectorAll('.mv-parts button')) b.setAttribute('aria-pressed', String(b.dataset.part === id));
    this.renderPart();
    const part = this.model.parts.find((p) => p.id === id);
    if (part) announce(`${part.name}`);
    if (focus) { const t = this.panel.querySelector('.mv-part'); if (t) t.scrollIntoView({ block: 'nearest' }); }
  }

  togglePlay(force) {
    this.playing = force ?? !this.playing;
    clear(this.playBtn).append(this.playing ? 'Pause' : 'Play');
    this.playBtn.setAttribute('aria-pressed', String(this.playing));
  }

  // ---- panel ----
  renderPanel() {
    const m = this.model, kid = state.level === 'kid', app = this.app;
    const when = m.y != null ? formatEventDate(m.y, m.end, m.precision || 'year') : null;
    this.el.setAttribute('aria-label', `${m.title}, a 3D scene`);
    this.canvas.setAttribute('aria-label', `3D model: ${m.title}. Use the arrow keys to turn it and the list of parts to read about it.`);
    clear(this.hint).append(kid ? 'Drag to turn it. Pinch or scroll to zoom. Tap a number.' : 'Drag to turn. Scroll or pinch to zoom. Select a numbered part.');
    this.partBox = h('div.mv-part', { 'aria-live': 'polite' });
    clear(this.panel).append(
      h('button.icon-btn.mv-close', { type: 'button', 'aria-label': 'Close the 3D scene', title: 'Close (Esc)', onclick: () => this.close() }, icon(ICONS.close, 18)),
      h('p.mv-kicker', [when, '3D scene'].filter(Boolean).join(', ')),
      h('h2.mv-title', (kid && m.kidTitle) || m.title),
      h('p.mv-lead', kid ? m.kidSummary : m.summary),
      h('ol.mv-parts', m.parts.map((p, i) => h('li', h('button', { type: 'button', dataset: { part: p.id }, 'aria-pressed': String(p.id === this.selected), onclick: () => this.select(p.id, { focus: true }) }, h('b', String(i + 1)), h('span', kid ? p.kidName : p.name))))),
      this.partBox,
      h('p.mv-note', m.note),
      sourceLine(m.sources),
      h('div.mv-actions',
        m.y != null ? h('button.btn', { type: 'button', onclick: () => { this.close(); app.openEvent(`model:${m.id}`, { fly: true, time: true }); } }, icon(ICONS.pin, 16), kid ? 'Show me when and where' : 'Go to its time and place') : null,
        h('button.btn', { type: 'button', onclick: () => this.step(1) }, kid ? 'Next model' : 'Next scene', icon(ICONS.chevronRight, 16))));
    // numbered dots over the model
    clear(this.dots);
    this.dotEls = new Map();
    m.parts.forEach((p, i) => {
      const b = h('button.mv-dot', { type: 'button', 'aria-pressed': String(p.id === this.selected), 'aria-label': kid ? p.kidName : p.name, title: kid ? p.kidName : p.name, onclick: () => this.select(p.id, { focus: true }) }, String(i + 1));
      this.dotEls.set(p.id, b);
      this.dots.append(b);
    });
    this.renderPart();
    this.dirty = true;
  }

  renderPart() {
    if (!this.partBox) return;
    const kid = state.level === 'kid';
    const p = this.model.parts.find((x) => x.id === this.selected);
    clear(this.partBox);
    if (!p) { this.partBox.append(h('p.mv-empty', kid ? 'Tap a number on the model to find out what it is.' : 'Select a numbered part on the model, or in the list above, to read about it.')); return; }
    this.partBox.append(h('h3', kid ? p.kidName : p.name), h('p.mv-text', kid ? p.kid : p.text), sourceLine(p.sources));
  }

  step(d) {
    const list = this.app.modelList;
    const i = list.findIndex((m) => m.id === this.model.id);
    this.open(list[(i + d + list.length) % list.length].id);
  }

  // ---- open and close ----
  open(id, partId) {
    const model = this.app.models[id];
    if (!model) return;
    if (this.el.hidden) this.returnFocus = document.activeElement;
    this.el.hidden = false;
    document.documentElement.dataset.model = id;
    this.setup();
    this.model = model;
    this.selected = partId || null;
    this.hoverId = null;
    try {
      this.build(model);
    } catch (e) {
      this.app.engine.reportError(`3D scene ${id}: ${e.message}`);
      this.close();
      return;
    }
    this.idle = true;
    this.playing = !!this.built.animated;
    this.playBtn.hidden = !this.built.animated;
    if (this.built.animated) this.togglePlay(true);
    this.renderPanel();
    this.paint();
    this.resize();
    cancelAnimationFrame(this.raf);
    this.last = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!state.capture) this.panel.focus({ preventScroll: true });
    announce(`Opened the 3D scene: ${model.title}`);
  }

  /** Render one frame now (used by tests and the capture contract). */
  renderOnce() {
    if (this.el.hidden) return;
    if (this.built.tick) this.built.tick(this.clockNow());
    this.resize();
    this.render();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    delete document.documentElement.dataset.model;
    cancelAnimationFrame(this.raf);
    if (this.returnFocus && document.contains(this.returnFocus)) this.returnFocus.focus();
    this.app.engine.invalidate();
  }
}

const clampPol = (p) => Math.max(0.12, Math.min(Math.PI / 2 - 0.02, p));
let fade = null;
function fadeTexture() {
  if (fade) return fade;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.45, '#bbb'); grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  fade = new THREE.CanvasTexture(c);
  return fade;
}

export async function initModels(app, list, { Sheet }) {
  app.modelList = list;
  let viewer = null;
  app.openModel = (id, part) => {
    if (!viewer) viewer = app.modelViewer = new Viewer(app);
    for (const s of Sheet.all) s.close();
    viewer.open(id, part);
  };
  const kidMode = () => state.level === 'kid';
  const when = (m) => (m.y != null ? formatEventDate(m.y, m.end, m.precision || 'year') : '');

  // ---- gallery ----
  const sheet = new Sheet(app, { id: 'models', label: '3D', title: 'Explore in 3D', iconPath: ICONS.cube, wide: true });
  sheet.onOpen = () => {
    const kid = kidMode();
    clear(sheet.body).append(
      h('p.sheet-lead', kid ? 'Things you can pick up and turn around: bones, tools, temples, machines and rockets. Tap one, then tap its numbers.' : `${list.length} objects and places rebuilt in code from the dimensions in their sources. Turn them, zoom in, and select the numbered parts.`),
      h('ul.mgrid', list.map((m) => h('li', h('button.mcard', { type: 'button', style: { '--c': (app.lensById[m.lenses[0]] || {}).color || 'var(--marker)' }, onclick: () => app.openModel(m.id) },
        h('span.mcard-when', when(m)), h('strong', (kid && m.kidTitle) || m.title), h('em', `${m.parts.length} ${kid ? 'things to find' : 'labelled parts'}`))))));
  };
  on(['level'], () => { if (!sheet.el.hidden) sheet.onOpen(); });

  // ---- records, links and search ----
  app.recordPrefixes.push(['model:', (rid) => {
    const m = app.models[rid.slice(6)];
    if (!m) return null;
    const i = list.indexOf(m);
    const link = (x, tag) => ({ id: `model:${x.id}`, title: (kidMode() && x.kidTitle) || x.title, y: x.y, end: x.end, precision: x.precision, label: '3D scene', tag });
    return {
      id: rid, title: m.title, kidTitle: m.kidTitle, label: '3D scene', y: m.y, end: m.end, precision: m.precision, lat: m.lat, lon: m.lon, altKm: 2400,
      placeText: m.placeText || null, lenses: m.lenses, summary: m.summary, kidSummary: m.kidSummary, sources: m.sources, confidence: 'established', model: [m.id], notes: m.note,
      related: [list[(i - 1 + list.length) % list.length]].map((x) => link(x, 'the scene before')),
      consequences: [list[(i + 1) % list.length], list[(i + 2) % list.length]].map((x) => link(x, 'another 3D scene')),
      nextTitle: 'More to explore in 3D',
    };
  }]);
  const openBase = app.openEvent;
  app.openEvent = async (id, opts = {}) => {
    if (!id.startsWith('model:')) return openBase(id, opts);
    const m = app.models[id.slice(6)];
    if (m && opts.time && m.y != null) app.timeline.jumpTo(m.end != null ? (m.y + m.end) / 2 : m.y);
    if (m && opts.fly && m.lat != null) app.controls.flyTo({ lat: m.lat, lon: m.lon, altKm: 2400 });
    setUI({ event: id }, 'ui');
  };
  // Zoom all the way out and the next step is the Solar System: Earth's neighbourhood, kept secondary to Earth.
  if (app.models['solar-system']) {
    const out = h('button.btn.solar-btn', { type: 'button', hidden: true, onclick: () => app.openModel('solar-system') }, icon(ICONS.solar, 17), h('span', 'Further out: the Solar System'));
    document.getElementById('ui').append(out);
    const sync = () => { out.hidden = state.capture || state.intro || !!state.story || state.altKm < MAX_ALT * 0.93; };
    on(['altKm', 'intro', 'story'], sync);
    sync();
  }
  app.search.add(list.map((m) => ({ kind: 'model', title: m.title, alt: m.kidTitle, sub: `3D scene${m.y != null ? `, ${when(m)}` : ''}`, weight: 4.6, y: m.y, go: () => app.openModel(m.id) })));
  app.contentVersion++;
}
