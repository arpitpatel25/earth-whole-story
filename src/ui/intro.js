// The opening: darkness, the first light, and a single line inviting a scroll.
// Scrolling is the clock here too. The visitor's wheel, swipe or keys move time forward from the
// Big Bang to the first oceans; nothing plays by itself, and two controls leave at once.
import { state, setTime, setUI, setPlace } from '../core/store.js';
import { BIG_BANG, NOW, yearToU, uToYear, formatMoment } from '../core/time.js';
import { h, clear } from './dom.js';
import { memory } from '../core/memory.js';

export class Intro {
  constructor(app, beats) {
    this.app = app;
    this.beats = beats; // [{ y, title, text, kidText }] ascending in y
    this.p = 0; // 0..beats.length-1, fractional
    this.active = false;
    this.el = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    document.documentElement.dataset.intro = '1';
    const returning = memory.isReturning();
    this.title = h('h1.intro-title');
    this.text = h('p.intro-text');
    this.src = h('p.intro-src');
    this.when = h('p.intro-when');
    this.hint = h('p.intro-hint', 'Scroll to begin');
    this.progress = h('div.intro-progress', { 'aria-hidden': 'true' }, h('span'));
    this.el = h('section.intro', { 'aria-label': 'The beginning of the universe' },
      h('div.intro-copy', { 'aria-live': 'polite' }, this.when, this.title, this.text, this.src),
      this.hint,
      h('div.intro-actions',
        h('button.btn', { type: 'button', onclick: () => this.finish({ openDate: true }) }, 'Jump to any moment'),
        h('button.btn', { type: 'button', onclick: () => this.finish({ y: NOW }) }, 'Skip to Earth today'),
        returning ? h('button.btn', { type: 'button', onclick: () => this.finish({ resume: true }) }, 'Resume where you left off') : null),
      this.progress);
    document.getElementById('ui').append(this.el);

    this.onWheel = (e) => {
      if (e.target.closest && e.target.closest('.intro-actions')) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      this.advance((e.deltaY * unit) / 620);
    };
    let touchY = null;
    this.onTouchStart = (e) => {
      touchY = e.touches[0].clientY;
    };
    this.onTouchMove = (e) => {
      if (touchY == null) return;
      const y = e.touches[0].clientY;
      this.advance((touchY - y) / 260);
      touchY = y;
      e.preventDefault();
    };
    this.onKey = (e) => {
      if (e.target && e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
      if ([' ', 'ArrowDown', 'ArrowRight', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
        this.stepTo(Math.floor(this.p + 1e-6) + 1);
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        this.stepTo(Math.ceil(this.p - 1e-6) - 1);
      } else if (e.key === 'Escape') this.finish({ y: NOW });
    };
    addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('touchstart', this.onTouchStart, { passive: true });
    addEventListener('touchmove', this.onTouchMove, { passive: false });
    addEventListener('keydown', this.onKey);
    this.apply();
  }

  /** Keyboard steps glide to the next beat; the glide is the user's own input, eased. */
  stepTo(target) {
    target = Math.max(0, Math.min(this.beats.length - 1 + 0.999, target));
    if (target > this.beats.length - 1) return this.finish({});
    if (state.reducedMotion) {
      this.p = target;
      return this.apply();
    }
    const from = this.p;
    const t0 = performance.now();
    cancelAnimationFrame(this.raf);
    const tick = (now) => {
      // a frame's timestamp can be a hair earlier than the key press that asked for it: never run the glide backwards
      const k = Math.min(1, Math.max(0, (now - t0) / 900));
      const e = 1 - Math.pow(1 - k, 3);
      this.p = from + (target - from) * e;
      this.apply();
      if (k < 1 && this.active) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  advance(d) {
    cancelAnimationFrame(this.raf);
    const max = this.beats.length - 1;
    this.p = Math.max(0, this.p + d);
    if (this.p >= max + 0.35) return this.finish({});
    this.apply();
  }

  apply() {
    const max = this.beats.length - 1;
    const p = Math.max(0, Math.min(max, this.p || 0));
    const i = Math.max(0, Math.min(max - 1, Math.floor(p)));
    const f = p - i;
    const a = this.beats[i];
    const b = this.beats[i + 1];
    // interpolate along the timeline scale so every epoch gets its share of the scroll
    const u = yearToU(a.y) + (yearToU(b.y) - yearToU(a.y)) * f;
    setTime(p >= max ? b.y : uToYear(u), 'intro');
    const beat = this.beats[Math.round(p)];
    if (this.shown !== beat) {
      this.shown = beat;
      const kid = state.level === 'kid';
      this.title.textContent = beat.title;
      // the sentence under each title is the opening of the sourced summary for that stretch of time
      const era = this.app.eraAt ? this.app.eraAt(beat.y) : null;
      const from = era ? (kid && era.kidSummary) || era.summary || '' : '';
      this.text.textContent = (kid && beat.kidText) || beat.text || from.split(/(?<=[.!?])\s/)[0] || '';
      const src = era && era.sources && era.sources[0];
      clear(this.src);
      if (src) this.src.append('Source: ', h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.title), src.publisher ? ` (${src.publisher})` : '');
      this.el.classList.remove('beat-in');
      void this.el.offsetWidth;
      this.el.classList.add('beat-in');
    }
    const m = formatMoment(state.y, 1);
    this.when.textContent = m.sub ? `${m.main}, ${m.sub}` : m.main;
    this.hint.classList.toggle('gone', this.p > 0.04);
    this.progress.firstChild.style.transform = `scaleX(${Math.min(1, this.p / max)})`;
  }

  finish({ y, openDate, resume } = {}) {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('wheel', this.onWheel);
    removeEventListener('touchstart', this.onTouchStart);
    removeEventListener('touchmove', this.onTouchMove);
    removeEventListener('keydown', this.onKey);
    this.el.remove();
    delete document.documentElement.dataset.intro;
    setUI({ intro: false }, 'intro');
    const last = memory.lastView();
    if (resume && last) {
      setTime(last.y, 'intro');
      setPlace({ lat: last.lat, lon: last.lon, altKm: last.altKm }, 'intro');
      if (last.lens) setUI({ lens: last.lens }, 'intro');
    } else if (y !== undefined) setTime(y, 'intro');
    this.app.timeline.resize();
    if (openDate) this.app.timeline.openDateInput();
    if (this.onDone) this.onDone();
  }
}
