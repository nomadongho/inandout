/**
 * state.js
 * Central, in-memory application state.
 *
 * Split into:
 *  - sensorRaw:   live sensor readings (0–100 / -1–1 for tilt)
 *  - derived:     Hybrid Reality Engine output
 *  - exploreRun:  state for the current Explore run (reset each run)
 *  - survive:     persistent Survive Mode state (saved to localStorage)
 *  - ui:          transient UI state (current screen, paused, etc.)
 */

/** @type {SensorRaw} */
export const sensorRaw = {
  noiseLevel:    0,   // 0–100
  ambientLight:  50,  // 0–100
  tiltX:         0,   // -1 to 1
  tiltY:         0,   // -1 to 1
  batteryLevel:  80,  // 0–100
  brightnessLevel: 70, // 0–100 (in-app preference)
  hour:          12,  // 0–23
};

/** @type {DerivedState} */
export const derived = {
  visibility:      50, // 0–100  how well the player can see
  exposure:        50, // 0–100  how visible the player is to threats
  stealth:         50, // 0–100  how hidden the player is
  stability:       50, // 0–100  physical steadiness
  energyModifier:  50, // 0–100  multiplier on energy actions
  threatLevel:     50, // 0–100  overall threat in the environment
};

/**
 * Mutable explore-run state — reset via resetExploreRun().
 * @type {ExploreRun}
 */
export const exploreRun = {
  active:         false,
  paused:         false,
  score:          0,
  elapsed:        0,       // seconds
  energy:         100,
  danger:         0,       // 0–100 danger pressure meter
  log:            [],      // {msg, type, time}[]
  enemies:        [],      // enemy objects with detection radii
  summary:        null,    // populated on endRun
  // Real-time gameplay state
  player:         { x: 50, y: 50 }, // grid position 0–100
  escapePoint:    { x: 15, y: 15 }, // target to reach for win
  escaped:        false,            // win condition reached
  inStealthMode:  false,            // silence-based ghost mode
  shadowCoverage: 0,                // 0–1: how deep in shadow the player is
  isDetected:           false,       // true this tick if an enemy spotted player
  stealthTimerSec:      0,           // seconds of consecutive silence
  playerDetectionRadius: 0,          // 0–30 grid units: current player exposure size
};

/**
 * Default survive state.  Overwritten from localStorage on load.
 * @type {SurviveState}
 */
export const survive = {
  day:           1,
  resources:     50,  // food / supplies 0–100
  stress:        20,  // 0–100
  health:        80,  // 0–100
  shelterEnergy: 60,  // 0–100
  log:           [],  // string[]
  bestDays:      0,   // highest day reached across all runs
  actionsToday:  0,   // actions taken this day (resets on Next Day)
  lastAction:    null, // key of the most recent action this day (for repeat penalty)
};

/** Transient UI flags */
export const ui = {
  currentScreen: 'home',  // 'home' | 'sensor' | 'explore' | 'survive'
};

/** Reset explore run to initial values. */
export function resetExploreRun() {
  exploreRun.active         = false;
  exploreRun.paused         = false;
  exploreRun.score          = 0;
  exploreRun.elapsed        = 0;
  exploreRun.energy         = 100;
  exploreRun.danger         = 0;
  exploreRun.log            = [];
  exploreRun.enemies        = [];
  exploreRun.summary        = null;
  exploreRun.player         = { x: 50, y: 50 };
  exploreRun.escapePoint    = { x: 15, y: 15 };
  exploreRun.escaped        = false;
  exploreRun.inStealthMode  = false;
  exploreRun.shadowCoverage = 0;
  exploreRun.isDetected         = false;
  exploreRun.stealthTimerSec    = 0;
  exploreRun.playerDetectionRadius = 0;
}

/** Reset survive state to fresh values (new game). */
export function resetSurvive() {
  survive.day           = 1;
  survive.resources     = 50;
  survive.stress        = 20;
  survive.health        = 80;
  survive.shelterEnergy = 60;
  survive.log           = [];
}
