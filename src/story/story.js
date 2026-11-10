// The story engine: scroll-driven documentaries on the globe.
// Scrolling is the clock. Each scene owns a stretch of scroll; moving through it moves time, the camera
// and whatever is drawn on the globe. Nothing plays by itself. The reader can stop anywhere, drag the
// globe, open pins, and pick the story up again from the same spot by scrolling on.
import { state, setTime, setPlace, setUI, on } from '../core/store.js';
import { yearToU, uToYear, formatMoment, formatEventDate } from '../core/time.js';
import { h, clear, icon, ICONS, announce } from '../ui/dom.js';
import { fetchJSON } from '../data/net.js';
import { greatCircle, pathThrough } from '../globe/overlays.js';
import { memory } from '../core/memory.js';
import { sourceLine } from '../ui/here.js';

const smooth = (t) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const nf = (n) => Math.round(n).toLocaleString('en-US');

export const BLOCS = {
  allies: '#5aa9ff', axis: '#ff5d52', neutral: '#b8c4d6', west: '#5aa9ff', east: '#ff5d52', nonaligned: '#f5a742',
  marker: '#ffd23f', route: '#ffd23f', disease: '#c79bff', trade: '#e7d04a', people: '#7fb2ff', life: '#7bd389', fire: '#ff8f6b', ice: '#cfe8ff', idea: '#5fd0c0',
};
const colorOf = (name, fallback = '#ffd23f') => (name && name[0] === '#' ? name : BLOCS[name] || fallback);

function camLerp(a, b, t) {
  let dLon = b[1] - a[1];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return [lerp(a[0], b[0], t), a[1] + dLon * t, Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), t))];
}

export class StoryPlayer {
  constructor(app) {
    this.app = app;
    this.story = null;
    this.index = null; // list of all stories
    this.root = null;
    this.active = -1;
    this.attached = true;
    this.timeAttached = true;
    this.overlayIds = new Set();
    this.onScroll = this.onScroll.bind(this);
    this.frame = 0;
    on(['level'], () => this.story && this.renderCards());
    // dragging the globe or the timeline hands control to the reader until they scroll again
    app.engine.canvas.addEventListener('pointerdown', () => this.story && this.detach('place'));
    app.timeline.canvas.addEventListener('pointerdown', () => this.story && this.detach('time'));
  }

  async list() {
    if (!this.index) this.index = await fetchJSON('data/curated/stories/index.json').catch(() => []);
    return this.index;
  }

  async open(id, step = 0) {
    const app = this.app;
    if (this.story && this.story.id === id) {
      this.goto(step, true);
      return;
    }
    if (this.story) this.close(true);
    let story;
    try {
      story = await app.engine.track(fetchJSON(`data/curated/stories/${id}.json`));
    } catch (e) {
      app.engine.reportError(`story ${id}: ${e.message}`);
      setUI({ story: null }, 'story');
      return;
    }
    await app.geo.load();
    this.story = story;
    this.attached = true;
    this.timeAttached = true;
    if (app.intro && app.intro.active) app.intro.finish({});
    setUI({ story: id, step, event: null, lens: 'all' }, 'story');
    document.body.classList.add('story-on');
    document.documentElement.dataset.story = story.format;
    document.documentElement.style.setProperty('--story', story.color || '#ffd23f');
    app.controls.wheelMode = (e) => (e.ctrlKey || e.metaKey ? 'zoom' : 'scroll');
    app.pins.enabled = false;
    this.build();
    app.layout();
    addEventListener('scroll', this.onScroll, { passive: true });
    this.goto(step, true);
    announce(`Story: ${story.title}. Scroll to move through time.`);
  }

  close(silent) {
    if (!this.story) return;
    const app = this.app;
    removeEventListener('scroll', this.onScroll);
    cancelAnimationFrame(this.frame);
    this.clearOverlays();
    this.root.remove();
    this.root = null;
    this.story = null;
    this.active = -1;
    document.body.classList.remove('story-on');
    delete document.documentElement.dataset.story;
    scrollTo(0, 0);
    app.controls.wheelMode = () => 'zoom';
    app.pins.enabled = true;
    app.pins.setExtra([]);
    app.labels.setExtra([]);
    if (!silent) setUI({ story: null, step: 0 }, 'story');
    app.layout();
  }

