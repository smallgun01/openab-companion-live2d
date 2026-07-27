/**
 * live2d-anim.js — Cubism parameter-based animation engine.
 *
 *   startIdleAnimations()  — breathing + blinking + body sway
 *   stopIdleAnimations()   — pause all idle
 *   lipSync(amplitude)     — drive the active profile's mouth-open binding
 *   isPlaying()            — idle active?
 *
 * MVP: parameter lerp only; no .motion3.json playback.
 * Post-MVP: add playMotion(motionPath) for keyframed clips.
 */

import { setParameter, getParameter, hasParameters } from './live2d-scene.js';
import { isExpressionActive, getExpressionParamKeys, tickExpressionDynamic } from './expression.js';
import { requireBinding } from './live2d-profile.js';

// ── Configuration ──────────────────────────────────────
// Profile ranges may use degree-scale values; do not assume 0–1.

const BREATH_CYCLE_S = 3.5;       // full breath cycle
const BREATH_AMPLITUDE = 1.0;
const BLINK_INTERVAL_MIN = 3.0;   // seconds
const BLINK_INTERVAL_MAX = 5.0;
const BLINK_DURATION_S = 0.15;    // blink close + open duration
const SWAY_PERIOD_S = 8.0;
const SWAY_AMPLITUDE = 2.0;       // degrees
const HEAD_SWAY_PERIOD_S = 10.0;
const HEAD_SWAY_AMPLITUDE = 3.0;  // degrees

// ── State ──────────────────────────────────────────────

let idleRAF = null;
let idleStartTime = 0;
let idleActive = false;

// Blink state machine
let blinkTimer = null;
let blinkPhase = 'idle'; // idle | closing | opening
let blinkStartTime = 0;
let blinkPreEyeL = 1;
let blinkPreEyeR = 1;

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

  // Ensure eyes start open (model defaults to 0 = closed)
  const blinkLeft = requireBinding('blink.left');
  const blinkRight = requireBinding('blink.right');
  setParameter(blinkLeft.id, blinkLeft.open);
  setParameter(blinkRight.id, blinkRight.open);

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

  // Reset idle parameters
  setParameter(requireBinding('idle.breath').id, 0);
  setParameter(requireBinding('blink.left').id, requireBinding('blink.left').open);
  setParameter(requireBinding('blink.right').id, requireBinding('blink.right').open);
  setParameter(requireBinding('idle.bodySway').id, 0);
  setParameter(requireBinding('idle.headSway').id, 0);

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
 * @param {number} amplitude — normalized 0.0–1.0 mouth-open amplitude
 */
export function lipSync(amplitude) {
  // Stub — Post-MVP implementation
  const clamped = Math.max(0, Math.min(1, amplitude));
  setParameter(requireBinding('lipSync.open').id, clamped);
}

// ── Per-frame tick ─────────────────────────────────────

function tick(now) {
  if (!idleActive) return;

  const elapsed = (now - idleStartTime) / 1000;

  // If expression is active, yield conflicting parameters (expression > idle)
  const exprActive = isExpressionActive();
  const exprKeys = exprActive ? getExpressionParamKeys() : new Set();

  // ── Breathing (yields to an expression-owned binding) ──
  const breath = requireBinding('idle.breath');
  const bodySway = requireBinding('idle.bodySway');
  const headSway = requireBinding('idle.headSway');
  const blinkLeft = requireBinding('blink.left');
  const blinkRight = requireBinding('blink.right');
  if (!exprKeys.has(breath.id)) {
    const breathPhase = (elapsed % BREATH_CYCLE_S) / BREATH_CYCLE_S;
    setParameter(breath.id, 0.5 + Math.sin(breathPhase * Math.PI * 2) * BREATH_AMPLITUDE * 0.5);
  }

  // ── Body sway (yields to expression) ──
  if (!exprKeys.has(bodySway.id)) {
    const swayPhase = (elapsed % SWAY_PERIOD_S) / SWAY_PERIOD_S;
    setParameter(bodySway.id, Math.sin(swayPhase * Math.PI * 2) * SWAY_AMPLITUDE);
  }

  // ── Head sway (yields to expression) ──
  if (!exprKeys.has(headSway.id)) {
    const headPhase = (elapsed % HEAD_SWAY_PERIOD_S) / HEAD_SWAY_PERIOD_S;
    setParameter(headSway.id, Math.sin(headPhase * Math.PI * 2) * HEAD_SWAY_AMPLITUDE);
  }

  // ── Expression dynamic oscillation (head sway, body rock, etc.) ──
  tickExpressionDynamic(now);

  // ── Blink (eye open/close yields to expression on those params) ──
  if (!exprKeys.has(blinkLeft.id) && !exprKeys.has(blinkRight.id)) {
    tickBlink(now);
  } else {
    // Expression controls eyes — skip blink state machine
    if (blinkPhase !== 'idle') {
      blinkPhase = 'idle';
      scheduleNextBlink();
    }
  }

  idleRAF = requestAnimationFrame(tick);
}

// ── Blink state machine ────────────────────────────────

function tickBlink(now) {
  if (blinkPhase === 'idle') return;

  const elapsed = (now - blinkStartTime) / 1000;
  const t = Math.min(elapsed / BLINK_DURATION_S, 1);

  switch (blinkPhase) {
    case 'closing': {
      // 0 → 1: eyes close
      const value = 1 - easeInQuad(t);  // 1 → 0
      setParameter(requireBinding('blink.left').id, value);
      setParameter(requireBinding('blink.right').id, value);
      if (t >= 1) {
        blinkPhase = 'opening';
        blinkStartTime = now;
      }
      break;
    }
    case 'opening': {
      // Restore to pre-blink value (preserves expression eye setting)
      const value = blinkPreEyeL * easeOutQuad(t);  // 0 → blinkPreEyeL
      setParameter(requireBinding('blink.left').id, value);
      setParameter(requireBinding('blink.right').id, blinkPreEyeR * easeOutQuad(t));
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
    // Capture actual current eye values (may be set by expression)
    blinkPreEyeL = getParameter(requireBinding('blink.left').id);
    blinkPreEyeR = getParameter(requireBinding('blink.right').id);
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
