/**
 * router.js
 * Minimal SPA router.
 *
 * Screens: 'home' | 'sensor' | 'explore' | 'survive'
 *
 * Calling navigate(name) tears down the current screen (cleanup) then
 * builds the new one.
 *
 * navigate() is exposed via nav.js to break the circular dependency with
 * screens.js (screens need to navigate, router needs to build screens).
 */

import { ui } from './state.js';
import { setNavigate } from './nav.js';
import {
  buildHomeScreen,
  buildSensorScreen,   teardownSensorScreen,
  buildExploreScreen,
  buildSurviveScreen,
} from './ui/screens.js';

/** Map of screen teardown callbacks */
const teardowns = {
  sensor: teardownSensorScreen,
};

/**
 * Navigate to a named screen.
 * @param {'home'|'sensor'|'explore'|'survive'} name
 */
function navigate(name) {
  // Tear down current screen if needed
  const teardown = teardowns[ui.currentScreen];
  if (teardown) teardown();

  ui.currentScreen = name;

  switch (name) {
    case 'home':    buildHomeScreen();    break;
    case 'sensor':  buildSensorScreen();  break;
    case 'explore': buildExploreScreen(); break;
    case 'survive': buildSurviveScreen(); break;
    default:
      console.warn('[router] Unknown screen:', name);
      buildHomeScreen();
  }
}

// Register with nav.js so screens can call navigate() without a circular dep
setNavigate(navigate);

// Also export directly for app.js
export { navigate };
