/// <reference types="vite/client" />

import type { EngineState } from './lib/types'

declare global {
  interface DesktopApi {
    isDesktop: true
    mode: 'node'
    getState: () => Promise<EngineState>
    add: (payload: string | { name?: string; data: number[] | Uint8Array }) => Promise<string>
    pause: (id: string) => Promise<void>
    resume: (id: string) => Promise<void>
    remove: (id: string) => Promise<void>
    openFile: (id: string, relativePath: string) => Promise<boolean>
    openDownloads: () => Promise<string>
    openTorrentFile: () => Promise<{ name: string; data: number[] } | null>
    openAndAddTorrentFile: () => Promise<string | null>
    onUpdate: (handler: (state: EngineState) => void) => () => void
    onMenu: (channel: string, handler: () => void) => () => void
  }

  interface Window {
    desktop?: DesktopApi
  }
}

export {}
