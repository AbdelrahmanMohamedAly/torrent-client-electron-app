export type TorrentStatus =
  | 'parsing'
  | 'metadata'
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'done'
  | 'error'

export interface TorrentFileView {
  name: string
  path: string
  length: number
  downloaded: number
  progress: number
  fullPath?: string
}

export interface SpeedSample {
  t: number
  down: number
  up: number
}

export interface TorrentView {
  id: string
  infoHash: string
  name: string
  status: TorrentStatus
  progress: number
  downloaded: number
  uploaded: number
  length: number
  downloadSpeed: number
  uploadSpeed: number
  numPeers: number
  ratio: number
  timeRemaining: number
  magnetURI: string
  files: TorrentFileView[]
  pieces: boolean[]
  error?: string
  addedAt: number
  speedHistory: SpeedSample[]
  savePath?: string
}

export interface GlobalStats {
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  activeTorrents: number
  peers: number
  progress: number
}

export interface EngineState {
  torrents: TorrentView[]
  stats: GlobalStats
  downloadDir?: string
  mode: 'node' | 'browser'
}
