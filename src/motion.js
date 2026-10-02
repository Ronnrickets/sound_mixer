/** Shared motion helpers. */

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Adds `.is-visible` to `.reveal` / `.reveal-group` elements as they scroll
 * into view (staggered entrances and masked headline reveals). Under reduced
 * motion the CSS already shows everything, so the class is applied at once.
 */
export function observeReveals(root = document) {
  const targets = root.querySelectorAll('.reveal, .reveal-group');
  if (prefersReducedMotion().matches || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  targets.forEach((el) => io.observe(el));
}
