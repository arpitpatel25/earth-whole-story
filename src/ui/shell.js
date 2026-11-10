// The interface shell: everything that floats above the globe, and the glue between the layers.
import { state, setUI, setPlace, on } from '../core/store.js';
import { h, icon, ICONS, clear, announce } from './dom.js';
import { Intro } from './intro.js';
import { EventStore } from '../data/events.js';
import { Geo } from '../data/context.js';
import { Pins } from '../globe/pins.js';
import { Territories } from '../globe/territories.js';
import { Labels } from '../globe/labels.js';
import { HerePanel } from './here.js';
import { DeepPanel, automatedView } from './deep.js';
import { Search } from './search.js';
import { fetchJSON } from '../data/net.js';
import { NOW } from '../core/time.js';
import introBeats from '../../content/intro.json';
import lenses from '../../content/lenses.json';

export async function initShell(app, { eras }) {
  const ui = document.getElementById('ui');
  const engine = app.engine;
  app.eras = eras;
  app.lenses = lenses;
  app.lensById = Object.fromEntries([...lenses.human, ...lenses.deep].map((l) => [l.id, l]));
  app.eraAt = (y) => {
    let best = null;
    for (const e of eras) {
      if (y < e.start || y > e.end) continue;
      if (!best || e.level > best.level || (e.level === best.level && e.end - e.start < best.end - best.start)) best = e;
    }
    return best;
  };

  // ---- data and globe layers ----
  app.events = new EventStore(engine);
  app.geo = new Geo(engine);
  app.territories = new Territories(engine);
  app.pins = new Pins(engine, app.events, lenses);
  app.labels = new Labels(engine, app.territories, engine.plates);
  app.records = new Map(); // id -> async () => deep-view model (curated content registers here)
  app.countryName = (id) => {
    const c = app.geo.countries && app.geo.countries.find((f) => f.id === id);
    return c ? c.name : app.countryNames ? app.countryNames[id] : null;
  };
  fetchJSON('data/geo/country-index.json').then((rows) => {
    app.countryNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
    app.countryIndex = rows;
  }).catch(() => {});

  // ---- top bar ----
  const search = new Search(app);
  app.search = search;
  app.timeline.resolveName = (text) => search.resolveName(text);
  const lensBtn = h('button.btn.lens-btn', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', onclick: () => toggleLensMenu() }, h('i.lens-dot'), h('span.lens-name', 'All lenses'), icon(ICONS.chevronDown, 16));
  const lensMenu = h('div.panel.lens-menu', { hidden: true, role: 'listbox', 'aria-label': 'Choose a lens', dataset: { keys: 'own' } });
  const levelSwitch = h('div.level', { role: 'group', 'aria-label': 'Reading level' },
    h('button', { type: 'button', 'aria-pressed': 'true', dataset: { level: 'explorer' }, onclick: () => setUI({ level: 'explorer' }, 'ui') }, 'Explorer'),
    h('button', { type: 'button', 'aria-pressed': 'false', dataset: { level: 'kid' }, onclick: () => setUI({ level: 'kid' }, 'ui') }, 'Kid'));
  const tools = h('div.tools', { id: 'tools' });
  // On a phone the tools fold into one menu, so the bar never runs off the screen.
  const menuBtn = h('button.btn.menu-btn', { type: 'button', 'aria-label': 'More tools', 'aria-expanded': 'false', 'aria-controls': 'tools', onclick: () => toggleTools() }, icon(ICONS.menu, 18));
  function toggleTools(open = document.documentElement.dataset.tools !== 'open') {
    if (open) document.documentElement.dataset.tools = 'open';
    else delete document.documentElement.dataset.tools;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  tools.addEventListener('click', () => toggleTools(false));
  document.addEventListener('pointerdown', (e) => {
    if (document.documentElement.dataset.tools === 'open' && !tools.contains(e.target) && !menuBtn.contains(e.target)) toggleTools(false);
  });
  tools.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.documentElement.dataset.tools === 'open') { toggleTools(false); menuBtn.focus(); }
  });
  const bar = h('header.topbar',
    h('a.wordmark', { href: './', 'aria-label': 'EARTH: The Whole Story. Start again from the beginning.' }, h('span.wordmark-name', 'Earth'), h('span.wordmark-tag', 'the whole story')),
    search.el,
    h('div.lens-wrap', lensBtn, lensMenu),
    tools,
    menuBtn,
    levelSwitch);
  ui.append(bar);
  app.topbar = bar;
  app.tools = tools;

  const deepTime = () => state.y < -3.3e6;
  function lensList() {
    return deepTime() ? lenses.deep : lenses.human;
  }
  function renderLensMenu() {
    clear(lensMenu);
    const kid = state.level === 'kid';
    const opt = (id, name, color, about) =>
      h('button.lens-opt', { type: 'button', role: 'option', 'aria-selected': String(state.lens === id), onclick: () => { setUI({ lens: id }, 'ui'); toggleLensMenu(false); lensBtn.focus(); } },
        h('i.lens-dot', { style: { background: color } }), h('span', h('strong', name), about ? h('em', about) : null));
    lensMenu.append(opt('all', kid ? 'Everything' : 'All lenses', 'var(--chalk)', 'Everything at once'));
    for (const l of lensList()) lensMenu.append(opt(l.id, kid ? l.kid : l.name, l.color, l.about));
  }
  function toggleLensMenu(open = lensMenu.hidden) {
    lensMenu.hidden = !open;
    lensBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      renderLensMenu();
      const sel = lensMenu.querySelector('[aria-selected="true"]') || lensMenu.firstChild;
      sel.focus();
    }
  }
  lensMenu.addEventListener('keydown', (e) => {
    const opts = [...lensMenu.querySelectorAll('.lens-opt')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length].focus(); }
    else if (e.key === 'Escape') { toggleLensMenu(false); lensBtn.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!lensMenu.hidden && !lensMenu.contains(e.target) && !lensBtn.contains(e.target)) toggleLensMenu(false);
  });
  function syncLens() {
    // a lens that does not exist in this stretch of time falls back to everything
    if (state.lens !== 'all' && !lensList().some((l) => l.id === state.lens)) {
      setUI({ lens: 'all' }, 'lens-era');
      return;
    }
    const l = app.lensById[state.lens];
    const kid = state.level === 'kid';
    lensBtn.querySelector('.lens-name').textContent = l ? (kid ? l.kid : l.short) : kid ? 'Everything' : 'All lenses';
    lensBtn.querySelector('.lens-dot').style.background = l ? l.color : 'var(--chalk)';
    document.documentElement.style.setProperty('--lens', l ? l.color : 'var(--chalk)');
    document.documentElement.dataset.lens = state.lens;
  }
  on(['lens', 'level'], syncLens);
  let wasDeep = deepTime();
  on(['y'], () => {
    if (deepTime() !== wasDeep) {
      wasDeep = deepTime();
      syncLens();
    }
  });
  on(['level'], () => {
    document.documentElement.dataset.level = state.level;
    for (const b of document.querySelectorAll('.level button')) b.setAttribute('aria-pressed', String(b.dataset.level === state.level));
    announce(state.level === 'kid' ? 'Kid mode on' : 'Explorer mode on');
  });
  document.documentElement.dataset.level = state.level;
  for (const b of levelSwitch.children) b.setAttribute('aria-pressed', String(b.dataset.level === state.level));
  syncLens();

  // ---- panels ----
  app.layout = () => {
    const wide = innerWidth > 900;
    const tl = app.timeline.root.offsetHeight;
    const left = wide && app.here && app.here.open && !state.intro && !state.story ? app.here.el.offsetWidth + 16 : 0;
    const right = wide && state.event ? app.deep.el.offsetWidth + 16 : 0;
    const storyLeft = wide && state.story ? Math.min(520, innerWidth * 0.38) : 0;
    engine.setInset({ left: left + storyLeft, right, bottom: state.intro ? innerHeight * 0.28 : tl * 0.55 + (!wide && state.event ? innerHeight * 0.3 : 0), top: 0 }); // in the intro the words sit low, so the picture sits high
    document.documentElement.style.setProperty('--tl-h', `${tl}px`);
  };
  app.here = new HerePanel(app);
  app.deep = new DeepPanel(app);
  // Bring every DOM overlay in line with the frame just rendered (used by the capture contract).
  app.syncOverlays = () => {
    app.here.render();
    app.labels.key = '';
    app.labels.update(engine.env);
    app.timeline.draw();
  };
  addEventListener('resize', app.layout);
  on(['intro', 'story', 'event'], () => app.layout());

  // ---- records ----
  app.resolveRecord = async (id) => {
    const curated = () => {
      if (app.records.has(id)) return app.records.get(id)();
      for (const [prefix, fn] of app.recordPrefixes || []) if (id.startsWith(prefix)) return fn(id);
      return undefined;
    };
    let view = curated();
    if (view !== undefined) return view;
    // A link can name a record that a later-loading part of the site provides (India in depth, a 3D scene, a
    // country): wait for those parts before deciding that the record is an automatic one, or missing.
    if (app.featuresReady) {
      await app.featuresReady;
      view = curated();
      if (view !== undefined) return view;
    }
    await app.events.ready;
    const e = await app.events.locate(id);
    return e ? automatedView(app, e) : null;
  };
  app.recordPrefixes = [];
  const paleoPlace = (e, y) => {
    const ma = (NOW - y) / 1e6;
    const pl = engine.plates;
    if (ma < 2 || !pl || !pl.ready || ma > pl.meta.maxMa) return e;
    return pl.reconstructNear(e.lon, e.lat, ma) || e;
  };
  app.openEvent = async (id, { fly = false, time = false } = {}) => {
    let e = app.events.get(id);
    if (!e && (fly || time)) e = await app.events.locate(id);
    if (e) {
      if (time) app.timeline.jumpTo(e.y, { res: e.precision === 'exact' ? 1 / 365 : e.precision === 'month' ? 1 / 12 : e.precision === 'century' ? 25 : e.precision === 'decade' ? 4 : undefined });
      if (fly) {
        // in deep time a place is flown to where its plate lay at that moment
        const at = paleoPlace(e, time ? e.y : state.y);
        app.controls.flyTo({ lat: at.lat, lon: at.lon, altKm: Math.min(state.altKm, e.altKm || 3200) });
      }
    }
    setUI({ event: id }, 'ui');
  };

  // ---- pins: hover names and clicks ----
  const tip = h('div.tip', { hidden: true, 'aria-hidden': 'true' });
  ui.append(tip);
  const canvas = engine.canvas;
  app.controls.onHover = (x, y) => {
    const e = state.intro ? null : app.pins.pick(x, y);
    app.pins.setHover(e ? e.id : null);
    canvas.classList.toggle('pin-hover', !!e);
    if (e) {
      tip.textContent = e.title;
      tip.hidden = false;
      tip.style.transform = `translate3d(${Math.round(x + 14)}px, ${Math.round(y - 10)}px, 0)`;
    } else tip.hidden = true;
  };
  canvas.addEventListener('pointerleave', () => {
    tip.hidden = true;
    app.pins.setHover(null);
  });
  app.controls.onTap = (x, y) => {
    if (state.intro) return;
    const e = app.pins.pick(x, y, 22);
    if (e) {
      if (e.onOpen) e.onOpen();
      else app.openEvent(e.id);
    }
  };

  // timeline density and the "local events" ticks
  fetchJSON('data/events/density.json').then((d) => app.timeline.setDensity(d.v)).catch(() => {});
  app.timeline.localEvents = () => app.pins.visible.map((e) => e.y);

  if (state.intro) {
    app.intro = new Intro(app, introBeats);
    app.intro.onDone = () => app.layout();
    app.intro.start();
  }
  app.layout();

  // Everything else (stories, trails, India, sound, share, discovery) loads after the first frame.
  const more = import('./features.js').then((m) => m.initFeatures(app)).catch((e) => engine.reportError(`features failed to load: ${e.message}`));
  app.featuresReady = more;
  // a link that names a record opens it (the panel waits for whichever part of the site provides that record)
  if (state.event) app.deep.sync();
  if (state.capture || state.story || state.event) await more;
}

export { setPlace };
