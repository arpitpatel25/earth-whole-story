# EARTH: The Whole Story. Final report

Built by Claude Fable 5.2 (see `MODEL.txt`), alone and in one working session, from `SPEC.md`.
This file says what exists, how to run it, how it was checked, where it falls short, and what was never checked.

## What was built

A static website in `site/`: one globe and one clock, from the Big Bang to today.

- **The base.** A timeline of 13.8 billion years on a designed scale, with 112 named era bands. A globe that is right
  for the date: continents moved on the Merdith 2021 plate model back to a billion years ago, ice sheets and sea level
  through the ice ages, borders from 123,000 BCE to today, satellite imagery for the present. The clock moves only
  when the user moves it.
- **Events.** 67,721 dated, located events from Wikidata, NOAA and Wikipedia, each with its sources; 4,810 fossil
  finds from the Paleobiology Database that ride their plates in deep time.
- **Two flagship stories.** *How We Became Human* (42 scenes) and *World War II* (48 scenes), scroll-driven on the
  globe, with moving fronts, data charts, sourced images, quizzes in Kid mode and "this led to" endings.
- **Fourteen shorter stories** in nine formats, and **twelve trails** (nine of them not about war or politics).
- **India in depth.** 22 eras by 15 lenses: 302 curated cells and 19 that say honestly that the record is thin;
  1,006 curated events; 229 biographies (70 women; scientists, artists, reformers, Dalit and Adivasi lives, ordinary
  lives); a history view for each of the 28 states and 8 union territories.
- **Every country.** A baseline timeline for each of 258 countries and territories. 213 have 30 or more sourced
  events; the other 45 say plainly that the record in our sources is thin.
- **Twenty-three explorable 3D scenes** built in code from the dimensions their sources give, with 87 labelled parts.
- **Six events told region by region** (the Second World War, the Black Death, the Atlantic slave trade, the Columbian
  exchange, the Cold War, Partition) with 33 region views.
- **Around all of it:** fifteen lenses, and six for deep time that redraw the planet itself (plates, temperature,
  fossil finds, mass extinctions, seas, sky); Kid mode with separately written text for every curated
  record; search over events, people, places, eras and dates; "What stood right here?", "This day", "Surprise me",
  "Meanwhile, elsewhere"; exploration memory in local storage; a link and a preview image for every state of the
  page; opt-in procedural sound; the `window.__earthCapture` contract with its nine fixed views.

Nothing is loaded from another origin. There is no tracker, no account and no key.

## How to run it

```
node pipeline/serve.mjs 4173        # then open http://localhost:4173
```

or serve `site/` with any static file server. To rebuild and to test, see `README.md`. In short:

```
source ./env.sh && npm install
node pipeline/build-site.mjs && node pipeline/16-share.mjs
node tests/run-all.mjs              # writes tests/results/summary.md
```

## How it was verified

