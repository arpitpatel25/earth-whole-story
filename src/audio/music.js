// Music: original, generated in the browser with Web Audio. No recording is downloaded and none is played.
//
// It is on by default. A browser will not let a page make sound before the visitor has acted, so the music starts at
// the first interaction the browser accepts (a click, a tap or a key press; a wheel or scroll is tried too and is
// refused by today's browsers unless they already trust the site). One control turns it off and back on, and the
// choice is remembered in this browser's local storage. With ?capture=1 nothing is ever played.
//
// Five moods follow the clock: cosmos, deep time and oceans, ancient, industrial, modern. Each is a small generative
// score (a pad, a few sparse voices, a bed of noise, sometimes a pulse). Neighbouring moods are written in keys that
// share most of their notes, and a change of mood is a slow crossfade between two running scores, so the join is
// never a cut. The music steps down while a story's text is on screen.
import { state, on, setUI } from '../core/store.js';

const KEY = 'earth.music';
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

/** Which mood a date calls for. */
export function moodFor(y) {
  if (y < -4.0e9) return 'cosmos'; // before the first oceans
  if (y < -7.0e6) return 'deep'; // oceans, continents and life, until the human branch
  if (y < 1760) return 'ancient'; // people before engines
  if (y < 1945) return 'industrial';
  return 'modern';
}

