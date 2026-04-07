/**
 * surviveMode.js
 * Day-by-day persistent survival mode.
 *
 * State: survive object from state.js (auto-saved to localStorage).
 * Each action produces a log message and changes state values.
 * The environment (derived) influences action outcomes.
 *
 * This module owns game-logic only — no DOM code.
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

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Player goes out to scavenge/explore.
 * Riskier but better resource rewards.
 */
export function actionExplore() {
  _log('— EXPLORE —');

  // Visibility affects how much you find
  const findBonus = Math.round(derived.visibility / 10);
  const found     = randInt(5, 15) + findBonus;

  // Exposure + threat affect encounter risk
  const encounterChance = 0.2 + derived.exposure / 200 + derived.threatLevel / 200;
  let stressHit  = randInt(3, 8);
  let healthHit  = 0;

  if (Math.random() < encounterChance) {
    healthHit = randInt(5, 15);
    stressHit += randInt(5, 10);
    _log(pickRandom([
      'You ran into trouble out there.',
      'Something tracked you on the way back.',
      'A close call — you barely made it.',
    ]));
  } else {
    _log(pickRandom([
      'You slipped through unnoticed.',
      'Quiet out there today.',
      'Found a stash nobody else spotted.',
    ]));
  }

  // Low battery = less efficient
  if (derived.energyModifier < 35) {
    const extra = randInt(3, 7);
    stressHit += extra;
    _log('Low power made the trip exhausting.');
  }

  survive.resources     = clamp(survive.resources + found, 0, 100);
  survive.stress        = clamp(survive.stress    + stressHit, 0, 100);
  survive.health        = clamp(survive.health    - healthHit, 0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 5, 0, 100);

  _log(`+${found} resources. Stress +${stressHit}${healthHit ? `. Health −${healthHit}` : ''}.`);
  saveSurvive();
}

/**
 * Player rests inside.
 * Reduces stress; noisy environment reduces effectiveness.
 */
export function actionRest() {
  _log('— REST —');

  const noisePenalty = Math.round(derived.exposure / 20); // 0–5
  const baseRecovery = randInt(10, 20);
  const recovery     = Math.max(baseRecovery - noisePenalty * 2, 1);

  if (noisePenalty > 2) {
    _log('Hard to rest with all the noise outside.');
  } else {
    _log(pickRandom([
      'You managed to get some sleep.',
      'Rest restores your nerves.',
      'Quiet enough to doze off.',
    ]));
  }

  const resourceCost = 5;
  const healthGain = randInt(2, 5);
  survive.stress        = clamp(survive.stress    - recovery,   0, 100);
  survive.health        = clamp(survive.health    + healthGain, 0, 100);
  survive.resources     = clamp(survive.resources - resourceCost, 0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 3,        0, 100);

  _log(`Stress −${recovery}. Health +${healthGain}. Resources −${resourceCost}.`);
  saveSurvive();
}

/**
 * Player goes into deep hiding.
 * Improves safety but uses resources.
 */
export function actionHide() {
  _log('— HIDE —');

  const stealthBonus = derived.stealth > 60 ? 10 : 0;
  const noiseAnnoyance = Math.round(derived.exposure / 15);
  const stressChange = -5 + noiseAnnoyance - stealthBonus / 5;

  if (derived.stealth > 70) {
    _log('Your position is well concealed.');
  } else if (derived.exposure > 60) {
    _log('Hard to hide — too much noise and light.');
  } else {
    _log('You keep low and out of sight.');
  }

  survive.stress        = clamp(survive.stress    + Math.round(stressChange), 0, 100);
  survive.resources     = clamp(survive.resources - 3,                         0, 100);
  survive.shelterEnergy = clamp(survive.shelterEnergy - 2,                     0, 100);

  _log(`Stress ${stressChange <= 0 ? '' : '+'}${Math.round(stressChange)}. Resources −3.`);
  saveSurvive();
}

/**
 * Player recharges the shelter's power.
 * Costs resources; benefits future actions.
 */
export function actionRecharge() {
  _log('— RECHARGE —');

  const amount = randInt(15, 30);
  const cost   = 8;

  if (survive.resources < cost) {
    _log('Not enough resources to recharge!');
    return;
  }

  survive.shelterEnergy = clamp(survive.shelterEnergy + amount, 0, 100);
  survive.resources     = clamp(survive.resources     - cost,   0, 100);

  _log(`Shelter energy +${amount}. Resources −${cost}.`);
  saveSurvive();
}

/**
 * Advance to the next day.
 * Passive state changes + event roll.
 */
export function actionNextDay() {
  _log(`══ END OF DAY ${survive.day} ══`);

  survive.day += 1;

  // Passive resource consumption
  const dailyConsume = 8;
  survive.resources = clamp(survive.resources - dailyConsume, 0, 100);

  // Stress naturally decreases a bit overnight
  const stressDecay = randInt(3, 7);
  survive.stress = clamp(survive.stress - stressDecay, 0, 100);

  // Health changes depending on stress and resources
  const healthDelta = survive.resources > 30 ? randInt(0, 3) : -randInt(2, 5);
  survive.health = clamp(survive.health + healthDelta, 0, 100);

  // Shelter energy passive drain
  survive.shelterEnergy = clamp(survive.shelterEnergy - 5, 0, 100);

  _log(`Day ${survive.day} begins. Resources −${dailyConsume}. Stress −${stressDecay}.`);

  // Random day event
  _rollDayEvent();

  saveSurvive();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _rollDayEvent() {
  const r = Math.random();
  if (r < 0.15) {
    const bonus = randInt(5, 15);
    survive.resources = clamp(survive.resources + bonus, 0, 100);
    _log(pickRandom([
      `Supply drop nearby — +${bonus} resources!`,
      `You found an untouched cache. +${bonus} resources.`,
    ]));
  } else if (r < 0.30) {
    const stressHit = randInt(5, 12);
    survive.stress = clamp(survive.stress + stressHit, 0, 100);
    _log(pickRandom([
      `Strange noises through the night. Stress +${stressHit}.`,
      `Restless night. Stress +${stressHit}.`,
    ]));
  } else if (r < 0.40 && survive.shelterEnergy < 30) {
    _log('Shelter power is critically low. Recharge soon.');
  }
}

function _log(msg) {
  survive.log.unshift(msg);
  if (survive.log.length > 40) survive.log.pop();
}
