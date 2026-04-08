/**
 * exploreMode.js
 * Real-time stealth escape game — sensor inputs directly drive gameplay.
 *
 * Design:
 *  - Game ticks at 10 Hz (100 ms).
 *  - Player moves via tiltX/tiltY (device tilt or keyboard simulation).
 *  - Enemies patrol the arena; each has a dynamic detection radius.
 *  - Detection radius scales with ambientLight + brightnessLevel.
 *  - Low ambient light creates shadow coverage that shrinks enemy vision.
 *  - Noise above threshold immediately triggers enemy alert events.
 *  - Sustained silence (3 s) grants stealth mode ("ghost").
 *  - Sudden tilt spikes cause a stumble (noise burst + energy loss).
 *  - Battery below threshold reduces abilities.
 *  - Night hours (20–6) make enemies faster/more numerous.
 *  - Player wins by reaching the escape point.
 *  - Player loses when energy hits 0.
 *  - All meaningful events are pushed to the run log.
 *
 * This module owns all game-logic only — no DOM code.
 */

import {
  exploreRun, derived, sensorRaw, resetExploreRun,
} from '../state.js';
import { clamp, randInt, randFloat, pickRandom, formatTime } from '../utils.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const TICK_MS               = 100;   // game-logic tick interval (ms) — 10 fps
const BASE_SCORE_PER_SEC    = 2;     // score earned per second surviving
const SCORE_TIER_SECS       = 30;    // every N seconds score multiplier steps up
const ENEMY_SPAWN_BASE      = 0.015; // base spawn chance per tick
const MAX_ENEMIES           = 5;
const ENERGY_DECAY_BASE     = 0.025; // energy lost per tick from passive drain
const EVENT_CHANCE_BASE     = 0.008; // base chance per tick a random event fires
const EVENT_COOLDOWN_TICKS  = 50;    // ticks (~5 s) before same event can repeat

// Movement
const PLAYER_SPEED          = 0.55;  // grid units per tick per unit of tilt
const STUMBLE_TILT_DELTA    = 0.30;  // tilt change per tick that triggers stumble
const STUMBLE_COOLDOWN_TICKS= 20;    // ticks before another stumble can happen
const ENEMY_CATCH_DIST      = 6;     // grid-units distance at which an enemy catches the player

// Patrol behaviour (enemy movement when not alerted)
const PATROL_ANGLE_STEP     = 0.05;  // radians per tick; controls patrol speed
const PATROL_SPEED_FRAC     = 0.8;   // fraction of base speed used for patrol movement
const PATROL_Y_FREQ         = 0.7;   // Y-axis frequency ratio; <1 creates figure-8 shape
const PATROL_HOMING_FRAC    = 0.15;  // weak homing fraction to prevent wandering off-screen

// Stealth / detection
const NOISE_THRESHOLD       = 28;    // noise level that alerts nearby enemies
const SILENCE_STEALTH_SECS  = 3.0;   // s of quiet → stealth mode
const STEALTH_BREAK_NOISE   = 18;    // noise above this breaks stealth mode
const UN_ALERT_NOISE        = 10;    // enemy un-alerts when noise drops below this
const PLAYER_BASE_DETECT_R         = 4;     // base player exposure radius (grid units)
const PLAYER_RADIUS_NOISE_MULT     = 14;    // noise contribution to player exposure radius
const PLAYER_RADIUS_LIGHT_MULT     = 8;     // ambient light contribution
const PLAYER_RADIUS_BRIGHT_MULT    = 6;     // screen brightness contribution
const MIN_DETECTION_DIST           = 0.01;  // minimum enemy-player distance to avoid division by zero
const DEFAULT_ANGULAR_EXPANSION    = Math.PI; // angular expansion used when enemy is on top of player
const DETECTION_COOLDOWN    = 30;    // ticks (~3 s) between detection energy hits
const NOISE_EVENT_COOLDOWN  = 20;    // ticks before another noise event
const ENEMY_ALERT_MAX_TICKS = 60;    // auto-cancel alert after ~6 s if not re-triggered

// Enemy groups — three distinct watcher profiles with different FOV and hearing stats.
// FOV range is in 0–100 grid units; hearingRange is the radius within which a watcher
// will react to sound.  The player's state (stealth, brightness, etc.) does NOT change
// a watcher's FOV range — it only affects the player's own detection radius.
const ENEMY_GROUPS = [
  // 0 — standard: balanced sight and hearing
  { fovRange: 16, fovHalfAngle: Math.PI / 3.6, hearingRange: 28, speedMult: 1.0 },
  // 1 — scout: short sight, acute hearing, fast
  { fovRange: 12, fovHalfAngle: Math.PI / 5.0, hearingRange: 42, speedMult: 1.4 },
  // 2 — guardian: wide FOV, poor hearing, slow
  { fovRange: 22, fovHalfAngle: Math.PI / 3.0, hearingRange: 16, speedMult: 0.7 },
];

