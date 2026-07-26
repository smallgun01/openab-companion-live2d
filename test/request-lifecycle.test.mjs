import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from '../js/request-lifecycle.js';
import { retryExhaustedMessage } from '../js/retry-policy.js';

test('invalidates late callbacks after cancellation', () => {
  const gate = createRequestGate();
  const active = gate.start();
  assert.equal(gate.isCurrent(active), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(active), false);
});

test('invalidates the previous attempt when a retry starts', () => {
  const gate = createRequestGate();
  const firstAttempt = gate.start();
  const retryAttempt = gate.start();
  assert.equal(gate.isCurrent(firstAttempt), false);
  assert.equal(gate.isCurrent(retryAttempt), true);
});

test('reports an explicit terminal message after retries are exhausted', () => {
  assert.equal(retryExhaustedMessage(3), '⚠️ Server busy — retried 3 times and still failed. Please try again later.');
});
