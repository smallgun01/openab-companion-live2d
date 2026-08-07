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

test('Shizuku profile exposes its candidate semantic catalog for visual calibration', () => {
  assert.deepEqual(validateProfile(SHIZUKU_PROFILE), { valid: true, errors: [] });
  assert.equal(setActiveProfile(SHIZUKU_PROFILE.id), SHIZUKU_PROFILE);
  assert.equal(getActiveExpressionProfile().baseline.PARAM_MOUTH_OPEN_Y, 0);
  assert.deepEqual({
    primaryRightArm: getActiveExpressionProfile().baseline.PARAM_ARM_R,
    leftArm: getActiveExpressionProfile().baseline.PARAM_ARM_02_L_01,
    forearm: getActiveExpressionProfile().baseline.PARAM_ARM_02_L_02,
    leftHand: getActiveExpressionProfile().baseline.PARAM_HAND_02_L,
    rightArm: getActiveExpressionProfile().baseline.PARAM_ARM_02_R_01,
    rightForearm: getActiveExpressionProfile().baseline.PARAM_ARM_02_R_02,
    rightHand: getActiveExpressionProfile().baseline.PARAM_HAND_02_R,
  }, {
    primaryRightArm: -1,
    leftArm: -0.25,
    forearm: -1,
    leftHand: -1,
    rightArm: -1,
    rightForearm: -1,
    rightHand: -1,
  });
  assert.deepEqual(SHIZUKU_PROFILE.capabilities.expressions, [
    'neutral', 'joy', 'sadness', 'anger', 'surprise', 'fear', 'disgust', 'smirk', 'thinking',
  ]);
  assert.equal(SHIZUKU_PROFILE.capabilities.motions, true);
  assert.equal(supportsCapability('motions'), true);
  assert.equal(SHIZUKU_PROFILE.capabilities.lipSync, false);
  assert.equal(SHIZUKU_PROFILE.idle.parameter, false);
  assert.deepEqual(SHIZUKU_PROFILE.idle.partOpacity, {
    PARTS_01_ARM_R_02: 1,
    PARTS_01_ARM_R_01: 0,
    PARTS_01_ARM_L_02: 1,
    PARTS_01_ARM_L_01: 0,
  });
  assert.deepEqual(SHIZUKU_PROFILE.engineOptions, {
    idleMotionGroup: '__companion_idle_disabled__', breathDepth: 0,
  });
  assert.deepEqual(SHIZUKU_PROFILE.nativeMotions.idle, {
    group: 'Idle', index: 0, loop: true, autoplay: false,
  });
  assert.equal(resolveSupportedExpression('joy'), 'joy');
  assert.equal(resolveSupportedExpression('neutral'), 'neutral');
  assert.equal(supportsCapability('lipSync'), false);
});

test('native motion declarations reject malformed engine references', () => {
  const cases = [
    ['missing group', (motion) => { motion.group = ''; }, /requires a motion group/],
    ['negative index', (motion) => { motion.index = -1; }, /non-negative integer index/],
    ['fractional index', (motion) => { motion.index = 0.5; }, /non-negative integer index/],
    ['missing loop policy', (motion) => { delete motion.loop; }, /boolean loop policy/],
    ['invalid autoplay policy', (motion) => { motion.autoplay = 'never'; }, /autoplay must be a boolean/],
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
  profile.capabilities.expressions = ['neutral', 'not-a-catalog-entry'];
  const report = validateProfile(profile);
  assert.equal(report.valid, false);
  assert.match(report.errors.at(-1), /declares missing catalog entry: not-a-catalog-entry/);
});

test('idle policy rejects a non-boolean parameter setting', () => {
  const profile = structuredClone(SHIZUKU_PROFILE);
  profile.idle.parameter = 'paused';
  const report = validateProfile(profile);
  assert.equal(report.valid, false);
  assert.match(report.errors.at(-1), /idle\.parameter must be a boolean/);
});

test('idle pose opacity declarations reject invalid part values', () => {
  const profile = structuredClone(SHIZUKU_PROFILE);
  profile.idle.partOpacity.PARTS_01_ARM_R_01 = 2;
  const report = validateProfile(profile);
  assert.equal(report.valid, false);
  assert.match(report.errors.at(-1), /idle\.partOpacity entries/);
});

test('engine idle options reject invalid values', () => {
  const invalidGroup = structuredClone(SHIZUKU_PROFILE);
  invalidGroup.engineOptions.idleMotionGroup = '';
  assert.match(validateProfile(invalidGroup).errors.at(-1), /idleMotionGroup must be a non-empty string/);

  const invalidBreath = structuredClone(SHIZUKU_PROFILE);
  invalidBreath.engineOptions.breathDepth = 1.5;
  assert.match(validateProfile(invalidBreath).errors.at(-1), /breathDepth must be a number from 0 to 1/);
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
