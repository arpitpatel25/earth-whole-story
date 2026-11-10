// The Timeline: the only thing that moves time.
// A tape of strata slides under a fixed needle. Drag it, scroll over it, use the arrow keys, type a
// date, or press an era. Zooming the tape goes from aeons to single days.
import { state, setTime, setUI, on } from '../core/store.js';
import { yearToU, uToYear, yearsPerU, formatMoment, parseMoment, NOW, BIG_BANG, niceStep, yearToParts, MONTHS, clampYear } from '../core/time.js';
import { h, icon, ICONS, announce } from './dom.js';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4000;
const nf = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

function tickLabel(y, step) {
  const ago = NOW - y;
  if (y < -11000) {
    if (ago >= 1e9) return `${nf(ago / 1e9, step < 1e8 ? 2 : 1)} Gya`;
    if (ago >= 1e6) return `${nf(ago / 1e6, step < 1e4 ? 3 : step < 1e5 ? 2 : step < 1e6 ? 1 : 0)} Mya`;
    return `${nf(ago / 1e3, step < 100 ? 2 : step < 1000 ? 1 : 0)} kya`;
  }
  if (y < 1) return `${nf(Math.round(-y)).replace(/,/g, '')} BCE`;
  const { year, month, day } = yearToParts(y);
  if (step < 1 / 20) return `${day} ${MONTHS[month].slice(0, 3)}`;
  if (step < 0.9) return `${MONTHS[month].slice(0, 3)} ${year}`;
  return String(year);
}

function readable(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#10151d' : '#f4f1e8';
}

