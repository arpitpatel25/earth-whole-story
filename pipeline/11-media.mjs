// Step 11: images for curated content, from Wikimedia Commons.
// Every "img: File:Name | caption" line in content/ is resolved to its licence, author and source page.
// Files that are not public domain, CC0, CC BY or CC BY-SA stop the build.
// Output: site/media/<slug>.jpg and data-raw/media/index.json
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, RAW, SITE, CONTENT, ensureDir, fetchRetry, slugify, writeJSON, readJSON, exists, sleep } from './lib/util.mjs';
import { readContentDir } from './lib/content.mjs';
import { fileInfo, licenseOK } from './lib/commons.mjs';

const want = new Set();
for (const r of readContentDir(CONTENT)) for (const v of r.img || []) want.add(v.split('|')[0].trim());
const extra = path.join(CONTENT, 'media-extra.txt');
if (fs.existsSync(extra)) for (const l of fs.readFileSync(extra, 'utf8').split('\n')) if (l.trim().startsWith('File:')) want.add(l.trim());

const indexFile = path.join(ensureDir(path.join(RAW, 'media')), 'index.json');
const index = exists(indexFile) ? readJSON(indexFile) : {};
const outDir = ensureDir(path.join(SITE, 'media'));
const todo = [...want].filter((f) => !index[f] || !fs.existsSync(path.join(SITE, index[f].src)));
const info = todo.length ? await fileInfo(todo, 1400) : {};
let bad = 0;
for (const f of todo) {
  const v = info[f];
  if (!v || v.missing) {
    console.error(`MISSING on Commons: ${f}`);
    bad++;
    continue;
  }
  if (!licenseOK(v.license)) {
    console.error(`LICENCE NOT ALLOWED (${v.license}): ${f}`);
    bad++;
    continue;
  }
  const slug = slugify(f.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''));
  const dest = path.join(outDir, `${slug}.jpg`);
  try {
    const res = await fetchRetry(v.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const img = sharp(buf).rotate().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true });
    const meta = await img.flatten({ background: '#efe9da' }).jpeg({ quality: 80, mozjpeg: true }).toFile(dest);
    const by = v.artist && !/^unknown/i.test(v.artist) ? v.artist : v.credit || 'Unknown author';
    index[f] = { src: `media/${slug}.jpg`, page: v.page, license: v.license, credit: `${by}, via Wikimedia Commons`, description: v.description, date: v.date, w: meta.width, h: meta.height };
    console.log(`ok ${f} [${v.license}] ${(meta.size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.error(`FAILED ${f}: ${e.message}`);
    bad++;
  }
  await sleep(150);
}
writeJSON(indexFile, index, true);
console.log(`media: ${Object.keys(index).length} images indexed, ${todo.length} fetched, ${bad} problems`);
if (bad) process.exit(1);
