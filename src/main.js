// EARTH: The Whole Story — entry point.
import './styles/index.css';
import { state, setTime, setPlace, setUI, on } from './core/store.js';
import { NOW, BIG_BANG } from './core/time.js';
import { readURL, applyURL, startURLSync } from './core/url.js';
import { installCapture } from './core/capture.js';
import { setModel } from './globe/epoch.js';
import { Engine } from './globe/engine.js';
import { Controls } from './globe/controls.js';
import { Timeline } from './ui/timeline.js';
import { h, icon, announce } from './ui/dom.js';
import { installMusic } from './audio/music.js';
import { memory } from './core/memory.js';
import eras from './generated/eras.json';

const app = { isReady: false };
window.__earth = app; // for debugging and tests; not part of the capture contract

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

function showFallback() {
  document.documentElement.dataset.fallback = '1';
  const list = eras.filter((e) => e.level === 0);
  document.getElementById('ui').append(
    h('main.fallback',
      h('h1', 'EARTH: The Whole Story'),
      h('p.fallback-lead', 'This device or browser cannot draw the 3D globe (WebGL 2 is switched off or unavailable), so here is the timeline as text.'),
      h('ol.fallback-list', list.map((e) => h('li', h('span.fallback-band', { style: { background: e.color } }), h('strong', e.name), e.summary ? h('p', e.summary) : null))),
      h('p.fallback-help', 'To see the globe, try a current version of Chrome, Firefox, Safari or Edge, and check that hardware acceleration is turned on.')),
  );
}

async function boot() {
  const url = readURL();
  const capture = !!url.capture;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  setUI({ capture, reducedMotion: reduced }, 'boot');
  if (capture) document.documentElement.dataset.capture = '1';

  if (!webglAvailable()) {
    showFallback();
    window.__earthCapture = {
      goto: async () => window.__earthCapture.status(),
      setClock() {},
      renderFrame: async () => {},
      status: () => ({ ready: true, year: state.y, lat: state.lat, lon: state.lon, altKm: state.altKm, lens: state.lens, story: state.story, step: state.step, errors: ['WebGL 2 unavailable: text fallback shown'] }),
    };
    return;
  }

  const canvas = document.getElementById('globe');
  const engine = new Engine(canvas);
  app.engine = engine;
  document.documentElement.dataset.quality = engine.quality;
  if (capture) engine.clockFrozen = true;

  const controls = new Controls(engine, canvas);
  app.controls = controls;

  const ui = document.getElementById('ui');
  const tlRoot = h('div');
  ui.append(tlRoot);
  const timeline = new Timeline(tlRoot, { eras });
  app.timeline = timeline;
  // Keep the planet centred in the part of the screen the timeline leaves free.
  const fitInset = () => engine.setInset({ bottom: state.intro ? 0 : tlRoot.offsetHeight * 0.55 });
  fitInset();
  addEventListener('resize', fitInset);
  on(['intro'], fitInset);

  // Where to start: a link wins; otherwise a returning visitor resumes; a first visit opens at the Big Bang.
  const saved = memory.lastView();
  if (url.has) {
    applyURL(url);
    if (url.y === undefined) setTime(NOW, 'link');
  } else if (capture) {
    setTime(NOW, 'boot');
    setPlace({ lat: 20, lon: 20, altKm: 22000 }, 'boot');
  } else {
    setTime(BIG_BANG, 'boot');
    setPlace({ lat: 18, lon: 30, altKm: 22000 }, 'boot');
    setUI({ intro: true }, 'boot');
  }
  app.saved = saved;

  installCapture(app);
  startURLSync();
  memory.start();
  // Music is part of the first view: it has to be ready to start at the visitor's very first interaction.
  installMusic(app, { h, icon, announce });

  // The Earth model (sea level, ice keyframes, climate tables) streams in behind the first frame.
  const modelLoad = engine.track(
    fetch('data/earth/model.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`model.json HTTP ${r.status}`))))
      .then((m) => {
        setModel(m);
        engine.iceIndex = m.ice || null;
        engine.invalidate();
      })
      .catch((e) => engine.reportError(`earth model failed to load: ${e.message}`)),
  );

  const { initShell } = await import('./ui/shell.js');
  await initShell(app, { eras });

  app.isReady = true;
  app.readyResolve();
  await modelLoad;
}

app.ready = new Promise((r) => (app.readyResolve = r));
boot().catch((e) => {
  console.error(e);
  if (app.engine) app.engine.reportError(`boot failed: ${e.message}`);
  app.readyResolve();
});

export { app, on };