// Sound-reaction behaviour (triggered when noise reaches NOISE_THRESHOLD)
const SOUND_REACT_TICKS   = 25;   // ticks a watcher spends checking the sound source
const SOUND_CONFIRM_NOISE = 22;   // noise still above this during check → watcher goes alert

// Environment
const SHADOW_LIGHT_THRESHOLD= 40;    // ambient light below this = shadow coverage
const LOW_BATTERY_THRESHOLD = 25;    // energyModifier below this = penalties
const ESCAPE_RADIUS         = 6;     // player distance to escape point → win

// Sensor influence + cause tracking (for end-of-run summary).
// INFLUENCE_DANGER_ADD/INFLUENCE_BONUS_SUB accumulate relative sensor pressure.
// CAUSE_APPROX_ENERGY is a fixed representative estimate for relative comparison only.
const INFLUENCE_DANGER_ADD  = 4;
const INFLUENCE_BONUS_SUB   = 2;
const CAUSE_APPROX_ENERGY   = 10;

// ── Expanded event pool ───────────────────────────────────────────────────────
// type: 'danger' | 'bonus' | 'warn'
// tag:  sensor category key for influence tracking
const EVENT_POOL = [
  // Noise
  {
    id: 'noise_exposed',
    tag: 'noise', type: 'danger',
    condition: (d) => d.exposure > 70,
    message: '🔊 Loud noise exposed your position! −15 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 15, 0, 100); },
  },
  {
    id: 'noise_burst',
    tag: 'noise', type: 'danger',
    condition: (d) => d.exposure > 80,
    message: '🔊 Sudden noise burst drew attention! −20 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 20, 0, 100); },
  },
  {
    id: 'noise_quiet',
    tag: 'noise', type: 'bonus',
    condition: (d) => d.exposure < 30,
    message: '🤫 Silence keeps you safe. +10 score.',
    effect: (run) => { run.score += 10; },
  },
  // Ambient light
  {
    id: 'dark_cover',
    tag: 'light', type: 'bonus',
    condition: (d) => d.visibility < 35,
    message: '🌑 Darkness provides cover. +8 score.',
    effect: (run) => { run.score += 8; },
  },
  {
    id: 'bright_exposed',
    tag: 'light', type: 'danger',
    condition: (d) => d.visibility > 75,
    message: '☀️ Bright light reveals your silhouette! −8 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'shadow_route',
    tag: 'light', type: 'bonus',
    condition: (d) => d.stealth > 65 && d.visibility < 50,
    message: '🌒 Shadow route found. +15 score.',
    effect: (run) => { run.score += 15; },
  },
  // Battery
  {
    id: 'low_battery',
    tag: 'battery', type: 'warn',
    condition: (d) => d.energyModifier < 30,
    message: '🔋 Low battery weakened recovery. −5 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 5, 0, 100); },
  },
  {
    id: 'battery_critical',
    tag: 'battery', type: 'danger',
    condition: (d) => d.energyModifier < 15,
    message: '🪫 Battery critical — systems failing! −12 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 12, 0, 100); },
  },
  {
    id: 'battery_boost',
    tag: 'battery', type: 'bonus',
    condition: (d) => d.energyModifier > 75,
    message: '⚡ Full battery gives you an edge. +12 score.',
    effect: (run) => { run.score += 12; },
  },
  // Brightness
  {
    id: 'glare_spotted',
    tag: 'brightness', type: 'danger',
    condition: (d) => d.exposure > 60 && d.visibility > 60,
    message: '💡 Screen glare spotted by a watcher! −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'dim_screen',
    tag: 'brightness', type: 'bonus',
    condition: (d) => d.visibility < 40 && d.stealth > 55,
    message: '🔅 Dimmed screen blends into surroundings. +6 score.',
    effect: (run) => { run.score += 6; },
  },
  // Tilt / stability
  {
    id: 'unstable_terrain',
    tag: 'tilt', type: 'danger',
    condition: (d) => d.stability < 35,
    message: '📳 Unstable movement detected! −8 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'steady_steps',
    tag: 'tilt', type: 'bonus',
    condition: (d) => d.stability > 70,
    message: '🚶 Steady movement keeps you hidden. +8 score.',
    effect: (run) => { run.score += 8; },
  },
  // Stealth / threat
  {
    id: 'hidden_route',
    tag: 'stealth', type: 'bonus',
    condition: (d) => d.stealth > 55,
    message: '🛤️ You found a quiet route. +15 score.',
    effect: (run) => { run.score += 15; },
  },
  {
    id: 'stayed_hidden',
    tag: 'stealth', type: 'bonus',
    condition: (d) => d.stealth > 70,
    message: '🫥 You stayed perfectly hidden. +10 score.',
    effect: (run) => { run.score += 10; },
  },
  {
    id: 'calm_passage',
    tag: 'stealth', type: 'bonus',
    condition: (d) => d.threatLevel < 25 && d.stealth > 60,
    message: '✅ You passed through undetected. +20 score.',
    effect: (run) => { run.score += 20; },
  },
  {
    id: 'watcher_noticed',
    tag: 'threat', type: 'danger',
    condition: (d) => d.exposure > 65 && d.threatLevel > 50,
    message: '👁 A watcher noticed movement. −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'threat_surge',
    tag: 'threat', type: 'danger',
    condition: (d) => d.threatLevel > 75,
    message: '🚨 Threat level spiking — stay low! −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'safe_zone',
    tag: 'threat', type: 'bonus',
    condition: (d) => d.threatLevel < 20 && d.stealth > 50,
    message: '🟢 You reached a safe zone. +25 score.',
    effect: (run) => { run.score += 25; },
  },
];

