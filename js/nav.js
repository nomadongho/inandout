/**
 * nav.js
 * Tiny navigation indirection to break the circular dependency between
 * router.js (which imports screen builders) and screens.js (which needs
 * to trigger navigation).
 *
 * Usage:
 *   import { navigate } from './nav.js';  // anywhere that needs to navigate
 *   import { setNavigate } from './nav.js'; // called once by router.js
 */

let _navigateFn = (screen) => {
  console.warn('[nav] navigate called before router initialised:', screen);
};

/**
 * Navigate to a named screen.
 * @param {'home'|'sensor'|'explore'|'survive'} screen
 */
export function navigate(screen) {
  _navigateFn(screen);
}

/**
 * Register the real navigate implementation (called by router.js).
 * @param {Function} fn
 */
export function setNavigate(fn) {
  _navigateFn = fn;
}
