import './styles/base.css';
import './styles/mixer.css';
import manifest from './sounds.manifest.json';
import { MixerEngine } from './audio/engine.js';
import { loadMix, saveMix } from './state.js';
import { icon } from './icons.js';
import { observeReveals, prefersReducedMotion } from './motion.js';

const sounds = manifest.sounds;
const byId = new Map(sounds.map((s) => [s.id, s]));
const [mix, returning] = loadMix(sounds);
const engine = new MixerEngine(sounds);

const $ = (id) => document.getElementById(id);
const ui = {
  play: $('play'),
  status: $('status'),
  nowPlaying: $('now-playing'),
  master: $('master'),
  masterOut: $('master-out'),
  allOff: $('all-off'),
  gate: $('gate'),
  gateText: $('gate-text'),
  begin: $('begin'),
  beginLabel: $('begin-label'),
  channels: $('channels'),
  credits: $('credits-rows'),
  scope: $('scope'),
};

const pct = (v) => Math.round(v * 100);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* ---------- Render channel tiles ---------- */

ui.channels.innerHTML = sounds
  .map(
    (s) => `
  <li class="channel" data-id="${esc(s.id)}" data-on="false">
    <div class="channel-top">
      <button class="channel-toggle" type="button" aria-pressed="false" aria-describedby="desc-${esc(s.id)}">
        <span class="icon-wrap">${icon(s.id)}</span>
        <span class="channel-text">
          <span class="channel-name">${esc(s.label)}</span>
          <span class="channel-state label" aria-hidden="true">Off</span>
        </span>
      </button>
      <div class="channel-meta">
        <span class="badge" title="Synthesized placeholder. Add /sounds/${esc(s.file)} to use a real recording.">Synth<span class="visually-hidden"> placeholder</span></span>
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <output class="readout" for="vol-${esc(s.id)}" aria-hidden="true"></output>
      </div>
    </div>
    <span id="desc-${esc(s.id)}" class="visually-hidden">${esc(s.description)}</span>
    <input id="vol-${esc(s.id)}" class="range" type="range" min="0" max="100" step="1" aria-label="${esc(s.label)} volume" />
  </li>`,
  )
  .join('');

/** @type {Map<string, {li: HTMLElement, toggle: HTMLButtonElement, state: HTMLElement, range: HTMLInputElement, out: HTMLOutputElement}>} */
const tiles = new Map();
for (const li of ui.channels.children) {
  tiles.set(li.dataset.id, {
    li,
    toggle: li.querySelector('.channel-toggle'),
    state: li.querySelector('.channel-state'),
    range: li.querySelector('.range'),
    out: li.querySelector('.readout'),
  });
}

/* ---------- View sync ---------- */

function setRange(input, value) {
  input.value = String(pct(value));
  input.style.setProperty('--fill', `${pct(value)}%`);
  input.setAttribute('aria-valuetext', `${pct(value)} percent`);
}

function renderTile(id) {
  const { on, vol } = mix.sounds[id];
  const t = tiles.get(id);
  t.li.dataset.on = String(on);
  t.toggle.setAttribute('aria-pressed', String(on));
  t.state.textContent = on ? 'On' : 'Off';
  t.out.textContent = pct(vol);
  setRange(t.range, vol);
}

function renderTransport() {
  const active = sounds.filter((s) => mix.sounds[s.id].on);
  document.body.classList.toggle('is-playing', engine.playing);
  ui.play.setAttribute('aria-label', engine.playing ? 'Pause' : 'Play');
  ui.status.textContent = engine.playing
    ? `Playing · ${active.length} ${active.length === 1 ? 'sound' : 'sounds'}`
    : 'Paused';
  ui.nowPlaying.textContent = active.length ? active.map((s) => s.label).join(' · ') : 'No sounds selected';
  ui.allOff.disabled = active.length === 0;
}

function renderMaster() {
  setRange(ui.master, mix.master);
  ui.masterOut.textContent = pct(mix.master);
}

/* ---------- Actions ---------- */

function setOn(id, on) {
  mix.sounds[id].on = on;
  engine.setSound(id, { on });
  renderTile(id);
  renderTransport();
  saveMix(mix);
}

function setVolume(id, vol) {
  mix.sounds[id].vol = vol;
  engine.setSound(id, { vol });
  // Raising the fader of a silent sound brings it in, as on a hardware mixer.
  if (vol > 0 && !mix.sounds[id].on) setOn(id, true);
  else renderTile(id);
  saveMix(mix);
}

/** Starts playback. Called only from user gestures (autoplay policy). */
function play() {
  // Pressing play with nothing selected would feel broken, so bring in rain.
  if (!sounds.some((s) => mix.sounds[s.id].on)) setOn(sounds[0].id, true);
  engine.start();
  dismissGate();
}

