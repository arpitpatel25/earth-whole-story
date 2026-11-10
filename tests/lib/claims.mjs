// What "the source supports the claim" means mechanically. Shared by the fact audit (a random sample, sources retrieved
// again from the network) and the sweep (every curated claim, against the text the build retrieved).
//
// Every number in the claim (dates, counts, measurements) and nearly every proper name must occur in the text of the
// cited sources. A few restatements are understood, because the writing uses them all the time:
//   "the 1200s" for a year in 1200-1299 or "13th century" (and the reverse); "the 1930s" for a year in that decade;
//   a number the source spells out ("twenty-nine", "one hundred and fifty thousand");
//   3.48 for 3.480; 4,031 million years for 4.031 Ga; 52,000 years for 52 ka; "173 million" for 173,212,343;
//   "1769-70" for 1769 and 1770.
// Everything else that fails (above all "about 2,300 years ago" for "300 BC") is read by hand.
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‐-―−]/g, '-').replace(/[   ]/g, ' ').replace(/(\d),(?=\d{3})/g, '$1').toLowerCase();
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A pattern for the number as English words ("twenty-nine", "one hundred and fifty thousand"), or null. */
function spell(n) {
  if (!Number.isInteger(n) || n < 10 || n >= 1e6) return null;
  const under100 = (k) => (k < 20 ? ONES[k] : TENS[Math.floor(k / 10)] + (k % 10 ? `[- ]${ONES[k % 10]}` : ''));
  const under1000 = (k) => [Math.floor(k / 100) ? `(?:${ONES[Math.floor(k / 100)]}|a) hundred` : '', k % 100 ? under100(k % 100) : ''].filter(Boolean).join('(?: and)? ');
  return [Math.floor(n / 1000) ? `${under1000(Math.floor(n / 1000))} thousand` : '', n % 1000 ? under1000(n % 1000) : ''].filter(Boolean).join('(?:,? and|,)? ');
}
const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth', 21: 'twenty-first' };
const STOP = new Set(['The', 'A', 'An', 'In', 'On', 'At', 'By', 'For', 'From', 'It', 'Its', 'His', 'Her', 'He', 'She', 'They', 'Their', 'This', 'That', 'These', 'Those', 'But', 'And', 'Or', 'As', 'After', 'Before', 'When', 'While', 'With', 'Under', 'Over', 'Most', 'Many', 'Some', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Both', 'Each', 'Every', 'No', 'Not', 'Nobody', 'Nothing', 'Today', 'Later', 'Earlier', 'Then', 'There', 'Here', 'What', 'Who', 'How', 'Why', 'Where', 'Which', 'To', 'Of', 'If', 'So', 'Yet', 'Still', 'Only', 'About', 'Around', 'Between', 'During', 'Since', 'Until', 'Within', 'Across', 'Along', 'Near', 'Far', 'More', 'Less', 'Other', 'Others', 'Another', 'All', 'Almost', 'Also', 'Even', 'Now', 'Once', 'People', 'We', 'You', 'Our', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'BCE', 'CE', 'BC', 'AD', 'I', 'Explorer', 'Kid']);

function tokens(claim) {
  const nums = new Set();
  const after = {};
  for (const m of claim.matchAll(/\d[\d,]*(?:\.\d+)?/g)) { const v = m[0].replace(/,/g, '').replace(/\.$/, ''); if (v.replace('.', '').length >= 2) { if (v.length === 2 && /\d{4}[-–]$/.test(claim.slice(Math.max(0, m.index - 5), m.index))) { nums.add(claim.slice(m.index - 5, m.index - 3) + v); continue; } nums.add(v); (after[v] = after[v] || []).push(claim.slice(m.index + m[0].length, m.index + m[0].length + 26).toLowerCase()); } }
  const names = new Set();
  // capitalised words that do not open a sentence
  const sentences = claim.split(/(?<=[.!?:;"”])\s+/);
  for (const s of sentences) {
    const words = s.split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/^[("“'‘]+|[)"”'’.,;:!?]+$/g, '').replace(/['’]s$/, '');
      if (i === 0 || !/^[A-ZÀ-Þ][a-zà-ÿ]+/.test(clean) || STOP.has(clean)) return;
      for (const part of clean.split('-')) if (part.length > 2 && /^[A-ZÀ-Þ]/.test(part) && !STOP.has(part)) names.add(part);
    });
  }
  return { nums: [...nums], names: [...names], after };
}
function supported(claim, sourceText) {
  const src = norm(sourceText);
  const t = tokens(claim);
  const missingNums = t.nums.filter((v) => {
    const has = (p) => new RegExp(p).test(src);
    const NB = '(?<!\\d)(?<!\\d\\.)'; // not the tail of a longer number; "c.1564" is fine
    const lit = (x) => String(x).replace('.', '\\.');
    if (has(`${NB}${lit(v)}(?!\\d)`)) return false;
    if (/\.\d+$/.test(v) && has(`${NB}${lit(v)}0*(?!\\d)`)) return false; // 3.48 and 3.480
    if (/\.0$/.test(v) && has(`${NB}${v.slice(0, -2)}(?![\\d.])`)) return false;
    const n = Number(v);
    // "173 million" for 173,212,343
    const ctx0 = t.after[v] || [];
    if (ctx0.length && ctx0.every((c) => /^ million/.test(c)) && has(`${NB}${lit(v)}\\d{6}(?!\\d)`)) return false;
    // 4,031 million years and 4.031 Ga; 52,000 years and 52 ka
    if (Number.isInteger(n) && n >= 1000 && has(`${NB}${lit(n / 1000)}0*(?:\\s*±\\s*[\\d.]+)?\\s*(?:ga\\b|billion|ka\\b|kya\\b|thousand)`)) return false;
    const ctx = t.after[v] || [];
    const ord = (n) => `(?:${n}(?:st|nd|rd|th)|${ORDINALS[n] || '~'})(?:[ -]| (?:and|to|or) [a-z ]{0,12}(?:\\d{1,2}(?:st|nd|rd|th)|[a-z-]+th|first|second|third)[ -])centur`;
    // "the 1200s": a year in that century, or the century by name; "the 1930s": a year in that decade
    if (/^\d{3,4}$/.test(v) && ctx.every((c) => /^s\b/.test(c))) {
      if (/00$/.test(v) && (has(`(?<![\\d.])${v.slice(0, -2)}\\d\\d(?!\\d)`) || has(ord(Number(v.slice(0, -2)) + 1)))) return false;
      if (/0$/.test(v) && has(`(?<![\\d.])${v.slice(0, -1)}\\d(?!\\d)`)) return false;
    }
    // "the 13th century": the century by name, or a year in it
    if (/^\d{1,2}$/.test(v) && ctx.every((c) => /^(st|nd|rd|th)(?:[ -]| (?:and|to|or) )/.test(c)) && /centur/.test(ctx.join(' '))) {
      if (has(ord(Number(v))) || has(`(?<![\\d.])${Number(v) - 1 || ''}\\d\\d(?!\\d)`)) return false;
    }
    // a number the source spells out
    const sp = spell(n);
    return !(sp && has(`\\b${sp}\\b`));
  });
  const missingNames = t.names.filter((nm) => { const k = norm(nm); return !src.includes(k) && !src.includes(k.replace(/s$/, '')) && !src.includes(k.replace(/n$/, '')) && !src.includes(k.slice(0, Math.max(4, k.length - 2))); });
  const nameOK = t.names.length === 0 || missingNames.length / t.names.length <= 0.15 || missingNames.length <= 1;
  return { ok: missingNums.length === 0 && nameOK, missingNums, missingNames, counted: t };
}
/** The hand-reading note for this claim, if one was written for exactly this wording. */
function noteFor(notes, key, claim) {
  const n = notes[key];
  return n && n.claim === claim && typeof n.note === 'string' && n.note.startsWith('ok:') ? n.note.slice(3).trim() : null;
}
export { norm, tokens, supported, noteFor };
