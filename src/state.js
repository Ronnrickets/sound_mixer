/**
 * Mix persistence. The mix is saved in localStorage and restored on return.
 *
 * Shape: { master: number, sounds: { [id]: { on: boolean, vol: number } } }
 * Volumes are 0–1. The playing/paused state is deliberately not saved:
 * browsers won't autoplay, so the user always presses play on return.
 */

const KEY = 'lull.mix.v1';

const clamp01 = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** First-visit mix: soft rain only, so the very first press of Play sounds good. */
export function defaultMix(sounds) {
  return {
    master: 0.8,
    sounds: Object.fromEntries(
      sounds.map(({ id }) => [id, { on: id === 'rain', vol: id === 'rain' ? 0.6 : 0.5 }]),
    ),
  };
}

/**
 * Returns the saved mix merged over the defaults. Unknown ids are dropped and
 * new sounds get defaults. The second value is false on a first visit.
 * @returns {[ReturnType<typeof defaultMix>, boolean]}
 */
export function loadMix(sounds) {
  const mix = defaultMix(sounds);
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    /* storage blocked or corrupt; fall back to defaults */
  }
  if (!saved || typeof saved !== 'object') return [mix, false];

  mix.master = clamp01(saved.master, mix.master);
  for (const id of Object.keys(mix.sounds)) {
    const s = saved.sounds?.[id];
    if (!s) continue;
    mix.sounds[id] = { on: Boolean(s.on), vol: clamp01(s.vol, mix.sounds[id].vol) };
  }
  return [mix, true];
}

let timer = 0;

function write(mix) {
  try {
    localStorage.setItem(KEY, JSON.stringify(mix));
  } catch {
    /* private mode / quota: the mix just won't persist */
  }
}

/**
 * Debounced save, so dragging a slider doesn't write on every input event.
 * Pass `{ now: true }` to write immediately (e.g. on pagehide).
 */
export function saveMix(mix, { now = false } = {}) {
  clearTimeout(timer);
  if (now) write(mix);
  else timer = setTimeout(() => write(mix), 250);
}
