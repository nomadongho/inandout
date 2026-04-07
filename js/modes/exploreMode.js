/**
 * exploreMode.js
 * Short run-based mode — lasts 1–3 minutes.
 *
 * Design:
 *  - A "run" ticks forward every 500 ms.
 *  - Score multiplier increases every 30 s survived.
 *  - Danger meter tracks blended threat pressure each tick.
 *  - 20-event pool fires with per-event cooldowns (no spam).
 *  - Each event is tagged to a sensor category.
 *  - Sensor influence and energy-loss causes are accumulated so the
 *    end-of-run summary can report the strongest factor and the main
 *    reason energy ran out.
 *  - The run ends when energy hits 0 OR the player presses "End Run".
 *
 * This module owns all game-logic only — no DOM code.
 */

import {
  exploreRun, derived, resetExploreRun,
} from '../state.js';
import { clamp, randInt, randFloat, pickRandom, formatTime } from '../utils.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const TICK_MS              = 500;   // game-logic tick interval (ms)
const BASE_SCORE_PER_SEC   = 2;     // score earned per second just by surviving
const SCORE_TIER_SECS      = 30;    // every N seconds the score multiplier steps up
const ENEMY_SPAWN_BASE     = 0.04;  // base chance per tick of spawning an enemy
const MAX_ENEMIES          = 5;
const ENERGY_DECAY_BASE    = 0.25;  // energy lost per tick from passive drain
const EVENT_CHANCE_BASE    = 0.07;  // base chance per tick a random event fires
const EVENT_COOLDOWN_TICKS = 6;     // ticks before the same event can fire again
// Sensor influence adjustments applied when an event fires
const INFLUENCE_DANGER_ADD = 4;     // how much a danger event worsens sensor influence
const INFLUENCE_BONUS_SUB  = 2;     // how much a bonus event improves sensor influence
// Approximate energy loss recorded per danger event for cause-of-failure tracking.
// The actual amount varies by event; this fixed value is a representative estimate
// used only for relative comparison in the end-of-run summary.
const CAUSE_APPROX_ENERGY  = 10;

