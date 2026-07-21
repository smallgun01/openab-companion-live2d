/**
 * Desktop-only window affordances.
 *
 * This module deliberately no-ops in a normal browser, keeping the existing
 * web companion as the single renderer and chat implementation.
 */
const isElectron = navigator.userAgent.includes('Electron');

if (isElectron) {
  window.__JELLII_DESKTOP__ = true;
  document.documentElement.classList.add('electron-desktop');
}
