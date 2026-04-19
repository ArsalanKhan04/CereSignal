const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  log: (entry) => ipcRenderer.send('desktop-log', entry),
});
