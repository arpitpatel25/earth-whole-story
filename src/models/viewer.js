// Explorable 3D scenes: rotate them, select their labelled parts.
import { fetchJSON } from '../data/net.js';

export async function init(app, { Sheet }) {
  const list = app.manifest.models ? await fetchJSON('data/curated/models.json').catch(() => null) : null;
  if (!list) return;
  app.models = Object.fromEntries(list.map((m) => [m.id, m]));
  const { initModels } = await import('./gallery.js');
  await initModels(app, list, { Sheet });
}
