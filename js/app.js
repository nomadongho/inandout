/**
 * app.js
 * Application entry point.
 *
 * 1. Import router (which registers navigate with nav.js as a side-effect)
 * 2. Start the Hybrid Reality Engine (sensors + tick loop)
 * 3. Load any persisted survive state
 * 4. Navigate to the home screen
 */

import './router.js';                         // registers navigate() with nav.js
import { navigate }    from './nav.js';
import engine from './engine/hybridRealityEngine.js';
import { loadSurvive } from './modes/surviveMode.js';
import { setMotionReaderRef } from './ui/screens.js';
import { motionReader } from './engine/deviceReader.js';

async function init() {
  // Give screens.js access to the live motionReader object (for tilt simulation)
  setMotionReaderRef(motionReader);

  // Start the engine — requests sensor permissions lazily
  await engine.start();

  // Restore any saved Survive progress
  loadSurvive();

  // Show the home screen
  navigate('home');
}

// Kick off once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