// ── Night-time helper ─────────────────────────────────────────────────────────
/** Returns true when the current hour is in the night range (20:00–05:59). */
function _isNightTime() {
  const h = typeof sensorRaw.hour === 'number' ? sensorRaw.hour : 0;
  return h >= 20 || h < 6;
}

// ── Enemy factory ─────────────────────────────────────────────────────────────
let _enemyId = 0;

function spawnEnemy() {
  // Spawn at map edge, away from player
  const side = randInt(0, 3);
  let ex, ey;
  switch (side) {
    case 0: ex = randFloat(5, 95); ey = 5;  break;
    case 1: ex = 95;               ey = randFloat(5, 95); break;
    case 2: ex = randFloat(5, 95); ey = 95; break;
    default: ex = 5;               ey = randFloat(5, 95); break;
  }
  const groupId = randInt(0, ENEMY_GROUPS.length - 1);
  const group   = ENEMY_GROUPS[groupId];
  return {
    id:              _enemyId++,
    x:               ex,
    y:               ey,
    speed:           randFloat(0.3, 0.8) * (1 + derived.threatLevel / 100) * group.speedMult,
    fovRange:        group.fovRange,     // updated each tick by env factors
    fovHalfAngle:    group.fovHalfAngle,
    hearingRange:    group.hearingRange,
    groupId,
    alerted:         false,
    alertTicks:      0,    // counts down; resets on re-trigger
    soundReacting:   false, // watcher heard a sound and is turning to check
    soundReactTicks: 0,
    soundSourceX:    0,
    soundSourceY:    0,
    patrolAngle:     randFloat(0, Math.PI * 2),
    patrolSpeed:     randFloat(0.5, 1.5),
    facingAngle:     randFloat(0, Math.PI * 2), // direction the enemy is facing
  };
}

// ── Internal tick state ───────────────────────────────────────────────────────
let _tickIntervalId     = null;
let _onUpdate           = null;
let _lastAnnouncedTier  = 0;
let _prevTiltMag        = 0;
let _stumbleCooldown    = 0;
let _detectionCooldown  = 0;
let _noiseCooldown      = 0;
let _batteryWarnSent    = false;
let _nightWarnSent      = false;
let _silenceTimer       = 0;  // seconds of consecutive quiet

const _eventCooldowns = new Map();

const _sensorInfluence = {
  noise: 0, light: 0, battery: 0, brightness: 0, tilt: 0, threat: 0, stealth: 0,
};

