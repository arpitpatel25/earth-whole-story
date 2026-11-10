// Wikimedia Commons: per-file licence, author and description. Only openly licensed files are accepted.
import { fetchJSON, sleep } from './util.mjs';

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Licences we accept: public domain, CC0, CC BY and CC BY-SA (any version). */
export function licenseOK(short) {
  return /^(public domain|pd|cc0|cc[- ]by([- ]sa)?[- ]?\d|cc[- ]by([- ]sa)?$|no restrictions|cc-pd)/i.test((short || '').trim());
}

export async function fileInfo(files, width = 1200) {
  const out = {};
  for (let i = 0; i < files.length; i += 25) {
    const batch = files.slice(i, i + 25);
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: String(width), titles: batch.join('|') });
    const j = await fetchJSON(`https://commons.wikimedia.org/w/api.php?${params}`);
    const norm = new Map((j.query.normalized || []).map((n) => [n.to, n.from]));
    for (const p of j.query.pages || []) {
      const asked = norm.get(p.title) || p.title;
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii) {
        out[asked] = { missing: true };
        continue;
      }
      const m = ii.extmetadata || {};
      out[asked] = {
        title: p.title,
        page: ii.descriptionurl,
        url: ii.thumburl || ii.url,
        w: ii.thumbwidth || ii.width,
        h: ii.thumbheight || ii.height,
        mime: ii.mime,
        license: strip(m.LicenseShortName && m.LicenseShortName.value),
        artist: strip(m.Artist && m.Artist.value).slice(0, 160),
        credit: strip(m.Credit && m.Credit.value).slice(0, 160),
        description: strip(m.ImageDescription && m.ImageDescription.value).slice(0, 400),
        date: strip(m.DateTimeOriginal && m.DateTimeOriginal.value).slice(0, 60),
      };
    }
    await sleep(120);
  }
  return out;
}
