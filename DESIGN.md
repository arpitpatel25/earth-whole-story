# Design

EARTH: The Whole Story has one subject, the planet, and one instrument, the clock. Everything on screen is either
the globe, the timeline, or a sheet of text laid over them. The identity comes from that restraint: true black
space, deep-sea ink surfaces, chalk type, and a single marker yellow that always means "you are here in time".

## Principles

1. **The globe is the page.** Panels float over it and never box it in. No panel is wider than a column of text.
2. **One accent.** Marker yellow (`--marker`) is reserved for the needle on the timeline, the current selection
   and focus. Nothing decorative is yellow.
3. **Colour is data.** The six bands of the timeline, the fifteen lenses and the six deep-time lenses each own a
   colour. A colour on screen always points back to one of those keys.
4. **Words do the work.** Labels are plain sentences in sentence case. The interface says what will happen
   ("Go to this time", "Show on the globe"), and says so when it does not know ("The record here is thin").
5. **Nothing moves time but the reader.** Ambient motion (clouds, pin pulses, a turning 3D model) is slow and
   quiet. The date never changes on its own.

## Colour

| Token | Value | Use |
|---|---|---|
| `--void` | `#000000` | space, behind the globe |
| `--ink` | `#07111d` | panels and sheets (96% opaque over the globe) |
| `--ink-2` | `#0d1b2b` | inputs, cards |
| `--ink-3` | `#16283b` | hover and pressed surfaces |
| `--chalk` | `#f4f1e8` | text, primary buttons when selected |
| `--silt` | `#aab7c6` | secondary text, captions, source lines |
| `--dim` | `#7d8b9c` | tertiary text, disabled |
| `--marker` | `#ffd23f` | the needle, selection, focus rings |
| `--line` | chalk at 13% | hairlines between sections |

Timeline strata, oldest to newest: Universe `#3a3f8c`, Young Earth `#b5442c`, Life `#2f8f6b`, Humans `#c8862a`,
Civilization `#3f74c9`, Modern world `#e9e4d6`. The band the clock stands in sets `--era`, which tints the top
border of the panels and the era line under the clock: the page takes on the colour of its period without any
change of layout.

Lens colours live in `content/lenses.json`. They are used for pins, for the dot in the lens button, for the
columns of the India matrix and for the top edge of 3D scene cards.

Text contrast: chalk on ink is 16:1, silt on ink 8.5:1, dim on ink 5:1. Marker on ink is 12:1.

## Type

| Role | Face | Notes |
|---|---|---|
| Interface, headings | Archivo (variable, width 62 to 125%) | Headings are set condensed (`font-stretch` 62 to 78%) and heavy (700 to 800). Interface labels use the normal width at 560 to 650. |
| Reading text | Source Serif 4 (variable, optical size) | Leads and body paragraphs, line-height 1.45 to 1.5, `text-wrap: pretty`. |
| Kid mode reading text | Andika | Swapped in through `--read` when the level is Kid: larger apertures, single-storey a and g. Kid text is separately written, not restyled Explorer text. |

Scale (`--fs-0` to `--fs-7`): 12, 13, 15, 17, 21, 28, 40, 64 px. Body text is never smaller than 15 px; captions
and source lines are 12 to 13 px. Lines of reading text stay under about 70 characters: panels are 380 px and
460 px wide for that reason.

All three families are SIL Open Font License and are served from the site itself.

## Space and shape

A 4 px grid (`--s1` 4 to `--s7` 48). Corners are 3 px everywhere except round controls (pins, numbered markers,
filter chips). Panels have no drop shadow on the globe side beyond a single soft one; hierarchy comes from the
ink steps, not from elevation.

Layout: the top bar is 52 px. The "here, then" panel sits top left, the deep view top right, sheets drop from the
top bar, and the timeline owns the bottom edge. The globe is re-centred in whatever space the open panels leave.
Below 900 px the panels become bottom sheets above the timeline; below 700 px the tools fold into one menu.

## Motion

One curve, `cubic-bezier(0.2, 0.7, 0.1, 1)`, at three speeds: 120 ms (hover, press), 240 ms (panels), 480 ms
(camera settles, clock jumps). Flights of the camera ease in and out and rise on long hops so the planet reads as
a globe. Scrubbing the timeline has no easing at all: the planet follows the hand.

`prefers-reduced-motion` removes the flights, the tweened clock jumps, the idle turn of 3D models and the pulse
of pins. `?capture=1` freezes the ambient clock so that a frame is reproducible.

## The parts

