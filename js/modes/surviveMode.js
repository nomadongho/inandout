/**
 * surviveMode.js
 * Day-by-day persistent survival mode.
 *
 * State: survive object from state.js (auto-saved to localStorage).
 * Each action produces a structured log entry and changes state values.
 * The real-world environment (derived) strongly influences action outcomes:
 *   - Noisy  → resting less effective, hiding tense
 *   - Dark   → hiding easier, exploring harder
 *   - Bright → exploring yields more but increases exposure risk
 *   - Low battery → all actions cost more stress
 *
 * Log entries: { msg, type, time } — same format as exploreMode for renderLog.
 */

import { survive, derived } from '../state.js';
import { saveData, loadData } from '../storage.js';
import { clamp, randInt, pickRandom } from '../utils.js';

const SAVE_KEY = 'survive_state';

/** Number of actions a player can take per day before Next Day is available. */
export const ACTIONS_PER_DAY = 3;

// ── Load / Save ───────────────────────────────────────────────────────────────

/** Load saved state from localStorage into the shared `survive` object. */
export function loadSurvive() {
  const saved = loadData(SAVE_KEY, null);
  if (!saved) return; // fresh game — keep defaults
  // Normalise log entries from older string-only saves
  if (Array.isArray(saved.log)) {
    saved.log = saved.log.map(e =>
      typeof e === 'string' ? { msg: e, type: 'info', time: 'D0' } : e,
    );
  }
  // actionsToday / actionCounts are transient — always reset on load (new session)
  saved.actionsToday  = 0;
  saved.actionCounts  = {};
  Object.assign(survive, saved);
}

/** Persist the current `survive` state. */
export function saveSurvive() {
  saveData(SAVE_KEY, { ...survive, log: survive.log.slice(0, 30) });
}

/** Wipe the save and reset to defaults. */
export function resetAndSave() {
  // Preserve best-run record across resets
  const best = Math.max(survive.bestDays || 0, survive.day);
  survive.day           = 1;
  survive.resources     = 50;
  survive.stress        = 20;
  survive.health        = 80;
  survive.shelterEnergy = 60;
  survive.log           = [];
  survive.bestDays      = best;
  survive.actionsToday  = 0;
  survive.actionCounts  = {};
  saveSurvive();
}

// ── Environment snapshot ──────────────────────────────────────────────────────

/** Snapshot of named environment conditions used inside every action. */
function _env() {
  return {
    isVeryNoisy:   derived.exposure      > 78,
    isNoisy:       derived.exposure      > 55,
    isDark:        derived.visibility    < 35,
    isBright:      derived.visibility    > 65,
    isLowBattery:  derived.energyModifier < 35,
    isHighBattery: derived.energyModifier > 70,
    isHighThreat:  derived.threatLevel   > 65,
    isHighStealth: derived.stealth       > 65,
  };
}

// ── Action slots & repeat penalty ────────────────────────────────────────────

/**
 * Record that an action was taken.
 * Call at the end of each successful action (before saveSurvive).
 * @param {string} key  Short identifier matching the action, e.g. 'explore'.
 */
function _recordAction(key) {
  survive.actionsToday += 1;
  survive.actionCounts[key] = (survive.actionCounts[key] || 0) + 1;
}

/**
 * Apply a same-day repeat penalty based on how many times an action has
 * already been used today (before this use is recorded).
 * 2nd use → 30 % penalty (×0.7), 3rd+ use → 50 % penalty (×0.5).
 * Logs a visible warning so the player knows why yield is reduced.
 * @param {string} key        Action identifier.
 * @param {string} label      Human-readable name shown in the log.
 * @returns {number} multiplier — 0.5 / 0.7 / 1.0 depending on use count.
 */
