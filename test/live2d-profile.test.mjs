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
import { blinkAperture, resetBlinkState } from '../js/live2d-anim.js';

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

test('blink preserves the active expression aperture instead of reopening to neutral', () => {
  assert.equal(blinkAperture(0.55, 0, 'closing'), 0.55);
  assert.equal(blinkAperture(0.55, 1, 'closing'), 0);
  assert.equal(blinkAperture(0.55, 1, 'opening'), 0.55);
  assert.equal(blinkAperture(0.8, 1, 'opening'), 0.8);
});

test('an interrupted blink resets its state while restoring the expression aperture', () => {
  assert.deepEqual(resetBlinkState({ phase: 'closing', startTime: 42, preEyeL: 0.55, preEyeR: 0.6 }), {
    phase: 'idle', startTime: 0, preEyeL: 1, preEyeR: 1, restoreEyeL: 0.55, restoreEyeR: 0.6,
  });
});