const _energyLossCauses = {
  passive: 0, enemies: 0, noise: 0, light: 0, battery: 0, brightness: 0, tilt: 0, threat: 0,
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Start a brand-new run. */
export function startRun(onUpdate) {
  resetExploreRun();
  exploreRun.active = true;
  _onUpdate = onUpdate;

  _eventCooldowns.clear();
  _lastAnnouncedTier = 0;
  // Seed _prevTiltMag to the current tilt magnitude to avoid a false
  // stumble on the very first tick when the value was 0.
  // Default to 0 if sensor values are not yet populated (avoids NaN).
  const tx0 = typeof sensorRaw.tiltX === 'number' ? sensorRaw.tiltX : 0;
  const ty0 = typeof sensorRaw.tiltY === 'number' ? sensorRaw.tiltY : 0;
  _prevTiltMag       = Math.sqrt(tx0 ** 2 + ty0 ** 2);
  _stumbleCooldown   = 0;
  _detectionCooldown = 0;
  _noiseCooldown     = 0;
  _batteryWarnSent   = false;
  _nightWarnSent     = false;
  _silenceTimer      = 0;
  Object.keys(_sensorInfluence).forEach(k => (_sensorInfluence[k] = 0));
  Object.keys(_energyLossCauses).forEach(k => (_energyLossCauses[k] = 0));

  // Place escape point in opposite quadrant from player start (50,50)
  exploreRun.escapePoint = {
    x: randInt(5, 25),
    y: randInt(5, 25),
  };

  _tickIntervalId = setInterval(_gameTick, TICK_MS);
  _pushLog('🏃 Run started — reach the EXIT to escape!', 'info');
  _pushLog('⬆ Tilt your device (or use arrow keys) to move.', 'info');
  _onUpdate && _onUpdate('start');
}

/** Pause the current run. */
export function pauseRun() {
  if (!exploreRun.active || exploreRun.paused) return;
  exploreRun.paused = true;
  clearInterval(_tickIntervalId);
  _tickIntervalId = null;
  _pushLog('⏸ Run paused.', 'info');
  _onUpdate && _onUpdate('pause');
}

/** Resume a paused run. */
export function resumeRun() {
  if (!exploreRun.active || !exploreRun.paused) return;
  exploreRun.paused = false;
  _tickIntervalId = setInterval(_gameTick, TICK_MS);
  _pushLog('▶ Run resumed.', 'info');
  _onUpdate && _onUpdate('resume');
}

/** End the run (player choice, energy = 0, or escaped). */
export function endRun(reason = 'player') {
  if (_tickIntervalId) {
    clearInterval(_tickIntervalId);
    _tickIntervalId = null;
  }
  exploreRun.active = false;
  exploreRun.paused = false;

  const topSensor = _getTopSensorInfluence();
  const mainCause = reason === 'energy' ? _getMainCause() : 'Player ended run';

  exploreRun.summary = {
    reason,
    mainCause,
    topSensor,
    score:   Math.floor(exploreRun.score),
    elapsed: exploreRun.elapsed,
  };

  let endMsg;
  if (reason === 'escaped') {
    endMsg = `🎉 ESCAPED! Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`;
    _pushLog(endMsg, 'bonus');
  } else if (reason === 'energy') {
    endMsg = `💀 Energy depleted! Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`;
    _pushLog(endMsg, 'danger');
  } else {
    endMsg = `🚪 Run ended. Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`;
    _pushLog(endMsg, 'info');
  }

  _onUpdate && _onUpdate('end');
}

// ── Game tick ─────────────────────────────────────────────────────────────────

function _gameTick() {
  const tickSec = TICK_MS / 1000;
  exploreRun.elapsed += tickSec;

  // ── Score multiplier tier ──────────────────────────────────────────────────
  const scoreTier       = Math.floor(exploreRun.elapsed / SCORE_TIER_SECS);
  const scoreMultiplier = 1 + scoreTier * 0.25;
  if (scoreTier > _lastAnnouncedTier) {
    _lastAnnouncedTier = scoreTier;
    _pushLog(
      `⭐ ${formatTime(exploreRun.elapsed)} — Score ×${scoreMultiplier.toFixed(2)} now!`,
      'bonus',
    );
  }

  // ── 1. Move player via tilt ────────────────────────────────────────────────
  _movePlayer(tickSec);

  // ── 2. Shadow coverage from ambient light ──────────────────────────────────
  _updateShadowCoverage();

  // ── 3. Stealth / silence tracking ─────────────────────────────────────────
  _updateStealthMode(tickSec);

  // ── 4. Noise threshold detection event ────────────────────────────────────
  _checkNoiseDetection();

  // ── 5. Battery effects ─────────────────────────────────────────────────────
  _checkBatteryEffects();

  // ── 6. Night-time effects ──────────────────────────────────────────────────
  _checkNightEffects();

  // ── 7. Update enemy detection radii + patrol ──────────────────────────────
  _updateEnemyDetectionRadii();
  _spawnEnemyMaybe();
  _updateEnemies();

  // ── 8. Check if any enemy detects the player ──────────────────────────────
  _checkEnemyDetections();

  // ── 9. Score accumulation ─────────────────────────────────────────────────
  const stealthBonus = derived.stealth / 100;
  const stealthMult  = exploreRun.inStealthMode ? 1.5 : 1.0;
  exploreRun.score  += (BASE_SCORE_PER_SEC + stealthBonus) * scoreMultiplier * stealthMult * tickSec;

  // ── 10. Energy drain ──────────────────────────────────────────────────────
  const noiseDrain   = (derived.exposure / 100) * 0.04;
  const batteryDrain = (1 - derived.energyModifier / 100) * 0.05;
  const detectDrain  = exploreRun.isDetected ? 0.05 : 0;
  const totalDrain   = (ENERGY_DECAY_BASE + noiseDrain + batteryDrain + detectDrain) * tickSec;
  exploreRun.energy  = clamp(exploreRun.energy - totalDrain, 0, 100);
  _energyLossCauses.passive += ENERGY_DECAY_BASE * tickSec;

  // ── 11. Sensor influence accumulation ─────────────────────────────────────
  _sensorInfluence.noise      += derived.exposure / 100;
  _sensorInfluence.light      += derived.visibility > 60 ? (derived.visibility - 60) / 40 : 0;
  _sensorInfluence.battery    += (1 - derived.energyModifier / 100);
  _sensorInfluence.tilt       += (1 - derived.stability / 100);
  _sensorInfluence.threat     += derived.threatLevel / 100;
  _sensorInfluence.stealth    += derived.stealth / 100;

  // ── 12. Danger meter ──────────────────────────────────────────────────────
  _updateDanger();

  // ── 13. Tick down cooldowns ────────────────────────────────────────────────
  if (_stumbleCooldown   > 0) _stumbleCooldown--;
  if (_detectionCooldown > 0) _detectionCooldown--;
  if (_noiseCooldown     > 0) _noiseCooldown--;
  _eventCooldowns.forEach((v, k) => {
    if (v > 0) _eventCooldowns.set(k, v - 1);
  });

  // ── 14. Occasional random events ──────────────────────────────────────────
  _fireEventMaybe();

  // ── 15. Check escape (win condition) ──────────────────────────────────────
  if (_distToEscape() < ESCAPE_RADIUS) {
    exploreRun.escaped = true;
    endRun('escaped');
    return;
  }

  // ── 16. Check energy-depleted lose condition ───────────────────────────────
  if (exploreRun.energy <= 0) {
    endRun('energy');
    return;
  }

  _onUpdate && _onUpdate('tick');
}

// ── Movement ──────────────────────────────────────────────────────────────────

function _movePlayer(tickSec) {
  const tx = typeof sensorRaw.tiltX === 'number' ? sensorRaw.tiltX : 0;
  const ty = typeof sensorRaw.tiltY === 'number' ? sensorRaw.tiltY : 0;

  // Stumble check: sudden spike in tilt magnitude
  const tiltMag  = Math.sqrt(tx * tx + ty * ty);
  const tiltDelta = Math.abs(tiltMag - _prevTiltMag);
  if (tiltDelta > STUMBLE_TILT_DELTA && _stumbleCooldown === 0) {
    _stumbleCooldown = STUMBLE_COOLDOWN_TICKS;
    const noiseBump = randInt(15, 25);
    _pushLog(`🌀 You slipped and made noise! (+${noiseBump} noise burst)`, 'danger');
    exploreRun.energy = clamp(exploreRun.energy - 5, 0, 100);
    _energyLossCauses.tilt += 5;
    _sensorInfluence.tilt  += INFLUENCE_DANGER_ADD;
  }
  _prevTiltMag = tiltMag;

  // Apply movement; battery below threshold reduces speed
  const speedMult = derived.energyModifier < LOW_BATTERY_THRESHOLD ? 0.6 : 1.0;
  const px = exploreRun.player;
  px.x = clamp(px.x + tx * PLAYER_SPEED * speedMult, 1, 99);
  px.y = clamp(px.y + ty * PLAYER_SPEED * speedMult, 1, 99);
}

// ── Shadow coverage ───────────────────────────────────────────────────────────

let _shadowLogCooldown = 0;

function _updateShadowCoverage() {
  const light = sensorRaw.ambientLight;
  const prevCoverage = exploreRun.shadowCoverage;
  if (light < SHADOW_LIGHT_THRESHOLD) {
    exploreRun.shadowCoverage = (SHADOW_LIGHT_THRESHOLD - light) / SHADOW_LIGHT_THRESHOLD;
  } else {
    exploreRun.shadowCoverage = 0;
  }
  // Log once when entering significant shadow
  if (_shadowLogCooldown > 0) {
    _shadowLogCooldown--;
  } else if (exploreRun.shadowCoverage > 0.5 && prevCoverage <= 0.5) {
    _pushLog('🌑 You merged into the shadows — enemy vision reduced.', 'bonus');
    _shadowLogCooldown = 300; // 30 s cooldown
  } else if (exploreRun.shadowCoverage === 0 && prevCoverage > 0.5) {
    _pushLog('💡 You stepped into the light — exposed!', 'warn');
    _shadowLogCooldown = 100;
  }
}

// ── Stealth mode ──────────────────────────────────────────────────────────────

function _updateStealthMode(tickSec) {
  const noise = sensorRaw.noiseLevel;

  if (noise < STEALTH_BREAK_NOISE) {
    _silenceTimer += tickSec;
    exploreRun.stealthTimerSec = _silenceTimer;

    if (_silenceTimer >= SILENCE_STEALTH_SECS && !exploreRun.inStealthMode) {
      exploreRun.inStealthMode = true;
      _pushLog('🫥 You stayed silent and disappeared — GHOST MODE!', 'bonus');
      exploreRun.score += 20;
    }
  } else {
    if (exploreRun.inStealthMode && noise > STEALTH_BREAK_NOISE) {
      exploreRun.inStealthMode = false;
      _pushLog('👂 Noise broke your stealth!', 'warn');
    }
    _silenceTimer = 0;
    exploreRun.stealthTimerSec = 0;
  }
}

// ── Noise detection event ─────────────────────────────────────────────────────

function _checkNoiseDetection() {
  if (_noiseCooldown > 0) return;
  const noise = sensorRaw.noiseLevel;
  if (noise > NOISE_THRESHOLD) {
    _noiseCooldown = NOISE_EVENT_COOLDOWN;

    // Only watchers within their individual hearing range react to the sound.
    const pX = exploreRun.player.x;
    const pY = exploreRun.player.y;
    let anyReacted = false;
    exploreRun.enemies.forEach(e => {
      const dx   = pX - e.x;
      const dy   = pY - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= e.hearingRange && !e.alerted) {
        e.soundReacting   = true;
        e.soundReactTicks = SOUND_REACT_TICKS;
        e.soundSourceX    = pX;
        e.soundSourceY    = pY;
        anyReacted = true;
      }
    });

    if (anyReacted) {
      _pushLog('👂 A watcher heard a sound — turning to look!', 'warn');
    }
    _sensorInfluence.noise += INFLUENCE_DANGER_ADD;
  }
}

