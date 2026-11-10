# EARTH: The Whole Story — Plan

One globe, one clock. This file is the working plan for the Required Slice in `SPEC.md`.
It is also the recovery document: if work is interrupted, read this, `progress.json` and
`DECISIONS.md` and continue from the first unchecked milestone.

## 1. Architecture

A static site. No server code, no keys, no third-party calls at runtime.

```
content/        hand-written curated content (source of truth for stories, India, trails, eras, 3D text)
pipeline/       re-runnable scripts: download -> clean -> build data into site/data
data-raw/       raw downloads and retrieved-source cache (gitignored)
src/            application source (vanilla ES modules + three.js), bundled by esbuild
site/           the deployable build: index.html, assets/, data/, tiles/, s/ (share pages)
tests/          Playwright acceptance tests, coverage audit, fact audit, screenshots
```

### Runtime

| Part | Choice |
|---|---|
| Rendering | three.js (WebGL2), custom shaders. One `Engine` owns renderer, camera, ambient clock |
| State | One store `{y, lat, lon, altKm, lens, story, step, event, level}`. Time and place are separate fields; nothing writes `y` except user time input (timeline, date box, story scroll, links) |
| Time | `y` is a signed decimal year. A designed non-linear scale maps 13.8 Gya..now onto 0..1; the timeline shows a zoomable window of it |
| Globe by era | Cosmos scenes (before 4.6 Gya) -> molten Earth -> procedural Precambrian (labelled illustrative) -> real plate model 1 Gya..5 Ma (rigid plates rotated in the vertex shader from sampled finite rotations) -> real Earth with ice sheets and sea level from real reconstructions -> history layers |
| History layers | Territory meshes from snapshot datasets, crossfaded; city and label layers; event pins streamed by time bucket and spatial tile |
| UI | DOM overlay. Timeline, clock, "here and then" panel, deep view, search, lenses, stories, trails |
| Stories | A data-driven scroll engine with nine formats. Scrolling drives the clock and camera; the user can break out and resume |
| Capture | `window.__earthCapture` drives the same store and awaits real load promises |

### Data flow

```
open data  --pipeline-->  site/data/*.json|bin  (tiled by time and space)
retrieved sources --read--> content/*.txt|json (curated writing) --build--> site/data/curated
```

Every curated record names the source it was written from. The pipeline keeps the retrieved
text in `data-raw/sources/` so the fact audit can compare claim and source.

## 2. Data pipeline (each step is a script in `pipeline/`)

| Step | Input | Output |
|---|---|---|
| 00-download | manifest of open datasets | `data-raw/` |
| 01-imagery, 01b-tiles, 01c-elevation | NASA Blue Marble, Black Marble, ETOPO1 | base textures, elevation, tile pyramid |
| 02-plates, 02b-plates-mesh | Merdith et al. 2021 via pyGPlates | plate meshes and rotation samples |
| 03-earth-model, 03b-ice | Batchelor et al. 2019, Spratt and Lisiecki 2016, Scotese 2022 | ice rasters, sea-level and temperature curves |
| 04-geo | Natural Earth | countries, South Asian states, rivers, cities, transport, labels |
| 05-borders, 05b-through-time | historical-basemaps, CShapes 2.0 | territory meshes per snapshot, polity lookup, "who held this ground" |
| 06-events-harvest, 06a, 06b-events-build, 06c-noaa | Wikidata SPARQL, NOAA NCEI hazards | 67,721 events, deduplicated, ranked, tiled by time and place |
| 06d-countries, 06e-national | the event layer, Wikidata, historical-basemaps, Our World in Data | a baseline timeline for each of 258 countries and territories |
| 07-extracts | Wikipedia API | lead sentences for automatic records (kept apart: CC BY-SA) |
| 08-fossils | Paleobiology Database | 4,810 fossil occurrences, the life layer |
| 11-media | Wikimedia Commons | 40 pictures with per-file licence and credit |
| 12-curated | `content/` | eras, stories, trails, charts, manifest; every record checked against a retrieved source |
| 13-india | `content/india` | the era-by-lens matrix, events, biographies, state views |
| 14-models | `content/models` and `src/models/defs.js` | texts for the 3D scenes, checked part by part against the geometry |
| 15-wide | `content/wide` | multi-region events and their region views |
| build-site | `src/` | the bundle in `site/assets` (runs steps 12 to 15 first) |
| 16-share | the built site | preview pages under `site/s/` and the share image |

Research helpers used while writing: `leads.mjs`, `leadlist.mjs`, `facts.mjs`, `india-candidates.mjs`, `images.mjs`, `wdsearch.mjs`.

## 3. Milestones

- [x] M1 First working build: engine, all nine capture views, timeline, URL state, capture API
- [x] M2 Real Earth through time: plates, ice and sea level, imagery tiles, atmosphere, clouds
- [x] M3 History layers: borders, labels, cities, event pins, deep view, "here and then"
- [x] M4 Global events at 25,000+, per-country baselines, search, lenses
- [x] M5 Curiosity loops, Kid mode, sound, share, exploration memory
- [x] M6 Story engine, Story A, Story B, twelve short stories, twelve trails
- [x] M7 India in depth: matrix, 1,000 events, 200 biographies, state views
- [x] M8 Twenty 3D scenes
- [x] M9 Tests, audits, 100+ screenshot review, performance, mobile, accessibility
- [x] M10 FINAL.md

After M1, `site/` always holds a working build and every milestone ends in a commit.

## 4. Risks and how they are handled

| Risk | Handling |
|---|---|
| Stopped without warning | Atomic file writes, small commits, `progress.json` after every milestone |
| Facts from memory | Curated text is written only after the pipeline retrieves the cited source; fact audit re-checks |
| Wikidata query timeouts | Many small class-by-class queries with paging and a local cache |
| Paleo-geography before 1 Gya is not reconstructable | Shown as illustrative and labelled so in the interface |
| Historical borders are snapshots, not surveys | Labelled approximate; CShapes gives exact dates after 1886 |
| WWII front lines have no open dataset | Keyframed from sourced capture and liberation dates; labelled approximate |
| Initial load budget (5 MB) | Cosmos intro needs no textures; everything else is lazy and tiled |
| Phone GPUs | Quality tiers (pixel ratio, texture size, pin counts), measured frame time triggers downgrade |
| One writer, large curated corpus | Compact authoring format in `content/`, batch retrieval, validation at build |
| Disk limit 15 GB | Raw downloads pruned after processing; sizes logged in the coverage audit |
