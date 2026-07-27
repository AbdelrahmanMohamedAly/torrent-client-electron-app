import { useEffect, useMemo, useState } from 'react'
import { useTorrentEngine } from './hooks/useTorrentEngine'
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatRatio,
  formatSpeed,
  shortenHash,
} from './lib/format'
import type { TorrentStatus, TorrentView } from './lib/types'
import './App.css'

type FilterKey =
  | 'all'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'paused'
  | 'active'
  | 'inactive'
  | 'error'

type DetailTab = 'general' | 'content' | 'pieces'

const DEMO_MAGNET =
  'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F'

function statusLabel(status: TorrentStatus, torrent?: TorrentView): string {
  switch (status) {
    case 'parsing':
      return 'Checking'
    case 'metadata':
      return torrent && torrent.numPeers === 0
        ? 'Meta DL (0 peers)'
        : 'Meta DL'
    case 'downloading':
      return 'Downloading'
    case 'seeding':
      return 'Seeding'
    case 'paused':
      return 'Paused'
    case 'done':
      return 'Completed'
    case 'error':
      return 'Errored'
    default:
      return status
  }
}

function matchesFilter(torrent: TorrentView, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'downloading':
      return torrent.status === 'downloading' || torrent.status === 'metadata' || torrent.status === 'parsing'
    case 'seeding':
      return torrent.status === 'seeding'
    case 'completed':
      return torrent.status === 'done' || torrent.progress >= 1
    case 'paused':
      return torrent.status === 'paused'
    case 'active':
      return torrent.downloadSpeed > 0 || torrent.uploadSpeed > 0
    case 'inactive':
      return torrent.downloadSpeed === 0 && torrent.uploadSpeed === 0
    case 'error':
      return torrent.status === 'error'
    default:
      return true
  }
}

