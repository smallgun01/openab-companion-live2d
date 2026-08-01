const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preloads may only require Electron's exposed APIs; keep
// this tiny completion decision local rather than importing a sibling module.
function reconcileStreamCompletion({ receivedDelta, receivedDone, fullText }) {
  return {
    fallbackText: !receivedDelta && typeof fullText === 'string' && fullText ? fullText : null,
    shouldComplete: !receivedDone,
  };
}
contextBridge.exposeInMainWorld('jelliiDesktop', {
  openHistory: () => ipcRenderer.invoke('companion:open-history'),
  hidePet: () => ipcRenderer.invoke('companion:hide-pet'),
  cancelChat: (requestId) => ipcRenderer.invoke('companion:cancel-chat', requestId),
  streamChat: async ({ requestId, text, endpoint, token, onDelta, onDone, onError }) => {
    let receivedDelta = false;
    let receivedDone = false;
    const listener = (_event, message) => {
      if (message?.requestId !== requestId) return;
      if (message.type === 'delta') {
        receivedDelta = true;
        onDelta?.(message.delta);
      }
      if (message.type === 'done') {
        receivedDone = true;
        onDone?.();
      }
    };
    ipcRenderer.on('companion:chat-event', listener);
    try {
      const result = await ipcRenderer.invoke('companion:stream-chat', { requestId, text, endpoint, token });
      if (!result?.ok) {
        onError?.(result?.code || 0, result?.message || 'Network error');
      } else {
        // IPC is the low-latency path.  The completed native request is a
        // reliable fallback: if Electron drops a renderer event, render the
        // accumulated text before completing instead of leaving a blank pet.
        const completion = reconcileStreamCompletion({ receivedDelta, receivedDone, fullText: result.fullText });
        if (completion.fallbackText) onDelta?.(completion.fallbackText);
        if (completion.shouldComplete) onDone?.();
      }
    } finally {
      ipcRenderer.removeListener('companion:chat-event', listener);
    }
  },
});
