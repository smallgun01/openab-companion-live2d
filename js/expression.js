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

export const EMOTION_MAP = {
  // ── Primitives ──
  happy: {
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
    ParamEyeLOpen: 0.7,       // slight happy squint
    ParamEyeROpen: 0.7,
    ParamMouthForm: 0.8,      // smile
    ParamMouthOpenY: 0.15,
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamCheek: 0.5,          // blush
  },
  sad: {
    ParamBrowLY: -0.6,        // brows down
    ParamBrowRY: -0.6,
    ParamBrowLForm: -0.3,
    ParamBrowRForm: -0.3,
    ParamEyeLOpen: 0.45,
    ParamEyeROpen: 0.45,
    ParamMouthForm: -0.6,     // slight frown
    ParamMouthOpenY: 0.0,
    ParamCheek: 0.1,
  },
  angry: {
    ParamBrowLY: -0.9,
    ParamBrowRY: -0.9,
    ParamBrowLAngle: -0.5,
    ParamBrowRAngle: 0.5,     // angled brows (V-shape)
    ParamBrowLForm: -0.5,
    ParamBrowRForm: -0.5,
    ParamEyeLOpen: 0.8,
    ParamEyeROpen: 0.8,
    ParamMouthForm: -0.3,
    ParamMouthOpenY: 0.1,
    ParamCheek: 0.0,
  },
  surprised: {
    ParamEyeLOpen: 1.0,       // wide eyes
    ParamEyeROpen: 1.0,
    ParamEyeLSmile: 0.0,
    ParamEyeRSmile: 0.0,
    ParamBrowLY: 0.8,         // brows high
    ParamBrowRY: 0.8,
    ParamMouthOpenY: 0.5,     // mouth open
    ParamMouthForm: 0.1,
    ParamCheek: 0.2,
  },
  relaxed: {
    ParamEyeLOpen: 0.6,       // half-closed, relaxed
    ParamEyeROpen: 0.6,
    ParamMouthForm: 0.15,     // gentle smile
    ParamMouthOpenY: 0.0,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
    ParamBrowLAngle: 0.0,
    ParamBrowRAngle: 0.0,
  },
  neutral: {
    // Reset all touched emotion params to default
    ParamEyeLOpen: 1.0,
    ParamEyeROpen: 1.0,
    ParamEyeLSmile: 0.0,
    ParamEyeRSmile: 0.0,
    ParamMouthForm: 0.0,
    ParamMouthOpenY: 0.0,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
    ParamBrowLX: 0.0,
    ParamBrowRX: 0.0,
    ParamBrowLAngle: 0.0,
    ParamBrowRAngle: 0.0,
    ParamBrowLForm: 0.0,
    ParamBrowRForm: 0.0,
    ParamCheek: 0.0,
    ParamEyeBallX: 0.0,
    ParamEyeBallY: 0.0,
  },

  // ── Compounds ──
  thinking: {
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
    ParamEyeBallX: 0.4,       // look to side
    ParamEyeBallY: 0.2,       // look up slightly
    ParamMouthForm: 0.05,
    ParamMouthOpenY: 0.05,
    ParamBrowLY: 0.15,
    ParamBrowRY: 0.15,
    ParamBrowLAngle: -0.1,
    ParamBrowRAngle: -0.1,
  },
  confused: {
    ParamBrowLY: -0.2,
    ParamBrowRY: 0.3,         // uneven brows
    ParamBrowLAngle: -0.3,
    ParamBrowRAngle: 0.3,
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.75,
    ParamMouthForm: -0.15,
    ParamMouthOpenY: 0.05,
    ParamEyeBallX: -0.3,
    ParamEyeBallY: 0.1,
  },
  excited: {
    ParamEyeLOpen: 1.0,
    ParamEyeROpen: 1.0,
    ParamEyeLSmile: 0.8,
    ParamEyeRSmile: 0.8,
    ParamMouthOpenY: 0.5,
    ParamMouthForm: 0.9,
    ParamBrowLY: 0.6,
    ParamBrowRY: 0.6,
    ParamCheek: 0.7,
  },

  // ── Extended (from AniCompanion) ──
  curious: {
    ParamEyeLOpen: 0.9,
    ParamEyeROpen: 0.9,
    ParamBrowLY: 0.4,
    ParamBrowRY: 0.4,
    ParamMouthForm: 0.15,
    ParamMouthOpenY: 0.05,
    ParamEyeBallX: 0.1,
  },
  shy: {
    ParamEyeLOpen: 0.5,
    ParamEyeROpen: 0.5,
    ParamEyeBallX: -0.4,      // looking away
    ParamMouthForm: 0.2,
    ParamBrowLY: -0.1,
    ParamBrowRY: -0.1,
    ParamCheek: 0.7,          // heavy blush
  },
  love: {
    ParamEyeLSmile: 0.6,
    ParamEyeRSmile: 0.6,
    ParamEyeLOpen: 0.65,
    ParamEyeROpen: 0.65,
    ParamMouthForm: 0.5,
    ParamBrowLY: 0.1,
    ParamBrowRY: 0.1,
    ParamCheek: 0.8,
  },
  smirk: {
    ParamMouthForm: 0.5,      // half-smile
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.65,      // slightly uneven
    ParamEyeLSmile: 0.4,
    ParamEyeRSmile: 0.1,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.0,         // one brow up
  },
  sleepy: {
    ParamEyeLOpen: 0.2,       // nearly closed
    ParamEyeROpen: 0.2,
    ParamMouthForm: 0.0,
    ParamMouthOpenY: 0.08,
    ParamBrowLY: -0.1,
    ParamBrowRY: -0.1,
    ParamCheek: 0.3,
  },
  proud: {
    ParamEyeLOpen: 0.85,
    ParamEyeROpen: 0.85,
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
    ParamMouthOpenY: 0.05,
    ParamCheek: 0.0,
  },
  pain: {
    ParamEyeLOpen: 0.15,      // tightly shut
    ParamEyeROpen: 0.15,
    ParamBrowLY: -0.8,
    ParamBrowRY: -0.8,
    ParamBrowLForm: -0.6,
    ParamBrowRForm: -0.6,
    ParamMouthOpenY: 0.15,
    ParamMouthForm: -0.4,
  },
  laugh: {
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
    ParamEyeLOpen: 0.25,      // happy closed eyes
    ParamEyeROpen: 0.25,
    ParamMouthOpenY: 0.7,     // wide open
    ParamMouthForm: 1.0,
    ParamBrowLY: 0.4,
    ParamBrowRY: 0.4,
    ParamCheek: 0.6,
  },
  bored: {
    ParamEyeLOpen: 0.45,
    ParamEyeROpen: 0.45,
    ParamMouthForm: -0.05,
    ParamMouthOpenY: 0.0,
    ParamBrowLY: 0.0,
    ParamBrowRY: 0.0,
    ParamCheek: 0.0,
  },
};

const TAG_RE = /\[([a-zA-Z]+)\]/g;

// ── Lerp state ─────────────────────────────────────────

let currentExpression = null;
let lerpRAF = null;
let lerpStart = 0;
let lerpFrom = {};
let lerpTo = {};
const LERP_MS = 300;

let lastEmotionKey = 'neutral';
export function getLastEmotion() { return lastEmotionKey; }

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
  lastEmotionKey = emotionKey;
  const targetWeights = EMOTION_MAP[emotionKey] || EMOTION_MAP.neutral;

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
  }
}
