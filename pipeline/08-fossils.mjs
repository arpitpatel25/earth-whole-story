// Step 8: the life layer. Fossil occurrences from the Paleobiology Database (CC BY 4.0), a spread of well-known
// groups across deep time. Each row is one real occurrence record: a genus, the age range of the rock it was found
// in, and where it was found. The site carries each find back on its plate to where that land lay at the time.
import path from 'node:path';
import { RAW, DATA, readJSON, writeJSON, ensureDir, exists, round, sleep, UA } from './lib/util.mjs';

const CLADES = [
  // key, PBDB base name, label, label for younger readers, how many to keep
  ['trilobite', 'Trilobita', 'Trilobite', 'Trilobite, a sea creature with a jointed shell', 520],
  ['graptolite', 'Graptolithina', 'Graptolite', 'Graptolite, a tiny drifting sea animal', 220],
  ['eurypterid', 'Eurypterida', 'Sea scorpion', 'Sea scorpion', 160],
  ['placoderm', 'Placodermi', 'Armoured fish', 'Armoured fish', 220],
  ['ammonite', 'Ammonoidea', 'Ammonite', 'Ammonite, a coiled-shell relative of squid', 520],
  ['temnospondyl', 'Temnospondyli', 'Early amphibian', 'Early amphibian', 260],
  ['therapsid', 'Therapsida^Mammalia', 'Therapsid', 'Therapsid, a distant relative of mammals', 300],
  ['dinosaur', 'Dinosauria^Aves', 'Dinosaur', 'Dinosaur', 900],
  ['pterosaur', 'Pterosauria', 'Pterosaur', 'Pterosaur, a flying reptile', 240],
  ['ichthyosaur', 'Ichthyosauria', 'Ichthyosaur', 'Ichthyosaur, a sea reptile', 200],
  ['plesiosaur', 'Plesiosauria', 'Plesiosaur', 'Plesiosaur, a long-necked sea reptile', 200],
  ['whale', 'Cetacea', 'Whale or early whale', 'Whale', 320],
  ['proboscidean', 'Proboscidea', 'Elephant relative', 'Mammoth, mastodon or other elephant relative', 380],
  ['primate', 'Primates^Homo', 'Primate', 'Primate, one of the monkeys and apes', 380],
];
const dir = path.join(RAW, 'pbdb');
ensureDir(dir);
const rows = [];
const perClade = {};
for (const [key, base, label, kid, keep] of CLADES) {
  const file = path.join(dir, `${key}.json`);
  if (!exists(file)) {
    const url = `https://paleobiodb.org/data1.2/occs/list.json?base_name=${encodeURIComponent(base)}&taxon_reso=genus&show=coords,class&vocab=pbdb&limit=9000`;
    let data = null;
    for (let i = 0; i < 4 && !data; i++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = await r.json();
      } catch (e) { console.log(`  ${key}: ${e.message}, retrying`); await sleep(5000); }
    }
    if (!data) { console.log(`  ${key}: could not be fetched`); continue; }
    writeJSON(file, data.records.map((r) => ({ o: r.occurrence_no, c: r.collection_no, g: r.genus, max: r.max_ma, min: r.min_ma, lat: Number(r.lat), lng: Number(r.lng), rank: r.accepted_rank, cl: r.class })));
    await sleep(1500);
  }
  // The database files birds under Dinosauria (landfowl even under class Reptilia), and its "^Aves" exclusion lets them
  // through. A reader looking for dinosaurs does not expect a chicken, so in this group only finds from rock older than
  // the end of the Cretaceous (66 million years) are kept: everything younger in the group is a bird.
  const recs = readJSON(file).filter((r) => !(key === 'dinosaur' && (r.cl === 'Aves' || r.max <= 66))).filter((r) => r.g && !/[()?"]/.test(r.g) && Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.max > 0 && r.max - r.min < Math.max(12, r.max * 0.2));
  // one find per genus and 6-degree cell, then an even spread through time
  const seen = new Set();
  const uniq = [];
  for (const r of recs) { const k = `${r.g}|${Math.floor(r.lat / 6)}|${Math.floor(r.lng / 6)}`; if (seen.has(k)) continue; seen.add(k); uniq.push(r); }
  uniq.sort((a, b) => b.max - a.max);
  const step = Math.max(1, uniq.length / keep);
  const kept = [];
  for (let i = 0; i < uniq.length && kept.length < keep; i += step) kept.push(uniq[Math.floor(i)]);
  perClade[key] = kept.length;
  for (const r of kept) rows.push([Number(r.o), r.g, key, round(r.max, 2), round(r.min, 2), round(r.lat, 2), round(r.lng, 2), Number(r.c)]);
}
rows.sort((a, b) => b[3] - a[3]);
ensureDir(path.join(DATA, 'life'));
writeJSON(path.join(DATA, 'life', 'fossils.json'), {
  source: { title: 'The Paleobiology Database', url: 'https://paleobiodb.org/', license: 'CC BY 4.0' },
  fields: ['occurrence', 'genus', 'group', 'maxMa', 'minMa', 'lat', 'lon', 'collection'],
  groups: Object.fromEntries(CLADES.map(([key, , label, kid]) => [key, { label, kid }])),
  rows,
});
console.log(`fossils: ${rows.length} occurrences; ${Object.entries(perClade).map(([k, n]) => `${k} ${n}`).join(', ')}`);
