// The compact authoring format used for all curated content in content/*.txt.
//
//   @event plassey
//   title: Battle of Plassey
//   date: 1757-06-23            (or  y: -2500   |  date: 66 mya  |  date: 1526..1857)
//   place: Palashi              (looked up in retrieved sources; never typed from memory)
//   lenses: war, power
//   src: Battle of Plassey      (a Wikipedia article title, or  url | title | publisher)
//   S: one-sentence summary
//   B: a body paragraph         (repeat B: for more paragraphs)
//   K: the same, rewritten for ages 8 to 12
//
// A record starts with "@type id". Keys are "key: value" lines; a line that does not start a new key
// continues the previous one. Repeatable keys (B, K, src, quote, scene keys) collect into arrays.
import fs from 'node:fs';
import path from 'node:path';
import { partsToYear } from '../../src/core/time.js';

const REPEAT = new Set(['B', 'K', 'T', 'src', 'quote', 'part', 'show', 'stop', 'q', 'fh', 'img', 'chart', 'cell']);

export function parseContent(text, file = '') {
  const records = [];
  let rec = null;
  let key = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, n) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || /^\s*#/.test(line)) {
      key = null;
      return;
    }
    const head = /^@(\w[\w-]*)\s+(\S+)\s*$/.exec(line);
    if (head) {
      rec = { _type: head[1], id: head[2], _file: file, _line: n + 1 };
      records.push(rec);
      key = null;
      return;
    }
    if (!rec) throw new Error(`${file}:${n + 1}: text before the first @record`);
    const kv = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
    if (kv && !/^https?$/i.test(kv[1])) {
      key = kv[1];
      const val = kv[2].trim();
      if (REPEAT.has(key)) (rec[key] = rec[key] || []).push(val);
      else if (rec[key] !== undefined) throw new Error(`${file}:${n + 1}: duplicate key "${key}" in ${rec.id}`);
      else rec[key] = val;
      return;
    }
    if (!key) throw new Error(`${file}:${n + 1}: cannot read line: ${line.slice(0, 60)}`);
    if (REPEAT.has(key)) rec[key][rec[key].length - 1] += ` ${line.trim()}`;
    else rec[key] += ` ${line.trim()}`;
  });
  return records;
}

export function readContentDir(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...readContentDir(p));
    else if (f.endsWith('.txt')) out.push(...parseContent(fs.readFileSync(p, 'utf8'), path.relative(process.cwd(), p)));
  }
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const NOW = 2026.86;

/** One date expression -> { y, precision }. */
export function parseDate(s) {
  const t = String(s).trim().toLowerCase().replace(/,/g, '');
  let m;
  if ((m = /^(c\.? ?|about |around |~)?(-?\d+(?:\.\d+)?) ?(bya|gya|ga|mya|ma|kya|ka)$/.exec(t))) {
    const mult = /b|g/.test(m[3][0]) ? 1e9 : m[3][0] === 'm' ? 1e6 : 1e3;
    return { y: NOW - Number(m[2]) * mult, precision: 'approx' };
  }
  if ((m = /^(c\.? ?|about |around |~)?(\d+(?:\.\d+)?) ?(bce|bc)$/.exec(t))) return { y: -Number(m[2]), precision: m[1] ? 'approx' : 'year' };
  if ((m = /^(c\.? ?|about |around |~)?(\d{1,2})(?:st|nd|rd|th) century ?(bce|bc|ce)?$/.exec(t))) {
    const c = Number(m[2]);
    return { y: /b/.test(m[3] || '') ? -(c * 100 - 50) : c * 100 - 50, precision: 'century' };
  }
  if ((m = /^(c\.? ?|about |around |~)?(\d{3,4})s$/.exec(t))) return { y: Number(m[2]) + 5, precision: 'decade' };
  if ((m = /^(-?\d{1,4})-(\d{2})-(\d{2})$/.exec(t))) {
    // the site's own calendar arithmetic, so the day printed is the day written (leap years included)
    return { y: partsToYear(Number(m[1]), Number(m[2]) - 1, Number(m[3])), precision: 'exact' };
  }
  if ((m = /^(-?\d{1,4})-(\d{2})$/.exec(t))) return { y: partsToYear(Number(m[1]), Number(m[2]) - 1, 15), precision: 'month' };
  if ((m = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{1,4})$/.exec(t))) {
    const mo = MONTHS.indexOf(m[2]);
    if (mo >= 0) return { y: partsToYear(Number(m[3]), mo, Number(m[1])), precision: 'exact' };
  }
  if ((m = /^([a-z]{3})[a-z]* (\d{1,4})$/.exec(t))) {
    const mo = MONTHS.indexOf(m[1]);
    if (mo >= 0) return { y: partsToYear(Number(m[2]), mo, 15), precision: 'month' };
  }
  if ((m = /^(c\.? ?|about |around |~)?(-?\d+(?:\.\d+)?)( ce)?$/.exec(t))) {
    const v = Number(m[2]);
    const whole = Number.isInteger(v) && v > 0;
    return { y: whole ? v + 0.5 : v, precision: m[1] ? 'approx' : 'year' };
  }
  if (t === 'now' || t === 'today') return { y: NOW, precision: 'year' };
  throw new Error(`cannot read date "${s}"`);
}

/** "1526..1857", "c. 2600 BCE..1900 BCE", "1757-06-23" -> { y, end, precision } */
export function parseSpan(s) {
  const parts = String(s).split('..');
  const a = parseDate(parts[0]);
  if (parts.length === 1) return { y: a.y, end: null, precision: a.precision };
  const b = parseDate(parts[1]);
  // a span of whole years covers the whole of its final year
  const endY = b.precision === 'year' && Number.isInteger(b.y - 0.5) ? b.y + 0.49 : b.y;
  const startY = a.precision === 'year' && Number.isInteger(a.y - 0.5) ? a.y - 0.5 : a.y;
  return { y: startY, end: endY, precision: a.precision };
}

export const list = (s) => (s ? String(s).split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean) : []);

/** "src: Battle of Plassey" or "src: https://… | Title | Publisher" -> source object (Wikipedia by default). */
export function parseSource(s) {
  const parts = s.split('|').map((x) => x.trim());
  if (/^https?:\/\//.test(parts[0])) return { url: parts[0], title: parts[1] || parts[0], publisher: parts[2] || undefined, author: parts[3] || undefined };
  return { wp: parts[0], title: parts[1] || parts[0], publisher: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(parts[0].replace(/ /g, '_'))}` };
}
