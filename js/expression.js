/**
 * expression.js — Parse [emotion] tags from assistant text, drive Live2D expressions.
 *
 *   parseAndApply(text) → returns cleaned text (tags stripped)
 *
 * Maps 19 emotion tags → Cubism parameter targets via EMOTION_MAP.
 * Parameter lerp: 300ms eased transition.
 *
 * Calibrated for: JellyFish Girl (jellyfishgirl.model3.json)
 * — 33 parameters, no EyeBlink/LipSync groups, no .exp3.json
 *
 * Key parameter reference:
 *   Eyes:      ParamEyeLOpen/ROpen, ParamEyeLSmile/RSmile
 *   Brows:     ParamBrowLX/RX, ParamBrowLY/RY, ParamBrowLAngle/RAngle, ParamBrowLForm/RForm
 *   Mouth:     ParamMouthForm (-1=pout, 0=neutral, 1=smile), ParamMouthOpenY (0=closed)
 *   Cheek:     ParamCheek (blush)
 *   Body:      ParamBodyAngleX/Y/Z
 *   Breath:    ParamBreath
 */

import { setParameter, getParameter, hasParameters } from './live2d-scene.js';

// ── Emotion → Cubism parameter target values ────────────

// ⚠️ Angle parameters (ParamAngleX/Y/Z, ParamBodyAngleX/Y/Z) use degree-scale
// values (≈ -30..30), NOT 0-1. Do NOT clamp these in setParameter.
export const EMOTION_MAP = {
  // ── Primitives ──
  happy: {
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
    ParamMouthForm: 0.8,
    ParamCheek: 0.5,
  },
  sad: {
    ParamBrowLAngle: -0.3,
    ParamBrowRAngle: -0.3,
    ParamEyeLOpen: 0.6,
    ParamEyeROpen: 0.6,
    ParamMouthForm: -0.7,
  },
  angry: {
    ParamBrowLAngle: -1.0,
    ParamBrowRAngle: -1.0,
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.3,
    ParamEyeLOpen: 0.8,
    ParamEyeROpen: 0.8,
    ParamMouthForm: -0.5,
    ParamMouthOpenY: 0.3,
  },
  surprised: {
    ParamEyeLOpen: 1.2,        // extra wide (model supports >1.0)
    ParamEyeROpen: 1.2,
    ParamBrowLY: 0.8,
    ParamBrowRY: 0.8,
    ParamMouthOpenY: 0.7,
    ParamMouthForm: 0.0,
  },
  relaxed: {
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
    ParamEyeLSmile: 0.4,
    ParamEyeRSmile: 0.4,
    ParamMouthForm: 0.3,
  },
  neutral: {},  // idle takes over — no parameter overrides

  // ── Compounds ──
  thinking: {
    ParamAngleX: 5.0,          // head tilt (degrees)
    ParamEyeBallY: 0.5,        // looking up
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
  },
  confused: {
    ParamBrowLAngle: 0.5,      // one brow up, one down
    ParamBrowRAngle: -0.5,
    ParamAngleZ: -3.0,         // head tilt
    ParamMouthForm: -0.3,
  },
  excited: {
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
    ParamMouthOpenY: 0.5,
    ParamMouthForm: 1.0,
    ParamBodyAngleY: 3.0,      // body lean forward (degrees)
    ParamCheek: 0.7,
  },

  // ── Extended ──
  curious: {
    ParamAngleX: 8.0,          // head tilt
    ParamEyeLOpen: 1.1,
    ParamEyeROpen: 1.1,
    ParamBrowLY: 0.4,
    ParamBrowRY: 0.4,
  },
  shy: {
    ParamAngleY: -3.0,         // looking down
    ParamAngleX: -5.0,         // slight turn away
    ParamCheek: 1.0,           // full blush
    ParamEyeLSmile: 0.5,
    ParamEyeRSmile: 0.5,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
  },
  love: {
    ParamEyeLSmile: 0.8,
    ParamEyeRSmile: 0.8,
    ParamMouthForm: 0.6,
    ParamCheek: 0.8,
    ParamBodyAngleX: 3.0,      // body sway
  },
  laugh: {
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
    ParamMouthOpenY: 0.8,
    ParamMouthForm: 1.0,
    ParamBodyAngleY: 2.0,
  },
  bored: {
    ParamEyeLOpen: 0.5,
    ParamEyeROpen: 0.5,
    ParamAngleY: -2.0,         // slight head drop
    ParamMouthForm: -0.2,
  },
  sleepy: {
    ParamEyeLOpen: 0.3,
    ParamEyeROpen: 0.3,
    ParamAngleY: -5.0,         // head drooping
    ParamBodyAngleY: -2.0,     // body slumping
  },

  // ── Remaining (keep defaults) ──
  smirk: {
    ParamMouthForm: 0.5,
    ParamEyeLSmile: 0.4,
    ParamEyeRSmile: 0.1,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.0,
  },
  proud: {
    ParamMouthForm: 0.35,
    ParamBrowLY: 0.35,
    ParamBrowRY: 0.35,
    ParamCheek: 0.2,
  },
  disgusted: {
    ParamBrowLY: -0.7,
    ParamBrowRY: -0.7,
    ParamBrowLForm: -0.5,
    ParamBrowRForm: -0.5,
    ParamEyeLOpen: 0.5,
    ParamEyeROpen: 0.5,
    ParamMouthForm: -0.6,
  },
  pain: {
    ParamEyeLOpen: 0.15,
    ParamEyeROpen: 0.15,
    ParamBrowLY: -0.8,
    ParamBrowRY: -0.8,
    ParamBrowLForm: -0.6,
    ParamBrowRForm: -0.6,
    ParamMouthOpenY: 0.15,
    ParamMouthForm: -0.4,
  },
};

