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
ffmpeg pipeline, so you start only the ones you want live. A slider at the
top caps how many can run concurrently: it defaults to `cores x 4` (auto-
detected from the host, shown next to the slider), a rough starting point
based on measured usage of ~10-25% CPU per stream -- not a hard limit.
Drag it up or down any time; it's saved and takes effect immediately, no
restart needed.

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

**WebRTC/WHEP requires this to work at all, even locally on the LAN:**
`mediamtx.yml` is generated from `mediamtx/mediamtx.yml.template` by
`mediamtx/render-config.sh`, which fills in the host's real reachable IP
(`webrtcAdditionalHosts`). Without this, MediaMTX advertises its own
Docker-internal bridge IP as the ICE candidate, which no client can ever
reach -- WHEP sessions connect and then immediately terminate, silently
falling back to HLS (or failing outright). `install.sh` runs this
automatically; for manual setups run `./mediamtx/render-config.sh` before
`docker compose up` (re-run it if the host's IP changes). Set `PUBLIC_HOST`
explicitly (env var, also used for the URLs shown in the admin panel) if
auto-detection picks the wrong interface.

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

Each live screen = one Chromium + Xvfb + ffmpeg(x264) pipeline. The
concurrency slider in the admin panel defaults to `cores x 4`, but that's
just a starting point -- watch actual usage (`docker stats`) and adjust.

Measured on the `noc-sim` VM (4 cores / 15GB RAM, software x264, 720p/15fps):
8 concurrent streams used ~124% CPU total (out of 400% available across 4
cores, i.e. ~31%) -- most screens sit around 10-15% CPU each, with the
heavier canvas-based templates (e.g. worldmap, satellites) running closer
to 45-50%. Memory per stream is well under 100MB. On that hardware there's
real headroom well past the default suggestion of 16.

For running all 40 at once on more constrained hardware, or for many more
than 40, the scale-out path is hardware encoding: switch the capture
image's ffmpeg command to `h264_nvenc` (or `h264_vaapi`/`h264_qsv`) and
run on a host with a GPU -- `ai-test`'s passthrough RTX 8000 would be a
candidate, not yet done.

## Manual / dev setup (no install.sh)

```bash
git clone https://github.com/kolec94/NOC-Simulator.git
cd NOC-Simulator
bash ./mediamtx/render-config.sh            # fills in this host's IP for WebRTC -- see below
docker compose --profile build-only build   # capture image is profile-gated, see docker-compose.yml
docker compose up -d
```

Config knobs (env vars, set in your shell or `docker-compose.yml`):

- `PUBLIC_HOST` (default `localhost`) -- host shown in playback URLs

Data persists on the host, bind-mounted into the container:

- `admin-panel/data/screens.json` -- registered screens
- `admin-panel/data/settings.json` -- the concurrency slider's current value

## Legacy

The very first prototype of this project was a set of PowerShell scripts
(matrix rain, dashboard, radar, log feed rendered directly in a terminal
window). They're preserved in `legacy-powershell/` for reference but are
no longer developed -- the HTML/Docker/streaming approach above replaced
them entirely.
