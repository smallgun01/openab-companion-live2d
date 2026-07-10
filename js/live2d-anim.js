/**
 * live2d-anim.js — Cubism parameter-based animation engine.
 *
 *   startIdleAnimations()  — breathing + blinking + body sway
 *   stopIdleAnimations()   — pause all idle
 *   lipSync(amplitude)     — Post-MVP: drive ParamMouthOpenY (0–1)
 *   isPlaying()            — idle active?
 *
 * MVP: parameter lerp only; no .motion3.json playback.
 * Post-MVP: add playMotion(motionPath) for keyframed clips.
 */

import { setParameter, getParameter, hasParameters } from './live2d-scene.js';

// ── Configuration ──────────────────────────────────────

const BREATH_CYCLE_S = 4.0;       // full breath cycle (seconds)
const BREATH_AMPLITUDE = 0.15;    // ParamBreath swing
const BLINK_INTERVAL_MIN = 3.0;   // seconds
const BLINK_INTERVAL_MAX = 5.0;
const BLINK_CLOSE_MS = 100;       // duration of eye close
const BLINK_PAUSE_MS = 50;        // hold closed
const BLINK_OPEN_MS = 150;        // duration of eye open
const SWAY_PERIOD_S = 6.0;        // body sway cycle
const SWAY_AMPLITUDE = 0.05;

// ── State ──────────────────────────────────────────────

let idleRAF = null;
let idleStartTime = 0;
let idleActive = false;

// Blink state machine
let blinkTimer = null;
let blinkPhase = 'idle'; // idle | closing | paused | opening
let blinkStartTime = 0;

// ── Public API ─────────────────────────────────────────

/**
 * Start all idle animations: breathing, blinking, body sway.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startIdleAnimations() {
  if (idleActive) return;
  if (!hasParameters()) {
    console.warn('[live2d-anim] Cannot start idle — no model parameters');
    return;
  }

  idleActive = true;
  idleStartTime = performance.now();
  scheduleNextBlink();
  idleRAF = requestAnimationFrame(tick);
  console.log('[live2d-anim] Idle animations started');
}

/**
 * Stop all idle animations and reset idle parameters to defaults.
 */
export function stopIdleAnimations() {
  idleActive = false;

  if (idleRAF) {
    cancelAnimationFrame(idleRAF);
    idleRAF = null;
  }
  if (blinkTimer) {
    clearTimeout(blinkTimer);
    blinkTimer = null;
  }

  // Reset idle parameters to default
  setParameter('ParamBreath', 0);
  setParameter('ParamEyeLOpen', 1);
  setParameter('ParamEyeROpen', 1);
  setParameter('ParamBodyAngleX', 0);
  setParameter('ParamBodyAngleY', 0);
  setParameter('ParamBodyAngleZ', 0);

  console.log('[live2d-anim] Idle animations stopped');
}

/**
 * Check if idle animations are running.
 */
export function isPlaying() {
  return idleActive;
}

/**
 * Post-MVP: Drive lip sync from external audio amplitude.
 *
 * @param {number} amplitude — 0.0–1.0 (maps to ParamMouthOpenY)
 */
export function lipSync(amplitude) {
  // Stub — Post-MVP implementation
  const clamped = Math.max(0, Math.min(1, amplitude));
  setParameter('ParamMouthOpenY', clamped);
}

// ── Per-frame tick ─────────────────────────────────────

function tick(now) {
  if (!idleActive) return;

  const elapsed = (now - idleStartTime) / 1000;

  // ── Breathing ──
  const breathPhase = (elapsed % BREATH_CYCLE_S) / BREATH_CYCLE_S;
  const breathValue = 0.5 + Math.sin(breathPhase * Math.PI * 2) * BREATH_AMPLITUDE * 0.5;
  setParameter('ParamBreath', breathValue);

  // ── Body sway ──
  const swayPhase = (elapsed % SWAY_PERIOD_S) / SWAY_PERIOD_S;
  const swayValue = Math.sin(swayPhase * Math.PI * 2) * SWAY_AMPLITUDE;
  setParameter('ParamBodyAngleX', swayValue * 0.5);
  setParameter('ParamBodyAngleY', swayValue);
  setParameter('ParamBodyAngleZ', swayValue * 0.3);

  // ── Blink ──
  tickBlink(now);

  idleRAF = requestAnimationFrame(tick);
}

// ── Blink state machine ────────────────────────────────

function tickBlink(now) {
  if (blinkPhase === 'idle') return;

  const elapsed = now - blinkStartTime;

  switch (blinkPhase) {
    case 'closing': {
      const t = Math.min(elapsed / BLINK_CLOSE_MS, 1);
      const eased = easeInQuad(t);
      const value = 1 - eased; // 1 → 0
      setParameter('ParamEyeLOpen', value);
      setParameter('ParamEyeROpen', value);
      if (t >= 1) {
        blinkPhase = 'paused';
        blinkStartTime = now;
      }
      break;
    }
    case 'paused': {
      if (elapsed >= BLINK_PAUSE_MS) {
        blinkPhase = 'opening';
        blinkStartTime = now;
      }
      break;
    }
    case 'opening': {
      const t = Math.min(elapsed / BLINK_OPEN_MS, 1);
      const eased = easeOutQuad(t);
      setParameter('ParamEyeLOpen', eased); // 0 → 1
      setParameter('ParamEyeROpen', eased);
      if (t >= 1) {
        blinkPhase = 'idle';
        scheduleNextBlink();
      }
      break;
    }
  }
}

function scheduleNextBlink() {
  if (!idleActive) return;
  const delay =
    BLINK_INTERVAL_MIN * 1000 +
    Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN) * 1000;

  blinkTimer = setTimeout(() => {
    blinkTimer = null;
    if (!idleActive) return;
    blinkPhase = 'closing';
    blinkStartTime = performance.now();
  }, delay);
}

// ── Easing ─────────────────────────────────────────────

function easeInQuad(t) {
  return t * t;
}

function easeOutQuad(t) {
  return t * (2 - t);
}
