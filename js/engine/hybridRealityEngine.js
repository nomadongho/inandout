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
 *   engine.start();          // begin polling
 *   engine.stop();           // halt polling
 *   engine.setFallback(key, value); // push a manual slider value
 */

import { micReader, lightReader } from './environmentReader.js';
import { batteryReader, motionReader, timeReader, keyboardTilt } from './deviceReader.js';
import { updateDerived } from './interpreter.js';
import { sensorRaw } from '../state.js';
import { clamp, smooth } from '../utils.js';

// How many times per second we update the engine
const TICK_RATE_HZ = 10;

/**
 * Manual override / fallback values.
 * When a real sensor is unavailable the UI writes here.
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
  // Attempt to start real sensors; they update usingSensor flags below
  await Promise.all([
    startMic(),
    startLight(),
    startBattery(),
    startMotion(),
  ]);

  // Desktop fallback: keyboard tilt simulation
  if (!usingSensor.motion) {
    keyboardTilt.start();
  }

  // Start the main engine tick
  if (_intervalId === null) {
    _intervalId = setInterval(_tick, 1000 / TICK_RATE_HZ);
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

async function startMic() {
  await micReader.start();
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

async function startMotion() {
  await motionReader.start();
  usingSensor.motion = motionReader.status === 'active';
}

/** Called TICK_RATE_HZ times per second — aggregates raw values. */
function _tick() {
  // Noise
  sensorRaw.noiseLevel = usingSensor.noise
    ? smooth(sensorRaw.noiseLevel, micReader.value, 0.2)
    : fallback.noiseLevel;

  // Ambient light
  sensorRaw.ambientLight = usingSensor.light
    ? smooth(sensorRaw.ambientLight, lightReader.value, 0.1)
    : fallback.ambientLight;

  // Tilt — real or keyboard simulation
  sensorRaw.tiltX = smooth(sensorRaw.tiltX, motionReader.tiltX, 0.25);
  sensorRaw.tiltY = smooth(sensorRaw.tiltY, motionReader.tiltY, 0.25);

  // Battery
  sensorRaw.batteryLevel = usingSensor.battery
    ? batteryReader.value
    : fallback.batteryLevel;

  // Brightness (always an in-app preference)
  sensorRaw.brightnessLevel = fallback.brightnessLevel;

  // Time of day
  sensorRaw.hour = timeReader.hour;

  // Run the interpretation layer
  updateDerived();
}

// Public API
const engine = {
  start,
  stop,
  setFallback,
  getFallback,
  getSensorStatus,
  /** Expose usingSensor flags */
  get usingSensor() { return { ...usingSensor }; },
};

export default engine;
