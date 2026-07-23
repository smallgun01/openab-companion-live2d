import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseDataLine } from '../js/chat.js';

test('parses an OpenAI streaming content delta', () => {
  assert.equal(parseSseDataLine('data: {"choices":[{"delta":{"content":"hello"}}]}'), 'hello');
});

test('ignores malformed and non-content SSE data', () => {
  assert.equal(parseSseDataLine('data: {not json}'), '');
  assert.equal(parseSseDataLine('event: done'), '');
  assert.equal(parseSseDataLine('data: [DONE]'), '');
});