// ── Battery effects ───────────────────────────────────────────────────────────

function _checkBatteryEffects() {
  if (_batteryWarnSent) return;
  if (derived.energyModifier < LOW_BATTERY_THRESHOLD) {
    _batteryWarnSent = true;
    _pushLog('🪫 Low power — movement slowed, abilities reduced!', 'warn');
    _sensorInfluence.battery += INFLUENCE_DANGER_ADD;
  }
}

// ── Night-time effects ────────────────────────────────────────────────────────

function _checkNightEffects() {
  if (_nightWarnSent) return;
  if (_isNightTime()) {
    _nightWarnSent = true;
    _pushLog('🌙 Night has fallen — enemies are faster and more numerous.', 'warn');
  }
}

// ── Enemy detection radii ─────────────────────────────────────────────────────

function _updateEnemyDetectionRadii() {
  // Only environmental factors affect a watcher's FOV range.
  // Bright ambient light extends sight; shadows shorten it.
  // Player state (stealth mode, screen brightness) does NOT affect enemy FOV —
  // it affects the player's own detection radius instead.
  const lightFactor  = 1 + sensorRaw.ambientLight / 200;    // 1.0–1.5
  const shadowFactor = 1 - exploreRun.shadowCoverage * 0.45; // 0.55–1.0
  exploreRun.enemies.forEach(e => {
    const group = ENEMY_GROUPS[e.groupId] || ENEMY_GROUPS[0];
    e.fovRange = clamp(
      group.fovRange * lightFactor * shadowFactor,
      4, group.fovRange * 1.5,
    );
  });
}

