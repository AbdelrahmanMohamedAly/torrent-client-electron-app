const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const HISTORY_LIMIT = 48

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'http://bttracker.debian.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
]

function isMagnet(input) {
  return /^magnet:\?/i.test(String(input).trim())
}

function isProbablyInfoHash(input) {
  const value = String(input).trim()
  return /^[a-fA-F0-9]{40}$/.test(value) || /^[a-zA-Z2-7]{32}$/.test(value)
}

function toMagnetFromHash(hash) {
  const infoHash = String(hash).trim().toLowerCase()
  return `magnet:?xt=urn:btih:${infoHash}${DEFAULT_TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('')}`
}

function filePathOf(file) {
  return Array.isArray(file.path) ? file.path.join('/') : String(file.path ?? file.name)
}

function deriveStatus(torrent, paused, error) {
  if (error) return 'error'
  if (paused) return 'paused'
  // Magnet without metadata yet
  if (!torrent.metadata && !(torrent.files && torrent.files.length)) return 'metadata'
  if (torrent.done) return torrent.numPeers > 0 ? 'seeding' : 'done'
  if (torrent.progress > 0 || torrent.downloadSpeed > 0) return 'downloading'
  if (torrent.ready) return 'downloading'
  return 'metadata'
}

function piecesFromTorrent(torrent) {
  const bitfield = torrent.bitfield
  const count = torrent.pieces?.length ?? 0
  if (!bitfield || count === 0) return []
  const out = []
  for (let i = 0; i < count; i += 1) out.push(Boolean(bitfield.get(i)))
  return out
}

function hashToString(hash) {
  if (!hash) return ''
  if (typeof hash === 'string') return hash.toLowerCase()
  try {
    return Buffer.from(hash).toString('hex')
  } catch {
    return String(hash)
  }
}

class TorrentService extends EventEmitter {
  constructor(downloadDir) {
    super()
    this.downloadDir = downloadDir
    this.client = null
    this.WebTorrent = null
    this.parseTorrent = null
    this.views = new Map()
    this.torrents = new Map()
    this.paused = new Set()
    this.torrentSnapshot = []
    this.statsSnapshot = {
      downloadSpeed: 0,
      uploadSpeed: 0,
      downloaded: 0,
      uploaded: 0,
      activeTorrents: 0,
      peers: 0,
      progress: 0,
    }
    this.tickTimer = null
    this.readyPromise = this.init()
  }

  async init() {
    fs.mkdirSync(this.downloadDir, { recursive: true })
    const [wt, pt] = await Promise.all([import('webtorrent'), import('parse-torrent')])
    this.WebTorrent = wt.default
    this.parseTorrent = pt.default
    this.client = new this.WebTorrent({
      dht: true,
      lsd: true,
      webSeeds: true,
      utp: true,
    })
    this.client.on('error', (err) => {
      console.error('[CURRENT] torrent client error', err)
    })
    this.tickTimer = setInterval(() => this.tick(), 500)
    this.emitState()
  }

  async ensureReady() {
    await this.readyPromise
  }

  getState() {
    return {
      torrents: this.torrentSnapshot,
      stats: this.statsSnapshot,
      downloadDir: this.downloadDir,
      mode: 'node',
    }
  }

  emitState() {
    this.torrentSnapshot = [...this.views.values()].sort((a, b) => b.addedAt - a.addedAt)
    const list = this.torrentSnapshot
    const downloadSpeed = list.reduce((s, t) => s + t.downloadSpeed, 0)
    const uploadSpeed = list.reduce((s, t) => s + t.uploadSpeed, 0)
    const downloaded = list.reduce((s, t) => s + t.downloaded, 0)
    const uploaded = list.reduce((s, t) => s + t.uploaded, 0)
    const peers = list.reduce((s, t) => s + t.numPeers, 0)
    const length = list.reduce((s, t) => s + (t.length || 0), 0)
    this.statsSnapshot = {
      downloadSpeed,
      uploadSpeed,
      downloaded,
      uploaded,
      activeTorrents: list.filter((t) => t.status === 'downloading' || t.status === 'seeding').length,
      peers,
      progress: length > 0 ? downloaded / length : 0,
    }
    this.emit('update', this.getState())
  }

