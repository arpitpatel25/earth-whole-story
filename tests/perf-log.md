# Performance log

Run on 2026-11-10 by `node tests/perf.mjs` in headless Chromium (darwin, GPU through ANGLE), served from a local static server.

## First view (cold load of the front page)

| Viewport | First frame | Downloaded before the first frame | Downloaded once the opening has fully loaded | Requests to other origins |
|---|---|---|---|---|
| desktop (1440x900) | 221 ms | 1337 KB, 23 requests | 2927 KB, 45 requests | 0 |
| phone (390x844) | 108 ms | 1337 KB, 23 requests | 2927 KB, 45 requests | 0 |

Limits: first meaningful view under 3 s, initial download under 5 MB. The local server does not compress, so a real host will send less.

## Frame rate (desktop, 1440x900, while the globe turns)

| View | Frames per second | Slowest frame | Quality tier |
|---|---|---|---|
| Today, whole Earth | 60.1 | 17 ms | high |
| Today, India close up | 60.0 | 33 ms | high |
| 1943, Europe, pins and borders | 60.2 | 17 ms | high |
| 1347, the Black Death | 60.2 | 17 ms | high |
| 2500 BCE, the Indus | 56.9 | 33 ms | high |
| 20,000 years ago, ice sheets | 60.2 | 17 ms | high |
| 66 million years ago, moving plates | 60.1 | 17 ms | high |
| 250 million years ago, Pangaea | 60.2 | 17 ms | high |
| 4.5 billion years ago, molten Earth | 60.2 | 17 ms | high |
| The Big Bang | 60.2 | 17 ms | high |

Median 60.2 fps; slowest view 56.9 fps. The target is 60.
