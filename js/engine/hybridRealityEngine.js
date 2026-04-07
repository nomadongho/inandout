/**
 * hybridRealityEngine.js
 * Top-level engine that wires together all three layers:
 *
 *  Layer 1: Raw inputs   — environmentReader + deviceReader
 *  Layer 2: Interpreter  — converts raw → derived
 *  Layer 3: Mode layer   — exploreMode / surviveMode consume derived
 *
 * Usage:
 *   import engine from './hybridRealityEngine.js';
 *   engine.start();                  // begin polling
 *   engine.stop();                   // halt polling
 *   engine.setFallback(key, value);  // push a manual slider value
 *   engine.currentState              // live snapshot: raw inputs + derived values
 */

import { micReader, lightReader } from './environmentReader.js';
import { batteryReader, motionReader, timeReader, keyboardTilt } from './deviceReader.js';
import { updateDerived } from './interpreter.js';
import { sensorRaw, derived } from '../state.js';
import { clamp, smooth } from '../utils.js';

// How many times per second we update the engine
const TICK_RATE_HZ = 10;

// Per-sensor smoothing factors applied in each tick (alpha: 0 = frozen, 1 = instant).
// Tune these to balance responsiveness against noise suppression.
const SMOOTH = {
  noise:   0.2,   // mic responds moderately fast
  light:   0.1,   // ambient light changes slowly
  tilt:    0.25,  // motion responds quickly for game feel
  battery: 0.05,  // battery barely changes; very gentle smoothing
};

/**
 * Manual override / fallback values.
 * When a real sensor is unavailable the UI writes here via setFallback().
 */
const fallback = {
  noiseLevel:      50,
  ambientLight:    50,
  batteryLevel:    80,
  brightnessLevel: 70,
};

/** Whether each source is using the real sensor (true) or fallback (false). */
const usingSensor = {
  noise:   false,
  light:   false,
  battery: false,
  motion:  false,
};

let _intervalId = null;

/** Start all sensors then begin the tick loop. */
async function start() {
  // Start light and battery immediately (no user gesture needed)
  await Promise.all([
    startLight(),
    startBattery(),
  ]);

  // Detect mic and motion support; set initial status without requesting permission.
  // Actual permission is requested only when the user taps "Enable Sensors".
  startMicDetect();
  await startMotionDetect();

  // Desktop / non-iOS fallback: start keyboard tilt simulation unless motion already active
  if (!usingSensor.motion) {
    keyboardTilt.start();
  }

  // Start the main engine tick
  if (_intervalId === null) {
    _intervalId = setInterval(_tick, 1000 / TICK_RATE_HZ);
  }
}

/**
 * Request microphone and motion permissions.
 * MUST be called from a user gesture (button click) — never called automatically.
 * Motion is requested first so that DeviceOrientationEvent.requestPermission()
 * (iOS 13+) is called before getUserMedia(), which would otherwise consume the
 * iOS user-activation token and cause motion permission to be silently denied
 * without showing a popup.
 */
async function enableSensors() {
  // Motion must be kicked off first: DeviceOrientationEvent.requestPermission()
  // (iOS 13+) consumes the user-activation token on the way in, so it must run
  // before getUserMedia() (mic) which also consumes that same token.
  // Both are still initiated synchronously (no await in between) so both fire
  // within the same user-gesture call stack.
  const motionPromise = motionReader.requestPermissionAndStart();
  const micPromise    = micReader.requestPermissionAndStart();
  await Promise.all([micPromise, motionPromise]);

  usingSensor.noise  = micReader.status  === 'active';
  usingSensor.motion = motionReader.status === 'active';

  // If motion is now active, keyboard simulation is no longer needed
  if (usingSensor.motion) {
    keyboardTilt.stop();
  }
}

