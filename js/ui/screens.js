/**
 * screens.js
 * Build and update each game screen's DOM.
 *
 * Screens are single-page-app style: one <div id="app"> holds one screen at a time.
 * Each buildXxxScreen() injects markup into #app.
 * Each updateXxxScreen() refreshes live values without full rebuilds.
 */

import {
  buildMeter, updateMeter, buildButton, renderLog,
  buildSensorRow, buildGameCanvas, showModal,
} from './components.js';
import { sensorRaw, derived, exploreRun, survive, ui } from '../state.js';
import engine from '../engine/hybridRealityEngine.js';
import { startRun, pauseRun, resumeRun, endRun } from '../modes/exploreMode.js';
import {
  actionExplore, actionRest, actionHide, actionRecharge, actionNextDay,
  resetAndSave, getSurviveAdvice,
} from '../modes/surviveMode.js';
import { formatTime } from '../utils.js';
import { navigate } from '../nav.js';

// Cached references to frequently updated elements
const cache = {};

// ── HOME SCREEN ───────────────────────────────────────────────────────────────

export function buildHomeScreen() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'screen screen-home';

  wrap.innerHTML = `
    <div class="home-hero">
      <div class="home-title">IN &amp; OUT</div>
      <div class="home-sub">A Hybrid Reality Survival Game</div>
      <p class="home-desc">
        Your real environment shapes this world.<br>
        Noise, light, time, and battery affect the game.
      </p>
      <p class="home-note">
        ⚠ Some sensors require permission (mic, motion).<br>
        Fallback sliders are provided for unsupported sensors.
      </p>
    </div>
    <div class="home-buttons">
    </div>
  `;

  const btns = wrap.querySelector('.home-buttons');
  btns.appendChild(buildButton('▶ Start Explore', () => navigate('explore'), 'btn-primary btn-large'));
  btns.appendChild(buildButton('🏠 Start Survive', () => navigate('survive'), 'btn-secondary btn-large'));
  btns.appendChild(buildButton('🔬 Sensor Test',   () => navigate('sensor'),  'btn-outline btn-large'));

  app.appendChild(wrap);
}

// ── SENSOR TEST SCREEN ────────────────────────────────────────────────────────

