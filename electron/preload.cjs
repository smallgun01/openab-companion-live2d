const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jelliiDesktop', {
  openHistory: () => ipcRenderer.invoke('companion:open-history'),
  streamChat: async ({ requestId, text, endpoint, token, onDelta, onDone, onError }) => {
    const listener = (_event, message) => {
      if (message?.requestId !== requestId) return;
      if (message.type === 'delta') onDelta?.(message.delta);
      if (message.type === 'done') onDone?.();
    };
    ipcRenderer.on('companion:chat-event', listener);
    try {
      const result = await ipcRenderer.invoke('companion:stream-chat', { requestId, text, endpoint, token });
      if (!result?.ok) onError?.(result?.code || 0, result?.message || 'Network error');
    } finally {
      ipcRenderer.removeListener('companion:chat-event', listener);
    }
  },
});
