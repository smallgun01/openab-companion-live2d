import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getRequestedProfileId } = require('../electron/profile-selection.cjs');

test('reads an Electron profile from either supported command-line form', () => {
  assert.equal(getRequestedProfileId(['electron', 'main.cjs']), null);
  assert.equal(getRequestedProfileId(['electron', 'main.cjs', '--profile=shizuku-v1']), 'shizuku-v1');
  assert.equal(getRequestedProfileId(['electron', 'main.cjs', '--profile', 'jellyfish-girl-v1']), 'jellyfish-girl-v1');
  assert.equal(getRequestedProfileId(['electron', 'main.cjs', '--profile=   ']), null);
});
