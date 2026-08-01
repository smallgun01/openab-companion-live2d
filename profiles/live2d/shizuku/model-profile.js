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
    expressions: ['neutral'],
    nativeExpressions: false,
    motions: true,
  },
  expressions: { catalog: EMOTION_MAP, baseline: NEUTRAL_BASELINE },
});
