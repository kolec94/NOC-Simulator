# NOC Simulator

A fake Network Operations Center for a wall of TVs: dozens of unique
ambient "ops center" displays (matrix rain, radar sweeps, world maps,
server racks, live-looking dashboards...) rendered in a browser, captured,
and streamed out over RTSP/RTMP/HLS/WebRTC to whatever's playing them.

## Install

On any apt-based Linux box (Ubuntu/Debian/WSL2 with systemd enabled):

```bash
curl -fsSL https://raw.githubusercontent.com/kolec94/NOC-Simulator/master/install.sh | bash
```

This installs Docker if it's missing, clones the repo, builds the images,
and starts the stack. Safe to re-run (it'll just pull/rebuild/restart).

Already have Docker? Skip the script:

```bash
git clone https://github.com/kolec94/NOC-Simulator.git
cd NOC-Simulator
docker compose up -d --build
```

## How it fits together

```
 admin panel (Express)  <-- you manage screens here (http://localhost:8080)
        |
        | starts/stops, per screen
        v
 capture container       screen webpage (HTML/canvas)
 Xvfb + headless Chromium  ---->  rendered fullscreen
 + ffmpeg (x264)                        |
        |                               v
        | RTMP push                (captured as video)
        v
   MediaMTX  ---- RTSP ----> any player (VLC, ffplay, TV box)
              ---- RTMP ---->
              ---- HLS  ---->
              ---- WebRTC/WHEP ----> built-in browser Viewer (realtime switching)
```

Each "screen" is a plain HTML file under `screens/`. The admin panel spins
up a disposable Docker container per active screen: a virtual display
(Xvfb) renders the page in headless Chromium, and ffmpeg grabs that
display and pushes it as RTMP into **MediaMTX**, which re-serves it as
RTSP, RTMP, HLS, and WebRTC (WHEP) simultaneously.

## Admin panel

Open `http://localhost:8080`. 40 screens are pre-registered (see catalog
below) but **not started** -- each running screen costs a Chromium +
ffmpeg pipeline (roughly 1-2 CPU cores, 500MB+ RAM), so you start only the
ones you want live. Concurrency is capped (`MAX_CONCURRENT`, default 8) to
protect the host; the banner at the top shows current usage.

From the table you can Start/Stop/Delete each screen and see its
RTSP/RTMP/HLS/WHEP URLs once it's running. You can also add your own
screens by pointing at any URL (doesn't have to be one of the built-in
templates).

## Viewer (realtime switching)

`http://localhost:8080/viewer.html` -- a fullscreen player for anything
currently running:

- Click a screen in the list, or press **Left/Right arrow** to switch.
- Deep link to a specific stream: `viewer.html?path=screen01`
- Auto-cycle mode for an actual TV: `viewer.html?cycle=15` rotates through
  every running screen every 15 seconds.
- Plays via WebRTC (WHEP) for sub-second switching latency, falling back
  to HLS automatically if WebRTC can't connect.

## Players behind TVs

Point any RTSP/RTMP/HLS-capable player at the stream for a given screen
(shown in the admin panel once started), e.g. for `screen01`:

```
rtsp://<host>:8554/live/screen01
rtmp://<host>:1935/live/screen01
http://<host>:8888/live/screen01/index.m3u8
```

Setting up the actual player hardware (Raspberry Pi, smart TV app, media
box) is a later step -- not covered here yet.

**Viewing from another machine on the LAN:** set `PUBLIC_HOST` (env, used
for the URLs shown in the admin panel) to this host's LAN IP, and add that
same IP to `webrtcAdditionalHosts` in `mediamtx/mediamtx.yml` so WebRTC's
ICE negotiation resolves correctly for remote viewers.

## The 40-screen catalog

13 templates, each with 3-4 variants (unique title/seed/color-hue/speed
via URL params), covering `screen01`-`screen40`:

| Template | What it looks like | Variants |
|---|---|---|
| `matrix.html` | Falling code rain | 3 |
| `dashboard.html` | Live gauges (CPU/MEM/NET/GPU/PWR/I-O) | 3 |
| `radar.html` | Rotating radar sweep with contacts | 3 |
| `logfeed.html` | Scrolling OK/WARN/ALERT log lines | 3 |
| `worldmap.html` | World map with animated threat arcs | 3 |
| `netgraph.html` | Pulsing network topology graph | 3 |
| `ticker.html` | Scrolling ticker board with sparklines | 3 |
| `waveform.html` | Oscilloscope traces + spectrum bars | 3 |
| `hexdump.html` | Scrolling hexdump with highlighted rows | 3 |
| `satellites.html` | Orbital tracker with telemetry sidebar | 3 |
| `rack.html` | Server rack elevation with blinking LEDs | 3 |
| `heatmap.html` | Datacenter tile heatmap | 3 |
| `terminal.html` | Auto-typing fake SSH session | 4 |

Every template is a single self-contained HTML file (`screens/*.html`),
using the shared `screens/lib/params.js` contract:

- `?title=` -- label shown on screen
- `?seed=` -- deterministic PRNG seed (same seed = same layout/data every run)
- `?hue=` -- 0-359, recolors the template's theme accent
- `?speed=` -- animation rate multiplier

Add a 41st+ screen from the admin panel by pointing at any of these files
with your own query params, or write a new template following the same
contract.

## Capacity

Each live screen = one Chromium + Xvfb + ffmpeg(x264) pipeline.

| Host | Practical concurrent streams (720p/15fps) |
|---|---|
| This laptop (WSL2, 16 cores / 13GB RAM, software x264) | ~6-10 |
| `ai-test` VM (RTX 8000 passthrough, NVENC hardware encoding) | Scales much higher -- not yet deployed there; would need the capture image's ffmpeg command switched to `h264_nvenc` and the compose stack moved over |

Running all 40 at once on modest hardware isn't realistic with software
encoding -- that's why there's a concurrency cap and a documented
scale-out path rather than trying to brute-force it here.

## Manual / dev setup (no install.sh)

```bash
git clone https://github.com/kolec94/NOC-Simulator.git
cd NOC-Simulator
docker compose build
docker compose up -d
```

Config knobs (env vars, set in your shell or `docker-compose.yml`):

- `MAX_CONCURRENT` (default 8) -- max simultaneous capture streams
- `PUBLIC_HOST` (default `localhost`) -- host shown in playback URLs

Data (registered screens) persists in `admin-panel/data/screens.json` on
the host, bind-mounted into the container.

## Legacy

The very first prototype of this project was a set of PowerShell scripts
(matrix rain, dashboard, radar, log feed rendered directly in a terminal
window). They're preserved in `legacy-powershell/` for reference but are
no longer developed -- the HTML/Docker/streaming approach above replaced
them entirely.
