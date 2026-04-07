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
 * @returns {HTMLElement}
 */
export function buildMeter(label, value, colorClass = 'meter-default') {
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

  header.appendChild(lbl);
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
    'active':             { text: 'ACTIVE',    type: 'ok'    },
    'permission-required':{ text: 'PERM REQ',  type: 'warn'  },
    'unsupported':        { text: 'NO SENSOR', type: 'off'   },
    'error':              { text: 'ERROR',     type: 'error' },
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

// ── Mini radar canvas ─────────────────────────────────────────────────────────

/**
 * Build a small canvas radar showing enemy positions.
 * @returns {{ canvas: HTMLCanvasElement, draw: Function }}
 */
export function buildRadar() {
  const canvas = document.createElement('canvas');
  canvas.className = 'radar';
  canvas.width  = 200;
  canvas.height = 200;

  /**
   * Redraw the radar.
   * @param {Array<{x:number,y:number}>} enemies  x,y in 0–100
   * @param {number} threatLevel  0–100 (affects sweep colour)
   */
  function draw(enemies, threatLevel) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const cx  = W / 2;
    const cy  = H / 2;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, W, H);

    // Grid circles
    ctx.strokeStyle = '#1e3a1e';
    ctx.lineWidth   = 1;
    [0.3, 0.6, 0.9].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (W / 2), 0, Math.PI * 2);
      ctx.stroke();
    });

    // Cross hairs
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.strokeStyle = '#1e3a1e';
    ctx.stroke();

    // Threat ring
    const alpha = threatLevel / 100 * 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Enemies
    enemies.forEach(e => {
      const ex = (e.x / 100) * W;
      const ey = (e.y / 100) * H;
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4444';
      ctx.fill();
    });

    // Player dot
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();
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