/** Stop all sensors and the tick loop. */
function stop() {
  micReader.stop();
  lightReader.stop();
  batteryReader.stop();
  motionReader.stop();
  keyboardTilt.stop();
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

/** Update a fallback slider value (called from UI). */
function setFallback(key, value) {
  if (key in fallback) {
    fallback[key] = clamp(Number(value), 0, 100);
  }
}

/** Read current fallback values (for UI to display). */
function getFallback(key) {
  return fallback[key] ?? 0;
}

/** Expose sensor statuses so the sensor-test screen can render them. */
function getSensorStatus() {
  return {
    noise:   micReader.status,
    light:   lightReader.status,
    battery: batteryReader.status,
    motion:  motionReader.status,
  };
}

// ─── Internal ────────────────────────────────────────────────────────────────

/** Detect mic support and set initial status — no permission requested yet. */
function startMicDetect() {
  micReader.start();
  usingSensor.noise = micReader.status === 'active';
}

async function startLight() {
  await lightReader.start();
  usingSensor.light = lightReader.status === 'active';
}

async function startBattery() {
  await batteryReader.start();
  usingSensor.battery = batteryReader.status === 'active';
}

/** Detect motion support and set initial status — on iOS does not request permission. */
async function startMotionDetect() {
  await motionReader.start();
  usingSensor.motion = motionReader.status === 'active';
}

/** Called TICK_RATE_HZ times per second — aggregates raw values then runs interpreter. */
function _tick() {
  // ── Noise: use ring-buffered mic value or fallback slider ──────────────────
  sensorRaw.noiseLevel = usingSensor.noise
    ? smooth(sensorRaw.noiseLevel, micReader.value, SMOOTH.noise)
    : fallback.noiseLevel;

  // ── Ambient light: use smoothed sensor value or fallback slider ────────────
  sensorRaw.ambientLight = usingSensor.light
    ? smooth(sensorRaw.ambientLight, lightReader.value, SMOOTH.light)
    : fallback.ambientLight;

  // ── Tilt: deadzoned device orientation or keyboard simulation ──────────────
  // motionReader.tiltX/Y are already deadzoned (-1 to 1); smooth further here
  sensorRaw.tiltX = smooth(sensorRaw.tiltX, motionReader.tiltX, SMOOTH.tilt);
  sensorRaw.tiltY = smooth(sensorRaw.tiltY, motionReader.tiltY, SMOOTH.tilt);

  // ── Battery: real API or fallback; gently smoothed (changes very slowly) ───
  const batteryTarget = usingSensor.battery ? batteryReader.value : fallback.batteryLevel;
  sensorRaw.batteryLevel = smooth(sensorRaw.batteryLevel, batteryTarget, SMOOTH.battery);

  // ── Brightness: always an in-app preference controlled via setFallback() ───
  sensorRaw.brightnessLevel = fallback.brightnessLevel;

  // ── Time of day: directly from system clock ────────────────────────────────
  sensorRaw.hour = timeReader.hour;

  // ── Run the interpretation layer to update derived values ──────────────────
  updateDerived();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a clean snapshot that bundles everything modes need in one place.
 * Modes can read `engine.currentState` instead of importing state.js directly.
 * Both raw sensor inputs and interpreter-derived values are included.
 *
 * @returns {{ raw: object, derived: object, usingSensor: object, sensorStatus: object }}
 */
function _getCurrentState() {
  return {
    raw:          { ...sensorRaw },      // raw sensor inputs (0–100 or -1–1 for tilt)
    derived:      { ...derived },        // interpreted game-state values (0–100 each)
    usingSensor:  { ...usingSensor },    // true = real hardware, false = fallback
    sensorStatus: getSensorStatus(),     // human-readable reader status strings
  };
}

const engine = {
  start,
  stop,
  enableSensors,
  setFallback,
  getFallback,
  getSensorStatus,
  /** Live snapshot of raw inputs + derived values for easy mode consumption. */
  get currentState() { return _getCurrentState(); },
  /** Expose usingSensor flags */
  get usingSensor() { return { ...usingSensor }; },
};

export default engine;
