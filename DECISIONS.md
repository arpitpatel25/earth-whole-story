# Decisions

Choices made where the spec left room. Newest at the bottom.

## Working arrangement

- **No subagents.** The spec allows delegation, but the standing user instruction requires approval
  before spawning any, and nobody is available to approve. All work is done in one session.
- **Everything stays in this folder.** npm, Playwright and Python caches are redirected into
  `.cache/` by `env.sh`. Nothing outside the folder is read or written.
- **The parent repository's agent instructions** (a social-media reply routine) are not followed here.
  They describe a different job, need a logged-in browser and files outside this folder, and the spec
  forbids both.

## Time

- `y` is a signed decimal year. `y >= 1` is CE. `y <= 0` is shown as `|y|` BCE (so `y=-2500` reads
  "2500 BCE"); the one-year offset of astronomical year numbering is ignored, which only matters at the
  BCE/CE boundary.
- The timeline starts at `y = -13,800,000,000` as the spec requires. Text gives the measured age
  (13.787 ± 0.020 billion years, Planck 2018) wherever precision matters.
- The scale is a designed piecewise mapping, not a pure logarithm, so that recorded history gets
  about half of the bar. Inside the first segment the scale is logarithmic in the age of the universe,
  so the first second, the first atoms and the first stars are all reachable.
- "Historical time never advances by itself": a drag fling has no time inertia. The clock only
  changes during user input, a story scroll, or a link the user opened.

## Globe

- **Rigid plates rotated live**, not pre-rendered frames. Plate polygons from Merdith et al. 2021 are
  meshed once at present-day coordinates; the vertex shader applies each plate's finite rotation for
  the current time (sampled every 1 Myr, slerped). Motion is continuous and ends in exactly today's
  coastlines because the rotation at 0 Ma is the identity.
- **Before 1 Gya** no global plate model exists. Continents shown there are generated shapes and the
  interface says so ("illustrative, not a reconstruction").
- **Land colour in deep time** is a climate sketch driven by paleolatitude and a retrieved global
  temperature history; it is labelled as an artist's reconstruction.
- **Ice ages**: ice extent comes from Batchelor et al. 2019 (18 Northern Hemisphere time slices) and
  sea level from Spratt & Lisiecki 2016 applied to ETOPO1 bathymetry, so land bridges appear where the
  real seabed is shallow.
- **Sun**: lit from a camera-relative direction so the side the user looks at is always readable; a
  soft terminator remains at the limb.

## Content

- **Curated vs automated.** Curated records (stories, trails, India, eras, 3D scenes) are written by
  hand from retrieved sources and all have Kid text. Automated records (global event layer, country
  baselines) come straight from Wikidata, NOAA and Wikipedia and say so in the interface.
- **"This led to…"** For curated events, links are authored or come from the source article linking the
  later event. For automated events, each link is tagged with its basis (sourced consequence, next in
  the same war, next in this place) so sequence is never passed off as cause.
- **India matrix has 22 eras**, not 19: three of the spec's eras are split (Delhi Sultanate /
  Vijayanagara and Bahmani; northern post-Mauryan / Satavahana and Sangam south; Republic before and
  after 1991). 19 × 15 is only 285 cells and the spec asks for 300 curated cells; the split also keeps
  the Deccan and the South from being folded into northern eras.
- **Share previews.** A static site cannot vary Open Graph tags by query string. Every story, trail and
  curated event therefore also gets a tiny static page under `site/s/` with its own title, description
  and preview image that forwards to the exact state URL. The live page always sets `document.title`.
- **Region views.** Six events that belong to no single country (the Second World War, the Black Death, the
  Atlantic slave trade, the Columbian exchange, the Cold War, Partition) are first-class records with 33 region
  views between them. Each view is pinned in its region for the years the event touched it, the "here, then"
  panel shows it without a click ("The Second World War, from here"), and the full record draws rings and arcs
  across the globe. The texts reuse the sources already retrieved for the stories.
- **Events with no single place are not pinned.** 36 India events and 102 biographies have no place in their
  source. They are listed, searchable and openable, but they have no pin: a pin would claim a location the
  source does not give. The same rule covers the national events (elections, referendums, coups) added to thin
  country timelines.
- **Country baselines.** Every one of Natural Earth's 258 countries and territories has a timeline of the dated
  events inside its present border (matched against the 1:10m outlines so that microstates are found), the
  polities the historical maps draw over it, and its population through time. Where fewer than 30 located events
  exist, national events from Wikidata are added. 45 entries still have fewer than 30 (five of them UN member
  states: Brunei, Eswatini, Lesotho, the Marshall Islands and Tuvalu); each says so in plain words.
- **3D scenes are built in code.** 23 scenes, each from primitives and the dimensions its sources give. No scanned
  or downloaded models are used, so every scene is MIT-licensed and small. Each scene states what is approximate.
  Lucy's skeleton shows as solid only the body parts the cited article names as found; the rest is ghosted and
  the scene says it does not map them bone by bone.
- **The life layer is a sample.** 4,810 fossil occurrences from the Paleobiology Database across fourteen groups,
  thinned to one find per genus per six-degree cell. Each is carried back on its plate to where that ground lay.
- **Wikipedia lead sentences** were fetched for 49,793 of the 59,787 automatic records that have an article. The
  fetch job was stopped by a two-hour limit and was not restarted; the remaining records show their Wikidata
  description and source links instead.
- **Dates.** One function converts calendar dates to decimal years in both the pipeline and the browser, so a day
  never shifts. The year N BCE spans [-N, -N+1). Events dated only to a year sit at mid-year. The clock never
  shows more precision than the record has.