**Timeline.** A tape of strata: each named band is a block on its lane, the six great bands run along the top,
and the yellow needle stays fixed in the middle while the tape moves under it. The scale is non-linear (a
designed piecewise mapping: recorded history gets about half the bar). Ticks show where events are dense. The
overview strip under the tape shows all of time with a window for the part in view. The clock above it is the
largest type on the page and reads in plain words: "1347 CE", "66 million years ago".

**"Here, then".** A running answer to "what was happening here, then?". It never needs a click. Its order is fixed:
the place in today's words, who held it at that date, the curated text for the era and lens (or the event that
crossed this region, "from here"), what is recorded nearby, and what was happening elsewhere. If nothing is
recorded it says so, and offers the nearest recorded events.

**Deep view.** One column: when and where, the title, the writing, sources directly under the writing, facts,
people, a chart or 3D scene where there is one, connections, and always last "This led to…". Automatic records
carry a line saying they are automatic.

**Stories.** Editorial explainer language: a column of cards scrolls over the globe, and the scroll is the clock.
Each story has one colour. Fronts, routes and spreads are drawn on the globe in that colour; opposing sides use
red and blue. Pictures are archival, credited under the image.

**The India matrix.** Rows are eras, oldest at the top like strata; columns are lenses in their own colours. A
filled square is written from sources. A hollow square means the record is thin, and the square says so. On a
phone the grid becomes an accordion: one era, its lenses as a list.

**Objects (3D scenes).** A dark studio: the model stands on a disc of light, numbered markers sit on its parts
and the same numbers run down the list beside it. The numbers are the link between the object and its text.
Models are built in code from dimensions in their sources; each says what is approximate.

**Pins.** A glowing dot with a dark rim so that it reads over ice and desert. Curated records have a ring.
Size follows importance; the colour is the lens. Pins fade near the limb of the globe so they do not pile up.

**Labels on the globe.** Chalk type with a dark halo; seas in italic serif; states in small capitals of the
interface face. Labels are culled by zoom so that empires appear first, then cities, then sites.

## States

- **Loading.** The first frame is the universe, drawn by a shader with no data. Everything else streams in
  behind it. Panels show a skeleton of the lines to come and keep their size, so nothing jumps.
- **Empty.** An empty place is a statement, not a blank: "The record here is thin", with what is known and the
  nearest recorded events.
- **Error.** A record that cannot be opened says why and what to do next. A failed data file is reported once
  and the rest of the site keeps working.
- **Offline.** Text explains that details will load when the connection returns. What is already loaded stays.
- **No WebGL.** The timeline is offered as plain text with a note on how to turn the globe on.

## Sound

Music is part of the place, like the light. It is on by default and generated in the browser; no recording is
shipped. It begins at the visitor's first click, tap or key press (a browser allows no sound before that) and arrives
over about three seconds; it never starts at full level.

- **Five moods follow the clock.** Cosmos (before the first oceans): a high slow pad, far bells, a lot of room.
  Deep time and oceans: a swelling pad, surf, water drops, a long gliding call now and then. Ancient (from the first
  people to 1760): a held fifth, a plucked voice that walks a mode and comes to rest, a breath of flute, a hand drum
  far back. Industrial (1760 to 1945): a steady figure in eighth notes over four chords, a piston under it. Modern:
  a brighter pad, a light arpeggio, a short tune every fourth bar.
- **Joins, not cuts.** Neighbouring moods are in keys that share most of their notes (D lydian, A dorian, D dorian,
  D minor, F major). A change of mood is a crossfade of about five seconds between two running scores; pulses leave
  first and join last; scrubbing quickly through several eras changes nothing until the clock settles.
- **Quiet.** Mean level sits near -31 dBFS with peaks under -16, behind a limiter. Under a story's text the music
  drops to half; with a record open, to about three quarters.
- **Small speakers.** The registers were set by measurement so that most of the sound lies above 150 Hz.
- **One control,** always on screen: the top right corner in the opening, the right end of the timeline's bottom row
  everywhere else, above every panel and the 3D viewer. It reads "Music on" or "Music off" (on a phone, a note or a
  crossed note that spells itself out when it changes). If the first interaction was a scroll, which cannot start
  sound, it turns yellow and reads "Click for music". The choice is kept in local storage.
- **Interface sounds** (a tick while scrubbing, a rise when something opens) share the same switch.
- No voices. Nothing plays in capture mode.

## Accessibility

Every control is a real button or input with a visible focus ring in marker yellow. The globe canvas takes the
keys W, A, S, D, plus and minus; the timeline takes the arrow keys and typed dates; the India matrix takes the
arrow keys; 3D scenes take the arrow keys. Panels are labelled regions and announce changes politely. Kid mode
is a reading level, not a theme: it changes the words.
