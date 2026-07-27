import test from 'node:test';
import assert from 'node:assert/strict';

import {
  JELLYFISH_GIRL_PROFILE,
  getBinding,
  validateProfile,
} from '../js/live2d-profile.js';
import {
  EMOTION_MAP,
  NEUTRAL_BASELINE,
} from '../profiles/live2d/jellyfish-girl/expression-profile.js';

test('JellyFish Girl profile is structurally valid', () => {
  assert.deepEqual(validateProfile(JELLYFISH_GIRL_PROFILE), { valid: true, errors: [] });
  assert.equal(JELLYFISH_GIRL_PROFILE.assets.model, 'models/jellyfish-girl/jellyfishgirl.model3.json');
});

test('semantic bindings resolve to calibrated Cubism parameters', () => {
  assert.deepEqual(getBinding('blink.left'), {
    id: 'ParamEyeLOpen', range: [0, 1], closed: 0, open: 1,
  });
  assert.equal(getBinding('not-a-binding'), null);
});

test('profile validation rejects invalid bindings without guessing a fallback', () => {
  const profile = structuredClone(JELLYFISH_GIRL_PROFILE);
  profile.bindings['blink.left'].range = [1, 0];
  const report = validateProfile(profile);
  assert.equal(report.valid, false);
  assert.match(report.errors[0], /blink\.left: range/);
});

test('JellyFish Girl expression data remains a complete profile-owned catalog', () => {
  assert.deepEqual(Object.keys(EMOTION_MAP), [
    'joy', 'sadness', 'anger', 'surprise', 'fear', 'disgust', 'smirk', 'thinking', 'neutral',
  ]);
  assert.equal(EMOTION_MAP.joy.static.ParamMouthForm, 1);
  assert.equal(NEUTRAL_BASELINE.ParamMouthOpenY, 0);
});
