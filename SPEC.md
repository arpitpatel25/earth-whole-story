# EARTH: The Whole Story — Build Specification

You are the only engineer, designer, researcher, writer and QA tester on this project. No human will answer questions or help. Read this whole document before writing any code. It is your complete brief. When something is unspecified, make the choice a world-class product team would make and record it in `DECISIONS.md`.

`MODEL.txt` in this folder contains your own model name. It is the only file that differs between builds.

---

## 1. Mission

Build a hosted, interactive 3D website where a person can explore the entire history of the universe, Earth and humanity on one globe, from the Big Bang to today.

It should feel like Google Earth, a great Vox explainer and an encyclopedia fused into one thing. It must be so engaging that a curious adult loses an evening in it and a ten-year-old uses it to learn. It should be the best thing of its kind that exists.

It is **not** a video, a slideshow, a static timeline page or a list of articles. The user is always in control, can stop anywhere, and can stay as long as they want.

### The non-negotiable idea
There is **one globe** and **one clock**. The user sets the clock. The globe shows Earth at that moment. The user moves anywhere on it and sees what was happening there, at that moment, in as much depth as they want.

---

## 2. Scope: the vision and the required slice

The vision is everything that has ever happened on Earth. A single build cannot complete that, so this spec defines a **Required Slice** that must be finished to a shipping standard, on an architecture that can grow to the whole vision by adding data rather than rewriting code.

**Required Slice:**
1. **The Base:** the complete timeline from the Big Bang to today, the full globe at every time (section 6), and the global event layer (section 9).
2. **Flagship Story A:** "How We Became Human" (section 11.1).
3. **Flagship Story B:** "World War II" (section 11.2).
4. **Country in full depth: India**, across all eras and every lens (section 12).
5. **Every other country** has a baseline timeline generated from sourced data (section 9.4), so nowhere on Earth is empty.

**Priority rule.** Depth and polish on the Required Slice beat breadth beyond it. Do not start anything outside it until all acceptance tests in section 18 pass.

---

## 3. How you must work

1. **Plan first.** Write `PLAN.md`: architecture, data pipeline, milestones and risks. Then build.
2. **Work end to end and keep going.** Do not stop at a prototype. Do not ask for confirmation. Do not leave TODOs, stubs, lorem ipsum, "coming soon", or mock data in the shipped site.
3. **You may be stopped at any time without warning.** After the first milestone, `site/` must always contain a working build. Commit to git after every meaningful change.
4. **See your own work.** Use a real browser (Playwright is acceptable) to run the site, take screenshots at many times, places and zooms, look at them, and fix what you find. Never assume something works because the code looks right.
5. **Delegate as you see fit.** You may use subagents and parallel work.
6. **Disk limit.** Total for this folder including raw downloads: **15 GB maximum**. Delete raw downloads you no longer need.
7. **Progress file.** Keep `progress.json` updated after every milestone: `{ "updatedAt", "milestone", "percentComplete", "workingBuild": true|false, "summary" }`.
8. **Work only in this folder.** Do not access, modify, or read anything outside it. Never touch credentials or use any paid service, API key or account. Internet access is for downloading open data, documentation and open-source packages only.
9. **Finish.** Stop only when every acceptance test passes. Then write `FINAL.md`: what was built, how to run it, known limitations stated honestly, and an honest list of anything unverified.

### Required folder layout
```
SPEC.md  MODEL.txt  PLAN.md  DECISIONS.md  progress.json  FINAL.md  README.md  LICENSES.md
pipeline/      scripts that download, clean and build data, re-runnable
data-raw/      downloads (not deployed, gitignored)
src/           source code
site/          final static build, deployable as-is
tests/         automated tests, coverage audit and fact audit
```

---

## 4. The experience, moment by moment

### 4.1 Opening (first 10 seconds)
- The page loads straight into darkness with no splash screen or marketing copy.
- Within a second or two the first frame of the universe is visible. A single line invites the user to scroll.
- Scrolling plays the Big Bang forward: light, first stars, galaxies, the Sun, planets, a molten Earth, cooling, oceans.
- A visible, always available **"Jump to any moment"** control and "Skip to Earth today" let anyone leave the intro at once. Returning visitors can resume where they left off.