- **Limits of the border data.** historical-basemaps is a set of world snapshots; between snapshots the map
  blends and the names come from the earlier snapshot. CShapes 2.0 dates changes to the day from 1886, but it
  follows the Gleditsch and Ward list of states: Austria, for instance, stays on the map through 1938 to 1945,
  and colonies carry the name of the later state ("India" before 1947, "Namibia" before 1990).
- **Modern city names are shown at all dates** on the label layer (Natural Earth names), while events and curated
  text use the name the source uses. A table of historical city names was planned and not built.
- **The share image and preview pages** use relative `og:image` paths because the address the site will be
  served from is not known at build time. A host that needs absolute URLs can rewrite them at deploy.

## Birds are left out of the "dinosaur" fossil group

The Paleobiology Database files birds under Dinosauria, and its `^Aves` exclusion still returns landfowl (classed there
under Reptilia), so the first build showed pins such as "Gallus, fossil find, dinosaur" in the Ice Age. That is correct
cladistics and a confusing label. In the dinosaur group the pipeline now keeps only occurrences from rock older than
66 million years, the end of the Cretaceous; every younger record in that group is a bird. Fossil finds are also shown
only in deep time (before 11,000 BCE), never among the events of a historical year.

## "Around now" is capped in deep time

The list of nearby events and the pins use a time window that grows with the width of the timeline on screen. Far
back, that window grew wider than the distance to the present, and the Black Death could be listed "around now" at
15 million years ago. The window is now never wider than a fifth of the distance from the clock to today (with a floor
of 40 years), and within the window things closer in time rank higher.

## Deep-time lenses change the planet, not just the pins

A human lens filters and recolours pins. Before people there are few pins to filter, and the first version of the six
deep-time lenses changed almost nothing on screen (the acceptance test caught it once the time window was capped).
Each now redraws the globe from data the site already holds and says in the panel what it is showing:
Geology colours every plate of the Merdith model and gives the speed and heading of the ground under the crosshair;
Climate draws the Scotese zonal temperature by latitude with its value at that latitude; Life enlarges the fossil
finds; Extinctions drains the colour, reddens near one of the five mass extinctions dated in the era records and
names the last and the next; Oceans puts the land in silhouette and gives the share of today's surface that had not
yet formed; Cosmos dims the planet, turns up the sky and offers the Solar System. The sky in deep time is an
illustration and the panel says so.

## Music is on by default (owner's review; replaces "muted until the user opts in")

SPEC section 4.8 asks for sound that is muted until the user opts in. After the first complete build the owner
reviewed it and changed that: music must be on by default. This is what was built, and where the brief meets a limit.

- **On by default, off in one press, remembered.** The choice is kept in this browser's local storage under
  `earth.music` (`on` or `off`). Nothing about it leaves the browser.
- **It starts at the first interaction the browser accepts.** No browser lets a page make sound before the visitor
  has acted, and none of today's browsers counts a wheel or a scroll as that act: only a click, a tap or a key press
  unlocks audio. The site therefore tries at every first interaction, including a wheel and a scroll, and starts
  wherever the browser allows it. Where a wheel or scroll comes first and is refused, the music control turns yellow
  and reads "Click for music" ("Tap for music" on a touch screen), and the next click, tap or key press anywhere
  starts it. This is the one place where the owner's brief ("starts at the very first scroll or wheel") cannot be met
  in full by any page; the opening of the site is scroll-driven, so on a desktop a visitor who only turns the wheel
  hears nothing until they click or press a key. On a touch screen the first drag of the globe or tap starts it.
- **Original and generated.** Every sound is synthesised in the browser with Web Audio: oscillators, generated noise
  and a generated reverb impulse. No audio file exists in the site and none is downloaded (`tests/music.mjs` checks).
  The scores are small rule-based generators written for this project; the chord sequences they use are common
  property (for instance i-VI-III-VII and I-V-vi-IV).
- **Five moods by date,** as the owner listed them: cosmos (before 4.0 billion years ago), deep time and oceans (to
  7 million years ago), ancient (to 1760), industrial (1760 to 1945), modern (after 1945). The opening therefore
  runs from the cosmos mood into the ocean mood as the first seas form.
- **Crossfades.** Two scores overlap for about five seconds. Neighbouring moods are in keys that share most of their
  notes, so the overlap is consonant. A change of mood waits 0.7 seconds for the clock to settle, so scrubbing across
  several eras does not start several scores.
- **Never loud.** The level was set by measuring the page's own output: about -31 dBFS mean, peaks around -17, behind
  a limiter. The music drops to half under a story's text and to about three quarters when a record is open.
- **Audible on small speakers.** The first version put 58 to 90 percent of its energy below 150 Hz, which a phone
  or laptop speaker barely reproduces; it would have sounded close to silent there. The registers were moved up and
  rebalanced by measurement (now 6 to 37 percent below 150 Hz), and the moods were levelled against one another.
- **One always-visible control.** It is a fixed button above everything else: top right in the opening, and at the
  right end of the timeline's bottom row in the main view, in stories, over panels and sheets, and in the 3D viewer.
  The earlier sound button in the tools row is gone (on a phone it was folded into a menu, and it was hidden in
  stories and in the opening).
- **Capture mode stays silent.** With `?capture=1` no audio context is ever created, whatever is stored, and the
  control shows "Music off" and does nothing.
- **A hidden tab falls silent.** The audio context is suspended while the page is hidden and resumed on return.
- **Not verified by ear.** The checks measure the page's output (level, spectrum, overlap during changes). Nobody
  has listened to it. Whether it is pleasant is a judgement the tests cannot make; the control is one press away.