export class Timeline {
  /**
   * @param {HTMLElement} root
   * @param {{eras: Array, resolveName?: (text:string)=>Promise<{y:number,res?:number}|null>}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.eras = opts.eras || [];
    this.resolveName = opts.resolveName || (async () => null);
    this.zoom = 3;
    this.zoomTarget = null;
    this.density = null; // { bins: Uint8Array-like, n }
    this.localEvents = null; // () => array of event years currently loaded, for zoomed-in density
    this.build();
    on(['y'], () => {
      this.syncRes();
      this.draw();
    });
    on(['level'], () => this.updateClock());
    addEventListener('resize', () => this.resize());
    this.resize();
    this.syncRes();
    this.updateClock();
  }

  build() {
    const r = this.root;
    r.classList.add('timeline');
    r.setAttribute('role', 'group');
    r.setAttribute('aria-label', 'Timeline');

    this.clockBtn = h('button.clock', { type: 'button', title: 'Type any date', 'aria-label': 'Current moment. Activate to type a date.', onclick: () => this.openDateInput() },
      h('span.clock-main'), h('span.clock-sub'));
    this.dateForm = h('form.clock-form', { hidden: true, onsubmit: (e) => this.submitDate(e) },
      h('label.sr-only', { for: 'date-input' }, 'Jump to any moment'),
      h('input#date-input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: '1857, 66 million years ago, June 1944…', onkeydown: (e) => { if (e.key === 'Escape') this.closeDateInput(); }, onblur: () => setTimeout(() => this.closeDateInput(), 150) }),
      h('button.btn-go', { type: 'submit' }, 'Go'));
    this.dateHint = h('p.clock-hint', { hidden: true, role: 'alert' });
    this.eraLine = h('p.era-line', { 'aria-live': 'off' });
    const head = h('div.tl-head', h('div.clock-wrap', this.clockBtn, this.dateForm, this.dateHint, this.eraLine));

    this.canvas = h('canvas.tape', { tabindex: 0, role: 'slider', 'aria-label': 'Time', 'aria-valuemin': 0, 'aria-valuemax': 1000 });
    this.needle = h('div.needle', { 'aria-hidden': 'true' });
    this.tapeWrap = h('div.tape-wrap', this.canvas, this.needle);

    this.overview = h('canvas.overview', { 'aria-hidden': 'true' });
    this.viewport = h('div.overview-window', { 'aria-hidden': 'true' });
    this.overviewWrap = h('div.overview-wrap', { title: 'All of time. Click to jump.' }, this.overview, this.viewport);

    this.chips = h('div.era-chips', { role: 'group', 'aria-label': 'Jump to an era' });
    for (const era of this.eras.filter((e) => e.level === 0)) {
      this.chips.append(h('button.chip', { type: 'button', dataset: { era: era.id }, style: { '--band': era.color }, onclick: () => this.jumpToEra(era) }, era.name));
    }
    this.chips.append(h('button.chip.chip-now', { type: 'button', onclick: () => this.jumpTo(NOW, { zoom: 3 }) }, 'Today'));
    const zoomBox = h('div.tl-zoom', { role: 'group', 'aria-label': 'Timeline zoom' },
      h('button.icon-btn', { type: 'button', 'aria-label': 'Zoom timeline out, toward aeons', title: 'Zoom timeline out', onclick: () => this.zoomBy(0.5) }, icon(ICONS.minus, 18)),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Zoom timeline in, toward single years', title: 'Zoom timeline in', onclick: () => this.zoomBy(2) }, icon(ICONS.plus, 18)));
    const foot = h('div.tl-foot', this.chips, zoomBox);

    r.append(head, this.tapeWrap, this.overviewWrap, foot);

    // ---- tape interaction ----
    const c = this.canvas;
    c.style.touchAction = 'none';
    const ptrs = new Map();
    let drag = null;
    let pinch = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, e.clientX);
      this.zoomTarget = null;
      this.tween = null;
      if (ptrs.size === 1) drag = { x: e.clientX, u: yearToU(state.y), moved: false };
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.abs(a - b) || 1, zoom: this.zoom };
        drag = null;
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, e.clientX);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        this.setZoom(pinch.zoom * ((Math.abs(a - b) || 1) / pinch.d));
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 3) return;
      drag.moved = true;
      c.classList.add('dragging');
      setTime(uToYear(drag.u - dx / (this.zoom * this.w)), 'timeline');
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      c.classList.remove('dragging');
      if (drag && !drag.moved && e.type === 'pointerup') {
        // A click on the tape jumps to that moment.
        const rect = c.getBoundingClientRect();
        const u = yearToU(state.y) + (e.clientX - rect.left - this.w / 2) / (this.zoom * this.w);
        this.jumpTo(uToYear(u));
      }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        this.setZoom(this.zoom * Math.exp(-e.deltaY * unit * 0.01));
        return;
      }
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
      this.tween = null;
      setTime(uToYear(yearToU(state.y) + d / (this.zoom * this.w)), 'timeline');
    }, { passive: false });
    c.addEventListener('keydown', (e) => this.key(e));

    // ---- overview interaction ----
    const ov = this.overviewWrap;
    ov.style.touchAction = 'none';
    let ovDrag = false;
    const ovSet = (e) => {
      const rect = ov.getBoundingClientRect();
      this.tween = null;
      setTime(uToYear((e.clientX - rect.left) / rect.width), 'timeline');
    };
    ov.addEventListener('pointerdown', (e) => {
      ov.setPointerCapture(e.pointerId);
      ovDrag = true;
      ovSet(e);
    });
    ov.addEventListener('pointermove', (e) => ovDrag && ovSet(e));
    ov.addEventListener('pointerup', () => (ovDrag = false));
    ov.addEventListener('pointercancel', () => (ovDrag = false));

    // Arrow keys move time from anywhere that is not a text field or the story scroller.
    addEventListener('keydown', (e) => {
      const t = e.target;
      if (t === c) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (t && t.closest && t.closest('[data-keys="own"]')) return;
      if (state.story) return;
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) this.key(e);
    });
  }

  key(e) {
    const stepPx = e.shiftKey ? 120 : 14;
    let used = true;
    if (e.key === 'ArrowRight') this.nudge(stepPx);
    else if (e.key === 'ArrowLeft') this.nudge(-stepPx);
    else if (e.key === 'ArrowUp') this.zoomBy(1.5);
    else if (e.key === 'ArrowDown') this.zoomBy(1 / 1.5);
    else if (e.key === 'PageUp') this.nudge(this.w * 0.5);
    else if (e.key === 'PageDown') this.nudge(-this.w * 0.5);
    else if (e.key === 'Home') setTime(BIG_BANG, 'timeline');
    else if (e.key === 'End') setTime(NOW, 'timeline');
    else used = false;
    if (used) {
      e.preventDefault();
      this.tween = null;
    }
  }

  /** Move time by a number of tape pixels, snapping to whole units when the scale allows it. */
  nudge(px) {
    const ypp = this.yearsPerPixel();
    const step = niceStep(Math.abs(px) * ypp);
    let y = state.y + Math.sign(px) * step;
    if (state.y > -10000 && step >= 1 / 366) {
      // snap to the unit so repeated presses walk through whole days, months or years
      if (step >= 1) y = Math.round(y / step) * step + (step === 1 ? 0.5 : 0);
    }
    setTime(clampYear(y), 'timeline');
    announce(formatMoment(state.y, state.timeRes).main);
  }

