// Features that load after the first frame: stories, trails, discovery, India in depth, 3D scenes,
// sound and sharing. Each registers itself with the shell (tools in the top bar, searchable items,
// deep-view records).
import { state, setUI, setTime, setPlace, on } from '../core/store.js';
import { h, icon, ICONS, clear } from './dom.js';
import { Overlays } from '../globe/overlays.js';
import { StoryPlayer } from '../story/story.js';
import { fetchJSON } from '../data/net.js';
import { memory } from '../core/memory.js';
import { renderChart } from './chart.js';
import { formatEventDate } from '../core/time.js';

const FORMAT_NAMES = { war: 'War', rivalry: 'Rivalry', spread: 'Spread', flow: 'Flow', 'rise-fall': 'Rise and fall', chain: 'Chain', 'deep-time': 'Deep time', 'daily-life': 'Daily life', biography: 'Biography' };

/** A panel that drops from a top-bar button. One open at a time. */
export class Sheet {
  constructor(app, { id, label, title, iconPath, wide }) {
    this.app = app;
    this.body = h('div.sheet-body');
    this.el = h(`section.panel.sheet${wide ? '.wide' : ''}`, { hidden: true, 'aria-label': title, dataset: { keys: 'own' }, tabindex: -1 },
      h('header.sheet-head', h('h2', title), h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, icon(ICONS.close, 18))),
      this.body);
    this.btn = h('button.btn.tool-btn', { type: 'button', 'aria-expanded': 'false', title, 'aria-label': label, dataset: { tool: id }, onclick: () => (this.el.hidden ? this.open() : this.close()) }, iconPath ? icon(iconPath, 17) : null, h('span', label));
    app.tools.append(this.btn);
    document.getElementById('ui').append(this.el);
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
        this.btn.focus();
      }
    });
    Sheet.all.push(this);
  }

  open() {
    for (const s of Sheet.all) if (s !== this) s.close();
    this.el.hidden = false;
    this.btn.setAttribute('aria-expanded', 'true');
    if (this.onOpen) this.onOpen();
    if (!state.capture) this.el.focus({ preventScroll: true });
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.btn.setAttribute('aria-expanded', 'false');
  }
}
Sheet.all = [];

