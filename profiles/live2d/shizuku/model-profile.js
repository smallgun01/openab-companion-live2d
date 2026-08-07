import { EMOTION_MAP, NEUTRAL_BASELINE } from './expression-profile.js';

/** Shizuku's official runtime-model capability and binding data. */
export const SHIZUKU_PROFILE = Object.freeze({
  schemaVersion: 1,
  id: 'shizuku-v1',
  displayName: 'Shizuku',
  renderer: 'live2d-cubism',
  assets: { model: 'models/shizuku/shizuku.model3.json' },
  layout: {
    anchor: [0.5, 1], fit: 'contain', scaleMultiplier: 0.9, placement: 'bottom-center',
  },
  bindings: {
    'blink.left': { id: 'PARAM_EYE_L_OPEN', range: [0, 1], closed: 0, open: 1 },
    'blink.right': { id: 'PARAM_EYE_R_OPEN', range: [0, 1], closed: 0, open: 1 },
    'lipSync.open': { id: 'PARAM_MOUTH_OPEN_Y', range: [0, 1], closed: 0, open: 1 },
    'idle.breath': { id: 'PARAM_BREATH', range: [0, 1] },
    'idle.bodySway': { id: 'PARAM_BODY_X', range: [-10, 10] },
    'idle.headSway': { id: 'PARAM_ANGLE_X', range: [-30, 30] },
  },
  capabilities: {
    // Candidate recipes: do not call this calibrated until the human visual
    // gate signs off each state.
    expressions: ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'fear', 'disgust', 'smirk', 'thinking'],
    nativeExpressions: false,
    // The model has a Cubism LipSync group, but Companion has no audio
    // amplitude source. Mouth motion inside native clips is not lip-sync.
    lipSync: false,
    motions: true,
  },
  nativeMotions: {
    // The shipped Idle clip is a 1.57 s full-body performance that drives
    // face, mouth, gaze, head, and body parameters. Keep it available for
    // an explicit trigger, but never layer it over a held semantic emotion.
    idle: { group: 'Idle', index: 0, loop: true, autoplay: false },
    tap: { group: 'Tap', index: 0, loop: false },
    flickUp: { group: 'FlickUp', index: 0, loop: false },
    flick3: { group: 'Flick3', index: 0, loop: false },
  },
  idle: {
    // Until a dedicated Shizuku idle is calibrated, do not let generic
    // breathing/sway recipes create another full-body performance.
    parameter: false,
    // Shizuku's pose3 groups make these alternate arm artwork, not transform
    // parameters. The shipped Idle selects R_01 + L_02 (the face-obscuring
    // pose); the paired _02 variants form the candidate rest composition.
    partOpacity: {
      PARTS_01_ARM_R_02: 1,
      PARTS_01_ARM_R_01: 0,
      PARTS_01_ARM_L_02: 1,
      PARTS_01_ARM_L_01: 0,
    },
  },
  engineOptions: {
    // The engine otherwise treats the model's `Idle` group as an automatic
    // fallback and requeues it whenever no other motion is running.
    idleMotionGroup: '__companion_idle_disabled__',
    breathDepth: 0,
  },
  expressions: { catalog: EMOTION_MAP, baseline: NEUTRAL_BASELINE },
});
