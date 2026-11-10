// Research helper: show the images of Wikipedia articles with their Commons licence and description,
// so an image is only used with a caption that matches what it really shows.
// Usage: node pipeline/images.mjs "Lucy (Australopithecus)" "Battle of Stalingrad"
//        node pipeline/images.mjs --file "File:Lucy blackbg.jpg"
import { fetchJSON } from './lib/util.mjs';
import { fileInfo, licenseOK } from './lib/commons.mjs';

const args = process.argv.slice(2);
if (args[0] === '--file') {
  const info = await fileInfo(args.slice(1));
  for (const [k, v] of Object.entries(info)) console.log(`${k}\n   ${v.missing ? 'MISSING' : `${licenseOK(v.license) ? 'OK ' : 'NO '} [${v.license}] ${v.artist} | ${v.date}\n   ${v.description}`}`);
} else {
  for (const title of args) {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', redirects: '1', prop: 'images|pageimages', imlimit: '40', piprop: 'name', titles: title });
    const j = await fetchJSON(`https://en.wikipedia.org/w/api.php?${params}`);
    const p = j.query.pages[0];
    const files = (p.images || []).map((i) => i.title).filter((t) => /\.(jpe?g|png|tiff?)$/i.test(t) && !/(icon|logo|flag|symbol|commons-|wiki|edit-|question|ambox|padlock|map)/i.test(t));
    const lead = p.pageimage ? `File:${p.pageimage.replace(/_/g, ' ')}` : null;
    const pick = [...new Set([lead, ...files].filter(Boolean))].slice(0, Number(process.env.N) || 5);
    const info = await fileInfo(pick);
    console.log(`## ${p.title}${lead ? `  (lead image: ${lead})` : ''}`);
    for (const f of pick) {
      const v = info[f];
      if (!v || v.missing) continue;
      console.log(`  ${licenseOK(v.license) ? 'OK' : 'NO'} ${f} [${v.license}] ${v.artist.slice(0, 50)} ${v.date.slice(0, 20)}\n     ${v.description.slice(0, 200)}`);
    }
  }
}
