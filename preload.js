const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  pickImageData: () => ipcRenderer.invoke('pick-image-data'),
  fetchJson: (url) => ipcRenderer.invoke('fetch-json', url),
  ytSearch: (q) => ipcRenderer.invoke('yt-search', q),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
