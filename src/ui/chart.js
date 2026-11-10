// Small data charts for stories and deep views. Every chart names its source.
import { h } from './dom.js';
import { state } from '../core/store.js';

const nf = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })} million` : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

export function renderChart(app, spec) {
  if (typeof spec === 'string') spec = app.charts && app.charts[spec];
  if (!spec) return null;
  const kid = state.level === 'kid';
  const fig = h('figure.chart', { role: 'group', 'aria-label': spec.title }, h('figcaption.chart-title', (kid && spec.kidTitle) || spec.title));
  if (spec.type === 'bars') {
    const max = Math.max(...spec.rows.map((r) => r.hi ?? r.value));
    const list = h('ol.bars');
    for (const r of spec.rows) {
      const pct = ((r.value / max) * 100).toFixed(1);
      const hi = r.hi != null ? ((r.hi / max) * 100).toFixed(1) : null;
      list.append(h('li',
        h('span.bar-label', r.label),
        h('span.bar-track', hi ? h('i.bar-range', { style: { width: `${hi}%` } }) : null, h('i.bar-fill', { style: { width: `${pct}%`, background: r.color || spec.color || 'var(--story, var(--marker))' } })),
        h('span.bar-value', r.text || (r.hi != null ? `${nf(r.value)} to ${nf(r.hi)}` : nf(r.value)), spec.unit ? ` ${spec.unit}` : '')));
    }
    fig.append(list);
  } else if (spec.type === 'line') {
    const W = 420;
    const H = 170;
    const pad = { l: 44, r: 12, t: 10, b: 24 };
    const xs = spec.points.map((p) => p[0]);
    const ys = spec.points.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = spec.min ?? Math.min(0, ...ys);
    const y1 = spec.max ?? Math.max(...ys);
    const X = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
    const d = spec.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${spec.title}. From ${nf(ys[0])} at ${xs[0]} to ${nf(ys[ys.length - 1])} at ${xs[xs.length - 1]}${spec.unit ? ` ${spec.unit}` : ''}.`);
    const el = (name, attrs, text) => {
      const n = document.createElementNS('http://www.w3.org/2000/svg', name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    for (let i = 0; i <= 3; i++) {
      const v = y0 + ((y1 - y0) * i) / 3;
      el('line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), stroke: 'rgba(226,234,244,0.14)' });
      el('text', { x: pad.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'chart-tick' }, nf(Math.round(v * 100) / 100));
    }
    for (const x of spec.ticks || [x0, x1]) el('text', { x: X(x), y: H - 6, 'text-anchor': 'middle', class: 'chart-tick' }, String(x));
    el('path', { d, fill: 'none', stroke: spec.color || 'var(--story, var(--marker))', 'stroke-width': 2.2, 'stroke-linejoin': 'round' });
    for (const m of spec.marks || []) {
      el('circle', { cx: X(m[0]), cy: Y(m[1]), r: 4, fill: 'var(--chalk)' });
      el('text', { x: X(m[0]) + 7, y: Y(m[1]) - 7, class: 'chart-mark' }, m[2]);
    }
    fig.append(svg);
    if (spec.unit) fig.append(h('p.chart-unit', spec.unit));
  }
  if (spec.note) fig.append(h('p.chart-note', spec.note));
  if (spec.source) fig.append(h('p.sources', 'Source: ', h('a', { href: spec.source.url, target: '_blank', rel: 'noopener' }, spec.source.title), spec.source.publisher ? ` (${spec.source.publisher})` : ''));
  return fig;
}
