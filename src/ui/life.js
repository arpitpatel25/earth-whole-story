// The life layer: fossil occurrences from the Paleobiology Database, shown where that ground lay at the time.
// Loaded the first time the clock goes back before the Holocene.
import { state, on } from '../core/store.js';
import { fetchJSON } from '../data/net.js';
import { NOW } from '../core/time.js';
import { lensBit } from '../data/events.js';

const article = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');
const ma = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('en-US');

export async function init(app) {
  let loading = null;
  let resolveFossil = null;
  // a shared link to a fossil find works even before the layer has been asked for
  app.recordPrefixes.push(['pbdb:', async (id) => { await load(); return resolveFossil ? resolveFossil(id) : null; }]);
  const load = () => loading || (loading = fetchJSON('data/life/fossils.json').then((data) => {
    const byId = new Map();
    const byGenus = new Map();
    const nature = lensBit('nature');
    const list = data.rows.map((r) => {
      const [occ, genus, group, max, min, lat, lon] = r;
      const e = { id: `pbdb:${occ}`, title: genus, y: NOW - max * 1e6, end: NOW - min * 1e6, lat, lon, imp: 2, mask: nature, lens: 'life', lenses: ['life'], precision: 'approx', kind: 'fossil', label: `Fossil find, ${data.groups[group].label.toLowerCase()}`, plain: true, row: r };
      byId.set(e.id, e);
      if (!byGenus.has(genus)) byGenus.set(genus, []);
      byGenus.get(genus).push(e);
      return e;
    });
    app.events.addCurated(list);
    app.fossils = { list, groups: data.groups, source: data.source };
    const link = (e, tag) => ({ id: e.id, title: e.title, y: e.y, end: e.end, precision: 'approx', label: e.label, tag });
    resolveFossil = (id) => {
      const e = byId.get(id);
      if (!e) return null;
      const [occ, genus, group, max, min, lat, lon, coll] = e.row;
      const g = data.groups[group];
      const c = app.geo.countryAt(lon, lat);
      const where = `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
      const same = (byGenus.get(genus) || []).filter((o) => o !== e).slice(0, 3);
      const later = list.filter((o) => o.row[2] === group && o.y > e.y && o.title !== genus).slice(0, 3);
      const lab = g.label.toLowerCase();
      return {
        id, automated: true, title: genus, label: `Fossil find, ${lab}`, y: e.y, end: e.end, precision: 'approx', lat, lon, altKm: 6000,
        placeText: c ? `Found in what is now ${c.name}` : 'Found at sea or on a small island',
        lenses: ['life'],
        summary: `A fossil identified as ${genus}, ${article(lab)} ${lab}, was found here in rock between ${ma(max)} and ${ma(min)} million years old. The pin sits where this ground lay at the time; on today's map the find is at ${where}.`,
        kidSummary: `Somebody found a fossil of ${genus} here. It is ${article(g.kid)} ${g.kid.charAt(0).toLowerCase()}${g.kid.slice(1)}. It lived about ${ma((max + min) / 2)} million years ago.`,
        facts: [['Group', g.label], ['Age of the rock', `${ma(max)} to ${ma(min)} million years`], ['Found at', c ? `${where}, ${c.name}` : where]],
        related: same.map((o) => link(o, 'another find of this genus')),
        consequences: later.map((o) => link(o, `a later ${lab}`)),
        nextTitle: 'Later in the fossil record',
        nextEmpty: 'No later find of this group is in the sample shown here.',
        sources: [
          { title: `Paleobiology Database, occurrence ${occ} (collection ${coll})`, url: `https://paleobiodb.org/data1.2/occs/single.json?id=occ:${occ}&show=coords,class,loc,time`, publisher: 'The Paleobiology Database', license: 'CC BY 4.0' },
          { title: 'The Paleobiology Database', url: 'https://paleobiodb.org/', publisher: 'The Paleobiology Database', license: 'CC BY 4.0' },
        ],
        notes: 'One occurrence record of many: the database holds far more finds than are drawn here. Identifications and ages are those entered in the database.',
        confidence: 'established',
      };
    };
    if (app.here) app.here.render();
  }).catch((e) => { loading = null; app.engine.reportError(`fossil layer: ${e.message}`); }));
  const check = () => { if (!app.fossils && state.y < -11000) load(); };
  on(['y'], check);
  check();
  app.loadFossils = load;
}