export function buildSensorScreen() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'screen screen-sensor';

  const header = document.createElement('div');
  header.className = 'screen-header';
  header.innerHTML = `<h2>Sensor Test</h2>`;
  header.appendChild(buildButton('← Home', () => navigate('home'), 'btn-outline btn-small'));

  // Help note explaining sensor behaviour
  const helpNote = document.createElement('p');
  helpNote.className = 'sensor-help-note';
  helpNote.textContent =
    'Some mobile browsers block sensors until you tap Enable Sensors. ' +
    'If a sensor is unavailable, simulation controls will be used instead.';

  // Note shown when permissions are permanently denied at the OS level
  const deniedNote = document.createElement('p');
  deniedNote.className = 'sensor-denied-note';
  deniedNote.style.display = 'none';
  deniedNote.textContent =
    'Permission was denied. To re-enable, go to your device Settings ' +
    'and allow this site to access the microphone and motion sensors ' +
    '(iOS: Settings → Privacy → Microphone / Motion & Fitness; ' +
    'Android: Settings → Apps → Browser → Permissions).';

  // Prominent "Enable Sensors" button — permission is only requested on tap
  const enableBtn = buildButton('🔓 Enable Sensors', async () => {
    enableBtn.disabled    = true;
    deniedNote.style.display = 'none';
    enableBtn.textContent = 'Requesting…';
    await engine.enableSensors();
    // Check if any permission was denied so the user can try again
    const status = engine.getSensorStatus();
    const anyDenied = status.noise === 'denied' || status.motion === 'denied';
    if (anyDenied) {
      enableBtn.disabled    = false;
      enableBtn.textContent = '🔒 Retry Permissions';
      deniedNote.style.display = '';
    } else {
      enableBtn.textContent = '✓ Sensors Enabled';
    }
    // Immediately refresh the sensor rows to reflect new statuses
    updateSensorScreen();
  }, 'btn-primary btn-enable-sensors');

  // Sensor rows container
  const rows = document.createElement('div');
  rows.className = 'sensor-rows';
  rows.id        = 'sensor-rows';

  // Fallback controls
  const fallbackSection = document.createElement('div');
  fallbackSection.className = 'fallback-section';
  fallbackSection.innerHTML = `<h3>Simulation Controls</h3>
    <p class="fallback-note">These sliders are always active. Real sensors override them when available.</p>`;

  const sliders = _buildFallbackSliders();
  fallbackSection.appendChild(sliders);

  // Tilt simulation buttons (desktop / iOS before permission)
  const tiltPanel = document.createElement('div');
  tiltPanel.className = 'tilt-panel';
  tiltPanel.innerHTML = `<p class="tilt-hint">Tilt simulation (or use arrow keys):</p>`;
  const tiltBtns = document.createElement('div');
  tiltBtns.className = 'tilt-buttons';

  const motionReader = _motionReaderRef;
  const step = 0.2;
  tiltBtns.appendChild(buildButton('▲', () => { motionReader.tiltY -= step; }, 'btn-tilt'));
  tiltBtns.appendChild(buildButton('◀', () => { motionReader.tiltX -= step; }, 'btn-tilt'));
  tiltBtns.appendChild(buildButton('●', () => { motionReader.tiltX = 0; motionReader.tiltY = 0; }, 'btn-tilt'));
  tiltBtns.appendChild(buildButton('▶', () => { motionReader.tiltX += step; }, 'btn-tilt'));
  tiltBtns.appendChild(buildButton('▼', () => { motionReader.tiltY += step; }, 'btn-tilt'));
  tiltPanel.appendChild(tiltBtns);
  fallbackSection.appendChild(tiltPanel);

  wrap.appendChild(header);
  wrap.appendChild(helpNote);
  wrap.appendChild(enableBtn);
  wrap.appendChild(deniedNote);
  wrap.appendChild(rows);
  wrap.appendChild(fallbackSection);
  app.appendChild(wrap);

  // Initial render
  updateSensorScreen();

  // Live update loop
  cache.sensorInterval = setInterval(updateSensorScreen, 500);
}

function _buildFallbackSliders() {
  const wrap = document.createElement('div');
  wrap.className = 'slider-group';

  const items = [
    { key: 'noiseLevel',     label: 'Noise Level',      id: 'fb-noise'    },
    { key: 'ambientLight',   label: 'Ambient Light',    id: 'fb-light'    },
    { key: 'batteryLevel',   label: 'Battery Level',    id: 'fb-battery'  },
    { key: 'brightnessLevel',label: 'Brightness Pref',  id: 'fb-bright'   },
  ];

  items.forEach(({ key, label, id }) => {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const lbl = document.createElement('label');
    lbl.htmlFor     = id;
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type  = 'range';
    input.id    = id;
    input.min   = '0';
    input.max   = '100';
    input.value = String(engine.getFallback(key));
    input.addEventListener('input', () => {
      engine.setFallback(key, Number(input.value));
      valSpan.textContent = input.value;
    });

    const valSpan = document.createElement('span');
    valSpan.className   = 'slider-val';
    valSpan.textContent = input.value;

    row.appendChild(lbl);
    row.appendChild(input);
    row.appendChild(valSpan);
    wrap.appendChild(row);
  });

  return wrap;
}

export function updateSensorScreen() {
  const rows    = document.getElementById('sensor-rows');
  if (!rows) return;

  const status = engine.getSensorStatus();

  const sensors = [
    { id: 'noise',   label: 'Noise Level',    status: status.noise,
      val: `${Math.round(sensorRaw.noiseLevel)}` },
    { id: 'light',   label: 'Ambient Light',  status: status.light,
      val: `${Math.round(sensorRaw.ambientLight)}` },
    { id: 'battery', label: 'Battery',        status: status.battery,
      val: `${Math.round(sensorRaw.batteryLevel)}%` },
    { id: 'motion',  label: 'Tilt X / Y',     status: status.motion,
      val: `${sensorRaw.tiltX.toFixed(2)} / ${sensorRaw.tiltY.toFixed(2)}` },
    { id: 'time',    label: 'Time of Day',    status: 'active',
      val: `${sensorRaw.hour}:00` },
    { id: 'brightness', label: 'Brightness Pref', status: 'active',
      val: `${Math.round(sensorRaw.brightnessLevel)}` },
  ];

  rows.innerHTML = '';
  sensors.forEach(s => {
    rows.appendChild(buildSensorRow(s.id, s.label, s.status, s.val));
  });
}