Every test below was run against the final build on 10 November 2026, the browser tests in headless Chromium.
`tests/results/summary.md` records each suite against a fingerprint of the build it ran on.

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Any year from 3000 BCE to today can be reached and shows matching content | pass | 40 years by the clock, 5 typed dates |
| 2 | Time never changes unless the user moves it (60 seconds idle) | pass | date stayed at 1347.5 while the ambient clock advanced 60 s |
| 3 | Rotating or zooming never changes the time; changing time never moves the camera | pass | drag: -33.8 deg, date fixed; time wheel: 96 years, camera fixed |
| 4 | Continents visibly change from 1 Gya to today and end at real coastlines | pass | frame-to-frame change 14% 16% 46% 48% 21% 45%; present-day offset 0.00000 deg over 455 points |
| 5 | Ice sheets and sea levels change across the ice ages | pass | sea level 20 ka: -117.6 m; Laurentide view differs 73%; Sunda shelf differs 34% |
| 6 | Borders change year by year in recorded history | pass | 8/10 places changed hands 4+ times since 500 BCE; 10 dated changes land in the right year (Karlovy Vary 1939: Czechoslovakia to Germany (Prussia); Leipzig 1991: German Democratic Republic to German Federal Republic; Kyiv 1992: Russia (Soviet Union) to Ukraine); Europe's map changed in 16 separate years of the 20th century (1906, 1909, 1913, 1914, 1918, 1919, 1920, 1921, 1922, 1939, 1940, 1945, 1947, 1991, 1992, 1993) |
| 7 | Timeline scrubbing is smooth, with no blocking load | pass | 642 frames: median 16.7 ms, 95th percentile 16.7 ms, worst 17 ms |
| 8 | Clicking any of 200 randomly sampled pins opens a correct, complete deep view | pass | 210 sampled records resolve to complete views (160 automatic, 50 curated); 20 real clicks on pins opened the right view |
| 9 | 100 random land points at 20 random times: real content or an honest thin-record statement | pass | 2000 place-moments: 2000 with content, 0 with an honest thin-record statement, 0 blank |
| 10 | All 15 lenses visibly change the view (and the 6 deep-time lenses) | pass | pins per lens over India in 1930: power 260, war 260, trade 82, work 70, food 23, daily 260, science 260, medicine 142, technology 260, religion 232, arts 260, language 119, nature 260, movement 260, women 42; deep-time lenses at 100 Ma change the screen by: geology 26%, climate 45%, life 23%, extinctions 41%, oceans 42%, cosmos 41% |
| 11 | Search finds events, people, places and dates, and moves clock and globe | pass | 8 searches; choosing a result set the clock to 1757.48 and flew to 24.0, 87.1 |
| 12 | "What stood right here?", "This day", "Surprise me", "Meanwhile" and Trails all work | pass | right here: 141 lines for Rome; this day: 12 events (This day in history: 10 November); surprise: "Srebrenica massacre"; meanwhile: present; 12 trails, 131 stops walked |
| 13 | Coverage audit meets every target | pass | all targets met; see tests/coverage-audit.md |
| 14 | Every curated record has a source with a valid URL; a random 300 links resolve | pass | 300 of 300 sampled links resolved (seed 1); see tests/link-check.md |
| 15 | Fact audit of 200 sampled claims against re-retrieved sources | pass | round 2, seed 11: 200 of 200 claims supported; earlier rounds: seed 7, 10 failed the mechanical check and were each read, then corrected or explained; see tests/fact-audit.md |
| 16 | No placeholder text anywhere | pass | 2,774 text files and 67,721 event rows scanned; 0 filler words, 0 empty fields |
| 17 | Kid mode exists for all curated content | pass | 275 scenes, 131 trail stops, 321 India cells, 1006 India events, 229 biographies, 36 states, 23 3D scenes, 6 multi-region events, 106 eras: all have separate Kid text |
| 18 | Both flagship stories have 40+ scenes and work forwards, backwards and when stopped midway | pass | How We Became Human: 42 scenes forwards and backwards, explored at scene 21; World War II: 48 scenes forwards and backwards, explored at scene 24 |
| 19 | All 12 shorter stories play through | pass | 14 stories, 9 formats: black-death 12, silk-roads 14, mongol-empire 12, atlantic-slave-trade 12, cold-war 14, columbian-exchange 11, dinosaur-extinction 13, industrial-revolution 15, mining-and-metals 15, zero 14, printing-press 14, spice-trade 15, mohenjo-daro 12, ibn-battuta 12 |
| 20 | Multi-country events draw across the globe and show region-specific views | pass | region views shown from here: black-death 5, columbian-exchange 5, atlantic-slave-trade 5, ww2 8, cold-war 6, partition 4; a war scene draws 4 overlays across the map |
| 21 | Screenshot review of 100+ varied views | pass | 186 views captured and examined, 16 contact sheets in tests/screenshots/ |
| 22 | Desktop frame rate is logged, targeting 60 fps | pass | median 60.2 fps over 10 views, slowest 56.9; first frame 221 ms; see tests/perf-log.md |
| 23 | Mobile emulation at 390x844 is fully usable, and quality scaling triggers | pass | phone starts at "low" quality; desktop steps medium to low under load; touch drag, menu, India sheet, deep view, 3D part and story all usable at 390x844 |
| 24 | No uncaught console errors across a ten-minute random exploration | pass | 445 actions in 10 minutes, 0 console errors, 0 requests to other origins; see tests/exploration-log.md |
| 25 | All 9 capture views work through window.__earthCapture | pass | 9 views ready, exact, deterministic and non-empty (mean brightness 14 48 45 41 49 103 75 66 71) |
| 26 | All shareable links restore state exactly | pass | 11 links restored and round-tripped; titles such as "1943 CE, Russia \| EARTH: The Whole Story", "1930 CE, Gujarat, India \| EARTH: The Who", "World War II, 8 September 1942, Russia \|" |
| 27 | Size and file limits; no secrets or absolute local paths | pass | site 209 MB in 8,546 files, largest 5.0 MB, folder 5.28 GB; 0 secrets or local paths |

