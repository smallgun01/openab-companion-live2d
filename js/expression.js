/**
 * expression.js — Parse [emotion] tags from assistant text, drive Live2D expressions.
 *
 *   parseAndApply(text) → returns cleaned text (tags stripped)
 *
 * Active tags (Jellii bot output):
 *   joy, sadness, anger, surprise, fear, disgust, smirk, neutral
 *
 * Parameter lerp: 300ms eased transition.
 *
 * Calibrated for: JellyFish Girl (jellyfishgirl.model3.json)
 * — 33 parameters, no EyeBlink/LipSync groups, no .exp3.json
 *
 * Verified parameter ranges (2026-07-13):
 *   Eyes:      ParamEyeLOpen/ROpen (0–1), ParamEyeLSmile/RSmile (0–1)
 *   Eyeball:   ParamEyeBallX/Y (-1–1)
 *   Brows:     ParamBrowLX/RX (-1–1), ParamBrowLY/RY (-1–1)
 *              ParamBrowLAngle/RAngle (-1=sad → 1=happy)
 *              ParamBrowLForm/RForm (-1=angry → 1=worried)
 *   Mouth:     ParamMouthForm (-1=sad → 1=happy), ParamMouthOpenY (0=closed → 1=open)
 *   Cheek:     ParamCheek (0–1 blush)
 *   Head:      ParamAngleX/Y/Z (-30–30 degrees)
 *   Body:      ParamBodyAngleX/Y/Z (-10–10 degrees)
 *   Breath:    ParamBreath (0–1)
 */

import { setParameter, getParameter, hasParameters } from './live2d-scene.js';

// ── Emotion → Cubism parameter target values ────────────
//
// Each entry has two sections:
//   static  — fixed target values (lerp to these and hold)
//   dynamic — oscillating ranges applied on top of static
//             format: { param: [amplitude, periodSeconds, phaseOffset] }
//             where param oscillates between static±amplitude
//
// ⚠️ Angle parameters (ParamAngleX/Y/Z, ParamBodyAngleX/Y/Z) use degree-scale
// values, NOT 0-1. Do NOT clamp these in setParameter.

// Every expression starts from this complete, neutral baseline.  Emotion
// entries below only describe their deltas, so a prior expression can never
// leak cheeks, brows, head angle, or mouth state into the next one.
const NEUTRAL_BASELINE = {
  ParamEyeLOpen: 1.0,
  ParamEyeROpen: 1.0,
  ParamEyeLSmile: 0.0,
  ParamEyeRSmile: 0.0,
  ParamEyeBallX: 0.0,
  ParamEyeBallY: 0.0,
  ParamBrowLY: 0.0,
  ParamBrowRY: 0.0,
  ParamBrowLX: 0.0,
  ParamBrowRX: 0.0,
  ParamBrowLAngle: 0.0,
  ParamBrowRAngle: 0.0,
  ParamBrowLForm: 0.0,
  ParamBrowRForm: 0.0,
  ParamMouthForm: 0.2,
  ParamMouthOpenY: 0.0,
  ParamCheek: 0.0,
  ParamAngleX: 0.0,
  ParamAngleY: 0.0,
  ParamAngleZ: 0.0,
  ParamBodyAngleX: 0.0,
  ParamBodyAngleY: 0.0,
  ParamBodyAngleZ: 0.0,
};

