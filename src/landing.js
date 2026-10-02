import './styles/base.css';
import './styles/landing.css';
import manifest from './sounds.manifest.json';
import { icon } from './icons.js';
import { observeReveals, prefersReducedMotion } from './motion.js';

/* ---------- Sound library (rendered from the manifest) ---------- */

const list = document.getElementById('library-list');
list.innerHTML = manifest.sounds
  .map(
    (s, i) => `
    <li class="reveal" style="--i:${i % 3}">
      <span class="icon-wrap">${icon(s.id)}</span>
      <div><h3>${s.label}</h3><p>${s.description}</p></div>
    </li>`,
  )
  .join('');

observeReveals();

/* ---------- Hero "live mix" waveform ---------- */

const canvas = document.querySelector('.scape');
if (canvas) heroScape(canvas);

/**
 * Four layered, slowly drifting traces, one per sound in the panel below.
 * This is an ambient supporting layer: it pauses off-screen and in hidden
 * tabs, and draws a single still frame under reduced motion.
 */
function heroScape(el) {
  const ctx = el.getContext('2d');
  let w = 0, h = 0, raf = 0, visible = true;

  const cream = (a) => `rgba(242, 234, 211, ${a})`;

  // Each trace maps x (px) and t (s) to a vertical offset in units of h.
  const layers = [
    // Thunder: slow, wide swell
    { alpha: 0.22, width: 1, fn: (x, t) => 0.2 * Math.sin(x * 0.004 - t * 0.25) * Math.sin(x * 0.017 + t * 0.4) },
    // Waves: broad sine
    { alpha: 0.9, width: 1.6, fn: (x, t) => 0.24 * Math.sin(x * 0.011 + t * 0.55) * (0.75 + 0.25 * Math.sin(x * 0.003 - t * 0.2)) },
    // Rain: fine, busy texture
    { alpha: 0.35, width: 1, fn: (x, t) => 0.045 * (Math.sin(x * 0.21 + t * 3.1) + Math.sin(x * 0.37 - t * 2.3) + Math.sin(x * 0.83 + t * 4.7) * 0.6) },
    // Birds: drifting chirp bursts
    {
      alpha: 0.6,
      width: 1.2,
      fn: (x, t) => {
        let y = 0;
        for (const [speed, phase] of [[38, 0], [27, 260], [46, 520]]) {
          const pos = ((t * speed + phase) % (w + 200)) - 100;
          y += 0.16 * Math.exp(-(((x - pos) / 14) ** 2)) * Math.sin(x * 0.75);
        }
        return y;
      },
    },
  ];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = el.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);

    // Chart grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(39, 39, 42, 0.9)';
    ctx.beginPath();
    for (let gx = 0; gx <= w; gx += w / 8) {
      ctx.moveTo(Math.round(gx) + 0.5, 0);
      ctx.lineTo(Math.round(gx) + 0.5, h);
    }
    for (const gy of [0.25, 0.5, 0.75]) {
      ctx.moveTo(0, Math.round(h * gy) + 0.5);
      ctx.lineTo(w, Math.round(h * gy) + 0.5);
    }
    ctx.stroke();

    // Traces
    const mid = h / 2;
    for (const layer of layers) {
      ctx.beginPath();
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = cream(layer.alpha);
      for (let x = 0; x <= w; x += 2) {
        const y = mid + layer.fn(x, t) * h;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Drifting playhead
    const px = ((t * 24) % w) | 0;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, cream(0));
    grad.addColorStop(0.5, cream(0.55));
    grad.addColorStop(1, cream(0));
    ctx.fillStyle = grad;
    ctx.fillRect(px, 0, 1, h);
  }

  const reduced = prefersReducedMotion();
  const start = performance.now() - 4000;

  function frame(now) {
    draw((now - start) / 1000);
    raf = requestAnimationFrame(frame);
  }

  function run() {
    cancelAnimationFrame(raf);
    if (reduced.matches) draw(6);
    else if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  resize();
  run();

  new ResizeObserver(() => {
    resize();
    if (reduced.matches) draw(6);
  }).observe(el);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    run();
  }).observe(el);

  document.addEventListener('visibilitychange', run);
  reduced.addEventListener?.('change', run);
}