### 4.2 The main view
Full-screen 3D globe. Interface elements float above it and stay out of the way. Permanently available:
- **The Timeline** along the bottom edge.
- **Current moment** in plain words, such as "1347 CE, summer" or "66 million years ago".
- **Lens switcher** (section 8).
- **Search**.
- **Reading level** switch (Explorer / Kid).
- **Share this exact moment**.

### 4.3 The Timeline, the only thing that moves time
**Historical time never advances by itself.** Time changes only when the user moves it. Ambient motion such as clouds, ocean shimmer, ships, armies inside a user-scrolled story and pulsing pins is allowed and encouraged, but the date never changes on its own.

Requirements:
- Spans 13.8 billion years ago to today in a single continuous control.
- **Non-linear scale**: deep time is compressed and recent time expanded, with named era bands visible on it. The user must be able to reach any year from 3000 BCE to today, and any month during major recorded events.
- Controls: drag; scroll wheel or trackpad over it; arrow keys; typing a date ("1857", "66 million years ago", "Mughal"); era buttons; touch swipe.
- Zooming the timeline itself lets the user go from aeons to individual years.
- While scrubbing, the globe changes continuously and smoothly, with no loading screens. Data streams in behind it.
- Event density ticks on the timeline show where a lot happened.

### 4.4 The globe
- Real 3D, freely spun by drag or touch and zoomed by scroll or pinch, with inertia.
- **Changing place never changes the time. Changing time never moves the camera.** Turn from Africa to India and the date stays fixed.
- Zoom range from whole planet down to individual city or site level.
- Zoom reveals progressively more detail: labels for empires and regions, then cities, then sites and individual events.
- At any time and place, the screen answers **"What was happening here, then?"** A panel or on-globe summary updates as the user moves, without clicking.

### 4.5 Going deeper
Glowing pins mark things worth opening. Clicking opens depth without leaving the globe. A deep view may include:
- A strong, well-written narrative, with short paragraphs.
- Who was there: people, including rulers, ordinary people, women and children where the record allows.
- Primary-source quotations and documents where available.
- Real images of artifacts, documents and places (public domain or open license only).
- Maps and data charts.
- 3D objects where specified (section 13).
- "Why did this happen?" and "What did it lead to?" links.
- Sources (section 10.3).

Every deep view must end with **"This led to…"** links to other moments, so the user always has somewhere to go next.

### 4.6 Addictive curiosity loops (all required)
- **What stood right here?** The user picks any city or uses their location (only with explicit permission). The globe flies there and they can scrub to see that spot through time.
- **This day in history**, chosen from real data for today's date.
- **Surprise me**, jumping to a fascinating, well-sourced moment.
- **Meanwhile, elsewhere:** at any moment, show what else was happening on other continents, e.g. "While the Colosseum was being built…".
- **Connections:** every event links to at least 2 related events where sources support it.
- **Trails:** themed journeys through events, like "The story of salt", "How the zero travelled" or "The spices that changed the world". At least 12 trails in the slice, each with at least 8 stops, and at least 6 not primarily about war or politics.
- **Exploration memory:** the site remembers what you've explored, using local browser storage only, and gently shows unexplored regions and eras.
- **Quiz moments** at the end of stories in Kid mode, with friendly feedback.

### 4.7 Kid mode
A switch that rewrites all curated text for ages 8–12 in simple, vivid, accurate language. It is real separate writing, not automatic truncation. Graphic violence, sexual violence and the most disturbing details are omitted or gently described, and the facts are never falsified.

### 4.8 Sound
Original procedurally generated ambient sound and subtle interface sounds using Web Audio. Muted until the user opts in with one obvious control. No copyrighted music. No voice narration.

### 4.9 Search
Instant search across events, people, places, eras, topics and dates. Selecting a result moves both clock and globe there.

---

## 5. Timeline eras: the minimum backbone

The timeline must contain at least these named bands. Dates must be verified against sources and corrected where this list is imprecise.

**Universe:** Big Bang (13.8 Gya); first atoms and the cosmic microwave background; cosmic dark ages; first stars; first galaxies; Milky Way forms; heavy elements from stars; Sun and solar system form (~4.6 Gya).

**Young Earth:** planetary accretion; Moon-forming impact; magma ocean; first crust and oceans; Late Heavy Bombardment (and its contested status); first life; photosynthesis; Great Oxidation Event; supercontinents Kenorland, Columbia, Rodinia; Snowball Earth; first complex cells; first animals.