export const EMOTION_MAP = {
  // ── Active (Jellii bot output) ──
  // Calibrated 2026-07-14: human-expression reference, JellyFish Girl ranges.
  //
  // Design rules:
  //   Eyes + Mouth carry 80% of emotional information — always include both.
  //   Eyebrows differentiate subtle variants (anger vs disgust, fear vs surprise).
  //   Body/Head angles add weight — use sparingly, ±5° for subtle, ±15° max.
  //   Dynamic oscillation only on head Z (joy smirk) and body X (sad) — easy to
  //     tune, high visual return, minimal risk of motion sickness.

  joy: {
    static: {
      // Arthur's preferred joy: fully open eyes plus maximum eye-smile.
      ParamEyeLSmile: 1.0,
      ParamEyeRSmile: 1.0,
      ParamEyeLOpen: 1.0,
      ParamEyeROpen: 1.0,
      // Brows: relaxed-neutral, very slight lift
      ParamBrowLAngle: 0.15,
      ParamBrowRAngle: 0.15,
      // Mouth: maximum smile and opening
      ParamMouthForm: 1.0,
      ParamMouthOpenY: 1.0,
      // Cheeks: rosy flush
      ParamCheek: 0.5,
      // Body: subtle bounce-ready posture
      ParamBodyAngleY: 2.0,      // slight forward lean (engaged)
    },
    dynamic: {
      // Gentle head sway side-to-side (like humming a happy tune)
      ParamAngleZ: [8, 2.8, 0],
    },
  },

  sadness: {
    static: {
      // Eyes: downturned, slightly closed (heavy eyelids)
      ParamEyeLOpen: 0.55,
      ParamEyeROpen: 0.55,
      ParamEyeLSmile: 0.0,
      ParamEyeRSmile: 0.0,
      // Brows: inner corners pulled up and together (classic sadness brow)
      ParamBrowLAngle: -0.6,
      ParamBrowRAngle: -0.6,
      ParamBrowLForm: -0.2,      // slight furrow (not as tight as anger)
      ParamBrowRForm: -0.2,
      // Mouth: downturned, closed
      ParamMouthForm: -0.65,
      ParamMouthOpenY: 0.0,
      // Head: slight downward tilt (chin toward chest)
      ParamAngleY: -5.0,
      // Body: slumped inward
      ParamBodyAngleY: -3.0,
    },
    dynamic: {
      // Subtle body sway — slow, heavy (like rocking oneself)
      ParamBodyAngleX: [3, 5.0, 0],
    },
  },

  anger: {
    static: {
      // Eyes: narrowed, intense stare
      ParamEyeLOpen: 0.65,
      ParamEyeROpen: 0.65,
      ParamEyeLSmile: 0.0,
      ParamEyeRSmile: 0.0,
      // Brows: pulled down hard, tight together
      ParamBrowLY: -0.5,
      ParamBrowRY: -0.5,
      ParamBrowLAngle: -1.0,     // max downward angle
      ParamBrowRAngle: -1.0,
      ParamBrowLForm: -1.0,      // maximum furrow — full anger brow
      ParamBrowRForm: -1.0,
      // Mouth: tight, teeth-baring
      ParamMouthForm: -0.5,
      ParamMouthOpenY: 0.25,
      // Body: aggressive forward lean
      ParamBodyAngleY: 5.0,
      // Head: slight downward tilt (predator stare)
      ParamAngleY: -3.0,
    },
  },

  surprise: {
    static: {
      // Eyes: wide open (maximum aperture)
      ParamEyeLOpen: 1.0,
      ParamEyeROpen: 1.0,
      ParamEyeLSmile: 0.0,
      ParamEyeRSmile: 0.0,
      // Brows: raised high, relaxed (not furrowed)
      ParamBrowLY: 0.8,
      ParamBrowRY: 0.8,
      ParamBrowLAngle: 0.3,
      ParamBrowRAngle: 0.3,
      ParamBrowLForm: 0.0,       // relaxed — key diff from fear
      ParamBrowRForm: 0.0,
      // Mouth: dropped open, neutral shape
      ParamMouthOpenY: 0.7,
      ParamMouthForm: 0.05,      // neutral, not smiling
      // Head: slight back (startled recoil)
      ParamAngleY: 3.0,
      // Body: slight lean back
      ParamBodyAngleY: -3.0,
    },
  },

  fear: {
    static: {
      // Eyes: wide open, tense (upper lid lifted by levator + frontalis)
      ParamEyeLOpen: 1.0,
      ParamEyeROpen: 1.0,
      ParamEyeLSmile: 0.0,
      ParamEyeRSmile: 0.0,
      // Brows: raised BUT drawn together — this IS the fear signal
      //         (corrugator + frontalis co-contraction)
      ParamBrowLY: 0.5,
      ParamBrowRY: 0.5,
      ParamBrowLAngle: -0.2,     // slight inner-up pull (fear brow)
      ParamBrowRAngle: -0.2,
      ParamBrowLForm: 0.5,       // worried furrow — key diff from surprise
      ParamBrowRForm: 0.5,
      // Mouth: open but tense, pulled back (platysma tension)
      ParamMouthOpenY: 0.35,
      ParamMouthForm: -0.25,
      // Cheek: pale (vasoconstriction)
      ParamCheek: 0.0,
      // Head: slight retraction
      ParamAngleY: 2.0,
      // Body: defensive lean back
      ParamBodyAngleY: -4.0,
    },
  },

  disgust: {
    static: {
      // Eyes: narrowed, protective squint
      ParamEyeLOpen: 0.45,
      ParamEyeROpen: 0.45,
      ParamEyeLSmile: 0.0,
      ParamEyeRSmile: 0.0,
      // Brows: pulled down + tight furrow (corrugator dominant)
      ParamBrowLY: -0.7,
      ParamBrowRY: -0.7,
      ParamBrowLAngle: -0.4,
      ParamBrowRAngle: -0.4,
      ParamBrowLForm: -0.6,      // strong furrow
      ParamBrowRForm: -0.6,
      // Mouth: asymmetric grimace (levator labii + nasalis wrinkle)
      ParamMouthForm: -0.55,
      ParamMouthOpenY: 0.1,      // slight opening (like saying "ugh")
      // Head: turn slightly away + tilt back
      ParamAngleY: -5.0,
      ParamAngleZ: 8.0,          // sideways tilt (avoiding)
    },
  },

  smirk: {
    static: {
      // Eyes: asymmetric — one side smirks more
      ParamEyeLSmile: 0.55,      // left eye crinkles
      ParamEyeRSmile: 0.1,       // right eye barely
      ParamEyeLOpen: 0.8,
      ParamEyeROpen: 0.85,
      // Brows: one raised (the "knowing" look)
      ParamBrowLY: 0.35,         // left brow lifts
      ParamBrowRY: 0.0,          // right brow stays
      // Mouth: half-smile, closed
      ParamMouthForm: 0.45,
      ParamMouthOpenY: 0.0,
      // Head: slight sideways tilt
      ParamAngleZ: -6.0,
      // Body: slight lean (confident posture)
      ParamBodyAngleX: 3.0,
    },
    dynamic: {
      // A restrained, knowing tilt — not a pendulum.
      ParamAngleZ: [2.5, 4.5, 0],
    },
  },

  // UI state, not a model-emitted emotion tag.  The client enters this while
  // a request is pending and hands control back to Jellii as soon as its tag
  // arrives in the response.
  thinking: {
    static: {
      ParamEyeLOpen: 0.85,
      ParamEyeROpen: 0.85,
      ParamEyeBallX: 0.35,
      ParamEyeBallY: 0.30,
      ParamBrowLY: 0.18,
      ParamBrowRY: 0.34,
      ParamBrowLAngle: 0.10,
      ParamBrowRAngle: 0.20,
      ParamMouthForm: 0.10,
      ParamMouthOpenY: 0.05,
      ParamAngleZ: -2.0,
    },
    dynamic: {
      // A slow gaze scan and small head tilt: reading, not anxiety.
      ParamEyeBallX: [0.10, 4.5, 0],
      ParamAngleZ: [2.0, 5.2, 0.15],
    },
  },

  neutral: {
    static: {
      // The complete reset lives in NEUTRAL_BASELINE.
    },
  },

  // ── EXTENDED (not yet used by bot; uncomment + calibrate when needed) ──
  // thinking: {
  //   static: { ParamAngleX: 5.0, ParamEyeBallY: 0.5, ParamBrowLY: 0.3, ParamBrowRY: 0.3 },
  // },
  // confused: {
  //   static: { ParamBrowLAngle: 0.5, ParamBrowRAngle: -0.5, ParamAngleZ: -3.0, ParamMouthForm: -0.3 },
  // },
  // excited: {
  //   static: { ParamEyeLSmile: 1.0, ParamEyeRSmile: 1.0, ParamMouthOpenY: 0.5, ParamMouthForm: 1.0, ParamBodyAngleY: 3.0, ParamCheek: 0.7 },
  // },
  // curious: {
  //   static: { ParamAngleX: 8.0, ParamEyeLOpen: 1.0, ParamEyeROpen: 1.0, ParamBrowLY: 0.4, ParamBrowRY: 0.4 },
  // },
  // shy: {
  //   static: { ParamAngleY: -3.0, ParamAngleX: -5.0, ParamCheek: 1.0, ParamEyeLSmile: 0.5, ParamEyeRSmile: 0.5, ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7 },
  // },
  // love: {
  //   static: { ParamEyeLSmile: 0.8, ParamEyeRSmile: 0.8, ParamMouthForm: 0.6, ParamCheek: 0.8, ParamBodyAngleX: 3.0 },
  // },
  // laugh: {
  //   static: { ParamEyeLSmile: 1.0, ParamEyeRSmile: 1.0, ParamMouthOpenY: 0.8, ParamMouthForm: 1.0, ParamBodyAngleY: 2.0 },
  // },
  // bored: {
  //   static: { ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5, ParamAngleY: -2.0, ParamMouthForm: -0.2 },
  // },
  // sleepy: {
  //   static: { ParamEyeLOpen: 0.3, ParamEyeROpen: 0.3, ParamAngleY: -5.0, ParamBodyAngleY: -2.0 },
  // },
  // proud: {
  //   static: { ParamMouthForm: 0.35, ParamBrowLY: 0.35, ParamBrowRY: 0.35, ParamCheek: 0.2 },
  // },
  // pain: {
  //   static: { ParamEyeLOpen: 0.15, ParamEyeROpen: 0.15, ParamBrowLY: -0.8, ParamBrowRY: -0.8, ParamBrowLForm: -0.6, ParamBrowRForm: -0.6, ParamMouthOpenY: 0.15, ParamMouthForm: -0.4 },
  // },
  // relaxed: {
  //   static: { ParamEyeLOpen: 0.7, ParamEyeROpen: 0.7, ParamEyeLSmile: 0.4, ParamEyeRSmile: 0.4, ParamMouthForm: 0.3 },
  // },
};

