/**
 * components.js
 * Reusable DOM component builders.
 *
 * All functions return DOM elements or update existing ones.
 * Nothing here reads game state directly — callers pass in values.
 */

// ── Meter bar ─────────────────────────────────────────────────────────────────

/**
 * Build a labelled meter bar.
 * @param {string} label
 * @param {number} value  0–100
 * @param {string} [colorClass]  CSS class for fill colour
 * @param {string|null} [info]   Optional description shown on ? button tap
 * @returns {HTMLElement}
 */
export function buildMeter(label, value, colorClass = 'meter-default', info = null) {
  const wrap  = document.createElement('div');
  wrap.className = 'meter-wrap';

  const header = document.createElement('div');
  header.className = 'meter-header';

  const lbl = document.createElement('span');
  lbl.className   = 'meter-label';
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className   = 'meter-value';
  val.textContent = `${Math.round(value)}%`;

  // Left side: label + optional info button
  const labelGroup = document.createElement('span');
  labelGroup.style.display = 'flex';
  labelGroup.style.alignItems = 'center';
  labelGroup.appendChild(lbl);

  if (info) {
    const infoBtn = document.createElement('button');
    infoBtn.className   = 'meter-info-btn';
    infoBtn.textContent = '?';
    infoBtn.title       = info;
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showModal(label, `<p>${info}</p>`, 'OK', null);
    });
    labelGroup.appendChild(infoBtn);
  }

  header.appendChild(labelGroup);
  header.appendChild(val);

  const track = document.createElement('div');
  track.className = 'meter-track';

  const fill = document.createElement('div');
  fill.className = `meter-fill ${colorClass}`;
  fill.style.width = `${Math.round(value)}%`;

  track.appendChild(fill);
  wrap.appendChild(header);
  wrap.appendChild(track);
  return wrap;
}

/**
 * Update an existing meter element in place.
 * @param {HTMLElement} meterEl  Element returned by buildMeter
 * @param {number} value         0–100
 */