**Life:** Ediacaran; Cambrian Explosion; Ordovician radiation and extinction; life moves onto land; first forests; Devonian extinction; Carboniferous coal forests; Pangaea; Permian "Great Dying"; dinosaurs rise; Triassic and Jurassic; Pangaea breaks apart; flowering plants; Cretaceous; Chicxulub impact; age of mammals; India collides with Asia and the Himalayas rise; first primates and apes; the Quaternary ice ages.

**Humans:** the whole of Story A, then Paleolithic cultures; last glacial maximum; sea-level rise and lost lands (Doggerland, Sundaland, Beringia); Green Sahara.

**Civilization:** independent origins of farming; first villages, towns and cities; writing; Bronze Age and its collapse; Iron Age; Axial Age; classical empires across Eurasia; the Americas, Africa, Oceania in their own right; Silk Roads; Indian Ocean trade; post-classical kingdoms; Islamic Golden Age; Song China; Mongols; Black Death; Mali, Great Zimbabwe, Inca, Aztec and Polynesian voyaging.

**Modern world:** ocean voyages; the Columbian Exchange; colonialism; Atlantic slave trade; gunpowder empires; Scientific Revolution; Enlightenment; revolutions; Industrial Revolution; mining and resource rushes; imperial expansion; abolition; world wars; decolonization; Cold War; space age; green revolution; globalization; internet; smartphones; climate change; machine learning.

**The final moment:** the last event on the timeline is *the creation of this website by the model named in `MODEL.txt`*, written honestly in the first person. It is the point where the entire story arrives at the thing telling it.

---

## 6. What the globe must show at each time

The globe must be different and correct at every time. Do not use a single modern Earth with labels.

| Time | The globe shows |
|---|---|
| Before Earth | Cosmic scenes, formation of the solar system, planets to scale-appropriate presentation |
| 4.5–4 Gya | Molten world, impacts, Moon formation, cooling crust |
| Precambrian | Oceans, primitive continents, Snowball Earth white-out, atmosphere color shift with oxygen |
| 1 Gya – today | **Continental plates moving through their real reconstructed positions**, from real plate models, continuously animated while scrubbing, into exactly today's coastlines |
| Ice ages | Ice sheets advancing and retreating, sea level changes exposing land bridges, changing vegetation |
| Holocene | Green Sahara drying, coastlines settling, spreading farmland and population |
| History | Empire and state territories that change year by year, cities appearing, routes, night lights, population |
| Modern | Rail, shipping, flight routes, city lights, forest loss, warming, today's real Earth |

Also:
- Realistic atmosphere and clouds, sun position and day/night where meaningful.
- Oceans, ice, deserts and forests appropriate to the period.
- Life layer: reconstructions of what lived where, using real fossil occurrence data.
- Transitions between periods must be smooth, with no pop.

---

## 7. Solar system
The solar system appears in the lead-up and as a place the user can zoom out to, with its formation and notable events such as Earth–Moon history and space missions. **It must remain secondary to Earth.**

---

## 8. Lenses: what "everything" means

A lens changes what the globe and panels emphasize, at the same place and time. Required:

1. **Power and government**: states, rulers, laws, revolutions, administration.
2. **War and conflict**.
3. **Money and trade**: currencies, markets, routes, banking, taxation.
4. **Work and industry**: farming, crafts, **mining and resources**, factories, labor, slavery and forced labor.
5. **Food**: crops, cuisines, famine, what people actually ate.
6. **Daily life**: homes, clothing, childhood, family, education, leisure.
7. **Science and mathematics**.
8. **Medicine and disease**: epidemics, healers, public health.
9. **Technology and invention**.
10. **Religion and belief**: faiths, myths, philosophy.
11. **Arts and culture**: art, architecture, music, literature, theatre, games and sports.
12. **Language and writing**.
13. **Nature and climate**: climate shifts, volcanoes, earthquakes, floods, animals, forests, rivers.
14. **Movement of people**: migration, exploration, diaspora, displacement.
15. **Women**, as a first-class lens rather than an afterthought.

The list is a minimum. Topics that do not fit are still included. Before humans, lenses switch to appropriate ones: Geology, Climate, Life, Extinctions, Oceans, Cosmos.

---

## 9. Data model and global event layer

### 9.1 Everything is data
Content must live in structured data so more can be added without changing code. Minimum entities: `Event`, `Place`, `Polity` (with time-varying territory), `Person`, `Story`, `Trail`, `Source`, `Artifact`.

