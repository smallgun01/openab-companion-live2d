import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  DEFAULT_PROFILE_ID,
  getActiveProfile,
  resolveSupportedExpression,
  setActiveProfile,
} from '../js/live2d-profile.js';

const require = createRequire(import.meta.url);
const { getRequestedProfileId } = require('../electron/profile-selection.cjs');

test.afterEach(() => setActiveProfile(DEFAULT_PROFILE_ID));

test('development profile selection completes the JellyFish Girl → Shizuku → JellyFish Girl gate', () => {
  const profileId = getRequestedProfileId(['electron', 'main.cjs', '--profile=shizuku-v1']);
  assert.equal(profileId, 'shizuku-v1');
  assert.equal(setActiveProfile(profileId).id, 'shizuku-v1');
  assert.equal(getActiveProfile().id, 'shizuku-v1');
  assert.equal(resolveSupportedExpression('joy'), 'neutral');

  setActiveProfile(DEFAULT_PROFILE_ID);
  assert.equal(getActiveProfile().id, DEFAULT_PROFILE_ID);
  assert.equal(resolveSupportedExpression('joy'), 'joy');
});

test('an unknown profile cannot silently select a body during a switch', () => {
  setActiveProfile('shizuku-v1');
  assert.throws(() => setActiveProfile('unknown-v1'), /Unknown Live2D profile/);
  assert.equal(getActiveProfile().id, 'shizuku-v1');
});
