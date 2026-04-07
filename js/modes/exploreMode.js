/**
 * exploreMode.js
 * Short run-based mode — lasts 1–3 minutes.
 *
 * Design:
 *  - A "run" ticks forward in real time.
 *  - Random events fire based on derived states.
 *  - Enemies spawn and move toward the player; being caught costs energy.
 *  - Score accumulates while alive; bonuses from events.
 *  - The run ends when energy hits 0 OR the player presses "End Run".
 *
 * This module owns all game-logic only — no DOM code.
 * The screens/components layer calls start/pause/resume/end and reads state.
 */

import {
  exploreRun, derived, resetExploreRun,
} from '../state.js';
import { clamp, randInt, randFloat, pickRandom, formatTime } from '../utils.js';

// ── Tuning constants ─────────────────────────────────────────────────────────
const TICK_MS            = 500;   // game logic tick interval
const BASE_SCORE_PER_SEC = 2;     // score earned per second just by surviving
const ENEMY_SPAWN_BASE   = 0.04;  // base chance per tick of spawning an enemy
const MAX_ENEMIES        = 5;
const ENERGY_DECAY_BASE  = 0.3;   // energy lost per tick from passive drain
const EVENT_CHANCE_BASE  = 0.08;  // chance per tick of a random event

// Possible random events pool
const EVENT_POOL = [
  {
    id: 'hidden_route',
    condition: (d) => d.stealth > 55,
    message:   'You found a quiet route. +15 score.',
    effect:    (run) => { run.score += 15; },
  },
  {
    id: 'watcher_noticed',
    condition: (d) => d.exposure > 65 && d.threatLevel > 50,
    message:   'A watcher noticed movement. −10 energy.',
    effect:    (run) => { run.energy = clamp(run.energy - 10, 0, 100); },
  },
  {
    id: 'stayed_hidden',
    condition: (d) => d.stealth > 70,
    message:   'You stayed hidden. +10 score.',
    effect:    (run) => { run.score += 10; },
  },
  {
    id: 'low_battery',
    condition: (d) => d.energyModifier < 30,
    message:   'Low battery weakened your recovery. −5 energy.',
    effect:    (run) => { run.energy = clamp(run.energy - 5, 0, 100); },
  },
  {
    id: 'noise_exposed',
    condition: (d) => d.exposure > 75,
    message:   'Loud noise exposed your position! −15 energy.',
    effect:    (run) => { run.energy = clamp(run.energy - 15, 0, 100); },
  },
  {
    id: 'dark_cover',
    condition: (d) => d.visibility < 35,
    message:   'Darkness provides cover. +8 score.',
    effect:    (run) => { run.score += 8; },
  },
  {
    id: 'unstable_terrain',
    condition: (d) => d.stability < 40,
    message:   'Unstable movement. −8 energy.',
    effect:    (run) => { run.energy = clamp(run.energy - 8, 0, 100); },
  },
  {
    id: 'calm_passage',
    condition: (d) => d.threatLevel < 25 && d.stealth > 60,
    message:   'You passed through undetected. +20 score.',
    effect:    (run) => { run.score += 20; },
  },
];

// ── Simple enemy type ─────────────────────────────────────────────────────────
let _enemyId = 0;
// Scales enemy speed by threat level — higher threat produces faster enemies
const THREAT_SPEED_MULTIPLIER = 1 / 100; // per threat unit above baseline

function spawnEnemy() {
  // Enemies live in a 0–100 × 0–100 abstract grid
  return {
    id:    _enemyId++,
    x:     pickRandom([0, 100, randInt(0, 100)]),
    y:     pickRandom([0, 100, randInt(0, 100)]),
    speed: randFloat(0.5, 2.0) * (1 + derived.threatLevel * THREAT_SPEED_MULTIPLIER),
  };
}

// ── Internal tick state ───────────────────────────────────────────────────────
let _tickIntervalId = null;
let _onUpdate       = null; // callback for UI re-render

// ── Public API ────────────────────────────────────────────────────────────────

/** Start a brand-new run. */
export function startRun(onUpdate) {
  resetExploreRun();
  exploreRun.active = true;
  _onUpdate = onUpdate;

  _tickIntervalId = setInterval(_gameTick, TICK_MS);
  _pushLog('Run started. Survive and score as high as you can!');
  _onUpdate && _onUpdate('start');
}

