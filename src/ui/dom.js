// Tiny DOM helpers. No framework: the interface is a handful of long-lived panels.

/** h('div.panel#id', { onclick, 'aria-label': '...' }, child, 'text', [more]) */
export function h(spec, props, ...children) {
  const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '#') el.id = part.slice(1);
      else el.classList.add(part.slice(1));
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'form' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Inline SVG icon from a path string (24px grid, stroke-based). */
export function icon(d, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const part of d.split('|')) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', part);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M20 20l-4-4',
  close: 'M6 6l12 12|M18 6L6 18',
  plus: 'M12 5v14|M5 12h14',
  minus: 'M5 12h14',
  share: 'M12 3v12|M8 7l4-4 4 4|M5 13v6h14v-6',
  sound: 'M4 10v4h3l5 4V6L7 10z|M16 9a4 4 0 0 1 0 6|M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 10v4h3l5 4V6L7 10z|M16 9l5 6|M21 9l-5 6',
  layers: 'M12 3l9 5-9 5-9-5z|M3 13l9 5 9-5',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M15.5 8.5l-2 5-5 2 2-5z',
  dice: 'M5 5h14v14H5z|M9 9h.01|M15 15h.01|M15 9h.01|M9 15h.01|M12 12h.01',
  calendar: 'M5 6h14v14H5z|M5 10h14|M9 3v5|M15 3v5',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11z|M12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M8 17h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8',
  book: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z|M5 16a4 4 0 0 1 4-4h10',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M3 12h18|M12 3c3 3.200 3 14.800 0 18|M12 3c-3 3.200-3 14.800 0 18',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1|M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  image: 'M4 5h16v14H4z|M4 16l5-5 4 4 3-3 4 4|M15 9h.01',
  cube: 'M12 3l8 4.500v9L12 21l-8-4.500v-9z|M12 12l8-4.500|M12 12v9|M12 12L4 7.500',
  menu: 'M4 7h16|M4 12h16|M4 17h16',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z|M12 2v4|M12 18v4|M2 12h4|M18 12h4',
  solar: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M3 12c0-2.500 4-4.500 9-4.500s9 2 9 4.500-4 4.500-9 4.500-9-2-9-4.500z',
  play: 'M7 5l12 7-12 7z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|M12 11v6|M12 7.500v.01',
  external: 'M14 4h6v6|M20 4l-9 9|M18 14v6H4V6h6',
  check: 'M5 12.500l4.500 4.500L19 7.500',
};

/** Announce a message to screen readers without moving focus. */
let liveEl;
export function announce(msg) {
  if (!liveEl) {
    liveEl = h('div.sr-only', { 'aria-live': 'polite', role: 'status' });
    document.body.append(liveEl);
  }
  liveEl.textContent = '';
  requestAnimationFrame(() => {
    liveEl.textContent = msg;
  });
}

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
