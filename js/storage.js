/**
 * storage.js
 * Thin wrapper around localStorage for typed get/set.
 */

const PREFIX = 'inandout_';

/**
 * Persist any JSON-serialisable value.
 * @param {string} key
 * @param {*} value
 */
export function saveData(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('[storage] Could not save:', key, e);
  }
}

/**
 * Load a previously persisted value.
 * Returns `defaultValue` if nothing is stored or parsing fails.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
export function loadData(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] Could not load:', key, e);
    return defaultValue;
  }
}

/**
 * Remove a stored key.
 * @param {string} key
 */
export function removeData(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) {
    console.warn('[storage] Could not remove:', key, e);
  }
}

/**
 * Clear all app keys from localStorage.
 */
export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('[storage] Could not clear:', e);
  }
}
