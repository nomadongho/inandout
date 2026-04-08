/**
 * exploreMode.js
 * Real-time stealth escape game — sensor inputs directly drive gameplay.
 *
 * Design:
 *  - Game ticks at 10 Hz (100 ms).
 *  - Player moves via tiltX/tiltY (device tilt or keyboard simulation).
 *  - Stage-based maps with walls, rooms, shadow/light zones.
 *  - Watchers have a 7-state AI (IDLE → SUSPICIOUS → LISTENING → INVESTIGATING
 *    → ALERTED → CHASING → RETURNING), driven by vision cones (LOS-blocked by
 *    walls) and a realistic sound propagation model.
 *  - Sound events from player movement propagate outward and attenuate with
 *    distance and wall occlusion.
 *  - Detection radius from player state (noise, light, brightness, shadow) is
 *    used for both the vision check and the visual noise-pulse indicator.
 *  - Sustained silence (3 s) grants stealth mode ("ghost").
 *  - Stumble on sudden tilt spike: burst sound + energy loss.
 *  - Battery below threshold reduces movement speed.
 *  - Night hours (20–6) make watchers faster / more alert.
 *  - Player wins by reaching the escape point.
 *  - Player loses when energy hits 0.
 *
 * This module owns all game-logic only — no DOM code.
 */

import {
  exploreRun, derived, sensorRaw, resetExploreRun,
} from '../state.js';
import { clamp, randInt, randFloat, pickRandom, formatTime } from '../utils.js';
import { getStage } from '../explore/stageData.js';
import { moveWithCollision, inShadowZone, inLightZone } from '../explore/geometry.js';
import {
  createSoundEvent, tickSoundEvents, pruneExpiredEvents,
} from '../explore/soundSystem.js';
import { createWatcher, updateWatcher, WS } from '../explore/watcherAI.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const TICK_MS               = 100;   // game-logic tick interval (ms) — 10 fps
const BASE_SCORE_PER_SEC    = 2;     // score earned per second surviving
const SCORE_TIER_SECS       = 30;    // every N seconds score multiplier steps up
const ENERGY_DECAY_BASE     = 0.025; // energy lost per tick from passive drain
const EVENT_CHANCE_BASE     = 0.008; // base chance per tick a random event fires
const EVENT_COOLDOWN_TICKS  = 50;    // ticks (~5 s) before same event can repeat

// Movement
const PLAYER_SPEED          = 0.55;  // grid units per tick per unit of tilt
const STUMBLE_TILT_DELTA    = 0.30;  // tilt change per tick that triggers stumble
const STUMBLE_COOLDOWN_TICKS= 20;    // ticks before another stumble can happen
const ENEMY_CATCH_DIST      = 5;     // grid units at which a chasing watcher catches player

// Stealth / detection
const NOISE_THRESHOLD       = 28;    // noise level that creates audible sound events
const SILENCE_STEALTH_SECS  = 3.0;   // s of quiet → stealth mode
const STEALTH_BREAK_NOISE   = 18;    // noise above this breaks stealth mode
const PLAYER_BASE_DETECT_R         = 4;
const PLAYER_RADIUS_NOISE_MULT     = 14;
const PLAYER_RADIUS_LIGHT_MULT     = 8;
const PLAYER_RADIUS_BRIGHT_MULT    = 6;
const DETECTION_COOLDOWN    = 30;    // ticks (~3 s) between chase-energy hits
const ESCAPE_RADIUS         = 6;     // player distance to escape point → win

// Shadow
const SHADOW_LIGHT_THRESHOLD= 40;
const LOW_BATTERY_THRESHOLD = 25;

// Sound emission
const FOOTSTEP_EMIT_PERIOD  = 3;     // emit a footstep sound every N ticks when moving
const FOOTSTEP_BASE_INTENSITY = 14;  // base intensity of a footstep
const STUMBLE_SOUND_INTENSITY = 60;  // intensity of a stumble burst

// Sensor influence + cause tracking (for end-of-run summary)
const INFLUENCE_DANGER_ADD  = 4;
const INFLUENCE_BONUS_SUB   = 2;
const CAUSE_APPROX_ENERGY   = 10;

