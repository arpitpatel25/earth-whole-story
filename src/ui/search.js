// Instant search across events, people, places, eras, stories, topics and dates.
// Choosing a result moves both the clock and the globe there.
import { state } from '../core/store.js';
import { parseMoment, formatEventDate, formatMoment } from '../core/time.js';
import { h, clear, icon, ICONS, debounce } from './dom.js';
import { fetchJSON } from '../data/net.js';

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export class Search {
  constructor(app) {
    this.app = app;
    this.items = []; // { kind, title, key, sub, weight, go }
    this.loaded = false;
    this.loading = null;
    this.active = -1;
    this.input = h('input.search-input', {
      type: 'search', placeholder: 'Search events, people, places, dates', 'aria-label': 'Search events, people, places and dates',
      autocomplete: 'off', spellcheck: false, role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'search-results', 'aria-autocomplete': 'list',
      onfocus: () => { this.load(); this.run(); },
      oninput: debounce(() => this.run(), 60),
      onkeydown: (e) => this.key(e),
    });
    this.list = h('ul.search-results#search-results', { role: 'listbox', hidden: true });
    this.el = h('div.search', { role: 'search', dataset: { keys: 'own' } }, icon(ICONS.search, 18), this.input, this.list);
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.contains(e.target)) this.hide();
    });
    addEventListener('keydown', (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  /** Other modules register searchable things (curated events, stories, people…). */
  add(items) {
    for (const it of items) this.items.push({ ...it, key: fold(it.title + (it.alt ? ` ${it.alt}` : '')) });
  }

  load() {
    if (this.loading) return this.loading;
    const app = this.app;
    const jobs = [];
    const n = (app.events.index && app.events.index.searchShards) || 0;
    for (let i = 0; i < n; i++) {
      jobs.push(fetchJSON(`data/search/ev-${i}.json`).then((rows) => {
        const types = app.events.types;
        this.add(rows.map((r) => ({ kind: 'event', title: r[0], sub: `${formatEventDate(r[2], null, 'year')}, ${types[r[6]] ? types[r[6]].label : 'event'}`, weight: r[5], geo: [r[3], r[4], r[2]], y: r[2], go: () => app.openEvent(r[1], { fly: true, time: true }) })));
      }).catch(() => {}));
    }
    jobs.push(fetchJSON('data/geo/cities.json').then((d) => {
      this.add(d.rows.filter((r) => r[4] <= 8).map((r) => ({ kind: 'place', title: r[0], sub: app.countryName(r[5]) || 'city', weight: 3 - r[4] / 4, geo: [r[2], r[1], 0], go: () => app.controls.flyTo({ lat: r[2], lon: r[1], altKm: 900 }) })));
    }).catch(() => {}));
    jobs.push(fetchJSON('data/geo/country-index.json').then((rows) => {
      this.add(rows.map((r) => ({ kind: 'place', title: r.name, alt: r.long !== r.name ? r.long : '', sub: r.type === 'Country' || r.type === 'Sovereign country' ? 'country' : 'territory', weight: 4.5, geo: [r.label[1], r.label[0], 0], go: () => app.openCountry ? app.openCountry(r.id) : app.controls.flyTo({ lat: r.label[1], lon: r.label[0], altKm: 5000 }) })));
    }).catch(() => {}));
    this.loading = Promise.all(jobs).then(() => {
      this.loaded = true;
      if (document.activeElement === this.input) this.run();
    });
    return this.loading;
  }

  /** Resolve a name typed into the date box ("Mughal") to a moment, for the timeline. */
  async resolveName(text) {
    await this.load();
    const hit = this.match(text, 1)[0];
    return hit && hit.y != null ? { y: hit.y, res: hit.res } : null;
  }

  match(q, limit = 14) {
    const k = fold(q.trim());
    if (!k) return [];
    const words = k.split(/\s+/);
    const out = [];
    for (const it of this.items) {
      const key = it.key;
      let ok = true;
      for (const w of words) if (!key.includes(w)) { ok = false; break; }
      if (!ok) continue;
      const at = key.indexOf(words[0]);
      const exact = key === k ? 6 : key.startsWith(k) ? 3 : at === 0 || key[at - 1] === ' ' ? 1.5 : 0;
      const kindBoost = it.kind === 'story' ? 4 : it.kind === 'era' ? 3.5 : it.kind === 'curated' ? 3 : it.kind === 'person' ? 2 : 0;
      out.push({ it, score: exact + kindBoost + (it.weight || 0) - key.length / 60 });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit).map((o) => o.it);
  }

  run() {
    const q = this.input.value;
    const results = [];
    const when = parseMoment(q);
    if (when) {
      results.push({ kind: 'date', title: `Go to ${formatMoment(when.y, when.res).main}`, sub: 'set the clock', go: () => this.app.timeline.jumpTo(when.y, { res: when.res }) });
    }
    results.push(...this.match(q, 14));
    this.results = results;
    this.active = results.length ? 0 : -1;
    clear(this.list);
    if (!q.trim()) {
      this.hide();
      return;
    }
    if (!results.length) {
      this.list.append(h('li.search-empty', this.loaded ? `Nothing found for “${q.trim()}”. Try a place, a person, an event, or a date such as 1857 or 66 million years ago.` : 'Loading the index…'));
    } else {
      results.forEach((r, i) => {
        this.list.append(h('li', { role: 'option', id: `sr-${i}`, 'aria-selected': String(i === this.active), dataset: { kind: r.kind }, onpointerdown: (e) => { e.preventDefault(); this.choose(i); }, onmouseenter: () => this.setActive(i) },
          h('span.sr-kind', KIND_LABEL[r.kind] || r.kind), h('span.sr-title', r.title), r.sub ? h('span.sr-sub', r.sub) : null));
      });
    }
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  setActive(i) {
    this.active = i;
    [...this.list.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) this.input.setAttribute('aria-activedescendant', `sr-${i}`);
  }

  key(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = (this.results || []).length;
      if (n) this.setActive((this.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.active >= 0) this.choose(this.active);
    } else if (e.key === 'Escape') {
      this.hide();
      this.input.blur();
    }
  }

  choose(i) {
    const r = this.results[i];
    if (!r) return;
    this.hide();
    this.input.value = '';
    this.input.blur();
    r.go();
  }

  hide() {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
  }
}

const KIND_LABEL = { event: 'Event', curated: 'Event', place: 'Place', era: 'Era', story: 'Story', trail: 'Trail', person: 'Person', date: 'Date', topic: 'Topic', model: '3D', india: 'India' };

export { state };
