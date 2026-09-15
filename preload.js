const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  log: (entry) => ipcRenderer.send('desktop-log', entry),
  // Per-launch secret the frontend trades for a session token (utils/desktop.ts).
  // Null outside desktop mode, which leaves the ordinary login flow in place.
  desktopSecret: ipcRenderer.sendSync('desktop-session-secret') || undefined,
});
