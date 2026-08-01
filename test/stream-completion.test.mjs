import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reconcileStreamCompletion } = require('../electron/stream-completion.cjs');

test('completion fallback supplies accumulated text only when no delta arrived', () => {
  assert.deepEqual(reconcileStreamCompletion({ receivedDelta: false, receivedDone: false, fullText: '完整回覆' }), {
    fallbackText: '完整回覆', shouldComplete: true,
  });
  assert.deepEqual(reconcileStreamCompletion({ receivedDelta: true, receivedDone: true, fullText: '完整回覆' }), {
    fallbackText: null, shouldComplete: false,
  });
});
