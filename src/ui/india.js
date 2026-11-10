// India in depth: the era by lens matrix, the events, the biographies and the state views.
import { fetchJSON } from '../data/net.js';

export async function init(app, { Sheet }) {
  const index = app.manifest.india ? await fetchJSON('data/curated/india/index.json').catch(() => null) : null;
  if (!index) return;
  const { initIndia } = await import('./india-view.js');
  await initIndia(app, index, { Sheet });
}