/** Pause the current run. */
export function pauseRun() {
  if (!exploreRun.active || exploreRun.paused) return;
  exploreRun.paused = true;
  clearInterval(_tickIntervalId);
  _tickIntervalId = null;
  _pushLog('— Run paused —');
  _onUpdate && _onUpdate('pause');
}

/** Resume a paused run. */
export function resumeRun() {
  if (!exploreRun.active || !exploreRun.paused) return;
  exploreRun.paused = false;
  _tickIntervalId = setInterval(_gameTick, TICK_MS);
  _pushLog('— Run resumed —');
  _onUpdate && _onUpdate('resume');
}

/** End the run (player choice or energy=0). */
export function endRun(reason = 'player') {
  if (_tickIntervalId) {
    clearInterval(_tickIntervalId);
    _tickIntervalId = null;
  }
  exploreRun.active  = false;
  exploreRun.paused  = false;
  const msg = reason === 'energy'
    ? 'Energy depleted — run over!'
    : 'Run ended by player.';
  _pushLog(`${msg} Final score: ${Math.floor(exploreRun.score)} in ${formatTime(exploreRun.elapsed)}`);
  _onUpdate && _onUpdate('end');
}

// ── Game tick ─────────────────────────────────────────────────────────────────

function _gameTick() {
  const tickSec = TICK_MS / 1000;

  // Advance timer
  exploreRun.elapsed += tickSec;

  // Score accumulation (score/sec scales with stealth)
  const stealthBonus = derived.stealth / 100;
  exploreRun.score  += (BASE_SCORE_PER_SEC + stealthBonus) * tickSec;

  // Energy drain — modified by energyModifier and noise
  const drainMod = 1 + (1 - derived.energyModifier / 100) * 0.8;
  exploreRun.energy = clamp(exploreRun.energy - ENERGY_DECAY_BASE * drainMod, 0, 100);

  // Enemy spawning
  _spawnEnemyMaybe();

  // Enemy movement and collision
  _updateEnemies();

  // Random events
  _fireEventMaybe();

  // Check win/lose condition
  if (exploreRun.energy <= 0) {
    endRun('energy');
    return;
  }

  _onUpdate && _onUpdate('tick');
}

function _spawnEnemyMaybe() {
  if (exploreRun.enemies.length >= MAX_ENEMIES) return;
  // Higher threat = more spawns
  const spawnChance = ENEMY_SPAWN_BASE * (1 + derived.threatLevel / 50);
  if (Math.random() < spawnChance) {
    exploreRun.enemies.push(spawnEnemy());
  }
}

function _updateEnemies() {
  const pX = 50; const pY = 50; // player always at centre of abstract grid
  const CATCH_DIST = 8;

  exploreRun.enemies = exploreRun.enemies.filter(e => {
    // Move enemy toward player
    const dx = pX - e.x;
    const dy = pY - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return false; // despawn if at player

    const speed = e.speed * (1 + derived.exposure / 200);
    e.x += (dx / dist) * speed;
    e.y += (dy / dist) * speed;

    // Stealth: high stealth makes enemies wander instead of homing
    if (derived.stealth > 70 && Math.random() < 0.3) {
      e.x += randFloat(-3, 3);
      e.y += randFloat(-3, 3);
    }

    // Caught?
    const newDist = Math.sqrt((pX - e.x) ** 2 + (pY - e.y) ** 2);
    if (newDist < CATCH_DIST) {
      const dmg = randInt(8, 18);
      exploreRun.energy = clamp(exploreRun.energy - dmg, 0, 100);
      _pushLog(`An enemy caught you! −${dmg} energy.`);
      return false; // remove enemy after catching
    }
    return true;
  });
}

function _fireEventMaybe() {
  const eventChance = EVENT_CHANCE_BASE * (1 + derived.threatLevel / 100);
  if (Math.random() > eventChance) return;

  const eligible = EVENT_POOL.filter(ev => ev.condition(derived));
  if (eligible.length === 0) return;

  const ev = pickRandom(eligible);
  ev.effect(exploreRun);
  _pushLog(ev.message);
}

/** Prepend a log entry; keep last 20. */
function _pushLog(msg) {
  exploreRun.log.unshift(msg);
  if (exploreRun.log.length > 20) exploreRun.log.pop();
}