// Enemy group profiles — must match watcherAI group IDs 0/1/2
// FOV range in 0–100 grid units; hearing range = radius for drawing only (actual
// hearing is handled by the sound propagation system inside watcherAI.js).
export const ENEMY_GROUPS = [
  // 0 — standard: balanced sight and hearing
  { fovRange: 11, fovHalfAngle: Math.PI / 4.5, hearingRange: 22, speedMult: 0.75 },
  // 1 — scout: narrower cone, acute hearing, fast
  { fovRange:  8, fovHalfAngle: Math.PI / 6.0, hearingRange: 32, speedMult: 1.0  },
  // 2 — guardian: wide FOV, poor hearing, slow
  { fovRange: 15, fovHalfAngle: Math.PI / 3.6, hearingRange: 12, speedMult: 0.55 },
];

// ── Expanded event pool ───────────────────────────────────────────────────────
const EVENT_POOL = [
  {
    id: 'noise_exposed', tag: 'noise', type: 'danger',
    condition: (d) => d.exposure > 70,
    message: '🔊 Loud noise exposed your position! −15 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 15, 0, 100); },
  },
  {
    id: 'noise_burst', tag: 'noise', type: 'danger',
    condition: (d) => d.exposure > 80,
    message: '🔊 Sudden noise burst drew attention! −20 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 20, 0, 100); },
  },
  {
    id: 'noise_quiet', tag: 'noise', type: 'bonus',
    condition: (d) => d.exposure < 30,
    message: '🤫 Silence keeps you safe. +10 score.',
    effect: (run) => { run.score += 10; },
  },
  {
    id: 'dark_cover', tag: 'light', type: 'bonus',
    condition: (d) => d.visibility < 35,
    message: '🌑 Darkness provides cover. +8 score.',
    effect: (run) => { run.score += 8; },
  },
  {
    id: 'bright_exposed', tag: 'light', type: 'danger',
    condition: (d) => d.visibility > 75,
    message: '☀️ Bright light reveals your silhouette! −8 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'shadow_route', tag: 'light', type: 'bonus',
    condition: (d) => d.stealth > 65 && d.visibility < 50,
    message: '🌒 Shadow route found. +15 score.',
    effect: (run) => { run.score += 15; },
  },
  {
    id: 'low_battery', tag: 'battery', type: 'warn',
    condition: (d) => d.energyModifier < 30,
    message: '🔋 Low battery weakened recovery. −5 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 5, 0, 100); },
  },
  {
    id: 'battery_critical', tag: 'battery', type: 'danger',
    condition: (d) => d.energyModifier < 15,
    message: '🪫 Battery critical — systems failing! −12 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 12, 0, 100); },
  },
  {
    id: 'battery_boost', tag: 'battery', type: 'bonus',
    condition: (d) => d.energyModifier > 75,
    message: '⚡ Full battery gives you an edge. +12 score.',
    effect: (run) => { run.score += 12; },
  },
  {
    id: 'glare_spotted', tag: 'brightness', type: 'danger',
    condition: (d) => d.exposure > 60 && d.visibility > 60,
    message: '💡 Screen glare spotted by a watcher! −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'dim_screen', tag: 'brightness', type: 'bonus',
    condition: (d) => d.visibility < 40 && d.stealth > 55,
    message: '🔅 Dimmed screen blends into surroundings. +6 score.',
    effect: (run) => { run.score += 6; },
  },
  {
    id: 'unstable_terrain', tag: 'tilt', type: 'danger',
    condition: (d) => d.stability < 35,
    message: '📳 Unstable movement detected! −8 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'steady_steps', tag: 'tilt', type: 'bonus',
    condition: (d) => d.stability > 70,
    message: '🚶 Steady movement keeps you hidden. +8 score.',
    effect: (run) => { run.score += 8; },
  },
  {
    id: 'hidden_route', tag: 'stealth', type: 'bonus',
    condition: (d) => d.stealth > 55,
    message: '🛤️ You found a quiet route. +15 score.',
    effect: (run) => { run.score += 15; },
  },
  {
    id: 'stayed_hidden', tag: 'stealth', type: 'bonus',
    condition: (d) => d.stealth > 70,
    message: '🫥 You stayed perfectly hidden. +10 score.',
    effect: (run) => { run.score += 10; },
  },
  {
    id: 'calm_passage', tag: 'stealth', type: 'bonus',
    condition: (d) => d.threatLevel < 25 && d.stealth > 60,
    message: '✅ You passed through undetected. +20 score.',
    effect: (run) => { run.score += 20; },
  },
  {
    id: 'watcher_noticed', tag: 'threat', type: 'danger',
    condition: (d) => d.exposure > 65 && d.threatLevel > 50,
    message: '👁 A watcher noticed movement. −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'threat_surge', tag: 'threat', type: 'danger',
    condition: (d) => d.threatLevel > 75,
    message: '🚨 Threat level spiking — stay low! −10 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'safe_zone', tag: 'threat', type: 'bonus',
    condition: (d) => d.threatLevel < 20 && d.stealth > 50,
    message: '🟢 You reached a safe zone. +25 score.',
    effect: (run) => { run.score += 25; },
  },
];

