#!/bin/bash
# NOC Simulator one-command installer.
#
#   curl -fsSL https://raw.githubusercontent.com/kolec94/NOC-Simulator/master/install.sh | bash
#
# Installs git/curl/Docker if missing, clones (or updates) the repo, builds
# the images, and starts the stack. Safe to re-run.
set -euo pipefail

REPO_URL="https://github.com/kolec94/NOC-Simulator.git"
NOC_DIR="${NOC_DIR:-$HOME/NOC-Simulator}"

log() { echo "[noc-install] $*"; }
err() { echo "[noc-install] ERROR: $*" >&2; }

if ! command -v apt-get >/dev/null 2>&1; then
    err "This installer supports apt-based systems (Ubuntu/Debian/WSL2) only."
    err "Docker + docker compose are still the only real requirements -- if you"
    err "already have those, just: git clone $REPO_URL && cd NOC-Simulator && docker compose up -d --build"
    exit 1
fi

if grep -qi microsoft /proc/version 2>/dev/null; then
    if [ "$(ps -p 1 -o comm=)" != "systemd" ]; then
        err "WSL detected without systemd. Docker's service won't start reliably."
        err "Add this to /etc/wsl.conf on the Windows side, then run 'wsl --shutdown' and re-run this script:"
        err ""
        err "  [boot]"
        err "  systemd=true"
        exit 1
    fi
fi

log "Checking prerequisites (git, curl)..."
MISSING_PKGS=()
command -v git  >/dev/null 2>&1 || MISSING_PKGS+=(git)
command -v curl >/dev/null 2>&1 || MISSING_PKGS+=(curl)
if [ "${#MISSING_PKGS[@]}" -gt 0 ]; then
    log "Installing: ${MISSING_PKGS[*]}"
    sudo apt-get update -qq
    sudo apt-get install -y "${MISSING_PKGS[@]}"
fi

if ! command -v docker >/dev/null 2>&1; then
    log "Docker not found -- installing via get.docker.com (you may be prompted for your password)..."
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    log "Added $USER to the docker group. You'll need to log out/in (or run 'newgrp docker')"
    log "for future sessions to use docker without sudo. Continuing this run with sudo."
else
    log "Docker already installed ($(docker --version))."
fi

# The current shell doesn't have the new docker group membership yet even
# right after usermod, so detect and fall back to sudo for this run only.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
fi

if [ -d "$NOC_DIR/.git" ]; then
    log "Existing checkout found at $NOC_DIR -- pulling latest..."
    git -C "$NOC_DIR" pull --ff-only
else
    log "Cloning $REPO_URL to $NOC_DIR..."
    git clone "$REPO_URL" "$NOC_DIR"
fi

cd "$NOC_DIR"

log "Rendering mediamtx config (fills in this host's IP for WebRTC)..."
./mediamtx/render-config.sh

log "Building images (this can take a few minutes the first time)..."
# --profile build-only is required or compose silently skips the capture
# image (it's profile-gated so `docker compose up` doesn't try to start it
# directly -- see docker-compose.yml).
$DOCKER compose --profile build-only build

log "Starting the stack..."
$DOCKER compose up -d

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HOST_IP="${HOST_IP:-localhost}"

cat <<EOF

============================================================
 NOC Simulator is up.

 Admin panel:  http://localhost:8080  (or http://${HOST_IP}:8080 from another device)
 Viewer:       http://localhost:8080/viewer.html

 Player URLs (once you start a screen from the admin panel), e.g. for "screen01":
   RTSP:  rtsp://${HOST_IP}:8554/live/screen01
   RTMP:  rtmp://${HOST_IP}:1935/live/screen01
   HLS:   http://${HOST_IP}:8888/live/screen01/index.m3u8

 40 screens are pre-registered but NOT started (each one costs CPU/RAM).
 Start a few from the admin panel -- default cap is 8 concurrent
 (set MAX_CONCURRENT in docker-compose.yml to change it).
============================================================
EOF
