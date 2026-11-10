// Step 00: download every raw open dataset the build needs into data-raw/.
// Re-runnable: files already present are skipped. Usage: node pipeline/00-download.mjs [group ...]
import path from 'node:path';
import { RAW, download, fetchJSON, pool, exists } from './lib/util.mjs';

const NASA = 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images';
const NE = 'https://naciscdn.org/naturalearth';

/** group -> [url, destination relative to data-raw] */
const MANIFEST = {
  plates: [
    ['https://zenodo.org/api/records/4485738/files/SM2_4485738_V2.zip/content', 'plates/merdith2021.zip'],
  ],
  imagery: [
    [`${NASA}/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x21600x10800.jpg`, 'imagery/bluemarble_21600.jpg'],
    [`${NASA}/imagerecords/144000/144898/BlackMarble_2016_3km.jpg`, 'imagery/blackmarble_3km.jpg'],
  ],
  elevation: [
    ['https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO1/data/ice_surface/grid_registered/georeferenced_tiff/ETOPO1_Ice_g_geotiff.zip', 'elevation/ETOPO1_Ice_g_geotiff.zip'],
  ],
  naturalearth: [
    [`${NE}/110m/physical/ne_110m_land.zip`, 'ne/ne_110m_land.zip'],
    [`${NE}/50m/physical/ne_50m_land.zip`, 'ne/ne_50m_land.zip'],
    [`${NE}/10m/physical/ne_10m_land.zip`, 'ne/ne_10m_land.zip'],
    [`${NE}/50m/physical/ne_50m_rivers_lake_centerlines.zip`, 'ne/ne_50m_rivers.zip'],
    [`${NE}/10m/physical/ne_10m_rivers_lake_centerlines.zip`, 'ne/ne_10m_rivers.zip'],
    [`${NE}/50m/physical/ne_50m_lakes.zip`, 'ne/ne_50m_lakes.zip'],
    [`${NE}/10m/physical/ne_10m_geography_regions_polys.zip`, 'ne/ne_10m_geography_regions_polys.zip'],
    [`${NE}/10m/physical/ne_10m_geography_marine_polys.zip`, 'ne/ne_10m_geography_marine_polys.zip'],
    [`${NE}/110m/cultural/ne_110m_admin_0_countries.zip`, 'ne/ne_110m_admin_0_countries.zip'],
    [`${NE}/50m/cultural/ne_50m_admin_0_countries.zip`, 'ne/ne_50m_admin_0_countries.zip'],
    [`${NE}/10m/cultural/ne_10m_admin_0_countries.zip`, 'ne/ne_10m_admin_0_countries.zip'],
    [`${NE}/10m/cultural/ne_10m_admin_0_disputed_areas.zip`, 'ne/ne_10m_admin_0_disputed_areas.zip'],
    [`${NE}/10m/cultural/ne_10m_admin_0_boundary_lines_disputed_areas.zip`, 'ne/ne_10m_admin_0_boundary_lines_disputed_areas.zip'],
    [`${NE}/10m/cultural/ne_10m_admin_1_states_provinces.zip`, 'ne/ne_10m_admin_1_states_provinces.zip'],
    [`${NE}/10m/cultural/ne_10m_populated_places.zip`, 'ne/ne_10m_populated_places.zip'],
    [`${NE}/10m/cultural/ne_10m_railroads.zip`, 'ne/ne_10m_railroads.zip'],
    [`${NE}/10m/cultural/ne_10m_ports.zip`, 'ne/ne_10m_ports.zip'],
    [`${NE}/10m/cultural/ne_10m_airports.zip`, 'ne/ne_10m_airports.zip'],
    [`${NE}/10m/physical/ne_10m_glaciated_areas.zip`, 'ne/ne_10m_glaciated_areas.zip'],
    [`${NE}/10m/physical/ne_10m_antarctic_ice_shelves_polys.zip`, 'ne/ne_10m_antarctic_ice_shelves_polys.zip'],
  ],
  borders: [
    ['https://codeload.github.com/aourednik/historical-basemaps/zip/refs/heads/master', 'borders/historical-basemaps.zip'],
    ['https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson', 'borders/CShapes-2.0.geojson'],
  ],
  climate: [
    ['https://www.ncei.noaa.gov/pub/data/paleo/contributions_by_author/spratt2016/spratt2016.txt', 'climate/spratt2016.txt'],
    ['https://lorraine-lisiecki.com/LR04stack.txt', 'climate/LR04stack.txt'],
    ['https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv', 'climate/gistemp_global.csv'],
    ['https://osf.io/download/k2ymx/', 'ice/batchelor2019/README.txt'],
  ],
  transport: [
    ['https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat', 'transport/openflights_routes.dat'],
    ['https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat', 'transport/openflights_airports.dat'],
    ['https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson', 'transport/shipping_lanes.geojson'],
  ],
};

/** Batchelor et al. 2019 ice-sheet reconstructions live in nested OSF folders; walk them. */
async function osfTree(url, prefix, out) {
  let next = url;
  while (next) {
    const page = await fetchJSON(next);
    for (const d of page.data) {
      const a = d.attributes;
      if (a.kind === 'folder') {
        // Only the reconstructed ice-sheet outlines are needed, not the underlying evidence layers.
        if (/^data$/i.test(a.name)) continue;
        await osfTree(d.relationships.files.links.related.href, `${prefix}/${a.name}`, out);
      } else if (!/\.pptx$/i.test(a.name)) {
        out.push([d.links.download, `${prefix}/${a.name}`.replace(/ /g, '_')]);
      }
    }
    next = page.links.next;
  }
}

const groups = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MANIFEST).concat('ice');
let failed = 0;
for (const g of groups) {
  let items = MANIFEST[g] || [];
  if (g === 'ice') {
    items = [];
    try {
      await osfTree('https://api.osf.io/v2/nodes/7jen3/files/osfstorage/', 'ice/batchelor2019', items);
    } catch (e) {
      console.error('OSF listing failed:', e.message);
      failed++;
    }
  }
  console.log(`[${g}] ${items.length} files`);
  await pool(items, 4, async ([url, rel]) => {
    const dest = path.join(RAW, rel);
    if (exists(dest)) return;
    try {
      await download(url, dest);
    } catch (e) {
      failed++;
      console.error(`FAILED ${rel}: ${e.message}`);
    }
  });
}
console.log(failed ? `done with ${failed} failures` : 'done');