// ── Expanded event pool ───────────────────────────────────────────────────────
// type: 'danger' | 'bonus' | 'warn'
// tag:  sensor category key for influence tracking
const EVENT_POOL = [
  // ── Noise ──────────────────────────────────────────────────────────────────
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
  // ── Ambient light ───────────────────────────────────────────────────────────
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
  // ── Battery ─────────────────────────────────────────────────────────────────
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
  // ── Brightness ──────────────────────────────────────────────────────────────
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
  // ── Tilt / stability ────────────────────────────────────────────────────────
  {
    id: 'unstable_terrain',
    tag: 'tilt', type: 'danger',
    condition: (d) => d.stability < 35,
    message: '📳 Unstable movement detected! −8 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'stumbled',
    tag: 'tilt', type: 'danger',
    condition: (d) => d.stability < 20,
    message: '🌀 You stumbled — position exposed! −15 energy.',
    effect: (run) => { run.energy = clamp(run.energy - 15, 0, 100); },
  },
  {
    id: 'steady_steps',
    tag: 'tilt', type: 'bonus',
    condition: (d) => d.stability > 70,
    message: '🚶 Steady movement keeps you hidden. +8 score.',
    effect: (run) => { run.score += 8; },
  },
  // ── Stealth / threat ────────────────────────────────────────────────────────
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

// ── Simple enemy type ─────────────────────────────────────────────────────────
let _enemyId = 0;
const THREAT_SPEED_MULTIPLIER = 1 / 100;

function spawnEnemy() {
  return {
    id:    _enemyId++,
    x:     pickRandom([0, 100, randInt(0, 100)]),
    y:     pickRandom([0, 100, randInt(0, 100)]),
    speed: randFloat(0.5, 2.0) * (1 + derived.threatLevel * THREAT_SPEED_MULTIPLIER),
  };
}

// ── Internal tick state ───────────────────────────────────────────────────────
let _tickIntervalId    = null;
let _onUpdate          = null;
/** Tracks the last score tier announced, to fire the milestone exactly once. */
let _lastAnnouncedTier = 0;

/** Per-event cooldown map: eventId → remaining ticks */
const _eventCooldowns = new Map();

/** How much each sensor category pushed against the player (higher = worse) */
const _sensorInfluence = {
  noise:      0,
  light:      0,
  battery:    0,
  brightness: 0,
  tilt:       0,
  threat:     0,
  stealth:    0,
};

/** Approximate energy drained per cause (for end-summary "main cause") */
const _energyLossCauses = {
  passive:    0,
  enemies:    0,
  noise:      0,
  light:      0,
  battery:    0,
  brightness: 0,
  tilt:       0,
  threat:     0,
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Start a brand-new run. */
export function startRun(onUpdate) {
  resetExploreRun();
  exploreRun.active = true;
  _onUpdate = onUpdate;

  _eventCooldowns.clear();
  _lastAnnouncedTier = 0;
  Object.keys(_sensorInfluence).forEach(k => (_sensorInfluence[k] = 0));
  Object.keys(_energyLossCauses).forEach(k => (_energyLossCauses[k] = 0));

  _tickIntervalId = setInterval(_gameTick, TICK_MS);
  _pushLog('🏃 Run started — survive and score high!', 'info');
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

/** End the run (player choice or energy = 0). */
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

  const endMsg = reason === 'energy'
    ? `💀 Energy depleted! Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`
    : `🚪 Run ended. Score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`;
  _pushLog(endMsg, reason === 'energy' ? 'danger' : 'info');

  _onUpdate && _onUpdate('end');
}

// ── Game tick ─────────────────────────────────────────────────────────────────

function _gameTick() {
  const tickSec = TICK_MS / 1000;

  // Advance timer
  exploreRun.elapsed += tickSec;

  // Score multiplier steps up every SCORE_TIER_SECS seconds
  const scoreTier       = Math.floor(exploreRun.elapsed / SCORE_TIER_SECS);
  const scoreMultiplier = 1 + scoreTier * 0.25;

  // Announce each tier increase exactly once
  if (scoreTier > _lastAnnouncedTier) {
    _lastAnnouncedTier = scoreTier;
    _pushLog(
      `⭐ ${formatTime(exploreRun.elapsed)} — Score ×${scoreMultiplier.toFixed(2)} now!`,
      'bonus',
    );
  }

  // Score accumulation
  const stealthBonus = derived.stealth / 100;
  exploreRun.score  += (BASE_SCORE_PER_SEC + stealthBonus) * scoreMultiplier * tickSec;

  // Energy drain — noise exposure and low battery both accelerate drain
  const noiseDrain   = (derived.exposure / 100) * 0.4;
  const batteryDrain = (1 - derived.energyModifier / 100) * 0.5;
  const totalDrain   = (ENERGY_DECAY_BASE + noiseDrain + batteryDrain) * tickSec;
  exploreRun.energy  = clamp(exploreRun.energy - totalDrain, 0, 100);
  _energyLossCauses.passive += ENERGY_DECAY_BASE * tickSec;

  // Accumulate per-sensor influence (higher = sensor pushed harder against player)
  _sensorInfluence.noise      += derived.exposure / 100;
  _sensorInfluence.light      += derived.visibility > 60 ? (derived.visibility - 60) / 40 : 0;
  _sensorInfluence.battery    += (1 - derived.energyModifier / 100);
  _sensorInfluence.tilt       += (1 - derived.stability / 100);
  _sensorInfluence.threat     += derived.threatLevel / 100;
  _sensorInfluence.stealth    += derived.stealth / 100;

  // Danger meter
  _updateDanger();

  // Enemies
  _spawnEnemyMaybe();
  _updateEnemies();

  // Tick down event cooldowns
  _eventCooldowns.forEach((v, k) => {
    if (v > 0) _eventCooldowns.set(k, v - 1);
  });

  // Random events
  _fireEventMaybe();

  // Check energy-depleted lose condition
  if (exploreRun.energy <= 0) {
    endRun('energy');
    return;
  }

  _onUpdate && _onUpdate('tick');
}

function _updateDanger() {
  const threatPart = derived.threatLevel * 0.35;
  const enemyPart  = (exploreRun.enemies.length / MAX_ENEMIES) * 100 * 0.30;
  const energyPart = (1 - exploreRun.energy / 100) * 100 * 0.20;
  const exposePart = derived.exposure * 0.15;
  const rawDanger  = threatPart + enemyPart + energyPart + exposePart;
  // Smooth toward target
  exploreRun.danger = clamp(
    exploreRun.danger + (rawDanger - exploreRun.danger) * 0.2,
    0, 100,
  );
}

function _spawnEnemyMaybe() {
  if (exploreRun.enemies.length >= MAX_ENEMIES) return;
  const spawnChance = ENEMY_SPAWN_BASE * (1 + derived.threatLevel / 50);
  if (Math.random() < spawnChance) {
    exploreRun.enemies.push(spawnEnemy());
  }
}

function _updateEnemies() {
  const pX = 50;
  const pY = 50;
  const CATCH_DIST = 8;

  exploreRun.enemies = exploreRun.enemies.filter(e => {
    const dx   = pX - e.x;
    const dy   = pY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return false;

    const speed = e.speed * (1 + derived.exposure / 200);
    e.x += (dx / dist) * speed;
    e.y += (dy / dist) * speed;

    // High stealth makes enemies wander instead of homing
    if (derived.stealth > 70 && Math.random() < 0.3) {
      e.x += randFloat(-3, 3);
      e.y += randFloat(-3, 3);
    }

    const newDist = Math.sqrt((pX - e.x) ** 2 + (pY - e.y) ** 2);
    if (newDist < CATCH_DIST) {
      const dmg = randInt(8, 18);
      exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
      _energyLossCauses.enemies += dmg;
      _pushLog(`👾 Enemy caught you! −${dmg} energy.`, 'danger');
      return false;
    }
    return true;
  });
}

function _fireEventMaybe() {
  const eventChance = EVENT_CHANCE_BASE * (1 + derived.threatLevel / 100);
  if (Math.random() > eventChance) return;

  // Only events whose cooldown has expired
  const eligible = EVENT_POOL.filter(ev => {
    const cd = _eventCooldowns.get(ev.id) || 0;
    return cd === 0 && ev.condition(derived);
  });
  if (eligible.length === 0) return;

  const ev = pickRandom(eligible);
  ev.effect(exploreRun);
  _pushLog(ev.message, ev.type);

  // Update sensor influence from this event
  if (ev.tag && ev.tag in _sensorInfluence) {
    _sensorInfluence[ev.tag] += ev.type === 'danger' ? INFLUENCE_DANGER_ADD : -INFLUENCE_BONUS_SUB;
  }

  // Record approximate energy loss per cause for end-of-run summary comparison
  if (ev.type === 'danger' && ev.tag in _energyLossCauses) {
    _energyLossCauses[ev.tag] += CAUSE_APPROX_ENERGY;
  }

  // Apply cooldown so the event cannot fire again immediately
  _eventCooldowns.set(ev.id, EVENT_COOLDOWN_TICKS);
}

// ── Summary helpers ───────────────────────────────────────────────────────────

function _getTopSensorInfluence() {
  const labels = {
    noise:      'Noise',
    light:      'Ambient Light',
    battery:    'Battery',
    brightness: 'Brightness',
    tilt:       'Tilt Stability',
    threat:     'Threat Level',
    stealth:    'Stealth',
  };
  let topKey = 'threat';
  let topVal = -Infinity;
  Object.entries(_sensorInfluence).forEach(([k, v]) => {
    if (v > topVal) { topVal = v; topKey = k; }
  });
  return labels[topKey] || topKey;
}

function _getMainCause() {
  const labels = {
    passive:    'Energy decay',
    enemies:    'Enemy encounters',
    noise:      'Noise exposure',
    light:      'Ambient light',
    battery:    'Low battery',
    brightness: 'Screen brightness',
    tilt:       'Unstable movement',
    threat:     'High threat level',
  };
  let topKey = 'passive';
  let topVal = _energyLossCauses.passive;
  Object.entries(_energyLossCauses).forEach(([k, v]) => {
    if (k !== 'passive' && v > topVal) { topVal = v; topKey = k; }
  });
  return labels[topKey] || topKey;
}

/** Prepend a log entry; keep last 20. */
function _pushLog(msg, type = 'info') {
  exploreRun.log.unshift({ msg, type, time: formatTime(exploreRun.elapsed) });
  if (exploreRun.log.length > 20) exploreRun.log.pop();
}