export function teardownSensorScreen() {
  if (cache.sensorInterval) {
    clearInterval(cache.sensorInterval);
    cache.sensorInterval = null;
  }
}

// ── EXPLORE SCREEN ────────────────────────────────────────────────────────────

let _gameCanvas = null;
let _canvasRafId = null;

export function buildExploreScreen() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  cache.exploreMeterEls = {};

  const wrap = document.createElement('div');
  wrap.className = 'screen screen-explore';

  // ── Top HUD ────────────────────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.id        = 'explore-hud';

  const hudLeft = document.createElement('div');
  hudLeft.className = 'hud-left';
  hudLeft.innerHTML = `
    <div class="hud-stat" id="hud-score">Score: 0</div>
    <div class="hud-stat" id="hud-timer">0:00</div>
  `;

  const hudRight = document.createElement('div');
  hudRight.className = 'hud-right';
  hudRight.innerHTML = `
    <div class="hud-stat" id="hud-energy">Energy: 100%</div>
    <div class="player-state-badge" id="player-state-badge">READY</div>
  `;

  hud.appendChild(hudLeft);
  hud.appendChild(hudRight);

  // ── Danger bar ────────────────────────────────────────────────────────────
  const dangerBar = document.createElement('div');
  dangerBar.className = 'explore-danger-bar';
  dangerBar.id        = 'explore-danger-bar';
  dangerBar.innerHTML = `
    <span class="danger-label">⚠ Danger</span>
    <div class="danger-track"><div class="danger-fill" id="explore-danger-fill" style="width:0%"></div></div>
    <span class="danger-value" id="explore-danger-val">0%</span>
  `;

  // ── Derived state meters ───────────────────────────────────────────────────
  const meters = document.createElement('div');
  meters.className = 'meters-panel';
  meters.id        = 'explore-meters';

  const meterDefs = [
    { key: 'visibility',     label: 'Visibility',     color: 'meter-blue'   },
    { key: 'stealth',        label: 'Stealth',        color: 'meter-green'  },
    { key: 'exposure',       label: 'Exposure',       color: 'meter-orange' },
    { key: 'stability',      label: 'Stability',      color: 'meter-cyan'   },
    { key: 'threatLevel',    label: 'Threat',         color: 'meter-red'    },
    { key: 'energyModifier', label: 'Efficiency',     color: 'meter-yellow' },
  ];

  meterDefs.forEach(({ key, label, color }) => {
    const m = buildMeter(label, derived[key], color);
    m.id = `meter-${key}`;
    cache.exploreMeterEls[key] = m;
    meters.appendChild(m);
  });

  // ── Game canvas ─────────────────────────────────────────────────────────────
  _gameCanvas = buildGameCanvas();
  _gameCanvas.canvas.classList.add('explore-game-canvas');

  // ── Event log ─────────────────────────────────────────────────────────────
  const logEl = document.createElement('div');
  logEl.id        = 'explore-log';
  logEl.className = 'event-log';

  // ── Bottom action bar ──────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'action-bar';
  bar.id        = 'explore-action-bar';

  cache.btnPauseResume = buildButton('⏸ Pause', _handlePauseResume, 'btn-secondary');
  const btnEnd = buildButton('■ End Run', () => {
    endRun('player');
  }, 'btn-danger');
  const btnHome = buildButton('← Home', () => {
    endRun('player');
    navigate('home');
  }, 'btn-outline');

  bar.appendChild(cache.btnPauseResume);
  bar.appendChild(btnEnd);
  bar.appendChild(btnHome);

  wrap.appendChild(hud);
  wrap.appendChild(dangerBar);
  wrap.appendChild(meters);
  wrap.appendChild(_gameCanvas.canvas);
  wrap.appendChild(logEl);
  wrap.appendChild(bar);
  app.appendChild(wrap);

  // Start the run, hook update callback
  startRun(_onExploreUpdate);

  // rAF loop for smooth canvas redraws (independent of game tick rate)
  _canvasRafId = requestAnimationFrame(_canvasLoop);
}