// ── Night-time helper ─────────────────────────────────────────────────────────
function _isNightTime() {
  const h = typeof sensorRaw.hour === 'number' ? sensorRaw.hour : 0;
  return h >= 20 || h < 6;
}

// ── Internal tick state ───────────────────────────────────────────────────────
let _tickIntervalId     = null;
let _onUpdate           = null;
let _lastAnnouncedTier  = 0;
let _prevTiltMag        = 0;
let _stumbleCooldown    = 0;
let _detectionCooldown  = 0;
let _batteryWarnSent    = false;
let _nightWarnSent      = false;
let _silenceTimer       = 0;
let _shadowLogCooldown  = 0;
let _soundEmitTick      = 0;   // counts toward FOOTSTEP_EMIT_PERIOD

const _eventCooldowns = new Map();

const _sensorInfluence = {
  noise: 0, light: 0, battery: 0, brightness: 0, tilt: 0, threat: 0, stealth: 0,
};

const _energyLossCauses = {
  passive: 0, enemies: 0, noise: 0, light: 0, battery: 0, brightness: 0, tilt: 0, threat: 0,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start a brand-new run on the given stage.
 * @param {Function} onUpdate  callback invoked each tick / on state changes
 * @param {string}   [stageId] stage id from stageData.js; defaults to 'corridor'
 */
export function startRun(onUpdate, stageId = 'corridor') {
  resetExploreRun();
  exploreRun.active  = true;
  exploreRun.stageId = stageId;
  _onUpdate = onUpdate;

  // ── Load stage ──────────────────────────────────────────────────────────
  const stage = getStage(stageId);
  exploreRun.stage = stage;

  // Player spawn
  exploreRun.player = { ...stage.playerSpawn };

  // Escape point (first defined escape point in the stage)
  exploreRun.escapePoint = { ...stage.escapePoints[0] };

  // Objectives (copy with collected:false)
  exploreRun.objectives = stage.objectives
    ? stage.objectives.map(o => ({ ...o, collected: false }))
    : [];
  exploreRun._objectiveHintSent = false;

  // Spawn watchers from stage definition
  exploreRun.enemies = stage.watcherSpawns.map(spawn => {
    const group = ENEMY_GROUPS[Math.min(spawn.groupId ?? 0, ENEMY_GROUPS.length - 1)];
    return createWatcher(spawn, group);
  });

  // ── Reset internal counters ─────────────────────────────────────────────
  _eventCooldowns.clear();
  _lastAnnouncedTier = 0;
  const tx0 = typeof sensorRaw.tiltX === 'number' ? sensorRaw.tiltX : 0;
  const ty0 = typeof sensorRaw.tiltY === 'number' ? sensorRaw.tiltY : 0;
  _prevTiltMag       = Math.sqrt(tx0 * tx0 + ty0 * ty0);
  _stumbleCooldown   = 0;
  _detectionCooldown = 0;
  _batteryWarnSent   = false;
  _nightWarnSent     = false;
  _silenceTimer      = 0;
  _shadowLogCooldown = 0;
  _soundEmitTick     = 0;
  Object.keys(_sensorInfluence).forEach(k => (_sensorInfluence[k] = 0));
  Object.keys(_energyLossCauses).forEach(k => (_energyLossCauses[k] = 0));

  _tickIntervalId = setInterval(_gameTick, TICK_MS);

  _pushLog(`🗺️ Stage: ${stage.name}`, 'info');
  if (exploreRun.objectives && exploreRun.objectives.length > 0) {
    _pushLog(`🎯 Collect ${exploreRun.objectives.map(o => o.label).join(', ')}, then reach EXIT.`, 'info');
  } else {
    _pushLog('🏃 Run started — reach the EXIT to escape!', 'info');
  }
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

  if (reason === 'escaped') {
    _pushLog(`🎉 ESCAPED! Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`, 'bonus');
  } else if (reason === 'energy') {
    _pushLog(`💀 Energy depleted! Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`, 'danger');
  } else {
    _pushLog(`🚪 Run ended. Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`, 'info');
  }

  _onUpdate && _onUpdate('end');
}

// ── Game tick ─────────────────────────────────────────────────────────────────

function _gameTick() {
  const tickSec = TICK_MS / 1000;
  exploreRun.elapsed += tickSec;

  // ── Score multiplier tier ──────────────────────────────────────────────
  const scoreTier       = Math.floor(exploreRun.elapsed / SCORE_TIER_SECS);
  const scoreMultiplier = 1 + scoreTier * 0.25;
  if (scoreTier > _lastAnnouncedTier) {
    _lastAnnouncedTier = scoreTier;
    _pushLog(`⭐ ${formatTime(exploreRun.elapsed)} — Score ×${scoreMultiplier.toFixed(2)} now!`, 'bonus');
  }

  // ── 1. Move player (with wall collision) ──────────────────────────────
  _movePlayer(tickSec);

  // ── 2. Shadow coverage ────────────────────────────────────────────────
  _updateShadowCoverage();

  // ── 3. Stealth / silence tracking ─────────────────────────────────────
  _updateStealthMode(tickSec);

  // ── 4. Sound system — tick events and emit new ones ───────────────────
  _tickSoundSystem(tickSec);

  // ── 5. Battery effects ────────────────────────────────────────────────
  _checkBatteryEffects();

  // ── 6. Night-time effects ─────────────────────────────────────────────
  _checkNightEffects();

  // ── 7. Update watcher FOV ranges from environment ─────────────────────
  _updateWatcherFovRanges();

  // ── 8. Run watcher state machines ─────────────────────────────────────
  _updateWatchers();

  // ── 9. Score accumulation ─────────────────────────────────────────────
  const stealthBonus = derived.stealth / 100;
  const stealthMult  = exploreRun.inStealthMode ? 1.5 : 1.0;
  exploreRun.score  += (BASE_SCORE_PER_SEC + stealthBonus) * scoreMultiplier * stealthMult * tickSec;

  // ── 10. Energy drain ──────────────────────────────────────────────────
  const noiseDrain   = (derived.exposure / 100) * 0.04;
  const batteryDrain = (1 - derived.energyModifier / 100) * 0.05;
  const detectDrain  = exploreRun.isDetected ? 0.05 : 0;
  const totalDrain   = (ENERGY_DECAY_BASE + noiseDrain + batteryDrain + detectDrain) * tickSec;
  exploreRun.energy  = clamp(exploreRun.energy - totalDrain, 0, 100);
  _energyLossCauses.passive += ENERGY_DECAY_BASE * tickSec;

  // ── 11. Sensor influence accumulation ─────────────────────────────────
  _sensorInfluence.noise      += derived.exposure / 100;
  _sensorInfluence.light      += derived.visibility > 60 ? (derived.visibility - 60) / 40 : 0;
  _sensorInfluence.battery    += (1 - derived.energyModifier / 100);
  _sensorInfluence.tilt       += (1 - derived.stability / 100);
  _sensorInfluence.threat     += derived.threatLevel / 100;
  _sensorInfluence.stealth    += derived.stealth / 100;

  // ── 12. Danger meter ──────────────────────────────────────────────────
  _updateDanger();

  // ── 13. Tick down cooldowns ───────────────────────────────────────────
  if (_stumbleCooldown   > 0) _stumbleCooldown--;
  if (_detectionCooldown > 0) _detectionCooldown--;
  _eventCooldowns.forEach((v, k) => {
    if (v > 0) _eventCooldowns.set(k, v - 1);
  });

  // ── 14. Occasional random events ─────────────────────────────────────
  _fireEventMaybe();

  // ── 15. Objective collection check ───────────────────────────────────
  _checkObjectives();

  // ── 16. Check escape (win condition) ─────────────────────────────────
  if (_distToEscape() < ESCAPE_RADIUS) {
    const objectivesDone = !exploreRun.objectives || exploreRun.objectives.length === 0 ||
                           exploreRun.objectives.every(o => o.collected);
    if (objectivesDone) {
      exploreRun.escaped = true;
      endRun('escaped');
      return;
    } else if (!exploreRun._objectiveHintSent) {
      exploreRun._objectiveHintSent = true;
      const remaining = exploreRun.objectives.filter(o => !o.collected);
      _pushLog(`🚫 Need: ${remaining.map(o => o.label).join(', ')} before escaping!`, 'warn');
    }
  }

  // ── 16. Check energy-depleted lose condition ──────────────────────────
  if (exploreRun.energy <= 0) {
    endRun('energy');
    return;
  }

  _onUpdate && _onUpdate('tick');
}

// ── Player movement ───────────────────────────────────────────────────────────

function _movePlayer(tickSec) {
  const tx = typeof sensorRaw.tiltX === 'number' ? sensorRaw.tiltX : 0;
  const ty = typeof sensorRaw.tiltY === 'number' ? sensorRaw.tiltY : 0;

  const tiltMag   = Math.sqrt(tx * tx + ty * ty);
  const tiltDelta = Math.abs(tiltMag - _prevTiltMag);

  // Stumble: sudden large tilt change → burst sound + energy loss
  if (tiltDelta > STUMBLE_TILT_DELTA && _stumbleCooldown === 0) {
    _stumbleCooldown = STUMBLE_COOLDOWN_TICKS;
    const noiseBump = randInt(15, 25);
    _pushLog(`🌀 You slipped and made noise! (+${noiseBump} noise burst)`, 'danger');
    exploreRun.energy = clamp(exploreRun.energy - 5, 0, 100);
    _energyLossCauses.tilt += 5;
    _sensorInfluence.tilt  += INFLUENCE_DANGER_ADD;
    // Emit a loud burst sound at player position
    exploreRun.soundEvents.push(
      createSoundEvent(exploreRun.player.x, exploreRun.player.y, STUMBLE_SOUND_INTENSITY + randInt(0, 10), 'stumble'),
    );
  }
  _prevTiltMag = tiltMag;

  const speedMult = derived.energyModifier < LOW_BATTERY_THRESHOLD ? 0.6 : 1.0;
  const walls     = exploreRun.stage ? exploreRun.stage.walls : [];
  const props     = exploreRun.stage ? (exploreRun.stage.props || []) : [];
  const allBlockers = [...walls, ...props];
  const dx        = tx * PLAYER_SPEED * speedMult;
  const dy        = ty * PLAYER_SPEED * speedMult;
  const newPos    = moveWithCollision(exploreRun.player.x, exploreRun.player.y, dx, dy, allBlockers);
  exploreRun.player.x = clamp(newPos.x, 1, 99);
  exploreRun.player.y = clamp(newPos.y, 1, 99);
}

// ── Shadow coverage ───────────────────────────────────────────────────────────

function _updateShadowCoverage() {
  const light      = sensorRaw.ambientLight;
  const stage      = exploreRun.stage;
  const px         = exploreRun.player.x;
  const py         = exploreRun.player.y;
  const prevCov    = exploreRun.shadowCoverage;

  // Base shadow from ambient light
  let cov = light < SHADOW_LIGHT_THRESHOLD
    ? (SHADOW_LIGHT_THRESHOLD - light) / SHADOW_LIGHT_THRESHOLD
    : 0;

  // Stage shadow zones add extra cover
  if (stage && stage.shadowZones && inShadowZone(px, py, stage.shadowZones)) {
    cov = Math.min(1, cov + 0.60);
  }

  // Stage light zones reduce shadow cover
  if (stage && stage.lightZones && inLightZone(px, py, stage.lightZones)) {
    cov = Math.max(0, cov - 0.30);
  }

  exploreRun.shadowCoverage = cov;

  // Log once when entering significant shadow / light
  if (_shadowLogCooldown > 0) {
    _shadowLogCooldown--;
  } else if (cov > 0.5 && prevCov <= 0.5) {
    _pushLog('🌑 You merged into the shadows — exposure reduced.', 'bonus');
    _shadowLogCooldown = 300;
  } else if (cov < 0.15 && prevCov >= 0.5) {
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

// ── Sound system ──────────────────────────────────────────────────────────────

function _tickSoundSystem(tickSec) {
  const stage  = exploreRun.stage;
  const events = exploreRun.soundEvents;

  // Advance existing events
  tickSoundEvents(events);
  pruneExpiredEvents(events);

  // Emit footstep sound if player is moving
  _soundEmitTick++;
  if (_soundEmitTick >= FOOTSTEP_EMIT_PERIOD) {
    _soundEmitTick = 0;

    const tx = typeof sensorRaw.tiltX === 'number' ? sensorRaw.tiltX : 0;
    const ty = typeof sensorRaw.tiltY === 'number' ? sensorRaw.tiltY : 0;
    const tiltMag = Math.sqrt(tx * tx + ty * ty);

    // Base intensity: quiet footstep + noise + movement contribution
    const baseIntensity = FOOTSTEP_BASE_INTENSITY
      + (sensorRaw.noiseLevel / 100) * 40
      + tiltMag * 18;

    // Ghost mode drastically reduces sound emission
    const finalIntensity = exploreRun.inStealthMode ? baseIntensity * 0.15 : baseIntensity;

    if (finalIntensity > 2) {
      events.push(createSoundEvent(
        exploreRun.player.x, exploreRun.player.y,
        clamp(finalIntensity, 0, 100), 'footstep',
      ));
    }
  }

  // Emit an additional burst sound if noise spike detected
  if (sensorRaw.noiseLevel > NOISE_THRESHOLD && !exploreRun.inStealthMode) {
    const burst = sensorRaw.noiseLevel * 0.6;
    events.push(createSoundEvent(
      exploreRun.player.x, exploreRun.player.y, burst, 'burst',
    ));
    _sensorInfluence.noise += 0.5;
  }
}

// ── Battery / night effects ───────────────────────────────────────────────────

function _checkBatteryEffects() {
  if (_batteryWarnSent) return;
  if (derived.energyModifier < LOW_BATTERY_THRESHOLD) {
    _batteryWarnSent = true;
    _pushLog('🪫 Low power — movement slowed, abilities reduced!', 'warn');
    _sensorInfluence.battery += INFLUENCE_DANGER_ADD;
  }
}

function _checkNightEffects() {
  if (_nightWarnSent) return;
  if (_isNightTime()) {
    _nightWarnSent = true;
    _pushLog('🌙 Night has fallen — watchers are faster and more alert.', 'warn');
  }
}

// ── Watcher FOV range update ──────────────────────────────────────────────────

function _updateWatcherFovRanges() {
  const lightFactor  = 1 + sensorRaw.ambientLight / 200;
  const shadowFactor = 1 - exploreRun.shadowCoverage * 0.40;
  exploreRun.enemies.forEach(w => {
    const group = ENEMY_GROUPS[Math.min(w.groupId, ENEMY_GROUPS.length - 1)];
    w.fovRange = clamp(
      group.fovRange * lightFactor * shadowFactor,
      4, group.fovRange * 1.5,
    );
  });
}

// ── Watcher updates ───────────────────────────────────────────────────────────

function _updateWatchers() {
  if (!exploreRun.stage) return;

  const player      = exploreRun.player;
  const playerR     = _computePlayerDetectionRadius();
  exploreRun.playerDetectionRadius = playerR;

  const soundEvents  = exploreRun.soundEvents;
  const walls        = exploreRun.stage.walls;
  const props        = exploreRun.stage.props || [];
  const allBlockers  = [...walls, ...props];
  const indoor       = exploreRun.stage.indoor;
  const isNight      = _isNightTime();
  const shadowCov    = exploreRun.shadowCoverage;

  let anyChasing    = false;
  let anyDetected   = false;

  // Keep watchers that haven't permanently lost the player (they're never removed
  // except when they catch the player)
  exploreRun.enemies = exploreRun.enemies.filter(w => {
    const res = updateWatcher(w, player, playerR, soundEvents, allBlockers, indoor, isNight, shadowCov);

    // Log on significant state transitions
    if (res.stateChanged) {
      switch (res.stateChanged) {
        case WS.SUSPICIOUS:
          _pushLog('👂 Watcher heard something...', 'warn');
          break;
        case WS.LISTENING:
          _pushLog('👁 Watcher is listening...', 'warn');
          break;
        case WS.INVESTIGATING:
          _pushLog('🔍 Watcher is investigating a noise.', 'warn');
          _sensorInfluence.noise += 1;
          break;
        case WS.ALERTED:
          _pushLog('⚠️ Watcher on high alert — searching the area!', 'danger');
          _sensorInfluence.threat += INFLUENCE_DANGER_ADD;
          break;
        case WS.CHASING:
          if (_detectionCooldown === 0) {
            const dmg = randInt(8, 18);
            exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
            _energyLossCauses.enemies += dmg;
            _detectionCooldown = DETECTION_COOLDOWN;
            _pushLog(`🚨 DETECTED! A watcher spotted you! −${dmg} energy.`, 'danger');
            _sensorInfluence.threat += INFLUENCE_DANGER_ADD;
          }
          anyDetected = true;
          break;
        case WS.RETURNING:
          _pushLog('↩ Watcher is returning to patrol.', 'info');
          break;
        default: break;
      }
    }

    if (w.state === WS.CHASING) {
      anyChasing   = true;
      anyDetected  = true;
    }

    // Catch check: watcher in CHASING state catches the player
    if (w.state === WS.CHASING) {
      const dx   = player.x - w.x;
      const dy   = player.y - w.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ENEMY_CATCH_DIST) {
        const dmg = randInt(12, 24);
        exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
        _energyLossCauses.enemies += dmg;
        _pushLog(`👾 Watcher caught you! −${dmg} energy.`, 'danger');
        return false; // remove this watcher after catching
      }
    }

    return true;
  });

  exploreRun.isDetected = anyDetected;
}

// ── Player detection radius ───────────────────────────────────────────────────

function _computePlayerDetectionRadius() {
  const noise      = sensorRaw.noiseLevel;
  const light      = sensorRaw.ambientLight;
  const brightness = sensorRaw.brightnessLevel;

  let r = PLAYER_BASE_DETECT_R;
  r += (noise      / 100) * PLAYER_RADIUS_NOISE_MULT;
  r += (light      / 100) * PLAYER_RADIUS_LIGHT_MULT;
  r += (brightness / 100) * PLAYER_RADIUS_BRIGHT_MULT;
  r *= (1 - exploreRun.shadowCoverage * 0.65);
  if (exploreRun.inStealthMode) r *= 0.2;

  return clamp(r, 1, 30);
}

// ── Objectives ────────────────────────────────────────────────────────────────

function _checkObjectives() {
  if (!exploreRun.objectives || exploreRun.objectives.length === 0) return;
  const px = exploreRun.player.x;
  const py = exploreRun.player.y;
  for (const obj of exploreRun.objectives) {
    if (obj.collected) continue;
    const dx = px - obj.pos.x;
    const dy = py - obj.pos.y;
    if (Math.sqrt(dx * dx + dy * dy) <= (obj.radius || 6)) {
      obj.collected = true;
      const icon = obj.type === 'key' ? '🔑' : '⚡';
      _pushLog(`${icon} ${obj.label} acquired! Proceed to EXIT.`, 'bonus');
      exploreRun.score += 30;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _distToEscape() {
  const dx = exploreRun.player.x - exploreRun.escapePoint.x;
  const dy = exploreRun.player.y - exploreRun.escapePoint.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function _updateDanger() {
  const watcherPressure = exploreRun.enemies.reduce((sum, w) => {
    if (w.state === WS.CHASING)       return sum + 1.0;
    if (w.state === WS.ALERTED)       return sum + 0.7;
    if (w.state === WS.INVESTIGATING) return sum + 0.4;
    if (w.state === WS.LISTENING)     return sum + 0.2;
    if (w.state === WS.SUSPICIOUS)    return sum + 0.1;
    return sum;
  }, 0);
  const maxWatchers = Math.max(1, exploreRun.enemies.length);
  const enemyPart   = (watcherPressure / maxWatchers) * 100 * 0.40;
  const threatPart  = derived.threatLevel * 0.30;
  const energyPart  = (1 - exploreRun.energy / 100) * 100 * 0.20;
  const exposePart  = derived.exposure * 0.10;

  const rawDanger = enemyPart + threatPart + energyPart + exposePart;
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
