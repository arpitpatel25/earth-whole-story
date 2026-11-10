// Coverage audit (acceptance test 13): prints the counts the specification sets targets for, and fails if any
// target is missed. Also checks that every curated record has a source with a valid URL (first half of test 14).
import fs from 'node:fs';
import path from 'node:path';
import { allCurated, ROOT } from './lib/curated.mjs';

const R = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'site', 'data', f), 'utf8'));
const lines = [];
const fails = [];
const row = (label, value, target, ok) => { lines.push(`| ${label} | ${value} | ${target} | ${ok ? 'met' : 'NOT MET'} |`); if (!ok) fails.push(`${label}: ${value} (target ${target})`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${value}  [target ${target}]`); };

const ev = R('events/index.json');
row('Global dated, located events', ev.count.toLocaleString('en-US'), '>= 25,000', ev.count >= 25000);
const fossils = R('life/fossils.json');
row('Fossil occurrences (life layer)', fossils.rows.length.toLocaleString('en-US'), 'present', fossils.rows.length > 1000);

const c = R('countries/index.json');
const index = R('geo/country-index.json');
const un = index.filter((x) => x.un);
const enough = index.filter((x) => c.counts[x.id] >= 30).length;
const thin = index.filter((x) => c.counts[x.id] < 30);
const thinFiles = thin.filter((x) => { const f = R(`countries/${x.id}.json`); return f.thin === true; }).length;
row('Countries and territories with a baseline timeline', `${index.length} (${un.length} with a UN code)`, 'every UN member state and recognised territory', index.length >= 250 && index.every((x) => fs.existsSync(path.join(ROOT, 'site', 'data', 'countries', `${x.id}.json`))));
row('... with 30 or more sourced events', enough, 'all, or a thin-record note', enough + thinFiles === index.length);
row('... with fewer than 30, each carrying an honest thin-record note', `${thin.length} (${thinFiles} flagged)`, 'all flagged', thinFiles === thin.length);

const india = R('curated/india/index.json');
row('India: eras in the matrix', india.counts.eras, '>= 19', india.counts.eras >= 19);
row('India: curated matrix cells', india.counts.cells, '>= 300', india.counts.cells >= 300);
row('India: cells with an honest thin-record statement', india.counts.thin, 'stated, not blank', india.counts.missing === 0);
row('India: curated, sourced events', india.counts.events.toLocaleString('en-US'), '>= 1,000', india.counts.events >= 1000);
const people = R('curated/india/people.json');
const tag = (t) => people.filter((p) => p.g.includes(t)).length;
row('India: biographies', people.length, '>= 200', people.length >= 200);
row('... women / scientists / artists and writers / reformers / Dalit / Adivasi / ordinary lives', `${tag('woman')} / ${tag('scientist')} / ${people.filter((p) => ['artist', 'writer', 'poet', 'musician', 'film'].some((t) => p.g.includes(t))).length} / ${tag('reformer')} / ${tag('dalit')} / ${tag('adivasi')} / ${tag('ordinary')}`, 'each present', ['woman', 'scientist', 'artist', 'reformer', 'dalit', 'adivasi', 'ordinary'].every((t) => tag(t) > 0));
row('India: state and union territory history views', india.counts.states, '36', india.counts.states === 36);
const regions = {};
for (const e of R('curated/india/events.json')) regions[e.r] = (regions[e.r] || 0) + 1;
row('India: regions with curated events', `${Object.keys(regions).length} (${Object.entries(regions).map(([k, v]) => `${k} ${v}`).join(', ')})`, 'all 11 regions and the wider subcontinent', ['north', 'northwest', 'gangetic', 'east', 'northeast', 'central', 'deccan', 'south', 'west', 'himalaya', 'islands', 'pakistan', 'bangladesh', 'nepal', 'bhutan', 'srilanka', 'afghanistan'].every((r) => regions[r] > 0));

const stories = R('curated/stories/index.json');
const flag = stories.filter((s) => s.flagship);
row('Flagship stories (scenes)', flag.map((s) => `${s.title} ${s.scenes}`).join('; '), '2 stories, 40+ scenes each', flag.length === 2 && flag.every((s) => s.scenes >= 40));
row('Shorter stories', stories.length - flag.length, '>= 12', stories.length - flag.length >= 12);
const formats = [...new Set(stories.map((s) => s.format))];
row('Story formats used', `${formats.length} (${formats.join(', ')})`, '9', formats.length >= 9);
const trails = R('curated/trails.json');
const peaceful = trails.filter((t) => !/war|politic|battle|freedom|rights/i.test(`${t.theme || ''} ${t.id}`));
row('Trails', `${trails.length} (${trails.map((t) => `${t.id} ${t.stops.length}`).join(', ')})`, '>= 12, each with >= 8 stops', trails.length >= 12 && trails.every((t) => t.stops.length >= 8));
row('Trails not primarily about war or politics', `${peaceful.length} (${peaceful.map((t) => t.id).join(', ')})`, '>= 6', peaceful.length >= 6);
const models = R('curated/models.json');
row('Explorable 3D scenes', `${models.length} (${models.reduce((n, m) => n + m.parts.length, 0)} labelled parts)`, '>= 20', models.length >= 20 && models.every((m) => m.parts.length >= 2));
const wide = R('curated/wide.json');
row('Multi-region events with region views', `${wide.length} (${wide.reduce((n, w) => n + w.views.length, 0)} region views)`, 'present', wide.length >= 3);
const lenses = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'lenses.json'), 'utf8'));
row('Lenses', `${lenses.human.length} human, ${lenses.deep.length} deep-time`, '15 and 6', lenses.human.length === 15 && lenses.deep.length === 6);
const eras = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'generated', 'eras.json'), 'utf8'));
row('Named era bands on the timeline', eras.length, 'the backbone in section 5', eras.length >= 80);

// every curated record has a source with a valid URL
const curated = allCurated();
// a source is an https link, or (for the site's account of its own making) a document shipped with the site
const validURL = (u) => /^https:\/\/[^\s]+$/.test(u || '') || (/^about\/[\w.-]+$/.test(u || '') && fs.existsSync(path.join(ROOT, u.replace(/^about\//, ''))));
const noSource = curated.filter((r) => !r.sources.length || !r.sources.every((s) => validURL(s.url) && s.title));
const thinOK = noSource.filter((r) => r.thin);
row('Curated records', curated.length.toLocaleString('en-US'), 'counted', curated.length > 2000);
row('... with at least one source and a valid URL', `${curated.length - noSource.length} of ${curated.length}`, '100%', noSource.length === 0);
if (noSource.length) console.log(noSource.slice(0, 12).map((r) => `   ${r.kind} ${r.id}`).join('\n'));
const byKind = {};
for (const r of curated) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log(`     by kind: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')}`);

const md = `# Coverage audit\n\nRun on ${new Date().toISOString().slice(0, 10)} by \`node tests/audit-coverage.mjs\`.\n\n| Measure | Count | Target | Result |\n|---|---|---|---|\n${lines.join('\n')}\n\nCurated records by kind: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')}.\n\nPer-country counts are in \`site/data/countries/index.json\` (\`counts\`: events in all; \`located\`: events with a point inside the border; \`thin\`: entries with fewer than 30).\n\nEntries with fewer than 30 events (${thin.length}): ${thin.map((x) => `${x.name} ${c.counts[x.id]}`).join(', ')}.\n`;
fs.writeFileSync(path.join(ROOT, 'tests', 'coverage-audit.md'), md);
fs.writeFileSync(path.join(ROOT, 'tests', 'results', 'coverage.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass: !fails.length, fails }, null, 2));
console.log(fails.length ? `\n${fails.length} targets missed:\n  ${fails.join('\n  ')}` : '\nAll coverage targets met.');
process.exit(fails.length ? 1 : 0);
