// Build the application into site/. Data files under site/data, site/tex and site/tiles are produced by
// the numbered pipeline steps and are left alone here.
// Usage: node pipeline/build-site.mjs [--watch]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, ensureDir, writeFileAtomic } from './lib/util.mjs';

const watch = process.argv.includes('--watch');
const SRC = path.join(ROOT, 'src');
const FONT_FILES = [
  ['@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2', 'archivo-latin-wdth-normal.woff2'],
  ['@fontsource-variable/archivo/files/archivo-latin-ext-wdth-normal.woff2', 'archivo-latin-ext-wdth-normal.woff2'],
  ['@fontsource-variable/source-serif-4/files/source-serif-4-latin-opsz-normal.woff2', 'source-serif-4-latin-opsz-normal.woff2'],
  ['@fontsource-variable/source-serif-4/files/source-serif-4-latin-ext-opsz-normal.woff2', 'source-serif-4-latin-ext-opsz-normal.woff2'],
  ['@fontsource-variable/source-serif-4/files/source-serif-4-latin-opsz-italic.woff2', 'source-serif-4-latin-opsz-italic.woff2'],
  ['@fontsource/andika/files/andika-latin-400-normal.woff2', 'andika-latin-400-normal.woff2'],
  ['@fontsource/andika/files/andika-latin-700-normal.woff2', 'andika-latin-700-normal.woff2'],
];

async function build() {
  const t0 = Date.now();
  // Curated content is compiled and validated first; a broken record stops the build before it can ship.
  // India in depth compiles first so that the manifest written by the next step can announce it.
  execFileSync(process.execPath, [path.join(ROOT, 'pipeline', '13-india.mjs')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'pipeline', '14-models.mjs')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'pipeline', '15-wide.mjs')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(ROOT, 'pipeline', '12-curated.mjs')], { stdio: 'inherit' });
  const tmp = path.join(SITE, `assets.tmp-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  ensureDir(tmp);
  const result = await esbuild.build({
    entryPoints: { app: path.join(SRC, 'main.js') },
    outdir: tmp,
    bundle: true,
    splitting: true,
    format: 'esm',
    target: ['es2020'],
    minify: true,
    legalComments: 'none',
    chunkNames: 'c/[name]-[hash]',
    external: ['fonts/*'],
    loader: { '.json': 'json', '.glsl': 'text', '.svg': 'text' },
    metafile: true,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  ensureDir(path.join(tmp, 'fonts'));
  for (const [from, to] of FONT_FILES) fs.copyFileSync(path.join(ROOT, 'node_modules', from), path.join(tmp, 'fonts', to));
  for (const f of fs.readdirSync(path.join(SRC, 'static'))) {
    if (f === 'index.html') continue;
    fs.cpSync(path.join(SRC, 'static', f), path.join(tmp, f), { recursive: true });
  }
  // Keep generated assets that live in assets/ but are produced elsewhere (share image and the like).
  const live = path.join(SITE, 'assets');
  for (const keep of ['share.jpg']) {
    if (fs.existsSync(path.join(live, keep))) fs.copyFileSync(path.join(live, keep), path.join(tmp, keep));
  }
  // Swap the new assets in. The directory rename keeps the site servable at every instant.
  const old = path.join(SITE, `assets.old-${process.pid}`);
  if (fs.existsSync(live)) fs.renameSync(live, old);
  fs.renameSync(tmp, live);
  fs.rmSync(old, { recursive: true, force: true });

  const hash = crypto.createHash('sha1');
  for (const f of ['app.js', 'app.css']) hash.update(fs.readFileSync(path.join(live, f)));
  const v = hash.digest('hex').slice(0, 10);
  let html = fs.readFileSync(path.join(SRC, 'static', 'index.html'), 'utf8');
  html = html.replace('assets/app.css', `assets/app.css?v=${v}`).replace('assets/app.js', `assets/app.js?v=${v}`);
  writeFileAtomic(path.join(SITE, 'index.html'), html);
  // The project's own documents ship with the site so sources and licences are one click away.
  ensureDir(path.join(SITE, 'about'));
  for (const doc of ['README.md', 'LICENSES.md', 'DECISIONS.md', 'DESIGN.md', 'FINAL.md']) {
    const from = path.join(ROOT, doc);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(SITE, 'about', doc));
  }

  const entry = Object.entries(result.metafile.outputs).find(([k]) => k.endsWith('app.js'));
  const total = Object.values(result.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
  console.log(`built in ${Date.now() - t0} ms: app.js ${(entry[1].bytes / 1024).toFixed(0)} KB, all assets ${(total / 1024).toFixed(0)} KB`);
}

await build();
if (watch) {
  let timer;
  const again = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 150);
  };
  fs.watch(SRC, { recursive: true }, again);
  fs.watch(path.join(ROOT, 'content'), { recursive: true }, again);
  console.log('watching src/ and content/');
}
