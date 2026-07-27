export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** i
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : digits)} ${units[i]}`
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatPercent(ratio: number): string {
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return `${pct.toFixed(pct >= 99.5 || pct === 0 ? 0 : 1)}%`
}

export function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms === Infinity || ms < 0) return '—'
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 48) return `${hours}h ${remMins}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞'
  return ratio.toFixed(2)
}

export function shortenHash(hash: string, size = 6): string {
  if (!hash) return '—'
  if (hash.length <= size * 2) return hash
  return `${hash.slice(0, size)}…${hash.slice(-size)}`
}

export function isMagnet(input: string): boolean {
  return /^magnet:\?/i.test(input.trim())
}

export function isProbablyInfoHash(input: string): boolean {
  const value = input.trim()
  return /^[a-fA-F0-9]{40}$/.test(value) || /^[a-zA-Z2-7]{32}$/.test(value)
}

export function toMagnetFromHash(hash: string): string {
  const infoHash = hash.trim()
  const trackers = [
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.webtorrent.dev',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
  ]
  const xs = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${infoHash}${xs}`
}
