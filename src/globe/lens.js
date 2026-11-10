// The six deep-time lenses and what each one does to the globe.
// The human lenses filter and recolour pins; before people there are few pins to filter, so here the planet itself
// changes: plates get their own colours, temperature is drawn by latitude, the sea comes forward, and so on.
import { state } from '../core/store.js';

export const DEEP_LENSES = ['geology', 'climate', 'life', 'extinctions', 'oceans', 'cosmos'];

/** 1..6 for the deep-time lens in use, 0 for none. */
export function deepLens() {
  return DEEP_LENSES.indexOf(state.lens) + 1;
}

// How much cloud each lens leaves over the map it draws (index 0 is "no deep lens").
export const CLOUD_UNDER_LENS = [1, 0.12, 0.3, 0.55, 0.55, 0.22, 0.5];

// The five great mass extinctions, each dated by the era record that cites it (see content/eras/03-life.txt:
// the Ordovician, Devonian, Great Dying, Triassic and Chicxulub records and their sources).
export const MASS_EXTINCTIONS = [
  { era: 'ordovician', ma: 445, name: 'the Late Ordovician mass extinction', kid: 'the first great die-off, in the Ordovician seas' },
  { era: 'devonian', ma: 372, name: 'the Late Devonian mass extinction', kid: 'the great die-off of the Devonian seas' },
  { era: 'great-dying', ma: 251.9, name: 'the Permian–Triassic extinction, the Great Dying', kid: 'the Great Dying, the worst die-off of all' },
  { era: 'triassic', ma: 201.4, name: 'the mass extinction that closed the Triassic', kid: 'the die-off at the end of the Triassic' },
  { era: 'chicxulub', ma: 66, name: 'the extinction that followed the Chicxulub impact', kid: 'the asteroid strike that ended the age of the dinosaurs' },
];

/** 0..1: how close `ma` is to a mass extinction (1 at the event, 0 from five million years away). */
export function crisisAt(ma) {
  let c = 0;
  for (const x of MASS_EXTINCTIONS) c = Math.max(c, 1 - Math.abs(ma - x.ma) / 5);
  return Math.max(0, c);
}

// Zonal mean temperature by time and latitude: the same raster the shaders read (data/earth/zonal_temp.png,
// from Scotese 2022). x: 0 to 540 Ma in 109 columns; y: north at the top; value = (T + 60) / 100.
let zonal = null;
let zonalLoading = null;
export function loadZonal() {
  if (zonal || zonalLoading) return zonalLoading;
  zonalLoading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      zonal = { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
      resolve(zonal);
    };
    img.onerror = () => resolve(null);
    img.src = 'data/earth/zonal_temp.png';
  });
  return zonalLoading;
}
/** Mean annual temperature (°C) at `lat` and `ma` in the zonal model, or null if not loaded or out of range. */
export function zonalTempAt(ma, lat) {
  if (!zonal || ma < 0 || ma > 540) return null;
  const x = Math.min(zonal.w - 1, Math.max(0, Math.round((ma / 5 + 0.5) / 109 * zonal.w - 0.5)));
  const y = Math.min(zonal.h - 1, Math.max(0, Math.round((0.5 - lat / 180) * zonal.h - 0.5)));
  return (zonal.data[(y * zonal.w + x) * 4] / 255) * 100 - 60;
}
