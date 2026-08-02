import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROFILE_ID,
  JELLYFISH_GIRL_PROFILE,
  getActiveExpressionProfile,
  getBinding,
  getActiveProfile,
  listProfiles,
  resolveSupportedExpression,
  setActiveProfile,
  supportsCapability,
  validateProfile,
} from '../js/live2d-profile.js';
import {
  EMOTION_MAP,
  NEUTRAL_BASELINE,
} from '../profiles/live2d/jellyfish-girl/expression-profile.js';
import { blinkAperture, resetBlinkState, shouldApplyParameterIdle } from '../js/live2d-anim.js';
import { getProfile } from '../profiles/live2d/registry.js';
import { SHIZUKU_PROFILE } from '../profiles/live2d/shizuku/model-profile.js';

test.afterEach(() => setActiveProfile(DEFAULT_PROFILE_ID));

test('JellyFish Girl profile is structurally valid', () => {
  assert.deepEqual(validateProfile(JELLYFISH_GIRL_PROFILE), { valid: true, errors: [] });
  assert.equal(JELLYFISH_GIRL_PROFILE.assets.model, 'models/jellyfish-girl/jellyfishgirl.model3.json');
  assert.equal(setActiveProfile(DEFAULT_PROFILE_ID), JELLYFISH_GIRL_PROFILE);
  assert.equal(supportsCapability('motions'), false);
});

test('profile selection is registry-backed and rejects unknown IDs', () => {
  assert.deepEqual(listProfiles().map((profile) => profile.id), [DEFAULT_PROFILE_ID, SHIZUKU_PROFILE.id]);
  assert.equal(getProfile(DEFAULT_PROFILE_ID), JELLYFISH_GIRL_PROFILE);
  assert.equal(setActiveProfile(DEFAULT_PROFILE_ID), JELLYFISH_GIRL_PROFILE);
  assert.equal(getActiveProfile(), JELLYFISH_GIRL_PROFILE);
  assert.throws(() => setActiveProfile('not-a-profile'), /Unknown Live2D profile/);
  assert.equal(getActiveProfile(), JELLYFISH_GIRL_PROFILE);
});

test('Shizuku profile is independently valid with an explicit neutral-only downgrade', () => {
  assert.deepEqual(validateProfile(SHIZUKU_PROFILE), { valid: true, errors: [] });
  assert.equal(setActiveProfile(SHIZUKU_PROFILE.id), SHIZUKU_PROFILE);
  assert.equal(getActiveExpressionProfile().catalog.neutral.static.PARAM_MOUTH_OPEN_Y, 0);
  assert.deepEqual(SHIZUKU_PROFILE.capabilities.expressions, ['neutral']);
  assert.equal(SHIZUKU_PROFILE.capabilities.motions, true);
  assert.equal(supportsCapability('motions'), true);
  assert.equal(SHIZUKU_PROFILE.capabilities.lipSync, false);
  assert.deepEqual(SHIZUKU_PROFILE.nativeMotions.idle, { group: 'Idle', index: 0, loop: true });
  assert.equal(resolveSupportedExpression('joy'), 'neutral');
  assert.equal(resolveSupportedExpression('neutral'), 'neutral');
  assert.equal(supportsCapability('lipSync'), false);
});

test('native motion declarations reject malformed engine references', () => {
  const cases = [
    ['missing group', (motion) => { motion.group = ''; }, /requires a motion group/],
    ['negative index', (motion) => { motion.index = -1; }, /non-negative integer index/],
    ['fractional index', (motion) => { motion.index = 0.5; }, /non-negative integer index/],
    ['missing loop policy', (motion) => { delete motion.loop; }, /boolean loop policy/],
  ];
  for (const [, mutate, expected] of cases) {
    const profile = structuredClone(SHIZUKU_PROFILE);
    mutate(profile.nativeMotions.idle);
    const report = validateProfile(profile);
    assert.equal(report.valid, false);
    assert.ok(report.errors.some((error) => expected.test(error)));
  }
});

test('capability declarations must match the profile-owned expression catalog', () => {
  const profile = structuredClone(SHIZUKU_PROFILE);
  profile.capabilities.expressions = ['neutral', 'joy'];
  const report = validateProfile(profile);
  assert.equal(report.valid, false);
  assert.match(report.errors.at(-1), /declares missing catalog entry: joy/);
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

test('parameter idle yields to native motion and expression-owned parameters', () => {
  assert.equal(shouldApplyParameterIdle(false, false), false);
  assert.equal(shouldApplyParameterIdle(true, true), false);
  assert.equal(shouldApplyParameterIdle(true, false), true);
});

test('an interrupted blink resets its state while restoring the expression aperture', () => {
  assert.deepEqual(resetBlinkState({ phase: 'closing', startTime: 42, preEyeL: 0.55, preEyeR: 0.6 }), {
    phase: 'idle', startTime: 0, preEyeL: 1, preEyeR: 1, restoreEyeL: 0.55, restoreEyeR: 0.6,
  });
});