### 9.2 Event schema (minimum)
```
id; title; summary; body; kidBody; start; end; datePrecision (exact|year|decade|century|approx);
places[] with coordinates and/or polygons; regions[]; polities[]; lenses[]; importance 1-5;
people[]; causes[]; consequences[]; related[]; media[]; sources[] (at least 1);
confidence (established|debated|fragmentary); notes
```

### 9.3 Multi-country and non-country events
Events are first-class and are **not** owned by a country. A war, plague, trade network, religion or invention spans many places and is drawn across the globe. Any region's view of such an event shows "this event, from here", including what is specific to that region.

Current country borders do not exist in the past. Selecting today's India in 1200 CE shows what was then in that territory.

### 9.4 Baseline coverage for every country
For every UN member state plus widely recognized territories, generate from sourced data:
- A timeline across all periods from which any record exists.
- Key polities, leaders, wars, events, cultural milestones, and population over time.
- At least 30 sourced events per country, or as many as exist with a note where the record is thin.

### 9.5 Global event layer target
At least **25,000** dated and located global events in the deployed site, from real sources, cleaned, deduplicated and importance-ranked so the globe stays legible at each zoom level. Events must stream by tile, region and time, so the initial page load stays small.

---

## 10. Research and truth

**You must not rely on your memory for facts.** Facts must come from retrieved sources and be traceable.

### 10.1 Data sources to use
Start with these. Verify current access and license for each, and record it in `LICENSES.md`. Find better ones where you can.

| Purpose | Sources to investigate |
|---|---|
| Modern geography | Natural Earth (public domain) |
| Satellite imagery | NASA Blue Marble / Visible Earth, NASA NEO |
| Continental drift | GPlates plate reconstruction models (e.g. Müller et al. 2022, Merdith et al. 2021, PALEOMAP coastlines on Zenodo), processed at build time with pyGPlates or GPlately |
| Historical borders | `aourednik/historical-basemaps` (GPL-3.0), CShapes (states since 1886), Seshat |
| Events, people, places | Wikidata (CC0, dumps or SPARQL), Wikipedia (CC BY-SA, attribution required) |
| Fossils and past life | Paleobiology Database (API) |
| Population and land use | HYDE 3.x, Our World in Data |
| Conflict | UCDP, Correlates of War, Seshat |
| Climate history | NOAA paleoclimatology, ice-core and sea-level reconstructions |
| Disasters | NOAA NCEI volcano, earthquake and tsunami databases |
| Images and artifacts | The Met Open Access (CC0), Art Institute of Chicago (CC0), Cleveland Museum of Art (filter to CC0), Smithsonian Open Access, Library of Congress, Wikimedia Commons (per-file license) |
| Texts and documents | Wikisource, Internet Archive, Project Gutenberg, national archives |

### 10.2 Truth rules
1. **Never invent** a fact, quotation, date, person, number, image caption or source.
2. Curated writing must be drawn from sources you actually retrieved.
3. **Quotations** must be verified against an accessible text, or omitted.
4. Where historians disagree, say so and present the main positions fairly. Use `confidence: debated`.
5. Distinguish clearly between what is documented, what is inferred from archaeology, and what is tradition or legend.
6. Reconstructions, such as ancient borders or past coastlines, are labeled as approximate.
7. National-narrative bias must be avoided. Do not tell history only from the victor's, colonizer's or any modern government's point of view. Cover contested topics, including in Indian history, with care and evidence.
8. Disputed modern borders are shown neutrally, and the dispute is stated.

### 10.3 Sources visible in the interface
Every curated claim block shows its sources: title, author or publisher where known, and working link. Automated events show where the record came from.

### 10.4 "Nothing blank"
Every place at every time shows something real. **Where the record is thin, say so honestly** and show what is known: archaeology, environment, the nearest known cultures, population estimates. A plain empty area is a bug. An invented filler is a worse bug.

### 10.5 Sensitive history
Slavery, genocide, colonial atrocities, partition violence and similar subjects get factual, humane treatment centered on those who suffered. No sensationalism, no gore for effect, no glorifying of perpetrators, no false balance about established atrocities. Add brief content notes where appropriate.

---

## 11. Flagship stories

Stories are scroll-driven documentaries **on the globe**. **Scrolling is the clock.** The user may stop at any point, spin the globe, click anything, and resume from that exact point. Each story must feel like the best Vox explainer ever made, and every scene must be explorable.

