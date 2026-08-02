import test from 'node:test';
import assert from 'node:assert/strict';
import { getSettings, isAllowedEndpoint, isLoopbackHostname, saveSettings } from '../js/settings.js';
import { clearRetryTimer } from '../js/retry-timer.js';

test('allows loopback IPv6 regardless of URL hostname bracket serialization', () => {
  assert.equal(isLoopbackHostname('::1'), true);
  assert.equal(isLoopbackHostname('[::1]'), true);
  assert.equal(isAllowedEndpoint('http://[::1]:8011'), true);
  assert.equal(isAllowedEndpoint('http://localhost:8011'), true);
  assert.equal(isAllowedEndpoint('http://example.test:8011'), false);
});

test('clears a scheduled retry and resets its state', () => {
  const timer = {};
  let cleared = null;
  assert.equal(clearRetryTimer(timer, (value) => { cleared = value; }), null);
  assert.equal(cleared, timer);
  assert.equal(clearRetryTimer(null, () => { throw new Error('must not clear null'); }), null);
});

test('persists the selected character but never the session token', () => {
  const store = new Map();
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  try {
    saveSettings({ profileId: 'shizuku-v1', token: 'must-not-persist' });
    assert.equal(getSettings().profileId, 'shizuku-v1');
    assert.equal(getSettings().token, '');
    assert.doesNotMatch(store.get('openab-settings'), /must-not-persist/);
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