// ---------------------------------------------------------------------------------------------------------------
// The scores. Times are in seconds of the audio clock. Every score gets a `deck`: { out, send, t0 } plus helpers.
// Keys: cosmos D lydian, deep A dorian, ancient D dorian, industrial D minor, modern F major. Each neighbour pair
// shares five or more of its seven notes. `level` evens the moods out: it was set from measurements of the page's own
// output (tests/music-balance.mjs), as were the registers, which keep most of the sound above 150 Hz where a phone
// or laptop speaker can reproduce it.
// ---------------------------------------------------------------------------------------------------------------
const SCORES = {
  cosmos: {
    level: 0.9,
    build(d) {
      d.drone(midi(38), 0.016, 'sine'); // D2, felt more than heard
      d.pad([50, 57, 64, 66], { gain: 0.034, cutoff: 1500, sweep: 380, rate: 0.021 }); // D3 A3 E4 F#4
      d.noise({ kind: 'pink', filter: 'bandpass', freq: 1300, q: 0.6, gain: 0.008 });
      d.chords = [[50, 57, 64, 66], [50, 59, 64, 68], [50, 57, 62, 69], [50, 57, 64, 66]];
      d.next = { star: d.t0 + 1.5, chord: d.t0 + 18 };
    },
    tick(d, t) {
      if (t >= d.next.star) {
        // a far-off bell: two partials, a long tail, a lot of room
        const n = pick([74, 76, 78, 81, 83, 85, 88, 90]);
        d.bell(midi(n), t, { gain: 0.05, decay: rnd(3.5, 6), pan: rnd(-0.8, 0.8), send: 0.9 });
        if (Math.random() < 0.3) d.bell(midi(n + pick([7, 12])), t + rnd(0.4, 1.1), { gain: 0.025, decay: 4, pan: rnd(-0.8, 0.8), send: 0.9 });
        d.next.star = t + rnd(2.4, 6.5);
      }
      if (t >= d.next.chord) {
        d.step = ((d.step || 0) + 1) % d.chords.length;
        d.padTo(d.chords[d.step], 4);
        d.next.chord = t + rnd(16, 24);
      }
    },
  },

  deep: {
    level: 0.95,
    build(d) {
      d.drone(midi(45), 0.014, 'sine'); // A2
      d.pad([57, 64, 71, 72], { gain: 0.03, cutoff: 950, sweep: 340, rate: 0.05, type: 'triangle' }); // A3 E4 B4 C5
      // surf: brown noise that swells and falls about every nine seconds
      d.noise({ kind: 'pink', filter: 'bandpass', freq: 520, q: 0.35, gain: 0.05, swell: 0.11, depth: 0.85 });
      d.chords = [[57, 64, 71, 72], [62, 69, 66, 74], [55, 62, 71, 74], [57, 64, 69, 76]];
      d.next = { drop: d.t0 + 2, song: d.t0 + 9, chord: d.t0 + 20 };
    },
    tick(d, t) {
      if (t >= d.next.drop) {
        const n = pick([69, 72, 74, 76, 79, 81]);
        d.drop(midi(n), t, { gain: 0.05, pan: rnd(-0.6, 0.6) });
        d.next.drop = t + rnd(2.5, 7.5);
      }
      if (t >= d.next.song) {
        // a long gliding tone, low and slow, like something calling across water
        const f = midi(pick([57, 59, 62, 64, 67]));
        d.glide(f, f * pick([1.122, 1.189, 0.891, 1.335]), t, { dur: rnd(3, 5), gain: 0.04, pan: rnd(-0.5, 0.5) });
        d.next.song = t + rnd(13, 26);
      }
      if (t >= d.next.chord) {
        d.step = ((d.step || 0) + 1) % d.chords.length;
        d.padTo(d.chords[d.step], 3.5);
        d.next.chord = t + rnd(18, 26);
      }
    },
  },

  ancient: {
    level: 1.75,
    beat: 1.05,
    build(d) {
      // an open fifth held underneath, with a slow shimmer in its tone
      d.pad([50, 57, 62], { gain: 0.02, cutoff: 900, sweep: 260, rate: 0.07, type: 'sawtooth', q: 2.0 }); // D3 A3 D4
      d.noise({ kind: 'pink', filter: 'bandpass', freq: 2200, q: 0.5, gain: 0.004 });
      d.scale = [62, 64, 65, 67, 69, 72, 74, 76, 77, 79, 81]; // D dorian without its sixth, D4 to A5
      d.at = 4; // where the melody stands in the scale
      d.bar = 0;
      d.nextBar = d.t0 + 1.2;
    },
    tick(d, t) {
      if (t < d.nextBar) return;
      const b = this.beat;
      const bar = d.nextBar;
      // a hand drum, very soft: a low note at the head of every second bar, a tap in the middle
      if (d.percussion && d.bar % 2 === 0) d.thump(bar, { from: 150, to: 92, gain: 0.03, decay: 0.24 });
      if (d.percussion && d.bar % 2 === 1) d.tick(bar + 2 * b, { freq: 2600, gain: 0.011, decay: 0.05 });
      // a plucked phrase most bars: a walk along the scale that comes to rest on D or A
      if (Math.random() < 0.72) {
        const len = pick([3, 4, 4, 5, 6]);
        let when = bar + pick([0, 0, b / 2]);
        for (let i = 0; i < len; i++) {
          const last = i === len - 1;
          d.at = Math.max(0, Math.min(d.scale.length - 1, d.at + pick([-2, -1, -1, 1, 1, 2])));
          if (last) d.at = [0, 4, 6, 10].reduce((best, k) => (Math.abs(k - d.at) < Math.abs(best - d.at) ? k : best), 0);
          d.pluck(midi(d.scale[d.at]), when, { gain: last ? 0.085 : 0.07, decay: last ? 2.2 : 1.3, pan: rnd(-0.3, 0.3), send: 0.35 });
          when += pick([b / 2, b / 2, b]);
        }
      } else if (Math.random() < 0.5) {
        // or a breath of flute above it
        d.flute(midi(pick([74, 76, 79, 81])), bar + b, { dur: rnd(2.2, 3.4), gain: 0.05, pan: rnd(-0.4, 0.4) });
      }
      d.bar++;
      d.nextBar = bar + 4 * b;
    },
  },

  industrial: {
    level: 1.65,
    beat: 0.72,
    build(d) {
      d.chords = [[38, 50, 53, 57], [34, 46, 50, 53], [41, 48, 53, 57], [36, 48, 52, 55]]; // Dm, Bb, F, C
      d.pad(d.chords[0].map((n, i) => (i ? n + 12 : n + 12)), { gain: 0.013, cutoff: 900, sweep: 160, rate: 0.04, type: 'sawtooth', q: 0.8 });
      d.noise({ kind: 'pink', filter: 'bandpass', freq: 300, q: 0.6, gain: 0.006 }); // the hum of a works far off
      d.bar = 0;
      d.nextBar = d.t0 + 1.4;
    },
    tick(d, t) {
      if (t < d.nextBar) return;
      const b = this.beat;
      const bar = d.nextBar;
      const chord = d.chords[Math.floor(d.bar / 2) % d.chords.length];
      if (d.bar % 2 === 0) d.padTo(chord.map((n) => n + 12), 0.6);
      d.bass(midi(chord[0] + 12), bar, { dur: 4 * b * 0.96, gain: 0.034 });
      // a steady figure in eighth notes, like a machine that has found its rhythm
      const figure = [1, 3, 2, 3, 1, 3, 2, 3];
      for (let i = 0; i < 8; i++) {
        if (i && Math.random() < 0.08) continue;
        d.keys(midi(chord[figure[i]] + 12), bar + (i * b) / 2, { gain: i % 2 ? 0.05 : 0.066, decay: 0.42, pan: i % 2 ? 0.25 : -0.25 });
      }
      if (d.percussion) {
        for (let i = 0; i < 4; i++) {
          d.puff(bar + i * b, { freq: 260, gain: i === 0 ? 0.03 : 0.02, decay: 0.13 }); // a piston
          d.tick(bar + i * b + b / 2, { freq: 5200, gain: 0.004, decay: 0.03 }); // escaping steam
        }
      }
      // every other pair of bars, three slow notes above it
      if (d.bar % 4 === 2 && Math.random() < 0.8) {
        const top = [chord[2] + 12, chord[3] + 12, chord[1] + 24];
        let when = bar;
        for (let i = 0; i < 3; i++) {
          d.flute(midi(pick(top)), when, { dur: 1.5, gain: 0.045, pan: rnd(-0.3, 0.3) });
          when += 2 * b;
        }
      }
      d.bar++;
      d.nextBar = bar + 4 * b;
    },
  },

  modern: {
    level: 1.25,
    beat: 0.625,
    build(d) {
      d.chords = [[41, 53, 57, 60, 67], [40, 52, 55, 60, 67], [38, 53, 57, 60, 64], [34, 50, 53, 57, 62]]; // F add9, C/E, Dm7, Bb maj7
      d.pad(d.chords[0].slice(1), { gain: 0.026, cutoff: 1900, sweep: 500, rate: 0.06, type: 'triangle' });
      d.noise({ kind: 'pink', filter: 'highpass', freq: 5000, q: 0.5, gain: 0.0016 });
      d.bar = 0;
      d.nextBar = d.t0 + 1.2;
    },
    tick(d, t) {
      if (t < d.nextBar) return;
      const b = this.beat;
      const bar = d.nextBar;
      const chord = d.chords[Math.floor(d.bar / 2) % d.chords.length];
      if (d.bar % 2 === 0) d.padTo(chord.slice(1), 0.5);
      d.bass(midi(chord[0] + 12), bar, { dur: 4 * b * 0.9, gain: 0.03 });
      // a light arpeggio through the chord, up and back, with the odd note left out
      const up = [1, 2, 3, 4, 3, 2, 3, 4];
      for (let i = 0; i < 8; i++) {
        if (Math.random() < 0.18) continue;
        d.pluck(midi(chord[up[i]] + 12), bar + (i * b) / 2, { gain: 0.055, decay: 0.5, pan: i % 2 ? 0.45 : -0.45, send: 0.45, bright: 3200 });
      }
      if (d.percussion) {
        d.thump(bar, { from: 160, to: 80, gain: 0.03, decay: 0.2 });
        d.thump(bar + 2 * b, { from: 160, to: 80, gain: 0.02, decay: 0.18 });
        for (let i = 0; i < 8; i++) d.tick(bar + (i * b) / 2 + b / 4, { freq: 7000, gain: i % 2 ? 0.0035 : 0.002, decay: 0.03 });
      }
      // a short tune every fourth bar
      if (d.bar % 4 === 3) {
        const notes = [chord[4] + 12, chord[3] + 12, chord[4] + 12, chord[2] + 24];
        let when = bar;
        for (let i = 0; i < pick([2, 3, 4]); i++) {
          d.bell(midi(notes[i]), when, { gain: 0.045, decay: 2.2, pan: rnd(-0.5, 0.5), send: 0.7 });
          when += pick([b, b, 2 * b]);
        }
      }
      d.bar++;
      d.nextBar = bar + 4 * b;
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------
// A deck: one running score with its own output, so that two can overlap during a crossfade.
// ---------------------------------------------------------------------------------------------------------------
class Deck {
  constructor(music, id) {
    const ctx = music.ctx;
    this.music = music;
    this.ctx = ctx;
    this.id = id;
    this.score = SCORES[id];
    this.t0 = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(music.bus);
    this.send = ctx.createGain(); // to the shared room
    this.send.gain.value = 1;
    this.send.connect(music.room);
    this.held = []; // oscillators and sources that run until the deck is retired
    this.padVoices = [];
    this.percussion = false; // pulses join a little after the pad, and leave first
    this.target = 0;
    this.score.build(this);
  }

  // ---- held sounds ----
  drone(freq, gain, type) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(this.out);
    o.start();
    this.held.push(o);
  }

  pad(notes, { gain, cutoff, sweep = 0, rate = 0.05, type = 'sine', q = 0.7 }) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = q;
    f.connect(this.out);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    f.connect(wet);
    wet.connect(this.send);
    if (sweep) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = rate;
      lg.gain.value = sweep;
      lfo.connect(lg);
      lg.connect(f.frequency);
      lfo.start();
      this.held.push(lfo);
    }
    this.padVoices = notes.map((n, i) => {
      const g = ctx.createGain();
      g.gain.value = gain / (1 + i * 0.18);
      g.connect(f);
      // each voice breathes at its own slow rate so the chord never stands still
      const breath = ctx.createOscillator();
      const bg = ctx.createGain();
      breath.frequency.value = 0.031 + i * 0.013;
      bg.gain.value = (gain / (1 + i * 0.18)) * 0.45;
      breath.connect(bg);
      bg.connect(g.gain);
      breath.start();
      this.held.push(breath);
      const oscs = [-5, 6].map((cents) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = midi(n);
        o.detune.value = cents;
        o.connect(g);
        o.start();
        this.held.push(o);
        return o;
      });
      return { oscs };
    });
  }

  /** Move the pad to another chord by gliding each voice. */
  padTo(notes, glide) {
    const t = this.ctx.currentTime;
    this.padVoices.forEach((v, i) => {
      const n = notes[i % notes.length];
      for (const o of v.oscs) o.frequency.setTargetAtTime(midi(n), t, glide / 3);
    });
  }

  noise({ kind, filter, freq, q, gain, swell = 0, depth = 0 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.music.noiseBuffer(kind);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain * (swell ? 1 - depth / 2 : 1);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    if (swell) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = swell;
      lg.gain.value = (gain * depth) / 2;
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start();
      this.held.push(lfo);
    }
    src.start();
    this.held.push(src);
  }

  // ---- single notes: each builds a tiny chain that stops itself ----
  voice(t, dur, pan, send, make) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = pan || 0;
      g.connect(p);
      p.connect(this.out);
    } else g.connect(this.out);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(this.send);
    }
    const sources = make(g);
    for (const s of sources) {
      s.start(t);
      s.stop(t + dur + 0.05);
    }
    return g.gain;
  }

  bell(freq, t, { gain, decay, pan, send }) {
    const env = this.voice(t, decay * 1.4 + 0.3, pan, send, (g) => [1, 2.01, 3.02].map((r, i) => {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * r;
      og.gain.value = [1, 0.32, 0.12][i];
      o.connect(og);
      og.connect(g);
      return o;
    }));
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.012);
    env.setTargetAtTime(0, t + 0.03, decay / 4.5);
  }

  drop(freq, t, { gain, pan }) {
    let osc;
    const env = this.voice(t, 1.4, pan, 0.6, (g) => {
      osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(g);
      return [osc];
    });
    osc.frequency.setValueAtTime(freq * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.006);
    env.setTargetAtTime(0, t + 0.02, 0.22);
  }

  glide(from, to, t, { dur, gain, pan }) {
    let osc;
    const env = this.voice(t, dur + 1.2, pan, 0.8, (g) => {
      osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(g);
      return [osc];
    });
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.linearRampToValueAtTime(to, t + dur);
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + dur * 0.35);
    env.setTargetAtTime(0, t + dur * 0.6, dur * 0.2);
  }

  pluck(freq, t, { gain, decay, pan, send, bright = 2400 }) {
    const ctx = this.ctx;
    let filter;
    const env = this.voice(t, decay + 0.3, pan, send, (g) => {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.9;
      filter.connect(g);
      return ['triangle', 'square'].map((type, i) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = i ? 4 : -3;
        og.gain.value = i ? 0.14 : 1;
        o.connect(og);
        og.connect(filter);
        return o;
      });
    });
    filter.frequency.setValueAtTime(bright, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(300, bright / 4), t + 0.35);
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.006);
    env.setTargetAtTime(0, t + 0.02, decay / 4);
  }

  keys(freq, t, { gain, decay, pan }) {
    const ctx = this.ctx;
    const env = this.voice(t, decay + 0.2, pan, 0.2, (g) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1500;
      f.connect(g);
      return [1, 2].map((r, i) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = i ? 'sine' : 'triangle';
        o.frequency.value = freq * r;
        og.gain.value = i ? 0.25 : 1;
        o.connect(og);
        og.connect(f);
        return o;
      });
    });
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.005);
    env.setTargetAtTime(0, t + 0.015, decay / 3.5);
  }

  flute(freq, t, { dur, gain, pan }) {
    const ctx = this.ctx;
    const env = this.voice(t, dur + 0.8, pan, 0.6, (g) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      vib.frequency.value = 4.6;
      vg.gain.value = freq * 0.004;
      vib.connect(vg);
      vg.connect(o.frequency);
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'triangle';
      o2.frequency.value = freq * 2;
      g2.gain.value = 0.08;
      o2.connect(g2);
      g2.connect(g);
      o.connect(g);
      return [o, vib, o2];
    });
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + Math.min(0.3, dur * 0.25));
    env.setTargetAtTime(0, t + dur * 0.7, dur * 0.14);
  }

  bass(freq, t, { dur, gain }) {
    const ctx = this.ctx;
    const env = this.voice(t, dur + 0.4, 0, 0, (g) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 620;
      f.connect(g);
      return ['sine', 'triangle'].map((type, i) => {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        og.gain.value = i ? 0.6 : 1;
        o.connect(og);
        og.connect(f);
        return o;
      });
    });
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.05);
    env.setTargetAtTime(0, t + dur * 0.75, dur * 0.1);
  }

  thump(t, { from, to, gain, decay }) {
    let osc;
    const env = this.voice(t, decay + 0.15, 0, 0, (g) => {
      osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.connect(g);
      return [osc];
    });
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + decay * 0.7);
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.004);
    env.setTargetAtTime(0, t + 0.01, decay / 3);
  }

  /** A filtered noise burst. `tick` is bright and tiny, `puff` is low and soft. */
  burst(t, { freq, gain, decay, type }) {
    const ctx = this.ctx;
    const env = this.voice(t, decay + 0.1, 0, 0, (g) => {
      const src = ctx.createBufferSource();
      src.buffer = this.music.noiseBuffer('white');
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = 1.1;
      src.connect(f);
      f.connect(g);
      return [src];
    });
    env.setValueAtTime(0, t);
    env.linearRampToValueAtTime(gain, t + 0.003);
    env.setTargetAtTime(0, t + 0.006, decay / 3);
  }
  tick(t, o) { this.burst(t, { ...o, type: 'highpass' }); }
  puff(t, o) { this.burst(t, { ...o, type: 'bandpass' }); }

  // ---- life cycle ----
  fade(to, tau) {
    this.target = to;
    this.out.gain.setTargetAtTime(to * this.score.level, this.ctx.currentTime, tau);
  }

  retire() {
    for (const n of this.held) {
      try { n.stop(); } catch { /* already stopped */ }
    }
    this.held = [];
    try {
      this.out.disconnect();
      this.send.disconnect();
    } catch { /* nothing to do */ }
  }
}