// ── Enemy spawn ───────────────────────────────────────────────────────────────

function _spawnEnemyMaybe() {
  if (exploreRun.enemies.length >= MAX_ENEMIES) return;
  const nightBonus  = _isNightTime() ? 1.6 : 1.0;
  const spawnChance = ENEMY_SPAWN_BASE * (1 + derived.threatLevel / 50) * nightBonus;
  if (Math.random() < spawnChance) {
    exploreRun.enemies.push(spawnEnemy());
  }
}

// ── Enemy movement ────────────────────────────────────────────────────────────

function _updateEnemies() {
  const pX = exploreRun.player.x;
  const pY = exploreRun.player.y;
  let soundConfirmed = false;

  exploreRun.enemies = exploreRun.enemies.filter(e => {
    const dx   = pX - e.x;
    const dy   = pY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return false;

    const nightSpeed = _isNightTime() ? 1.4 : 1.0;
    const speed = e.speed * nightSpeed * (1 + derived.exposure / 200);

    if (e.alerted) {
      // Alerted: home in on player directly; face toward player
      e.facingAngle = Math.atan2(dy, dx);
      e.x += (dx / dist) * speed;
      e.y += (dy / dist) * speed;

      // Tick down alert timer; un-alert when stealth active, noise drops, or timer expires
      if (e.alertTicks > 0) e.alertTicks--;
      if (exploreRun.inStealthMode || sensorRaw.noiseLevel < UN_ALERT_NOISE || e.alertTicks === 0) {
        e.alerted = false;
        e.alertTicks = 0;
      }
    } else if (e.soundReacting) {
      // Sound-reaction: gradually turn to face the sound source and wait.
      // If noise remains loud, escalate to fully alerted.  If it dies down, resume patrol.
      const sdx = e.soundSourceX - e.x;
      const sdy = e.soundSourceY - e.y;
      const targetAngle = Math.atan2(sdy, sdx);
      const ad = _angleDiff(targetAngle, e.facingAngle);
      e.facingAngle += ad * 0.25; // gradually turn toward the sound

      if (e.soundReactTicks > 0) e.soundReactTicks--;

      if (sensorRaw.noiseLevel > SOUND_CONFIRM_NOISE) {
        // Sound confirmed — pursue
        e.alerted       = true;
        e.alertTicks    = ENEMY_ALERT_MAX_TICKS;
        e.soundReacting = false;
        soundConfirmed  = true;
      } else if (e.soundReactTicks === 0) {
        // Sound died away — back to patrol
        e.soundReacting = false;
      }
      // Stay in place while checking (no positional update)
    } else {
      // Patrol: approximate figure-8 using two overlaid sine waves.
      e.patrolAngle += e.patrolSpeed * PATROL_ANGLE_STEP;
      const patrolDx = Math.cos(e.patrolAngle) * speed * PATROL_SPEED_FRAC;
      const patrolDy = Math.sin(e.patrolAngle * PATROL_Y_FREQ) * speed * PATROL_SPEED_FRAC;
      const homingDx = (dx / dist) * speed * PATROL_HOMING_FRAC;
      const homingDy = (dy / dist) * speed * PATROL_HOMING_FRAC;
      const totalDx  = patrolDx + homingDx;
      const totalDy  = patrolDy + homingDy;
      // Face in the direction of actual movement
      if (Math.abs(totalDx) > 0.001 || Math.abs(totalDy) > 0.001) {
        e.facingAngle = Math.atan2(totalDy, totalDx);
      }
      e.x = clamp(e.x + totalDx, 1, 99);
      e.y = clamp(e.y + totalDy, 1, 99);
    }

    // Catch check — uses module-level ENEMY_CATCH_DIST
    const newDist = Math.sqrt((pX - e.x) ** 2 + (pY - e.y) ** 2);
    if (newDist < ENEMY_CATCH_DIST) {
      const dmg = randInt(10, 22);
      exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
      _energyLossCauses.enemies += dmg;
      _pushLog(`👾 Enemy caught you! −${dmg} energy.`, 'danger');
      return false; // remove caught enemy
    }
    return true;
  });

  if (soundConfirmed) {
    _pushLog('🚨 A watcher confirmed the sound — moving in!', 'danger');
    _sensorInfluence.noise += INFLUENCE_DANGER_ADD;
  }
}

