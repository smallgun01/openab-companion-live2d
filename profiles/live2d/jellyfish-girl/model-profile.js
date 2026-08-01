import { EMOTION_MAP, NEUTRAL_BASELINE } from './expression-profile.js';

/** JellyFish Girl's model-specific Live2D capability and binding data. */
export const JELLYFISH_GIRL_PROFILE = Object.freeze({
  schemaVersion: 1,
  id: 'jellyfish-girl-v1',
  displayName: 'JellyFish Girl',
  renderer: 'live2d-cubism',
  assets: { model: 'models/jellyfish-girl/jellyfishgirl.model3.json' },
  layout: {
    anchor: [0.5, 1], fit: 'contain', scaleMultiplier: 0.85, placement: 'bottom-center',
  },
  bindings: {
    'blink.left': { id: 'ParamEyeLOpen', range: [0, 1], closed: 0, open: 1 },
    'blink.right': { id: 'ParamEyeROpen', range: [0, 1], closed: 0, open: 1 },
    'lipSync.open': { id: 'ParamMouthOpenY', range: [0, 1], closed: 0, open: 1 },
    'idle.breath': { id: 'ParamBreath', range: [0, 1] },
    'idle.bodySway': { id: 'ParamBodyAngleX', range: [-10, 10] },
    'idle.headSway': { id: 'ParamAngleX', range: [-30, 30] },
  },
  capabilities: {
    expressions: ['neutral', 'joy', 'sadness', 'anger', 'surprise', 'fear', 'disgust', 'smirk', 'thinking'],
    nativeExpressions: false,
    lipSync: false,
    motions: false,
  },
  expressions: { catalog: EMOTION_MAP, baseline: NEUTRAL_BASELINE },
});
