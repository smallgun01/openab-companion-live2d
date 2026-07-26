const fs = require('node:fs');
const path = require('node:path');

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeBounds(value, fallback, workAreas, minimumSize = fallback) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => isFiniteNumber(value[key]))) {
    return { ...fallback };
  }

  const saved = { x: value.x, y: value.y, width: value.width, height: value.height };
  const target = workAreas.find((area) => intersects(saved, area)) || workAreas[0];
  if (!target) return { ...fallback };

  const width = Math.max(minimumSize.width, Math.min(saved.width, target.width));
  const height = Math.max(minimumSize.height, Math.min(saved.height, target.height));
  return {
    width,
    height,
    x: clamp(saved.x, target.x, target.x + target.width - width),
    y: clamp(saved.y, target.y, target.y + target.height - height),
  };
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

function readWindowState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeWindowState(filePath, bounds) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(bounds)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

module.exports = { normalizeBounds, readWindowState, writeWindowState };
