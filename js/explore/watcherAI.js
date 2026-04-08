/**
 * watcherAI.js
 * Watcher (guard) state machine and per-tick update logic.
 *
 * ── States ────────────────────────────────────────────────────────────────────
 *  IDLE          Normal patrol along predefined waypoints
 *  SUSPICIOUS    Weak signal detected — turns toward source, pauses
 *  LISTENING     Evaluating evidence — builds or loses confidence
 *  INVESTIGATING Moving toward approximate source area
 *  ALERTED       High confidence — aggressive area search
 *  CHASING       Confirmed visual — direct pursuit
 *  RETURNING     Lost target — heading back to patrol point
 */

import { hasLineOfSight } from './geometry.js';
import { soundIntensityAt } from './soundSystem.js';

// ── Exported state constants ──────────────────────────────────────────────────
export const WS = {
  IDLE:          'IDLE',
  SUSPICIOUS:    'SUSPICIOUS',
  LISTENING:     'LISTENING',
  INVESTIGATING: 'INVESTIGATING',
  ALERTED:       'ALERTED',
  CHASING:       'CHASING',
  RETURNING:     'RETURNING',
};

// ── Timing (game ticks ≈ 100 ms each) ────────────────────────────────────────
const SUSPICIOUS_MAX_TICKS   = 14;
const LISTENING_MAX_TICKS    = 22;
const INVESTIGATING_MAX_TICKS = 65;
const ALERTED_MAX_TICKS       = 45;
const CHASE_LOSE_TICKS        = 35;

// ── Suspicion thresholds (0–100) ─────────────────────────────────────────────
const TH_SUSPICIOUS   = 8;   // enter SUSPICIOUS from IDLE
const TH_INVESTIGATE  = 45;  // escalate to INVESTIGATING
const TH_ALERT        = 68;  // escalate to ALERTED
const TH_CHASE        = 84;  // escalate to CHASING

// ── Suspicion gain / decay per tick ──────────────────────────────────────────
const GAIN_SOUND_WEAK      = 10;
const GAIN_SOUND_STRONG    = 24;
const GAIN_VISION          = 20;
const GAIN_VISION_SUSTAINED = 30;  // after VISION_CONFIRM_TICKS consecutive ticks
const VISION_CONFIRM_TICKS  = 4;
const DECAY_IDLE            = 1.2;
const DECAY_SUSPICIOUS      = 0.7;

// ── Hearing thresholds per group ─────────────────────────────────────────────
// Group 0 = standard, 1 = scout (sensitive), 2 = guardian (poor hearing)
const HEARING_THRESHOLD = [13, 8, 21];

// ── Movement speeds ───────────────────────────────────────────────────────────
const SPEED_IDLE        = 0.34;
const SPEED_INVESTIGATE = 0.50;
const SPEED_ALERTED     = 0.58;
const SPEED_CHASING     = 0.82;
const SPEED_RETURNING   = 0.44;

// Fraction of angle-delta to turn per tick (smooth rotation)
const TURN_SPEED = 0.20;

// Distance to waypoint to be considered "arrived"
const ARRIVE_DIST = 4;

// ── Auto-incrementing id ──────────────────────────────────────────────────────
let _nextId = 0;

// ── Watcher factory ───────────────────────────────────────────────────────────

/**
 * Create a watcher object from a stage spawn entry.
 *
 * @param {object} spawn  { x, y, facing, groupId, patrolPath }
 * @param {object} group  ENEMY_GROUPS[groupId] profile from exploreMode.js
 * @returns {Watcher}
 */
