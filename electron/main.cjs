const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { TorrentService } = require('./torrentService.cjs')

const isDev = !app.isPackaged
let mainWindow = null
let torrentService = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    title: 'CURRENT',
    backgroundColor: '#f0f0f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Torrent File…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:add-torrent-file'),
        },
        {
          label: 'Add Magnet Link…',
          accelerator: 'CmdOrCtrl+M',
          click: () => mainWindow?.webContents.send('menu:add-magnet'),
        },
        {
          label: 'Open Download Folder',
          click: () => shell.openPath(torrentService.downloadDir),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Pause', click: () => mainWindow?.webContents.send('menu:pause') },
        { label: 'Resume', click: () => mainWindow?.webContents.send('menu:resume') },
        {
          label: 'Delete',
          accelerator: 'Delete',
          click: () => mainWindow?.webContents.send('menu:remove'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CURRENT',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About CURRENT',
              message: 'CURRENT',
              detail:
                'Local desktop BitTorrent client for your PC.\nUses Node WebTorrent (real TCP/UDP peers).\n\nDownloads folder:\n' +
                torrentService.downloadDir,
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function wireTorrentIpc() {
  const push = (state) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('torrents:update', state)
  }

  torrentService.on('update', push)

  ipcMain.handle('torrents:get-state', async () => {
    await torrentService.ensureReady()
    return torrentService.getState()
  })

  ipcMain.handle('torrents:add', async (_event, payload) => {
    return torrentService.add(payload)
  })

  ipcMain.handle('torrents:pause', async (_event, id) => torrentService.pause(id))
  ipcMain.handle('torrents:resume', async (_event, id) => torrentService.resume(id))
  ipcMain.handle('torrents:remove', async (_event, id) => torrentService.remove(id))

  ipcMain.handle('torrents:open-file', async (_event, id, relativePath) => {
    const fullPath = torrentService.getFileFullPath(id, relativePath)
    if (!fullPath || !fs.existsSync(fullPath)) {
      throw new Error('File is not downloaded yet')
    }
    await shell.openPath(fullPath)
    return true
  })

  ipcMain.handle('torrents:open-downloads', async () => {
    await shell.openPath(torrentService.downloadDir)
    return torrentService.downloadDir
  })

  // Add torrent directly in main from a path — avoids IPC byte corruption.
  ipcMain.handle('dialog:open-and-add-torrent', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Torrent File',
      properties: ['openFile'],
      filters: [{ name: 'Torrent files', extensions: ['torrent'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const data = fs.readFileSync(filePath)
    const id = await torrentService.add({
      name: path.basename(filePath),
      data: Array.from(data),
    })
    return id
  })

  ipcMain.handle('dialog:open-torrent', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Torrent File',
      properties: ['openFile'],
      filters: [{ name: 'Torrent files', extensions: ['torrent'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const data = fs.readFileSync(filePath)
    return {
      name: path.basename(filePath),
      data: Array.from(data),
    }
  })
}

app.whenReady().then(() => {
  const downloadDir = path.join(app.getPath('downloads'), 'CURRENT')
  torrentService = new TorrentService(downloadDir)
  wireTorrentIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    torrentService?.destroy()
    app.quit()
  }
})
