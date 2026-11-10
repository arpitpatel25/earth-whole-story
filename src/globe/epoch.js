// What the planet looks like at year `y`: one function turns the clock into the numbers the shaders
// need. Dates and curves come from `site/data/earth/model.json`, which the pipeline builds from
// retrieved sources (see LICENSES.md); the fallbacks below only keep the globe drawable while that
// file is still loading.
import { NOW, BIG_BANG } from '../core/time.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Piecewise-linear lookup in a table of [x, v] rows sorted by x. */
export function sample(table, x) {
  if (!table || !table.length) return 0;
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  let lo = 0;
  let hi = table.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, v0] = table[lo];
  const [x1, v1] = table[hi];
  return lerp(v0, v1, (x - x0) / (x1 - x0 || 1));
}

export const model = {
  // [ka, metres relative to today], older first is not required; sorted ascending by ka.
  seaLevel: [[0, 0]],
  // Ice-sheet rasters: { images, slices: [{ id, image, channel, name, window }] }
  ice: null,
  // Global mean surface temperature through the Phanerozoic: [Ma, degC].
  warmth: [[0, 14], [540, 22]],
  // Global glaciations [startMa, endMa, strength].
  snowball: [],
  loaded: false,
};

export function setModel(data) {
  Object.assign(model, data, { loaded: true });
  prepareIce();
}

// ---- ice sheets --------------------------------------------------------------------------------
// The reconstructions are snapshots of particular glacial stages. Between and within them the globe
// follows global ice volume (the sea-level curve): each snapshot is given the sea level of its own
// moment, and at any time the two snapshots that bracket the current sea level are blended. During a
// stage that has its own reconstruction, that stage's extent is the largest the ice can reach.
const WARM = new Set(['mis5a', 'mis5c']);
const LAST_CYCLE = ['lgm', '30ka', '35ka', '40ka', '45ka', 'mis4', 'mis5a', 'mis5b', 'mis5c', 'mis5d'];
let icePools = null;

