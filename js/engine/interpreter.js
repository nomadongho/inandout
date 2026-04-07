/**
 * interpreter.js
 * Converts raw sensor readings into derived game states.
 *
 * Inputs  (sensorRaw):
 *   noiseLevel    0–100
 *   ambientLight  0–100
 *   tiltX         -1 to 1
 *   tiltY         -1 to 1
 *   batteryLevel  0–100
 *   brightnessLevel 0–100
 *   hour          0–23
 *
 * Outputs (derived):
 *   visibility      0–100  — how well the player can see
 *   exposure        0–100  — how visible the player is to threats
 *   stealth         0–100  — how hidden the player is
 *   stability       0–100  — physical steadiness (affects penalties)
 *   energyModifier  0–100  — multiplier on energy-consuming actions
 *   threatLevel     0–100  — composite environmental danger
 *
 * Values are smoothed frame-to-frame so they never jump wildly.
 */

import { clamp, lerp } from '../utils.js';
import { sensorRaw, derived } from '../state.js';

// Smoothing factor: higher = faster response, lower = more lag
const ALPHA = 0.12;

/**
 * Compute target derived values from the current sensorRaw snapshot,
 * then smooth them into the live `derived` object.
 *
 * Call this every game tick (e.g. ~10 Hz is fine).
 */
export function updateDerived() {
  const {
    noiseLevel, ambientLight, tiltX, tiltY,
    batteryLevel, brightnessLevel, hour,
  } = sensorRaw;

  // ── Visibility ────────────────────────────────────────────────────────────
  // Good at midday, hurt by darkness AND low player brightness.
  const dayBonus    = hour >= 6 && hour <= 18 ? 30 : 0;
  const lightBonus  = ambientLight * 0.4;
  const brightBonus = brightnessLevel * 0.3;
  const targetVisibility = clamp(dayBonus + lightBonus + brightBonus, 0, 100);

  // ── Exposure ──────────────────────────────────────────────────────────────
  // High noise + high light + daytime = player is exposed.
  const noiseExpose   = noiseLevel * 0.4;
  const lightExpose   = ambientLight * 0.3;
  const dayExpose     = hour >= 8 && hour <= 18 ? 20 : 0;
  const brightExpose  = brightnessLevel * 0.1;
  const targetExposure = clamp(noiseExpose + lightExpose + dayExpose + brightExpose, 0, 100);

  // ── Stealth ────────────────────────────────────────────────────────────────
  // Inverse of exposure, but also benefits from being still and quiet.
  const noisePenalty   = noiseLevel * 0.5;
  const tiltPenalty    = (Math.abs(tiltX) + Math.abs(tiltY)) * 15; // 0–30
  const darkBonus2     = (100 - ambientLight) * 0.2;
  const targetStealth  = clamp(100 - noisePenalty - tiltPenalty + darkBonus2, 0, 100);

  // ── Stability ─────────────────────────────────────────────────────────────
  // Low tilt = stable.  High tilt = unstable.
  const tiltMag        = Math.sqrt(tiltX * tiltX + tiltY * tiltY); // 0–√2 ≈ 1.41
  const targetStability = clamp(100 - tiltMag * 70, 0, 100);

  // ── Energy Modifier ────────────────────────────────────────────────────────
  // Battery % is the main driver.  Low battery = poor energy recovery.
  const batteryFactor  = batteryLevel * 0.6;
  const stressFactor   = (100 - noiseLevel) * 0.2; // quiet = calmer
  const restFactor     = (hour >= 22 || hour <= 5) ? 20 : 0; // nighttime rest bonus
  const targetEnergy   = clamp(batteryFactor + stressFactor + restFactor, 0, 100);

  // ── Threat Level ──────────────────────────────────────────────────────────
  // High noise + bright + low stealth.
  const noiseThreat  = noiseLevel * 0.35;
  const lightThreat  = ambientLight * 0.25;
  const stealthBonus = (100 - targetStealth) * 0.2;
  const targetThreat = clamp(noiseThreat + lightThreat + stealthBonus, 0, 100);

  // ── Apply smoothing ────────────────────────────────────────────────────────
  derived.visibility     = lerp(derived.visibility,     targetVisibility,  ALPHA);
  derived.exposure       = lerp(derived.exposure,       targetExposure,    ALPHA);
  derived.stealth        = lerp(derived.stealth,        targetStealth,     ALPHA);
  derived.stability      = lerp(derived.stability,      targetStability,   ALPHA);
  derived.energyModifier = lerp(derived.energyModifier, targetEnergy,      ALPHA);
  derived.threatLevel    = lerp(derived.threatLevel,    targetThreat,      ALPHA);
}

/**
 * Return a human-readable label for a 0–100 value.
 * @param {number} v
 * @returns {string}
 */
export function levelLabel(v) {
  if (v >= 80) return 'Very High';
  if (v >= 60) return 'High';
  if (v >= 40) return 'Medium';
  if (v >= 20) return 'Low';
  return 'Very Low';
}