/**
 * Normalise the signed difference between two angles to the range [-π, π].
 * @param {number} a - first angle in radians
 * @param {number} b - second angle in radians
 * @returns {number} signed difference in [-π, π]
 */
function _angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Compute how large the player's "detectable presence" circle is this tick.
 * Factors: noise (louder = bigger), ambient light, screen brightness,
 * shadow coverage (darker = smaller), stealth mode (nearly invisible).
 */
function _computePlayerDetectionRadius() {
  const noise      = sensorRaw.noiseLevel;
  const light      = sensorRaw.ambientLight;
  const brightness = sensorRaw.brightnessLevel;

  let r = PLAYER_BASE_DETECT_R;
  r += (noise      / 100) * PLAYER_RADIUS_NOISE_MULT;  // loud noise greatly expands presence
  r += (light      / 100) * PLAYER_RADIUS_LIGHT_MULT;  // bright environment makes you more visible
  r += (brightness / 100) * PLAYER_RADIUS_BRIGHT_MULT; // bright screen leaks light, revealing you
  r *= (1 - exploreRun.shadowCoverage * 0.65); // shadows shrink the radius
  if (exploreRun.inStealthMode) r *= 0.2;       // ghost mode: almost invisible

  return clamp(r, 1, 30);
}

function _checkEnemyDetections() {
  if (_detectionCooldown > 0) {
    exploreRun.isDetected = false;
    return;
  }
  const pX      = exploreRun.player.x;
  const pY      = exploreRun.player.y;
  const playerR = _computePlayerDetectionRadius();
  exploreRun.playerDetectionRadius = playerR;

  let detectedByAny = false;

  exploreRun.enemies.forEach(e => {
    const dx   = pX - e.x;
    const dy   = pY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Nearest edge of player's exposure circle to enemy
    const effectiveDist = dist - playerR;
    if (effectiveDist >= e.fovRange) return; // too far even accounting for player radius

    // Angle from enemy to player centre
    const angleToPlayer = Math.atan2(dy, dx);
    const angleDiff     = Math.abs(_angleDiff(angleToPlayer, e.facingAngle));

    // Expand the cone half-angle by the angular size of the player's exposure radius
    // so that even if the player is slightly outside the centre line, their circle overlaps.
    const angularExpansion = dist > MIN_DETECTION_DIST
      ? Math.asin(Math.min(1, playerR / dist))
      : DEFAULT_ANGULAR_EXPANSION;

    if (angleDiff <= e.fovHalfAngle + angularExpansion) {
      detectedByAny = true;
      e.alerted     = true;
      e.alertTicks  = ENEMY_ALERT_MAX_TICKS; // refresh alert timer on each detection
    }
  });

  if (detectedByAny) {
    exploreRun.isDetected = true;
    _detectionCooldown = DETECTION_COOLDOWN;
    const dmg = randInt(5, 12);
    exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
    _energyLossCauses.threat += dmg;
    _pushLog('🚨 DETECTED! Enemy spotted you! −' + dmg + ' energy.', 'danger');
    _sensorInfluence.threat += INFLUENCE_DANGER_ADD;
  } else {
    exploreRun.isDetected = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _distToEscape() {
  const dx = exploreRun.player.x - exploreRun.escapePoint.x;
  const dy = exploreRun.player.y - exploreRun.escapePoint.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function _updateDanger() {
  const threatPart = derived.threatLevel * 0.35;
  const enemyPart  = (exploreRun.enemies.length / MAX_ENEMIES) * 100 * 0.30;
  const energyPart = (1 - exploreRun.energy / 100) * 100 * 0.20;
  const exposePart = derived.exposure * 0.15;
  const rawDanger  = threatPart + enemyPart + energyPart + exposePart;
  exploreRun.danger = clamp(
    exploreRun.danger + (rawDanger - exploreRun.danger) * 0.2,
    0, 100,
  );
}

function _fireEventMaybe() {
  const eventChance = EVENT_CHANCE_BASE * (1 + derived.threatLevel / 100);
  if (Math.random() > eventChance) return;

  const eligible = EVENT_POOL.filter(ev => {
    const cd = _eventCooldowns.get(ev.id) || 0;
    return cd === 0 && ev.condition(derived);
  });
  if (eligible.length === 0) return;

  const ev = pickRandom(eligible);
  ev.effect(exploreRun);
  _pushLog(ev.message, ev.type);

  if (ev.tag && ev.tag in _sensorInfluence) {
    _sensorInfluence[ev.tag] += ev.type === 'danger' ? INFLUENCE_DANGER_ADD : -INFLUENCE_BONUS_SUB;
  }
  if (ev.type === 'danger' && ev.tag in _energyLossCauses) {
    _energyLossCauses[ev.tag] += CAUSE_APPROX_ENERGY;
  }
  _eventCooldowns.set(ev.id, EVENT_COOLDOWN_TICKS);
}

function _getTopSensorInfluence() {
  const labels = {
    noise: 'Noise', light: 'Ambient Light', battery: 'Battery',
    brightness: 'Brightness', tilt: 'Tilt Stability', threat: 'Threat Level', stealth: 'Stealth',
  };
  let topKey = 'threat', topVal = -Infinity;
  Object.entries(_sensorInfluence).forEach(([k, v]) => {
    if (v > topVal) { topVal = v; topKey = k; }
  });
  return labels[topKey] || topKey;
}

function _getMainCause() {
  const labels = {
    passive: 'Energy decay', enemies: 'Enemy encounters', noise: 'Noise exposure',
    light: 'Ambient light', battery: 'Low battery', brightness: 'Screen brightness',
    tilt: 'Unstable movement', threat: 'High threat level',
  };
  let topKey = 'passive', topVal = _energyLossCauses.passive;
  Object.entries(_energyLossCauses).forEach(([k, v]) => {
    if (k !== 'passive' && v > topVal) { topVal = v; topKey = k; }
  });
  return labels[topKey] || topKey;
}

/** Prepend a log entry; keep last 25. */
function _pushLog(msg, type = 'info') {
  exploreRun.log.unshift({ msg, type, time: formatTime(exploreRun.elapsed) });
  if (exploreRun.log.length > 25) exploreRun.log.pop();
}
