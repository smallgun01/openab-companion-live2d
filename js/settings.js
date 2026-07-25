/**
 * settings.js — localStorage persistence for non-secret display settings.
 *
 *   getSettings() / saveSettings(obj) → localStorage
 *
 * Bearer tokens intentionally never enter localStorage. They remain in memory
 * for the current app session and must be re-entered after a restart.
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
  return { ...DEFAULTS, ...saved, token: '' };
}

/** Save a partial or full settings object. */
export function saveSettings(partial) {
  if (partial.endpoint && !isAllowedEndpoint(partial.endpoint)) {
    throw new Error('Endpoint must use HTTPS, or HTTP only for localhost.');
  }
  const current = getSettings();
  const { token: _token, ...nonSecret } = partial;
  const merged = { ...current, ...nonSecret };
  delete merged.token;
  removeUndefined(merged);
  localStorage.setItem('openab-settings', JSON.stringify(merged));
}

export function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && isLoopbackHostname(url.hostname);
  } catch { return false; }
}

export function isLoopbackHostname(hostname) {
  // URL implementations serialize IPv6 hostnames differently; normalize both forms.
  const normalized = hostname.replace(/^\[|\]$/g, '');
  return ['localhost', '127.0.0.1', '::1'].includes(normalized);
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
