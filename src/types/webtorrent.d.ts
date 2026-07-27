declare module 'webtorrent' {
  type Handler = (...args: unknown[]) => void

  interface Emitter {
    on(event: string, handler: Handler): this
    once(event: string, handler: Handler): this
    off(event: string, handler: Handler): this
  }

  export interface TorrentFile extends Emitter {
    name: string
    path: string | string[]
    length: number
    downloaded: number
    progress: number
    select(): void
    deselect(): void
    getBlob(callback: (err: Error | string | undefined, blob?: Blob) => void): void
    streamTo(element: HTMLMediaElement): HTMLMediaElement
  }

  export interface Torrent extends Emitter {
    infoHash: string
    magnetURI: string
    name: string
    length: number
    downloaded: number
    uploaded: number
    downloadSpeed: number
    uploadSpeed: number
    progress: number
    numPeers: number
    timeRemaining: number
    done: boolean
    ready: boolean
    paused: boolean
    metadata: unknown
    files: TorrentFile[]
    pieces: Array<unknown | null>
    bitfield?: { get(index: number): boolean }
    wires: Array<{ choke(): void; unchoke(): void }>
    pause(): void
    resume(): void
    destroy(opts?: { destroyStore?: boolean }, cb?: (err?: Error | string) => void): void
  }

  export interface Instance extends Emitter {
    torrents: Torrent[]
    downloadSpeed: number
    uploadSpeed: number
    add(
      input: string | File | Blob | Uint8Array,
      opts?: { announce?: string[]; path?: string },
      cb?: (torrent: Torrent) => void,
    ): Torrent
    destroy(cb?: (err?: Error | string) => void): void
  }

  interface WebTorrentConstructor {
    new (opts?: {
      utp?: boolean
      tracker?: boolean | object
      dht?: boolean
      lsd?: boolean
      webSeeds?: boolean
    }): Instance
    (opts?: { utp?: boolean; tracker?: boolean | object }): Instance
    WEBRTC_SUPPORT: boolean
  }

  const WebTorrent: WebTorrentConstructor
  export default WebTorrent
}