  upsertView(torrent, patch = {}) {
    const id = hashToString(torrent.infoHash) || patch.id
    if (!id) return
    const prev = this.views.get(id)
    const history = prev?.speedHistory ? [...prev.speedHistory] : []
    history.push({
      t: Date.now(),
      down: torrent.downloadSpeed || 0,
      up: torrent.uploadSpeed || 0,
    })
    while (history.length > HISTORY_LIMIT) history.shift()

    const files = (torrent.files || []).map((file) => ({
      name: file.name,
      path: filePathOf(file),
      length: file.length,
      downloaded: file.downloaded,
      progress: file.progress,
      fullPath: path.join(this.downloadDir, filePathOf(file)),
    }))

    const view = {
      infoHash: hashToString(torrent.infoHash) || prev?.infoHash || '',
      name: torrent.name || prev?.name || 'Resolving metadata…',
      status: deriveStatus(torrent, this.paused.has(id), patch.error ?? prev?.error),
      progress: torrent.progress || 0,
      downloaded: torrent.downloaded || 0,
      uploaded: torrent.uploaded || 0,
      length: torrent.length || prev?.length || 0,
      downloadSpeed: this.paused.has(id) ? 0 : torrent.downloadSpeed || 0,
      uploadSpeed: this.paused.has(id) ? 0 : torrent.uploadSpeed || 0,
      numPeers: torrent.numPeers || 0,
      ratio: torrent.downloaded > 0 ? torrent.uploaded / torrent.downloaded : 0,
      timeRemaining: Number.isFinite(torrent.timeRemaining) ? torrent.timeRemaining : Infinity,
      magnetURI: torrent.magnetURI || prev?.magnetURI || '',
      files,
      pieces: piecesFromTorrent(torrent),
      error: patch.error ?? prev?.error,
      addedAt: prev?.addedAt ?? Date.now(),
      speedHistory: history,
      savePath: this.downloadDir,
      ...patch,
      id,
    }

    this.views.set(id, view)
    this.torrents.set(id, torrent)
    this.emitState()
  }