  // ------------------------------------------------------------------------------------------
  build() {
    const s = this.story;
    this.cards = [];
    this.sections = [];
    this.counter = h('div.story-counter', { hidden: true });
    this.dateEl = h('span.story-date');
    this.rail = h('ol.story-rail', { 'aria-label': 'Scenes' });
    this.resume = h('button.btn.btn-primary.story-resume', { type: 'button', hidden: true, onclick: () => this.reattach(true) }, 'Back to the story');
    this.bar = h('div.story-bar',
      h('button.icon-btn', { type: 'button', 'aria-label': 'Leave the story and keep exploring from here', title: 'Leave the story', onclick: () => this.close() }, icon(ICONS.close, 18)),
      h('div.story-bar-text', h('strong', s.title), this.dateEl),
      this.counter,
      this.resume,
      // the reading level stays in reach inside a story
      h('div.level.story-level', { role: 'group', 'aria-label': 'Reading level' },
        ['explorer', 'kid'].map((lv) => h('button', { type: 'button', 'aria-pressed': String(state.level === lv), dataset: { level: lv }, onclick: () => setUI({ level: lv }, 'ui') }, lv === 'kid' ? 'Kid' : 'Explorer'))));
    this.track = h('div.story-track');
    this.root = h('div.story', { dataset: { format: s.format } }, this.bar, this.rail, this.track);
    document.getElementById('ui').append(this.root);
    this.renderCards();
  }

  renderCards() {
    const s = this.story;
    const kid = state.level === 'kid';
    const app = this.app;
    clear(this.track);
    clear(this.rail);
    this.sections = [];
    s.scenes.forEach((sc, i) => {
      const paras = kid ? sc.kid : sc.text;
      const card = h(`article.card.look-${sc.look || 'text'}`, { 'aria-label': `Scene ${i + 1} of ${s.scenes.length}: ${sc.title}` },
        i === 0 ? h('p.card-kicker', kid ? s.kidDeck || s.deck : s.deck) : h('p.card-count', `${i + 1} / ${s.scenes.length}`),
        h(i === 0 ? 'h1.card-title' : 'h2.card-title', markTitle((kid && sc.kidTitle) || sc.title)),
        sc.img ? h('figure.card-img', h('img', { src: sc.img.src, alt: sc.img.alt || '', loading: i < 2 ? 'eager' : 'lazy' }), h('figcaption', sc.img.caption ? h('span', sc.img.caption) : null, h('span.credit', [sc.img.credit, sc.img.license].filter(Boolean).join(', '), sc.img.url ? [' ', h('a', { href: sc.img.url, target: '_blank', rel: 'noopener' }, 'Source')] : null))) : null,
        sc.quote ? h('figure.card-quote', h('blockquote', `“${sc.quote.text}”`), h('figcaption', sc.quote.by, sc.quote.source ? [', ', h('a', { href: sc.quote.source.url, target: '_blank', rel: 'noopener' }, sc.quote.source.title)] : null)) : null,
        paras.map((p) => h('p.card-p', p)),
        sc.chart && app.renderChart ? app.renderChart(sc.chart) : null,
        sc.model && app.models && app.models[sc.model] ? h('button.model-card', { type: 'button', onclick: () => app.openModel(sc.model) }, icon(ICONS.cube, 22), h('span', h('strong', app.models[sc.model].title), h('em', kid ? 'Turn it around and tap its parts' : 'Explore in 3D'))) : null,
        sc.note ? h('p.card-note', sc.note) : null,
        sc.sources && sc.sources.length ? sourceLine(sc.sources) : null,
        i === 0 ? h('p.card-hint', 'Scroll to move through time. Drag the globe whenever you like.') : null);
      const section = h('section.scene', { style: { '--w': String(sc.weight || 1) }, dataset: { i: String(i) } }, card);
      this.track.append(section);
      this.sections.push(section);
      this.rail.append(h('li', h('button', { type: 'button', title: sc.title, 'aria-label': `Go to scene ${i + 1}: ${sc.title}`, onclick: () => this.goto(i) })));
    });
    this.track.append(this.endSection());
    if (this.active >= 0) this.apply(true);
  }

