/**
 * expression.js — Parse [emotion] tags from assistant text, drive Live2D expressions.
 *
 *   parseAndApply(text, model) → returns cleaned text (tags stripped)
 *
 * Maps 19 emotion tags → Cubism parameter targets via EMOTION_MAP.
 * Parameter lerp: 300ms eased transition.
 *
 * ⚠️ EMOTION_MAP parameter values are calibrated for the Haru sample model.
 * Adjust values for other models — every Live2D model has different parameter ranges.
 */

import { setParameter, getParameter, getParameterNames, hasParameters } from './live2d-scene.js';

// ── Emotion → Cubism parameter target values ────────────
//
// Each emotion key maps to { ParamName: targetValue (0–1) }.
// Only listed parameters are touched; untouched params keep current value.
//
// Haru parameter reference:
//   ParamMouthOpenY    — mouth vertical open (0=closed, 1=wide open)
//   ParamMouthForm     — mouth shape (0=neutral, 1=smile, -1=frown)
//   ParamEyeLOpen      — left eye open (1=fully open, 0=closed)
//   ParamEyeROpen      — right eye open
//   ParamBrowLY        — left brow vertical (-1=down, 1=up)
//   ParamBrowRY        — right brow vertical
//   ParamBrowLAngle    — left brow angle
//   ParamBrowRAngle    — right brow angle
//   ParamCheek         — blush intensity
//   ParamEyeBallX/Y    — eye direction
//
// Values are ESTIMATES for Haru — tune in Cubism Viewer.

export const EMOTION_MAP = {
  // ── Primitives ──
  happy: {
    ParamMouthOpenY: 0.4,
    ParamMouthForm: 0.8,    // smile
    ParamEyeLOpen: 0.85,    // slight squint
    ParamEyeROpen: 0.85,
    ParamBrowLY: 0.2,       // brows up
    ParamBrowRY: 0.2,
  },
  sad: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: -0.6,   // frown
    ParamEyeLOpen: 0.55,    // half-closed
    ParamEyeROpen: 0.55,
    ParamBrowLY: -0.5,      // brows down
    ParamBrowRY: -0.5,
  },
  angry: {
    ParamMouthOpenY: 0.15,
    ParamMouthForm: -0.4,
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.75,
    ParamBrowLY: -0.8,      // brows sharply down
    ParamBrowRY: -0.8,
  },
  surprised: {
    ParamMouthOpenY: 0.7,
    ParamMouthForm: 0.1,
    ParamEyeLOpen: 1.0,     // wide eyes
    ParamEyeROpen: 1.0,
    ParamBrowLY: 0.7,       // brows high
    ParamBrowRY: 0.7,
  },
  relaxed: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: 0.15,
    ParamEyeLOpen: 0.7,     // relaxed eyes
    ParamEyeROpen: 0.7,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
  },
  neutral: {
    // All touched parameters → 0 (default/neutral)
    ParamMouthOpenY: 0,
    ParamMouthForm: 0,
    ParamEyeLOpen: 1,
    ParamEyeROpen: 1,
    ParamBrowLY: 0,
    ParamBrowRY: 0,
  },

  // ── Compounds ──
  thinking: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: 0.1,
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.75,
    ParamBrowLY: 0.15,
    ParamBrowRY: 0.15,
    ParamEyeBallX: 0.3,     // look to side (thinking)
  },
  confused: {
    ParamMouthOpenY: 0.1,
    ParamMouthForm: -0.2,
    ParamEyeLOpen: 0.8,
    ParamEyeROpen: 0.8,
    ParamBrowLY: -0.3,
    ParamBrowRY: 0.3,        // uneven brows = confusion
  },
  excited: {
    ParamMouthOpenY: 0.6,
    ParamMouthForm: 0.9,
    ParamEyeLOpen: 1.0,
    ParamEyeROpen: 1.0,
    ParamBrowLY: 0.5,
    ParamBrowRY: 0.5,
  },

  // ── Extended (from AniCompanion) ──
  curious: {
    ParamMouthOpenY: 0.1,
    ParamMouthForm: 0.2,
    ParamEyeLOpen: 0.95,
    ParamEyeROpen: 0.95,
    ParamBrowLY: 0.4,
    ParamBrowRY: 0.4,
  },
  shy: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: 0.3,
    ParamEyeLOpen: 0.6,
    ParamEyeROpen: 0.6,
    ParamBrowLY: -0.1,
    ParamBrowRY: -0.1,
    ParamCheek: 0.4,         // blush
  },
  love: {
    ParamMouthOpenY: 0.15,
    ParamMouthForm: 0.6,
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.75,
    ParamBrowLY: 0.1,
    ParamBrowRY: 0.1,
    ParamCheek: 0.5,
  },
  smirk: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: 0.5,    // half-smile, one side
    ParamEyeLOpen: 0.8,
    ParamEyeROpen: 0.7,     // slightly uneven
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.0,
  },
  sleepy: {
    ParamMouthOpenY: 0.1,
    ParamMouthForm: 0.0,
    ParamEyeLOpen: 0.3,     // nearly closed
    ParamEyeROpen: 0.3,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
  },
  proud: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: 0.4,
    ParamEyeLOpen: 0.85,
    ParamEyeROpen: 0.85,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
  },
  disgusted: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: -0.7,
    ParamEyeLOpen: 0.55,
    ParamEyeROpen: 0.55,
    ParamBrowLY: -0.6,
    ParamBrowRY: -0.6,
  },
  pain: {
    ParamMouthOpenY: 0.2,
    ParamMouthForm: -0.5,
    ParamEyeLOpen: 0.2,     // tightly shut
    ParamEyeROpen: 0.2,
    ParamBrowLY: -0.7,
    ParamBrowRY: -0.7,
  },
  laugh: {
    ParamMouthOpenY: 0.8,
    ParamMouthForm: 1.0,
    ParamEyeLOpen: 0.3,     // happy squint
    ParamEyeROpen: 0.3,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
  },
  bored: {
    ParamMouthOpenY: 0.05,
    ParamMouthForm: -0.1,
    ParamEyeLOpen: 0.5,
    ParamEyeROpen: 0.5,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
  },
};

