import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockSseServer } from '../scripts/mock-sse-server.mjs';

async function start(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
}

async function stop(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('mock server streams OpenAI-compatible SSE deltas', async () => {
  const { server, state } = createMockSseServer({ intervalMs: 1, chunks: ['one', ' two'] });
  const endpoint = await start(server);
  try {
    const response = await fetch(endpoint, { method: 'POST' });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /\"content\":\"one\"/);
    assert.match(text, /data: \[DONE\]/);
    assert.equal(state.requests, 1);
    assert.equal(state.completed, 1);
  } finally {
    await stop(server);
  }
});

test('mock server can deterministically return 429', async () => {
  const { server, state } = createMockSseServer({ mode: 'always-429' });
  const endpoint = await start(server);
  try {
    const response = await fetch(endpoint, { method: 'POST' });
    assert.equal(response.status, 429);
    assert.equal(state.requests, 1);
  } finally {
    await stop(server);
  }
});
