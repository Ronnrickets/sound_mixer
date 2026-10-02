# /public/sounds

Put the real audio recordings in this folder. Every file is listed in
[`src/sounds.manifest.json`](../../src/sounds.manifest.json).

| id        | Expected file   |
| --------- | --------------- |
| rain      | `rain.mp3`      |
| thunder   | `thunder.mp3`   |
| waves     | `waves.mp3`     |
| wind      | `wind.mp3`      |
| birds     | `birds.mp3`     |
| stream    | `stream.mp3`    |
| fire      | `fire.mp3`      |
| night     | `night.mp3`     |
| noise     | `noise.mp3`     |

## Until real files are added

If a file is missing or can't be decoded, the mixer plays a **synthesized
placeholder** for that channel. It is generated in the browser by
`src/audio/synth.js`, and its tile shows a "Synth" badge. Nothing breaks
while files are missing.

## Adding a recording

1. Download a **CC0 / public-domain** recording. Each manifest entry has a
   `findAt` link to a Freesound search already filtered to CC0.
2. Trim it to 30–120 s of steady sound, with no fades at the start or end.
   Export it as MP3 (128–192 kbps) or M4A. Both decode in every modern browser.
3. Save it here under the expected file name.
4. In `src/sounds.manifest.json`, set `source`, `author`, `license`
   (e.g. `"CC0 1.0"`), and `licenseUrl`, then change `status` to `"recording"`.

The engine makes the loop seamless automatically. It cross-fades the last
second of the file into its start, so there is no gap or click at the loop
point. To skip that step for a file that already loops perfectly, add
`"loopCrossfade": 0` to its manifest entry.