const TAG_RE = /\[([a-zA-Z]+)\]/g;

// ── Lerp state ─────────────────────────────────────────

let currentExpression = null;
let lerpRAF = null;
let lerpStart = 0;
let lerpFrom = {};  // { ParamName: value }
let lerpTo = {};    // { ParamName: value }
const LERP_MS = 300;

/** Track the last detected emotion key. */
let lastEmotionKey = 'neutral';
export function getLastEmotion() { return lastEmotionKey; }

// ── Public API ─────────────────────────────────────────

/**
 * Parse [tag] markers from text, apply matching Cubism parameter targets.
 *
 * @param {string} text  — assistant response (may contain [tags])
 * @returns {string} cleaned text with tags stripped
 */
export function parseAndApply(text) {
  if (!text || !hasParameters()) return text;

  // Collect all valid emotion tags
  const tags = [];
  const cleaned = text.replace(TAG_RE, (match, tag) => {
    const lower = tag.toLowerCase();
    tags.push(EMOTION_MAP[lower] ? lower : 'neutral');
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  // Use last valid tag, or neutral
  const emotionKey = tags.length > 0 ? tags[tags.length - 1] : 'neutral';
  lastEmotionKey = emotionKey;
  const targetWeights = EMOTION_MAP[emotionKey] || EMOTION_MAP.neutral;

  // Start lerp from current values to target
  if (lerpRAF) cancelAnimationFrame(lerpRAF);

  lerpFrom = {};
  for (const key of Object.keys(targetWeights)) {
    lerpFrom[key] = getParameter(key);
  }
  lerpTo = { ...targetWeights };
  lerpStart = performance.now();
  currentExpression = emotionKey;

  tickLerp();

  return cleaned;
}

// ── Parameter lerp ─────────────────────────────────────

function tickLerp() {
  if (!hasParameters()) return;

  const elapsed = performance.now() - lerpStart;
  const t = Math.min(elapsed / LERP_MS, 1.0);
  // Ease-out cubic
  const eased = 1 - Math.pow(1 - t, 3);

  // Interpolate each target parameter
  for (const key of Object.keys(lerpTo)) {
    const from = lerpFrom[key] ?? 0;
    const value = from + (lerpTo[key] - from) * eased;
    setParameter(key, value);
  }

  if (t < 1) {
    lerpRAF = requestAnimationFrame(tickLerp);
  } else {
    lerpRAF = null;
  }
}
