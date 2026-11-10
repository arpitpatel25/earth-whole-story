// Acceptance test 27: deployed size and file limits (section 15), and no secrets or absolute local paths.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib/curated.mjs';

const GB = 1024 ** 3, MB = 1024 ** 2;
let total = 0, count = 0;
let biggest = { size: 0, file: '' };
const walk = (dir, fn) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p, fn); else fn(p); } };
walk(path.join(ROOT, 'site'), (p) => { const s = fs.statSync(p).size; total += s; count++; if (s > biggest.size) biggest = { size: s, file: path.relative(ROOT, p) }; });
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
check(total < 5 * GB, `site/ is ${(total / MB).toFixed(0)} MB in ${count.toLocaleString('en-US')} files (limit 5 GB)`);
check(biggest.size < 25 * MB, `largest file is ${(biggest.size / MB).toFixed(1)} MB: ${biggest.file} (limit 25 MB)`);
const du = Number(execFileSync('du', ['-sk', ROOT]).toString().split(/\s+/)[0]) * 1024;
check(du < 15 * GB, `the whole folder is ${(du / GB).toFixed(2)} GB (limit 15 GB)`);
// what the first view has to download before anything is drawn: the page, the bundle, the styles and the fonts it names
const first = ['index.html', 'assets/app.js', 'assets/app.css'].map((f) => fs.statSync(path.join(ROOT, 'site', f)).size).reduce((a, b) => a + b, 0);
check(first < 5 * MB, `the page, script and styles are ${(first / 1024).toFixed(0)} KB before compression (the measured first-view download is in tests/perf-log.md)`);
check(fs.existsSync(path.join(ROOT, 'site', 'index.html')), 'site/index.html exists and is a static file');
const html = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
check(!/(src|href)="https?:\/\//.test(html.replace(/<meta[^>]+>/g, '')), 'index.html loads nothing from another origin');

// secrets and local paths, in everything that ships or is committed
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
const PATTERNS = [[/\/Users\/[A-Za-z]/, 'an absolute macOS path'], [/\/home\/[a-z][a-z0-9_-]+\//, 'an absolute Linux path'], [/[A-Za-z]:\\\\Users\\\\/, 'an absolute Windows path'], [/zodpatel|arpitpatel/i, 'a local user name'], [/[\w.+-]+@gmail\.com/, 'a personal email address'], [/(api|secret|access|auth)[_-]?(key|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}/i, 'something that looks like a key'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'], [/\b(ghp|gho|sk|pk)_[A-Za-z0-9]{20,}/, 'a token'], [/AKIA[0-9A-Z]{16}/, 'an AWS key id']];
const found = [];
let scanned = 0;
for (const f of tracked) {
  if (/\.(png|jpg|jpeg|webp|bin|woff2|ktx2|gz|zip|ico|mp3|ogg)$/i.test(f) || /^tests\/screenshots\//.test(f)) continue;
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).size > 30 * MB) continue;
  const text = fs.readFileSync(p, 'utf8');
  scanned++;
  for (const [re, what] of PATTERNS) {
    const m = re.exec(text);
    if (m && !(f === 'tests/check-size.mjs')) found.push(`${f}: ${what} ("${text.slice(Math.max(0, m.index - 20), m.index + 40).replace(/\s+/g, ' ')}")`);
  }
}
check(!found.length, `no secrets or absolute local paths in ${scanned.toLocaleString('en-US')} tracked text files`);
if (found.length) console.log(`  ${found.slice(0, 20).join('\n  ')}`);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'size.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass: !fails.length, siteBytes: total, files: count, biggest, folderBytes: du, firstBytes: first, found }, null, 2));
process.exit(fails.length ? 1 : 0);
