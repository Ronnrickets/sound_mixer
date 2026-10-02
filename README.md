# Lull: ambient sound mixer

Lull is a calm landing page and a working ambient sound mixer. Users layer
rain, thunder, waves, wind, birds, stream, fire, night crickets and brown noise
into their own soundscape. Each sound has its own fader and loops seamlessly.
The mix is saved in the browser.

- **Landing page:** `/` ([index.html](index.html))
- **Mixer:** `/mixer` ([mixer.html](mixer.html))

## Stack: vanilla JS + Web Audio API, built with Vite

The app is one audio graph and nine controls. React would add a runtime and
re-render plumbing without improving reliability. The audio state lives in a
single `MixerEngine` class, so the UI layer stays thin. Vite provides a fast
dev server and a hashed, minified multi-page build. Vercel detects it with
zero configuration. There is no backend, there are no API keys, and the
only dependency is the Vite dev dependency.

## Project structure

```
├── index.html                 Landing page
├── mixer.html                 Mixer app
├── public/
│   ├── favicon.svg
│   └── sounds/                ← drop audio files here (see README inside)
├── src/
│   ├── sounds.manifest.json   Sound list: file name, source URL, license
│   ├── audio/
│   │   ├── engine.js          Web Audio graph: load, loop, fade, master, compressor
│   │   ├── seamless.js        Equal-power tail→head crossfade for click-free loops
│   │   └── synth.js           Synthesized placeholders used until real files exist
│   ├── state.js               localStorage persistence (debounced, validated)
│   ├── mixer.js               Mixer UI controller
│   ├── landing.js             Landing page: library list, reveals, hero visual
│   ├── motion.js              Reveal-on-scroll + reduced-motion helpers
│   ├── icons.js               Inline SVG icons
│   └── styles/                base.css (tokens), landing.css, mixer.css
├── vite.config.js             Multi-page build (index + mixer)
├── vercel.json                Build/output settings, clean URLs, cache headers
└── package.json
```

## Run locally

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5173  (mixer at /mixer)
npm run build      # production build into dist/
npm run preview    # serve the built dist/ locally
```

## Audio: placeholders and real recordings

The project ships **no audio files**. Instead, every sound has a
**synthesized placeholder**: `src/audio/synth.js` renders a short loop in the
browser the first time that sound is turned on. The app is fully usable out of
the box. Tiles that are using a placeholder show a **Synth** badge.

To use real recordings:

1. Find a **CC0 / public-domain** recording. Each entry in
   `src/sounds.manifest.json` has a `findAt` link to a Freesound search
   already filtered to CC0. Freesound needs a free account to download.
2. Save it as `public/sounds/<file>` using the expected name (`rain.mp3`,
   `waves.mp3`, …). MP3 or M4A, 30–120 s, with no fade-in or fade-out.
3. Fill in `source`, `author`, `license` and `licenseUrl` in the manifest,
   and set `"status": "recording"`. The mixer's **Sound credits** panel
   reads from the manifest.

The engine looks for the file first. If it is missing or can't be decoded,
the engine uses the placeholder. No code changes are needed.

### How seamless looping works

- Sounds play through `AudioBufferSourceNode` with `loop = true`, which is
  sample-accurate. `<audio loop>` leaves a gap in most browsers.
- `seamless.js` cross-fades the last ~1 s of each file into its start
  (equal-power), so the loop point has no click or texture jump. Set
  `"loopCrossfade": 0` in the manifest for files that already loop perfectly.
- Every on/off and volume change uses `setTargetAtTime`, so nothing ever jumps
  abruptly. Play and pause fade the master bus, then suspend the
  `AudioContext` to save CPU.
- A gentle `DynamicsCompressor` on the master bus prevents clipping when
  many channels are stacked at full volume.

### Autoplay

The `AudioContext` is created only inside a click or key handler. Until then,
the mixer shows a **"Sound stays off until you choose to start"** prompt.
Returning visitors see **"Resume your mix"**. Turning on any sound also
counts as the gesture.

## Accessibility

- Every control is a native `<button>` or `<input type="range">`. Sliders are
  labeled ("Rain volume") and announce `aria-valuetext` in percent. Toggles use
  `aria-pressed`. Playback status is an `aria-live` region.
- Keyboard: <kbd>Tab</kbd> between controls, <kbd>←</kbd>/<kbd>→</kbd> on
  sliders, <kbd>Space</kbd> or <kbd>Enter</kbd> on toggles, and
  <kbd>Space</kbd> anywhere else for play/pause.
- Text contrast: white and cream on black, near-black on cream, and secondary
  grey `#A1A1AA` at about 7.9:1 on black.
- `prefers-reduced-motion`: reveals, the hero waveform, the scope and the eq
  bars become static.

## Deploy to Vercel

The repo deploys as-is. `vercel.json` sets the framework (Vite), build command,
output directory (`dist`), clean URLs (`/mixer`), and cache headers.

**From the dashboard**

1. Push this folder to a GitHub, GitLab or Bitbucket repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Keep the detected settings (Framework: Vite, Build: `npm run build`,
   Output: `dist`). Click **Deploy**.

**From the CLI**

```bash
npm i -g vercel
vercel          # first run links the project and creates a preview deploy
vercel --prod   # production deploy
```

Audio files in `public/sounds/` are copied into the build as static assets.
After you add or replace a recording, commit it and redeploy.
