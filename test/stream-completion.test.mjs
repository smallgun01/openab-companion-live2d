import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadPreload({ result, events = [] }) {
  let exposed;
  let listener;
  const ipcRenderer = {
    invoke: async () => {
      for (const event of events) listener?.(null, event);
      return result;
    },
    on: (_channel, callback) => { listener = callback; },
    removeListener: () => { listener = null; },
  };
  const source = fs.readFileSync(path.resolve('electron/preload.cjs'), 'utf8');
  vm.runInNewContext(source, {
    require: (name) => {
      assert.equal(name, 'electron');
      return { contextBridge: { exposeInMainWorld: (_name, value) => { exposed = value; } }, ipcRenderer };
    },
  });
  return exposed;
}

test('sandboxed preload supplies accumulated text when no IPC delta arrived', async () => {
  const desktop = loadPreload({ result: { ok: true, fullText: '完整回覆' } });
  const deltas = [];
  let done = 0;
  await desktop.streamChat({ requestId: 'r1', text: 'hi', endpoint: 'https://example.test', onDelta: (text) => deltas.push(text), onDone: () => { done += 1; } });
  assert.deepEqual(deltas, ['完整回覆']);
  assert.equal(done, 1);
});

test('sandboxed preload does not duplicate delivered IPC text or completion', async () => {
  const desktop = loadPreload({
    result: { ok: true, fullText: '完整回覆' },
    events: [{ requestId: 'r2', type: 'delta', delta: '完整回覆' }, { requestId: 'r2', type: 'done' }],
  });
  const deltas = [];
  let done = 0;
  await desktop.streamChat({ requestId: 'r2', text: 'hi', endpoint: 'https://example.test', onDelta: (text) => deltas.push(text), onDone: () => { done += 1; } });
  assert.deepEqual(deltas, ['完整回覆']);
  assert.equal(done, 1);
});
