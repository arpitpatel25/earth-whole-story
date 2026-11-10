// Step 02 (part 2): mesh the exported plate polygons for the browser.
// Output site/data/plates/mesh.bin:
//   uint32 headerLength, header JSON, then per layer: int16 xyz positions, uint16 plate, uint16 begin, uint16 end, uint32 indices.
import fs from 'node:fs';
import path from 'node:path';
import { RAW, DATA, readJSON, writeFileAtomic } from './lib/util.mjs';
import { meshPolygon } from '../src/shared/spheremesh.js';

const { features } = readJSON(path.join(RAW, 'plates', 'polygons.json'));
const layers = { continent: [], coast: [] };
for (const f of features) layers[f.layer].push(f);

const chunks = [];
const header = { layers: {} };
let offset = 0;
const push = (typed) => {
  const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (buf.length % 4)) % 4;
  chunks.push(buf);
  if (pad) chunks.push(Buffer.alloc(pad));
  const at = offset;
  offset += buf.length + pad;
  return at;
};

for (const [name, feats] of Object.entries(layers)) {
  const pos = [];
  const plate = [];
  const begin = [];
  const end = [];
  const idx = [];
  let skipped = 0;
  // Larger polygons first so small islands draw on top of anything they overlap.
  feats.sort((a, b) => b.area - a.area);
  for (const f of feats) {
    const m = meshPolygon(f.rings, 3);
    if (!m) {
      skipped++;
      continue;
    }
    const base = pos.length / 3;
    for (const p of m.positions) pos.push(Math.round(p * 32767));
    const n = m.positions.length / 3;
    for (let i = 0; i < n; i++) {
      plate.push(f.plate);
      begin.push(Math.min(65535, Math.round(f.begin)));
      end.push(Math.max(0, Math.round(f.end)));
    }
    for (const i of m.indices) idx.push(base + i);
  }
  header.layers[name] = {
    vertices: pos.length / 3,
    triangles: idx.length / 3,
    position: push(new Int16Array(pos)),
    plate: push(new Uint16Array(plate)),
    begin: push(new Uint16Array(begin)),
    end: push(new Uint16Array(end)),
    index: push(new Uint32Array(idx)),
  };
  console.log(`${name}: ${feats.length} polygons (${skipped} skipped), ${pos.length / 3} vertices, ${idx.length / 3} triangles`);
}

const headBuf = Buffer.from(JSON.stringify(header));
const headPad = (4 - (headBuf.length % 4)) % 4;
const len = Buffer.alloc(4);
len.writeUInt32LE(headBuf.length + headPad);
const out = Buffer.concat([len, headBuf, Buffer.alloc(headPad, 0x20), ...chunks]);
writeFileAtomic(path.join(DATA, 'plates', 'mesh.bin'), out);
console.log(`mesh.bin ${(out.length / 1e6).toFixed(2)} MB`);
