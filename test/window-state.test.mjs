import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { normalizeBounds, readWindowState, writeWindowState } = require('../electron/window-state.cjs');

const fallback = { x: 100, y: 100, width: 420, height: 720 };
const displays = [
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 1920, y: 0, width: 1920, height: 1080 },
];

test('keeps a saved window position on an attached display', () => {
  assert.deepEqual(normalizeBounds({ x: 2200, y: 100, width: 600, height: 700 }, fallback, displays, { width: 420, height: 540 }), {
    x: 2200, y: 100, width: 600, height: 700,
  });
});

test('recovers an off-screen window onto the primary display', () => {
  assert.deepEqual(normalizeBounds({ x: 5000, y: 1200, width: 420, height: 720 }, fallback, displays, { width: 420, height: 540 }), {
    x: 1500, y: 360, width: 420, height: 720,
  });
});

test('falls back when saved state is malformed', () => {
  assert.deepEqual(normalizeBounds({ x: 'bad' }, fallback, displays), fallback);
});

test('round-trips saved window state through the atomic state file', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellii-window-state-'));
  const filePath = path.join(directory, 'pet-window-state.json');
  const bounds = { x: 320, y: 180, width: 640, height: 720 };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  writeWindowState(filePath, bounds);

  assert.deepEqual(readWindowState(filePath), bounds);
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
  assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
});
