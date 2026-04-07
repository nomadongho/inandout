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

// ── Load / Save ───────────────────────────────────────────────────────────────

/** Load saved state from localStorage into the shared `survive` object. */
export function loadSurvive() {
  const saved = loadData(SAVE_KEY, null);
  if (!saved) return; // fresh game — keep defaults
  // Normalise log entries from older string-only saves
  if (Array.isArray(saved.log)) {
    saved.log = saved.log.map(e =>
      typeof e === 'string' ? { msg: e, type: 'info', time: 'D?' } : e,
    );
  }
  Object.assign(survive, saved);
}

/** Persist the current `survive` state. */
export function saveSurvive() {
  saveData(SAVE_KEY, { ...survive, log: survive.log.slice(0, 30) });
}

/** Wipe the save and reset to defaults. */
export function resetAndSave() {
  survive.day           = 1;
  survive.resources     = 50;
  survive.stress        = 20;
  survive.health        = 80;
  survive.shelterEnergy = 60;
  survive.log           = [];
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

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Player goes out to scavenge.
 * Bright light helps find supplies but raises encounter risk.
 * Dark reduces yield but keeps you hidden.
 * High stress increases mistakes.
 */
export function actionExplore() {
  const env = _env();
  _log('— EXPLORE —', 'info');

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

  survive.resources     = clamp(survive.resources + found,       0, 100);
  survive.stress        = clamp(survive.stress    + stressHit,   0, 100);
  survive.health        = clamp(survive.health    - healthHit,   0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 5,       0, 100);

  _log(`+${found} resources. Stress +${stressHit}${healthHit ? `. Health −${healthHit}` : ''}.`, 'info');
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
  _log('— REST —', 'info');

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

  survive.stress        = clamp(survive.stress    - stressRecovery,  0, 100);
  survive.health        = clamp(survive.health    + healthGain,      0, 100);
  survive.resources     = clamp(survive.resources - resourceCost,    0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 3,           0, 100);

  const hSign = healthGain >= 0 ? `+${healthGain}` : `${healthGain}`;
  _log(`Stress −${stressRecovery}. Health ${hSign}. Resources −${resourceCost}.`, 'info');
  saveSurvive();
}

/**
 * Player goes into deep hiding.
 * Dark + quiet conditions give a large stress benefit.
 * Bright + noisy conditions make hiding counterproductive.
 */
export function actionHide() {
  const env = _env();
  _log('— HIDE —', 'info');

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

  survive.stress        = clamp(survive.stress    + Math.round(stressChange), 0, 100);
  survive.resources     = clamp(survive.resources - resourceCost,             0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 2,                    0, 100);

  const sc = Math.round(stressChange);
  const stressLabel = sc <= 0 ? `Stress −${Math.abs(sc)}` : `Stress +${sc}`;
  _log(`${stressLabel}. Resources −${resourceCost}.`, 'info');
  saveSurvive();
}

/**
 * Player recharges shelter power.
 * Device battery level affects conversion efficiency.
 * Bright light provides a small ambient boost.
 */
export function actionRecharge() {
  const env = _env();
  _log('— RECHARGE —', 'info');

  const cost = 8;

  if (survive.resources < cost) {
    _log('Not enough resources to recharge!', 'danger');
    saveSurvive();
    return;
  }

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

  survive.shelterEnergy = clamp(survive.shelterEnergy + amount, 0, 100);
  survive.resources     = clamp(survive.resources     - cost,   0, 100);

  _log(`Shelter energy +${amount}. Resources −${cost}.`, 'info');
  saveSurvive();
}

/**
 * Advance to the next day.
 * Passive consumption, stress-driven health decay, random day event.
 */
export function actionNextDay() {
  _log(`══ END OF DAY ${survive.day} ══`, 'info');

  survive.day += 1;

  // Passive daily resource consumption
  const dailyConsume = 8;
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

  _log(`Day ${survive.day} begins. Resources −${dailyConsume}. Stress −${stressDecay}.`, 'info');

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
];

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
  // Fallback to last eligible event
  const [msg, type] = eligible[eligible.length - 1].apply();
  _log(msg, type);
}

// ── Strategic advice ──────────────────────────────────────────────────────────

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