  endSection() {
    const s = this.story;
    const app = this.app;
    const kid = state.level === 'kid';
    const quiz = kid && s.quiz && s.quiz.length ? this.quiz(s.quiz) : null;
    const next = (s.ledTo || []).map((t) =>
      h('li', h('button.ev', { type: 'button', onclick: () => app.follow(t) }, h('span.ev-text', h('span.ev-title', t.title), t.tag ? h('span.ev-meta', t.tag) : null), icon(ICONS.chevronRight, 16))));
    const card = h('article.card.look-end',
      quiz,
      h('h2.card-title', 'This led to…'),
      h('ul.ev-list', next),
      s.sources && s.sources.length ? h('div.card-sources', h('h3', 'Sources for this story'), h('ul', s.sources.map((x) => h('li', h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title), x.publisher ? `, ${x.publisher}` : '')))) : null,
      h('div.deep-actions',
        h('button.btn', { type: 'button', onclick: () => this.goto(0) }, 'Back to the start'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => this.close() }, 'Explore from here')));
    this.endEl = h('section.scene.scene-end', { style: { '--w': '1' } }, card);
    return this.endEl;
  }

  quiz(items) {
    const box = h('div.quiz', h('h2.card-title', 'Quick quiz'), h('p.card-p', 'Three questions about what you just saw. Take your time.'));
    items.forEach((q, qi) => {
      const fb = h('p.quiz-fb', { 'aria-live': 'polite' });
      const opts = h('div.quiz-opts', q.options.map((o, oi) =>
        h('button.quiz-opt', { type: 'button', onclick: (e) => {
          for (const b of opts.children) b.classList.remove('right', 'wrong');
          const right = oi === q.answer;
          e.currentTarget.classList.add(right ? 'right' : 'wrong');
          fb.textContent = right ? `Yes! ${q.why}` : 'Not quite. Have another go.';
          fb.className = `quiz-fb ${right ? 'ok' : 'retry'}`;
        } }, o)));
      box.append(h('div.quiz-q', h('p.quiz-text', `${qi + 1}. ${q.q}`), opts, fb));
    });
    return box;
  }

  // ------------------------------------------------------------------------------------------
  goto(step, instant) {
    const sec = this.sections[Math.max(0, Math.min(this.sections.length - 1, step))];
    if (!sec) return;
    this.attached = true;
    this.timeAttached = true;
    this.resume.hidden = true;
    const top = sec.offsetTop + 2;
    scrollTo({ top, behavior: instant || state.capture || state.reducedMotion ? 'instant' : 'smooth' });
    if (instant || state.capture) this.apply(true);
  }

  detach(what) {
    if (what === 'place') this.attached = false;
    else this.timeAttached = false;
    this.resume.hidden = false;
    this.lastScroll = scrollY;
  }

  reattach(fly) {
    const wasDetached = !this.attached;
    this.attached = true;
    this.timeAttached = true;
    this.resume.hidden = true;
    if (fly && wasDetached && this.cam) {
      // glide back to the story's camera, then let the scroll own it again
      this.attached = false;
      this.app.controls.flyTo({ lat: this.cam[0], lon: this.cam[1], altKm: this.cam[2] }, 700).then(() => {
        this.attached = true;
        this.apply(true);
      });
    }
    this.apply(true);
  }

  onScroll() {
    if (!this.story) return;
    if ((!this.attached || !this.timeAttached) && Math.abs(scrollY - (this.lastScroll ?? scrollY)) > 60) this.reattach(true);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.apply());
  }

  /** Where the reader is: scene index and progress through it, from the scroll position. */
  position() {
    const line = scrollY + innerHeight * 0.3;
    const n = this.sections.length;
    for (let i = n - 1; i >= 0; i--) {
      const sec = this.sections[i];
      if (line >= sec.offsetTop || i === 0) {
        const t = Math.min(1, Math.max(0, (line - sec.offsetTop) / Math.max(1, sec.offsetHeight)));
        return { i, t, ended: i === n - 1 && this.endEl && line >= this.endEl.offsetTop };
      }
    }
    return { i: 0, t: 0, ended: false };
  }

  apply(force) {
    const s = this.story;
    if (!s) return;
    const { i, t, ended } = this.position();
    const sc = s.scenes[i];
    const nx = s.scenes[i + 1];
    // within the scene: time runs from y to `to`, the camera from cam to camTo
    const inner = smooth(Math.min(1, t / 0.72));
    let y = sc.to != null ? uToYear(lerp(yearToU(sc.y), yearToU(sc.to), sc.linear ? Math.min(1, t / 0.72) : inner)) : sc.y;
    if (sc.to != null && sc.linear) y = lerp(sc.y, sc.to, Math.min(1, t / 0.72));
    let cam = sc.camTo ? camLerp(sc.cam, sc.camTo, inner) : sc.cam;
    // the last stretch of each scene blends into the next one so nothing jumps
    const k = nx ? smooth((t - 0.76) / 0.24) : 0;
    if (nx && k > 0) {
      const y1 = sc.to != null ? sc.to : sc.y;
      y = uToYear(lerp(yearToU(y1), yearToU(nx.y), k));
      cam = camLerp(sc.camTo || sc.cam, nx.cam, k);
    }
    // in deep time the story names present-day places; the camera and the marks ride on their plates
    this.deep = 2027 - y > 2e6;
    if (this.deep) {
      const c = this.paleo(cam[0], cam[1], y);
      cam = [c[0], c[1], cam[2]];
    }
    this.cam = cam;
    if (this.timeAttached) {
      setTime(y, 'story');
      // the tape zooms with the story: days in a battle, millennia in deep time
      const span = sc.to != null ? Math.abs(sc.to - sc.y) : 0;
      const ago = 2027 - y;
      const fallback = ago > 2e4 ? ago / 150 : y < -3000 ? 40 : y < 1500 ? 4 : 1.2;
      this.app.timeline.setRes(sc.res || (span ? Math.max(span / 60, 1 / 400) : fallback));
    }
    if (this.attached) setPlace({ lat: cam[0], lon: cam[1], altKm: cam[2] }, 'story');
    const platesReady = this.deep && !!this.app.engine.plates.ready;
    if (i !== this.active || force || platesReady !== this.platesReady) {
      this.platesReady = platesReady;
      this.active = i;
      setUI({ step: i }, 'story');
      [...this.rail.children].forEach((li, n) => li.classList.toggle('on', n === i));
      this.sections.forEach((sec, n) => sec.classList.toggle('on', n === i));
      memory.markStory(s.id, i, s.scenes.length);
      this.buildOverlays(i);
    }
    this.driveOverlays(i, t, k, state.y);
    const m = formatMoment(state.y, sc.res || state.timeRes);
    this.dateEl.textContent = m.main;
    this.updateCounter(i, t);
    this.root.classList.toggle('ended', !!ended);
    this.app.engine.invalidate();
  }

  /** Where a present-day place sat at year y, by the plate model (unchanged if the model cannot say). */
  paleo(lat, lon, y) {
    const pl = this.app.engine.plates;
    const ma = (2027 - y) / 1e6;
    if (ma < 2 || !pl || !pl.ready || ma > pl.meta.maxMa) return [lat, lon];
    const r = pl.reconstructNear(lon, lat, ma);
    return r ? [r.lat, r.lon] : [lat, lon];
  }

  // ------------------------------------------------------------------------------------------
  // Overlays: each scene lists what to show; items are built when the scene comes near.
  clearOverlays() {
    for (const id of this.overlayIds) this.app.overlays.remove(id);
    this.overlayIds.clear();
    this.dyn = [];
    this.marks = [];
  }

  buildOverlays(i) {
    const app = this.app;
    const ov = app.overlays;
    this.clearOverlays();
    const s = this.story;
    const scenes = [[i, s.scenes[i]], [i + 1, s.scenes[i + 1]]].filter((x) => x[1]);
    const marks = [];
    const dyn = [];
    for (const [si, sc] of scenes) {
      (sc.show || []).forEach((d, k) => {
        const id = `st:${si}:${k}`;
        const color = colorOf(d.color, s.color);
        const item = { id, si, d };
        if (d.type === 'site' || d.type === 'label') {
          marks.push({ ...item, lat: d.lat, lon: d.lon, label: d.label, color, size: d.size, labelOnly: d.type === 'label' });
          if (d.ring) {
            ov.addRing(id, d.lat, d.lon, { color, size: d.ringSize || 80 });
            this.overlayIds.add(id);
          }
          return;
        }
        // deep-time scenes: lines are drawn where their end points sat at the scene's own date
        const old = 2027 - sc.y > 2e6;
        const P = (p) => (old ? this.paleo(p[0], p[1], sc.y) : p);
        if (d.type === 'arrow') ov.addArc(id, P(d.from), P(d.to), { color, width: d.width || 6, flow: true, lift: d.lift });
        else if (d.type === 'route') ov.addPath(id, pathThrough(d.points.map(P), d.lift ?? 0.004), { color, width: d.width || 5, dash: d.dash, flow: !d.dash, head: !!d.head });
        else if (d.type === 'area') ov.addArea(id, d.points, { color, opacity: d.opacity, hatch: d.hatch });
        else if (d.type === 'region') {
          const polys = [];
          for (const code of d.countries) {
            const c = app.geo.countries && app.geo.countries.find((f) => f.id === code);
            if (c) polys.push(...c.polys);
          }
          ov.addPolys(id, polys, { color, opacity: d.opacity ?? 0.42, hatch: d.hatch });
        } else if (d.type === 'ring') {
          const c = P([d.lat, d.lon]);
          ov.addRing(id, c[0], c[1], { color, size: d.size || 90 });
        }
        else if (d.type === 'front' || d.type === 'spread' || d.type === 'polity') {
          dyn.push({ ...item, color });
          return;
        } else return;
        this.overlayIds.add(id);
      });
    }
    this.marks = marks;
    this.dyn = dyn;
  }

  driveOverlays(i, t, k, y) {
    const app = this.app;
    const ov = app.overlays;
    const pins = [];
    const labels = [];
    const vis = (it) => {
      // this scene's items fade out as the next scene's fade in
      const a = it.si === i ? 1 - k : k;
      const d = it.d;
      if (d.from_y != null && y < d.from_y) return 0;
      if (d.until_y != null && y > d.until_y) return 0;
      return a;
    };
    for (const m of this.marks) {
      const a = vis(m);
      if (a < 0.05) {
        if (m.d.ring) ov.setAlpha(m.id, 0);
        continue;
      }
      let { lat, lon } = m;
      if (this.deep && !m.d.fixed) [lat, lon] = this.paleo(lat, lon, y);
      if (!m.labelOnly) pins.push({ id: m.id, lat, lon, color: m.color, size: m.size || 20, title: m.label, onOpen: m.d.event ? () => app.openEvent(m.d.event) : null });
      if (m.label) labels.push({ id: m.id, text: m.label, lat, lon, cls: m.d.cls || '' });
      if (m.d.ring) {
        if (this.deep) {
          const rk = `${lat.toFixed(1)},${lon.toFixed(1)}`;
          if (m.ringAt !== rk) {
            m.ringAt = rk;
            ov.addRing(m.id, lat, lon, { color: m.color, size: m.d.ringSize || 80 });
          }
        }
        ov.setAlpha(m.id, a);
      }
    }
    for (const id of this.overlayIds) {
      const [, si, kk] = id.split(':');
      const sc = this.story.scenes[Number(si)];
      const d = sc && sc.show[Number(kk)];
      if (!d || d.type === 'site' || d.type === 'label') continue;
      const a = vis({ si: Number(si), d });
      ov.setAlpha(id, a);
      if (d.type === 'arrow' || d.type === 'route') {
        // lines draw themselves as the reader scrolls through the scene
        const local = Number(si) === i ? t : 0;
        ov.setReveal(id, d.still ? 1 : Math.min(1, Math.max(0.02, (local - (d.delay || 0.05)) / (d.span || 0.5))));
      }
    }
    // time-driven items: fronts move and spreads grow with the clock itself
    for (const it of this.dyn) {
      const a = vis(it);
      const d = it.d;
      if (d.type === 'front') {
        const key = `${it.id}:${Math.round(y * 365)}`;
        if (a > 0.02 && it.key !== key) {
          it.key = key;
          const line = frontAt(d.frames, y);
          if (line) {
            ov.addPath(it.id, pathThrough(line, 0.003), { color: it.color, width: d.width || 4, flow: false });
            this.overlayIds.add(it.id);
            if (d.base) {
              ov.addArea(`${it.id}:f`, line.concat(d.base.slice().reverse()), { color: it.color, opacity: 0.2, hatch: true });
              this.overlayIds.add(`${it.id}:f`);
            }
          }
        }
        ov.setAlpha(it.id, a);
        ov.setAlpha(`${it.id}:f`, a);
      } else if (d.type === 'polity') {
        // territories from the border snapshots, re-read whenever the snapshot under the clock changes
        const got = app.territories.polysOf(d.names, y);
        if (a > 0.02 && got.key && it.key !== got.key) {
          it.key = got.key;
          if (got.polys.length) {
            ov.addPolys(it.id, got.polys, { color: it.color, opacity: d.opacity ?? 0.5 });
            this.overlayIds.add(it.id);
          } else ov.remove(it.id);
        }
        ov.setAlpha(it.id, a);
      } else if (d.type === 'spread') {
        for (const [n, p] of d.points.entries()) {
          if (y < p.y) continue;
          const fresh = y - p.y < (d.fresh || 0.25);
          pins.push({ id: `${it.id}:${n}`, lat: p.lat, lon: p.lon, color: it.color, size: fresh ? 24 : 13, title: p.label ? `${p.label}, ${formatEventDate(p.y, null, p.precision || 'month')}` : '' });
          if (p.label && (fresh || d.labels === 'all')) labels.push({ id: `${it.id}:${n}`, text: p.label, lat: p.lat, lon: p.lon });
        }
      }
    }
    const sig = pins.map((p) => p.id + p.size + (this.deep ? `${p.lat.toFixed(1)}${p.lon.toFixed(1)}` : '')).join('|') + labels.map((l) => l.id + (this.deep ? `${l.lat.toFixed(1)}${l.lon.toFixed(1)}` : '')).join('|');
    if (sig !== this.markSig) {
      this.markSig = sig;
      app.pins.setExtra(pins);
      app.labels.setExtra(labels);
    }
  }

  /** A running figure in the story bar: the sum of the sourced tolls of the scenes passed so far. */
  updateCounter(i, t) {
    const s = this.story;
    if (!s.counter) {
      this.counter.hidden = true;
      return;
    }
    let total = 0;
    for (let n = 0; n < i; n++) total += s.scenes[n].toll || 0;
    total += (s.scenes[i].toll || 0) * Math.min(1, t / 0.7);
    this.counter.hidden = false;
    clear(this.counter).append(h('strong', nf(total)), h('span', s.counter));
  }
}

/** Position of a keyframed line at year y. Frames: [{ y, pts: [[lat, lon]...] }] with equal point counts. */
export function frontAt(frames, y) {
  if (!frames || !frames.length) return null;
  if (y <= frames[0].y) return frames[0].pts;
  const last = frames[frames.length - 1];
  if (y >= last.y) return last.pts;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (y >= a.y && y <= b.y) {
      const f = (y - a.y) / (b.y - a.y || 1);
      return a.pts.map((p, n) => [lerp(p[0], b.pts[n][0], f), lerp(p[1], b.pts[n][1], f)]);
    }
  }
  return last.pts;
}

/** Headline with highlighter marks: text between *asterisks* gets the marker. */
function markTitle(text) {
  const parts = String(text).split(/\*([^*]+)\*/);
  return parts.map((p, i) => (i % 2 ? h('mark', p) : p));
}

export { greatCircle };