/** rAF loop: redraws game canvas at display rate (~60 fps) for smooth visuals. */
function _canvasLoop(timestamp) {
  if (_gameCanvas && exploreRun.active) {
    _gameCanvas.draw({
      player:         exploreRun.player,
      enemies:        exploreRun.enemies,
      escapePoint:    exploreRun.escapePoint,
      inStealthMode:  exploreRun.inStealthMode,
      isDetected:     exploreRun.isDetected,
      shadowCoverage: exploreRun.shadowCoverage,
      noiseLevel:     sensorRaw.noiseLevel,
      ambientLight:   sensorRaw.ambientLight,
      timestamp,
    });
  }
  _canvasRafId = requestAnimationFrame(_canvasLoop);
}

export function teardownExploreScreen() {
  if (_canvasRafId !== null) {
    cancelAnimationFrame(_canvasRafId);
    _canvasRafId = null;
  }
  _gameCanvas = null;
}

function _handlePauseResume() {
  if (exploreRun.paused) {
    resumeRun();
    cache.btnPauseResume.textContent = '⏸ Pause';
  } else {
    pauseRun();
    cache.btnPauseResume.textContent = '▶ Resume';
  }
}

function _onExploreUpdate(event) {
  if (event === 'end') {
    _showRunSummary();
    return;
  }
  _refreshExploreHUD();
}

function _refreshExploreHUD() {
  const scoreEl  = document.getElementById('hud-score');
  const timerEl  = document.getElementById('hud-timer');
  const energyEl = document.getElementById('hud-energy');
  const logEl    = document.getElementById('explore-log');
  const badgeEl  = document.getElementById('player-state-badge');

  if (scoreEl)  scoreEl.textContent  = `Score: ${Math.floor(exploreRun.score)}`;
  if (timerEl)  timerEl.textContent  = formatTime(exploreRun.elapsed);
  if (energyEl) energyEl.textContent = `Energy: ${Math.round(exploreRun.energy)}%`;

  // Player state badge
  if (badgeEl) {
    let stateText, stateClass;
    if (exploreRun.inStealthMode) {
      stateText = '🫥 GHOST';        stateClass = 'state-stealth';
    } else if (exploreRun.isDetected) {
      stateText = '🚨 EXPOSED';      stateClass = 'state-detected';
    } else if (exploreRun.shadowCoverage > 0.4) {
      stateText = '🌑 HIDDEN';       stateClass = 'state-hidden';
    } else {
      stateText = '👁 CAUTION';      stateClass = 'state-caution';
    }
    badgeEl.textContent = stateText;
    badgeEl.className   = `player-state-badge ${stateClass}`;
  }

  // Detection flash on the explore screen wrapper — trigger once per detection event
  const screenEl = document.querySelector('.screen-explore');
  if (screenEl) {
    if (exploreRun.isDetected && !screenEl.classList.contains('detection-flash')) {
      screenEl.classList.add('detection-flash');
      // Remove after animation completes so it can re-trigger next event
      screenEl.addEventListener('animationend', () => {
        screenEl.classList.remove('detection-flash');
      }, { once: true });
    }
  }

  // Danger bar
  const dangerPct    = Math.round(exploreRun.danger);
  const dangerFillEl = document.getElementById('explore-danger-fill');
  const dangerValEl  = document.getElementById('explore-danger-val');
  const dangerBarEl  = document.getElementById('explore-danger-bar');
  if (dangerFillEl) dangerFillEl.style.width = `${dangerPct}%`;
  if (dangerValEl)  dangerValEl.textContent  = `${dangerPct}%`;
  if (dangerBarEl)  dangerBarEl.classList.toggle('is-high', dangerPct > 66);

  // Update meters
  if (cache.exploreMeterEls) {
    Object.keys(cache.exploreMeterEls).forEach(key => {
      updateMeter(cache.exploreMeterEls[key], derived[key]);
    });
  }

  // Log
  if (logEl) renderLog(logEl, exploreRun.log);
}

