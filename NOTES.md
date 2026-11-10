# Working notes (for whoever continues this build)

Read `SPEC.md`, `PLAN.md`, `DECISIONS.md` and `progress.json` first. This file records conventions that
are easy to lose.

## Commands

```
source ./env.sh                              # caches stay in this folder
node pipeline/build-site.mjs                 # compile content/ + bundle src/ into site/ (atomic swap)
node tests/shot.mjs "y=1347,lat=45,lon=30,alt=6000"   # screenshot via the capture contract
node pipeline/leads.mjs --chars 500 "Title" ...       # retrieve Wikipedia leads (cached in data-raw/wiki)
node pipeline/facts.mjs "Title :: regex" ...          # sentences matching a pattern in the full article
node pipeline/images.mjs "Title"                      # image candidates with Commons licence
node pipeline/11-media.mjs                            # fetch every `img:` used in content/
node pipeline/07-extracts.mjs                         # Wikipedia lead sentences for events (slow, resumable)
```

## Rules for curated writing

1. Retrieve first (`leads.mjs`, `facts.mjs`), then write only what the retrieved text supports.
2. Every record needs `src:` (Wikipedia article title, or `url | title | publisher`).
3. Places are never typed from memory: use an article title that has coordinates, or coordinates
   quoted in a retrieved source.
4. Every record has Kid text (`K:`), written separately.
5. Debated things say so (`conf: debated`), schematic drawings say so (`note:`).

## Content format

`content/**/*.txt`, parsed by `pipeline/lib/content.mjs`, compiled by `pipeline/12-curated.mjs`.
Record types: `@era`, `@story` + `@scene` + `@quiz`, `@trail` + `@stop`, and the India types
(`@iera`, `@icell`, `@ievent`, `@person`, `@istate`), `@model`.
Scene overlays: `show: site|label|ring|arrow|route|area|region|front|spread | key=value ...`.
Keyframed fronts and spreads live in `content/tracks/*.json`.

## Data layout in site/

`data/events` (67k automated events, tiled), `data/wikipedia` (CC BY-SA extracts, separable),
`data/borders/hb` (GPL-3.0) and `data/borders/cshapes` (CC BY-NC-SA), `data/plates`, `data/earth`,
`data/geo`, `data/curated` (compiled hand-written content), `tiles/` (imagery), `tex/`, `media/`.

## India in depth: how the content is made

- Compiler: `node pipeline/13-india.mjs --audit` (reads `content/india`, writes `site/data/curated/india/*.json`,
  prints counts and which matrix cells are missing; exits 1 on any problem). `build-site.mjs` runs it, with the 3D scene and
  multi-region compilers (`14-models.mjs`, `15-wide.mjs`), before `12-curated.mjs`.
- Eras: `content/india/eras.txt` (`@iera`, 22 eras, done). Cells: `content/india/cells/*.txt`
  (`@icell <era>.<lens>` with `src:`, `T:`, `K:`; add `thin: 1` for an honest "the record is thin" cell).
  Target: 300+ curated cells (21 human eras x 15 lenses + 6 deep-time lenses for `deep-time`).
- Events: `content/india/events/*.psv`, one line each, fields separated by ` | `:
  - from the automatic layer: `Q123 | lenses | region | Explorer sentence | Kid sentence [| date=…; title=…; place=…]`
  - new: `+slug | date | place (article with coordinates, or "lat, lon") | lenses | region | Source article; Another | Title | Explorer | Kid`
  Regions: north northwest gangetic east northeast central deccan south west himalaya islands all pakistan bangladesh
  nepal bhutan srilanka afghanistan abroad. Target: 1,000+.
- People: `content/india/people/*.psv`: `Article title | born..died | place | lenses | tags | Explorer | Kid [| display name]`.
  Tags: woman scientist artist writer reformer dalit adivasi ruler saint soldier freedom ordinary musician athlete
  business thinker traveller builder politician poet doctor film. Target: 200+.
