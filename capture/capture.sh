#!/bin/bash
set -euo pipefail

if [ -z "${SCREEN_URL}" ]; then
    echo "SCREEN_URL is required" >&2
    exit 1
fi

export DISPLAY=:99

cleanup() {
    echo "Shutting down capture pipeline..."
    [ -n "${FFMPEG_PID:-}" ] && kill "$FFMPEG_PID" 2>/dev/null || true
    [ -n "${CHROME_PID:-}" ] && kill "$CHROME_PID" 2>/dev/null || true
    [ -n "${XVFB_PID:-}" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

echo "Starting Xvfb on ${DISPLAY} at ${WIDTH}x${HEIGHT}..."
Xvfb "${DISPLAY}" -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp &
XVFB_PID=$!

for i in $(seq 1 20); do
    if xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

echo "Launching Chromium -> ${SCREEN_URL}"
chromium \
    --no-sandbox \
    --disable-gpu \
    --disable-software-rasterizer \
    --disable-dev-shm-usage \
    --kiosk \
    --window-position=0,0 \
    --window-size="${WIDTH},${HEIGHT}" \
    --autoplay-policy=no-user-gesture-required \
    --disable-infobars \
    --no-first-run \
    --noerrdialogs \
    --disable-translate \
    "${SCREEN_URL}" \
    >/var/log/chromium.log 2>&1 &
CHROME_PID=$!

echo "Waiting for page render..."
sleep 4

RTMP_URL="rtmp://${MEDIAMTX_HOST}:${MEDIAMTX_RTMP_PORT}/live/${STREAM_PATH}"
echo "Starting ffmpeg capture -> ${RTMP_URL}"

ffmpeg -hide_banner -loglevel warning \
    -f x11grab -video_size "${WIDTH}x${HEIGHT}" -framerate "${FPS}" -i "${DISPLAY}" \
    -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
    -g "$((FPS * 2))" -b:v "${BITRATE}" -maxrate "${BITRATE}" -bufsize "${BITRATE}" \
    -f flv "${RTMP_URL}" &
FFMPEG_PID=$!

wait -n "$XVFB_PID" "$CHROME_PID" "$FFMPEG_PID"
