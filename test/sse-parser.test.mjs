import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseDataLine } from '../js/chat.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSseFieldLine, isStreamDone } = require('../electron/sse.cjs');

test('parses an OpenAI streaming content delta', () => {
  assert.equal(parseSseDataLine('data: {"choices":[{"delta":{"content":"hello"}}]}'), 'hello');
});

test('ignores malformed and non-content SSE data', () => {
  assert.equal(parseSseDataLine('data: {not json}'), '');
  assert.equal(parseSseDataLine('event: done'), '');
  assert.equal(parseSseDataLine('data: [DONE]'), '');
});

test('browser and Electron accept the same done event semantics', () => {
  const done = parseSseFieldLine('EvEnT: DONE');
  assert.deepEqual(done, { field: 'event', value: 'DONE' });
  assert.equal(isStreamDone(done), true);
  assert.equal(isStreamDone(parseSseFieldLine('data: [DONE]')), true);
});
