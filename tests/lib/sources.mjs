// The text of a cited source, for the fact checks. Wikipedia articles come as plain text; a Wikidata item comes as its
// label, description and dated statements (that is what the site takes from it: dates and places).
import { getArticle, cachedArticle } from '../../pipeline/lib/wiki.mjs';
import { fetchJSON } from '../../pipeline/lib/util.mjs';

export const titleOf = (url) => (/wikipedia\.org\/wiki\//.test(url) ? decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' ') : null);
export const qidOf = (url) => { const m = /wikidata\.org\/(?:wiki|entity)\/(Q\d+)/.exec(url || ''); return m ? m[1] : null; };
export const checkable = (url) => !!(titleOf(url) || qidOf(url));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function timeText(v) {
  const m = /^([+-])(\d+)-(\d\d)-(\d\d)T/.exec(v.time);
  if (!m) return '';
  const year = `${Number(m[2])}${m[1] === '-' ? ' BCE' : ''}`;
  if (v.precision >= 11) return `${Number(m[4])} ${MONTHS[Number(m[3]) - 1]} ${year}`;
  if (v.precision === 10) return `${MONTHS[Number(m[3]) - 1]} ${year}`;
  if (v.precision === 9) return year;
  if (v.precision === 8) return `${year}s`;
  if (v.precision === 7) return `${Math.ceil(Number(m[2]) / 100)}th century${m[1] === '-' ? ' BCE' : ''} (${year})`;
  return year;
}
async function wikidataText(qid) {
  const json = await fetchJSON(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const e = json.entities && Object.values(json.entities)[0];
  if (!e) return null;
  const out = [`${(e.labels.en || {}).value || qid}. ${(e.descriptions.en || {}).value || ''}.`];
  for (const [prop, list] of Object.entries(e.claims || {})) {
    for (const c of list) {
      const dv = c.mainsnak && c.mainsnak.datavalue;
      if (dv && dv.type === 'time') out.push(`${prop}: ${timeText(dv.value)}.`);
      if (dv && dv.type === 'quantity') out.push(`${prop}: ${Number(dv.value.amount)}.`);
    }
  }
  return out.join(' ');
}

const PACE_MS = Number(process.env.PACE_MS) || 1500;
const fetched = new Map();
/** Text of the source at this URL, or null. `refresh` retrieves it from the network even when the build has it. */
export async function sourceText(url, { refresh = false, cacheOnly = false } = {}) {
  const key = titleOf(url) || qidOf(url);
  if (!key) return null;
  if (cacheOnly) { const a = titleOf(url) ? cachedArticle(key) : null; return a && !a.missing ? `${a.title}. ${a.extract}` : null; }
  if (!fetched.has(key)) {
    let text = null;
    // One request at a time, never overlapping: the fetch helper waits out a "429 Too Many Requests" for as long as
    // the server asks (and gives up on a silent connection after two minutes), and a failed retrieval is tried again
    // after a pause. Racing a short timeout against it only stacks up more requests and makes the throttling worse.
    const once = () => (titleOf(url) ? getArticle(key, { full: true, refresh }).then((a) => (a && !a.missing ? `${a.title}. ${a.extract}` : null)) : wikidataText(key));
    for (let i = 0; i < 4; i++) {
      try { text = await once(); break; } catch { await new Promise((r) => setTimeout(r, 20000 * (i + 1))); }
    }
    fetched.set(key, text);
    if (refresh) await new Promise((r) => setTimeout(r, PACE_MS)); // a polite pace between retrievals
  }
  return fetched.get(key);
}
export const retrievedCount = () => fetched.size;