export function updateMeter(meterEl, value) {
  const v = Math.round(value);
  const valEl  = meterEl.querySelector('.meter-value');
  const fillEl = meterEl.querySelector('.meter-fill');
  if (valEl)  valEl.textContent = `${v}%`;
  if (fillEl) fillEl.style.width = `${v}%`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

/**
 * Build a small status badge.
 * @param {string} text
 * @param {'ok'|'warn'|'error'|'off'} type
 * @returns {HTMLElement}
 */
export function buildBadge(text, type = 'off') {
  const el = document.createElement('span');
  el.className   = `badge badge-${type}`;
  el.textContent = text;
  return el;
}

// ── Action button ─────────────────────────────────────────────────────────────

/**
 * Build a large touch-friendly action button.
 * @param {string} label
 * @param {Function} onClick
 * @param {string} [extraClass]
 * @returns {HTMLButtonElement}
 */
export function buildButton(label, onClick, extraClass = '') {
  const btn = document.createElement('button');
  btn.className   = `btn ${extraClass}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

// ── Event log ─────────────────────────────────────────────────────────────────

/**
 * Build a scrollable event log panel.
 * @param {string[]} entries
 * @returns {HTMLElement}
 */
export function buildLog(entries) {
  const el = document.createElement('div');
  el.className = 'event-log';
  renderLog(el, entries);
  return el;
}

/**
 * Re-render the log entries inside an existing log panel.
 * Accepts either plain strings (survive mode) or
 * {msg, type, time} objects (explore mode).
 * @param {HTMLElement} logEl
 * @param {Array<string|{msg:string,type:string,time:string}>} entries
 */
export function renderLog(logEl, entries) {
  logEl.innerHTML = '';
  entries.forEach(entry => {
    const p = document.createElement('p');
    if (typeof entry === 'string') {
      p.textContent = entry;
    } else {
      if (entry.time) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = `[${entry.time}] `;
        p.appendChild(timeSpan);
      }
      const msgSpan = document.createElement('span');
      msgSpan.textContent = entry.msg;
      p.appendChild(msgSpan);
      if (entry.type && entry.type !== 'info') {
        p.classList.add(`log-${entry.type}`);
      }
    }
    logEl.appendChild(p);
  });
}

// ── Sensor row ────────────────────────────────────────────────────────────────

/**
 * Build a sensor test row with label, status badge and value display.
 * @param {string} id     unique id prefix
 * @param {string} label
 * @param {string} status 'unsupported'|'permission-required'|'active'|'error'
 * @param {string} valueStr
 * @returns {HTMLElement}
 */
export function buildSensorRow(id, label, status, valueStr) {
  const row = document.createElement('div');
  row.className = 'sensor-row';
  row.id        = `sensor-row-${id}`;

  const lbl = document.createElement('span');
  lbl.className   = 'sensor-label';
  lbl.textContent = label;

  const statusMap = {
    'active':             { text: 'ACTIVE',            type: 'ok'    },
    'permission-needed':  { text: 'PERMISSION NEEDED', type: 'warn'  },
    'using-simulation':   { text: 'USING SIMULATION',  type: 'off'   },
    'unsupported':        { text: 'UNSUPPORTED',       type: 'off'   },
    'denied':             { text: 'DENIED',            type: 'error' },
    // legacy values kept for safety
    'permission-required':{ text: 'PERMISSION NEEDED', type: 'warn'  },
    'error':              { text: 'ERROR',             type: 'error' },
  };
  const s   = statusMap[status] || statusMap['unsupported'];
  const bdg = buildBadge(s.text, s.type);

  const val = document.createElement('span');
  val.className   = 'sensor-value';
  val.id          = `sensor-val-${id}`;
  val.textContent = valueStr;

  row.appendChild(lbl);
  row.appendChild(bdg);
  row.appendChild(val);
  return row;
}

// ── Game canvas (replaces mini radar) ────────────────────────────────────────

/**
 * Build a full game canvas for Explore mode.
 * Displays: shadow zones, escape beacon, enemy cone FOVs, player exposure radius.
 *
 * @returns {{ canvas: HTMLCanvasElement, draw: Function }}
 */
export function buildGameCanvas() {
  const PULSE_PERIOD_MS = 2400; // full oscillation cycle in milliseconds (~2.4 s gentle pulse)

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.width  = 300;
  canvas.height = 300;

  /**
   * Redraw the game canvas.
   * @param {{
   *   player:               {x:number, y:number},
   *   enemies:              Array<{x,y,fovRange,fovHalfAngle,facingAngle,alerted}>,
   *   escapePoint:          {x:number, y:number},
   *   inStealthMode:        boolean,
   *   isDetected:           boolean,
   *   shadowCoverage:       number,
   *   noiseLevel:           number,
   *   ambientLight:         number,
   *   playerDetectionRadius: number,
   *   timestamp:            number,   rAF timestamp for smooth animation
   * }} state
   */
  function draw(state) {
    const {
      player, enemies, escapePoint,
      inStealthMode, isDetected, shadowCoverage, noiseLevel,
      playerDetectionRadius = 0,
      timestamp = 0,
    } = state;

    // pulse oscillates 0–1 over PULSE_PERIOD_MS milliseconds (consistent within each frame)
    const pulse = (Math.sin(timestamp * 2 * Math.PI / PULSE_PERIOD_MS) + 1) / 2;

    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, W, H);

    // ── Shadow zones (corners darken when ambient light is low) ─────────────
    if (shadowCoverage > 0.1) {
      const corners = [
        { x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H },
      ];
      corners.forEach(c => {
        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, W * 0.5);
        grad.addColorStop(0, `rgba(0,0,0,${shadowCoverage * 0.75})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      });

      // Subtle blue-teal tint in shadows to indicate safe zones
      ctx.fillStyle = `rgba(0,40,60,${shadowCoverage * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── Grid ────────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1a2a1a';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * W / 10, 0); ctx.lineTo(i * W / 10, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * H / 10); ctx.lineTo(W, i * H / 10);
      ctx.stroke();
    }

    // ── Escape beacon ────────────────────────────────────────────────────────
    const ex      = (escapePoint.x / 100) * W;
    const ey      = (escapePoint.y / 100) * H;
    const beaconR = 8 + pulse * 6;

    // Glow
    const beaconGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, beaconR * 2.5);
    beaconGlow.addColorStop(0, `rgba(0,255,136,${0.3 + pulse * 0.2})`);
    beaconGlow.addColorStop(1, 'rgba(0,255,136,0)');
    ctx.fillStyle = beaconGlow;
    ctx.beginPath();
    ctx.arc(ex, ey, beaconR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();

    // Label
    ctx.fillStyle   = '#00ff88';
    ctx.font        = 'bold 9px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('EXIT', ex, ey - 12);

    // ── Enemies: hearing range + cone FOV + body ──────────────────────────────
    // Group-based colours for non-alerted watchers:
    //  group 0 (standard) = orange, group 1 (scout) = yellow, group 2 (guardian) = crimson
    const GROUP_CONE_BASE  = ['rgba(255,120,0,',  'rgba(255,210,40,', 'rgba(200,50,80,'];
    const GROUP_BODY_COLOR = ['#ff7700',           '#ffcc00',          '#cc2255'];
    const REACT_CONE_BASE  = 'rgba(255,180,0,';  // amber while checking a sound
    const REACT_BODY_COLOR = '#ffaa00';

    enemies.forEach(e => {
      const emx        = (e.x / 100) * W;
      const emy        = (e.y / 100) * H;
      const rangePx    = (e.fovRange / 100) * W;
      const halfAngle  = e.fovHalfAngle || (Math.PI / 3.6);
      const facing     = e.facingAngle  || 0;
      const gid        = (e.groupId != null) ? Math.min(e.groupId, 2) : 0;

      const isSoundReacting = !e.alerted && e.soundReacting;
      const coneBase = e.alerted ? 'rgba(255,50,50,' : (isSoundReacting ? REACT_CONE_BASE : GROUP_CONE_BASE[gid]);
      const bodyColor = e.alerted ? '#ff3333' : (isSoundReacting ? REACT_BODY_COLOR : GROUP_BODY_COLOR[gid]);

      // ── Hearing range (faint dashed circle) ───────────────────────────────
      if (e.hearingRange) {
        const hearPx = (e.hearingRange / 100) * W;
        ctx.beginPath();
        ctx.arc(emx, emy, hearPx, 0, Math.PI * 2);
        ctx.strokeStyle = e.alerted
          ? 'rgba(255,80,80,0.12)'
          : (isSoundReacting ? 'rgba(255,180,0,0.18)' : `${coneBase}0.10)`);
        ctx.lineWidth = 0.7;
        ctx.setLineDash([2, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Cone fill ──────────────────────────────────────────────────────────
      const fillAlpha = e.alerted ? 0.18 : 0.08;
      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.arc(emx, emy, rangePx, facing - halfAngle, facing + halfAngle);
      ctx.closePath();
      ctx.fillStyle = `${coneBase}${fillAlpha})`;
      ctx.fill();

      // ── Cone outline ───────────────────────────────────────────────────────
      const ringAlpha = e.alerted ? (0.55 + pulse * 0.3) : (isSoundReacting ? (0.45 + pulse * 0.2) : 0.40);
      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.arc(emx, emy, rangePx, facing - halfAngle, facing + halfAngle);
      ctx.closePath();
      ctx.strokeStyle = `${coneBase}${ringAlpha})`;
      ctx.lineWidth = e.alerted ? 1.5 : 1;
      ctx.stroke();

      // ── Direction arrow (short line in facing direction) ───────────────────
      const arrowLen = 10;
      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.lineTo(emx + Math.cos(facing) * arrowLen, emy + Math.sin(facing) * arrowLen);
      ctx.strokeStyle = e.alerted ? 'rgba(255,80,80,0.9)' : (isSoundReacting ? 'rgba(255,180,0,0.9)' : 'rgba(255,160,60,0.8)');
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // ── Enemy body ─────────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(emx, emy, 6, 0, Math.PI * 2);
      ctx.fillStyle = bodyColor;
      ctx.fill();

      // Alert / sound-reaction indicator
      if (e.alerted) {
        ctx.fillStyle   = '#ff3333';
        ctx.font        = '10px monospace';
        ctx.textAlign   = 'center';
        ctx.fillText('!', emx, emy - 10);
      } else if (isSoundReacting) {
        ctx.fillStyle   = '#ffcc44';
        ctx.font        = '10px monospace';
        ctx.textAlign   = 'center';
        ctx.fillText('?', emx, emy - 10);
      }
    });

    // ── Noise pulse around player ─────────────────────────────────────────
    if (noiseLevel > 25) {
      const px      = (player.x / 100) * W;
      const py      = (player.y / 100) * H;
      const pulseR  = (noiseLevel / 100) * 45;
      const alpha   = (noiseLevel - 25) / 75 * 0.4;
      ctx.beginPath();
      ctx.arc(px, py, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,170,0,${alpha})`;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // ── Player exposure radius (how detectable the player is) ─────────────
    const px = (player.x / 100) * W;
    const py = (player.y / 100) * H;

    if (playerDetectionRadius > 0) {
      const expR    = (playerDetectionRadius / 100) * W;
      const expAlpha = isDetected ? (0.45 + pulse * 0.25) : 0.28;
      const expColor = inStealthMode
        ? `rgba(0,207,255,${expAlpha})`
        : isDetected
          ? `rgba(255,68,68,${expAlpha})`
          : `rgba(255,200,80,${expAlpha * 0.8})`;

      ctx.beginPath();
      ctx.arc(px, py, expR, 0, Math.PI * 2);
      ctx.strokeStyle = expColor;
      ctx.lineWidth   = isDetected ? 2 : 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Player ────────────────────────────────────────────────────────────

    // Choose colour based on state
    let pColor, pLabel;
    if (inStealthMode) {
      pColor = [0, 207, 255];   // cyan — ghost mode
      pLabel = 'GHOST';
    } else if (isDetected) {
      pColor = [255, 68, 68];   // red — exposed
      pLabel = 'EXPOSED';
    } else if (shadowCoverage > 0.4) {
      pColor = [0, 255, 136];   // green — hidden in shadow
      pLabel = 'HIDDEN';
    } else {
      pColor = [255, 170, 0];   // orange — in the open
      pLabel = 'CAUTION';
    }
    const [pr, pg, pb] = pColor;

    // Glow
    const pglow = ctx.createRadialGradient(px, py, 0, px, py, 18);
    pglow.addColorStop(0, `rgba(${pr},${pg},${pb},0.35)`);
    pglow.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
    ctx.fillStyle = pglow;
    ctx.beginPath();
    ctx.arc(px, py, 18, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.fill();

    // State label
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.font      = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(pLabel, px, py - 12);

    // ── Stealth mode shimmer ring ──────────────────────────────────────────
    if (inStealthMode) {
      ctx.beginPath();
      ctx.arc(px, py, 14 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,207,255,${0.4 + pulse * 0.2})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }
  }

  return { canvas, draw };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/**
 * Show a simple modal overlay.
 * @param {string} title
 * @param {string} body   HTML string
 * @param {string} btnLabel
 * @param {Function} onClose
 */
export function showModal(title, body, btnLabel, onClose) {
  let overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id        = 'modal-overlay';
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-box';

  const h2 = document.createElement('h2');
  h2.textContent = title;

  const p = document.createElement('div');
  p.className = 'modal-body';
  p.innerHTML = body;

  const btn = buildButton(btnLabel, () => {
    overlay.remove();
    onClose && onClose();
  }, 'btn-primary');

  box.appendChild(h2);
  box.appendChild(p);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