export function createWatcher(spawn, group) {
  return {
    id:           _nextId++,
    x:            spawn.x,
    y:            spawn.y,
    groupId:      spawn.groupId ?? 0,
    fovRange:     group.fovRange,
    fovHalfAngle: group.fovHalfAngle,
    hearingRange: group.hearingRange,
    speedMult:    group.speedMult ?? 1,
    facingAngle:  spawn.facing ?? 0,
    patrolPath:   spawn.patrolPath ? [...spawn.patrolPath] : [],
    patrolPathIdx: 0,

    // ── State machine ──────────────────────────────────────────────────────
    state:        WS.IDLE,
    stateTimer:   0,
    suspicion:    0,        // 0–100

    // ── Memory ────────────────────────────────────────────────────────────
    lastKnownPos:      null,   // last seen player {x,y}
    lastHeardPos:      null,   // last heard sound source {x,y}
    investigateTarget: null,   // current move target during INVESTIGATING
    returnTarget:      null,   // patrol point to return to

    // ── Vision tracking ───────────────────────────────────────────────────
    visionTicks:   0,          // consecutive ticks with direct LOS

    // ── Legacy / renderer-compatibility fields ────────────────────────────
    alerted:        false,
    soundReacting:  false,
    alertTicks:     0,
    soundReactTicks: 0,
    soundSourceX:   0,
    soundSourceY:   0,
  };
}

// ── Main update entry ─────────────────────────────────────────────────────────

/**
 * Update a single watcher for one tick.
 *
 * @param {object}   w            Watcher (mutated in place)
 * @param {{x,y}}    player
 * @param {number}   playerR      Player detection radius
 * @param {Array}    soundEvents  Active sound events
 * @param {Array}    walls        Stage walls
 * @param {boolean}  indoor
 * @param {boolean}  isNight
 * @returns {{ heard:boolean, saw:boolean, stateChanged:string|null }}
 */
export function updateWatcher(w, player, playerR, soundEvents, walls, indoor, isNight) {
  const result = { heard: false, saw: false, stateChanged: null };
  w.stateTimer++;

  // ── 1. Sound check ────────────────────────────────────────────────────────
  let bestIntensity  = 0;
  let bestSoundPos   = null;

  for (const ev of soundEvents) {
    const intensity = soundIntensityAt(ev, w.x, w.y, walls, indoor);
    const threshold  = HEARING_THRESHOLD[Math.min(w.groupId, 2)];
    if (intensity > threshold && intensity > bestIntensity) {
      bestIntensity = intensity;
      bestSoundPos  = { x: ev.x, y: ev.y };
    }
  }

  if (bestSoundPos) {
    result.heard      = true;
    w.lastHeardPos    = { ...bestSoundPos };
    w.soundSourceX    = bestSoundPos.x;
    w.soundSourceY    = bestSoundPos.y;
    w.soundReactTicks = 8;
  }

  // ── 2. Vision / LOS check ────────────────────────────────────────────────
  const dx   = player.x - w.x;
  const dy   = player.y - w.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const angleToPlayer    = dist > 0.01 ? Math.atan2(dy, dx) : w.facingAngle;
  const angleDelta       = Math.abs(_angleDiff(angleToPlayer, w.facingAngle));
  const angularExpansion = dist > 0.01 ? Math.asin(Math.min(1, playerR / dist)) : Math.PI;
  const effectiveDist    = dist - playerR;

  const inCone = effectiveDist < w.fovRange && angleDelta <= (w.fovHalfAngle + angularExpansion);
  const hasLOS = inCone && hasLineOfSight(w.x, w.y, player.x, player.y, walls);

  if (hasLOS) {
    w.visionTicks++;
    w.lastKnownPos = { x: player.x, y: player.y };
    result.saw     = true;
  } else {
    w.visionTicks = Math.max(0, w.visionTicks - 1);
  }

  // ── 3. Suspicion update ───────────────────────────────────────────────────
  _updateSuspicion(w, bestIntensity, result.saw);

  // ── 4. State transitions ──────────────────────────────────────────────────
  const prevState = w.state;
  _transitionState(w, result.saw, result.heard);
  if (w.state !== prevState) result.stateChanged = w.state;

  // ── 5. Movement / behaviour per state ────────────────────────────────────
  _executeState(w, player, isNight);

  // ── 6. Sync legacy renderer fields ───────────────────────────────────────
  w.alerted      = w.state === WS.ALERTED || w.state === WS.CHASING;
  w.soundReacting = w.state === WS.SUSPICIOUS || w.state === WS.LISTENING ||
                    w.state === WS.INVESTIGATING;
  w.alertTicks   = w.alerted ? 1 : 0;

  return result;
}

