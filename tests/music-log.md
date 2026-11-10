# Music check

Run on 2026-11-10 by `node tests/music.mjs` in headless Chromium. The test listens to the page's own output through
an analyser on the master bus; nobody listened with ears (see FINAL.md).

| Check | Result | What was measured |
|---|---|---|
| On by default; silent until an interaction; starts at the first click, tap or key press | pass | under the ordinary rule: silent at load, a wheel or scroll alone is refused and the control then reads "Click for music" (phone: "Tap for music"), the first click, key press or tap starts it; level 0.044 mean, 0.15 peak; opens in the "cosmos" mood. Where the browser allows it, a first wheel alone: playing |
| A mood for each stretch of time, joined by crossfades that never cut and never jump | pass | modern, industrial, ancient, deep, cosmos; across six changes the quietest tenth of a second was 0.0110 and the loudest peak 0.14; spectral centre by mood (Hz): industrial 277, ancient 408, deep 363, cosmos 235, modern 221 |
| Every mood can be heard on a small speaker, none is loud, and the moods are level with one another | pass | cosmos: level 0.031 mean and 0.11 peak, 37% below 150 Hz; deep: level 0.026 mean and 0.11 peak, 6% below 150 Hz; ancient: level 0.024 mean and 0.11 peak, 19% below 150 Hz; industrial: level 0.029 mean and 0.13 peak, 29% below 150 Hz; modern: level 0.031 mean and 0.12 peak, 23% below 150 Hz |
| The music steps down under story text and comes back after | pass | mean level 0.0317 outside, 0.0140 under story text (bus 0.62 to 0.31); with a record open the level is 0.78 |
| One control turns it off and on, and the choice is remembered | pass | off: silent, context at rest, remembered across a reload and not restarted by clicks or keys; on again from the control; works from the keyboard |
| In capture mode there is no audio at all | pass | clicks, keys, a wheel and the control itself leave no audio context; the control shows "Music off" |
| The control is on screen and uncovered in every mode, on desktop and phone | pass | desktop opening 1331,12 93x34; desktop main view 1331,864 93x28; desktop record open 1331,864 93x28; desktop sheet open 1331,864 93x28; desktop story 1331,864 93x28; desktop trail 1331,864 93x28; desktop 3D viewer 1331,864 93x28; phone opening 288,8 94x36; phone main view 288,802 94x36; phone record open 288,802 94x36; phone sheet open 288,802 94x36; phone story 288,802 94x36; phone trail 346,802 36x36; phone 3D viewer 346,802 36x36; phone menu open 346,802 36x36 |
| Nothing is downloaded to make the music, and no error is logged | pass | 448 distinct requests across the runs above: no audio file, none to another origin; no audio file in site/; no console or page error |

- Without the shim, in this script-driven browser, a first wheel alone left the music "playing".
