/**
 * Synthesized placeholder soundscapes.
 *
 * These let the mixer work before any recordings are added to /public/sounds.
 * Each generator renders a short mono loop sample by sample, using noise
 * sources, one-pole filters, and simple envelopes. The engine uses a
 * placeholder only when the real file is missing or can't be decoded.
 *
 * The output is deterministic (seeded PRNG), so a placeholder sounds the same
 * on every visit.
 */

import { crossfadeLoop } from './seamless.js';

/** Placeholders are rendered at a modest rate: soft, and cheap to compute. */
export const SYNTH_RATE = 24000;

const TAU = Math.PI * 2;

/** Mulberry32: a small, fast seeded PRNG returning [0, 1). */
function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coefficient for a one-pole low-pass filter with cutoff `hz`. */
const lp = (hz) => 1 - Math.exp((-TAU * hz) / SYNTH_RATE);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** White, pink, and brown noise sources that share one PRNG. */
function noise(rand) {
  let b0 = 0, b1 = 0, b2 = 0, br = 0;
  return {
    white: () => rand() * 2 - 1,
    // Paul Kellet's economy pink-noise filter.
    pink() {
      const w = rand() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      return (b0 + b1 + b2 + w * 0.1848) * 0.25;
    },
    // Leaky integrator: deep, soft "brown" noise.
    brown() {
      const w = rand() * 2 - 1;
      br = (br + 0.02 * w) / 1.02;
      return br * 3.5;
    },
  };
}

/** Adds a short tone with a pitch glide and a smooth envelope at `start` (s). */
function addTone(out, start, seconds, f0, f1, amp, shape = 'arch') {
  const begin = Math.floor(start * SYNTH_RATE);
  const len = Math.floor(seconds * SYNTH_RATE);
  let phase = 0;
  for (let j = 0; j < len && begin + j < out.length; j++) {
    const x = j / len;
    phase += (TAU * (f0 + (f1 - f0) * x)) / SYNTH_RATE;
    const env = shape === 'arch' ? Math.sin(Math.PI * x) ** 2 : (1 - x) ** 2 * Math.min(1, j / 48);
    out[begin + j] += amp * env * (Math.sin(phase) + 0.15 * Math.sin(2 * phase));
  }
}

/* Each generator fills `out` (seconds × SYNTH_RATE samples). */