function prepareIce() {
  icePools = null;
  const ice = model.ice;
  if (!ice || !ice.slices) return;
  const byId = new Map(ice.slices.map((s, i) => [s.id, { ...s, index: i }]));
  for (const s of byId.values()) {
    if (!s.window) {
      s.size = 0;
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = s.window[0]; k <= s.window[1]; k += Math.max(0.5, (s.window[1] - s.window[0]) / 60)) {
      const v = sample(model.seaLevel, k);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    s.size = WARM.has(s.id) ? hi : lo;
  }
  const present = byId.get('present');
  const generic = LAST_CYCLE.map((id) => byId.get(id)).filter(Boolean);
  const sortPool = (list) => [present, ...list].filter(Boolean).sort((p, q) => q.size - p.size);
  const stages = [...byId.values()].filter((s) => s.window && !LAST_CYCLE.includes(s.id)).sort((p, q) => p.window[0] - q.window[0]);
  icePools = {
    last: sortPool(generic),
    stages: stages.map((st) => ({
      stage: st,
      // smaller extents borrowed from the last cycle, capped by this stage's own maximum
      pool: sortPool([...generic.filter((g) => g.id !== 'lgm' && g.size > st.size + 4), st]),
    })),
  };
}

function iceState(ka, sea) {
  if (!icePools) return { a: 0, b: 0, mix: 0, note: '' };
  let pool = icePools.last;
  let note = '';
  if (ka > 130) {
    let best = null;
    let bestD = Infinity;
    for (const st of icePools.stages) {
      const [w0, w1] = st.stage.window;
      const d = ka < w0 ? w0 - ka : ka > w1 ? ka - w1 : 0;
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
    if (best) {
      pool = best.pool;
      if (bestD > 0) note = 'analog';
    }
  }
  const s = Math.min(0, Math.max(pool[pool.length - 1].size, sea));
  for (let i = 0; i < pool.length - 1; i++) {
    const p = pool[i];
    const q = pool[i + 1];
    if (s <= p.size && s >= q.size) {
      return { a: p.index, b: q.index, mix: (p.size - s) / (p.size - q.size || 1), note };
    }
  }
  return { a: pool[0].index, b: pool[0].index, mix: 0, note };
}

function snowballAmount(ma) {
  let s = 0;
  for (const [a, b, strength = 1] of model.snowball) {
    const w = Math.max(0.5, (a - b) * 0.06);
    s = Math.max(s, strength * smooth(a + w, a - w, ma) * (1 - smooth(b + w, b - w, ma)));
  }
  return s;
}

/**
 * Environment at year y.
 * All "w*" values are layer weights in 0..1; the renderer crossfades layers so nothing pops.
 */
export function environment(y) {
  const ma = (NOW - y) / 1e6;
  const ka = (NOW - y) / 1e3;
  const env = {};

  // --- which worlds are visible ---------------------------------------------------------------
  env.cosmos = 1 - smooth(-4.6e9, -4.53e9, y); // universe and solar nebula before Earth
  env.earth = smooth(-4.58e9, -4.53e9, y); // the planet itself fades in from the disc
  env.molten = 1 - smooth(-4.5e9, -4.3e9, y); // magma ocean
  env.crust = smooth(-4.52e9, -4.35e9, y); // dark crust forming over the melt
  env.water = smooth(-4.4e9, -4.15e9, y); // first oceans
  env.bombard = smooth(-4.56e9, -4.5e9, y) * (1 - smooth(-3.9e9, -3.5e9, y)); // impact flashes
  env.plates = smooth(-1.04e9, -1.0e9, y); // real plate model takes over from the sketch
  env.modern = smooth(-5.0e6, -2.6e6, y); // satellite Earth with ice and sea level
  // Sketch continents (before the plate model): share of the surface that is land.
  env.preLand = lerp(0.03, 0.28, smooth(-4.2e9, -1.2e9, y)) * (1 - env.plates);
  env.preDrift = (y + 4.6e9) / 1.3e9; // slow evolution of the sketch as time passes

  // --- air and sea -----------------------------------------------------------------------------
  // Oxygen: two steps (Great Oxidation, then the Neoproterozoic rise).
  env.o2 = 0.55 * smooth(-2.45e9, -2.2e9, y) + 0.45 * smooth(-0.85e9, -0.45e9, y);
  env.rust = smooth(-2.45e9, -2.0e9, y);
  env.snowball = y < -5e8 ? snowballAmount(ma) : 0;
  env.veg = smooth(-470e6, -360e6, y);
  env.tempC = sample(model.warmth, Math.min(540, Math.max(0, ma)));
  // Column of the zonal temperature texture (109 columns, one per 5 Myr, 0 to 540 Ma).
  env.zonalX = (Math.min(540, Math.max(0, ma)) / 5 + 0.5) / 109;

  // --- Quaternary: sea level and ice ------------------------------------------------------------
  env.sea = env.modern > 0 ? sample(model.seaLevel, ka) : 0;
  const ice = iceState(ka, env.sea);
  env.iceA = ice.a;
  env.iceB = ice.b;
  env.iceMix = ice.mix;
  env.iceNote = ice.note;
  env.glacial = Math.min(1.1, Math.max(0, -env.sea / 125)); // 0 interglacial .. 1 glacial maximum
  // African Humid Period ("Green Sahara"), roughly 11,000 to 5,000 years ago.
  env.sahara = model.sahara ? sample(model.sahara, ka) : 0;

  // --- people ----------------------------------------------------------------------------------
  env.lights = smooth(1880, 2012, y); // satellite-era night lights fade in with electrification
  env.age = y - BIG_BANG;
  env.ma = ma;
  env.ka = ka;
  return env;
}

/** Atmosphere colour and strength for the limb glow. */
export function atmosphere(env) {
  // Molten world: a glowing rock-vapour haze. Early Earth: orange methane haze. Later: blue.
  const hot = [1.0, 0.42, 0.16];
  const haze = [0.86, 0.55, 0.3];
  const blue = [0.36, 0.6, 1.0];
  const white = [0.8, 0.88, 1.0];
  let c = haze.map((v, i) => lerp(v, blue[i], env.o2));
  c = c.map((v, i) => lerp(v, hot[i], env.molten * (1 - env.crust * 0.6)));
  c = c.map((v, i) => lerp(v, white[i], env.snowball * 0.6));
  return { color: c, amount: 0.9 * env.earth };
}
