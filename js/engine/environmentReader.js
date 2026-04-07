/**
 * environmentReader.js
 * Reads microphone (noise) and ambient light sensor.
 *
 * Each reader exposes:
 *  - start()    → request permission / set up hardware
 *  - stop()     → tear down hardware
 *  - status     → 'unsupported' | 'permission-required' | 'active' | 'error'
 *  - value      → smoothed normalised reading (0–100)
 *  - rawValue   → latest hardware reading before normalisation
 *
 * If a sensor is unavailable the caller should show a fallback slider.
 */

import { clamp } from '../utils.js';

// ─── Microphone / Noise ──────────────────────────────────────────────────────

// Number of animation-frame samples averaged to smooth out mic noise.
// Higher = smoother but more lag; 8 frames ≈ 133 ms at 60 fps.
const MIC_RING_SIZE = 8;

export const micReader = {
  status:   'unsupported', // 'unsupported' | 'permission-required' | 'active' | 'error'
  value:    0,             // 0–100 smoothed noise level (ring-buffer average)
  rawValue: 0,             // 0–255 instantaneous bin average (before normalisation)
  _stream:    null,
  _analyser:  null,
  _dataArray: null,
  _rafId:     null,
  _ring:      [],          // circular buffer of recent raw readings

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
      this._ring      = [];
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
    this._ring      = [];
    this.status     = 'unsupported';
    this.value      = 0;
    this.rawValue   = 0;
  },

  _poll() {
    if (!this._analyser) return;

    // Read current frequency data into the byte array (0–255 per bin)
    this._analyser.getByteFrequencyData(this._dataArray);

    // Average all frequency bins for an RMS-style energy estimate
    const instantAvg = this._dataArray.reduce((s, v) => s + v, 0) / this._dataArray.length;
    this.rawValue = instantAvg;

    // Push into ring buffer and discard oldest sample when full
    this._ring.push(instantAvg);
    if (this._ring.length > MIC_RING_SIZE) this._ring.shift();

    // Average the ring buffer to reduce frame-to-frame noise
    const smoothedAvg = this._ring.reduce((s, v) => s + v, 0) / this._ring.length;

    // Normalise from 0–255 to 0–100
    this.value = clamp(Math.round((smoothedAvg / 255) * 100), 0, 100);

    this._rafId = requestAnimationFrame(() => this._poll());
  },
};

// ─── Ambient Light ───────────────────────────────────────────────────────────

// Exponential smoothing factor for light readings (0 = frozen, 1 = instant).
// Low value prevents sudden spikes from a transient reflection or glare.
const LIGHT_SMOOTH = 0.15;

export const lightReader = {
  status:   'unsupported',
  value:    50,   // 0–100 smoothed light level
  rawValue: 0,    // raw lux reading from the hardware sensor
  _sensor:  null,

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
        const lux = sensor.illuminance;
        this.rawValue = lux;

        // Map lux to 0–100 using a log scale:
        //   0 lux → 0,  ~100 lux (typical indoor) → ~67,  1000 lux → 100
        const target = clamp(Math.round(Math.log10(lux + 1) / Math.log10(1001) * 100), 0, 100);

        // Exponential smoothing to dampen transient spikes (e.g. a camera flash)
        const smoothed = this.value + (target - this.value) * LIGHT_SMOOTH;
        this.value = Math.round(smoothed);
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
