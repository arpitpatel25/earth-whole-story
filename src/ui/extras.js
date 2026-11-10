// Interface sounds, sharing, the page title, and the loaders for India in depth and the 3D scenes.
import { state, on, setUI } from '../core/store.js';
import { h, icon, ICONS, clear, announce } from './dom.js';
import { formatMoment } from '../core/time.js';
import { buildURL } from '../core/url.js';
import { fetchJSON } from '../data/net.js';

// ------------------------------------------------------------------------------------------------
export async function init(app, { Sheet }) {
  const engine = app.engine;

  // ---- interface sounds (the music itself, and its control, live in src/audio/music.js) ----
  const sound = app.music;
  let lastTickU = 0;
  on(['y'], (st, source) => {
    if (source === 'timeline' && sound.status === 'playing') {
      const px = Math.round(state.y / Math.max(1e-9, state.timeRes * 4));
      if (px !== lastTickU) {
        lastTickU = px;
        sound.blip('tick');
      }
    }
  });
  on(['event'], () => sound.blip(state.event ? 'pin' : 'close'));
  on(['story'], () => sound.blip('open'));

  // ---- sharing ----
  const share = new Sheet(app, { id: 'share', label: 'Share', title: 'Share this exact moment', iconPath: ICONS.share });
  app.share = share;
  const describe = () => {
    const m = formatMoment(state.y, state.timeRes);
    const place = app.geo.countries && engine.env && engine.env.modern > 0.5 ? app.geo.describe(state.lon, state.lat).text : null;
    const story = app.story && app.story.story ? app.story.story.title : null;
    const title = story || (state.event && app.deep.el.getAttribute('aria-label')) || null;
    return { moment: m.main, place, title };
  };
  const pageTitle = () => {
    const d = describe();
    document.title = `${[d.title && d.title !== 'Details' ? d.title : null, d.moment, d.place].filter(Boolean).join(', ')} | EARTH: The Whole Story`;
  };
  let titleTimer = 0;
  on(['y', 'lat', 'lon', 'event', 'story', 'step'], () => {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(pageTitle, 400);
  });
  pageTitle();

  async function shareImage() {
    // Draw the current frame, then compose a 1200 x 630 card with the moment written on it.
    engine.renderOnce();
    const src = engine.canvas;
    const W = 1200;
    const H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const scale = Math.max(W / src.width, H / src.height);
    const sw = W / scale;
    const sh = H / scale;
    g.drawImage(src, (src.width - sw) / 2, Math.max(0, (src.height - sh) / 2 - src.height * 0.04), sw, sh, 0, 0, W, H);
    const grad = g.createLinearGradient(0, H * 0.45, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.88)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const d = describe();
    await document.fonts.ready;
    g.fillStyle = '#f4f1e8';
    g.textBaseline = 'alphabetic';
    g.font = "340 76px 'Source Serif 4', Georgia, serif";
    g.fillText(d.moment, 56, H - 120);
    g.font = "600 30px Archivo, Arial, sans-serif";
    const sub = [d.title && d.title !== 'Details' ? d.title : null, d.place].filter(Boolean).join(', ');
    if (sub) g.fillText(sub.length > 62 ? `${sub.slice(0, 60)}…` : sub, 58, H - 72);
    g.fillStyle = '#ffd23f';
    g.fillRect(56, H - 48, 64, 4);
    g.fillStyle = '#aab7c6';
    g.font = "italic 400 22px 'Source Serif 4', Georgia, serif";
    g.fillText('EARTH: The Whole Story', 136, H - 38);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }
  app.shareImage = shareImage;

  share.onOpen = () => {
    const url = new URL(buildURL({ ...state, capture: false }), location.href).href;
    const d = describe();
    const status = h('p.here-note', { role: 'status' });
    const field = h('input.sheet-input', { type: 'text', readOnly: true, value: url, 'aria-label': 'Link to this exact view', onfocus: (e) => e.target.select() });
    const preview = h('div.share-preview', h('div.skeleton', h('i.wide')));
    // stories, trails, 3D scenes and curated events also have a static page whose link unfurls with its own preview card
    const card = state.story ? `story-${state.story}` : state.trail ? `trail-${state.trail}` : state.event && /^model:/.test(state.event) ? `model-${state.event.slice(6)}` : state.event && /^wide:/.test(state.event) ? `event-${state.event.slice(5).split('/')[0]}` : state.event && /^iera:/.test(state.event) ? `india-${state.event.slice(5)}` : null;
    const cardURL = card ? new URL(`s/${card}.html`, location.href).href : null;
    // native append() would print a missing part as the word "null", so the parts are filtered first
    clear(share.body).append(...[
      h('p.sheet-lead', [d.title && d.title !== 'Details' ? d.title : null, d.moment, d.place].filter(Boolean).join(', ')),
      field,
      cardURL ? h('p.here-note', 'For chat apps and social sites, this link opens the same place and shows a preview card: ', h('a', { href: cardURL }, cardURL.replace(/^https?:\/\//, ''))) : null,
      h('div.sheet-actions',
        h('button.btn.btn-primary', { type: 'button', onclick: async () => {
          try {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Link copied.';
          } catch {
            field.select();
            status.textContent = 'Press Ctrl or Cmd + C to copy the selected link.';
          }
        } }, icon(ICONS.link, 16), 'Copy link'),
        navigator.share ? h('button.btn', { type: 'button', onclick: () => navigator.share({ title: document.title, url }).catch(() => {}) }, icon(ICONS.share, 16), 'Share…') : null,
        h('button.btn', { type: 'button', onclick: async () => {
          const blob = await shareImage();
          const a = h('a', { href: URL.createObjectURL(blob), download: `earth-${d.moment.replace(/[^\w]+/g, '-').toLowerCase()}.png` });
          document.body.append(a);
          a.click();
          a.remove();
          status.textContent = 'Image saved.';
        } }, icon(ICONS.image, 16), 'Save image')),
      status, preview,
      h('p.here-note', 'The link restores this exact time, place, lens and open record. The image is made in your browser; nothing is uploaded.')].filter(Boolean));
    shareImage().then((blob) => {
      if (!blob) return;
      clear(preview).append(h('img', { src: URL.createObjectURL(blob), alt: `Preview image: ${d.moment}`, width: 1200, height: 630 }));
    });
  };

  // ---- attribution, always one click away ----
  const about = new Sheet(app, { id: 'about', label: 'Sources', title: 'Sources and credits', iconPath: ICONS.info });
  about.onOpen = async () => {
    const body = clear(about.body);
    body.append(h('p.sheet-lead', 'Everything on this globe comes from open data and openly licensed writing. Hand-written passages list their sources beside them.'));
    const credits = await fetchJSON('data/credits.json').catch(() => null);
    if (credits) {
      body.append(h('ul.credits', credits.map((c) => h('li', h('strong', c.what), ': ', h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.title), c.author ? `, ${c.author}` : '', h('span.lic', ` ${c.license}`)))));
    }
    body.append(h('p.here-note', 'Territory outlines are from historical-basemaps (GPL-3.0) and CShapes 2.0 (CC BY-NC-SA 4.0). Lead sentences marked "From Wikipedia" are CC BY-SA 4.0. Both are stored in their own folders so they can be separated from the rest.'),
      h('p.sheet-links', h('a', { href: 'about/LICENSES.md', target: '_blank', rel: 'noopener' }, 'Full licence list'), h('a', { href: 'about/README.md', target: '_blank', rel: 'noopener' }, 'How this site was built'), h('a', { href: 'about/DECISIONS.md', target: '_blank', rel: 'noopener' }, 'Decisions and limits')));
  };

  // ---- India in depth and 3D scenes live in their own chunks ----
  for (const load of [() => import('./wide.js'), () => import('./country.js'), () => import('./life.js'), () => import('./india.js'), () => import('../models/viewer.js')]) {
    try {
      const m = await load();
      await m.init(app, { Sheet });
    } catch (e) {
      engine.reportError(`module failed to load: ${e.message}`);
    }
  }
}
