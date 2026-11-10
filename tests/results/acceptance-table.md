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
