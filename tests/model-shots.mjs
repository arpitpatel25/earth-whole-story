// Screenshots of every 3D scene: node tests/model-shots.mjs [--phone] [id ...]
// Opens each scene in the real viewer, selects a part, and reports console errors and empty scenes.
import path from 'node:path';
import { startServer, launch, openPage, SHOTS, ensureDir } from './lib/browser.mjs';
import { contactSheet } from './sheet.mjs';

const args = process.argv.slice(2);
const phone = args.includes('--phone');
const only = args.filter((a) => !a.startsWith('--'));
const out = path.join(SHOTS, 'models');
ensureDir(out);
const srv = await startServer();
const browser = await launch();
const { page, errors } = await openPage(browser, srv.base, { query: '?capture=1', view: phone ? 'phone' : 'laptop' });
await page.waitForFunction(() => window.__earth && window.__earth.openModel, null, { timeout: 30000 });
const ids = await page.evaluate(() => window.__earth.modelList.map((m) => m.id));
const files = [];
let bad = 0;
for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  const info = await page.evaluate(async (mid) => {
    const app = window.__earth;
    app.openModel(mid);
    const v = app.modelViewer;
    const m = app.models[mid];
    v.select(m.parts[Math.min(1, m.parts.length - 1)].id);
    v.renderOnce();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    v.renderOnce();
    // how much of the canvas the model covers: an empty or tiny render is a failure
    const gl = v.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    v.renderer.render(v.scene, v.camera);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let hit = 0;
    for (let i = 3; i < px.length; i += 16) if (px[i] > 8) hit++;
    return { parts: m.parts.length, dots: v.dotEls.size, found: [...v.parts.keys()].length, cover: hit / (px.length / 16), meshes: v.parts.size ? [...v.parts.values()].reduce((n, p) => n + p.meshes.length, 0) : 0 };
  }, id);
  const file = path.join(out, `${id}${phone ? '-phone' : ''}.png`);
  await page.screenshot({ path: file });
  files.push(file);
  const ok = info.found === info.parts && info.cover > 0.02 && info.meshes > 0;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: ${info.parts} parts, ${info.meshes} part meshes, covers ${(info.cover * 100).toFixed(0)}% of the stage`);
}
await page.evaluate(() => window.__earth.modelViewer.close());
for (let i = 0; i < files.length; i += 6) await contactSheet(files.slice(i, i + 6), path.join(SHOTS, `models-sheet-${phone ? 'phone-' : ''}${String(i / 6 + 1).padStart(2, '0')}.jpg`), { cols: phone ? 6 : 3, w: phone ? 300 : 640 });
const uniq = [...new Set(errors)];
console.log(uniq.length ? `ERRORS:\n${uniq.join('\n')}` : 'no console errors');
await browser.close();
await srv.close();
process.exit(uniq.length || bad ? 1 : 0);