function _repeatMultiplier(key, label) {
  const count = survive.actionCounts[key] || 0;
  if (count >= 2) {
    _log(`⚠ FATIGUE: Using ${label} a 3rd time today — effectiveness −50%.`, 'warn');
    return 0.5;
  }
  if (count >= 1) {
    _log(`⚠ FATIGUE: Using ${label} twice today — effectiveness −30%.`, 'warn');
    return 0.7;
  }
  return 1.0;
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Player goes out to scavenge.
 * Bright light helps find supplies but raises encounter risk.
 * Dark reduces yield but keeps you hidden.
 * High stress increases mistakes.
 */
export function actionExplore() {
  const env = _env();
  _log('— EXPLORE —', 'action');
  const mult = _repeatMultiplier('explore', 'Explore');

  let found          = randInt(5, 15);
  let encounterChance = 0.18 + derived.exposure / 200 + derived.threatLevel / 200;
  let stressHit      = randInt(3, 8);
  let healthHit      = 0;

  // Bright light: find more, but you are visible
  if (env.isBright) {
    const lightBonus = randInt(3, 8);
    found += lightBonus;
    encounterChance += 0.12;
    _log(`Bright conditions helped you spot more (+${lightBonus}), but you were exposed.`, 'warn');
  } else if (env.isDark) {
    const darkPenalty = randInt(2, 5);
    found = Math.max(1, found - darkPenalty);
    encounterChance -= 0.08;
    _log(`Darkness made scavenging harder (−${darkPenalty}), but you stayed hidden.`, 'warn');
  }

  // High stealth = lower encounter risk
  if (env.isHighStealth) {
    encounterChance -= 0.10;
    _log('High stealth let you slip through undetected.', 'bonus');
  }

  // High threat while low stealth = extra stress
  if (env.isHighThreat && !env.isHighStealth) {
    const extraStress = randInt(4, 8);
    stressHit += extraStress;
    _log(`High threat kept you on edge. Stress +${extraStress}.`, 'warn');
  }

  // Low battery = exhausting without gear support
  if (env.isLowBattery) {
    const battStress = randInt(3, 7);
    stressHit += battStress;
    _log(`Low power made the trip exhausting. Stress +${battStress}.`, 'warn');
  }

  // High stress = careless mistakes
  if (survive.stress > 70) {
    encounterChance += 0.10;
    _log('Fraying nerves made you careless out there.', 'warn');
  }

  // Encounter roll
  if (Math.random() < encounterChance) {
    healthHit  = randInt(5, 15);
    stressHit += randInt(5, 10);
    _log(pickRandom([
      'You ran into trouble out there.',
      'Something tracked you on the way back.',
      'A close call — you barely made it.',
      'You were spotted and had to take a hit to escape.',
    ]), 'danger');
  } else {
    _log(pickRandom([
      'You slipped through unnoticed.',
      'Quiet out there today.',
      'Found a stash nobody else spotted.',
      'Careful movement paid off — clean run.',
    ]), 'bonus');
  }

  survive.resources     = clamp(survive.resources + Math.round(found * mult), 0, 100);
  survive.stress        = clamp(survive.stress    + stressHit,   0, 100);
  survive.health        = clamp(survive.health    - healthHit,   0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 5,       0, 100);

  _log(`+${Math.round(found * mult)} resources. Stress +${stressHit}${healthHit ? `. Health −${healthHit}` : ''}.`, 'info');
  _recordAction('explore');
  saveSurvive();
}

/**
 * Player rests inside the shelter.
 * Noisy environment sharply reduces effectiveness.
 * Dark environment improves rest quality.
 * No food = health penalty.
 */
export function actionRest() {
  const env = _env();
  _log('— REST —', 'action');
  const mult = _repeatMultiplier('rest', 'Rest');

  let stressRecovery = randInt(10, 20);
  let healthGain     = randInt(2, 5);
  let resourceCost   = 5;

  // Noise degrades rest quality
  if (env.isVeryNoisy) {
    stressRecovery = Math.max(1, Math.floor(stressRecovery * 0.30));
    healthGain     = Math.max(0, healthGain - 3);
    _log('Constant noise makes real rest impossible.', 'danger');
  } else if (env.isNoisy) {
    stressRecovery = Math.max(1, Math.floor(stressRecovery * 0.60));
    healthGain     = Math.max(1, healthGain - 1);
    _log('Hard to rest with all the noise outside.', 'warn');
  } else {
    _log(pickRandom([
      'You managed to get some sleep.',
      'Quiet enough to doze off.',
      'The silence lets your mind rest.',
    ]), 'bonus');
  }

  // Dark environment deepens rest
  if (env.isDark) {
    const darkBonus = randInt(3, 6);
    stressRecovery += darkBonus;
    _log(`Darkness makes for deeper rest. Stress −${darkBonus} extra.`, 'bonus');
  }

  // Low shelter energy disrupts climate control, lighting, etc.
  if (survive.shelterEnergy < 20) {
    stressRecovery = Math.max(1, Math.floor(stressRecovery * 0.70));
    healthGain     = Math.max(0, healthGain - 1);
    _log('Low shelter power disrupts your rest.', 'warn');
  }

  // Very high stress prevents healing
  if (survive.stress > 80) {
    healthGain = Math.max(0, healthGain - 2);
    _log('Too anxious to fully heal.', 'warn');
  }

  // No food = restless, health loss instead of gain
  const hasFood = survive.resources >= resourceCost;
  if (!hasFood) {
    _log('No food — restless sleep. Health −2.', 'danger');
    healthGain   = -2;
    resourceCost = 0;
    stressRecovery = Math.max(1, Math.floor(stressRecovery * 0.50));
  }

  survive.stress        = clamp(survive.stress    - Math.round(stressRecovery * mult), 0, 100);
  survive.health        = clamp(survive.health    + healthGain,      0, 100);
  survive.resources     = clamp(survive.resources - resourceCost,    0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 3,           0, 100);

  const hSign = healthGain >= 0 ? `+${healthGain}` : `${healthGain}`;
  _log(`Stress −${Math.round(stressRecovery * mult)}. Health ${hSign}. Resources −${resourceCost}.`, 'info');
  _recordAction('rest');
  saveSurvive();
}

/**
 * Player goes into deep hiding.
 * Dark + quiet conditions give a large stress benefit.
 * Bright + noisy conditions make hiding counterproductive.
 */
export function actionHide() {
  const env = _env();
  _log('— HIDE —', 'action');
  const mult = _repeatMultiplier('hide', 'Hide');

  let stressChange = 0;
  const resourceCost = 3;

  // Darkness is the hider's best friend
  if (env.isDark) {
    const darkBonus = randInt(8, 14);
    stressChange -= darkBonus;
    _log(`Deep cover in the dark. Stress −${darkBonus}.`, 'bonus');
  } else if (env.isBright) {
    const lightPenalty = randInt(3, 6);
    stressChange += lightPenalty;
    _log(`Too bright out there — hard to hide. Stress +${lightPenalty}.`, 'warn');
  } else {
    _log('You keep low and out of sight.', 'info');
  }

  // Noise makes it impossible to know if you are safe
  if (env.isVeryNoisy) {
    const noisePenalty = randInt(4, 8);
    stressChange += noisePenalty;
    _log(`Every sound puts you on edge. Stress +${noisePenalty}.`, 'danger');
  } else if (env.isNoisy) {
    const noisePenalty = randInt(1, 4);
    stressChange += noisePenalty;
    _log('Ambient noise keeps you tense.', 'warn');
  } else if (!env.isDark) {
    // Quiet + not already dark: add a quiet bonus
    const quietBonus = randInt(2, 5);
    stressChange -= quietBonus;
    _log(`Silence is reassuring. Stress −${quietBonus}.`, 'bonus');
  }

  // Good stealth position = more confident
  if (env.isHighStealth) {
    const stealthBonus = randInt(3, 7);
    stressChange -= stealthBonus;
    _log(`Your position is well concealed. Stress −${stealthBonus}.`, 'bonus');
  }

  // Paranoia undermines even good hiding spots
  if (survive.stress > 75) {
    stressChange += 3;
    _log('Paranoia undermines the hiding spot.', 'warn');
  }

  // Apply repeat-use fatigue: stress relief is reduced, stress costs stay unchanged
  const effectiveChange = stressChange < 0
    ? Math.round(stressChange * mult)
    : stressChange;
  survive.stress        = clamp(survive.stress    + effectiveChange, 0, 100);
  survive.resources     = clamp(survive.resources - resourceCost,    0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 2,           0, 100);

  const sc = effectiveChange;
  const stressLabel = sc <= 0 ? `Stress −${Math.abs(sc)}` : `Stress +${sc}`;
  _log(`${stressLabel}. Resources −${resourceCost}.`, 'info');
  _recordAction('hide');
  saveSurvive();
}

/**
 * Player recharges shelter power.
 * Device battery level affects conversion efficiency.
 * Bright light provides a small ambient boost.
 */
export function actionRecharge() {
  const env = _env();
  _log('— RECHARGE —', 'action');

  const cost = 8;

  if (survive.resources < cost) {
    _log('Not enough resources to recharge!', 'danger');
    // Log is ephemeral; it will be persisted on the next successful action
    return;
  }

  const mult = _repeatMultiplier('recharge', 'Recharge');
  let amount = randInt(15, 30);

  // Battery efficiency multiplier
  if (env.isHighBattery) {
    amount = Math.round(amount * 1.25);
    _log('High device battery boosts recharge efficiency.', 'bonus');
  } else if (env.isLowBattery) {
    amount = Math.round(amount * 0.65);
    _log('Low device battery limits conversion efficiency.', 'warn');
  }

  // Ambient light provides a small solar-style bonus
  if (env.isBright) {
    const lightBonus = randInt(2, 5);
    amount += lightBonus;
    _log(`Ambient light provides a small extra boost. +${lightBonus}.`, 'bonus');
  }

  survive.shelterEnergy = clamp(survive.shelterEnergy + Math.round(amount * mult), 0, 100);
  survive.resources     = clamp(survive.resources     - cost,   0, 100);

  _log(`Shelter energy +${Math.round(amount * mult)}. Resources −${cost}.`, 'info');
  _recordAction('recharge');
  saveSurvive();
}

/**
 * Advance to the next day.
 * Passive consumption, stress-driven health decay, random day event.
 * Daily resource cost scales up every 10 days to increase challenge.
 */
export function actionNextDay() {
  // Require at least one action before the day can end
  if (survive.actionsToday === 0) {
    _log("⛔ You haven't done anything today — take at least one action first.", 'warn');
    saveSurvive();
    return;
  }

  _log(`══ END OF DAY ${survive.day} ══`, 'action');

  survive.day += 1;

  // Reset daily action tracking
  survive.actionsToday = 0;
  survive.actionCounts = {};

  // Difficulty scaling: +1 resource consumed per 10 days survived (kicks in from day 11)
  const scaling      = Math.floor((survive.day - 1) / 10);
  const dailyConsume = 8 + scaling;
  survive.resources = clamp(survive.resources - dailyConsume, 0, 100);

  // Natural overnight stress reduction
  const stressDecay = randInt(3, 7);
  survive.stress = clamp(survive.stress - stressDecay, 0, 100);

  // Health — chronic stress causes damage; low resources mean starvation
  let healthDelta;
  if (survive.stress > 80) {
    healthDelta = -randInt(3, 6);
    _log('Chronic stress is wearing you down.', 'danger');
  } else if (survive.resources <= 0) {
    healthDelta = -randInt(3, 6);
    _log('Starvation is weakening you.', 'danger');
  } else if (survive.resources > 30 && survive.stress < 50) {
    healthDelta = randInt(1, 4);
  } else {
    healthDelta = survive.resources > 30 ? randInt(0, 2) : -randInt(1, 3);
  }
  survive.health = clamp(survive.health + healthDelta, 0, 100);

  // Shelter energy passive overnight drain
  survive.shelterEnergy = clamp(survive.shelterEnergy - 5, 0, 100);

  const consumeNote = scaling > 0 ? ` (+${scaling} difficulty)` : '';
  _log(`Day ${survive.day} begins. Resources −${dailyConsume}${consumeNote}. Stress −${stressDecay}.`, 'info');

  // Milestone check (before random event, so it reads the new day)
  _checkMilestone(survive.day);

  // Random event
  _rollDayEvent();

  // Critical state warnings
  if (survive.health <= 0) {
    _log('⚠ CRITICAL: Health has failed. Start a new game.', 'danger');
  } else if (survive.health < 20) {
    _log('⚠ Health critically low — rest and find resources.', 'warn');
  }
  if (survive.resources <= 0) {
    _log('⚠ No resources remain — scavenge immediately.', 'danger');
  }

  saveSurvive();
}

// ── Day events ────────────────────────────────────────────────────────────────

/**
 * Pool of weighted day events.
 * condition() → bool: whether the event is eligible.
 * apply()     → [message, type]: mutates survive, returns log pair.
 */
const DAY_EVENTS = [
  {
    id: 'supply_drop',
    weight: 0.12,
    condition: () => true,
    apply: () => {
      const bonus = randInt(8, 18);
      survive.resources = clamp(survive.resources + bonus, 0, 100);
      return [pickRandom([
        `Supply drop nearby — +${bonus} resources!`,
        `You found an untouched cache. +${bonus} resources.`,
        `An abandoned bag left right outside. +${bonus} resources.`,
      ]), 'bonus'];
    },
  },
  {
    id: 'strange_noises',
    weight: 0.12,
    condition: () => true,
    apply: () => {
      const stressHit = randInt(5, 12);
      survive.stress = clamp(survive.stress + stressHit, 0, 100);
      return [pickRandom([
        `Strange noises through the night. Stress +${stressHit}.`,
        `Restless night. Stress +${stressHit}.`,
        `Something moved out there in the dark. Stress +${stressHit}.`,
      ]), 'warn'];
    },
  },
  {
    id: 'power_critical',
    weight: 0.10,
    condition: () => survive.shelterEnergy < 30,
    apply: () => {
      survive.shelterEnergy = clamp(survive.shelterEnergy - 5, 0, 100);
      return ['Shelter systems failing overnight. Shelter energy −5.', 'danger'];
    },
  },
  {
    id: 'equipment_malfunction',
    weight: 0.08,
    condition: () => survive.shelterEnergy > 10,
    apply: () => {
      const drain = randInt(5, 12);
      survive.shelterEnergy = clamp(survive.shelterEnergy - drain, 0, 100);
      return [pickRandom([
        `Equipment malfunction overnight. Shelter energy −${drain}.`,
        `A circuit tripped in the shelter. Shelter energy −${drain}.`,
      ]), 'warn'];
    },
  },
  {
    id: 'illness',
    weight: 0.09,
    condition: () => survive.stress > 60,
    apply: () => {
      const healthHit = randInt(4, 10);
      survive.health = clamp(survive.health - healthHit, 0, 100);
      return [pickRandom([
        `High stress has made you ill. Health −${healthHit}.`,
        `Exhaustion catches up with you. Health −${healthHit}.`,
      ]), 'danger'];
    },
  },
  {
    id: 'scavenger_alert',
    weight: 0.10,
    condition: () => true,
    apply: () => {
      const stressHit = randInt(8, 15);
      const resLoss   = randInt(3, 8);
      survive.stress    = clamp(survive.stress    + stressHit, 0, 100);
      survive.resources = clamp(survive.resources - resLoss,   0, 100);
      return [pickRandom([
        `Scavengers nearby — you had to move supplies. Stress +${stressHit}, Resources −${resLoss}.`,
        `Someone was snooping around. Stress +${stressHit}, Resources −${resLoss}.`,
      ]), 'danger'];
    },
  },
  {
    id: 'found_medicine',
    weight: 0.08,
    condition: () => survive.health < 60,
    apply: () => {
      const healAmt = randInt(8, 15);
      survive.health = clamp(survive.health + healAmt, 0, 100);
      return [`You found some medicine. Health +${healAmt}.`, 'bonus'];
    },
  },
  {
    id: 'power_surge',
    weight: 0.07,
    condition: () => survive.shelterEnergy < 70,
    apply: () => {
      const boost = randInt(8, 16);
      survive.shelterEnergy = clamp(survive.shelterEnergy + boost, 0, 100);
      return [`Power surge in the shelter grid. Shelter energy +${boost}.`, 'bonus'];
    },
  },
  {
    id: 'good_sleep',
    weight: 0.10,
    condition: () => survive.stress < 60,
    apply: () => {
      const stressBonus  = randInt(5, 10);
      const healthBonus  = randInt(2, 5);
      survive.stress = clamp(survive.stress - stressBonus, 0, 100);
      survive.health = clamp(survive.health + healthBonus, 0, 100);
      return [`A surprisingly peaceful night. Stress −${stressBonus}, Health +${healthBonus}.`, 'bonus'];
    },
  },
  {
    id: 'resource_decay',
    weight: 0.09,
    condition: () => survive.resources > 20,
    apply: () => {
      const decay = randInt(3, 8);
      survive.resources = clamp(survive.resources - decay, 0, 100);
      return [pickRandom([
        `Some supplies spoiled overnight. Resources −${decay}.`,
        `Damp got into the storage. Resources −${decay}.`,
      ]), 'warn'];
    },
  },
  // ── New events ────────────────────────────────────────────────────────────
  {
    id: 'cold_night',
    weight: 0.08,
    condition: () => true,
    apply: () => {
      const drain = randInt(6, 12);
      survive.shelterEnergy = clamp(survive.shelterEnergy - drain, 0, 100);
      return [pickRandom([
        `A bitterly cold night drained the shelter. Energy −${drain}.`,
        `Temperatures dropped overnight. Shelter energy −${drain}.`,
      ]), 'warn'];
    },
  },
  {
    id: 'lucky_find',
    weight: 0.07,
    condition: () => survive.resources < 50,
    apply: () => {
      const bonus = randInt(10, 20);
      survive.resources = clamp(survive.resources + bonus, 0, 100);
      return [pickRandom([
        `You stumbled on a forgotten stash. Resources +${bonus}!`,
        `A sealed container was wedged behind the wall. Resources +${bonus}!`,
        `Someone left supplies near your shelter. Resources +${bonus}!`,
      ]), 'bonus'];
    },
  },
  {
    id: 'rat_infestation',
    weight: 0.07,
    condition: () => survive.resources > 25,
    apply: () => {
      const decay = randInt(8, 16);
      const stress = randInt(3, 7);
      survive.resources = clamp(survive.resources - decay, 0, 100);
      survive.stress    = clamp(survive.stress    + stress, 0, 100);
      return [pickRandom([
        `Rats got into the supplies. Resources −${decay}, Stress +${stress}.`,
        `Infestation overnight — food spoiled. Resources −${decay}, Stress +${stress}.`,
      ]), 'danger'];
    },
  },
  {
    id: 'clear_morning',
    weight: 0.08,
    condition: () => survive.stress > 25,
    apply: () => {
      const stressBonus = randInt(6, 12);
      survive.stress = clamp(survive.stress - stressBonus, 0, 100);
      return [pickRandom([
        `A clear, still morning lifts your spirits. Stress −${stressBonus}.`,
        `The dawn is unusually peaceful. You breathe easier. Stress −${stressBonus}.`,
        `Silence and light. Just for a moment, everything feels manageable. Stress −${stressBonus}.`,
      ]), 'bonus'];
    },
  },
  {
    id: 'dehydration',
    weight: 0.07,
    condition: () => survive.day > 4 && survive.resources < 30,
    apply: () => {
      const healthHit = randInt(5, 10);
      const stressHit = randInt(4, 8);
      survive.health = clamp(survive.health - healthHit, 0, 100);
      survive.stress = clamp(survive.stress + stressHit, 0, 100);
      return [`Dehydration takes a toll — low supplies hurt. Health −${healthHit}, Stress +${stressHit}.`, 'danger'];
    },
  },
  {
    id: 'signal_heard',
    weight: 0.05,
    condition: () => survive.day > 3,
    apply: () => {
      const bonus = randInt(12, 22);
      survive.resources = clamp(survive.resources + bonus, 0, 100);
      return [pickRandom([
        `A distant signal led you to a full supply crate. Resources +${bonus}!`,
        `Someone's beacon was broadcasting all night — you followed it at dawn. Resources +${bonus}!`,
      ]), 'bonus'];
    },
  },
];

// ── Milestone events ──────────────────────────────────────────────────────────

/**
 * Check if the new day hits a survival milestone and apply its reward.
 */
function _checkMilestone(day) {
  const milestones = {
    5:  { msg: '⭐ Day 5 — You\'ve found your footing. Resources +10.',    fn: () => { survive.resources = clamp(survive.resources + 10, 0, 100); } },
    10: { msg: '🏅 Day 10 — A seasoned survivor. Health +10.',             fn: () => { survive.health    = clamp(survive.health    + 10, 0, 100); } },
    15: { msg: '🔥 Day 15 — Battle-hardened. Stress −15.',                 fn: () => { survive.stress    = clamp(survive.stress    - 15, 0, 100); } },
    20: { msg: '🌟 Day 20 — True resilience. Resources +15, Health +5.',   fn: () => { survive.resources = clamp(survive.resources + 15, 0, 100); survive.health = clamp(survive.health + 5, 0, 100); } },
    30: { msg: '🏆 Day 30 — You are a legend. Resources +20, Health +10.', fn: () => { survive.resources = clamp(survive.resources + 20, 0, 100); survive.health = clamp(survive.health + 10, 0, 100); } },
  };
  if (milestones[day]) {
    milestones[day].fn();
    _log(milestones[day].msg, 'bonus');
  }
}

function _rollDayEvent() {
  const eligible    = DAY_EVENTS.filter(e => e.condition());
  if (eligible.length === 0) return;

  // Weighted random selection
  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
  const roll        = Math.random() * totalWeight;

  let cumulative = 0;
  for (const ev of eligible) {
    cumulative += ev.weight;
    if (roll <= cumulative) {
      const [msg, type] = ev.apply();
      _log(msg, type);
      return;
    }
  }
}

// ── Strategic advice ──────────────────────────────────────────────────────────

/**
 * Player uses resources to treat wounds and calm nerves.
 * High cost but strong stress/health recovery.
 */
export function actionTreat() {
  const cost = 15;
  _log('— TREAT —', 'action');

  if (survive.resources < cost) {
    _log(`Not enough resources to treat yourself (need ${cost}).`, 'danger');
    return;
  }

  const mult = _repeatMultiplier('treat', 'Treat');
  const stressReduce = Math.round(randInt(18, 28) * mult);
  const healthGain   = Math.round(randInt(5, 10)  * mult);

  survive.resources = clamp(survive.resources - cost,          0, 100);
  survive.stress    = clamp(survive.stress    - stressReduce,  0, 100);
  survive.health    = clamp(survive.health    + healthGain,    0, 100);

  _log(pickRandom([
    'You take time to dress wounds and settle your nerves.',
    'A careful meal and proper medical attention do wonders.',
    'Rest, bandages, and quiet. You feel meaningfully better.',
    'You patch up every scrape and force yourself to breathe.',
  ]), 'bonus');
  _log(`Stress −${stressReduce}. Health +${healthGain}. Resources −${cost}.`, 'info');
  _recordAction('treat');
  saveSurvive();
}

/**
 * Returns a single-line situational hint for the UI, or null if no advice.
 * Reads from both `survive` and `derived`.
 */
export function getSurviveAdvice() {
  if (survive.health < 20)              return '⚠ Rest immediately — health critical.';
  if (survive.resources <= 0)           return '🔍 Must scavenge — no resources left.';
  if (survive.stress > 80)              return '😴 Stress critical — rest or hide now.';
  if (survive.shelterEnergy < 15)       return '🔋 Shelter failing — recharge soon.';
  if (survive.resources < 15 && derived.visibility > 50)
                                        return '🔍 Supplies low — explore while visible.';
  if (derived.exposure < 30 && survive.stress > 45)
                                        return '🫥 Quiet outside — good moment to hide.';
  if (derived.visibility < 35 && survive.stress > 35)
                                        return '🌑 Dark conditions — ideal for hiding.';
  if (derived.visibility > 65 && survive.resources < 45 && survive.stress < 65)
                                        return '☀️ Bright out — explore for extra supplies.';
  if (survive.shelterEnergy < 30)       return '🔋 Shelter energy low — consider recharging.';
  return null;
}

// ── Internal log helper ───────────────────────────────────────────────────────

/** Prepend a structured log entry; keep last 40. */
function _log(msg, type = 'info') {
  survive.log.unshift({ msg, type, time: `D${survive.day}` });
  if (survive.log.length > 40) survive.log.pop();
}
