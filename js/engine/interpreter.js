/**
 * interpreter.js
 * Converts raw sensor readings into derived game states.
 *
 * Inputs  (sensorRaw):
 *   noiseLevel      0–100
 *   ambientLight    0–100
 *   tiltX           -1 to 1
 *   tiltY           -1 to 1
 *   batteryLevel    0–100
 *   brightnessLevel 0–100
 *   hour            0–23
 *
 * Outputs (derived):
 *   visibility      0–100  — how well the player can see
 *   exposure        0–100  — how visible the player is to threats
 *   stealth         0–100  — how hidden the player is
 *   stability       0–100  — physical steadiness (affects penalties)
 *   energyModifier  0–100  — multiplier on energy-consuming actions
 *   threatLevel     0–100  — composite environmental danger
 *
 * Each derived value is independently smoothed so it never jumps wildly.
 */

import { clamp, lerp } from '../utils.js';
import { sensorRaw, derived } from '../state.js';

// Per-value smoothing factors (alpha: 0 = frozen, 1 = instant).
// Tune independently to control how quickly each output reacts.
const ALPHA = {
  visibility:     0.10,  // slow — lighting feels gradual
  exposure:       0.15,  // moderate — responds to noise fairly quickly
  stealth:        0.12,  // moderate
  stability:      0.20,  // fast — tilt changes should be felt promptly
  energyModifier: 0.08,  // slow — energy status should not flicker
  threatLevel:    0.12,  // moderate — threat builds and falls steadily
};

/**
 * Map the current hour (0–23) to a continuous daylight fraction (0–1).
 * Peaks at solar noon (~12:00), fades smoothly to 0 by night (≤6 or ≥20).
 * Uses a sine curve so the transition feels natural rather than stepped.
 *
 * @param {number} hour  0–23
 * @returns {number}     0 (full dark) to 1 (full bright)
 */
function _daylightFraction(hour) {
  const DAWN = 6;   // hour at which light starts
  const DUSK = 20;  // hour at which light ends
  if (hour <= DAWN || hour >= DUSK) return 0;
  // Normalise to 0–1 within the daylight window, then apply a sine peak
  const t = (hour - DAWN) / (DUSK - DAWN); // 0 at dawn, 1 at dusk
  return Math.sin(t * Math.PI);            // 0 at edges, 1 at solar noon
}

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

  // Continuous day brightness factor: 0 at night, 1 at solar noon
  const daylight = _daylightFraction(hour);

  // ── Visibility ─────────────────────────────────────────────────────────────
  // Good at midday (smooth daylight curve), boosted by ambient light and
  // the player's screen brightness setting.
  const dayBonus    = daylight * 30;          // 0–30 based on solar position
  const lightBonus  = ambientLight * 0.4;     // 0–40
  const brightBonus = brightnessLevel * 0.3;  // 0–30
  const targetVisibility = clamp(dayBonus + lightBonus + brightBonus, 0, 100);

  // ── Exposure ───────────────────────────────────────────────────────────────
  // High noise + bright light + daytime = player is visible to threats.
  const noiseExpose   = noiseLevel * 0.4;      // 0–40
  const lightExpose   = ambientLight * 0.3;    // 0–30
  const dayExpose     = daylight * 20;         // 0–20 smooth peak at noon
  const brightExpose  = brightnessLevel * 0.1; // 0–10
  const targetExposure = clamp(noiseExpose + lightExpose + dayExpose + brightExpose, 0, 100);

  // ── Stealth ────────────────────────────────────────────────────────────────
  // Inverse of exposure; dark + quiet + still = very hidden.
  const noisePenalty  = noiseLevel * 0.5;                          // 0–50
  const tiltPenalty   = (Math.abs(tiltX) + Math.abs(tiltY)) * 15; // 0–30
  const darkBonus     = (100 - ambientLight) * 0.2;                // 0–20
  const targetStealth = clamp(100 - noisePenalty - tiltPenalty + darkBonus, 0, 100);

  // ── Stability ──────────────────────────────────────────────────────────────
  // Derived purely from tilt magnitude.  sqrt keeps the curve non-linear:
  // small tilts are almost fine, but large tilts heavily degrade stability.
  const tiltMag        = Math.sqrt(tiltX * tiltX + tiltY * tiltY); // 0–√2 ≈ 1.41
  const targetStability = clamp(100 - tiltMag * 70, 0, 100);

  // ── Energy Modifier ────────────────────────────────────────────────────────
  // Battery % is the main driver.  Quiet environment helps (lower stress).
  // Being at night provides a natural rest bonus.
  const batteryFactor = batteryLevel * 0.6;        // 0–60 — main driver
  const quietBonus    = (100 - noiseLevel) * 0.2;  // 0–20 — quiet = calmer
  const nightBonus    = (1 - daylight) * 20;       // 0–20 — peaks at night
  const targetEnergy  = clamp(batteryFactor + quietBonus + nightBonus, 0, 100);

  // ── Threat Level ───────────────────────────────────────────────────────────
  // Blends noise pressure, ambient brightness, and how poorly the player is hidden.
  const noiseThreat    = noiseLevel * 0.35;          // 0–35
  const lightThreat    = ambientLight * 0.25;        // 0–25
  const stealthPenalty = (100 - targetStealth) * 0.2; // 0–20 (low stealth = more threat)
  const targetThreat   = clamp(noiseThreat + lightThreat + stealthPenalty, 0, 100);

  // ── Apply per-value smoothing ──────────────────────────────────────────────
  derived.visibility     = lerp(derived.visibility,     targetVisibility,  ALPHA.visibility);
  derived.exposure       = lerp(derived.exposure,       targetExposure,    ALPHA.exposure);
  derived.stealth        = lerp(derived.stealth,        targetStealth,     ALPHA.stealth);
  derived.stability      = lerp(derived.stability,      targetStability,   ALPHA.stability);
  derived.energyModifier = lerp(derived.energyModifier, targetEnergy,      ALPHA.energyModifier);
  derived.threatLevel    = lerp(derived.threatLevel,    targetThreat,      ALPHA.threatLevel);
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
