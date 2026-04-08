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
  actionTreat, resetAndSave, getSurviveAdvice, ACTIONS_PER_DAY,
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
    { key: 'visibility',     label: 'Visibility',     color: 'meter-blue',
      info: 'Ambient light + screen brightness + time of day. High = brighter environment — better sight but more exposed.' },
    { key: 'stealth',        label: 'Stealth',        color: 'meter-green',
      info: 'Quiet + still + dark = high stealth. Stay silent (noise < 18) for 3 s to enter GHOST mode — your exposure radius drops to 20%, making you nearly undetectable inside enemy cones.' },
    { key: 'exposure',       label: 'Exposure',       color: 'meter-orange',
      info: 'Noise + ambient light + daytime. High = you are visible to enemies. Pushes up the Danger meter and raises detection risk.' },
    { key: 'stability',      label: 'Stability',      color: 'meter-cyan',
      info: 'Device tilt & movement. High = steady. Sudden tilt spikes cause a stumble — a noise burst and −5 energy.' },
    { key: 'threatLevel',    label: 'Threat',         color: 'meter-red',
      info: 'Noise + bright light + low stealth. High = dangerous environment. Enemies spawn faster and detection radius grows.' },
    { key: 'energyModifier', label: 'Efficiency',     color: 'meter-yellow',
      info: 'Battery level + quiet environment + night-time. High = lower passive energy drain and better recovery.' },
  ];

  meterDefs.forEach(({ key, label, color, info }) => {
    const m = buildMeter(label, derived[key], color, info);
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

  // ── Debug panel ────────────────────────────────────────────────────────────
  const debugToggle = buildButton('🐛 Debug', () => _toggleDebugPanel('explore-debug'), 'btn-outline btn-small debug-toggle-btn');
  const debugPanel  = document.createElement('div');
  debugPanel.id        = 'explore-debug';
  debugPanel.className = 'debug-panel debug-hidden';

  wrap.appendChild(hud);
  wrap.appendChild(dangerBar);
  wrap.appendChild(meters);
  wrap.appendChild(_gameCanvas.canvas);
  wrap.appendChild(logEl);
  wrap.appendChild(bar);
  wrap.appendChild(debugToggle);
  wrap.appendChild(debugPanel);
  app.appendChild(wrap);

  // Start the run, hook update callback
  startRun(_onExploreUpdate);

  // rAF loop for smooth canvas redraws (independent of game tick rate)
  _canvasRafId = requestAnimationFrame(_canvasLoop);
}

/** rAF loop: redraws game canvas at display rate (~60 fps) for smooth visuals. */
function _canvasLoop(timestamp) {
  if (_gameCanvas && exploreRun.active && document.contains(_gameCanvas.canvas)) {
    _gameCanvas.draw({
      player:               exploreRun.player,
      enemies:              exploreRun.enemies,
      escapePoint:          exploreRun.escapePoint,
      inStealthMode:        exploreRun.inStealthMode,
      isDetected:           exploreRun.isDetected,
      shadowCoverage:       exploreRun.shadowCoverage,
      noiseLevel:           sensorRaw.noiseLevel,
      ambientLight:         sensorRaw.ambientLight,
      playerDetectionRadius: exploreRun.playerDetectionRadius,
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

  // Debug panel
  _updateDebugPanel('explore-debug', 'explore');
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

// ── DEBUG PANEL ───────────────────────────────────────────────────────────────

/** Toggle the visibility of a debug panel by its element id. */
function _toggleDebugPanel(panelId) {
  const el = document.getElementById(panelId);
  if (!el) return;
  el.classList.toggle('debug-hidden');
  if (!el.classList.contains('debug-hidden')) {
    _updateDebugPanel(panelId, panelId.includes('explore') ? 'explore' : 'survive');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Render the current sensor + derived values into a debug panel element.
 * @param {string} panelId  element id
 * @param {'explore'|'survive'} mode
 */
function _updateDebugPanel(panelId, mode) {
  const el = document.getElementById(panelId);
  if (!el || el.classList.contains('debug-hidden')) return;

  const status = engine.getSensorStatus();
  const usingS = engine.usingSensor;

  /** A coloured badge text for sensor status */
  function sensorBadge(stat, using) {
    if (using)         return `<span class="debug-val active">${stat.toUpperCase()} ✓</span>`;
    if (stat === 'denied' || stat === 'unsupported') return `<span class="debug-val bad">${stat.toUpperCase()}</span>`;
    return `<span class="debug-val warn">SIM (${stat})</span>`;
  }

  /** Format a 0–100 value with colour coding */
  function valClass(v, high = 'bad', low = 'ok', mid = 'warn', midThresh = [30, 70]) {
    if (v >= midThresh[1]) return high;
    if (v <= midThresh[0]) return low;
    return mid;
  }

  const noiseClass   = valClass(sensorRaw.noiseLevel, 'bad', 'ok', 'warn');
  const stealthClass = valClass(derived.stealth, 'ok', 'bad', 'warn');
  const expClass     = valClass(derived.exposure, 'bad', 'ok', 'warn');

  let modeRows = '';
  if (mode === 'explore') {
    const ghostClass  = exploreRun.inStealthMode ? 'ok' : 'warn';
    const timerClass  = exploreRun.stealthTimerSec >= 1 ? 'ok' : 'warn';
    modeRows = `
      <div class="debug-section-title">Explore State</div>
      <div class="debug-row"><span class="debug-key">Ghost Mode</span><span class="debug-val ${ghostClass}">${exploreRun.inStealthMode ? 'ON' : 'OFF'}</span></div>
      <div class="debug-row"><span class="debug-key">Silence Timer</span><span class="debug-val ${timerClass}">${exploreRun.stealthTimerSec.toFixed(1)} s</span></div>
      <div class="debug-row"><span class="debug-key">Energy</span><span class="debug-val">${Math.round(exploreRun.energy)}%</span></div>
      <div class="debug-row"><span class="debug-key">Danger</span><span class="debug-val ${valClass(exploreRun.danger)}">${Math.round(exploreRun.danger)}%</span></div>
      <div class="debug-row"><span class="debug-key">Enemies</span><span class="debug-val">${exploreRun.enemies.length}</span></div>
    `;
  } else {
    modeRows = `
      <div class="debug-section-title">Survive State</div>
      <div class="debug-row"><span class="debug-key">Day</span><span class="debug-val">${survive.day}</span></div>
      <div class="debug-row"><span class="debug-key">Resources</span><span class="debug-val ${valClass(survive.resources, 'ok', 'bad', 'warn')}">${Math.round(survive.resources)}%</span></div>
      <div class="debug-row"><span class="debug-key">Health</span><span class="debug-val ${valClass(survive.health, 'ok', 'bad', 'warn')}">${Math.round(survive.health)}%</span></div>
      <div class="debug-row"><span class="debug-key">Stress</span><span class="debug-val ${valClass(survive.stress, 'bad', 'ok', 'warn')}">${Math.round(survive.stress)}%</span></div>
      <div class="debug-row"><span class="debug-key">Shelter Energy</span><span class="debug-val ${valClass(survive.shelterEnergy, 'ok', 'bad', 'warn')}">${Math.round(survive.shelterEnergy)}%</span></div>
    `;
  }

  el.innerHTML = `
    <div class="debug-section-title">Sensor Sources</div>
    <div class="debug-row"><span class="debug-key">🎤 Noise</span>${sensorBadge(status.noise, usingS.noise)}</div>
    <div class="debug-row"><span class="debug-key">💡 Light</span>${sensorBadge(status.light, usingS.light)}</div>
    <div class="debug-row"><span class="debug-key">🔋 Battery</span>${sensorBadge(status.battery, usingS.battery)}</div>
    <div class="debug-row"><span class="debug-key">📱 Motion</span>${sensorBadge(status.motion, usingS.motion)}</div>

    <div class="debug-section-title">Raw Sensors</div>
    <div class="debug-row"><span class="debug-key">Noise Level</span><span class="debug-val ${noiseClass}">${Math.round(sensorRaw.noiseLevel)}</span></div>
    <div class="debug-row"><span class="debug-key">Ambient Light</span><span class="debug-val">${Math.round(sensorRaw.ambientLight)}</span></div>
    <div class="debug-row"><span class="debug-key">Battery</span><span class="debug-val">${Math.round(sensorRaw.batteryLevel)}%</span></div>
    <div class="debug-row"><span class="debug-key">Brightness Pref</span><span class="debug-val">${Math.round(sensorRaw.brightnessLevel)}</span></div>
    <div class="debug-row"><span class="debug-key">Tilt X / Y</span><span class="debug-val">${sensorRaw.tiltX.toFixed(2)} / ${sensorRaw.tiltY.toFixed(2)}</span></div>
    <div class="debug-row"><span class="debug-key">Hour</span><span class="debug-val">${sensorRaw.hour}:00</span></div>

    <div class="debug-section-title">Derived Values</div>
    <div class="debug-row"><span class="debug-key">Visibility</span><span class="debug-val">${Math.round(derived.visibility)}</span></div>
    <div class="debug-row"><span class="debug-key">Exposure</span><span class="debug-val ${expClass}">${Math.round(derived.exposure)}</span></div>
    <div class="debug-row"><span class="debug-key">Stealth</span><span class="debug-val ${stealthClass}">${Math.round(derived.stealth)}</span></div>
    <div class="debug-row"><span class="debug-key">Stability</span><span class="debug-val">${Math.round(derived.stability)}</span></div>
    <div class="debug-row"><span class="debug-key">Efficiency</span><span class="debug-val">${Math.round(derived.energyModifier)}</span></div>
    <div class="debug-row"><span class="debug-key">Threat</span><span class="debug-val ${valClass(derived.threatLevel)}">${Math.round(derived.threatLevel)}</span></div>

    ${modeRows}
  `;
}

// How often (ms) to refresh the survive environment summary + action hints.
const SURVIVE_UPDATE_INTERVAL_MS = 2000;

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
    { key: 'resources',     label: 'Resources',       color: 'meter-green',
      info: 'Food & supplies (0–100). Decreases −8 per day. Gained by Explore. Required for Rest (−5), Hide (−3), Recharge (−8). Zero = starvation.' },
    { key: 'health',        label: 'Health',          color: 'meter-blue',
      info: 'Physical condition. Rest and medicine restore it. Encounters, chronic stress, and starvation reduce it. Critical below 20.' },
    { key: 'stress',        label: 'Stress',          color: 'meter-orange',
      info: 'Mental pressure. Noise makes Rest and Hide less effective. Very high stress (>80) causes health damage and encounter mistakes.' },
    { key: 'shelterEnergy', label: 'Shelter Energy',  color: 'meter-cyan',
      info: 'Shelter power reserves. Recharge action restores it (amount depends on device battery). Drains −5 per day. Low power worsens rest quality.' },
  ];
  meterDefs.forEach(({ key, label, color, info }) => {
    const m = buildMeter(label, survive[key], color, info);
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

  // ── Action bar (filled dynamically in updateSurviveScreen) ──────────────────
  const bar = document.createElement('div');
  bar.className = 'action-bar action-bar-survive';
  bar.id        = 'survive-action-bar';

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

  // ── Debug panel ────────────────────────────────────────────────────────────
  const debugToggle = buildButton('🐛 Debug', () => _toggleDebugPanel('survive-debug'), 'btn-outline btn-small debug-toggle-btn');
  const debugPanel  = document.createElement('div');
  debugPanel.id        = 'survive-debug';
  debugPanel.className = 'debug-panel debug-hidden';
  wrap.appendChild(debugToggle);
  wrap.appendChild(debugPanel);

  app.appendChild(wrap);

  updateSurviveScreen();

  // Refresh env summary + action hints every 5 s so sensor changes are visible
  cache.surviveEnvInterval = setInterval(() => {
    const envEl = document.getElementById('survive-env');
    if (envEl) _renderSurviveEnv(envEl);
    const barEl = document.getElementById('survive-action-bar');
    if (barEl) _buildSurviveActionBar(barEl);
    _updateDebugPanel('survive-debug', 'survive');
  }, SURVIVE_UPDATE_INTERVAL_MS);
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

    // Action slot pips: ● = used, ○ = available
    const pips = Array.from({ length: ACTIONS_PER_DAY }, (_, i) =>
      `<span class="action-pip ${i < survive.actionsToday ? 'action-pip-used' : ''}">${i < survive.actionsToday ? '●' : '○'}</span>`
    ).join('');
    const slotsLeft = ACTIONS_PER_DAY - survive.actionsToday;
    const slotLabel = survive.actionsToday === 0
      ? '<span class="action-slots-warn">행동 후 다음날로 넘어갈 수 있어요</span>'
      : slotsLeft === 0
        ? '<span class="action-slots-full">슬롯 소진 — 다음날로 넘어가세요</span>'
        : `<span class="action-slots-info">남은 행동 ${slotsLeft}회</span>`;

    infoEl.innerHTML = `
      <div class="day-counter">Day ${survive.day}${survive.bestDays > 0 ? ` <span class="best-days">Best: ${survive.bestDays}</span>` : ''}</div>
      <div class="action-pips">${pips} ${slotLabel}</div>
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

  if (logEl) {
    renderLog(logEl, survive.log);
    logEl.scrollTop = 0;
    // Flash newest entry so the player sees the action result immediately;
    // remove the class on animationend so it can re-trigger next action.
    const firstEntry = logEl.querySelector('p');
    if (firstEntry) {
      firstEntry.classList.add('log-new');
      firstEntry.addEventListener('animationend', () => {
        firstEntry.classList.remove('log-new');
      }, { once: true });
    }
  }

  // Rebuild action bar so condition hints reflect current sensors
  const barEl = document.getElementById('survive-action-bar');
  if (barEl) _buildSurviveActionBar(barEl);

  // Debug panel
  _updateDebugPanel('survive-debug', 'survive');
}

/**
 * Compute current sensor condition hints for each survive action.
 * Returns {explore, rest, hide, recharge, treat, nextDay} — each {text, level}.
 */
function _getSurviveHints() {
  const isVeryNoisy = derived.exposure      > 78;
  const isNoisy     = derived.exposure      > 55;
  const isDark      = derived.visibility    < 35;
  const isBright    = derived.visibility    > 65;
  const isLowBat    = derived.energyModifier < 35;
  const isHighBat   = derived.energyModifier > 70;
  const last        = survive.lastAction;

  // Helper: prepend a fatigue warning when this action was used last
  function withFatigue(base, key) {
    if (last !== key) return base;
    return { text: `⚠ 연속 사용 — 효과 −30%`, level: 'bad' };
  }

  // REST
  let rest;
  if (isVeryNoisy)     rest = { text: '🔴 Very noisy — poor rest',    level: 'bad'  };
  else if (isNoisy)    rest = { text: '🟡 Noisy — rest reduced',       level: 'warn' };
  else if (isDark)     rest = { text: '🟢 Dark & quiet — deep rest',   level: 'ok'   };
  else                 rest = { text: '🟢 Quiet — good rest',          level: 'ok'   };
  rest = withFatigue(rest, 'rest');

  // HIDE
  let hide;
  if (isDark && !isVeryNoisy)  hide = { text: '🟢 Dark cover — ideal',    level: 'ok'   };
  else if (isBright)           hide = { text: '🔴 Too bright — risky',    level: 'bad'  };
  else if (isVeryNoisy)        hide = { text: '🔴 Very noisy — unsafe',   level: 'bad'  };
  else if (isNoisy)            hide = { text: '🟡 Noisy — stay alert',    level: 'warn' };
  else                         hide = { text: '🟡 Moderate conditions',   level: 'warn' };
  hide = withFatigue(hide, 'hide');

  // EXPLORE
  let explore;
  if (isBright && derived.stealth < 50)  explore = { text: '🟡 Exposed — watch out',    level: 'warn' };
  else if (isDark)                       explore = { text: '🟡 Dark — fewer supplies',   level: 'warn' };
  else if (derived.stealth > 65)         explore = { text: '🟢 Good stealth — safe run', level: 'ok'   };
  else if (isLowBat)                     explore = { text: '🟡 Low battery — tiring',    level: 'warn' };
  else                                   explore = { text: '🟢 Clear conditions',        level: 'ok'   };
  explore = withFatigue(explore, 'explore');

  // RECHARGE
  let recharge;
  if (isHighBat)      recharge = { text: '🟢 High battery — efficient',  level: 'ok'   };
  else if (isLowBat)  recharge = { text: '🔴 Low battery — poor yield',  level: 'bad'  };
  else if (isBright)  recharge = { text: '🟡 Light bonus available',     level: 'ok'   };
  else                recharge = { text: '🟡 Moderate efficiency',       level: 'warn' };
  recharge = withFatigue(recharge, 'recharge');

  // TREAT
  let treat;
  if (survive.resources < 15)        treat = { text: '🔴 Not enough resources',   level: 'bad'  };
  else if (survive.stress > 70 || survive.health < 40)
                                     treat = { text: '🟢 Recommended — critical state', level: 'ok' };
  else if (survive.stress > 50 || survive.health < 60)
                                     treat = { text: '🟡 Would help — moderate state', level: 'warn' };
  else                               treat = { text: '🟡 Costs 15 resources',     level: 'warn' };
  treat = withFatigue(treat, 'treat');

  // NEXT DAY
  let nextDay;
  if (survive.actionsToday === 0)  nextDay = { text: '⛔ 먼저 행동하세요',        level: 'bad'  };
  else if (survive.health <= 0)    nextDay = { text: '💀 Health failed!',         level: 'bad'  };
  else if (survive.health < 20)    nextDay = { text: '⚠ Health critical!',        level: 'bad'  };
  else if (survive.resources <= 0) nextDay = { text: '⚠ No resources!',           level: 'bad'  };
  else if (survive.stress > 80)    nextDay = { text: '⚠ Stress critical!',        level: 'bad'  };
  else                             nextDay = { text: `→ Day ${survive.day + 1}`,   level: 'ok'  };

  return { rest, hide, explore, recharge, treat, nextDay };
}

/**
 * Build (or rebuild) the survive action bar with sensor condition hints.
 * Called on initial build, after every action, and on the 5 s interval.
 */
function _buildSurviveActionBar(container) {
  container.innerHTML = '';
  const hints    = _getSurviveHints();
  const slotsMax = survive.actionsToday >= ACTIONS_PER_DAY;  // all slots used
  const noAction = survive.actionsToday === 0;               // nothing done yet

  const actions = [
    { label: '🔍 Explore', hint: hints.explore,  fn: () => { actionExplore();  updateSurviveScreen(); }, key: 'action' },
    { label: '😴 Rest',     hint: hints.rest,     fn: () => { actionRest();     updateSurviveScreen(); }, key: 'action' },
    { label: '🫥 Hide',     hint: hints.hide,     fn: () => { actionHide();     updateSurviveScreen(); }, key: 'action' },
    { label: '🔋 Recharge', hint: hints.recharge, fn: () => { actionRecharge(); updateSurviveScreen(); }, key: 'action' },
    { label: '💊 Treat',    hint: hints.treat,    fn: () => { actionTreat();    updateSurviveScreen(); }, key: 'action' },
    { label: '🌅 Next Day', hint: hints.nextDay,  fn: () => { actionNextDay();  updateSurviveScreen(); }, key: 'nextday' },
  ];
  actions.forEach(({ label, hint, fn, key }) => {
    const card   = document.createElement('div');
    card.className = 'action-card';
    const btn = buildButton(label, fn, 'btn-action');
    // Disable action buttons when all slots are used; disable Next Day when nothing done yet
    if (key === 'action' && slotsMax) btn.disabled = true;
    if (key === 'nextday' && noAction) btn.disabled = true;
    card.appendChild(btn);
    const hintEl = document.createElement('div');
    hintEl.className   = `action-hint action-hint-${hint.level}`;
    hintEl.textContent = hint.text;
    card.appendChild(hintEl);
    container.appendChild(card);
  });
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
