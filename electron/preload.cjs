const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jelliiDesktop', { openHistory: () => ipcRenderer.invoke('companion:open-history') });
