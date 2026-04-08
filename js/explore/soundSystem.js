/**
 * soundSystem.js
 * Sound event creation, propagation, and wall attenuation.
 *
 * A SoundEvent is a transient noise emitted from a grid position.
 * Each tick its age increments; watchers check its attenuated intensity.
 */

import { wallsOnSegment } from './geometry.js';

// ── Per-environment propagation parameters ────────────────────────────────────
const ENV = {
  //          distFalloff  wallAtten (per wall crossed)
  indoor:  { distFalloff: 0.055, wallAtten: 0.38 },
  outdoor: { distFalloff: 0.095, wallAtten: 0.60 },
};

// How many game ticks a sound event lives
const MAX_AGE_TICKS = 28;

// Auto-incrementing id for debugging / pruning
let _nextId = 0;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new sound event.
 *
 * @param {number} x         Grid x of the sound source
 * @param {number} y         Grid y
 * @param {number} intensity 0–100
 * @param {'footstep'|'stumble'|'burst'} [type]
 * @returns {SoundEvent}
 */
export function createSoundEvent(x, y, intensity, type = 'footstep') {
  return {
    id:      _nextId++,
    x,
    y,
    intensity,
    type,
    age:     0,
    maxAge:  MAX_AGE_TICKS,
    expired: false,
  };
}

// ── Tick update ───────────────────────────────────────────────────────────────

/**
 * Advance all sound events by one tick, marking expired ones.
 * Call once per game tick.
 * @param {SoundEvent[]} events
 */
export function tickSoundEvents(events) {
  for (const ev of events) {
    ev.age++;
    if (ev.age >= ev.maxAge) ev.expired = true;
  }
}

/**
 * Remove expired events from the array in-place.
 * @param {SoundEvent[]} events
 */
export function pruneExpiredEvents(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].expired) events.splice(i, 1);
  }
}

// ── Propagation ───────────────────────────────────────────────────────────────

/**
 * Compute the sound intensity that reaches position (wx, wy).
 * Applies distance falloff, wall occlusion, and age fade.
 *
 * @param {SoundEvent} event
 * @param {number}  wx      Watcher (listener) x
 * @param {number}  wy      Watcher y
 * @param {Array<{x,y,w,h}>} walls
 * @param {boolean} indoor
 * @returns {number}  0–100
 */
export function soundIntensityAt(event, wx, wy, walls, indoor) {
  const dx   = wx - event.x;
  const dy   = wy - event.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.01) return event.intensity;

  const { distFalloff, wallAtten } = ENV[indoor ? 'indoor' : 'outdoor'];

  // Exponential distance decay
  const distDecay = Math.exp(-dist * distFalloff);

  // Wall occlusion — each wall reduces intensity
  const wallCount = wallsOnSegment(event.x, event.y, wx, wy, walls);
  const wallDecay = Math.pow(wallAtten, wallCount);

  // Linear age fade
  const ageFade = 1 - event.age / event.maxAge;

  return event.intensity * distDecay * wallDecay * ageFade;
}
