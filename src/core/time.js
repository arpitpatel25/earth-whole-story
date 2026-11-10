// The clock. `y` is a signed decimal year: 1943.5 is mid-1943, -2500 is 2500 BCE,
// -66000000 is 66 million years ago. Everything about time lives here: the non-linear
// timeline scale, plain-word formatting and free-text date parsing.

export const BIG_BANG = -13.8e9;
export const EARTH_FORMS = -4.54e9;
export const SUN_FORMS = -4.6e9;

const MS_PER_YEAR = 365.2425 * 86400000;

/** Decimal year of a JS Date. */
export function dateToYear(d) {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

export const NOW = dateToYear(new Date());

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Split a decimal CE year into calendar parts (proleptic Gregorian). */
export function yearToParts(y) {
  const year = Math.floor(y);
  const leap = year > 0 && isLeap(year);
  const days = leap ? 366 : 365;
  let doy = Math.min(days - 1, Math.max(0, Math.floor((y - year) * days + 1e-6)));
  let month = 0;
  for (let m = 0; m < 12; m++) {
    const endOfMonth = CUM[m + 1] + (leap && m >= 1 ? 1 : 0);
    if (doy < endOfMonth) {
      month = m;
      doy -= CUM[m] + (leap && m >= 2 ? 1 : 0);
      break;
    }
  }
  return { year, month, day: doy + 1 };
}

export function partsToYear(year, month = 0, day = 1) {
  const leap = year > 0 && isLeap(year);
  const days = leap ? 366 : 365;
  const doy = CUM[month] + (leap && month >= 2 ? 1 : 0) + (day - 1);
  return year + (doy + 0.5) / days;
}

// ---------------------------------------------------------------------------------------------
// Timeline scale: y <-> u in [0, 1].
// Three interpolation kinds: 'age' (log of time since the Big Bang), 'ago' (log of years before
// now) and 'lin' (linear in years). Deep time is compressed, recorded history gets half the bar.
// ---------------------------------------------------------------------------------------------
const AGE0 = 1e-9; // years; below this the universe's age is treated as zero
const SCALE = [
  // y, u, kind of the segment that starts here
  [BIG_BANG, 0.0, 'age'],
  [BIG_BANG + 1, 0.008, 'age'],
  [BIG_BANG + 380000, 0.018, 'age'],
  [BIG_BANG + 1e8, 0.03, 'age'],
  [BIG_BANG + 1e9, 0.045, 'age'],
  [-4.6e9, 0.07, 'ago'],
  [-4.0e9, 0.085, 'ago'],
  [-2.5e9, 0.105, 'ago'],
  [-1.0e9, 0.125, 'ago'],
  [-539e6, 0.15, 'ago'],
  [-252e6, 0.185, 'ago'],
  [-66e6, 0.22, 'ago'],
  [-2.58e6, 0.27, 'ago'],
  [-300000, 0.32, 'ago'],
  [-10000, 0.385, 'lin'],
  [-3000, 0.45, 'lin'],
  [-500, 0.53, 'lin'],
  [500, 0.6, 'lin'],
  [1500, 0.7, 'lin'],
  [1800, 0.79, 'lin'],
  [1900, 0.86, 'lin'],
  [1950, 0.92, 'lin'],
  [2000, 0.965, 'lin'],
  [NOW, 1.0, 'lin'],
];

function segT(kind, y, y0, y1) {
  if (kind === 'lin') return (y - y0) / (y1 - y0);
  if (kind === 'age') {
    const a = Math.log10(Math.max(AGE0, y - BIG_BANG));
    const a0 = Math.log10(Math.max(AGE0, y0 - BIG_BANG));
    const a1 = Math.log10(Math.max(AGE0, y1 - BIG_BANG));
    return (a - a0) / (a1 - a0);
  }
  const g = Math.log10(NOW - y);
  const g0 = Math.log10(NOW - y0);
  const g1 = Math.log10(NOW - y1);
  return (g - g0) / (g1 - g0);
}

function segY(kind, t, y0, y1) {
  if (kind === 'lin') return y0 + (y1 - y0) * t;
  if (kind === 'age') {
    const a0 = Math.log10(Math.max(AGE0, y0 - BIG_BANG));
    const a1 = Math.log10(Math.max(AGE0, y1 - BIG_BANG));
    const age = 10 ** (a0 + (a1 - a0) * t);
    return t <= 0 ? y0 : BIG_BANG + age;
  }
  const g0 = Math.log10(NOW - y0);
  const g1 = Math.log10(NOW - y1);
  return NOW - 10 ** (g0 + (g1 - g0) * t);
}

export function clampYear(y) {
  return Math.min(NOW, Math.max(BIG_BANG, y));
}

export function yearToU(y) {
  y = clampYear(y);
  for (let i = SCALE.length - 2; i >= 0; i--) {
    if (y >= SCALE[i][0]) {
      const [y0, u0, kind] = SCALE[i];
      const [y1, u1] = SCALE[i + 1];
      return u0 + (u1 - u0) * Math.min(1, Math.max(0, segT(kind, y, y0, y1)));
    }
  }
  return 0;
}

export function uToYear(u) {
  u = Math.min(1, Math.max(0, u));
  for (let i = SCALE.length - 2; i >= 0; i--) {
    if (u >= SCALE[i][1]) {
      const [y0, u0, kind] = SCALE[i];
      const [y1, u1] = SCALE[i + 1];
      return clampYear(segY(kind, (u - u0) / (u1 - u0), y0, y1));
    }
  }
  return BIG_BANG;
}

/** Years represented by one unit of u at year y (local slope), used for tick spacing and readouts. */
export function yearsPerU(y) {
  const u = yearToU(y);
  const d = 1e-5;
  const a = uToYear(Math.max(0, u - d));
  const b = uToYear(Math.min(1, u + d));
  return Math.max(1e-12, (b - a) / (Math.min(1, u + d) - Math.max(0, u - d)));
}

// ---------------------------------------------------------------------------------------------
// Plain-word formatting
// ---------------------------------------------------------------------------------------------
const nf = (n, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

function sig(n, resolution) {
  // Round n to the precision implied by the resolution (both in the same unit).
  if (!resolution || resolution <= 0) return n;
  const p = 10 ** Math.floor(Math.log10(resolution));
  return Math.round(n / p) * p;
}

/**
 * The current moment in plain words.
 * `res` is the time resolution in years the reader can currently resolve (from timeline zoom).
 * Returns { main, sub } where sub adds helpful context for deep time.
 */
export function formatMoment(y, res = 1) {
  y = clampYear(y);
  const ago = NOW - y;
  if (y < SUN_FORMS - 1e6) {
    const age = y - BIG_BANG;
    let sub;
    if (age < 1e-7) sub = 'the Big Bang';
    else if (age < 1 / 365) sub = 'the first day';
    else if (age < 1) sub = 'the first year';
    else if (age < 1e6) sub = `${nf(sig(age, age / 20))} years after the Big Bang`;
    else if (age < 1e9) sub = `${nf(sig(age / 1e6, age / 2e7))} million years after the Big Bang`;
    else sub = `${nf(age / 1e9, 1)} billion years after the Big Bang`;
    return { main: `${nf(ago / 1e9, age < 1e8 ? 1 : 2)} billion years ago`, sub };
  }
  if (ago >= 1e9) return { main: `${nf(ago / 1e9, res < 2e7 ? 2 : 1)} billion years ago`, sub: '' };
  if (ago >= 1e6) {
    const digits = res < 20000 ? 2 : res < 400000 ? 1 : 0;
    return { main: `${nf(ago / 1e6, digits)} million years ago`, sub: '' };
  }
  if (y < -10000) {
    const r = res < 50 ? 10 : res < 500 ? 100 : 1000;
    const years = Math.round(ago / r) * r;
    return { main: `${nf(years)} years ago`, sub: `${nf(Math.round((-y) / r) * r)} BCE` };
  }
  if (y < 1) {
    if (res >= 50) return { main: `${nf(Math.max(1, Math.round(-y / 10) * 10)).replace(/,/g, '')} BCE`, sub: '' };
    const n = bceYear(y);
    const p = yearToParts(y);
    if (res <= 1 / 60) return { main: `${p.day} ${MONTHS[p.month]} ${n} BCE`, sub: '' };
    if (res <= 0.6) return { main: `${MONTHS[p.month]} ${n} BCE`, sub: '' };
    return { main: `${n} BCE`, sub: '' };
  }
  const { year, month, day } = yearToParts(y);
  const era = year < 1000 ? ' CE' : '';
  if (res <= 1 / 60) return { main: `${day} ${MONTHS[month]} ${year}${era}`, sub: '' };
  if (res <= 0.6) return { main: `${MONTHS[month]} ${year}${era}`, sub: '' };
  return { main: `${year} CE`, sub: '' };
}

/** The BCE year number of a negative decimal year: -215.42 lies in the year 216 BCE (the span -216 to -215). */
export function bceYear(y) {
  return Math.max(1, Math.ceil(-y - 1e-9));
}

/** Short label for timeline ticks and lists. */
export function formatShort(y, res = 1) {
  const ago = NOW - y;
  if (ago >= 1e9) return `${nf(ago / 1e9, res < 5e7 ? 2 : 1)} Gya`;
  if (ago >= 1e6) return `${nf(ago / 1e6, res < 50000 ? 2 : res < 500000 ? 1 : 0)} Mya`;
  if (y < -10000) return `${nf(Math.round(ago / 100) / 10, 1)} kya`;
  if (y < 1) return `${bceYear(y)} BCE`;
  const { year, month, day } = yearToParts(y);
  if (res <= 1 / 60) return `${day} ${MONTHS[month].slice(0, 3)} ${year}`;
  if (res <= 0.6) return `${MONTHS[month].slice(0, 3)} ${year}`;
  return `${year}`;
}

/** Event dates: honest about precision. */
export function formatEventDate(start, end, precision = 'year') {
  const one = (y) => {
    const ago = NOW - y;
    if (ago >= 1e9) return `${nf(ago / 1e9, 2)} billion years ago`;
    if (ago >= 1e6) return `${nf(ago / 1e6, ago < 1e7 ? 2 : 1)} million years ago`;
    if (y < -10000) return `${nf(Math.round(ago / 100) * 100)} years ago`;
    if (y < 1) {
      const n = bceYear(y);
      const p = yearToParts(y);
      if (precision === 'exact') return `${p.day} ${MONTHS[p.month]} ${n} BCE`;
      if (precision === 'month') return `${MONTHS[p.month]} ${n} BCE`;
      if (precision === 'decade') return `${Math.floor(n / 10) * 10}s BCE`;
      return `${n} BCE`;
    }
    const { year, month, day } = yearToParts(y);
    const era = year < 1000 ? ' CE' : '';
    if (precision === 'exact') return `${day} ${MONTHS[month]} ${year}${era}`;
    if (precision === 'month') return `${MONTHS[month]} ${year}${era}`;
    if (precision === 'decade') return `${Math.floor(year / 10) * 10}s${era}`;
    if (precision === 'century') {
      const c = Math.floor((year - 1) / 100) + 1;
      const suffix = c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th';
      return `${c}${suffix} century${era}`;
    }
    return `${year}${era}`;
  };
  const prefix = precision === 'approx' ? 'around ' : '';
  if (precision === 'century' && start < 1) {
    const c = Math.floor((-start - 1) / 100) + 1;
    const suffix = c % 10 === 1 && c !== 11 ? 'st' : c % 10 === 2 && c !== 12 ? 'nd' : c % 10 === 3 && c !== 13 ? 'rd' : 'th';
    return `${c}${suffix} century BCE`;
  }
  if (end != null && Math.abs(end - start) > (precision === 'exact' ? 1.5 / 365 : 0.99)) {
    const a = one(start);
    // a span that began in deep time and has not ended (a rock layer still forming) reads better than "to 2026"
    const b = start < -10000 && end >= NOW - 1 ? 'today' : one(end);
    if (a !== b) return `${prefix}${a} to ${b}`;
  }
  return prefix + one(start);
}

// ---------------------------------------------------------------------------------------------
// Free-text parsing: "1857", "66 million years ago", "3000 BCE", "6 June 1944", "now"
// Returns { y, res } or null. Names ("Mughal") are resolved by the search index, not here.
// ---------------------------------------------------------------------------------------------
const UNIT = [
  [/^(b|bn|billion|gya|ga|bya)\b/, 1e9],
  [/^(m|mn|million|mya|ma|myr)\b/, 1e6],
  [/^(k|thousand|kya|ka|kyr)\b/, 1e3],
];

export function parseMoment(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase().replace(/[,]/g, '').replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^(now|today|present|the present)$/.test(s)) return { y: NOW, res: 1 };
  if (/^(the )?big bang$/.test(s)) return { y: BIG_BANG, res: 1e7 };

  // ISO date 1944-06-06
  let m = s.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (m) {
    const mo = Math.min(12, Math.max(1, +m[2])) - 1;
    return { y: partsToYear(+m[1], mo, m[3] ? +m[3] : 15), res: m[3] ? 1 / 365 : 1 / 12 };
  }
  // 6 June 1944 | June 6 1944 | June 1944
  const monthRe = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  m = s.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? ${monthRe} (\\d{1,4})$`)) || null;
  if (m) return { y: partsToYear(+m[3], monthIndex(m[2]), +m[1]), res: 1 / 365 };
  m = s.match(new RegExp(`^${monthRe} (\\d{1,2})(?:st|nd|rd|th)? (\\d{3,4})$`));
  if (m) return { y: partsToYear(+m[3], monthIndex(m[1]), +m[2]), res: 1 / 365 };
  m = s.match(new RegExp(`^${monthRe} (\\d{1,4})$`));
  if (m) return { y: partsToYear(+m[2], monthIndex(m[1]), 15), res: 1 / 12 };

  // N [unit] years ago | N mya | N bya
  m = s.match(/^(?:about |around |c\.? ?|~)?(\d+(?:\.\d+)?) ?([a-z]+)?(?: years?)?(?: ago| before present| bp)?$/);
  if (m && (m[2] || /ago|before present| bp$/.test(s))) {
    let mult = null;
    if (m[2]) {
      for (const [re, v] of UNIT) if (re.test(m[2])) mult = v;
      if (m[2] === 'years' || m[2] === 'year' || m[2] === 'yr' || m[2] === 'ya') mult = 1;
    } else mult = 1;
    if (mult != null && (mult > 1 || /ago|before present| bp$|ya$/.test(s))) {
      const ago = +m[1] * mult;
      return { y: clampYear(NOW - ago), res: Math.max(1, ago / 200) };
    }
  }
  // 3000 BCE | 3000 BC | AD 79 | 79 CE
  m = s.match(/^(?:about |around |c\.? ?|~)?(\d+(?:\.\d+)?) ?(bce|bc|b\.c\.|b\.c\.e\.)$/);
  if (m) return { y: clampYear(-+m[1]), res: 1 };
  m = s.match(/^(?:ad |a\.d\. )(\d{1,4})$/) || s.match(/^(\d{1,4}) ?(?:ce|ad|a\.d\.|c\.e\.)$/);
  if (m) return { y: clampYear(+m[1] + 0.5), res: 1 };
  // -2500 or 1857 or 1943.5
  m = s.match(/^(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const v = +m[1];
    if (v > Math.floor(NOW) + 1) return null;
    return { y: clampYear(Number.isInteger(v) && v > 0 ? v + 0.5 : v), res: 1 };
  }
  // 1850s, 18th century, 5th century bce
  m = s.match(/^(\d{3,4})s$/);
  if (m) return { y: +m[1] + 5, res: 10 };
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th) century ?(bce|bc)?$/);
  if (m) return { y: m[2] ? -(+m[1] * 100 - 50) : +m[1] * 100 - 50, res: 100 };
  return null;
}

function monthIndex(name) {
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.slice(0, 3));
}

/** A nice step (in years) at least `min` long. */
export function niceStep(min) {
  const DAY = 1 / 365.25;
  const small = [DAY, 2 * DAY, 7 * DAY, 1 / 12, 0.25, 0.5];
  for (const s of small) if (s >= min) return s;
  const p = 10 ** Math.floor(Math.log10(min));
  for (const mult of [1, 2, 5, 10]) if (mult * p >= min) return mult * p;
  return 10 * p;
}

export { MS_PER_YEAR };
