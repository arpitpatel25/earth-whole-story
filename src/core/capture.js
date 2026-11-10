// The capture contract (spec section 17). External tools drive the site through
// window.__earthCapture without knowing anything about the code.
import { state, setTime, setPlace, setUI } from './store.js';

export function installCapture(app) {
  const { engine } = app;
  const errors = engine.errors;
  addEventListener('error', (e) => engine.reportError(e.message || 'error'));
  addEventListener('unhandledrejection', (e) => engine.reportError(`unhandled: ${(e.reason && e.reason.message) || e.reason}`));

  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  /** Wait until every tracked load for the current view has finished and the result is on screen. */
  async function settle() {
    for (let i = 0; i < 12; i++) {
      engine.renderOnce(); // lets layers discover what the view needs and request it
      if (app.beforeSettle) await app.beforeSettle();
      if (engine.pending === 0) {
        await nextFrame();
        engine.renderOnce();
        if (engine.pending === 0) break;
      }
      await engine.whenIdle();
    }
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    engine.renderOnce();
    await nextFrame();
    engine.renderOnce();
    if (app.syncOverlays) app.syncOverlays();
  }

  const api = {
    /** Move to a view and resolve only when it is fully loaded and rendered. */
    async goto(view = {}) {
      await app.ready;
      const { y, lat, lon, lens, story, step, event } = view;
      const altKm = view.altKm ?? view.alt;
      if (app.controls) app.controls.cancelFly();
      const ui = {};
      if (lens !== undefined) ui.lens = lens || 'all';
      if (story !== undefined || view.y !== undefined || view.lat !== undefined) ui.story = story || null;
      if (step !== undefined) ui.step = step || 0;
      if (event !== undefined || view.y !== undefined) ui.event = event || null;
      // The lens is applied after the time: the set of lenses depends on the date (deep time has its own six), so a
      // lens asked for together with a jump across that line would otherwise be dropped as not existing yet.
      const lensUI = ui.lens;
      delete ui.lens;
      // A story step sets its own time and place; explicit values in the call still win.
      setUI(ui, 'capture');
      if (app.applyStoryStep && ui.story) await app.applyStoryStep(ui.story, ui.step || 0);
      if (view.trail !== undefined || view.y !== undefined || view.lat !== undefined) {
        if (view.trail && app.openTrailStop) await app.openTrailStop(view.trail, view.stop || 0);
        else if (state.trail && app.trails) app.trails.close();
      }
      if (y !== undefined) {
        if (app.timeline) app.timeline.tween = null;
        setTime(Number(y), 'capture');
      }
      if (lensUI !== undefined) setUI({ lens: lensUI }, 'capture');
      setPlace({ lat, lon, altKm }, 'capture');
      if (app.afterGoto) await app.afterGoto(view);
      await settle();
      return api.status();
    },
    /** Set the ambient animation clock (milliseconds). Freezes it so rendering is deterministic. */
    setClock(ms) {
      engine.clockFrozen = true;
      engine.clock = Number(ms) / 1000 || 0;
      engine.invalidate();
    },
    /** Render exactly one frame. */
    async renderFrame() {
      engine.renderOnce();
      if (app.syncOverlays) app.syncOverlays();
    },
    status() {
      return {
        ready: app.isReady && engine.pending === 0,
        year: state.y,
        lat: state.lat,
        lon: state.lon,
        altKm: state.altKm,
        lens: state.lens,
        story: state.story,
        step: state.step,
        event: state.event,
        level: state.level,
        quality: engine.quality,
        fps: Math.round(engine.fps),
        errors: errors.slice(),
      };
    },
  };
  window.__earthCapture = api;
  return api;
}