export async function initFeatures(app) {
  const engine = app.engine;
  app.overlays = new Overlays(engine);
  app.renderChart = (spec) => renderChart(app, spec);
  app.manifest = await fetchJSON('data/curated/manifest.json').catch(() => ({}));
  app.charts = await fetchJSON('data/curated/charts.json').catch(() => ({}));
  app.contentVersion = 0;

  // ---- going somewhere from a link: a story, an event, an era, a trail, or a plain moment ----
  app.follow = async (t) => {
    const target = typeof t === 'string' ? t : t.target;
    if (!target) return;
    const [kind, ...rest] = target.split(':');
    const id = rest.join(':');
    if (kind === 'story') {
      const [sid, step] = id.split('@');
      await app.story.open(sid, Number(step) || 0);
    } else if (kind === 'era') {
      if (app.story.story) app.story.close();
      const era = app.eras.find((e) => e.id === id);
      if (era) {
        app.timeline.jumpToEra(era);
        if (era.lat != null) app.controls.flyTo({ lat: era.lat, lon: era.lon, altKm: 9000 });
        setUI({ event: `era:${id}` }, 'ui');
      }
    } else if (kind === 'trail' && app.trails) {
      if (app.story.story) app.story.close();
      app.trails.open(id);
    } else if (kind === 'go') {
      // go:y,lat,lon,alt
      if (app.story.story) app.story.close();
      const [y, lat, lon, alt] = id.split(',').map(Number);
      app.timeline.jumpTo(y);
      if (Number.isFinite(lat)) app.controls.flyTo({ lat, lon, altKm: alt || 4000 });
    } else {
      if (app.story.story) app.story.close();
      app.openEvent(target, { fly: true, time: true });
    }
  };

  // ---- eras open as deep views ----
  app.recordPrefixes.push(['era:', async (rid) => {
    const era = app.eras.find((e) => e.id === rid.slice(4));
    if (!era) return null;
    const kid = state.level === 'kid';
    const sameGroup = app.eras.filter((e) => e.group === era.group && e.level === era.level && e.id !== era.id).sort((a, b) => a.start - b.start);
    const later = sameGroup.filter((e) => e.start >= era.start).slice(0, 3);
    const groupOrder = app.eras.filter((e) => e.level === 0);
    const gi = groupOrder.findIndex((g) => g.id === (era.group || era.id));
    const nextGroup = !later.length && groupOrder[gi + 1] ? [groupOrder[gi + 1]] : [];
    const earlier = sameGroup.filter((e) => e.start < era.start).slice(-2);
    const link = (e, tag) => ({ id: `era:${e.id}`, title: (kid && e.kidName) || e.name, y: e.start, precision: 'approx', tag });
    return {
      id: rid,
      title: era.name,
      kidTitle: era.kidName,
      label: era.level === 0 ? 'Era' : 'Time band',
      y: era.start,
      end: era.end,
      precision: Math.abs(era.start) > 12000 ? 'approx' : 'year',
      lat: era.lat,
      lon: era.lon,
      altKm: 9000,
      summary: era.summary,
      kidSummary: era.kidSummary,
      body: era.body,
      kidBody: era.kidBody || (era.kidSummary ? [] : undefined),
      sources: era.sources || [],
      confidence: era.confidence,
      notes: era.notes,
      contentNote: era.contentNote,
      related: earlier.map((e) => link(e, 'earlier')),
      consequences: [...later, ...nextGroup].map((e) => link(e, 'what came next')),
    };
  }]);
  app.search.add(app.eras.filter((e) => e.summary).map((e) => ({ kind: 'era', title: e.name, alt: e.kidName, sub: formatEventDate(e.start, e.end, Math.abs(e.start) > 12000 ? 'approx' : 'year'), weight: 4 - e.level, y: e.focus ?? e.start, res: Math.max(1, (e.end - e.start) / 40), go: () => app.follow(`era:${e.id}`) })));
  app.openEventBase = app.openEvent;
  app.openEvent = async (id, opts = {}) => {
    if (id.startsWith('era:')) {
      const era = app.eras.find((e) => e.id === id.slice(4));
      if (era && opts.time) app.timeline.jumpToEra(era);
      if (era && opts.fly && era.lat != null) app.controls.flyTo({ lat: era.lat, lon: era.lon, altKm: 9000 });
      setUI({ event: id }, 'ui');
      return;
    }
    return app.openEventBase(id, opts);
  };

  // ---- stories ----
  app.story = new StoryPlayer(app);
  const stories = await app.story.list();
  app.stories = stories;
  const storySheet = new Sheet(app, { id: 'stories', label: 'Stories', title: 'Stories', iconPath: ICONS.book, wide: true });
  storySheet.onOpen = () => {
    const kid = state.level === 'kid';
    clear(storySheet.body);
    const card = (s) => {
      const mem = memory.story(s.id);
      const done = mem ? Math.round(((mem.max + 1) / s.scenes) * 100) : 0;
      return h('li', h('button.story-card', { type: 'button', style: { '--story': s.color || 'var(--marker)' }, onclick: () => { storySheet.close(); app.story.open(s.id, mem && mem.last < s.scenes - 1 ? mem.last : 0); } },
        h('span.story-card-format', FORMAT_NAMES[s.format] || s.format, ', ', `${s.scenes} scenes`),
        h('strong', (kid && s.kidTitle) || s.title),
        h('em', (kid && s.kidDeck) || s.deck),
        mem ? h('span.story-card-progress', h('i', { style: { width: `${Math.min(100, done)}%` } }), done >= 100 ? 'Finished' : `You reached scene ${mem.max + 1}`) : null));
    };
    const flag = stories.filter((s) => s.flagship);
    const rest = stories.filter((s) => !s.flagship);
    storySheet.body.append(...[
      h('p.sheet-lead', 'Scroll-driven documentaries on the globe. Scrolling is the clock: stop anywhere, turn the globe, and carry on.'),
      flag.length ? h('ul.story-grid.flagship', flag.map(card)) : null,
      rest.length ? h('ul.story-grid', rest.map(card)) : null].filter(Boolean));
  };
  app.search.add(stories.map((s) => ({ kind: 'story', title: s.title, alt: s.kidTitle, sub: `${FORMAT_NAMES[s.format] || s.format} story, ${s.scenes} scenes`, weight: 6, y: s.y, go: () => app.story.open(s.id, 0) })));
  app.applyStoryStep = (id, step) => app.story.open(id, step);
  on(['story'], () => {
    if (!state.story && app.story.story) app.story.close(true);
  });
  if (state.story) await app.story.open(state.story, state.step || 0);

  // Further features load in their own chunks so a slow one never holds the others back.
  const parts = [import('./discover.js'), import('./extras.js')];
  for (const p of parts) {
    try {
      const m = await p;
      await m.init(app, { Sheet });
    } catch (e) {
      engine.reportError(`feature failed to load: ${e.message}`);
    }
  }
  app.featuresLoaded = true;
  app.contentVersion++;
  engine.invalidate();
}

export { setTime, setPlace };
