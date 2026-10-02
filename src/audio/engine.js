/**
 * MixerEngine: the Web Audio graph behind the mixer.
 *
 *   [source → fader] → channel gain ─┐
 *   [source → fader] → channel gain ─┼→ master gain → compressor → analyser → speakers
 *   [source → fader] → channel gain ─┘
 *
 * - Each sound is decoded once into an AudioBuffer and played by a looping
 *   AudioBufferSourceNode, which is gapless. makeSeamless() removes clicks at
 *   the wrap point.
 * - "fader" is a per-source gain used only for on/off fades. Because every
 *   source has its own fader, quick on/off/on toggles never stack audibly.
 * - "channel gain" holds the user's volume. "master gain" holds the master
 *   volume and does the play/pause fades.
 * - A gentle compressor stops the sum from clipping when many loud channels
 *   are stacked.
 *
 * The AudioContext is created only inside start(), which the UI calls from
 * a user gesture. That satisfies browser autoplay policies.
 *
 * Events (EventTarget):
 *   "state"  → playing / paused changed
 *   "status" → detail: { id, status } where status is
 *              "loading" | "file" | "synth" | "missing"
 */

import { makeSeamless } from './seamless.js';
import { renderSynth, SYNTH_RATE } from './synth.js';

/** setTargetAtTime time constants (s). About 3× this is the audible ramp length. */
const VOLUME_TAU = 0.08;
const TOGGLE_TAU = 0.12;
const PAUSE_TAU = 0.07;

/** Squared slider value is a cheap but much more even-feeling loudness curve. */
const toGain = (v) => v * v;

export class MixerEngine extends EventTarget {
  /** @param {Array<{id: string, file: string, loopCrossfade?: number}>} sounds */
  constructor(sounds) {
    super();
    this.ctx = null;
    this.playing = false;
    this.masterLevel = 0.8;
    this._suspendTimer = 0;
    /** @type {Map<string, any>} */
    this.channels = new Map(
      sounds.map((def) => [
        def.id,
        { def, on: false, vol: 0.5, gain: null, buffer: null, loading: null, source: null, fader: null, token: 0 },
      ]),
    );
  }

  get started() {
    return this.ctx !== null;
  }

  /** The AnalyserNode on the final mix (for visualizers); null before start(). */
  get analyser() {
    return this._analyser ?? null;
  }

  /**
   * Starts or resumes playback. Must be called from a user gesture handler.
   * The context is created and resume() is called synchronously, inside the
   * gesture, before any await.
   */
  async start() {
    if (!this.ctx) this._createGraph();
    clearTimeout(this._suspendTimer);
    const resumed = this.ctx.state === 'running' ? null : this.ctx.resume();
    this.playing = true;
    this._emit('state');
    try {
      await resumed;
    } catch {
      this.playing = false;
      this._emit('state');
      return;
    }
    if (!this.playing) return; // paused again while resuming
    this._ramp(this.master.gain, toGain(this.masterLevel), VOLUME_TAU);
    for (const ch of this.channels.values()) if (ch.on) this._enable(ch);
  }