function dismissGate() {
  if (ui.gate.hidden) return;
  const hadFocus = ui.gate.contains(document.activeElement);
  ui.gate.classList.add('is-leaving');
  const done = () => {
    ui.gate.hidden = true;
    // Don't strand keyboard focus on a removed element.
    if (hadFocus) ui.play.focus();
  };
  if (prefersReducedMotion().matches) done();
  else setTimeout(done, 500);
}

/* ---------- Wire up events ---------- */

for (const [id, t] of tiles) {
  t.toggle.addEventListener('click', () => {
    const on = !mix.sounds[id].on;
    setOn(id, on);
    // Choosing a sound is a clear intent to listen, so start if paused.
    if (on && !engine.playing) play();
  });
  t.range.addEventListener('input', () => setVolume(id, t.range.valueAsNumber / 100));
}

ui.play.addEventListener('click', () => (engine.playing ? engine.pause() : play()));
ui.begin.addEventListener('click', play);

ui.master.addEventListener('input', () => {
  mix.master = ui.master.valueAsNumber / 100;
  engine.setMaster(mix.master);
  renderMaster();
  saveMix(mix);
});

ui.allOff.addEventListener('click', () => {
  for (const s of sounds) if (mix.sounds[s.id].on) setOn(s.id, false);
  engine.pause();
});

// Space toggles playback, except where Space already means something.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = /** @type {HTMLElement} */ (e.target);
  if (el.closest('button, a, summary, textarea, select, [contenteditable]')) return;
  if (el instanceof HTMLInputElement && el.type !== 'range') return;
  e.preventDefault();
  engine.playing ? engine.pause() : play();
});

engine.addEventListener('state', renderTransport);
engine.addEventListener('status', (e) => {
  const { id, status } = e.detail;
  const t = tiles.get(id);
  if (t) t.li.dataset.status = status;
  renderCredits();
});

window.addEventListener('pagehide', () => saveMix(mix, { now: true }));

/* ---------- Credits (from the manifest) ---------- */

const loaded = new Map(); // id -> "file" | "synth" once known
engine.addEventListener('status', (e) => loaded.set(e.detail.id, e.detail.status));

function renderCredits() {
  ui.credits.innerHTML = sounds
    .map((s) => {
      const isSynth = loaded.get(s.id) === 'synth' || (!loaded.has(s.id) && s.status !== 'recording');
      const source = s.source
        ? `<a href="${esc(s.source)}" target="_blank" rel="noopener noreferrer">${esc(s.author || 'Original recording')}</a>`
        : isSynth
          ? `Synthesized placeholder. Add <code>/sounds/${esc(s.file)}</code>`
          : esc(s.author || '—');
      const license = s.license
        ? s.licenseUrl
          ? `<a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.license)}</a>`
          : esc(s.license)
        : isSynth
          ? 'Generated in browser'
          : '—';
      return `<tr><td>${esc(s.label)}</td><td>${source}</td><td>${license}</td></tr>`;
    })
    .join('');
}

/* ---------- Scope: live waveform of the mix ---------- */

function startScope(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = prefersReducedMotion();
  let data = null, raf = 0, w = 0, h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIdle();
  }

  function line(points) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(242, 234, 211, 0.85)';
    ctx.beginPath();
    points.forEach((y, i) => {
      const x = (i / (points.length - 1)) * w;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function drawIdle() {
    if (w) line([h / 2, h / 2]);
  }

  function frame() {
    const analyser = engine.analyser;
    if (!analyser) return;
    data ??= new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    const step = 8;
    const pts = [];
    for (let i = 0; i < data.length; i += step) pts.push(h / 2 + data[i] * h * 1.6);
    line(pts);
    raf = requestAnimationFrame(frame);
  }

  function update() {
    cancelAnimationFrame(raf);
    const visible = canvas.offsetParent !== null && !document.hidden;
    if (engine.playing && visible && !reduced.matches) raf = requestAnimationFrame(frame);
    else drawIdle();
  }

  new ResizeObserver(resize).observe(canvas);
  engine.addEventListener('state', update);
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener?.('change', update);
}

/* ---------- Init ---------- */

for (const id of tiles.keys()) renderTile(id);
renderMaster();
renderTransport();
renderCredits();
startScope(ui.scope);
observeReveals();

if (returning) {
  const active = sounds.filter((s) => mix.sounds[s.id].on).map((s) => byId.get(s.id).label);
  ui.beginLabel.textContent = 'Resume your mix';
  if (active.length) {
    ui.gateText.textContent = `Welcome back. Your mix of ${active.join(', ')} is ready. Press Resume when you are, and it will fade in gently.`;
  }
}