// ── Suspicion update ──────────────────────────────────────────────────────────

function _updateSuspicion(w, soundIntensity, sawPlayer) {
  if (sawPlayer) {
    const gain = w.visionTicks >= VISION_CONFIRM_TICKS
      ? GAIN_VISION_SUSTAINED : GAIN_VISION;
    w.suspicion = Math.min(100, w.suspicion + gain);
  } else if (soundIntensity > 0) {
    const gain = soundIntensity > 30 ? GAIN_SOUND_STRONG : GAIN_SOUND_WEAK;
    w.suspicion = Math.min(100, w.suspicion + gain);
  } else {
    const decay = w.state === WS.IDLE ? DECAY_IDLE : DECAY_SUSPICIOUS;
    w.suspicion = Math.max(0, w.suspicion - decay);
  }
}

// ── State machine transitions ─────────────────────────────────────────────────

function _transitionState(w, sawPlayer, heardSound) {
  switch (w.state) {

    case WS.IDLE:
      if (w.suspicion >= TH_CHASE) {
        _setState(w, WS.CHASING);
      } else if (w.suspicion >= TH_ALERT) {
        _setState(w, WS.ALERTED);
      } else if (w.suspicion >= TH_INVESTIGATE) {
        _setState(w, WS.INVESTIGATING);
        w.investigateTarget = _pickInvestigateTarget(w);
      } else if (w.suspicion >= TH_SUSPICIOUS) {
        _setState(w, WS.SUSPICIOUS);
      }
      break;

    case WS.SUSPICIOUS:
      if (w.suspicion >= TH_CHASE) {
        _setState(w, WS.CHASING);
      } else if (w.suspicion >= TH_INVESTIGATE) {
        _setState(w, WS.LISTENING);
      } else if (w.stateTimer >= SUSPICIOUS_MAX_TICKS && w.suspicion < TH_SUSPICIOUS) {
        _setState(w, WS.IDLE);
      }
      break;

    case WS.LISTENING:
      if (w.suspicion >= TH_CHASE) {
        _setState(w, WS.CHASING);
      } else if (w.suspicion >= TH_ALERT) {
        _setState(w, WS.ALERTED);
      } else if (w.suspicion >= TH_INVESTIGATE) {
        _setState(w, WS.INVESTIGATING);
        w.investigateTarget = _pickInvestigateTarget(w);
      } else if (w.stateTimer >= LISTENING_MAX_TICKS && w.suspicion < TH_SUSPICIOUS) {
        _setState(w, WS.RETURNING);
        w.returnTarget = _getPatrolPoint(w);
      }
      break;

    case WS.INVESTIGATING:
      if (w.suspicion >= TH_CHASE) {
        _setState(w, WS.CHASING);
      } else if (w.suspicion >= TH_ALERT) {
        _setState(w, WS.ALERTED);
      } else if (w.stateTimer >= INVESTIGATING_MAX_TICKS) {
        _setState(w, WS.RETURNING);
        w.returnTarget = _getPatrolPoint(w);
      }
      break;

    case WS.ALERTED:
      if (w.suspicion >= TH_CHASE) {
        _setState(w, WS.CHASING);
      } else if (w.stateTimer >= ALERTED_MAX_TICKS) {
        _setState(w, WS.INVESTIGATING);
        w.investigateTarget = _pickInvestigateTarget(w);
      }
      break;

    case WS.CHASING:
      if (!sawPlayer) {
        if (w.stateTimer >= CHASE_LOSE_TICKS) {
          _setState(w, WS.ALERTED);
        }
      } else {
        // Keep resetting timer while player is visible
        w.stateTimer = 0;
      }
      break;

    case WS.RETURNING:
      if (w.suspicion >= TH_INVESTIGATE) {
        _setState(w, WS.INVESTIGATING);
        w.investigateTarget = _pickInvestigateTarget(w);
      } else if (_reachedTarget(w, w.returnTarget, 5) || w.stateTimer >= 90) {
        _setState(w, WS.IDLE);
        w.returnTarget = null;
      }
      break;
  }
}

