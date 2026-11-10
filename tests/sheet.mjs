// Contact sheets: node tests/sheet.mjs out.jpg [--cols 3] [--w 640] a.png b.png ...
// Each cell carries its file name so a reviewer can find the full-size screenshot.
import sharp from 'sharp';
import path from 'node:path';

export async function contactSheet(files, out, { cols = 3, w = 640, label = true } = {}) {
  if (!files.length) return null;
  const cells = [];
  for (const f of files) {
    const img = sharp(f).resize({ width: w });
    const buf = await img.png().toBuffer();
    const meta = await sharp(buf).metadata();
    cells.push({ buf, h: meta.height, name: path.basename(f).replace(/\.(png|jpg)$/, '') });
  }
  const rows = Math.ceil(cells.length / cols);
  const pad = 6;
  const lab = label ? 20 : 0;
  const rowH = [];
  for (let r = 0; r < rows; r++) rowH.push(Math.max(...cells.slice(r * cols, r * cols + cols).map((c) => c.h)) + lab);
  const W = cols * (w + pad) + pad;
  const H = rowH.reduce((a, b) => a + b + pad, pad);
  const comp = [];
  let y = pad;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (!cell) continue;
      const x = pad + c * (w + pad);
      comp.push({ input: cell.buf, left: x, top: y + lab });
      if (label) {
        const esc = cell.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${lab}"><rect width="100%" height="100%" fill="#07111d"/><text x="4" y="14" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#f4f1e8">${esc}</text></svg>`;
        comp.push({ input: Buffer.from(svg), left: x, top: y });
      }
    }
    y += rowH[r] + pad;
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 80 }).toFile(out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const out = args.shift();
  const opt = {};
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cols') opt.cols = Number(args[++i]);
    else if (args[i] === '--w') opt.w = Number(args[++i]);
    else files.push(args[i]);
  }
  await contactSheet(files, out, opt);
  console.log(out);
}
