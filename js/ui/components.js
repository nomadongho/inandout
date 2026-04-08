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
 * Renders stage walls, shadow/light zones, sound rings, watcher cones
 * (with 7-state colour coding), player exposure radius, and player.
 *
 * @returns {{ canvas: HTMLCanvasElement, draw: Function }}
 */
export function buildGameCanvas() {
  const PULSE_PERIOD_MS = 2400;

  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.width  = 420;
  canvas.height = 420;

  /**
   * Redraw the game canvas.
   * @param {{
   *   player:                {x:number, y:number},
   *   enemies:               Array,
   *   escapePoint:           {x:number, y:number},
   *   inStealthMode:         boolean,
   *   isDetected:            boolean,
   *   shadowCoverage:        number,
   *   noiseLevel:            number,
   *   ambientLight:          number,
   *   playerDetectionRadius: number,
   *   stage:                 object|null,
   *   soundEvents:           Array,
   *   timestamp:             number,
   * }} state
   */
  function draw(state) {
    const {
      player, enemies, escapePoint,
      inStealthMode, isDetected, shadowCoverage, noiseLevel,
      playerDetectionRadius = 0,
      stage        = null,
      soundEvents  = [],
      timestamp    = 0,
    } = state;

    const pulse = (Math.sin(timestamp * 2 * Math.PI / PULSE_PERIOD_MS) + 1) / 2;

    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;

    // helper: convert 0–100 grid → canvas px
    const gx = v => (v / 100) * W;
    const gy = v => (v / 100) * H;
    const gw = v => (v / 100) * W;
    const gh = v => (v / 100) * H;

    // ── Background / floor ─────────────────────────────────────────────────
    const floorColor = stage ? stage.floorColor : '#080810';
    ctx.fillStyle = floorColor;
    ctx.fillRect(0, 0, W, H);

    // ── Stage shadow zones (safe hiding spots) ────────────────────────────
    if (stage && stage.shadowZones) {
      const shadowColor = stage.shadowZoneColor || 'rgba(0,10,30,0.55)';
      stage.shadowZones.forEach(z => {
        ctx.fillStyle = shadowColor;
        ctx.fillRect(gx(z.x), gy(z.y), gw(z.w), gh(z.h));
      });
    }

    // ── Stage light zones (exposed, dangerous areas) ──────────────────────
    if (stage && stage.lightZones) {
      const lightColor = stage.lightZoneColor || 'rgba(255,240,180,0.12)';
      stage.lightZones.forEach(z => {
        ctx.fillStyle = lightColor;
        ctx.fillRect(gx(z.x), gy(z.y), gw(z.w), gh(z.h));
      });
    }

    // ── Ambient shadow from sensor (corners darken) ───────────────────────
    if (shadowCoverage > 0.1) {
      const corners = [
        { x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H },
      ];
      corners.forEach(c => {
        const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, W * 0.5);
        grad.addColorStop(0, `rgba(0,0,0,${shadowCoverage * 0.65})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      });
    }

    // ── Grid ──────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#1a2a1a';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath(); ctx.moveTo(i * W / 10, 0); ctx.lineTo(i * W / 10, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * H / 10); ctx.lineTo(W, i * H / 10); ctx.stroke();
    }

    // ── Stage walls ───────────────────────────────────────────────────────
    if (stage && stage.walls) {
      const wallColor = stage.wallColor || '#253545';
      stage.walls.forEach(w => {
        ctx.fillStyle = wallColor;
        ctx.fillRect(gx(w.x), gy(w.y), gw(w.w), gh(w.h));
        // Subtle top/left highlight to give walls depth
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(gx(w.x), gy(w.y), gw(w.w), 1);
        ctx.fillRect(gx(w.x), gy(w.y), 1, gh(w.h));
      });
    }

    // ── Sound propagation rings ───────────────────────────────────────────
    soundEvents.forEach(ev => {
      if (!ev || ev.intensity < 2) return;
      const ageFrac = ev.age / (ev.maxAge || 28);
      const alpha   = (1 - ageFrac) * 0.35 * Math.min(1, ev.intensity / 40);
      const radius  = gw(Math.min(50, ev.intensity * 0.55) * (0.3 + ageFrac * 0.7));
      ctx.beginPath();
      ctx.arc(gx(ev.x), gy(ev.y), radius, 0, Math.PI * 2);
      ctx.strokeStyle = ev.type === 'stumble'
        ? `rgba(255,80,0,${alpha})`
        : `rgba(255,160,40,${alpha})`;
      ctx.lineWidth = ev.type === 'stumble' ? 2 : 1;
      ctx.stroke();
    });

    // ── Escape beacon ─────────────────────────────────────────────────────
    const ex = gx(escapePoint.x);
    const ey = gy(escapePoint.y);
    const beaconR = 8 + pulse * 6;

    const beaconGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, beaconR * 2.5);
    beaconGlow.addColorStop(0, `rgba(0,255,136,${0.3 + pulse * 0.2})`);
    beaconGlow.addColorStop(1, 'rgba(0,255,136,0)');
    ctx.fillStyle = beaconGlow;
    ctx.beginPath(); ctx.arc(ex, ey, beaconR * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88'; ctx.fill();
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EXIT', ex, ey - 12);

    // ── Watchers: hearing circle + FOV cone + body + state icon ──────────

    // Colour tables indexed by watcher state
    // [coneBase, bodyColor, stateIcon, stateIconColor]
    const STATE_STYLE = {
      IDLE:          { cone: 'rgba(255,120,0,',   body: '#ff7700',  icon: '',   ic: '#ff7700' },
      SUSPICIOUS:    { cone: 'rgba(255,200,60,',  body: '#ffcc00',  icon: '?',  ic: '#ffcc00' },
      LISTENING:     { cone: 'rgba(0,200,220,',   body: '#00cfff',  icon: '⊙',  ic: '#00cfff' },
      INVESTIGATING: { cone: 'rgba(255,140,0,',   body: '#ff8c00',  icon: '?!', ic: '#ff8c00' },
      ALERTED:       { cone: 'rgba(255,60,60,',   body: '#ff3c3c',  icon: '!!', ic: '#ff3c3c' },
      CHASING:       { cone: 'rgba(255,30,30,',   body: '#ff1e1e',  icon: '⚡', ic: '#ff4444' },
      RETURNING:     { cone: 'rgba(120,120,160,', body: '#8888aa',  icon: '↩',  ic: '#aaaacc' },
    };
    // Override cone base by group for IDLE state
    const GROUP_CONE_IDLE = ['rgba(255,120,0,', 'rgba(255,210,40,', 'rgba(200,50,80,'];
    const GROUP_BODY_IDLE = ['#ff7700', '#ffcc00', '#cc2255'];

    enemies.forEach(e => {
      const emx       = gx(e.x);
      const emy       = gy(e.y);
      const rangePx   = gw(e.fovRange || 10);
      const halfAngle = e.fovHalfAngle || (Math.PI / 3.6);
      const facing    = e.facingAngle || 0;
      const gid       = Math.min(e.groupId ?? 0, 2);
      const ws        = e.state || (e.alerted ? 'ALERTED' : (e.soundReacting ? 'SUSPICIOUS' : 'IDLE'));
      const style     = STATE_STYLE[ws] || STATE_STYLE.IDLE;

      // Apply group colour for IDLE watchers
      let coneBase = style.cone;
      let bodyColor = style.body;
      if (ws === 'IDLE') {
        coneBase  = GROUP_CONE_IDLE[gid];
        bodyColor = GROUP_BODY_IDLE[gid];
      }

      // Cone fill/stroke alpha varies by threat level
      const isHostile  = (ws === 'ALERTED' || ws === 'CHASING');
      const isSearching = (ws === 'INVESTIGATING');
      const fillAlpha   = isHostile ? 0.22 : isSearching ? 0.14 : 0.08;
      const strokeAlpha = isHostile ? (0.6 + pulse * 0.3)
                        : isSearching ? (0.50 + pulse * 0.2)
                        : ws === 'SUSPICIOUS' || ws === 'LISTENING' ? (0.45 + pulse * 0.15)
                        : 0.38;

      // ── Hearing range circle ─────────────────────────────────────────
      if (e.hearingRange) {
        const hearPx = gw(e.hearingRange);
        const pdx    = player.x - e.x;
        const pdy    = player.y - e.y;
        const inEar  = Math.sqrt(pdx * pdx + pdy * pdy) <= e.hearingRange;

        let hearFill = 0.04, hearStroke = 0.32, hearLW = 1;
        if (isHostile)  { hearFill = 0.06; hearStroke = 0.28; }
        else if (inEar) { hearFill = 0.10 + pulse * 0.06; hearStroke = 0.65 + pulse * 0.2; hearLW = 1.8; }

        const hearColor = isHostile ? 'rgba(255,80,80,' : (isSearching ? 'rgba(255,200,80,' : 'rgba(60,180,255,');
        ctx.beginPath(); ctx.arc(emx, emy, hearPx, 0, Math.PI * 2);
        ctx.fillStyle = `${hearColor}${hearFill})`; ctx.fill();
        ctx.beginPath(); ctx.arc(emx, emy, hearPx, 0, Math.PI * 2);
        ctx.strokeStyle = `${hearColor}${hearStroke})`;
        ctx.lineWidth = hearLW; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `${hearColor}${hearStroke * 0.9})`;
        ctx.font = '9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('👂', emx, emy - hearPx - 3);
      }

      // ── FOV cone ──────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.arc(emx, emy, rangePx, facing - halfAngle, facing + halfAngle);
      ctx.closePath();
      ctx.fillStyle = `${coneBase}${fillAlpha})`; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.arc(emx, emy, rangePx, facing - halfAngle, facing + halfAngle);
      ctx.closePath();
      ctx.strokeStyle = `${coneBase}${strokeAlpha})`;
      ctx.lineWidth   = isHostile ? 2 : 1; ctx.stroke();

      // ── Direction arrow ───────────────────────────────────────────────
      ctx.beginPath();
      ctx.moveTo(emx, emy);
      ctx.lineTo(emx + Math.cos(facing) * 11, emy + Math.sin(facing) * 11);
      ctx.strokeStyle = `${coneBase}0.9)`;
      ctx.lineWidth   = 1.5; ctx.stroke();

      // ── Watcher body ──────────────────────────────────────────────────
      // Pulse size when alerted / chasing
      const bodyR = isHostile ? (6 + pulse * 1.5) : 6;
      ctx.beginPath(); ctx.arc(emx, emy, bodyR, 0, Math.PI * 2);
      ctx.fillStyle = bodyColor; ctx.fill();

      // ── State icon above watcher ──────────────────────────────────────
      if (style.icon) {
        ctx.fillStyle = style.ic;
        ctx.font      = isHostile ? 'bold 11px monospace' : 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(style.icon, emx, emy - 11);
      }

      // ── LISTENING: oscillating scan arcs ─────────────────────────────
      if (ws === 'LISTENING') {
        const scanA = facing + Math.sin(timestamp / 600) * 0.6;
        ctx.beginPath();
        ctx.moveTo(emx, emy);
        ctx.arc(emx, emy, rangePx * 0.7, scanA - 0.25, scanA + 0.25);
        ctx.closePath();
        ctx.fillStyle = `rgba(0,200,220,${0.18 + pulse * 0.08})`; ctx.fill();
      }

      // ── INVESTIGATING: arrow toward target ───────────────────────────
      if (ws === 'INVESTIGATING' && e.investigateTarget) {
        const itx = gx(e.investigateTarget.x);
        const ity = gy(e.investigateTarget.y);
        ctx.beginPath(); ctx.moveTo(emx, emy); ctx.lineTo(itx, ity);
        ctx.strokeStyle = 'rgba(255,160,0,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(itx, ity, 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,160,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    // ── Noise pulse around player ─────────────────────────────────────────
    const px = gx(player.x);
    const py = gy(player.y);

    if (noiseLevel > 25) {
      const pulseR = gw((noiseLevel / 100) * 45);
      const alpha  = (noiseLevel - 25) / 75 * 0.4;
      ctx.beginPath(); ctx.arc(px, py, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,170,0,${alpha})`; ctx.lineWidth = 2; ctx.stroke();
    }

    // ── Player exposure radius ────────────────────────────────────────────
    if (playerDetectionRadius > 0) {
      const expR     = gw(playerDetectionRadius);
      const expAlpha = isDetected ? (0.45 + pulse * 0.25) : 0.28;
      const expColor = inStealthMode
        ? `rgba(0,207,255,${expAlpha})`
        : isDetected
          ? `rgba(255,68,68,${expAlpha})`
          : `rgba(255,200,80,${expAlpha * 0.8})`;
      ctx.beginPath(); ctx.arc(px, py, expR, 0, Math.PI * 2);
      ctx.strokeStyle = expColor;
      ctx.lineWidth   = isDetected ? 2 : 1;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // ── Player body ───────────────────────────────────────────────────────
    let pColor, pLabel;
    if (inStealthMode)          { pColor = [0, 207, 255]; pLabel = 'GHOST'; }
    else if (isDetected)        { pColor = [255, 68, 68];  pLabel = 'EXPOSED'; }
    else if (shadowCoverage > 0.4) { pColor = [0, 255, 136]; pLabel = 'HIDDEN'; }
    else                        { pColor = [255, 170, 0];  pLabel = 'CAUTION'; }
    const [pr, pg, pb] = pColor;

    const pglow = ctx.createRadialGradient(px, py, 0, px, py, 18);
    pglow.addColorStop(0, `rgba(${pr},${pg},${pb},0.35)`);
    pglow.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
    ctx.fillStyle = pglow;
    ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${pr},${pg},${pb})`; ctx.fill();

    ctx.fillStyle = `rgb(${pr},${pg},${pb})`;
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(pLabel, px, py - 12);

    if (inStealthMode) {
      ctx.beginPath(); ctx.arc(px, py, 14 + pulse * 6, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,207,255,${0.4 + pulse * 0.2})`; ctx.lineWidth = 1.5; ctx.stroke();
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