// ---------------------------------------------------------------------------------------------------------------
export class Music {
  /** `disabled` is set in capture mode: no audio context is ever created. */
  constructor({ disabled = false } = {}) {
    this.disabled = disabled;
    this.ctx = null;
    this.decks = new Map();
    this.mood = null; // the mood now sounding
    this.wanted = null; // the mood the clock asks for
    this.duck = 1;
    this.blocked = false; // an interaction happened and the browser still would not start audio
    this.buffers = {};
    this.listeners = new Set();
    let stored = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch { /* storage unavailable: the default applies */ }
    this.enabled = !disabled && stored !== 'off';
  }

  onChange(fn) { this.listeners.add(fn); }
  changed() { for (const fn of this.listeners) fn(this); }

  /** 'off', 'waiting' (on, but the browser has not allowed sound yet) or 'playing'. */
  get status() {
    if (!this.enabled) return 'off';
    return this.ctx && this.ctx.state === 'running' ? 'playing' : 'waiting';
  }

  /** Listen for the first interaction and start there. */
  arm() {
    if (this.disabled) return;
    const gesture = (e) => {
      if (!this.enabled || this.status === 'playing') return;
      // a press on the music control is handled by the control itself (it may mean "start" or "turn off")
      if (e.target && e.target.closest && e.target.closest('.music-btn')) return;
      this.start();
      // A wheel or a scroll does not unlock audio in today's browsers. If the page is still silent a moment after
      // an interaction, the control says what will start it instead of staying mute about it.
      clearTimeout(this.askTimer);
      this.askTimer = setTimeout(() => {
        if (this.enabled && this.status !== 'playing' && !this.blocked) {
          this.blocked = true;
          this.changed();
        }
      }, 500);
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'click', 'touchstart', 'touchend', 'keydown', 'wheel', 'scroll']) {
      addEventListener(type, gesture, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled) this.ctx.resume();
    });
  }

  /** Build the graph (once) and ask the browser to let it run. Safe to call again and again. */
  start() {
    if (this.disabled || !this.enabled) return false;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      let ctx;
      try {
        ctx = new AC();
      } catch {
        return false;
      }
      this.ctx = ctx;
      // master -> a gentle limiter -> out. The music bus is where ducking happens; interface sounds bypass it.
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -16;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 4;
      this.limiter.attack.value = 0.01;
      this.limiter.release.value = 0.3;
      this.limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.limiter);
      this.bus = ctx.createGain();
      this.bus.gain.value = 0.62 * this.duck;
      this.bus.connect(this.master);
      this.fx = ctx.createGain();
      this.fx.gain.value = 0.8;
      this.fx.connect(this.master);
      // one shared room: a generated impulse response, so nothing is downloaded
      this.room = ctx.createConvolver();
      this.room.buffer = this.impulse(3.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.room.connect(wet);
      wet.connect(this.bus);
      // a tap for level checks (tests, and nothing else)
      this.tap = ctx.createAnalyser();
      this.tap.fftSize = 2048;
      this.master.connect(this.tap);
      ctx.onstatechange = () => {
        if (ctx.state === 'running') this.run();
        this.changed();
      };
    }
    const p = this.ctx.resume();
    if (p && p.catch) p.catch(() => {});
    if (this.ctx.state === 'running') this.run();
    return true;
  }

  /** The context is running: fade the master up and make sure a score is playing. */
  run() {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(1, t, 0.9); // about three seconds to full: the music arrives, it does not start
    this.blocked = false;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 180);
    this.apply(this.wanted || moodFor(state.y), true);
    this.changed();
  }

  /** Turn the music on or off, and remember it. A click on the control is itself the gesture a browser asks for. */
  setEnabled(on) {
    if (this.disabled) return;
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch { /* storage unavailable: the choice lasts for this visit */ }
    if (on) this.start();
    else if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.25);
      clearTimeout(this.sleep);
      this.sleep = setTimeout(() => { if (!this.enabled && this.ctx) this.ctx.suspend(); }, 1400);
    }
    this.changed();
  }

  /** Ask for a mood. The change waits a moment, so scrubbing through several eras does not start several scores. */
  setMood(id) {
    if (id === this.wanted) return;
    this.wanted = id;
    clearTimeout(this.moodTimer);
    this.moodTimer = setTimeout(() => this.apply(id), 700);
  }

  apply(id, now) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.enabled) return;
    if (id === this.mood && this.decks.has(id) && this.decks.get(id).target === 1) return;
    const t = this.ctx.currentTime;
    for (const [k, d] of this.decks) {
      if (k === id) continue;
      d.fade(0, 1.7); // about five seconds down
      d.percussion = false; // pulses stop being written at once; what is sounding rings out under the fade
      d.gone = t + 7.5; // by then it is more than 35 dB down
    }
    let deck = this.decks.get(id);
    if (!deck) {
      deck = new Deck(this, id);
      this.decks.set(id, deck);
    }
    deck.gone = 0;
    deck.fade(1, now && !this.mood ? 1.2 : 1.9);
    deck.percussionAt = t + (this.mood ? 3.5 : 2.5);
    this.mood = id;
    this.changed();
  }

  /** Called a few times a second: let each live score write the next stretch of notes, and clear away faded ones. */
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const [k, d] of this.decks) {
      if (d.gone && t > d.gone) {
        d.retire();
        this.decks.delete(k);
        continue;
      }
      if (d.target === 0) continue;
      if (!d.percussion && t >= d.percussionAt) d.percussion = true;
      // write up to a second and a quarter ahead, so a busy page or a background tab does not leave gaps
      let guard = 0;
      const horizon = t + 1.25;
      d.cursor = Math.max(d.cursor || t, t);
      while (d.cursor < horizon && guard++ < 16) {
        d.score.tick(d, d.cursor);
        d.cursor += 0.1;
      }
    }
  }

  /** 1 is full level. Stories ask for less while their text is on screen. */
  setDuck(level) {
    if (level === this.duck) return;
    this.duck = level;
    if (this.bus) this.bus.gain.setTargetAtTime(0.62 * level, this.ctx.currentTime, 0.5);
  }

  /** Short interface sounds: 'tick' while scrubbing, 'open' for panels, 'pin' for a selection, 'close'. */
  blip(kind) {
    if (this.status !== 'playing') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (kind === 'tick') {
      if (now - (this.lastTick || 0) < 0.045) return;
      this.lastTick = now;
    }
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = { tick: 1250, open: 392, pin: 587, close: 294 }[kind] || 440;
    o.type = kind === 'tick' ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f, now);
    if (kind !== 'tick') o.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.09);
    g.gain.setValueAtTime(kind === 'tick' ? 0.014 : 0.035, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'tick' ? 0.035 : 0.24));
    o.connect(g);
    g.connect(this.fx);
    o.start(now);
    o.stop(now + 0.26);
  }

  // ---- generated material ----
  noiseBuffer(kind) {
    if (this.buffers[kind]) return this.buffers[kind];
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'white') for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      // pink, by the Voss-McCartney shortcut
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      }
    }
    // the loop point must not click: fade the last tenth of a second into the first
    const n = Math.floor(ctx.sampleRate * 0.1);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      d[len - n + i] = d[len - n + i] * (1 - k) + d[i] * k;
    }
    this.buffers[kind] = buf;
    return buf;
  }

  impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    return buf;
  }

  /** Level of what is going out, for tests: { rms, peak } over the last 2048 samples, both 0..1. */
  level() {
    if (!this.tap) return { rms: 0, peak: 0 };
    const a = new Float32Array(this.tap.fftSize);
    this.tap.getFloatTimeDomainData(a);
    let sum = 0;
    let peak = 0;
    for (const v of a) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    // where the weight of the sound sits (Hz): moods differ here, which a test can check without ears
    const f = new Float32Array(this.tap.frequencyBinCount);
    this.tap.getFloatFrequencyData(f);
    let num = 0;
    let den = 0;
    const hz = this.ctx.sampleRate / this.tap.fftSize;
    for (let i = 1; i < f.length; i++) {
      const p = 10 ** (f[i] / 10);
      num += p * i * hz;
      den += p;
    }
    return { rms: Math.sqrt(sum / a.length), peak, centre: den ? num / den : 0 };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The control. One button, fixed on screen in every mode.
// ---------------------------------------------------------------------------------------------------------------
const NOTE = 'M9 18V6l10-2v12|M9 18a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z|M19 16a2.500 2.500 0 1 1-5 0 2.500 2.500 0 0 1 5 0z';
const NOTE_OFF = `${NOTE}|M3 3l18 18`;

export function installMusic(app, { h, icon, announce }) {
  const music = new Music({ disabled: !!state.capture });
  app.music = music;
  app.sound = music; // the older name, still used for interface sounds

  const label = h('span.music-label');
  const glyph = h('span.music-glyph');
  const btn = h('button.music-btn', { type: 'button' }, glyph, label);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const render = () => {
    const s = music.disabled ? 'off' : music.status;
    const asked = s === 'waiting' && music.blocked;
    btn.dataset.state = asked ? 'asked' : s;
    btn.setAttribute('aria-pressed', String(s !== 'off'));
    glyph.replaceChildren(icon(s === 'off' ? NOTE_OFF : NOTE, 18));
    label.textContent = s === 'off' ? 'Music off' : asked ? (coarse ? 'Tap for music' : 'Click for music') : 'Music on';
    const tip = music.disabled
      ? 'Music is off while frames are being captured'
      : s === 'off' ? 'Turn the music on'
        : s === 'playing' ? 'Turn the music off'
          : 'Music starts with your first click, tap or key press. A browser does not let a page start sound from scrolling alone.';
    btn.title = tip;
    btn.setAttribute('aria-label', s === 'off' ? 'Music is off. Turn it on' : s === 'playing' ? 'Music is on. Turn it off' : 'Music is on and starts with your first click, tap or key press');
    if (music.disabled) btn.setAttribute('aria-disabled', 'true');
    // On a phone the control is the note alone. It spells itself out for a few seconds when the page opens and each
    // time its state changes, so nobody has to guess what the note is or what a press just did.
    const said = btn.dataset.state + label.textContent;
    if (said !== lastSaid && !music.disabled) { // (not in capture mode: a captured frame must not depend on when it was taken)
      lastSaid = said;
      btn.classList.add('say');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => { btn.classList.remove('say'); measure(); }, 3200);
    }
    measure();
    if (state.sound !== (s !== 'off')) setUI({ sound: s !== 'off' }, 'music');
  };
  // the timeline keeps this much room free in its bottom row
  const measure = () => document.documentElement.style.setProperty('--music-w', `${btn.offsetWidth}px`);
  let lastSaid = '';
  let sayTimer = 0;
  btn.addEventListener('click', () => {
    if (music.disabled) return;
    // on and silent because the browser is still waiting for a gesture: this click is that gesture
    if (music.status === 'waiting') {
      music.start();
      return;
    }
    const turnOn = music.status === 'off';
    music.setEnabled(turnOn);
    announce(turnOn ? 'Music on' : 'Music off');
  });
  document.getElementById('ui').append(btn);
  music.onChange(render);
  render();
  addEventListener('resize', render);

  // the clock sets the mood; a story's text lowers the level; an open record lowers it a little
  const follow = () => music.setMood(moodFor(state.y));
  const level = () => music.setDuck(state.story ? 0.5 : state.event ? 0.78 : 1);
  on(['y'], follow);
  on(['story', 'event'], level);
  follow();
  level();

  music.arm();
  return music;
}
