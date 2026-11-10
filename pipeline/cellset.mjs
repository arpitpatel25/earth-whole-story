// Replace or add India matrix cells: node pipeline/cellset.mjs <blocks.txt> [target-file-for-new-cells]
// Blocks whose "@icell id" already exists in content/india/cells are replaced in place; new ones are appended to the target.
import fs from 'node:fs';
import path from 'node:path';
const dir = 'content/india/cells';
const [src, target] = process.argv.slice(2);
const blocks = fs.readFileSync(src, 'utf8').split(/\n(?=@icell )/).map((b) => b.trim()).filter((b) => b.startsWith('@icell '));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => path.join(dir, f));
const text = Object.fromEntries(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
let replaced = 0, added = 0;
for (const b of blocks) {
  const id = b.split('\n')[0].trim();
  let done = false;
  for (const f of files) {
    const parts = text[f].split(/\n(?=@icell )/);
    const i = parts.findIndex((p) => p.split('\n')[0].trim() === id);
    if (i >= 0) { parts[i] = b + '\n'; text[f] = parts.join('\n'); done = true; replaced++; break; }
  }
  if (!done) {
    if (!target) { console.error('new cell needs a target file:', id); process.exit(1); }
    const t = path.join(dir, target);
    text[t] = (text[t] || '').replace(/\s*$/, '\n') + '\n' + b + '\n';
    if (!files.includes(t)) files.push(t);
    added++;
  }
}
for (const f of files) fs.writeFileSync(f, text[f].replace(/\n{3,}/g, '\n\n'));
console.log(`cells: ${replaced} replaced, ${added} added`);
