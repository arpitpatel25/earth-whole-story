# Coverage audit

Run on 2026-11-10 by `node tests/audit-coverage.mjs`.

| Measure | Count | Target | Result |
|---|---|---|---|
| Global dated, located events | 67,721 | >= 25,000 | met |
| Fossil occurrences (life layer) | 4,810 | present | met |
| Countries and territories with a baseline timeline | 258 (234 with a UN code) | every UN member state and recognised territory | met |
| ... with 30 or more sourced events | 213 | all, or a thin-record note | met |
| ... with fewer than 30, each carrying an honest thin-record note | 45 (45 flagged) | all flagged | met |
| India: eras in the matrix | 22 | >= 19 | met |
| India: curated matrix cells | 302 | >= 300 | met |
| India: cells with an honest thin-record statement | 19 | stated, not blank | met |
| India: curated, sourced events | 1,006 | >= 1,000 | met |
| India: biographies | 229 | >= 200 | met |
| ... women / scientists / artists and writers / reformers / Dalit / Adivasi / ordinary lives | 70 / 39 / 75 / 44 / 3 / 8 / 10 | each present | met |
| India: state and union territory history views | 36 | 36 | met |
| India: regions with curated events | 19 (all 71, deccan 78, himalaya 59, south 160, central 35, gangetic 68, pakistan 57, north 116, west 101, afghanistan 21, northwest 31, east 98, srilanka 17, nepal 18, northeast 37, abroad 10, bangladesh 15, bhutan 3, islands 11) | all 11 regions and the wider subcontinent | met |
| Flagship stories (scenes) | How We Became Human 42; World War II 48 | 2 stories, 40+ scenes each | met |
| Shorter stories | 14 | >= 12 | met |
| Story formats used | 9 (deep-time, war, spread, flow, rise-fall, rivalry, chain, daily-life, biography) | 9 | met |
| Trails | 12 (salt 10, writing 10, libraries 11, germs 10, flight 10, buddhism 10, life 10, sky 11, building 13, battles 14, india-freedom 11, rights 11) | >= 12, each with >= 8 stops | met |
| Trails not primarily about war or politics | 9 (salt, writing, libraries, germs, flight, buddhism, life, sky, building) | >= 6 | met |
| Explorable 3D scenes | 23 (87 labelled parts) | >= 20 | met |
| Multi-region events with region views | 6 (33 region views) | present | met |
| Lenses | 15 human, 6 deep-time | 15 and 6 | met |
| Named era bands on the timeline | 112 | the backbone in section 5 | met |
| Curated records | 2,275 | counted | met |
| ... with at least one source and a valid URL | 2275 of 2275 | 100% | met |

Curated records by kind: story scene 275, trail stop 131, era 106, India era 22, India cell 302, India cell (thin) 19, India event 1006, India biography 229, India state 36, 3D scene 23, 3D part 87, multi-region event 6, region view 33.

Per-country counts are in `site/data/countries/index.json` (`counts`: events in all; `located`: events with a point inside the border; `thin`: entries with fewer than 30).

Entries with fewer than 30 events (45): Dhekelia Cantonment 0, Western Sahara 7, Saint Martin 6, Sint Maarten 24, Brunei 25, Eswatini 24, Guantanamo Bay Naval Base 3, Brazilian Island 0, Lesotho 25, United Nations Buffer Zone in Cyprus 5, Siachen Glacier 2, Baikonur 1, Akrotiri Sovereign Base Area 1, Southern Patagonian Ice Field 0, Bir Tawil 0, Antarctica 23, Turks and Caicos Islands 20, Saint Pierre and Miquelon 7, Pitcairn Islands 14, French Southern and Antarctic Lands 2, Marshall Islands 23, United States Minor Outlying Islands 1, Saint Barthélemy 6, Anguilla 22, Cayman Islands 20, Bermuda 28, Heard Island and McDonald Islands 0, Saint Helena 10, Jersey 24, Isle of Man 26, Åland 28, Australian Indian Ocean Territories 4, British Indian Ocean Territory 2, Norfolk Island 17, Wallis and Futuna 9, Tuvalu 24, South Georgia and the South Sandwich Islands 10, Niue 23, Coral Sea Islands 0, Wake Island 0, Clipperton Island 0, Ashmore and Cartier Islands 0, Bajo Nuevo Bank 0, Serranilla Bank 0, Scarborough Shoal 0.
