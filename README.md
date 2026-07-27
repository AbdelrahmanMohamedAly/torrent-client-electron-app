# CURRENT

Local BitTorrent client with a simple qBittorrent-style UI.

## Why only the Demo worked before

| Mode | What peers it can use | Debian / normal torrents | Demo (Sintel) |
| --- | --- | --- | --- |
| **Desktop** (`npm run desktop`) | Real TCP/UDP BitTorrent + DHT | Works | Works |
| **Browser / Vercel** | WebRTC + web seeds only | Usually **inactive** (no peers) | Works |

The Demo includes WebRTC trackers + a web seed. A Debian ISO magnet usually does **not**, so a browser/Vercel build sits on **Inactive**.

**Use the desktop app for real torrents.**

```bash
npm install
npm run desktop
```

Files save to your PC: `Downloads/CURRENT`

---

## How do people get this? GitHub vs Vercel

### Option A — Desktop app (recommended for a real client)

People **install/run it on their PC** (like qBittorrent).

1. You push the code to **GitHub**
2. You (later) attach **Release** builds: `.exe` / `.AppImage` / `.dmg`
3. Users download the app and run it locally

Right now (dev):

```bash
npm run desktop
```

No remote server. The torrent engine runs on **their machine**.

### Option B — Host on Vercel (website only)

You **can** host the UI on Vercel, but:

- Users open a URL — **no install**
- It is **browser WebRTC mode only**
- Normal torrents (Debian, most public magnets) will often stay **Inactive**
- Vercel **cannot** run a full BitTorrent engine (no long-lived TCP/UDP torrent process)

Use Vercel only for a demo / landing page, not as a replacement for qBittorrent.

### Short answer

| Goal | Do this |
| --- | --- |
| Real torrent client for people | Ship a **desktop app** (GitHub Releases / installers) |
| Quick web demo link | Host UI on **Vercel** (Demo works; most torrents won’t) |
| Put source on GitHub | Yes — that’s the code. Users still need desktop to download real torrents |

---

## Commands

```bash
npm run desktop        # real client on your PC
npm run desktop:start  # production UI + Electron
npm run dev            # browser-only (limited)
npm run build          # build web UI (e.g. for Vercel)
```

## Docs

See **[TECH.md](./TECH.md)** for architecture and limits.