Each flagship story needs at least **40 scenes**, varied visual treatment, data visualizations, archival or reconstructed visuals with real sources, Kid mode, and "This led to…" endings.

The beats below are the minimum. Verify all dates and add what they lack.

### 11.1 Story A: "How We Became Human"
Must show on the globe, with real fossil sites:
- The primate family tree and our split from other apes.
- Early hominins, including *Sahelanthropus*, *Ardipithecus*, *Australopithecus* and "Lucy".
- Bipedalism and why it may have evolved, with the debates.
- First stone tools, including Lomekwi and Oldowan.
- *Homo habilis*, *Homo erectus* and the first movement out of Africa.
- Control of fire, cooking, and brain growth.
- Neanderthals, Denisovans, *Homo floresiensis*, *Homo naledi* and others, **shown coexisting in time**. The user sees multiple human species alive at once.
- Earliest *Homo sapiens*, Jebel Irhoud, Omo Kibish, and pan-African origins.
- Symbolic thought: ochre, beads, earliest art, burial.
- Dispersal routes across Asia, to Australia and into the Americas, with debated dates shown as debated.
- Interbreeding, and what remains in human DNA today.
- Extinction of the other humans, with competing explanations.
- The last ice age and what people did to survive.
- Sea-level rise and lost lands.
- Domestication of plants and animals, arriving independently in several places.

### 11.2 Story B: "World War II"
Must be genuinely global, and scrolled day by day through key periods with moving front lines:
- Origins: the aftermath of WWI, the Depression, fascism, militarism.
- Japan in Manchuria and China from 1931 and 1937, including Nanjing.
- Italy in Ethiopia, the Spanish Civil War, Munich.
- 1 September 1939: Poland. The Nazi–Soviet pact.
- 1940: fall of France, Battle of Britain.
- 1941: Barbarossa and Pearl Harbor.
- **The Holocaust**, given serious dedicated treatment; also the persecution of Roma, disabled people and others.
- Pacific: Midway, Guadalcanal, island campaigns, occupied Asia.
- Africa: Ethiopia, North Africa, El Alamein, and African soldiers.
- Eastern Front: Leningrad, Stalingrad, Kursk.
- **India and WWII**: millions of Indian soldiers, the Bengal famine of 1943, Quit India, the Indian National Army, Imphal and Kohima.
- Home fronts: women at work, rationing, propaganda, code-breaking, science.
- Colonial soldiers and subject peoples.
- 6 June 1944: Normandy. Fall of Berlin.
- Hiroshima and Nagasaki, with human testimony and sourced numbers.
- Liberation of the camps.
- Aftermath: casualties by country, the UN, Nuremberg and Tokyo trials, partitions, decolonization, the start of the Cold War.

Required visual systems for this story: moving front lines, alliance color-coding, troop and supply arrows, a live casualty and timeline counter, and archival imagery with credits.

### 11.3 Story formats
Build a reusable story engine with at least these formats, so that new stories become data: **War** (moving fronts, alliances), **Rivalry** (blocs, flashpoints), **Spread** (a phenomenon moving across the globe), **Flow** (trade, migration), **Rise and fall** (changing borders), **Chain** (causal sequences of ideas and inventions), **Deep time** (geology and evolution), **Daily life** (a day in a place and time), **Biography**. Any new topic may add a format.

Beyond the two flagships, build at least **12 shorter stories** (10+ scenes each) that prove range, with at least one for each of these: the Black Death; the Silk Roads; the Atlantic slave trade; the Cold War; the Mongol Empire; the Columbian Exchange; the dinosaurs' extinction; the Industrial Revolution and coal; the history of mining and metals; the story of zero and numerals; the printing press; the spice trade.

---

## 12. India in full depth

India is the proof of what "every country" will eventually mean. Treat "India" as the Indian subcontinent's history, with today's India as the entry point, and do not ignore the shared histories of today's Pakistan, Bangladesh, Nepal, Bhutan, Sri Lanka and Afghanistan.

