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

import { hasLineOfSight, wallsOnSegment } from './geometry.js';
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
const SUSPICIOUS_MAX_TICKS    = 14;
const LISTENING_MAX_TICKS     = 22;
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
const DECAY_IDLE           = 1.2;
const DECAY_SUSPICIOUS     = 0.7;

// ── Visual awareness (0–100) — gradual build in LOS, slow decay outside ───────
const VISUAL_AWARENESS_GAIN_MAX  = 16;   // max per tick at perfect close exposure
const VISUAL_AWARENESS_DECAY     = 2.0;  // per tick when LOS is broken
const VISUAL_AWARENESS_THRESHOLD = 20;   // min awareness before suspicion rises from vision
const GAIN_VISION_SUSTAINED      = 26;   // max suspicion gain/tick when awareness is full

// ── Sound memory — repeated sounds from same area accumulate confidence ────────
const SOUND_MEMORY_DECAY     = 1.2;  // confidence lost per tick when quiet
const SOUND_MEMORY_NEAR_DIST = 14;   // radius (grid units) to consider "same area"
const SOUND_MEMORY_GAIN_BASE = 22;   // base confidence gain per sound heard

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
    lastKnownPos:      null,   // last seen player {x,y} (exact)
    lastHeardPos:      null,   // last heard estimated sound position {x,y}
    investigateTarget: null,   // current move target during INVESTIGATING
    returnTarget:      null,   // patrol point to return to

    // ── Estimated sound source (the noisy position the watcher investigates)
    estimatedSoundPos: null,

    // ── Sound memory: tracks repeated sounds from same area ───────────────
    soundMemory: { confidence: 0, centerX: null, centerY: null },

    // ── Visual awareness: gradual build while in LOS, slow decay outside ──
    visualAwareness: 0,   // 0–100

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
 * @param {object}   w              Watcher (mutated in place)
 * @param {{x,y}}    player
 * @param {number}   playerR        Player detection radius
 * @param {Array}    soundEvents    Active sound events
 * @param {Array}    walls          Stage walls + vision-blocking props (combined)
 * @param {boolean}  indoor
 * @param {boolean}  isNight
 * @param {number}   [shadowCoverage] Player shadow coverage 0–1 (reduces visual gain)
 * @returns {{ heard:boolean, saw:boolean, stateChanged:string|null }}
 */
