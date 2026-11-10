# EARTH: The Whole Story

One globe, one clock. Set the time anywhere from the Big Bang to today, turn the Earth, and see what was
happening there, then.

- 13.8 billion years on one timeline; continents that move on a real plate model; ice sheets, sea level and
  borders that change with the date.
- 67,721 dated, located events from open databases; a baseline timeline for every country and territory.
- 16 scroll-driven stories (two of them long: *How We Became Human* and *World War II*), 12 trails, 23 explorable
  3D scenes, six events told region by region.
- India in depth: 22 eras by 15 lenses, 1,006 curated events, 229 biographies, a history view for every state
  and union territory.
- Fifteen lenses (and six for deep time), a Kid mode with separately written text, search, share links for every
  state of the page, and sources beside everything.
- Music generated in the browser, on by default, with a mood for each stretch of time and one control to turn it
  off. No audio file is shipped or downloaded.

## Run it

`site/` is a complete static build. Serve it with any static file server:

```
node pipeline/serve.mjs 4173        # then open http://localhost:4173
```

There is no server code, no account, no key and no request to any other origin.

## Rebuild it

```
source ./env.sh                     # keeps every tool cache inside this folder
npm install
node pipeline/build-site.mjs        # checks and compiles content/, bundles src/ into site/
node pipeline/16-share.mjs          # preview pages and the share image (photographs the built site)
```

The data under `site/data`, `site/tex` and `site/tiles` is produced by the numbered scripts in `pipeline/`
from open datasets downloaded into `data-raw/` (not kept in the repository). `PLAN.md` lists every step and
what it reads and writes. The Python steps (plates, ice) need the packages in `requirements.txt`.

## Test it

```
node tests/run-all.mjs              # everything below, in order; writes tests/results/summary.md
node tests/run-all.mjs --only links # one suite; the summary marks results from an older build as stale
node tests/acceptance.mjs           # the browser tests of the specification (section 18)
node tests/audit-coverage.mjs       # counts against every target
node tests/audit-links.mjs          # a random 300 source links
node tests/audit-facts.mjs          # 200 curated claims against their re-retrieved sources
node tests/sweep-facts.mjs          # every curated claim against the source text the build retrieved (no network)
node tests/scan-placeholders.mjs    # nothing unfinished: no filler words, no empty fields
node tests/check-size.mjs           # size limits, no secrets, no local paths
node tests/perf.mjs                 # first view and frame rates
node tests/explore.mjs              # ten minutes of random use with no console error
node tests/screens.mjs              # 150+ views as contact sheets in tests/screenshots/
node tests/subpath.mjs              # the build served from a sub-folder
node tests/music.mjs                # music: on by default, the control, moods and crossfades, levels, capture mode
```

## Where things are

| Folder | What |
|---|---|
| `content/` | Everything written by hand, in a compact text format: stories, trails, eras, India in depth, 3D scene texts, region views. Each record names the retrieved source it was written from. |
| `src/` | The application: vanilla ES modules and three.js. `core` (time, state, URL, capture contract), `globe` (engine, shaders, plates, borders, pins, labels), `ui`, `story`, `models`. |
| `pipeline/` | The data pipeline and the build. |
| `site/` | The deployable build. |
| `tests/` | Acceptance tests, audits and their reports. |
| `data-raw/` | Downloads and caches (ignored by git). |

## Adding content

Curated content is data. A new story is a text file in `content/stories`; a new trail a file in `content/trails`;
a new India cell a record in `content/india/cells`. The build refuses a record whose source was not retrieved, so
write only what the source says. `NOTES.md` describes the format and the helpers.

## Documents

`PLAN.md` architecture and pipeline. `DECISIONS.md` choices and limits. `DESIGN.md` the visual system.
`LICENSES.md` every source and its licence. `FINAL.md` what was built and how it was verified.

Code is MIT licensed. Data keeps the licences of its sources; the share-alike and non-commercial datasets are
kept in their own folders (see `LICENSES.md`).