const TAG_RE = /\[([a-zA-Z]+)\]/g;

// ── Lerp state ─────────────────────────────────────────

let lerpRAF = null;
let lerpStart = 0;
let lerpFrom = {};
let lerpTo = {};
let lerpActiveParamKeys = new Set();  // params currently being driven by expression
let currentEmotion = null;            // currently active emotion key (for dynamic tick)
let currentStaticTargets = {};
const LERP_MS = 300;

let lastEmotionKey = 'neutral';
export function getLastEmotion() { return lastEmotionKey; }

/**
 * Check if an expression lerp is active (for idle to yield conflicting params).
 */
export function isExpressionActive() {
  return lerpRAF !== null || currentEmotion !== null;
}

/**
 * Parameters currently driven by the active expression.
 * Idle should skip writing to these.
 */
export function getExpressionParamKeys() {
  return lerpActiveParamKeys;
}

/**
 * Called every frame by the animation loop to apply dynamic (oscillating)
 * parameters on top of the current expression's static targets.
 */
export function tickExpressionDynamic(nowMs) {
  if (!currentEmotion || !hasParameters()) return;
  const entry = EMOTION_MAP[currentEmotion];
  if (!entry || !entry.dynamic) return;

  const dyn = entry.dynamic;
  for (const param of Object.keys(dyn)) {
    const [amplitude, periodS, phaseOffset = 0] = dyn[param];
    const staticVal = currentStaticTargets[param] ?? NEUTRAL_BASELINE[param] ?? getParameter(param);
    const phase = ((nowMs / 1000) / periodS + phaseOffset) * Math.PI * 2;
    const value = staticVal + Math.sin(phase) * amplitude;
    setParameter(param, value);
  }
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

  // No tags found → don't touch expression (avoid resetting to neutral on partial chunks)
  if (tags.length === 0) return cleaned;

  const emotionKey = tags[tags.length - 1];

  // Skip if same non-neutral emotion already playing
  if (emotionKey === lastEmotionKey && emotionKey !== 'neutral') {
    return cleaned;
  }

  applyExpression(emotionKey);
  return cleaned;
}

/** Apply a client or model expression by key. */
export function applyExpression(emotionKey) {
  if (!hasParameters()) return;

  const key = EMOTION_MAP[emotionKey] ? emotionKey : 'neutral';
  const entry = EMOTION_MAP[key] || EMOTION_MAP.neutral;
  const targetWeights = { ...NEUTRAL_BASELINE, ...(entry.static || entry) };

  console.log('[expression] state →', key, 'static keys:', Object.keys(targetWeights).join(', '));
  lastEmotionKey = key;

  if (lerpRAF) cancelAnimationFrame(lerpRAF);

  lerpFrom = {};
  for (const key of Object.keys(targetWeights)) {
    lerpFrom[key] = getParameter(key);
  }
  lerpTo = { ...targetWeights };
  currentStaticTargets = { ...targetWeights };
  lerpActiveParamKeys = new Set(Object.keys(lerpTo));
  currentEmotion = key === 'neutral' ? null : key;
  lerpStart = performance.now();

  tickLerp();
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
    // Keep idle animation from overwriting a held expression base. Dynamic
    // motion is then applied around currentStaticTargets, never around the
    // previous frame's value.
    lerpActiveParamKeys = currentEmotion ? new Set(Object.keys(lerpTo)) : new Set();
  }
}