function _setState(w, newState) {
  w.state      = newState;
  w.stateTimer = 0;
}

function _pickInvestigateTarget(w) {
  return w.lastKnownPos
    ? { ...w.lastKnownPos }
    : w.lastHeardPos
      ? { ...w.lastHeardPos }
      : null;
}

function _getPatrolPoint(w) {
  if (w.patrolPath && w.patrolPath.length > 0) {
    return { ...w.patrolPath[w.patrolPathIdx % w.patrolPath.length] };
  }
  return { x: w.x, y: w.y };
}

function _reachedTarget(w, target, dist = 4) {
  if (!target) return true;
  const dx = target.x - w.x;
  const dy = target.y - w.y;
  return Math.sqrt(dx * dx + dy * dy) <= dist;
}

// ── Per-state execution ───────────────────────────────────────────────────────

function _executeState(w, player, isNight) {
  const nightMult = isNight ? 1.3 : 1.0;

  switch (w.state) {

    case WS.IDLE:
      _patrolStep(w, SPEED_IDLE * w.speedMult * nightMult);
      break;

    case WS.SUSPICIOUS:
      // Turn toward the sound/sighting source; don't move
      _turnToward(w, w.lastHeardPos || w.lastKnownPos);
      break;

    case WS.LISTENING:
      // Slow oscillating scan to convey "thinking"
      w.facingAngle += 0.035 * Math.sin(w.stateTimer * 0.28);
      break;

    case WS.INVESTIGATING:
      if (w.investigateTarget) {
        _moveToward(w, w.investigateTarget, SPEED_INVESTIGATE * w.speedMult * nightMult);
        // Arrived → scan around
        if (_reachedTarget(w, w.investigateTarget, 4)) {
          w.facingAngle += 0.06;
        }
      }
      break;

    case WS.ALERTED:
      if (w.lastKnownPos) {
        _moveToward(w, w.lastKnownPos, SPEED_ALERTED * w.speedMult * nightMult);
      }
      w.facingAngle += 0.055 * Math.sin(w.stateTimer * 0.45);
      break;

    case WS.CHASING:
      // Continuously update last-known pos while pursuing
      w.lastKnownPos = { x: player.x, y: player.y };
      _moveToward(w, player, SPEED_CHASING * w.speedMult * nightMult);
      break;

    case WS.RETURNING:
      if (w.returnTarget) {
        _moveToward(w, w.returnTarget, SPEED_RETURNING * w.speedMult * nightMult);
      }
      break;
  }
}

// ── Movement helpers ──────────────────────────────────────────────────────────

function _patrolStep(w, speed) {
  if (!w.patrolPath || w.patrolPath.length === 0) return;
  const target = w.patrolPath[w.patrolPathIdx % w.patrolPath.length];
  _moveToward(w, target, speed);
  if (_reachedTarget(w, target, ARRIVE_DIST)) {
    w.patrolPathIdx = (w.patrolPathIdx + 1) % w.patrolPath.length;
  }
}

function _moveToward(w, target, speed) {
  if (!target) return;
  const dx   = target.x - w.x;
  const dy   = target.y - w.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.1) return;

  // Smooth rotation
  const targetAngle = Math.atan2(dy, dx);
  w.facingAngle    += _angleDiff(targetAngle, w.facingAngle) * TURN_SPEED;

  // Move (watchers clip through obstacles; pathfinding is out of scope)
  const step = Math.min(speed, dist);
  w.x = Math.max(1, Math.min(99, w.x + (dx / dist) * step));
  w.y = Math.max(1, Math.min(99, w.y + (dy / dist) * step));
}

function _turnToward(w, target) {
  if (!target) return;
  const dx = target.x - w.x;
  const dy = target.y - w.y;
  const targetAngle = Math.atan2(dy, dx);
  w.facingAngle    += _angleDiff(targetAngle, w.facingAngle) * TURN_SPEED;
}

// ── Angle helper ──────────────────────────────────────────────────────────────

function _angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
