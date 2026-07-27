const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  mode: 'node',

  getState: () => ipcRenderer.invoke('torrents:get-state'),
  add: (payload) => ipcRenderer.invoke('torrents:add', payload),
  pause: (id) => ipcRenderer.invoke('torrents:pause', id),
  resume: (id) => ipcRenderer.invoke('torrents:resume', id),
  remove: (id) => ipcRenderer.invoke('torrents:remove', id),
  openFile: (id, relativePath) => ipcRenderer.invoke('torrents:open-file', id, relativePath),
  openDownloads: () => ipcRenderer.invoke('torrents:open-downloads'),
  openTorrentFile: () => ipcRenderer.invoke('dialog:open-torrent'),
  openAndAddTorrentFile: () => ipcRenderer.invoke('dialog:open-and-add-torrent'),

  onUpdate: (handler) => {
    const listener = (_event, state) => handler(state)
    ipcRenderer.on('torrents:update', listener)
    return () => ipcRenderer.removeListener('torrents:update', listener)
  },

  onMenu: (channel, handler) => {
    const listener = () => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
