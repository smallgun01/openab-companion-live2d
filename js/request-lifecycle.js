export function createRequestGate() {
  // Renderer ownership: invalidate stale callbacks after cancel/retry. The
  // Electron main process separately owns the network AbortController.
  let generation = 0;
  return {
    start() { generation += 1; return generation; },
    isCurrent(token) { return token === generation; },
    invalidate() { generation += 1; },
  };
}
