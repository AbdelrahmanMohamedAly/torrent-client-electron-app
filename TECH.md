# CURRENT — Technology Map

## The important truth

**Browser / Vercel ≠ full BitTorrent client.**

- **Desktop Electron app**: Node WebTorrent in the main process → real TCP/UDP peers → Debian etc. work.
- **Browser / Vercel**: WebRTC-only WebTorrent → only hybrid/WebTorrent swarms (and the Sintel demo) work reliably.

That is why you saw **Inactive** on everything except Demo.

## Architecture (desktop)

```text
Your PC
├── Electron main process
│     └── Node WebTorrent  ← real BitTorrent (TCP/UDP/DHT)
│           └── saves to  Downloads/CURRENT
└── Renderer (React UI, qBittorrent-like)
      └── IPC bridge (preload) talks to main
```

## Architecture (browser / Vercel)

```text
Browser tab
└── WebTorrent browser build (WebRTC only)
      └── works with wss trackers / web seeds
      └── fails silently (0 peers) on classic UDP/TCP swarms
```

## Stack (all free)

| Piece | Tech | Role |
| --- | --- | --- |
| Desktop shell | Electron | Window on the client PC |
| Engine (desktop) | WebTorrent (Node) | Real torrent protocol |
| Engine (web) | WebTorrent (browser bundle) | Demo / limited web mode |
| UI | React + TypeScript | qBittorrent-style transfers UI |
| Bundler | Vite | Build renderer; also what Vercel would host |

## Distribution choices

### GitHub

- Store source code
- Publish **Releases** with installers so users download the desktop app
- Users install/run on their PC — correct model for a torrent client

### Vercel

- Hosts static/web UI only
- Fine for a demo site
- **Not** capable of hosting a real always-on BitTorrent engine for visitors
- Visitors’ browsers still hit the WebRTC limitation

## Run

```bash
npm install
npm run desktop
```
