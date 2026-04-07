/**
 * deviceReader.js
 * Reads battery level, device orientation/motion, and local time.
 *
 * Same pattern as environmentReader:
 *  - start() / stop()
 *  - status    ('using-simulation' | 'permission-needed' | 'active' | 'denied' | 'unsupported')
 *  - value(s)
 *  - rawValue  (pre-normalised hardware reading where applicable)
 */

import { clamp } from '../utils.js';

// ─── Battery ─────────────────────────────────────────────────────────────────

export const batteryReader = {
  status:   'using-simulation', // 'using-simulation' | 'active'
  value:    80,   // 0–100 battery %
  rawValue: 0,    // raw level fraction from the Battery API (0.0–1.0)
  _battery: null,

  async start() {
    if (!navigator.getBattery) {
      // Battery Status API absent (Firefox, Safari, iOS) — use slider
      this.status = 'using-simulation';
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
      // Any error — silently fall back to simulation
      this.status = 'using-simulation';
    }
  },

  stop() {
    this._battery = null;
    this.rawValue = 0;
    this.status   = 'using-simulation';
  },
};

// ─── Device Orientation (tilt) ────────────────────────────────────────────────

// Degrees of tilt below which we treat the device as perfectly flat.
// This suppresses the micro-jitter that all MEMS gyros produce at rest.
const TILT_DEADZONE_DEG = 2;

export const motionReader = {
  status:   'using-simulation', // 'using-simulation' | 'permission-needed' | 'active' | 'denied' | 'unsupported'
  tiltX:    0,    // -1 to 1  (left–right,  normalised from gamma)
  tiltY:    0,    // -1 to 1  (front–back,  normalised from beta)
  rawGamma: 0,    // raw gamma in degrees (-90 to 90)
  rawBeta:  0,    // raw beta  in degrees (-180 to 180)
  _handler: null,

  /**
   * Detect motion sensor support and set initial status.
   * On iOS 13+, DeviceOrientationEvent.requestPermission exists and requires a user gesture.
   * In that case we just mark status as 'permission-needed' without requesting.
   * On other platforms, start the listener directly if the API is available.
   */
  async start() {
    if (!window.DeviceOrientationEvent) {
      this.status = 'using-simulation';
      return;
    }

    // iOS 13+ requires explicit permission from a user gesture
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Don't request now — mark as needing permission, wait for Enable Sensors button
      this.status = 'permission-needed';
      return;
    }

    // Non-iOS: start the listener directly (no permission prompt needed)
    this._attachListener();
    this.status = 'active';
  },

  /**
   * Request iOS motion permission and start the listener.
   * MUST be called from a user gesture (e.g. button click).
   * On non-iOS this is a no-op if already active; otherwise calls start().
   */
  async requestPermissionAndStart() {
    if (!window.DeviceOrientationEvent) {
      this.status = 'using-simulation';
      return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS permission flow
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result === 'granted') {
          this._attachListener();
          this.status = 'active';
        } else {
          console.warn('[motion] Permission not granted:', result);
          this.status = 'denied';
        }
      } catch (err) {
        console.warn('[motion] Permission error:', err);
        this.status = 'denied';
      }
    } else if (this.status !== 'active') {
      // Non-iOS fallback: start directly if not already running
      this._attachListener();
      this.status = 'active';
    }
  },

  /** Attach the deviceorientation event handler. */
  _attachListener() {
    if (this._handler) return; // already attached
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
    this.status   = 'using-simulation';
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