const generators = {
  rain: {
    seconds: 20,
    level: 0.12,
    render(out, rand, n) {
      const aLow = lp(500), aTone = lp(5500), aDrop = lp(3000);
      const dropChance = 70 / SYNTH_RATE; // ~70 audible drops per second
      const dropDecay = Math.exp(-1 / (0.005 * SYNTH_RATE));
      let low = 0, tone = 0, dropLp = 0, dropEnv = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SYNTH_RATE;
        const p = n.pink();
        low += aLow * (p - low);
        tone += aTone * (p - low - tone); // band-limited hiss
        if (rand() < dropChance) dropEnv = Math.max(dropEnv, 0.2 + rand() * 0.8);
        dropEnv *= dropDecay;
        const w = n.white();
        dropLp += aDrop * (w - dropLp);
        const swell = 0.88 + 0.12 * Math.sin((TAU * t) / 10);
        out[i] = tone * swell + (w - dropLp) * dropEnv * 0.12;
      }
    },
  },

  thunder: {
    seconds: 30,
    level: 0.09,
    render(out, rand, n) {
      const strikes = [
        { at: 2.5, size: 1 },
        { at: 13.5, size: 0.6 },
        { at: 21.5, size: 0.85 },
      ];
      const aRumble = lp(120), aCrack = lp(1600), aWobble = lp(4);
      let rumble = 0, crack = 0, wobble = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SYNTH_RATE;
        rumble += aRumble * (n.brown() - rumble);
        crack += aCrack * (n.white() - crack);
        wobble += aWobble * (n.white() - wobble);
        let env = 0.06; // faint, ever-present distant rumble
        let crackEnv = 0;
        for (const s of strikes) {
          const d = t - s.at;
          if (d < 0 || d > 10) continue;
          env += s.size * Math.min(1, d / 0.4) * Math.exp(-d / 2.4);
          crackEnv += s.size * Math.min(1, d / 0.01) * Math.exp(-d / 0.2);
        }
        const roll = 0.7 + 0.3 * Math.max(-1, Math.min(1, wobble * 14));
        out[i] = rumble * env * roll * 2 + crack * crackEnv * 0.3;
      }
    },
  },

  waves: {
    seconds: 24,
    level: 0.13,
    render(out, rand, n) {
      let body = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SYNTH_RATE;
        // Periods divide the loop length, so the swell pattern repeats cleanly.
        const s1 = 0.5 - 0.5 * Math.cos((TAU * t) / 8);
        const s2 = 0.5 - 0.5 * Math.cos((TAU * t) / 12 + 1.3);
        const env = 0.12 + 0.88 * Math.pow(s1 * 0.7 + s2 * 0.3, 2.2);
        // Brighter as a wave breaks, duller as it draws back.
        body += lp(250 + 2200 * env) * (n.white() - body);
        out[i] = body * env + n.brown() * 0.1;
      }
    },
  },

  wind: {
    seconds: 22,
    level: 0.11,
    render(out, rand, n) {
      const aLow = lp(90), aGust = lp(0.6);
      let band = 0, low = 0, gustNoise = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SYNTH_RATE;
        gustNoise += aGust * (n.white() - gustNoise);
        const gust = clamp01(
          0.45 + 0.3 * Math.sin((TAU * t) / 11) + 0.15 * Math.sin((TAU * t) / 4.3 + 2) + gustNoise * 20,
        );
        band += lp(180 + 1100 * gust) * (n.pink() - band);
        low += aLow * (band - low);
        out[i] = (band - low) * (0.3 + 0.9 * gust);
      }
    },
  },

  birds: {
    seconds: 24,
    level: 0.05,
    render(out, rand, n) {
      // Quiet airy bed so the gaps between calls aren't dead silence.
      const aAir = lp(2500), aAirLow = lp(600);
      let air = 0, airLow = 0;
      for (let i = 0; i < out.length; i++) {
        air += aAir * (n.pink() - air);
        airLow += aAirLow * (air - airLow);
        out[i] = (air - airLow) * 0.05;
      }
      // Two voices: a quick, high warbler and a slower, lower whistler.
      const voices = [
        { gap: [1.2, 3], notes: [3, 7], len: [0.04, 0.08], space: [0.07, 0.12], f: [3000, 4600], sweep: [-800, 1000], amp: [0.2, 0.55] },
        { gap: [2.4, 5], notes: [2, 4], len: [0.12, 0.24], space: [0.16, 0.3], f: [1800, 2800], sweep: [-500, 700], amp: [0.25, 0.6] },
      ];
      const span = ([a, b]) => a + rand() * (b - a);
      const total = out.length / SYNTH_RATE;
      for (const v of voices) {
        let t = span(v.gap) * rand();
        while (t < total - 1) {
          const count = Math.round(span(v.notes));
          const base = span(v.f), sweep = span(v.sweep), amp = span(v.amp);
          const len = span(v.len), space = span(v.space);
          for (let k = 0; k < count; k++) {
            const f0 = base * (1 + (rand() - 0.5) * 0.06);
            addTone(out, t + k * space, len * (0.85 + rand() * 0.3), f0, f0 + sweep, amp);
          }
          t += count * space + span(v.gap);
        }
      }
    },
  },

  stream: {
    seconds: 20,
    level: 0.1,
    render(out, rand, n) {
      const aHi = lp(3500), aLo = lp(350), aFlutter = lp(9);
      let hi = 0, lo = 0, flutter = 0;
      for (let i = 0; i < out.length; i++) {
        hi += aHi * (n.white() - hi);
        lo += aLo * (hi - lo);
        flutter += aFlutter * (n.white() - flutter);
        out[i] = (hi - lo) * (0.6 + flutter * 8);
      }
      // Bubbles: short rising blips scattered through the loop.
      const total = out.length / SYNTH_RATE;
      for (let k = 0; k < total * 28; k++) {
        const f0 = 350 + rand() * 700;
        addTone(out, rand() * (total - 0.1), 0.015 + rand() * 0.035, f0, f0 * (1.4 + rand() * 0.8), 0.04 + rand() * 0.12, 'pluck');
      }
    },
  },

  fire: {
    seconds: 20,
    level: 0.1,
    render(out, rand, n) {
      const aRoar = lp(400), aFlicker = lp(3);
      let roar = 0, flicker = 0;
      for (let i = 0; i < out.length; i++) {
        roar += aRoar * (n.brown() - roar);
        flicker += aFlicker * (n.white() - flicker);
        out[i] = roar * (0.9 + flicker * 10) * 1.4;
      }
      // Crackles: Poisson-timed pops, sometimes in little bursts.
      const total = out.length / SYNTH_RATE;
      let t = 0;
      while (true) {
        t += -Math.log(1 - rand()) / 7;
        if (t > total - 0.2) break;
        const burst = rand() < 0.2 ? 3 + Math.floor(rand() * 5) : 1;
        let at = t;
        for (let b = 0; b < burst; b++) {
          at += 0.01 + rand() * 0.04;
          const start = Math.floor(at * SYNTH_RATE);
          const len = Math.floor((0.002 + rand() * 0.008) * SYNTH_RATE);
          const amp = 0.2 + rand() * 0.8;
          let prev = 0;
          for (let j = 0; j < len && start + j < out.length; j++) {
            const w = n.white();
            out[start + j] += (w - prev) * amp * Math.exp(-j / (len * 0.3)) * 0.5;
            prev = w;
          }
        }
      }
    },
  },

  night: {
    seconds: 20,
    level: 0.06,
    render(out, rand, n) {
      const crickets = [
        { f: 4400, period: 0.62, pulses: 3, amp: 0.35, offset: 0.1 },
        { f: 4750, period: 0.81, pulses: 4, amp: 0.22, offset: 0.37 },
        { f: 3900, period: 1.13, pulses: 2, amp: 0.12, offset: 0.6 },
      ];
      const aBed = lp(300);
      let bed = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / SYNTH_RATE;
        bed += aBed * (n.brown() - bed);
        let s = bed * 0.25;
        for (const c of crickets) {
          const local = (t + c.offset) % c.period;
          const idx = Math.floor(local / 0.032);
          if (idx >= c.pulses) continue;
          const x = (local - idx * 0.032) / 0.02;
          if (x >= 1) continue;
          const drift = 0.75 + 0.25 * Math.sin((TAU * t) / 7 + c.offset * 10);
          s += c.amp * drift * Math.sin(Math.PI * x) * Math.sin(TAU * c.f * t);
        }
        out[i] = s;
      }
    },
  },

  noise: {
    seconds: 12,
    level: 0.12,
    render(out, rand, n) {
      const a = lp(900);
      let s = 0;
      for (let i = 0; i < out.length; i++) {
        s += a * (n.brown() - s);
        out[i] = s;
      }
    },
  },
};

/** Scales to a target RMS so channels sit at similar loudness, with a peak ceiling. */
function normalize(out, targetRms, ceiling = 0.95) {
  let sum = 0, peak = 0;
  for (let i = 0; i < out.length; i++) {
    sum += out[i] * out[i];
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / out.length) || 1;
  const gain = Math.min(targetRms / rms, ceiling / (peak || 1));
  for (let i = 0; i < out.length; i++) out[i] *= gain;
}

export const hasSynth = (id) => id in generators;

/**
 * Renders the placeholder loop for a sound id.
 * @returns {Float32Array | null} Mono samples at SYNTH_RATE, already seamless.
 */
export function renderSynth(id) {
  const gen = generators[id];
  if (!gen) return null;
  // Seed from the id so each sound has its own texture.
  const seed = [...id].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
  const rand = prng(seed);
  const out = new Float32Array(Math.floor(gen.seconds * SYNTH_RATE));
  gen.render(out, rand, noise(rand));
  normalize(out, gen.level);
  return crossfadeLoop(out, SYNTH_RATE * 0.75);
}
