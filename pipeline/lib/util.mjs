// Shared helpers for every pipeline step. All paths are relative to the project root.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW = path.join(ROOT, 'data-raw');
export const SITE = path.join(ROOT, 'site');
export const DATA = path.join(SITE, 'data');
export const CONTENT = path.join(ROOT, 'content');
export const UA = 'EarthWholeStory/1.0 (open educational static site build; no tracking)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function rawPath(...parts) {
  const p = path.join(RAW, ...parts);
  ensureDir(path.dirname(p));
  return p;
}

export function dataPath(...parts) {
  const p = path.join(DATA, ...parts);
  ensureDir(path.dirname(p));
  return p;
}

export function exists(p) {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

export function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Atomic write so a half-written file can never be served. */
export function writeFileAtomic(p, data) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}

export function writeJSON(p, obj, pretty = false) {
  writeFileAtomic(p, pretty ? JSON.stringify(obj, null, 1) : JSON.stringify(obj));
}

/** fetch with retries, polite backoff, and a descriptive user agent. */
export async function fetchRetry(url, opts = {}, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), opts.timeoutMs || 120000);
      const res = await fetch(url, {
        ...opts,
        signal: ctl.signal,
        headers: { 'User-Agent': UA, Accept: '*/*', ...(opts.headers || {}) },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** i;
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        await sleep(Math.min(wait, 60000));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw lastErr;
}

export async function fetchJSON(url, opts = {}, tries = 5) {
  const res = await fetchRetry(url, opts, tries);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchText(url, opts = {}, tries = 5) {
  const res = await fetchRetry(url, opts, tries);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Download to data-raw unless it is already there. Returns the local path. */
export async function download(url, dest, { force = false, quiet = false } = {}) {
  if (!force && exists(dest)) return dest;
  ensureDir(path.dirname(dest));
  const res = await fetchRetry(url, { timeoutMs: 30 * 60 * 1000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const tmp = `${dest}.part`;
  await streamPipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  await fsp.rename(tmp, dest);
  if (!quiet) console.log(`downloaded ${path.relative(ROOT, dest)} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
  return dest;
}

/** Run async jobs with bounded concurrency. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Decimal year from an ISO-like date string (handles negative years). */
export function decimalYear(year, month = 1, day = 1) {
  const m = Math.max(1, Math.min(12, month || 1));
  const d = Math.max(1, Math.min(31, day || 1));
  const doy = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m - 1] + (d - 1);
  return year + doy / 365.25;
}

export function round(n, digits = 3) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
