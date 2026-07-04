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

# A container restart leaves a stale X lock behind, and Xvfb then dies
# with "Server is already active for display 99" forever.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

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
RTSP_URL="rtsp://${MEDIAMTX_HOST}:${MEDIAMTX_RTSP_PORT}/live/${STREAM_PATH}"

VAAPI_DEVICE="/dev/dri/renderD128"
if [ -e "${VAAPI_DEVICE}" ]; then
    # This GPU's Mesa VAAPI driver can't produce packed sequence headers, so
    # it can't build the global header FLV/RTMP needs -- push RTSP instead,
    # which carries SPS/PPS in-band per keyframe (via dump_extra) rather than
    # requiring one upfront.
    echo "Starting ffmpeg capture (VAAPI h264_vaapi, RTSP) -> ${RTSP_URL}"
    ffmpeg -hide_banner -loglevel warning \
        -vaapi_device "${VAAPI_DEVICE}" \
        -f x11grab -draw_mouse 0 -video_size "${WIDTH}x${HEIGHT}" -framerate "${FPS}" -i "${DISPLAY}" \
        -vf 'format=nv12,hwupload' \
        -c:v h264_vaapi -g "$((FPS * 2))" \
        -b:v "${BITRATE}" -maxrate "${BITRATE}" -bufsize "${BITRATE}" \
        -bsf:v dump_extra=freq=keyframe \
        -f rtsp -rtsp_transport tcp "${RTSP_URL}" &
else
    echo "Starting ffmpeg capture (libx264, no ${VAAPI_DEVICE} found) -> ${RTMP_URL}"
    ffmpeg -hide_banner -loglevel warning \
        -f x11grab -draw_mouse 0 -video_size "${WIDTH}x${HEIGHT}" -framerate "${FPS}" -i "${DISPLAY}" \
        -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
        -g "$((FPS * 2))" -b:v "${BITRATE}" -maxrate "${BITRATE}" -bufsize "${BITRATE}" \
        -f flv "${RTMP_URL}" &
fi
FFMPEG_PID=$!

wait -n "$XVFB_PID" "$CHROME_PID" "$FFMPEG_PID"
