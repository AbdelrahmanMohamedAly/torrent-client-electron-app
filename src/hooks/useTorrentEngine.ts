import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { getTorrentEngine } from '../lib/torrentEngine'
import type { EngineState, GlobalStats, TorrentView } from '../lib/types'

const EMPTY_TORRENTS: TorrentView[] = []
const EMPTY_STATS: GlobalStats = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  downloaded: 0,
  uploaded: 0,
  activeTorrents: 0,
  peers: 0,
  progress: 0,
}

type AddInput =
  | string
  | File
  | Uint8Array
  | number[]
  | { name?: string; data: Uint8Array | number[] }

export function useTorrentEngine() {
  const isDesktop = Boolean(typeof window !== 'undefined' && window.desktop?.isDesktop)
  const browserEngine = useMemo(() => (isDesktop ? null : getTorrentEngine()), [isDesktop])

  const [desktopState, setDesktopState] = useState<EngineState>({
    torrents: EMPTY_TORRENTS,
    stats: EMPTY_STATS,
    mode: 'node',
  })

  useEffect(() => {
    if (!isDesktop || !window.desktop) return
    let alive = true

    window.desktop.getState().then((next) => {
      if (alive) setDesktopState(next)
    })

    const off = window.desktop.onUpdate((next) => {
      if (alive) setDesktopState(next)
    })

    return () => {
      alive = false
      off()
    }
  }, [isDesktop])

  const browserTorrents = useSyncExternalStore(
    (onStoreChange) => browserEngine?.subscribe(onStoreChange) ?? (() => {}),
    () => browserEngine?.getTorrents() ?? EMPTY_TORRENTS,
    () => EMPTY_TORRENTS,
  )

  const browserStats = useSyncExternalStore(
    (onStoreChange) => browserEngine?.subscribe(onStoreChange) ?? (() => {}),
    () => browserEngine?.getStats() ?? EMPTY_STATS,
    () => EMPTY_STATS,
  )

  const add = useCallback(
    async (input: AddInput) => {
      if (isDesktop && window.desktop) {
        if (typeof input === 'string') return window.desktop.add(input)
        if (input instanceof File) {
          const buf = new Uint8Array(await input.arrayBuffer())
          return window.desktop.add({ name: input.name, data: Array.from(buf) })
        }
        if (input instanceof Uint8Array) {
          return window.desktop.add({ data: Array.from(input) })
        }
        // Raw byte array from the file dialog
        if (Array.isArray(input)) {
          return window.desktop.add({ data: input })
        }
        if (input && typeof input === 'object' && Array.isArray(input.data)) {
          return window.desktop.add({
            name: input.name,
            data: input.data,
          })
        }
        if (input && typeof input === 'object' && input.data instanceof Uint8Array) {
          return window.desktop.add({
            name: input.name,
            data: Array.from(input.data),
          })
        }
        throw new Error('Unsupported torrent input')
      }
      if (!browserEngine) throw new Error('Engine not ready')
      if (typeof input === 'string' || input instanceof File || input instanceof Uint8Array) {
        return browserEngine.add(input)
      }
      if (Array.isArray(input)) {
        return browserEngine.add(Uint8Array.from(input))
      }
      if (input.data instanceof Uint8Array) {
        return browserEngine.add(input.data)
      }
      return browserEngine.add(Uint8Array.from(input.data))
    },
    [isDesktop, browserEngine],
  )

  const pause = useCallback(
    (id: string) => {
      if (isDesktop && window.desktop) return window.desktop.pause(id)
      browserEngine?.pause(id)
    },
    [isDesktop, browserEngine],
  )

  const resume = useCallback(
    (id: string) => {
      if (isDesktop && window.desktop) return window.desktop.resume(id)
      browserEngine?.resume(id)
    },
    [isDesktop, browserEngine],
  )

  const remove = useCallback(
    (id: string) => {
      if (isDesktop && window.desktop) return window.desktop.remove(id)
      browserEngine?.remove(id)
    },
    [isDesktop, browserEngine],
  )

  const downloadFile = useCallback(
    async (id: string, path: string) => {
      if (isDesktop && window.desktop) {
        await window.desktop.openFile(id, path)
        return
      }
      await browserEngine?.downloadFile(id, path)
    },
    [isDesktop, browserEngine],
  )

  const openDownloads = useCallback(async () => {
    if (isDesktop && window.desktop) return window.desktop.openDownloads()
    return undefined
  }, [isDesktop])

  // Keep a stable desktop flag for first paint of status bar.
  const modeRef = useRef(isDesktop ? 'node' : 'browser')

  return {
    ready: true,
    mode: modeRef.current as 'node' | 'browser',
    downloadDir: desktopState.downloadDir,
    torrents: isDesktop ? desktopState.torrents : browserTorrents,
    stats: isDesktop ? desktopState.stats : browserStats,
    add,
    pause,
    resume,
    remove,
    downloadFile,
    openDownloads,
  }
}