- States: `content/india/states.txt` (`@istate CODE`, keys `name, kind, at, src, T, K`). Target: 28 states + 8 UTs.
- Research helpers (retrieved text only, never memory):
  - `node pipeline/india-candidates.mjs --from 1800 --to 1900 --n 70 --chars 125 --country IND,PAK --not city-founded`
    lists automatic events with their retrieved Wikipedia lead, skipping ones already curated.
  - `node pipeline/leadlist.mjs --chars 215 --file list.txt` prints compact leads (adds the first dated sentence).
  - `node pipeline/facts.mjs --chars 330 "Title :: regex"` to verify a detail before writing it.
- Rule learned the hard way: write only what the visible retrieved text says. When a detail came from memory,
  verify it with `facts.mjs` or remove it.
- The India UI is `src/ui/india-view.js`: the sheet (matrix, events, people, states), records `icell:` `iera:` `istate:`
  and `p-…`, pins, and the `app.indiaCell(lon, lat, y, lens)` hook that feeds the "Here, then" panel.
- `pipeline/07-extracts.mjs` must run as a single job (it merges on save now). Re-run until `0 to fetch`.

## Status checklist (update as work lands)

- [x] Engine, timeline, capture contract, URL state (trail and stop included)
- [x] Plates, ice, sea level, imagery tiles
- [x] Borders, labels, pins, here panel, deep view, search, lenses
- [x] 67k events; lead extracts fetched for about two thirds (the background fetch hit its 2 h limit at 20,400 of 30,387 and was not restarted; events without a lead still show their Wikidata description and source links)
- [x] Eras (105), 16 stories in nine formats (275 scenes), 12 trails (131 stops)
- [x] India in depth: 22 eras, 302 curated + 19 thin cells, 1,006 events, 229 people (70 women), 36 state views, UI (sheet with matrix / events / people / states; records icell: iera: istate:, p-…; tests/india-shots.mjs)
- [x] 23 explorable 3D scenes built in code (`src/models/`, text in `content/models/models.txt`), the Solar System view
- [x] Country baselines for 258 countries and territories (`pipeline/06d-countries.mjs`, `06e-national.mjs`), 45 flagged thin
- [x] Fossil life layer (`pipeline/08-fossils.mjs`), six multi-region events with 33 region views (`content/wide/`)
- [x] Sourced intro texts, share pages and share image (`pipeline/16-share.mjs`; run it after the last `build-site.mjs`)
- [x] DESIGN.md, LICENSES.md, FINAL.md, the 27 acceptance tests (`node tests/run-all.mjs`), audits, screenshot review
- [ ] Not built: a table of historical city names (labels use today's names with the polity of the time; see DECISIONS.md)

## Tests

`node tests/run-all.mjs` runs everything and writes `tests/results/summary.md`; `--only facts --facts-seed 13` runs one
suite. Each result is recorded with a fingerprint of the build, and the summary marks a result stale when the build
has changed since.

Fact checking has two parts. `tests/sweep-facts.mjs` checks every curated claim against the source text the build
retrieved (no network, a minute). `tests/audit-facts.mjs` draws a random sample and retrieves the sources again
(acceptance test 15). A claim the mechanical check cannot confirm must be read against the source; if the source
supports it, the reason goes into `tests/fact-audit-notes.json` with the claim's exact wording (change the wording and
the note no longer applies). Run the sweep after any change to `content/`.

Helpers: `tests/sweep-evidence.mjs` prints the source passages that bear on each flagged claim;
`pipeline/edit-content.mjs edits.json` applies exact replacements to `content/` (each must match once);
`tests/add-notes.mjs notes.json` records hand readings; `tests/probe.mjs "<js>"` asks the running app a question.

Retrieval manners: one request at a time and wait out every `429`. Racing a timeout against a throttled request
stacks up more requests and makes the throttling worse (this cost an hour once).