### 12.1 Eras (minimum; verify dates)
1. Deep time: Gondwana, the Deccan Traps, the collision with Asia, rise of the Himalayas
2. Early humans in South Asia
3. Neolithic: Mehrgarh and early farming
4. Indus Valley Civilization
5. Vedic period
6. Mahajanapadas, Buddha, Mahavira
7. Maurya Empire
8. Post-Mauryan: Shunga, Satavahana, Indo-Greek, Kushan, Tamil Sangam kingdoms
9. Gupta and contemporaries
10. Early medieval: Harsha, Pala, Rashtrakuta, Pratihara, Chalukya, Pallava
11. Chola Empire and Indian Ocean networks
12. Delhi Sultanate; Vijayanagara and Bahmani
13. Mughal Empire
14. Marathas, Sikhs, regional powers
15. European arrival; East India Company rule
16. 1857 and the British Raj
17. Independence movement
18. Partition and independence
19. Republic of India, 1950 to today

### 12.2 Regions
Each era must cover, where relevant, the North, the Northwest, the Gangetic plains, the East, the **Northeast**, Central India, the Deccan, the **South**, the West coast, the Himalaya, and the Andaman, Nicobar and Lakshadweep islands. Do not let the Gangetic North stand in for all of India.

### 12.3 Required depth
- **Coverage matrix:** every one of the 19 eras × 15 lenses must have curated, sourced content, or an honest statement of why evidence is lacking. Minimum **300 curated cells**.
- At least **1,000 curated, sourced India events** and **200 biographies** including women, scientists, artists, reformers, Dalit and Adivasi figures, and ordinary lives where recorded.
- Regional depth: each of today's states and union territories has its own history view.
- Include examples such as: Harappan drainage and seals; Ashoka's edicts; Nalanda; Aryabhata and zero; Ayurveda; temple architecture; Chola bronzes and naval power; Wootz steel; Indian textiles and global trade; Kolar and Golconda mining; the Mughal economy; drain of wealth; famines under British rule; the railways; caste and anti-caste movements; Ambedkar, Phule, Gandhi, Bose; Partition's human cost; the Green Revolution; ISRO; the 1991 reforms; cinema, music and cricket.

---

## 13. Required 3D scenes

Beyond the globe, the slice must contain at least **20** explorable 3D models or scenes. The user can rotate them and click labeled parts that explain what they're seeing. Examples: Lucy's skeleton; a hand axe; a Harappan street and drain; the Great Stupa at Sanchi; a Chola bronze casting process; the Iron Pillar of Delhi; a Mughal observatory; a Spinning Jenny; a steam engine that animates; a Spitfire or T-34 cutaway; a coal mine cross-section; an Enigma machine; the Saturn V; a Chandrayaan lander. Models may be built in code or taken from openly licensed sources. Quality must be high. A crude model is worse than none: replace it with something better.

---

## 14. Visual design and motion

The site must look like it was made by the best studio in the world.

- A single strong, distinctive visual identity. Avoid generic "AI purple gradient" or default component-library looks.
- Story mode draws on editorial explainer language: archival photo cut-outs, bold type, animated maps and diagrams, layered collage, strong color coding.
- Defined type system, color system, spacing and motion rules, documented in `DESIGN.md`.
- Motion has purpose, with consistent timing and easing throughout. No jank.
- Era-specific mood: the look subtly shifts between deep time, antiquity, industrial and modern periods.
- Excellent legibility of text and labels over the globe at all zooms.
- Careful handling of loading: skeletons or graceful fades, never a blank screen or layout jump.
- Empty, error and offline states are designed.
- At no zoom or time should the screen look unfinished.

---

## 15. Engineering and performance

- Deployable as a **static site** from `site/`: no server code, no paid services, no API keys.
- First meaningful view in under 3 seconds on a good connection. Initial download under 5 MB. Everything else streams.
- Desktop: 60 fps target on a recent laptop.
- **Phone is a first-class target:** automatic quality scaling, touch controls and a fully usable mobile layout. If WebGL is unavailable, show a graceful fallback rather than a broken page.
- Deployed data is tiled by space and time and cached. Total `site/` under **5 GB**, no single file above 25 MB.
- Keyboard accessible, reasonable screen-reader support for text panels, reduced-motion mode, adequate contrast.
- No analytics, trackers, or third-party calls that collect user data. Location only with explicit permission.
- Open-source readiness: no secrets or absolute local paths anywhere. `README.md` explains how to run and rebuild. Code under MIT. Data keeps its own licenses in `LICENSES.md`, and GPL or CC BY-SA data is kept separable with correct attribution visible on the site.

---

## 16. Shareable links

Every state has its own URL, which restores it exactly:

`/?y=<year>&lat=<deg>&lon=<deg>&alt=<km>&lens=<id>&story=<id>&step=<n>&event=<id>`

`y` is a signed decimal year where negative values are BCE and deep time, e.g. `y=-66000000` or `y=1943.5`. Each shared link shows a correct title and preview. A one-click share image is generated in the browser.

---

## 17. Capture contract (required exactly)

External tools will record the site without knowing your code. Implement this exactly:

- `site/index.html` runs when served by a plain static server.
- `?capture=1` hides intro, hints and share prompts, disables autoplay effects that are non-deterministic and keeps the interface clean.
- `window.__earthCapture` must expose:
  - `goto({ y, lat, lon, altKm, lens, story, step }) → Promise` resolving only when that view is fully loaded and rendered.
  - `setClock(ms)`: sets the ambient animation clock so that rendering is deterministic.
  - `renderFrame() → Promise`: renders exactly one frame.
  - `status() → { ready, year, lat, lon, altKm, lens, story, step, errors: [] }`
- These views must always work, from the first working build onwards:
  1. `y=-13800000000` (Big Bang)
  2. `y=-4500000000` (molten Earth)
  3. `y=-250000000` (Pangaea)
  4. `y=-66000000` (Chicxulub)
  5. `y=-20000` (ice age)
  6. `y=-2500, lat=27.3, lon=68.1, alt=500` (Indus)
  7. `y=1347, lat=45, lon=30, alt=6000` (Black Death)
  8. `y=1942.8, lat=48.7, lon=44.5, alt=2500` (Stalingrad)
  9. `y=2026, lat=20, lon=78, alt=12000` (today, India)

---

## 18. Acceptance tests: the definition of done

Automated tests in `tests/` must verify as many of these as possible. Run them in a real browser. Everything must pass before you stop.

**Timeline and globe**
1. Any year from 3000 BCE to today can be reached and shows matching content.
2. Time never changes unless the user moves it, verified over 60 seconds idle.
3. Rotating or zooming never changes the time. Changing time never moves the camera.
4. Continents visibly change from 1 Gya to today and end at real coastlines.
5. Ice sheets and sea levels change across the ice ages.
6. Borders change year by year in recorded history.
7. Timeline scrubbing is smooth, with no blocking load.

**Exploration**

8. Clicking any of 200 randomly sampled pins opens a correct, complete deep view.
9. Zooming to any of 100 random land points at 20 random times yields real content or an honest "thin record" statement.
10. All 15 lenses visibly change the view.
11. Search finds events, people, places and dates.
12. "What stood right here?", "This day", "Surprise me", "Meanwhile" and Trails all work.

**Content**

13. Coverage audit prints the global event count ≥ 25,000, per-country counts, India matrix fill ≥ 300 cells, India events ≥ 1,000, biographies ≥ 200, stories, trails and 3D scene counts, all meeting targets.
14. 100% of curated records have at least one source with a valid URL. Check that a random 300 of those links resolve.
15. **Fact audit:** draw a random sample of 200 curated claims, re-retrieve the cited source and confirm the source supports the claim. Fix every failure, then audit a new sample. Save results to `tests/fact-audit.md`.
16. No placeholder text anywhere: scan for lorem, TODO, TBD, "coming soon", and empty fields.
17. Kid mode exists for all curated content.

**Stories**

18. Both flagship stories have 40+ scenes and work forwards, backwards and when stopped midway to explore.
19. All 12 shorter stories play through.
20. Multi-country events draw across the globe and show region-specific views.

**Quality**

21. Screenshot review: capture at least 100 varied views, examine each and fix anything ugly, illegible or unfinished. Save contact sheets to `tests/screenshots/`.
22. Desktop frame rate is logged, targeting 60 fps.
23. Mobile emulation at 390×844 is fully usable, and quality scaling triggers.
24. No uncaught console errors across a scripted 10-minute random exploration.
25. All 9 capture views in section 17 work through `window.__earthCapture`.
26. All shareable links restore state exactly.
27. Deployed size and file limits in section 15 are met. No secrets or absolute local paths.

---

## 19. The standard

Do not stop when it works. Stop when a stranger would open it, gasp, lose an hour, send it to a friend, and trust what they read. Every part you consider finished, look at it again and ask whether the best team in the world would ship it. If not, keep going.

Keep working end to end until every acceptance test passes.