const TAG_RE = /\[([a-zA-Z]+)\]/g;

// ── Lerp state ─────────────────────────────────────────

let currentExpression = null;
let lerpRAF = null;
let lerpStart = 0;
let lerpFrom = {};
let lerpTo = {};
let lerpActiveParamKeys = new Set();  // params currently being driven by expression
const LERP_MS = 300;

let lastEmotionKey = 'neutral';
export function getLastEmotion() { return lastEmotionKey; }

/**
 * Check if an expression lerp is active (for idle to yield conflicting params).
 */
export function isExpressionActive() {
  return lerpRAF !== null;
}

/**
 * Parameters currently driven by the active expression.
 * Idle should skip writing to these.
 */
export function getExpressionParamKeys() {
  return lerpActiveParamKeys;
}

// ── Public API ─────────────────────────────────────────

export function parseAndApply(text) {
  if (!text || !hasParameters()) return text;

  const tags = [];
  const cleaned = text.replace(TAG_RE, (match, tag) => {
    const lower = tag.toLowerCase();
    tags.push(EMOTION_MAP[lower] ? lower : 'neutral');
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  const emotionKey = tags.length > 0 ? tags[tags.length - 1] : 'neutral';

  // Skip if same emotion already playing
  if (emotionKey === lastEmotionKey && emotionKey !== 'neutral') {
    return cleaned;
  }
  lastEmotionKey = emotionKey;
  const targetWeights = EMOTION_MAP[emotionKey] || EMOTION_MAP.neutral;

  if (lerpRAF) cancelAnimationFrame(lerpRAF);

  lerpFrom = {};
  for (const key of Object.keys(targetWeights)) {
    lerpFrom[key] = getParameter(key);
  }
  lerpTo = { ...targetWeights };
  lerpActiveParamKeys = new Set(Object.keys(lerpTo));  // idle yields these
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
  const eased = 1 - Math.pow(1 - t, 3);   // ease-out cubic

  for (const key of Object.keys(lerpTo)) {
    const from = lerpFrom[key] ?? 0;
    const value = from + (lerpTo[key] - from) * eased;
    setParameter(key, value);
  }

  if (t < 1) {
    lerpRAF = requestAnimationFrame(tickLerp);
  } else {
    lerpRAF = null;
    lerpActiveParamKeys = new Set();
  }
}