export default function App() {
  const { torrents, stats, add, pause, resume, remove, downloadFile, mode, downloadDir, openDownloads } =
    useTorrentEngine()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('general')
  const [magnetOpen, setMagnetOpen] = useState(false)
  const [magnetValue, setMagnetValue] = useState('')
  const [magnetError, setMagnetError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(
    () => torrents.filter((t) => matchesFilter(t, filter)),
    [torrents, filter],
  )

  const selected = torrents.find((t) => t.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && !torrents.some((t) => t.id === selectedId)) {
      setSelectedId(null)
    }
  }, [torrents, selectedId])

  const counts = useMemo(() => {
    const keys: FilterKey[] = [
      'all',
      'downloading',
      'seeding',
      'completed',
      'paused',
      'active',
      'inactive',
      'error',
    ]
    return Object.fromEntries(keys.map((key) => [key, torrents.filter((t) => matchesFilter(t, key)).length])) as Record<
      FilterKey,
      number
    >
  }, [torrents])

  const addMagnet = async (value: string) => {
    setBusy(true)
    setMagnetError(null)
    try {
      const id = await add(value.trim())
      setSelectedId(id)
      setMagnetOpen(false)
      setMagnetValue('')
    } catch (err) {
      setMagnetError(err instanceof Error ? err.message : 'Could not add magnet')
    } finally {
      setBusy(false)
    }
  }

  const addTorrentFile = async () => {
    setBusy(true)
    try {
      if (window.desktop?.openAndAddTorrentFile) {
        const id = await window.desktop.openAndAddTorrentFile()
        if (!id) return
        setSelectedId(id)
        return
      }
      if (window.desktop?.openTorrentFile) {
        const file = await window.desktop.openTorrentFile()
        if (!file) return
        const id = await add({ name: file.name, data: file.data })
        setSelectedId(id)
        return
      }

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.torrent,application/x-bittorrent'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        try {
          const id = await add(file)
          setSelectedId(id)
        } catch (err) {
          window.alert(err instanceof Error ? err.message : 'Could not add torrent')
        }
      }
      input.click()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not open torrent')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!window.desktop?.onMenu) return
    const offs = [
      window.desktop.onMenu('menu:add-torrent-file', () => void addTorrentFile()),
      window.desktop.onMenu('menu:add-magnet', () => setMagnetOpen(true)),
      window.desktop.onMenu('menu:pause', () => {
        if (selectedId) pause(selectedId)
      }),
      window.desktop.onMenu('menu:resume', () => {
        if (selectedId) resume(selectedId)
      }),
      window.desktop.onMenu('menu:remove', () => {
        if (selectedId) remove(selectedId)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [selectedId, pause, resume, remove])

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'downloading', label: 'Downloading' },
    { key: 'seeding', label: 'Seeding' },
    { key: 'completed', label: 'Completed' },
    { key: 'paused', label: 'Paused' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'error', label: 'Errored' },
  ]

  return (
    <div className="app">
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={() => void addTorrentFile()}>
          Add Torrent
        </button>
        <button type="button" disabled={busy} onClick={() => setMagnetOpen(true)}>
          Add Magnet
        </button>
        <span className="sep" />
        <button
          type="button"
          disabled={!selected || selected.status === 'paused'}
          onClick={() => selected && pause(selected.id)}
        >
          Pause
        </button>
        <button
          type="button"
          disabled={!selected || selected.status !== 'paused'}
          onClick={() => selected && resume(selected.id)}
        >
          Resume
        </button>
        <button type="button" disabled={!selected} onClick={() => selected && remove(selected.id)}>
          Delete
        </button>
        <span className="sep" />
        <button type="button" disabled={busy} onClick={() => void addMagnet(DEMO_MAGNET)}>
          Demo
        </button>
        {mode === 'node' ? (
          <button type="button" onClick={() => void openDownloads()}>
            Downloads
          </button>
        ) : null}
      </div>

      {mode === 'browser' ? (
        <div className="banner">
          Browser mode can only talk to WebRTC / web-seed torrents (like Demo). For Debian and normal
          torrents, run the desktop app: <code>npm run desktop</code>
        </div>
      ) : null}

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-group">Transfers</div>
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              className={filter === item.key ? 'active' : ''}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span className="count">{counts[item.key]}</span>
            </button>
          ))}
        </aside>

        <div className="content">
          <div className="table-wrap">
            {visible.length === 0 ? (
              <div className="empty-table">No torrents in this list. Use Add Torrent / Add Magnet.</div>
            ) : (
              <table className="transfers">
                <thead>
                  <tr>
                    <th className="col-name">Name</th>
                    <th className="col-size">Size</th>
                    <th className="col-progress">Progress</th>
                    <th className="col-status">Status</th>
                    <th className="col-peers">Peers</th>
                    <th className="col-dl">Down Speed</th>
                    <th className="col-ul">Up Speed</th>
                    <th className="col-eta">ETA</th>
                    <th className="col-ratio">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((torrent) => (
                    <tr
                      key={torrent.id}
                      className={selectedId === torrent.id ? 'selected' : ''}
                      onClick={() => setSelectedId(torrent.id)}
                      onDoubleClick={() => {
                        if (torrent.status === 'paused') resume(torrent.id)
                        else pause(torrent.id)
                      }}
                    >
                      <td className="col-name" title={torrent.name}>
                        {torrent.name}
                      </td>
                      <td className="col-size">{formatBytes(torrent.length)}</td>
                      <td className="col-progress">
                        <div className="progress-cell">
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: formatPercent(torrent.progress) }} />
                          </div>
                          <span className="progress-label">{formatPercent(torrent.progress)}</span>
                        </div>
                      </td>
                      <td className="col-status">{statusLabel(torrent.status, torrent)}</td>
                      <td className="col-peers">{torrent.numPeers}</td>
                      <td className="col-dl">{formatSpeed(torrent.downloadSpeed)}</td>
                      <td className="col-ul">{formatSpeed(torrent.uploadSpeed)}</td>
                      <td className="col-eta">{formatEta(torrent.timeRemaining)}</td>
                      <td className="col-ratio">{formatRatio(torrent.ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <section className="details">
            <div className="tabs">
              <button
                type="button"
                className={detailTab === 'general' ? 'active' : ''}
                onClick={() => setDetailTab('general')}
              >
                General
              </button>
              <button
                type="button"
                className={detailTab === 'content' ? 'active' : ''}
                onClick={() => setDetailTab('content')}
              >
                Content
              </button>
              <button
                type="button"
                className={detailTab === 'pieces' ? 'active' : ''}
                onClick={() => setDetailTab('pieces')}
              >
                Pieces
              </button>
            </div>
            <div className="details-body">
              {!selected ? (
                <div className="empty-details">Select a torrent to view details.</div>
              ) : detailTab === 'general' ? (
                <dl className="kv">
                  <dt>Name</dt>
                  <dd title={selected.name}>{selected.name}</dd>
                  <dt>Hash</dt>
                  <dd title={selected.infoHash}>{shortenHash(selected.infoHash || '—', 10)}</dd>
                  <dt>Save path</dt>
                  <dd title={selected.savePath || downloadDir || ''}>
                    {selected.savePath || downloadDir || 'In-memory (browser mode)'}
                  </dd>
                  <dt>Total size</dt>
                  <dd>{formatBytes(selected.length)}</dd>
                  <dt>Downloaded</dt>
                  <dd>{formatBytes(selected.downloaded)}</dd>
                  <dt>Uploaded</dt>
                  <dd>{formatBytes(selected.uploaded)}</dd>
                  <dt>Share ratio</dt>
                  <dd>{formatRatio(selected.ratio)}</dd>
                  <dt>Peers</dt>
                  <dd>{selected.numPeers}</dd>
                  <dt>Status</dt>
                  <dd>
                    {statusLabel(selected.status, selected)}
                    {selected.error ? ` — ${selected.error}` : ''}
                  </dd>
                </dl>
              ) : detailTab === 'content' ? (
                selected.files.length === 0 ? (
                  <div className="empty-details">
                    Waiting for metadata from peers ({selected.numPeers} peers)…
                    <br />
                    Tip: prefer a <strong>.torrent file</strong> or magnet with trackers. Magnets need
                    at least one peer before files appear.
                  </div>
                ) : (
                  <table className="file-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Progress</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.files.map((file) => (
                        <tr key={file.path}>
                          <td title={file.path}>{file.name}</td>
                          <td>{formatBytes(file.length)}</td>
                          <td>{formatPercent(file.progress)}</td>
                          <td>
                            <button
                              type="button"
                              disabled={file.progress < 1}
                              onClick={() => void downloadFile(selected.id, file.path)}
                            >
                              {mode === 'node' ? 'Open' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : selected.pieces.length === 0 ? (
                <div className="empty-details">No piece data yet.</div>
              ) : (
                <div className="piece-grid" aria-label="Piece map">
                  {selected.pieces
                    .filter((_, i) => i % Math.max(1, Math.ceil(selected.pieces.length / 240)) === 0)
                    .map((have, i) => (
                      <span key={i} className={have ? 'have' : ''} />
                    ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="status-bar">
        <span>D: {formatSpeed(stats.downloadSpeed)}</span>
        <span>U: {formatSpeed(stats.uploadSpeed)}</span>
        <span>Transfers: {stats.activeTorrents}</span>
        <span>Peers: {stats.peers}</span>
        <span className="grow">
          {mode === 'node'
            ? `Desktop · Node BitTorrent · ${downloadDir || 'Downloads/CURRENT'}`
            : 'Browser · WebRTC only · use desktop for real torrents'}
        </span>
      </footer>

      {magnetOpen ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Add magnet link">
            <header>Add Magnet Link</header>
            <div className="body">
              <textarea
                value={magnetValue}
                onChange={(e) => setMagnetValue(e.target.value)}
                placeholder="magnet:?xt=urn:btih:…"
                spellCheck={false}
                autoFocus
              />
              {magnetError ? <p className="error">{magnetError}</p> : null}
            </div>
            <footer>
              <button type="button" onClick={() => setMagnetOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !magnetValue.trim()}
                onClick={() => void addMagnet(magnetValue)}
              >
                OK
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