  bindTorrent(torrent) {
    const refresh = () => this.upsertView(torrent)
    torrent.on('infoHash', refresh)
    torrent.on('metadata', refresh)
    torrent.on('ready', refresh)
    torrent.on('download', refresh)
    torrent.on('upload', refresh)
    torrent.on('wire', refresh)
    torrent.on('done', refresh)
    torrent.on('noPeers', refresh)
    torrent.on('warning', (err) => console.warn('[CURRENT] warning', err))
    torrent.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      this.upsertView(torrent, { error: message, status: 'error' })
    })
    refresh()
  }

  toBuffer(data) {
    if (Buffer.isBuffer(data)) return data
    if (data instanceof ArrayBuffer) return Buffer.from(data)
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    }
    if (Array.isArray(data)) return Buffer.from(data)
    if (data && typeof data === 'object' && typeof data.length === 'number') {
      return Buffer.from(Uint8Array.from(data))
    }
    if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
      return Buffer.from(data.data)
    }
    throw new Error('Invalid torrent file bytes')
  }

  normalizeRawInput(input) {
    if (typeof input === 'string') {
      const trimmed = input.trim()
      if (isMagnet(trimmed)) {
        // Force lowercase info hash — some magnets break discovery when uppercase.
        return trimmed.replace(/urn:btih:([a-fA-F0-9]{40})/i, (_, h) => `urn:btih:${h.toLowerCase()}`)
      }
      if (isProbablyInfoHash(trimmed)) return toMagnetFromHash(trimmed)
      // Allow http(s) links to .torrent files (Node WebTorrent supports this).
      if (/^https?:\/\//i.test(trimmed)) return trimmed
      throw new Error('Paste a magnet link, info hash, or http(s) .torrent URL.')
    }
    if (input && typeof input === 'object' && input.data != null) {
      const buf = this.toBuffer(input.data)
      if (!buf.length) throw new Error('Torrent file was empty')
      return buf
    }
    if (Buffer.isBuffer(input) || ArrayBuffer.isView(input) || input instanceof ArrayBuffer) {
      const buf = this.toBuffer(input)
      if (!buf.length) throw new Error('Torrent file was empty')
      return buf
    }
    throw new Error('Unsupported torrent input')
  }

  /**
   * Pre-parse + normalize so WebTorrent gets a clean parsed torrent object.
   * WebTorrent 3 / parse-torrent expect infoHash as a lowercase hex STRING.
   */
  async prepareParsed(input) {
    const raw = this.normalizeRawInput(input)
    let parsed
    try {
      parsed = await this.parseTorrent(raw)
    } catch (err) {
      throw new Error(`Could not parse torrent: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!parsed?.infoHash) throw new Error('Could not parse torrent (no info hash)')

    // Keep infoHash as lowercase string (required by parse-torrent + WebTorrent 3).
    if (typeof parsed.infoHash !== 'string') {
      parsed.infoHash = hashToString(parsed.infoHash)
    } else {
      parsed.infoHash = parsed.infoHash.toLowerCase()
    }

    if (!parsed.infoHashBuffer && parsed.infoHash.length === 40) {
      parsed.infoHashBuffer = new Uint8Array(Buffer.from(parsed.infoHash, 'hex'))
    }

    parsed.announce = Array.from(new Set([...(parsed.announce || []), ...DEFAULT_TRACKERS]))
    if (!parsed.urlList) parsed.urlList = []

    return parsed
  }

  async add(input) {
    await this.ensureReady()
    const parsed = await this.prepareParsed(input)
    const infoHashHex = hashToString(parsed.infoHash)
    if (!infoHashHex) throw new Error('Torrent has no info hash')

    // Already added?
    if (this.torrents.has(infoHashHex)) {
      return infoHashHex
    }

    const placeholderId = infoHashHex
    const displayName =
      parsed.name ||
      (typeof input === 'string' ? 'Connecting to swarm…' : input?.name) ||
      'Parsing torrent…'

    this.views.set(placeholderId, {
      id: placeholderId,
      infoHash: infoHashHex,
      name: displayName,
      status: parsed.info ? 'downloading' : 'metadata',
      progress: 0,
      downloaded: 0,
      uploaded: 0,
      length: parsed.length || 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      ratio: 0,
      timeRemaining: Infinity,
      magnetURI: typeof input === 'string' && isMagnet(input) ? input.trim() : '',
      files: [],
      pieces: [],
      addedAt: Date.now(),
      speedHistory: [],
      savePath: this.downloadDir,
    })
    this.emitState()

    return new Promise((resolve, reject) => {
      let settled = false
      try {
        const torrent = this.client.add(parsed, {
          path: this.downloadDir,
          announce: parsed.announce,
        })

        const finish = () => {
          if (settled) return
          settled = true
          this.torrents.set(infoHashHex, torrent)
          this.bindTorrent(torrent)
          resolve(infoHashHex)
        }

        const fail = (err) => {
          const message = err instanceof Error ? err.message : String(err)
          const view = this.views.get(infoHashHex)
          if (view) {
            this.views.set(infoHashHex, { ...view, status: 'error', error: message })
            this.emitState()
          }
          if (!settled) {
            settled = true
            reject(new Error(message))
          }
        }

        torrent.once('error', fail)
        torrent.on('infoHash', finish)
        torrent.on('metadata', finish)
        torrent.on('ready', finish)
        queueMicrotask(() => {
          try {
            if (torrent.infoHash) finish()
          } catch (err) {
            fail(err)
          }
        })
      } catch (err) {
        this.views.delete(placeholderId)
        this.emitState()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  async pause(id) {
    await this.ensureReady()
    const torrent = this.torrents.get(id)
    if (!torrent) return
    this.paused.add(id)
    torrent.pause()
    this.upsertView(torrent)
  }

  async resume(id) {
    await this.ensureReady()
    const torrent = this.torrents.get(id)
    if (!torrent) return
    this.paused.delete(id)
    torrent.resume()
    this.upsertView(torrent)
  }

  async remove(id) {
    await this.ensureReady()
    const torrent = this.torrents.get(id)
    this.paused.delete(id)
    this.views.delete(id)
    this.torrents.delete(id)
    if (torrent) {
      await new Promise((resolve) => {
        torrent.destroy({ destroyStore: false }, () => resolve())
      })
    }
    this.emitState()
  }

  getFileFullPath(id, relativePath) {
    const view = this.views.get(id)
    const file = view?.files?.find((f) => f.path === relativePath)
    return file?.fullPath || null
  }

  tick() {
    if (!this.client || this.torrents.size === 0) return
    for (const [id, torrent] of this.torrents) {
      if (!this.views.has(id)) continue
      this.upsertView(torrent)
    }
  }

  destroy() {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.client) this.client.destroy()
  }
}

module.exports = { TorrentService }
