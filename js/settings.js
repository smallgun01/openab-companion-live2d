/**
 * settings.js — localStorage persistence for endpoint, token, background color.
 *
 *   getSettings() / saveSettings(obj) → localStorage
 *
 * MVP: no IndexedDB model storage (Live2D models are multi-file directories,
 * not single .vrm files). Model path is hard-coded in live2d-scene.js.
 */

/** Default settings */
const DEFAULTS = {
  endpoint: 'http://localhost:8080/v1/chat/completions',
  token: '',
  bgColor: '#1a1a2e',
  bgImage: '',
};

/* ── Settings (localStorage) ──────────────────────────── */

/** Get merged settings (defaults + saved). */
export function getSettings() {
  const raw = localStorage.getItem('openab-settings');
  const saved = raw ? safeParse(raw) : {};
  return { ...DEFAULTS, ...saved };
}

/** Save a partial or full settings object. */
export function saveSettings(partial) {
  const current = getSettings();
  const merged = { ...current, ...partial };
  removeUndefined(merged);
  localStorage.setItem('openab-settings', JSON.stringify(merged));
}

/* ── Helpers ──────────────────────────────────────────── */

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

function removeUndefined(obj) {
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined) delete obj[k];
  });
}
