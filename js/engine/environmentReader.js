/**
 * environmentReader.js
 * Reads microphone (noise) and ambient light sensor.
 *
 * Each reader exposes:
 *  - start()  → request permission / set up hardware
 *  - stop()   → tear down hardware
 *  - status   → 'unsupported' | 'permission-required' | 'active' | 'error'
 *  - value    → current normalised reading (0–100)
 *
 * If a sensor is unavailable the caller should show a fallback slider.
 */

import { clamp } from '../utils.js';

// ─── Microphone / Noise ──────────────────────────────────────────────────────

export const micReader = {
  status: 'unsupported', // 'unsupported' | 'permission-required' | 'active' | 'error'
  value:  0,             // 0–100 noise level
  _stream:    null,
  _analyser:  null,
  _dataArray: null,
  _rafId:     null,

  /** Request mic permission and start sampling. */
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.status = 'unsupported';
      return;
    }
    this.status = 'permission-required';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._stream = stream;

      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      this._analyser  = analyser;
      this._dataArray = new Uint8Array(analyser.frequencyBinCount);
      this.status     = 'active';
      this._poll();
    } catch (err) {
      console.warn('[mic] Permission denied or error:', err);
      this.status = 'error';
    }
  },

  /** Stop the microphone stream. */
  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    this._analyser  = null;
    this._dataArray = null;
    this.status     = 'unsupported';
    this.value      = 0;
  },

  _poll() {
    if (!this._analyser) return;
    this._analyser.getByteFrequencyData(this._dataArray);
    // Average all frequency bins → RMS-ish estimate
    const avg = this._dataArray.reduce((s, v) => s + v, 0) / this._dataArray.length;
    // Byte values are 0–255; map to 0–100
    this.value = clamp(Math.round((avg / 255) * 100), 0, 100);
    this._rafId = requestAnimationFrame(() => this._poll());
  },
};

// ─── Ambient Light ───────────────────────────────────────────────────────────

export const lightReader = {
  status: 'unsupported',
  value:  50,          // 0–100 light level
  _sensor: null,

  /** Attempt to start AmbientLightSensor. */
  async start() {
    // AmbientLightSensor is a Generic Sensor API — check for it
    if (typeof AmbientLightSensor === 'undefined') {
      this.status = 'unsupported';
      return;
    }
    try {
      // Requires permissions on some platforms
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: 'ambient-light-sensor' });
        if (result.state === 'denied') {
          this.status = 'error';
          return;
        }
      }
      this.status = 'permission-required';
      // eslint-disable-next-line no-undef
      const sensor = new AmbientLightSensor({ frequency: 2 });
      sensor.addEventListener('reading', () => {
        // illuminance is in lux; typical indoor ~100–500, sunny ~10 000+
        // Map 0 lux → 0, 1000 lux → 100 (log-ish)
        const lux = sensor.illuminance;
        const mapped = clamp(Math.round(Math.log10(lux + 1) / Math.log10(1001) * 100), 0, 100);
        this.value = mapped;
      });
      sensor.addEventListener('error', (e) => {
        console.warn('[light] Sensor error:', e.error);
        this.status = 'error';
      });
      sensor.start();
      this._sensor = sensor;
      this.status  = 'active';
    } catch (err) {
      console.warn('[light] Could not start AmbientLightSensor:', err);
      this.status = 'unsupported';
    }
  },

  stop() {
    if (this._sensor) {
      try { this._sensor.stop(); } catch (_) {}
      this._sensor = null;
    }
    this.status = 'unsupported';
  },
};
