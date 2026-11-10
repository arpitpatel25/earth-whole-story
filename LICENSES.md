# Licences

## Code

The code in `src/`, `pipeline/` and `tests/` is released under the MIT License.

```
MIT License

Copyright (c) 2026 the authors of EARTH: The Whole Story

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```

Open-source packages used at run time or build time: three.js (MIT), esbuild (MIT), sharp (Apache-2.0), Playwright
(Apache-2.0), shapefile (BSD-3-Clause), d3-geo and d3-geo-projection (ISC), earcut (ISC), fflate (MIT),
topojson-client (ISC), mapshaper (MPL-2.0, build only), GPlately and pyGPlates (GPL-2.0, build only: used to
sample plate rotations; no GPlates code is shipped).

## Written content

The curated text in `content/` (stories, trails, India in depth, era summaries, 3D scene texts, region views) was
written for this project from the sources cited beside each passage. It is released under CC BY-SA 4.0, the
licence of its principal sources.

## Data

Every dataset keeps its own licence. The table says where each one lives in `site/`, so that the share-alike and
non-commercial data can be removed or replaced without touching the rest.

| Purpose | Source | Licence | Where in `site/` |
|---|---|---|---|
| Satellite imagery, city lights | NASA Blue Marble Next Generation and Black Marble, NASA Earth Observatory, https://earthobservatory.nasa.gov/features/BlueMarble | Public domain | `tiles/`, `tex/` |
| Elevation and sea floor | ETOPO1 Global Relief Model, NOAA NCEI, https://www.ncei.noaa.gov/products/etopo-global-relief-model | Public domain | `data/earth/elev_quarter.bin` |
| Moving continents | Merdith et al. 2021, "Extending full-plate tectonic models into deep time", https://zenodo.org/records/4485738 | CC BY 4.0 | `data/plates/` |
| Deep-time temperature | C. R. Scotese 2022, Global Mean Surface Temperatures for 100 Phanerozoic Time Intervals, https://zenodo.org/records/8238875 | CC BY 4.0 | `data/earth/model.json`, `data/earth/zonal_temp.png` |
| Ice sheets | Batchelor et al. 2019, "The configuration of Northern Hemisphere ice sheets through the Quaternary", https://osf.io/7jen3/ | CC BY 4.0 | `data/earth/ice/` |
| Sea level | Spratt and Lisiecki 2016, "A Late Pleistocene sea level stack", NOAA World Data Service for Paleoclimatology, https://www.ncei.noaa.gov/access/paleo-search/study/19982 | Public domain | `data/earth/model.json` |
| Modern geography (countries, states, cities, rivers, labels) | Natural Earth, https://www.naturalearthdata.com/ | Public domain | `data/geo/` |
| Historical territories before 1886 | "Historical boundaries of world countries and cultural regions", André Ourednik and contributors, https://github.com/aourednik/historical-basemaps | **GPL-3.0** | `data/borders/hb/`, `data/borders/through-time.bin`, the `polities` lists in `data/countries/` |
| Borders since 1886 | CShapes 2.0, Schvitz, Girardin, Rüegger, Weidmann, Cederman and Gleditsch 2022, https://icr.ethz.ch/data/cshapes/ | **CC BY-NC-SA 4.0** | `data/borders/cshapes/` |
| Events, places, dates, national events | Wikidata, https://www.wikidata.org/ | CC0 1.0 | `data/events/`, `data/search/`, `data/countries/` |
| Lead sentences shown under automatic records | English Wikipedia, by its contributors, https://en.wikipedia.org/ | **CC BY-SA 4.0** | `data/wikipedia/` (with `ATTRIBUTION.json`) |
| Earthquakes, eruptions and tsunamis | NCEI Global Significant Hazard Databases, NOAA, https://www.ngdc.noaa.gov/hazard/hazards.shtml | Public domain | `data/events/` (ids beginning `noaa`) |
| Fossil occurrences (life layer) | The Paleobiology Database, https://paleobiodb.org/ | CC BY 4.0 | `data/life/fossils.json` |
| Population through time | Our World in Data, "Population (historical estimates)", from HYDE 3.3, Gapminder and UN World Population Prospects, https://ourworldindata.org/grapher/population | CC BY 4.0 | the `pop` lists in `data/countries/` |
| Pictures (40) | Wikimedia Commons, one licence per file | Public domain, CC0, CC BY or CC BY-SA; the author, licence and file page are shown under every picture | `media/`; the credit travels with each scene in `data/curated/stories/` |
| Typefaces | Archivo (Omnibus-Type), Source Serif 4 (Adobe), Andika (SIL International), via Fontsource | SIL Open Font License 1.1 | `assets/fonts/` |

### What the share-alike and non-commercial licences mean here

- **historical-basemaps (GPL-3.0)** and **CShapes 2.0 (CC BY-NC-SA 4.0)** are stored in their own folders under
  `site/data/borders/` in a derived binary form. They are data files read by MIT-licensed code; they are not
  compiled into it. Because CShapes is non-commercial, anyone using this site commercially must remove
  `data/borders/cshapes/` (the site then falls back to the 1880 to 2010 snapshots of historical-basemaps) or
  obtain the data under other terms.
- **Wikipedia text (CC BY-SA 4.0)** appears in two ways: quoted lead sentences under automatic records, stored only
  in `site/data/wikipedia/` and marked "From Wikipedia, CC BY-SA 4.0" wherever they are shown; and as the cited
  source of the curated writing, which is original text released under the same licence.
- Attribution for every dataset is visible in the site under **Sources**, and the source of each passage and
  record is linked beside it.

## Privacy

The site makes no requests to any other origin, sets no cookies and has no analytics. Exploration memory and the
reading level are kept in the browser's local storage and never leave it. Location is asked for only when the
reader presses "Use my location", and is used once to move the globe.