  /** Fades out, then suspends the context so it uses no CPU while paused. */
  pause() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    this._ramp(this.master.gain, 0, PAUSE_TAU);
    clearTimeout(this._suspendTimer);
    this._suspendTimer = setTimeout(() => {
      if (!this.playing) this.ctx.suspend();
    }, 450);
    this._emit('state');
  }

  toggle() {
    return this.playing ? this.pause() : this.start();
  }

  /** @param {number} v 0–1 */
  setMaster(v) {
    this.masterLevel = v;
    if (this.ctx && this.playing) this._ramp(this.master.gain, toGain(v), VOLUME_TAU);
  }

  /**
   * Updates one channel. Safe to call before start(); the values are kept and
   * applied once the context exists.
   * @param {string} id
   * @param {{on?: boolean, vol?: number}} patch
   */
  setSound(id, { on, vol }) {
    const ch = this.channels.get(id);
    if (!ch) return;
    if (vol !== undefined) {
      ch.vol = vol;
      if (ch.gain) this._ramp(ch.gain.gain, toGain(vol), VOLUME_TAU);
    }
    if (on !== undefined && on !== ch.on) {
      ch.on = on;
      if (this.ctx) (on ? this._enable(ch) : this._disable(ch));
    }
  }

  /* ---------- internals ---------- */

  _createGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));

    // Safari 16.4+: route as media playback rather than ambient UI sound.
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* not supported */
    }

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.4;

    this._analyser = ctx.createAnalyser();
    this._analyser.fftSize = 2048;
    this._analyser.smoothingTimeConstant = 0.85;

    this.master.connect(comp).connect(this._analyser).connect(ctx.destination);

    for (const ch of this.channels.values()) {
      ch.gain = ctx.createGain();
      ch.gain.gain.value = toGain(ch.vol);
      ch.gain.connect(this.master);
    }

    // The OS can suspend audio on its own (phone call, iOS "interrupted"
    // state). Keep the UI honest when that happens.
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && this.playing) {
        this.playing = false;
        this._emit('state');
      }
    });
  }

  /** Smoothly moves an AudioParam to `value` without clicks. */
  _ramp(param, value, tau) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, tau);
  }

  async _enable(ch) {
    const token = ++ch.token; // stale calls from rapid toggling bail out below
    const buffer = await this._load(ch);
    if (!buffer || token !== ch.token || !ch.on || ch.source) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const fader = this.ctx.createGain();
    fader.gain.value = 0;
    source.connect(fader).connect(ch.gain);
    // A random start point means a restarted sound never opens on the same moment.
    source.start(0, Math.random() * buffer.duration);
    this._ramp(fader.gain, 1, TOGGLE_TAU);
    ch.source = source;
    ch.fader = fader;
  }

  _disable(ch) {
    ch.token++;
    const { source, fader } = ch;
    if (!source) return;
    ch.source = ch.fader = null;
    this._ramp(fader.gain, 0, TOGGLE_TAU);
    source.stop(this.ctx.currentTime + TOGGLE_TAU * 8);
    source.onended = () => {
      source.disconnect();
      fader.disconnect();
    };
  }

  /** Loads (once) the buffer for a channel: the real file, else a synth placeholder. */
  _load(ch) {
    if (!ch.loading) {
      ch.loading = this._fetchOrSynth(ch.def).then((buffer) => (ch.buffer = buffer));
    }
    return ch.loading;
  }

  async _fetchOrSynth(def) {
    this._status(def.id, 'loading');
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sounds/${def.file}`);
      // Dev servers answer unknown paths with index.html, so check the type.
      const type = res.headers.get('content-type') || '';
      if (res.ok && !type.includes('text/html')) {
        const decoded = await this.ctx.decodeAudioData(await res.arrayBuffer());
        const fade = def.loopCrossfade ?? Math.min(1, decoded.duration / 8);
        this._status(def.id, 'file');
        return makeSeamless(this.ctx, decoded, fade);
      }
    } catch (err) {
      console.info(`[lull] ${def.file} unavailable, using synthesized placeholder.`, err);
    }

    // Yield a frame so the UI can show "loading" before the CPU-bound render.
    await new Promise((r) => setTimeout(r, 16));
    const data = renderSynth(def.id);
    if (!data) {
      this._status(def.id, 'missing');
      return null;
    }
    const buffer = this.ctx.createBuffer(1, data.length, SYNTH_RATE);
    buffer.getChannelData(0).set(data);
    this._status(def.id, 'synth');
    return buffer;
  }

  _status(id, status) {
    this.dispatchEvent(new CustomEvent('status', { detail: { id, status } }));
  }

  _emit(type) {
    this.dispatchEvent(new Event(type));
  }
}
