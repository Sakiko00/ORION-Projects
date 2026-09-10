const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => '1.0.0',
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onStatus: (callback) => {
    ipcRenderer.on('status-update', (_event, data) => callback(data));
  },
});
