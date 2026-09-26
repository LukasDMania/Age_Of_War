/**
 * Dev-only runtime switches read from the URL.
 *
 * `?headless`: nothing is drawn (hidden cameras, no HUD, no unit art sheets,
 * no effects), for fast automated matches (AI training, balance runs). The
 * simulation is identical.
 */
export const HEADLESS_SIM: boolean =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('headless');
