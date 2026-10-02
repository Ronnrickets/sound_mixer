/** Inline line icons (24×24, stroked with currentColor). Decorative: aria-hidden. */

const CLOUD = '<path d="M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.6 8 3.5 3.5 0 0 1 17 15"/>';

const paths = {
  rain: `${CLOUD}<path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>`,
  thunder: `${CLOUD}<path d="M12.5 13l-2.5 4h3.5l-2.5 4"/>`,
  waves:
    '<path d="M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h6"/>',
  birds: '<path d="M2.5 11c1.8-2 3.7-2 5.5 0 1.8-2 3.7-2 5.5 0"/><path d="M12 16c1.4-1.5 2.8-1.5 4.2 0 1.4-1.5 2.8-1.5 4.3 0"/>',
  stream: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  fire: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.5 2 3 .5-3-1-5.5.5-8z"/>',
  night: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/><path d="M17 4v3M15.5 5.5h3"/>',
  noise: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
};

const fallback = '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>';

export function icon(id, size = 24) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[id] ?? fallback}</svg>`;
}
