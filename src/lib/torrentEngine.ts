import WebTorrent from 'webtorrent'
import type { Instance, Torrent, TorrentFile } from 'webtorrent'
import type { GlobalStats, SpeedSample, TorrentStatus, TorrentView } from './types'
import { isMagnet, isProbablyInfoHash, toMagnetFromHash } from './format'

const HISTORY_LIMIT = 48

type Listener = () => void

function filePath(file: TorrentFile): string {
  return Array.isArray(file.path) ? file.path.join('/') : String(file.path ?? file.name)
}

function deriveStatus(torrent: Torrent, paused: boolean, error?: string): TorrentStatus {
  if (error) return 'error'
  if (paused) return 'paused'
  if (!torrent.ready && !torrent.metadata) return 'metadata'
  if (torrent.done) return torrent.numPeers > 0 ? 'seeding' : 'done'
  if (torrent.progress > 0 || torrent.downloadSpeed > 0) return 'downloading'
  return torrent.ready ? 'downloading' : 'metadata'
}

function piecesFromTorrent(torrent: Torrent): boolean[] {
  const bitfield = torrent.bitfield
  const count = torrent.pieces?.length ?? 0
  if (!bitfield || count === 0) return []
  const out: boolean[] = []
  for (let i = 0; i < count; i += 1) {
    out.push(Boolean(bitfield.get(i)))
  }
  return out
}

const EMPTY_STATS: GlobalStats = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  downloaded: 0,
  uploaded: 0,
  activeTorrents: 0,
  peers: 0,
  progress: 0,
}

export class TorrentEngine {
  private client: Instance
  private views = new Map<string, TorrentView>()
  private torrents = new Map<string, Torrent>()
  private paused = new Set<string>()
  private listeners = new Set<Listener>()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false
  private torrentSnapshot: TorrentView[] = []
  private statsSnapshot: GlobalStats = EMPTY_STATS

  constructor() {
    this.client = new WebTorrent({
      // Browser WebRTC-first client; public free trackers help discovery.
      utp: false,
    })

    this.client.on('error', (err: unknown) => {
      console.error('[CURRENT] client error', err)
    })

    this.tickTimer = setInterval(() => this.tick(), 500)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.torrentSnapshot = [...this.views.values()].sort((a, b) => b.addedAt - a.addedAt)
    const list = this.torrentSnapshot
    const downloadSpeed = list.reduce((sum, t) => sum + t.downloadSpeed, 0)
    const uploadSpeed = list.reduce((sum, t) => sum + t.uploadSpeed, 0)
    const downloaded = list.reduce((sum, t) => sum + t.downloaded, 0)
    const uploaded = list.reduce((sum, t) => sum + t.uploaded, 0)
    const peers = list.reduce((sum, t) => sum + t.numPeers, 0)
    const length = list.reduce((sum, t) => sum + (t.length || 0), 0)
    this.statsSnapshot = {
      downloadSpeed,
      uploadSpeed,
      downloaded,
      uploaded,
      activeTorrents: list.filter((t) => t.status === 'downloading' || t.status === 'seeding').length,
      peers,
      progress: length > 0 ? downloaded / length : 0,
    }

    for (const listener of this.listeners) listener()
  }

  getTorrents(): TorrentView[] {
    return this.torrentSnapshot
  }

  getStats(): GlobalStats {
    return this.statsSnapshot
  }

  private upsertView(torrent: Torrent, patch: Partial<TorrentView> = {}) {
    const id = torrent.infoHash || patch.id || crypto.randomUUID()
    const prev = this.views.get(id)
    const history = prev?.speedHistory ? [...prev.speedHistory] : []
    const sample: SpeedSample = {
      t: Date.now(),
      down: torrent.downloadSpeed || 0,
      up: torrent.uploadSpeed || 0,
    }
    history.push(sample)
    while (history.length > HISTORY_LIMIT) history.shift()

    const files = (torrent.files ?? []).map((file) => ({
      name: file.name,
      path: filePath(file),
      length: file.length,
      downloaded: file.downloaded,
      progress: file.progress,
    }))

    const view: TorrentView = {
      infoHash: torrent.infoHash || prev?.infoHash || '',
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
      timeRemaining: torrent.timeRemaining || Infinity,
      magnetURI: torrent.magnetURI || prev?.magnetURI || '',
      files,
      pieces: piecesFromTorrent(torrent),
      error: patch.error ?? prev?.error,
      addedAt: prev?.addedAt ?? Date.now(),
      speedHistory: history,
      ...patch,
      id,
    }

    this.views.set(id, view)
    this.torrents.set(id, torrent)
    this.emit()
  }

