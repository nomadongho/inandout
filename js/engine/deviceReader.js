/**
 * deviceReader.js
 * Reads battery level, device orientation/motion, and local time.
 *
 * Same pattern as environmentReader:
 *  - start() / stop()
 *  - status  ('unsupported' | 'permission-required' | 'active' | 'error')
 *  - value(s)
 */

import { clamp } from '../utils.js';

// ─── Battery ─────────────────────────────────────────────────────────────────

export const batteryReader = {
  status: 'unsupported',
  value:  80,   // 0–100 battery %
  _battery: null,

  async start() {
    if (!navigator.getBattery) {
      this.status = 'unsupported';
      return;
    }
    try {
      const battery   = await navigator.getBattery();
      this._battery   = battery;
      this.value      = clamp(Math.round(battery.level * 100), 0, 100);
      this.status     = 'active';

      const update = () => {
        this.value = clamp(Math.round(battery.level * 100), 0, 100);
      };
      battery.addEventListener('levelchange', update);
    } catch (err) {
      console.warn('[battery] Error:', err);
      this.status = 'error';
    }
  },

  stop() {
    this._battery = null;
    this.status   = 'unsupported';
  },
};

// ─── Device Orientation (tilt) ────────────────────────────────────────────────

export const motionReader = {
  status: 'unsupported',
  tiltX:  0,   // -1 to 1
  tiltY:  0,   // -1 to 1
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
      // gamma = left/right tilt (-90 to 90)
      // beta  = front/back tilt (-180 to 180)
      const gamma = event.gamma ?? 0;
      const beta  = event.beta  ?? 0;
      this.tiltX  = clamp(gamma / 90, -1, 1);
      this.tiltY  = clamp(beta  / 90, -1, 1);
    };

    window.addEventListener('deviceorientation', this._handler);
    this.status = 'active';
  },

  stop() {
    if (this._handler) {
      window.removeEventListener('deviceorientation', this._handler);
      this._handler = null;
    }
    this.tiltX  = 0;
    this.tiltY  = 0;
    this.status = 'unsupported';
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
 * Call startKeyboardTilt() once; it cleans up on stopKeyboardTilt().
 */
export const keyboardTilt = {
  _handler: null,

  start() {
    if (this._handler) return; // already running
    this._handler = (e) => {
      const step = 0.1;
      // NOTE: these directly mutate motionReader values as a simulation
      switch (e.key) {
        case 'ArrowLeft':  motionReader.tiltX = clamp(motionReader.tiltX - step, -1, 1); break;
        case 'ArrowRight': motionReader.tiltX = clamp(motionReader.tiltX + step, -1, 1); break;
        case 'ArrowUp':    motionReader.tiltY = clamp(motionReader.tiltY - step, -1, 1); break;
        case 'ArrowDown':  motionReader.tiltY = clamp(motionReader.tiltY + step, -1, 1); break;
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