Four of these deserve a plain account.

**Screenshot review (21).** 186 views were captured and laid out as 16 contact sheets, and every sheet was looked
at. The review found real faults, all fixed: at 15 million years ago the panel listed the Black Death as happening
"around now", because the time window grew wider than the distance to the present; fossil birds were labelled
"dinosaur" and appeared in historical years; the share sheet printed the word "null"; trails opened by the capture
contract could be left at latitude 0, longitude 0; the reading-level switch was missing inside stories; on a phone,
story cards showed through the timeline; in the intro the caption overlapped the planet.

**Fact audit (15).** Round one (200 claims, sources retrieved again) failed 10 on a mechanical check of numbers and
names. Reading them showed two kinds: claims the source did not support, which were corrected, and honest
restatements the check could not follow ("the 1200s" for "13th century"). The check was taught the restatements and
then run over every curated claim, 4,510 of them. 209 needed attention and all were dealt with; 43 claims were
corrected in `content/`. Typical faults: a founding year that was not in the cited article, "for 200 years" where the
source gives no end date, "more than 700 years" where the source supports "about 700", a place description added from
memory ("in North Africa"), a disputed date stated as settled. The claims the source does support are explained
one by one, with the source's own words, in `tests/fact-audit-notes.json`. A second sample of 200 was then audited
against sources retrieved again: all 200 were supported, five of them by a recorded reading. The check proves that the figures and names in a claim occur in its source. It does
not prove that every sentence is a fair reading of the source; see the limits below.

**Lenses (10).** The final run failed this test once. The six deep-time lenses had only ever filtered pins, and
with the time window corrected there were too few pins at 100 million years ago for the screen to change. That was a
real gap, not a test artefact: a lens is meant to change what the globe emphasises. Each deep-time lens now redraws
the planet from data the site holds (plates, zonal temperature, fossil finds, the dated mass extinctions) and says
in the panel what it shows. The test now requires each to change the planet, to differ from the others and to
explain itself.

**Frame rate (22).** Measured in headless Chromium on the build machine. A fault found on the way: the Earth shader
computed procedural noise it did not need in the modern era, which halved the frame rate at close zoom. Fixed.

## Known limitations

Stated as they are.