function _showRunSummary() {
  const s = exploreRun.summary || {};
  const score   = s.score   ?? Math.floor(exploreRun.score);
  const time    = formatTime(s.elapsed ?? exploreRun.elapsed);
  const cause   = s.mainCause  || '—';
  const sensor  = s.topSensor  || '—';
  const escaped = s.reason === 'escaped';

  const title = escaped ? '🎉 Escaped!' : 'Run Complete';
  const body = `
    <div class="run-summary-grid">
      <div class="summary-item">
        <div class="summary-label">Result</div>
        <div class="summary-value">${escaped ? '✅ ESCAPED' : s.reason === 'energy' ? '💀 Energy Out' : '🚪 Ended'}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Final Score</div>
        <div class="summary-value">${score}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Survival Time</div>
        <div class="summary-value">${time}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">${escaped ? 'Top Sensor' : 'Cause of Failure'}</div>
        <div class="summary-value">${escaped ? sensor : cause}</div>
      </div>
    </div>
  `;
  showModal(title, body, 'Back to Home', () => navigate('home'));
}

// ── SURVIVE SCREEN ────────────────────────────────────────────────────────────

export function buildSurviveScreen() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  cache.surviveMeterEls = {};

  const wrap = document.createElement('div');
  wrap.className = 'screen screen-survive';

  // ── Top info panel ────────────────────────────────────────────────────────
  const infoPanel = document.createElement('div');
  infoPanel.className = 'survive-info';
  infoPanel.id        = 'survive-info';

  // Day counter is rendered via updateSurviveScreen

  // ── Resource meters ────────────────────────────────────────────────────────
  const meters = document.createElement('div');
  meters.className = 'meters-panel';
  meters.id        = 'survive-meters';

  const meterDefs = [
    { key: 'resources',     label: 'Resources',       color: 'meter-green'  },
    { key: 'health',        label: 'Health',          color: 'meter-blue'   },
    { key: 'stress',        label: 'Stress',          color: 'meter-orange' },
    { key: 'shelterEnergy', label: 'Shelter Energy',  color: 'meter-cyan'   },
  ];
  meterDefs.forEach(({ key, label, color }) => {
    const m = buildMeter(label, survive[key], color);
    m.id = `smeter-${key}`;
    cache.surviveMeterEls[key] = m;
    meters.appendChild(m);
  });

  // ── Environment summary ───────────────────────────────────────────────────
  const envSummary = document.createElement('div');
  envSummary.className = 'env-summary';
  envSummary.id        = 'survive-env';

  // ── Event log ─────────────────────────────────────────────────────────────
  const logEl = document.createElement('div');
  logEl.id        = 'survive-log';
  logEl.className = 'event-log';

  // ── Action bar ────────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'action-bar action-bar-survive';

  const actions = [
    { label: '🔍 Explore',  fn: () => { actionExplore();  updateSurviveScreen(); } },
    { label: '😴 Rest',      fn: () => { actionRest();     updateSurviveScreen(); } },
    { label: '🫥 Hide',      fn: () => { actionHide();     updateSurviveScreen(); } },
    { label: '🔋 Recharge',  fn: () => { actionRecharge(); updateSurviveScreen(); } },
    { label: '🌅 Next Day',  fn: () => { actionNextDay();  updateSurviveScreen(); } },
  ];

  actions.forEach(({ label, fn }) => {
    bar.appendChild(buildButton(label, fn, 'btn-action'));
  });

  // Extra row: home + new game
  const extraBar = document.createElement('div');
  extraBar.className = 'action-bar-extra';
  extraBar.appendChild(buildButton('← Home', () => navigate('home'), 'btn-outline btn-small'));
  extraBar.appendChild(buildButton('🔄 New Game', () => {
    if (confirm('Start a new game? Current save will be lost.')) {
      resetAndSave();
      updateSurviveScreen();
    }
  }, 'btn-danger btn-small'));

  wrap.appendChild(infoPanel);
  wrap.appendChild(meters);
  wrap.appendChild(envSummary);
  wrap.appendChild(logEl);
  wrap.appendChild(bar);
  wrap.appendChild(extraBar);
  app.appendChild(wrap);

  updateSurviveScreen();

  // Refresh env summary every 5 s so sensor changes are reflected without an action
  cache.surviveEnvInterval = setInterval(() => {
    const envEl = document.getElementById('survive-env');
    if (envEl) _renderSurviveEnv(envEl);
  }, 5000);
}

