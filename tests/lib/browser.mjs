// Shared Playwright helpers: a static server on a free port and a WebGL-capable Chromium.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../../pipeline/serve.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = path.join(ROOT, 'tests', 'screenshots');

export async function startServer() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

export async function launch({ headless = true } = {}) {
  return chromium.launch({
    headless,
    args: [
      '--use-angle=metal',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
}

export const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  laptop: { width: 1280, height: 720, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Open the site with console and page errors collected. */
export async function openPage(browser, base, { query = '?capture=1', view = 'desktop', storage } = {}) {
  const context = await browser.newContext({ viewport: VIEWS[view], deviceScaleFactor: VIEWS[view].deviceScaleFactor, isMobile: !!VIEWS[view].isMobile, hasTouch: !!VIEWS[view].hasTouch, storageState: storage });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure() ? r.failure().errorText : ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  await page.goto(`${base}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__earthCapture && window.__earthCapture.status().ready !== undefined, null, { timeout: 30000 });
  return { page, context, errors };
}

export async function gotoView(page, view) {
  return page.evaluate(async (v) => {
    const s = await window.__earthCapture.goto(v);
    await window.__earthCapture.renderFrame();
    return s;
  }, view);
}

export function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** The nine views every build must render (spec section 17). */
export const CAPTURE_VIEWS = [
  { name: '01-big-bang', y: -13800000000 },
  { name: '02-molten-earth', y: -4500000000 },
  { name: '03-pangaea', y: -250000000 },
  { name: '04-chicxulub', y: -66000000 },
  { name: '05-ice-age', y: -20000 },
  { name: '06-indus', y: -2500, lat: 27.3, lon: 68.1, altKm: 500 },
  { name: '07-black-death', y: 1347, lat: 45, lon: 30, altKm: 6000 },
  { name: '08-stalingrad', y: 1942.8, lat: 48.7, lon: 44.5, altKm: 2500 },
  { name: '09-today-india', y: 2026, lat: 20, lon: 78, altKm: 12000 },
];
