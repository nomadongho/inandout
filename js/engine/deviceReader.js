/**
 * deviceReader.js
 * Reads battery level, device orientation/motion, and local time.
 *
 * Same pattern as environmentReader:
 *  - start() / stop()
 *  - status    ('unsupported' | 'permission-required' | 'active' | 'error')
 *  - value(s)
 *  - rawValue  (pre-normalised hardware reading where applicable)
 */

import { clamp } from '../utils.js';

// ─── Battery ─────────────────────────────────────────────────────────────────

export const batteryReader = {
  status:   'unsupported',
  value:    80,   // 0–100 battery %
  rawValue: 0,    // raw level fraction from the Battery API (0.0–1.0)
  _battery: null,

  async start() {
    if (!navigator.getBattery) {
      this.status = 'unsupported';
      return;
    }
    try {
      const battery   = await navigator.getBattery();
      this._battery   = battery;
      this.rawValue   = battery.level;
      this.value      = clamp(Math.round(battery.level * 100), 0, 100);
      this.status     = 'active';

      const update = () => {
        this.rawValue = battery.level;
        this.value    = clamp(Math.round(battery.level * 100), 0, 100);
      };
      battery.addEventListener('levelchange', update);
    } catch (err) {
      console.warn('[battery] Error:', err);
      this.status = 'error';
    }
  },

  stop() {
    this._battery = null;
    this.rawValue = 0;
    this.status   = 'unsupported';
  },
};

// ─── Device Orientation (tilt) ────────────────────────────────────────────────

// Degrees of tilt below which we treat the device as perfectly flat.
// This suppresses the micro-jitter that all MEMS gyros produce at rest.
const TILT_DEADZONE_DEG = 2;

export const motionReader = {
  status:   'unsupported',
  tiltX:    0,    // -1 to 1  (left–right,  normalised from gamma)
  tiltY:    0,    // -1 to 1  (front–back,  normalised from beta)
  rawGamma: 0,    // raw gamma in degrees (-90 to 90)
  rawBeta:  0,    // raw beta  in degrees (-180 to 180)
  _handler: null,

  async start() {
    if (!window.DeviceOrientationEvent) {
      this.status = 'unsupported';
      return;
    }

    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      this.status = 'permission-required';
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          this.status = 'error';
          return;
        }
      } catch (err) {
        console.warn('[motion] Permission error:', err);
        this.status = 'error';
        return;
      }
    }

    this._handler = (event) => {
      // gamma = left/right tilt (-90 to 90 degrees)
      // beta  = front/back tilt (-180 to 180 degrees)
      const gamma = event.gamma ?? 0;
      const beta  = event.beta  ?? 0;

      // Store raw degrees for diagnostic / debug access
      this.rawGamma = gamma;
      this.rawBeta  = beta;

      // Apply deadzone: treat small tilts as flat to suppress resting noise
      const effectiveGamma = Math.abs(gamma) < TILT_DEADZONE_DEG ? 0 : gamma;
      const effectiveBeta  = Math.abs(beta)  < TILT_DEADZONE_DEG ? 0 : beta;

      this.tiltX = clamp(effectiveGamma / 90, -1, 1);
      this.tiltY = clamp(effectiveBeta  / 90, -1, 1);
    };

    window.addEventListener('deviceorientation', this._handler);
    this.status = 'active';
  },

  stop() {
    if (this._handler) {
      window.removeEventListener('deviceorientation', this._handler);
      this._handler = null;
    }
    this.tiltX    = 0;
    this.tiltY    = 0;
    this.rawGamma = 0;
    this.rawBeta  = 0;
    this.status   = 'unsupported';
  },
};

// ─── Time of Day ─────────────────────────────────────────────────────────────

/** Always available — just read the system clock. */
export const timeReader = {
  status: 'active',
  /** Current hour 0–23 */
  get hour() {
    return new Date().getHours();
  },
};

// ─── Keyboard tilt simulation (desktop fallback) ─────────────────────────────

/**
 * When motion is unavailable, arrow keys nudge the tilt values.
 * Each keypress moves tilt by STEP (0.1 = 10% of full range).
 * Call start() once; call stop() to clean up.
 */
export const keyboardTilt = {
  _handler: null,

  start() {
    if (this._handler) return; // already running
    const STEP = 0.1;
    this._handler = (e) => {
      // Arrow keys directly write to motionReader so the engine tick picks them up
      switch (e.key) {
        case 'ArrowLeft':  motionReader.tiltX = clamp(motionReader.tiltX - STEP, -1, 1); break;
        case 'ArrowRight': motionReader.tiltX = clamp(motionReader.tiltX + STEP, -1, 1); break;
        case 'ArrowUp':    motionReader.tiltY = clamp(motionReader.tiltY - STEP, -1, 1); break;
        case 'ArrowDown':  motionReader.tiltY = clamp(motionReader.tiltY + STEP, -1, 1); break;
      }
    };
    window.addEventListener('keydown', this._handler);
  },

  stop() {
    if (this._handler) {
      window.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
  },
};