export function teardownSurviveScreen() {
  if (cache.surviveEnvInterval) {
    clearInterval(cache.surviveEnvInterval);
    cache.surviveEnvInterval = null;
  }
}

export function updateSurviveScreen() {
  const infoEl = document.getElementById('survive-info');
  const envEl  = document.getElementById('survive-env');
  const logEl  = document.getElementById('survive-log');

  if (infoEl) {
    // Collect critical-state badges
    const badges = [];
    if (survive.health <= 0)        badges.push('<span class="survive-crit">💀 Health Fail</span>');
    else if (survive.health < 20)   badges.push('<span class="survive-crit">⚠ Critical Health</span>');
    else if (survive.health < 40)   badges.push('<span class="survive-warn">⚡ Low Health</span>');
    if (survive.resources <= 0)     badges.push('<span class="survive-crit">⚠ No Resources</span>');
    else if (survive.resources < 15) badges.push('<span class="survive-warn">⚡ Low Resources</span>');
    if (survive.stress > 85)        badges.push('<span class="survive-crit">⚠ Stress Critical</span>');
    else if (survive.stress > 70)   badges.push('<span class="survive-warn">⚡ High Stress</span>');
    if (survive.shelterEnergy < 10) badges.push('<span class="survive-crit">⚠ Shelter Failing</span>');
    else if (survive.shelterEnergy < 25) badges.push('<span class="survive-warn">⚡ Power Low</span>');

    const advice = getSurviveAdvice();

    infoEl.innerHTML = `
      <div class="day-counter">Day ${survive.day}</div>
      ${badges.length ? `<div class="survive-status-row">${badges.join('')}</div>` : ''}
      ${advice ? `<div class="survive-advice">${advice}</div>` : ''}
    `;
  }

  if (envEl) _renderSurviveEnv(envEl);

  // Update resource meters
  if (cache.surviveMeterEls) {
    Object.keys(cache.surviveMeterEls).forEach(key => {
      updateMeter(cache.surviveMeterEls[key], survive[key]);
    });
  }

  if (logEl) renderLog(logEl, survive.log);
}

/** Render the environment summary panel (also called on interval). */
function _renderSurviveEnv(envEl) {
  const hour   = sensorRaw.hour;
  const period = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  const noiseVal = Math.round(sensorRaw.noiseLevel);
  const noiseCond = noiseVal > 70
    ? '<span class="cond-bad">VERY NOISY</span>'
    : noiseVal > 45
      ? '<span class="cond-warn">NOISY</span>'
      : '<span class="cond-good">QUIET</span>';

  const lightVal = Math.round(sensorRaw.ambientLight);
  const lightCond = lightVal < 25
    ? '<span class="cond-good">DARK</span>'
    : lightVal > 65
      ? '<span class="cond-warn">BRIGHT</span>'
      : '<span class="cond-ok">DIM</span>';

  const battVal = Math.round(derived.energyModifier);
  const battCond = battVal < 30
    ? '<span class="cond-bad">LOW</span>'
    : battVal > 70
      ? '<span class="cond-good">HIGH</span>'
      : '<span class="cond-ok">OK</span>';

  const stealthVal = Math.round(derived.stealth);
  const stealthCond = stealthVal > 65
    ? '<span class="cond-good">CONCEALED</span>'
    : stealthVal < 35
      ? '<span class="cond-bad">EXPOSED</span>'
      : '<span class="cond-ok">MODERATE</span>';

  envEl.innerHTML = `
    <div class="env-row">🕐 ${period} (${hour}:00)</div>
    <div class="env-row">🔊 Noise: ${noiseCond}</div>
    <div class="env-row">💡 Light: ${lightCond}</div>
    <div class="env-row">🔋 Power: ${battCond}</div>
    <div class="env-row">👁 Stealth: ${stealthCond}</div>
    <div class="env-row">⚠ Threat: ${Math.round(derived.threatLevel)}</div>
  `;
}

// ── Motion reader ref — assigned by app.js after engine starts ───────────────

// Assigned lazily by app.js after engine starts
export let _motionReaderRef = { tiltX: 0, tiltY: 0 };
export function setMotionReaderRef(ref) {
  _motionReaderRef = ref;
}