  yearsPerPixel() {
    return yearsPerU(state.y) / (this.zoom * this.w);
  }

  syncRes() {
    const res = this.yearsPerPixel() * 4;
    setUI({ timeRes: res, timeZoom: this.zoom }, 'timeline');
  }

  /** Zoom so that a span of `res` years is a few pixels wide (stories use this to show days or centuries). */
  setRes(res) {
    const z = (yearsPerU(state.y) * 4) / (res * this.w);
    this.setZoom(z);
  }

  setZoom(z) {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    this.syncRes();
    this.draw();
  }

  zoomBy(f) {
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (this.zoomTarget ?? this.zoom) * f));
    if (state.capture || state.reducedMotion) {
      this.setZoom(target);
      return;
    }
    this.zoomTarget = target;
    this.animate();
  }

  /** Jump the clock (user action). Optional zoom, or a resolution in years to make readable. */
  jumpTo(y, { zoom, res } = {}) {
    y = clampYear(y);
    if (res) {
      // choose a zoom at which `res` years is a few pixels wide
      const z = (yearsPerU(y) * 4) / (res * this.w);
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    }
    if (state.capture || state.reducedMotion) {
      if (zoom) this.zoom = zoom;
      setTime(y, 'timeline');
      this.syncRes();
      this.draw();
      return;
    }
    this.tween = { u0: yearToU(state.y), u1: yearToU(y), y1: y, t: 0, ms: 420 };
    if (zoom) this.zoomTarget = zoom;
    this.animate();
  }

  jumpToEra(era) {
    const u0 = yearToU(era.start);
    const u1 = yearToU(Math.min(NOW, era.end));
    const focus = era.focus != null ? era.focus : uToYear((u0 + u1) / 2);
    this.jumpTo(focus, { zoom: Math.min(MAX_ZOOM, Math.max(1.2, 0.8 / Math.max(1e-6, u1 - u0))) });
  }

  // Short, user-triggered easing for jumps and zoom buttons. It ends by itself and never runs idle.
  animate() {
    if (this.raf) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      last = now;
      let busy = false;
      if (this.tween) {
        const tw = this.tween;
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.ms);
        const e = 1 - Math.pow(1 - k, 3);
        setTime(k >= 1 ? tw.y1 : uToYear(tw.u0 + (tw.u1 - tw.u0) * e), 'timeline');
        if (k >= 1) this.tween = null;
        else busy = true;
      }
      if (this.zoomTarget != null) {
        const lz = Math.log(this.zoom) + (Math.log(this.zoomTarget) - Math.log(this.zoom)) * Math.min(1, dt / 90);
        if (Math.abs(lz - Math.log(this.zoomTarget)) < 0.01) {
          this.zoom = this.zoomTarget;
          this.zoomTarget = null;
        } else {
          this.zoom = Math.exp(lz);
          busy = true;
        }
        this.syncRes();
        this.draw();
      }
      this.raf = busy ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  // ---- typing a date ----
  openDateInput() {
    this.clockBtn.hidden = true;
    this.dateForm.hidden = false;
    this.dateHint.hidden = true;
    const input = this.dateForm.querySelector('input');
    input.value = '';
    input.focus();
  }

  closeDateInput() {
    if (this.dateForm.hidden) return;
    this.dateForm.hidden = true;
    this.clockBtn.hidden = false;
  }

  async submitDate(e) {
    e.preventDefault();
    const input = this.dateForm.querySelector('input');
    const text = input.value.trim();
    if (!text) return this.closeDateInput();
    let hit = parseMoment(text);
    if (!hit) hit = await this.resolveName(text);
    if (!hit) {
      this.dateHint.textContent = `No date found in “${text}”. Try 1857, 300 BCE, 6 June 1944 or 66 million years ago.`;
      this.dateHint.hidden = false;
      input.select();
      return;
    }
    this.dateHint.hidden = true;
    this.closeDateInput();
    this.jumpTo(hit.y, { res: hit.res });
    this.clockBtn.focus();
  }

  eraAt(y, level) {
    let best = null;
    for (const e of this.eras) {
      if (e.level !== level) continue;
      if (y >= e.start && y <= e.end && (!best || e.end - e.start < best.end - best.start)) best = e;
    }
    return best;
  }

  updateClock() {
    const m = formatMoment(state.y, state.timeRes);
    this.clockBtn.querySelector('.clock-main').textContent = m.main;
    this.clockBtn.querySelector('.clock-sub').textContent = m.sub;
    const top = this.eraAt(state.y, 0);
    const mid = this.eraAt(state.y, 1);
    const fine = this.eraAt(state.y, 2);
    const kid = state.level === 'kid';
    // Explorer: the formal names, broad to fine. Kid: the single most specific plain-words name.
    const names = kid
      ? [(fine && fine.kidName) || (mid && mid.kidName) || (top && top.kidName)]
      : [top && top.name, mid && mid.name, fine && fine.name];
    this.eraLine.textContent = names.filter(Boolean).join(', ');
    if (top) document.documentElement.style.setProperty('--era', top.color);
    document.documentElement.dataset.era = top ? top.id : '';
    this.canvas.setAttribute('aria-valuenow', String(Math.round(yearToU(state.y) * 1000)));
    this.canvas.setAttribute('aria-valuetext', m.sub ? `${m.main}, ${m.sub}` : m.main);
    for (const chip of this.chips.children) chip.classList.toggle('on', !!top && chip.dataset.era === top.id);
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const c of [this.canvas, this.overview]) {
      const w = c.clientWidth;
      const hh = c.clientHeight;
      if (!w || !hh) continue;
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
    }
    this.dpr = dpr;
    this.w = this.canvas.clientWidth || 1;
    this.hgt = this.canvas.clientHeight || 1;
    this.syncRes();
    this.drawOverview();
    this.draw();
  }

  drawOverview() {
    const c = this.overview;
    const ctx = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    for (const era of this.eras) {
      if (era.level !== 0) continue;
      const x0 = yearToU(era.start) * W;
      const x1 = yearToU(era.end) * W;
      ctx.fillStyle = era.color;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0 - 1), H);
    }
  }

  setDensity(bins) {
    this.density = bins;
    this.draw();
  }

  draw() {
    this.updateClock();
    const c = this.canvas;
    const ctx = c.getContext('2d');
    if (!ctx || !this.w) return;
    const dpr = this.dpr;
    const W = this.w;
    const H = this.hgt;
    const Z = this.zoom;
    const uc = yearToU(state.y);
    const X = (u) => (u - uc) * Z * W + W / 2;
    const U = (x) => uc + (x - W / 2) / (Z * W);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const xa = Math.max(0, X(0));
    const xb = Math.min(W, X(1));
    // the tape body
    ctx.fillStyle = 'rgba(244,241,232,0.055)';
    ctx.fillRect(xa, 0, xb - xa, H);

    // ---- era strata: the six great bands, their divisions, and finer named bands in lanes ----
    const rowH = 15;
    const maxRows = H >= 92 ? 5 : H >= 80 ? 4 : 3;
    ctx.textBaseline = 'middle';
    let usedRows = 2;
    for (const era of this.eras) {
      const row = era.level < 2 ? era.level : 2 + (era.lane ?? 0);
      if (era.level === 2 && (era.lane == null || era.lane < 0)) continue;
      if (row >= maxRows) continue;
      const x0 = X(yearToU(era.start));
      const x1 = X(yearToU(Math.min(NOW, era.end)));
      if (x1 < 0 || x0 > W) continue;
      const wpx = x1 - x0;
      if (era.level > 0 && wpx < (era.level === 1 ? 14 : 26)) continue;
      const yTop = row * (rowH + 1);
      const l = Math.max(0, x0);
      const r = Math.min(W, x1);
      ctx.fillStyle = era.color;
      ctx.fillRect(l, yTop, Math.max(1, r - l - 1), rowH);
      if (row + 1 > usedRows) usedRows = row + 1;
      if (r - l > 40) {
        ctx.font = `${era.level === 0 ? 650 : 520} 10.5px Archivo, system-ui, sans-serif`;
        let label = era.short || era.name;
        let tw = ctx.measureText(label).width;
        if (tw >= r - l - 10 && era.short && era.short !== era.name) {
          label = era.short;
          tw = ctx.measureText(label).width;
        }
        if (tw < r - l - 10) {
          ctx.fillStyle = readable(era.color);
          ctx.fillText(label, l + 6, yTop + rowH / 2 + 0.5);
        }
      }
    }
    const strataBottom = usedRows * (rowH + 1);

    // ---- event density: fine laminations where a lot happened ----
    const dTop = strataBottom + 2;
    const dH = H - dTop - 17;
    if (this.density && dH > 4) {
      const n = this.density.length;
      const i0 = Math.max(0, Math.floor(U(0) * n));
      const i1 = Math.min(n - 1, Math.ceil(U(W) * n));
      const binPx = (Z * W) / n;
      ctx.fillStyle = '#f4f1e8';
      for (let i = i0; i <= i1; i++) {
        const v = this.density[i];
        if (!v) continue;
        const x = X(i / n);
        const a = Math.min(1, v / 255);
        ctx.globalAlpha = 0.10 + 0.5 * a;
        const hpx = Math.max(2, dH * (0.25 + 0.75 * a));
        ctx.fillRect(x, dTop + dH - hpx, Math.max(1, Math.min(binPx - 0.5, 3)), hpx);
      }
      ctx.globalAlpha = 1;
    }
    if (this.localEvents && Z > 24) {
      const ys = this.localEvents();
      ctx.fillStyle = '#ffd23f';
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < ys.length; i++) {
        const x = X(yearToU(ys[i]));
        if (x < 0 || x > W) continue;
        ctx.fillRect(x, dTop + dH - 7, 1, 7);
      }
      ctx.globalAlpha = 1;
    }

    // ---- ticks ----
    ctx.font = '500 11px Archivo, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    let lastLabelX = -1e9;
    const chunk = 110;
    const drawn = new Set();
    for (let cx = Math.max(0, xa); cx < Math.min(W, xb); cx += chunk) {
      const yL = uToYear(U(cx));
      const yR = uToYear(U(Math.min(cx + chunk, xb)));
      if (!(yR > yL)) continue;
      const ypp = (yR - yL) / Math.min(chunk, xb - cx);
      const step = niceStep(ypp * 74);
      const deep = yL < -11000;
      // deep time counts back from now; history counts calendar years
      const toV = (y) => (deep ? NOW - y : y);
      const fromV = (v) => (deep ? NOW - v : v);
      const v0 = Math.min(toV(yL), toV(yR));
      const v1 = Math.max(toV(yL), toV(yR));
      const minor = step / (step >= 1 && /^[15]/.test(String(step / 10 ** Math.floor(Math.log10(step)))) ? 5 : 4);
      if (minor / ypp >= 5) {
        ctx.fillStyle = 'rgba(244,241,232,0.28)';
        for (let v = Math.ceil(v0 / minor) * minor; v <= v1; v += minor) {
          const x = X(yearToU(fromV(v)));
          if (x >= xa && x <= xb) ctx.fillRect(Math.round(x), H - 16, 1, 3);
        }
      }
      for (let v = Math.ceil(v0 / step) * step; v <= v1 + step * 1e-9; v += step) {
        const y = fromV(v);
        if (!deep && y === 0) continue; // there is no year zero
        const x = X(yearToU(y));
        const key = Math.round(x);
        if (x < xa - 1 || x > xb + 1 || drawn.has(key)) continue;
        drawn.add(key);
        ctx.fillStyle = 'rgba(244,241,232,0.55)';
        ctx.fillRect(key, H - 17, 1, 5);
        if (x - lastLabelX > 62) {
          const label = tickLabel(y, step);
          ctx.fillStyle = 'rgba(244,241,232,0.78)';
          ctx.fillText(label, key + 4, H - 3);
          lastLabelX = x + ctx.measureText(label).width;
        }
      }
    }

    // ---- the edges of time ----
    ctx.fillStyle = 'rgba(244,241,232,0.5)';
    ctx.font = 'italic 400 12px "Source Serif 4", Georgia, serif';
    if (xa > 60) ctx.fillText('before time', xa - 78, H / 2 + 4);
    if (W - xb > 90) ctx.fillText('the future', xb + 12, H / 2 + 4);

    // overview window
    const ow = this.overviewWrap.clientWidth;
    const left = Math.max(0, (uc - 0.5 / Z) * ow);
    const right = Math.min(ow, (uc + 0.5 / Z) * ow);
    this.viewport.style.transform = `translateX(${left}px)`;
    this.viewport.style.width = `${Math.max(3, right - left)}px`;
    this.viewport.style.setProperty('--needle', `${uc * ow - left}px`);
  }
}