export function updateWatcher(w, player, playerR, soundEvents, walls, indoor, isNight, shadowCoverage = 0) {
  const result = { heard: false, saw: false, stateChanged: null };
  w.stateTimer++;

  // ── 1. Sound check ────────────────────────────────────────────────────────
  let bestIntensity  = 0;
  let bestTruePos    = null;
  let bestWallCount  = 0;
  let bestSoundType  = 'footstep';

  for (const ev of soundEvents) {
    const intensity = soundIntensityAt(ev, w.x, w.y, walls, indoor);
    const threshold  = HEARING_THRESHOLD[Math.min(w.groupId, 2)];
    if (intensity > threshold && intensity > bestIntensity) {
      bestIntensity = intensity;
      bestTruePos   = { x: ev.x, y: ev.y };
      bestWallCount = wallsOnSegment(ev.x, ev.y, w.x, w.y, walls);
      bestSoundType = ev.type || 'footstep';
    }
  }

  if (bestTruePos) {
    result.heard = true;
    // Estimate the sound's origin — watchers don't know exact positions
    const estimated       = _estimateSoundPos(bestTruePos.x, bestTruePos.y, bestIntensity, bestWallCount, indoor);
    w.estimatedSoundPos   = estimated;
    w.lastHeardPos        = { ...estimated };  // investigate the estimated location, not the real one
    w.soundSourceX        = estimated.x;
    w.soundSourceY        = estimated.y;
    w.soundReactTicks     = 8;
    // Update repeated-sound confidence memory
    _updateSoundMemory(w, bestTruePos, bestIntensity, bestSoundType);
  } else {
    // Decay sound memory confidence when quiet
    w.soundMemory.confidence = Math.max(0, w.soundMemory.confidence - SOUND_MEMORY_DECAY);
    if (w.soundMemory.confidence === 0) {
      w.soundMemory.centerX = null;
      w.soundMemory.centerY = null;
    }
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
    // Visual awareness builds gradually — distance, cone angle, player radius, shadow all matter
    const gain = _computeVisualGain(dist, angleDelta, w.fovRange, w.fovHalfAngle, playerR, shadowCoverage);
    w.visualAwareness = Math.min(100, w.visualAwareness + gain);
    w.lastKnownPos = { x: player.x, y: player.y };
    result.saw     = true;
  } else {
    // Gradual decay — breaking LOS doesn't instantly reset awareness
    w.visualAwareness = Math.max(0, w.visualAwareness - VISUAL_AWARENESS_DECAY);
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
    // Visual awareness drives suspicion — brief exposure = small gain; sustained = strong gain
    const awareness = w.visualAwareness;
    const aFrac     = Math.max(0, (awareness - VISUAL_AWARENESS_THRESHOLD) /
                                   (100 - VISUAL_AWARENESS_THRESHOLD));
    const gain      = 4 + aFrac * GAIN_VISION_SUSTAINED;
    w.suspicion     = Math.min(100, w.suspicion + gain);
  } else if (w.soundMemory && w.soundMemory.confidence > 15) {
    // Repeated / sustained sounds from same area → escalating confidence
    const confFrac = w.soundMemory.confidence / 100;
    const gain     = GAIN_SOUND_WEAK + confFrac * (GAIN_SOUND_STRONG - GAIN_SOUND_WEAK);
    w.suspicion    = Math.min(100, w.suspicion + gain);
  } else if (soundIntensity > 0) {
    // Single isolated sound → mild suspicion only (not full gain)
    const gain  = soundIntensity > 30 ? GAIN_SOUND_STRONG * 0.45 : GAIN_SOUND_WEAK * 0.45;
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
  // Prefer last confirmed sighting (exact); fall back to estimated sound position
  if (w.lastKnownPos)      return { ...w.lastKnownPos };
  if (w.estimatedSoundPos) return { ...w.estimatedSoundPos };
  if (w.lastHeardPos)      return { ...w.lastHeardPos };
  return null;
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
      // Turn toward the estimated sound source; don't move
      _turnToward(w, w.estimatedSoundPos || w.lastHeardPos || w.lastKnownPos);
      break;

    case WS.LISTENING:
      // Phase 1 (first ~10 ticks): rotate to face estimated sound direction and pause
      if (w.stateTimer <= 10 && (w.estimatedSoundPos || w.lastHeardPos)) {
        _turnToward(w, w.estimatedSoundPos || w.lastHeardPos);
      } else {
        // Phase 2: slow oscillating scan to convey "deciding whether to act"
        w.facingAngle += 0.035 * Math.sin(w.stateTimer * 0.28);
      }
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

// ── Sound source estimation ───────────────────────────────────────────────────

/**
 * Convert a true sound position to an estimated one as perceived by the watcher.
 * Stronger received intensity = smaller error. More walls = larger error.
 */
function _estimateSoundPos(trueX, trueY, intensity, wallCount, indoor) {
  const baseError  = Math.max(1.0, 11.0 - intensity * 0.09);
  const wallError  = wallCount * (indoor ? 1.8 : 2.8);
  const totalError = Math.min(16, baseError + wallError);
  if (totalError < 0.5) return { x: trueX, y: trueY };
  const angle = Math.random() * Math.PI * 2;
  const dist  = Math.random() * totalError;
  return {
    x: Math.max(2, Math.min(98, trueX + Math.cos(angle) * dist)),
    y: Math.max(2, Math.min(98, trueY + Math.sin(angle) * dist)),
  };
}

// ── Sound memory ──────────────────────────────────────────────────────────────

/**
 * Update the watcher's sound memory.
 * Repeated sounds from the same area accumulate confidence.
 * Sudden / burst sounds escalate confidence faster.
 */
function _updateSoundMemory(w, truePos, intensity, soundType) {
  const mem      = w.soundMemory;
  const typeMult = (soundType === 'stumble' || soundType === 'burst') ? 1.8 : 1.0;

  if (mem.centerX !== null) {
    const dx   = truePos.x - mem.centerX;
    const dy   = truePos.y - mem.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= SOUND_MEMORY_NEAR_DIST) {
      // Same area — accumulate confidence; burst/stumble escalate faster
      const gain = (intensity / 100) * SOUND_MEMORY_GAIN_BASE * typeMult;
      mem.confidence = Math.min(100, mem.confidence + gain);
      // Drift the remembered area centroid toward the new sound
      mem.centerX = (mem.centerX * 2 + truePos.x) / 3;
      mem.centerY = (mem.centerY * 2 + truePos.y) / 3;
    } else {
      // Different area — partial reset and shift toward new source
      mem.confidence = Math.max(0, mem.confidence - 25);
      if (mem.confidence < 10) {
        mem.centerX = truePos.x;
        mem.centerY = truePos.y;
      }
    }
  } else {
    // First sound heard — initialize memory with a cautious confidence
    const gain = (intensity / 100) * SOUND_MEMORY_GAIN_BASE * 0.5 * typeMult;
    mem.confidence = Math.min(30, gain);
    mem.centerX    = truePos.x;
    mem.centerY    = truePos.y;
  }
}

// ── Visual awareness gain ─────────────────────────────────────────────────────

/**
 * Compute per-tick visual awareness gain while the player is in LOS.
 * Close, centre-of-cone exposure with large detection radius gains the fastest.
 * Shadow coverage reduces the gain significantly.
 */
function _computeVisualGain(dist, angleDelta, fovRange, fovHalfAngle, playerR, shadowCoverage) {
  const distFactor   = Math.max(0.15, 1.0 - (dist / fovRange) * 0.7);
  const angleFactor  = Math.max(0.25, 1.0 - (angleDelta / fovHalfAngle) * 0.75);
  const radiusFactor = Math.min(1.8, 0.5 + playerR / 7);
  const shadowFactor = Math.max(0.1, 1.0 - shadowCoverage * 0.65);
  return VISUAL_AWARENESS_GAIN_MAX * distFactor * angleFactor * radiusFactor * shadowFactor;
}

// ── Angle helper ──────────────────────────────────────────────────────────────

function _angleDiff(a, b) {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