1. **Sources are mostly Wikipedia and Wikidata.** Every curated text was written from retrieved article text and
   names it, but Wikipedia is a tertiary source and its errors are inherited. The automatic event layer comes
   straight from Wikidata and carries its mistakes (a "state founded" date that is really a dynasty's, for example).
   The interface marks these records as automatic and unreviewed.
2. **Lead sentences are missing for a sixth of the automatic events.** The job that retrieved Wikipedia leads ran into
   a two-hour limit at 49,793 of 59,787 records and was not restarted. The rest show their Wikidata description and
   source links.
3. **Borders are only as good as the open data.** Before 1886 they are world snapshots (historical-basemaps) blended
   between snapshot years; the names and shapes are approximate and the interface says so. From 1886 to 2019 they
   come from CShapes 2.0, which dates changes to the day but follows a list of sovereign states: Austria stays on the
   map from 1938 to 1945, and colonies carry the name of the later state.
4. **Deep time is a reconstruction.** Continents are today's outlines carried on rigid plates; ancient shorelines
   were different. Land colour is a climate sketch. Before a billion years ago no global plate model exists and the
   shapes are illustrations. All of this is labelled on screen.
5. **Forty-five countries and territories have thin timelines**, five of them UN member states (Brunei, Eswatini,
   Lesotho, the Marshall Islands, Tuvalu). They say so. The spec asks for 30 sourced events or an honest note;
   these have the note.
6. **Nineteen India cells say the record is thin** instead of offering an essay. That is the honest answer for
   them from the sources retrieved, not a finished piece of research.
7. **Places without a source have no pin.** 36 India events and 102 biographies are listed and searchable but not
   pinned, because their sources give no single place.
8. **Modern city names appear at all dates** on the label layer. A table of historical names was planned and not
   built.
9. **The 3D scenes are simplified.** They are built from primitives and sourced dimensions, not scanned. Each says
   what is approximate.
10. **Kid mode covers curated content only.** Automatic records have no separately written Kid text.
11. **The fact check is mechanical plus reading.** It checks numbers and proper names against the source, and a
    person-like reading of whatever fails. A claim with no number or name in it, or a subtle misreading, would pass.
12. **Preview pages use relative image paths** because the address the site will be served from is unknown. Some
    services want absolute URLs; a host can rewrite them.

## Not verified

- **Real devices and other browsers.** Everything was run in headless Chromium on one Mac. Safari, Firefox, a real
  phone and a low-end GPU were not tried. The phone results are emulation at 390 by 844.
- **Sound by ear.** The tests confirm the sound stays off until asked for and starts without error. Nobody listened.
- **Hosting.** The site was only ever served from a local static server, at the root and from a sub-folder
  (`tests/subpath.mjs`). It was never put on a real host, behind a CDN or under compression.
- **Screen readers.** Controls have labels, focus is visible and reduced motion is respected, but no assistive
  technology was run against it.
- **Links over time.** 300 source links resolved on the day of the test.
- **Long sessions.** The longest continuous automated session was ten minutes.

## How the work was done

- **No subagents were used.** The spec allows delegation, but the standing instruction on this machine requires
  approval before spawning any, and no one was available to approve. Everything was done in one session.
- **The parent repository's agent instructions were not followed.** They describe a different job (a social-media
  reply routine) that needs a logged-in browser and files outside this folder; the spec forbids both.
- **Nothing outside this folder was read or written.** Tool caches are redirected into `.cache/` by `env.sh`. No
  credential, key, account or paid service was used. The network was used for open data, documentation, open-source
  packages and the cited sources.
- **Two background jobs were stopped by their time limits.** The lead-sentence fetch (item 2 above) was not
  restarted. The first run of the fact audit was restarted with a longer limit and completed.
- **One mistake worth recording.** During the second fact audit, a retry timeout raced against requests the server
  was throttling, which stacked up more requests and made the throttling worse. The retrieval was changed to one
  request at a time, waiting out every refusal.

## Where to look

| For | Read |
|---|---|
| Architecture and the data pipeline | `PLAN.md` |
| Every choice made where the spec left room | `DECISIONS.md` |
| The visual system | `DESIGN.md` |
| Every data source and its licence | `LICENSES.md` |
| Conventions for adding content | `NOTES.md` |
| Counts against every target | `tests/coverage-audit.md` |
| The fact audit and its notes | `tests/fact-audit.md`, `tests/fact-audit-notes.json` |
| The reviewed screenshots | `tests/screenshots/sheet-01.jpg` to `sheet-16.jpg` |
