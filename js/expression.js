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
 * Model-specific recipes and Cubism parameter IDs live in the active
 * expression profile. This module only resolves semantic expression keys.
 */

import { setParameter, getParameter, hasParameters } from './live2d-scene.js';
import { getActiveExpressionProfile, resolveSupportedExpression } from './live2d-profile.js';

// Profile recipe shape: static target values and optional dynamic
// `{ parameterId: [amplitude, periodSeconds, phaseOffset] }` oscillations.
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
  const { catalog: EMOTION_MAP, baseline: NEUTRAL_BASELINE } = getActiveExpressionProfile();
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

  const { catalog: EMOTION_MAP } = getActiveExpressionProfile();

  const tags = [];
  const cleaned = text.replace(TAG_RE, (match, tag) => {
    const lower = tag.toLowerCase();
    tags.push(resolveSupportedExpression(EMOTION_MAP[lower] ? lower : 'neutral'));
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

  const { catalog: EMOTION_MAP, baseline: NEUTRAL_BASELINE } = getActiveExpressionProfile();

  const key = resolveSupportedExpression(emotionKey);
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