  private bindTorrent(torrent: Torrent) {
    const refresh = () => this.upsertView(torrent)
    torrent.on('infoHash', refresh)
    torrent.on('metadata', refresh)
    torrent.on('ready', refresh)
    torrent.on('download', refresh)
    torrent.on('upload', refresh)
    torrent.on('wire', refresh)
    torrent.on('done', refresh)
    torrent.on('noPeers', refresh)
    torrent.on('warning', (err: unknown) => {
      console.warn('[CURRENT] torrent warning', err)
    })
    torrent.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.upsertView(torrent, { error: message, status: 'error' })
    })
    refresh()
  }

  private normalizeInput(input: string | File | ArrayBuffer | Uint8Array): string | Uint8Array | File {
    if (typeof input === 'string') {
      const trimmed = input.trim()
      if (isMagnet(trimmed)) return trimmed
      if (isProbablyInfoHash(trimmed)) return toMagnetFromHash(trimmed)
      throw new Error('Paste a magnet link or 40-char info hash.')
    }
    if (input instanceof ArrayBuffer) return new Uint8Array(input)
    return input
  }

  async add(input: string | File | ArrayBuffer | Uint8Array): Promise<string> {
    const normalized = this.normalizeInput(input)
    const placeholderId = crypto.randomUUID()

    this.views.set(placeholderId, {
      id: placeholderId,
      infoHash: '',
      name: typeof input === 'string' ? 'Connecting to swarm…' : input instanceof File ? input.name : 'Parsing torrent…',
      status: 'parsing',
      progress: 0,
      downloaded: 0,
      uploaded: 0,
      length: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      numPeers: 0,
      ratio: 0,
      timeRemaining: Infinity,
      magnetURI: typeof input === 'string' ? String(normalized) : '',
      files: [],
      pieces: [],
      addedAt: Date.now(),
      speedHistory: [],
    })
    this.emit()

    return new Promise((resolve, reject) => {
      let settled = false
      try {
        const torrent = this.client.add(normalized as string | File | Uint8Array, {
          announce: [
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.btorrent.xyz',
            'wss://tracker.webtorrent.dev',
          ],
        })

        const promote = () => {
          if (this.views.has(placeholderId) && torrent.infoHash) {
            const old = this.views.get(placeholderId)!
            this.views.delete(placeholderId)
            this.views.set(torrent.infoHash, { ...old, id: torrent.infoHash, infoHash: torrent.infoHash })
            this.torrents.delete(placeholderId)
            this.torrents.set(torrent.infoHash, torrent)
            if (this.paused.has(placeholderId)) {
              this.paused.delete(placeholderId)
              this.paused.add(torrent.infoHash)
            }
          }
        }

        const finish = () => {
          if (settled) return
          settled = true
          promote()
          this.bindTorrent(torrent)
          resolve(torrent.infoHash)
        }

        torrent.once('error', (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          const view = this.views.get(placeholderId) ?? this.views.get(torrent.infoHash)
          if (view) {
            this.views.set(view.id, { ...view, status: 'error', error: message })
            this.emit()
          }
          if (!settled) {
            settled = true
            reject(err instanceof Error ? err : new Error(message))
          }
        })

        if (torrent.infoHash) finish()
        else torrent.once('infoHash', finish)
      } catch (err) {
        this.views.delete(placeholderId)
        this.emit()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  pause(id: string) {
    const torrent = this.torrents.get(id)
    if (!torrent) return
    this.paused.add(id)
    torrent.pause()
    for (const wire of torrent.wires) wire.choke()
    this.upsertView(torrent)
  }

  resume(id: string) {
    const torrent = this.torrents.get(id)
    if (!torrent) return
    this.paused.delete(id)
    torrent.resume()
    for (const wire of torrent.wires) wire.unchoke()
    this.upsertView(torrent)
  }

  remove(id: string) {
    const torrent = this.torrents.get(id)
    this.paused.delete(id)
    this.views.delete(id)
    this.torrents.delete(id)
    if (torrent) {
      torrent.destroy({ destroyStore: true })
    }
    this.emit()
  }

  getNativeTorrent(id: string): Torrent | undefined {
    return this.torrents.get(id)
  }

  getFile(id: string, path: string): TorrentFile | undefined {
    const torrent = this.torrents.get(id)
    return torrent?.files.find((file) => filePath(file) === path)
  }

  async downloadFile(id: string, path: string): Promise<void> {
    const file = this.getFile(id, path)
    if (!file) throw new Error('File not found')

    const blob = await new Promise<Blob>((resolve, reject) => {
      file.getBlob((err, blob) => {
        if (err || !blob) reject(err ?? new Error('Could not build blob'))
        else resolve(blob)
      })
    })

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }

  streamTo(id: string, path: string, element: HTMLMediaElement): () => void {
    const file = this.getFile(id, path)
    if (!file) throw new Error('File not found')
    file.streamTo(element)
    return () => {
      element.removeAttribute('src')
      element.load()
    }
  }

  private tick() {
    if (this.destroyed) return
    if (this.torrents.size === 0) return
    for (const [id, torrent] of this.torrents) {
      if (!this.views.has(id)) continue
      this.upsertView(torrent)
    }
  }

  destroy() {
    this.destroyed = true
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.client.destroy()
    this.views.clear()
    this.torrents.clear()
    this.listeners.clear()
    this.torrentSnapshot = []
    this.statsSnapshot = EMPTY_STATS
  }
}

let engine: TorrentEngine | null = null

export function getTorrentEngine(): TorrentEngine {
  if (!engine) engine = new TorrentEngine()
  return engine
}
